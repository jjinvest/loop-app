'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const TOKEN='TOKEN_FICTICIO_CALLBACK_LOCAL_APENAS_TESTE_2026';
const opcoes={webhookAsaasSandbox:{habilitado:true,token:TOKEN}};
const senha='senha-callback-http-ficticio-2026';
async function comprar(m,produtoId='curso-lab-250'){
 const conta=m.contas.cadastrar({nome:'Cliente Callback',email:'callback@example.invalid',senha});
 const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha}});
 const id=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId,quantidade:1}]}})).data.pedido.pedidoId;
 const pagamento=m.integracao.cobrancas.consultar(id).pagamentoId;
 return {cookie,id,pagamento,conta};
}
function aviso(c,{eventoId='evt_CallbackIntegrado001',tipo='PAYMENT_RECEIVED',value=250}={}){
 return {id:eventoId,event:tipo,payment:{id:c.pagamento,billingType:'PIX',status:'RECEIVED',
  externalReference:'LOOPLAB-'+c.id,value}};
}
async function enviar(m,payload){
 const r=await fetch(m.base+'/api/laboratorio/webhook-asaas-sandbox',{method:'POST',
  headers:{'Content-Type':'application/json','asaas-access-token':TOKEN},body:JSON.stringify(payload)});
 assert.equal(r.status,200);return r.json();
}
const qtd=m=>m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n;
test('ACK nao cria posicao; worker reconsulta API, retenta e atualiza cliente sem duplicar',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const c=await comprar(m),e=aviso(c),w=m.integracao.callbacks;let tempo=Date.now();w.agoraMs=()=>tempo;
 const ack=await enviar(m,e);assert.equal(ack.posicaoCriada,false);assert.equal(qtd(m),0);
 await w.processarLote();assert.equal(w.consultar(e.id).estado,'PENDENTE');assert.equal(qtd(m),0);
 m.confirmar(c.id);tempo+=1001;
 await w.processarLote();assert.equal(w.consultar(e.id).estado,'CONCLUIDO');
 const visao=(await m.http('/minha-conta',{cookie:c.cookie})).data;
 assert.equal(visao.posicoes.length,1);assert.equal(visao.posicoes[0].statusAdesao,'PENDENTE');
 await Promise.all(Array.from({length:20},()=>enviar(m,e)));await w.processarLote();
 assert.equal(qtd(m),1);assert.equal(w.consultar(e.id).tentativas,2);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_asaas_sandbox_avisos').get().n,1);
 assert.throws(()=>m.banco.exec('DELETE FROM akitemm_asaas_callback_historico_lab'),/imutavel/);
 const rota=m.base+'/api/admin/asaas-callbacks-lab';assert.equal((await fetch(rota)).status,401);
 const headers={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const r=await fetch(rota+'?estado=CONCLUIDO&limite=1',{headers});assert.equal(r.status,200);
 const dados=await r.json();assert.equal(dados.total,1);assert.equal(dados.eventos[0].eventoId,e.id);
 assert.equal(JSON.stringify(dados).includes(TOKEN),false);
 const hist=await(await fetch(rota+'/eventos/'+e.id,{headers})).json();assert.equal(hist.historico.length,4);
 assert.equal((await fetch(rota+'?limite=101',{headers})).status,400);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM loop_v6_provisoes_eventos').get().n,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_solicitacoes_saque_demo').get().n,0);
});
test('callback de venda somente AKITEMM conclui sem criar posicao ou insistir na fila',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const {ElegibilidadeProdutosLoopDemoSQLite}=require('../src/domain/elegibilidade-produtos-loop-demo-sqlite');
 new ElegibilidadeProdutosLoopDemoSQLite({catalogo:m.repo}).alterar({produtoId:'curso-lab-500',elegivelLoop:false,revisaoEsperada:1});
 const c=await comprar(m,'curso-lab-500'),e=aviso(c,{value:500});m.confirmar(c.id);await enviar(m,e);
 await m.integracao.callbacks.processarLote();const j=m.integracao.callbacks.consultar(e.id);
 assert.equal(j.estado,'CONCLUIDO');assert.equal(j.codigo,'VENDA_SOMENTE_LOJA_CONCILIADA');
 assert.equal(qtd(m),0);assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_vendas_loja_apos_reajuste_demo').get().n,1);
 assert.deepEqual(await m.integracao.callbacks.processarLote(),[]);
});
test('worker automatico transforma callback recebido em posicao pendente sem comando do cliente',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const c=await comprar(m);m.confirmar(c.id);const e=aviso(c);await enviar(m,e);
 const w=m.integracao.callbacks;w.intervaloMs=100;w.iniciar();w.iniciar();
 try{
  for(let i=0;i<100&&qtd(m)===0;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(qtd(m),1);assert.equal(w.consultar(e.id).estado,'CONCLUIDO');
 }finally{w.parar();if(w.emCurso)await w.emCurso;}
 assert.equal((await m.http('/minha-conta',{cookie:c.cookie})).data.posicoes[0].statusAdesao,'PENDENTE');
});
test('ACK persistido antes de criar job e recuperado depois de reabrir SQLite',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-callback-ack-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));const arquivo=path.join(pasta,'lab.sqlite');
 let m=await abrirLaboratorio(arquivo,opcoes);t.after(()=>m.fechar());
 const c=await comprar(m),e=aviso(c);m.confirmar(c.id);await enviar(m,e);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_asaas_callback_fila_lab').get().n,0);
 await m.fechar();m=await abrirLaboratorio(arquivo,opcoes);await m.integracao.callbacks.processarLote();
 assert.equal(qtd(m),1);assert.equal(m.integracao.callbacks.consultar(e.id).estado,'CONCLUIDO');
 assert.equal(m.banco.prepare('SELECT conta_id id FROM admin_ponte_compras_demo').get().id,c.conta.contaId);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('duas conexoes disputam o callback; lease abandonado e recuperado e worker antigo nao sobrescreve',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-callback-lease-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));const arquivo=path.join(pasta,'lab.sqlite');
 const a=await abrirLaboratorio(arquivo,opcoes),b=await abrirLaboratorio(arquivo,opcoes);
 t.after(async()=>{await a.fechar();await b.fechar();});
 const c=await comprar(a),e=aviso(c);a.confirmar(c.id);await enviar(a,e);
 let tempo=Date.now();const wa=a.integracao.callbacks,wb=b.integracao.callbacks;
 wa.agoraMs=wb.agoraMs=()=>tempo;
 const abandonado=wa._reservar();assert.ok(abandonado.token);
 assert.deepEqual(await wb.processarLote(),[]);tempo+=wa.leaseMs+1;
 const resultados=await Promise.all([wb.processarLote(),wa.processarLote()]);
 assert.equal(resultados.flat().length,1);assert.equal(qtd(a),1);
 const tardio=await wa._executar(abandonado);assert.equal(tardio.leasePerdido,true);
 assert.equal(wb.consultar(e.id).estado,'CONCLUIDO');assert.equal(qtd(b),1);
 assert.equal(wb.consultar(e.id).tentativas,2);
});
test('queda depois de gravar posicao e antes de concluir job reprocessa sem segunda posicao',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-callback-apos-posicao-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));const arquivo=path.join(pasta,'lab.sqlite');
 let m=await abrirLaboratorio(arquivo,opcoes);t.after(()=>m.fechar());
 const c=await comprar(m),e=aviso(c);m.confirmar(c.id);await enviar(m,e);
 const tempo=Date.now(),w=m.integracao.callbacks;w.agoraMs=()=>tempo;w._reservar();
 await m.integracao.conciliador.processar(c.id);assert.equal(qtd(m),1);
 await m.fechar();m=await abrirLaboratorio(arquivo,opcoes);
 m.integracao.callbacks.agoraMs=()=>tempo+w.leaseMs+1;
 await m.integracao.callbacks.processarLote();assert.equal(qtd(m),1);
 assert.equal(m.integracao.callbacks.consultar(e.id).estado,'CONCLUIDO');
 assert.equal(m.integracao.callbacks.consultar(e.id).tentativas,2);
});
test('callback divergente exige revisao sem consultar rede nem gravar posicao',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const c=await comprar(m),e=aviso(c,{value:300});await enviar(m,e);let rede=0;
 m.integracao.cobrancas.conferir=async()=>{rede++;throw Error('Nao chamar');};
 await m.integracao.callbacks.processarLote();const j=m.integracao.callbacks.consultar(e.id);
 assert.equal(j.estado,'EXIGE_REVISAO');assert.equal(j.codigo,'VINCULO_OU_VALOR_DIVERGENTE');
 assert.equal(rede,0);assert.equal(qtd(m),0);
});
test('aviso durante criacao remota indeterminada aguarda ID local antes de fixar parecer',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());const c=await comprar(m),e=aviso(c);
 m.banco.prepare("UPDATE akitemm_sandbox_cobrancas SET pagamento_id=NULL,status='CRIACAO_INDETERMINADA_SANDBOX' WHERE pedido_id=?").run(c.id);
 await enviar(m,e);const w=m.integracao.callbacks;let tempo=Date.now();w.agoraMs=()=>tempo;
 await w.processarLote();assert.equal(w.consultar(e.id).estado,'PENDENTE');
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_asaas_sandbox_conciliacoes').get().n,0);
 m.banco.prepare("UPDATE akitemm_sandbox_cobrancas SET pagamento_id=?,status='PENDENTE_SANDBOX' WHERE pedido_id=?").run(c.pagamento,c.id);
 m.confirmar(c.id);tempo+=1001;await w.processarLote();assert.equal(qtd(m),1);
});
test('reversao em propagacao nao cria posicao e reversao posterior preserva posicao existente',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());const c=await comprar(m);
 const w=m.integracao.callbacks;let tempo=Date.now();w.agoraMs=()=>tempo;m.confirmar(c.id);
 await enviar(m,aviso(c));await w.processarLote();assert.equal(qtd(m),1);
 const reversao=aviso(c,{eventoId:'evt_CallbackReversao002',tipo:'PAYMENT_REFUNDED'});
 await enviar(m,reversao);await w.processarLote();assert.equal(w.consultar(reversao.id).estado,'PENDENTE');
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?").run('LOOPLAB-'+c.id);
 tempo+=1001;await w.processarLote();assert.equal(w.consultar(reversao.id).estado,'CONCLUIDO');
 assert.equal(qtd(m),1);const v=(await m.http('/minha-conta',{cookie:c.cookie})).data;
 assert.equal(v.historicoLoja.pedidos[0].estado,'ESTORNO_EM_CONFERENCIA');
});
test('timeout tem retentativa limitada; erro privado nao aparece no historico',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());const c=await comprar(m),e=aviso(c);
 await enviar(m,e);const w=m.integracao.callbacks;let tempo=Date.now();w.agoraMs=()=>tempo;w.maxTentativas=2;
 m.integracao.cobrancas.conferir=async()=>{throw Error('SEGREDO_PRIVADO_NAO_PERSISTIR');};
 await w.processarLote();assert.equal(w.consultar(e.id).estado,'PENDENTE');
 tempo+=1001;await w.processarLote();assert.equal(w.consultar(e.id).estado,'EXIGE_REVISAO');
 assert.equal(w.consultar(e.id).codigo,'TENTATIVAS_ESGOTADAS');assert.equal(qtd(m),0);
 assert.equal(JSON.stringify(m.banco.prepare('SELECT * FROM akitemm_asaas_callback_historico_lab').all()).includes('SEGREDO_PRIVADO'),false);
 assert.deepEqual(await w.processarLote(),[]);
});
test('retentativa vencida nao fica atras de uma chegada nova a cada lote',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const c=await comprar(m),antigo=aviso(c,{eventoId:'evt_RetryAntigo001'}),novo=aviso(c,{eventoId:'evt_ChegouNovo002'});
 const w=m.integracao.callbacks;let tempo=Date.now();w.agoraMs=()=>tempo;
 await enviar(m,antigo);await w.processarLote({limite:1});assert.equal(w.consultar(antigo.id).estado,'PENDENTE');
 tempo+=1001;m.confirmar(c.id);await enviar(m,novo);await w.processarLote({limite:1});
 assert.equal(w.consultar(antigo.id).estado,'CONCLUIDO');assert.equal(w.consultar(novo.id).estado,'PENDENTE');
 await w.processarLote();assert.equal(w.consultar(novo.id).estado,'CONCLUIDO');assert.equal(qtd(m),1);
});
