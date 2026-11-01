'use strict';
// Monitoramento de fila local: nenhuma consulta administrativa autoriza pagamento.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const TOKEN='TOKEN_FICTICIO_LEASE_MONITOR_SANDBOX_2026_123456';
const opcoes={webhookAsaasSandbox:{habilitado:true,token:TOKEN}};

test('monitor read-only diferencia callback sem job, lease expirado e recuperacao idempotente',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);
 t.after(()=>m.fechar());
 const worker=m.integracao.callbacks;
 let relogio=Date.now();
 worker.agoraMs=()=>relogio;
 const vazio=worker.resumo();
 assert.equal(vazio.pendentesProntos,0);
 assert.equal(vazio.leasesExpirados,0);
 assert.equal(vazio.avisosSemJob,0);

 const conta=m.contas.cadastrar({nome:'Cliente Lease Monitor',
  email:'lease-monitor@example.invalid',senha:'senha-ficticia-lease-2026'});
 const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha:'senha-ficticia-lease-2026'}});
 const pedidoId=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 const pagamento=m.integracao.cobrancas.consultar(pedidoId).pagamentoId;
 m.confirmar(pedidoId);
 const evento={id:'evt_LeaseMonitorReadOnly001',event:'PAYMENT_RECEIVED',
  payment:{id:pagamento,billingType:'PIX',status:'RECEIVED',
   externalReference:'LOOPLAB-'+pedidoId,value:250}};
 const ack=await fetch(m.base+'/api/laboratorio/webhook-asaas-sandbox',{
  method:'POST',headers:{'Content-Type':'application/json','asaas-access-token':TOKEN},
  body:JSON.stringify(evento)});
 assert.equal(ack.status,200);
 assert.equal(worker.resumo().avisosSemJob,1);

 const job=worker._reservar();
 assert.equal(worker.resumo().avisosSemJob,0);
 assert.equal(worker.resumo().leasesExpirados,0);
 relogio+=worker.leaseMs+1;
 assert.equal(worker.resumo().leasesExpirados,1);

 const monitor=m.base+'/api/admin/asaas-callbacks-lab';
 const headers={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
 assert.equal((await fetch(monitor)).status,401);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const resposta=await fetch(monitor,{headers});
 assert.equal(resposta.status,200);
 const dados=await resposta.json();
 assert.equal(dados.resumo.leasesExpirados,1);
 assert.equal(dados.resumo.pendentesProntos,0);
 assert.equal(dados.resumo.referenciaFilaEmMs,relogio);
 assert.equal(dados.resumo.somenteLeitura,true);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);

 await worker.processarLote();
 assert.equal(worker.consultar(evento.id).estado,'CONCLUIDO');
 assert.equal(worker.consultar(evento.id).tentativas,2);
 const depois=worker.resumo();
 assert.equal(depois.leasesExpirados,0);
 assert.equal(depois.pendentesProntos,0);
 const posicoes=(await m.http('/minha-conta',{cookie})).data.posicoes;
 assert.equal(posicoes.length,1);
 assert.equal(posicoes[0].statusAdesao,'PENDENTE');
 await worker.processarLote();
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('monitor apresenta somente retries vencidos sem enfileirar trabalho durante GET',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);
 t.after(()=>m.fechar());
 const worker=m.integracao.callbacks;
 let relogio=Date.now();
 worker.agoraMs=()=>relogio;
 const conta=m.contas.cadastrar({nome:'Cliente Retry Monitor',
  email:'retry-monitor@example.invalid',senha:'senha-ficticia-retry-2026'});
 const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha:'senha-ficticia-retry-2026'}});
 const pedidoId=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 const cobranca=m.integracao.cobrancas.consultar(pedidoId);
 const aviso={id:'evt_RetryMonitorLab001',event:'PAYMENT_RECEIVED',
  payment:{id:cobranca.pagamentoId,billingType:'PIX',status:'RECEIVED',
   externalReference:'LOOPLAB-'+pedidoId,value:250}};
 const ack=await fetch(m.base+'/api/laboratorio/webhook-asaas-sandbox',{
  method:'POST',headers:{'Content-Type':'application/json','asaas-access-token':TOKEN},
  body:JSON.stringify(aviso)});
 assert.equal(ack.status,200);
 await worker.processarLote();
 assert.equal(worker.consultar(aviso.id).estado,'PENDENTE');
 assert.equal(worker.resumo().pendentesProntos,0);
 relogio+=1001;
 assert.equal(worker.resumo().pendentesProntos,1);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const resposta=await fetch(m.base+'/api/admin/asaas-callbacks-lab',{
  headers:{Authorization:'Bearer administrador-local-ficticio-2026-123456789'}});
 assert.equal(resposta.status,200);
 assert.equal((await resposta.json()).resumo.pendentesProntos,1);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 m.confirmar(pedidoId);
 await worker.processarLote();
 assert.equal(worker.consultar(aviso.id).estado,'CONCLUIDO');
 assert.equal(worker.resumo().pendentesProntos,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
});
