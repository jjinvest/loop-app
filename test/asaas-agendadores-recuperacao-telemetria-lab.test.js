'use strict';
// Falhas de agendamento NAO podem vazar segredos ou parar a conciliacao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const opcoes={webhookAsaasSandbox:{habilitado:true,token:'TOKEN_FICTICIO_AGENDADOR_LAB_2026_123456789'}};
async function aguardar(condicao){
 for(let i=0;i<150;i++){
  if(condicao())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('AGENDADOR_NAO_RECUPEROU_APOS_FALHA');
}
test('worker callbacks: falha de lote nao vaza mensagem e nao paralisa timer',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);
 const worker=m.integracao.callbacks;
 t.after(async()=>{worker.parar();if(worker.emCurso)await worker.emCurso;await m.fechar();});
 const original=worker._reservar.bind(worker);
 let chamadas=0;
 worker._reservar=()=>{
  chamadas++;
  if(chamadas===1)throw Error('TOKEN_SECRETO_NUNCA_REVELAR');
  return original();
 };
 worker.intervaloMs=100;worker.iniciar();
 await aguardar(()=>worker.falhasAgendador===1&&chamadas>=2);
 worker.parar();if(worker.emCurso)await worker.emCurso;
 const resumo=worker.resumo();
 assert.equal(resumo.falhasAgendador,1);
 assert.equal(resumo.ultimaFalhaAgendador.codigo,'FALHA_INTERNA_LOTE');
 assert.equal(resumo.telemetriaSomenteMemoria,true);
 assert.equal(JSON.stringify(resumo).includes('TOKEN_SECRETO_NUNCA_REVELAR'),false);
 assert.equal(resumo.pagamentoRealAutorizado,false);
});
test('conciliador automatico: callback de erro defeituoso nao cria rejeicao nao tratada',async t=>{
 const m=await abrirLaboratorio(':memory:');
 const agenda=m.integracao.automatico;
 t.after(async()=>{agenda.parar();if(agenda.verificacaoEmCurso)await agenda.verificacaoEmCurso;await m.fechar();});
 let chamadas=0;
 agenda.listarPendentes=()=>{
  chamadas++;
  if(chamadas===1)throw Error('SEGREDO_NAO_REGISTRAR');
  return [];
 };
 agenda.aoErro=()=>{throw Error('OUTRO_SEGREDO_NAO_REGISTRAR');};
 agenda.intervaloMs=100;agenda.iniciar();
 await aguardar(()=>agenda.falhasAgendador===1&&chamadas>=2);
 agenda.parar();if(agenda.verificacaoEmCurso)await agenda.verificacaoEmCurso;
 assert.equal(agenda.ultimaFalhaAgendador.codigo,'FALHA_INTERNA_AGENDADOR');
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('SEGREDO'),false);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
});
test('monitor administrativo reutilizado mostra diagnostico read-only e exige token',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);
 t.after(()=>m.fechar());
 m.integracao.automatico.falhasAgendador=1;
 m.integracao.automatico.ultimaFalhaAgendador={
  codigo:'FALHA_INTERNA_AGENDADOR',registradoEm:'2026-11-01T00:00:00.000Z'
 };
 const url=m.base+'/api/admin/asaas-callbacks-lab';
 assert.equal((await fetch(url)).status,401);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const resp=await fetch(url,{headers:{Authorization:'Bearer administrador-local-ficticio-2026-123456789'}});
 assert.equal(resp.status,200);
 const dados=await resp.json();
 assert.equal(dados.conciliacaoAutomatica.falhasAgendador,1);
 assert.equal(dados.conciliacaoAutomatica.telemetriaSomenteMemoria,true);
 assert.equal(dados.conciliacaoAutomatica.movimentacaoFinanceiraReal,false);
 assert.equal(dados.resumo.pagamentoRealAutorizado,false);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
});

test('callback e conciliacao automatica concorrentes geram uma unica posicao',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const conta=m.contas.cadastrar({
  nome:'Cliente Fluxos Concorrentes',email:'fluxos-concorrentes@example.invalid',
  senha:'senha-interna-fluxos-2026'
 });
 const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha:'senha-interna-fluxos-2026'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 const cobranca=m.integracao.cobrancas.consultar(pedido);
 m.confirmar(pedido);
 const aviso={id:'evt_ConcorrenciaCallbackAuto001',event:'PAYMENT_RECEIVED',
  payment:{id:cobranca.pagamentoId,billingType:'PIX',status:'RECEIVED',
   externalReference:'LOOPLAB-'+pedido,value:250}};
 const ack=await fetch(m.base+'/api/laboratorio/webhook-asaas-sandbox',{method:'POST',
  headers:{'Content-Type':'application/json',
   'asaas-access-token':opcoes.webhookAsaasSandbox.token},body:JSON.stringify(aviso)});
 assert.equal(ack.status,200);assert.equal((await ack.json()).posicaoCriada,false);
 await Promise.all([m.integracao.callbacks.processarLote(),m.integracao.automatico.verificar()]);
 assert.equal(m.integracao.callbacks.consultar(aviso.id).estado,'CONCLUIDO');
 const compras=m.banco.prepare(
  'SELECT COUNT(*) n,COUNT(DISTINCT posicao_id) distintas FROM admin_ponte_compras_demo').get();
 assert.equal(compras.n,1);assert.equal(compras.distintas,1);
 const minhaConta=(await m.http('/minha-conta',{cookie})).data;
 assert.equal(minhaConta.posicoes.length,1);
 assert.equal(minhaConta.posicoes[0].statusAdesao,'PENDENTE');
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
