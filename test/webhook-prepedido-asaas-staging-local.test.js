'use strict';
// Ensaios de webhook em HTTP LOOPBACK. Nenhuma rede externa / Asaas real.
// Os avisos sao somente sinais, e uma reconsulta PSP independente e exigida.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const express=require('express');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const {criarRouterWebhookPrepedidoAsaasStagingLocal}=require('../src/routes/webhook-prepedido-asaas-staging-local');
const TITULAR='titular-teste-0001',OUTRO='titular-teste-0002';
const TOKEN='WEBHOOK_SANDBOX_STAGING_LOCAL_SEM_VALOR_123456789';
const CLIENTE='cus_ExemploSandbox00001',PAY='pay_ExemploSandbox00001';
function produto(){
 return {id:'curso-staging-250',nome:'Curso ficticio do LAB',tipo:'PDF',
  estado:'PUBLICADO',precoCentavos:25000,descricao:'Somente LAB',
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',detalhes:[],fotos:[],videoApresentacaoUrl:null};
}
async function cenario(t){
 const dir=mkdtempSync(path.join(tmpdir(),'loop-webhook-staging-'));
 const arquivo=path.join(dir,'laboratorio.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 const catalogo=new RepositorioCatalogoMemoria({produtos:[produto()]});
 const rascunhos=new IntencoesCheckoutSQLite({banco});
 const prepedidos=new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
 const entrada={itens:[{produtoId:'curso-staging-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const r=rascunhos.criar({titularId:TITULAR,
  chaveIdempotencia:'chave-webhook-staging-000001',entrada,cotacao});
 const p=await prepedidos.preparar({titularId:TITULAR,rascunhoId:r.intencao.pedidoId,
  repositorioCatalogo:catalogo});
 const pedidoId=p.prepedido.prepedidoId;
 ponte.preparar({titularId:TITULAR,prepedidoId:pedidoId,clienteAsaasId:CLIENTE});
 const estado={status:'PENDING',erro:false};
 const chamadas=[];
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  criarCobrancaPix:async ({pedidoId:id,clienteAsaasId,valorCentavos})=>{
   chamadas.push('POST');assert.equal(id,pedidoId);
   assert.equal(clienteAsaasId,CLIENTE);assert.equal(valorCentavos,25000);
   return {pagamentoId:PAY,status:'PENDING',valorCentavos,
    ambiente:'ASAAS_SANDBOX_EXCLUSIVO'};
  },
  consultarCobranca:async id=>{
   chamadas.push('GET');
   assert.equal(id,PAY);
   if(estado.erro)throw Error('falha rede simulada, sem segredo');
   return {pagamentoId:PAY,externalReference:'LOOPLAB-'+pedidoId,
    clienteAsaasId:CLIENTE,billingType:'PIX',valorCentavos:25000,status:estado.status};
  }
 };
 await ponte.enviarUmaVez({titularId:TITULAR,prepedidoId:pedidoId,provedor,
  execucaoLiberada:true});
 const evento=(id='evt_WebhookSandbox00001',tipo='PAYMENT_RECEIVED',status='RECEIVED')=>({
  id,event:tipo,payment:{id:PAY,billingType:'PIX',status,value:250,
   externalReference:'LOOPLAB-'+pedidoId,customer:CLIENTE,
   nomeCompleto:'NAO_PERSISTIR_NOME',cpf:'NAO_PERSISTIR_CPF'}
 });
 const app=express();
 // express.raw dentro da rota exige que o body nao tenha sido interpretado.
 app.use('/staging',criarRouterWebhookPrepedidoAsaasStagingLocal({inbox}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));
  banco.close();rmSync(dir,{force:true,recursive:true});
 });
 const base='http://127.0.0.1:'+server.address().port;
 async function enviar(data=evento(),{token=TOKEN,body,contentType='application/json',
  origin,encoding}={}){
  const resposta=await fetch(base+'/staging/webhook-prepedido-asaas',{
   method:'POST',headers:{'Content-Type':contentType,
    ...(token?{'asaas-access-token':token}:{}),
    ...(origin?{Origin:origin}:{}),
    ...(encoding?{'Content-Encoding':encoding}:{})
   },body:body===undefined?JSON.stringify(data):body
  });
  return {status:resposta.status,data:await resposta.json()};
 }
 return {banco,ponte,inbox,worker,provedor,estado,chamadas,evento,enviar,
  base,pedidoId,arquivo};
}
test('webhook de prepedido autenticado grava sinal, idempotente e nao reconsulta PSP sozinho',async t=>{
 const s=await cenario(t);
 const antes=s.chamadas.length;
 const a=await s.enviar();
 assert.equal(a.status,200,JSON.stringify(a));
 assert.equal(a.data.registrado,true);
 assert.equal(a.data.pendenteReconsulta,true);
 assert.equal(a.data.posicoesCriadas,0);
 assert.equal(a.data.pagamentoReal,false);
 assert.equal(s.chamadas.length,antes,'HTTP webhook nao deve fazer GET no PSP');
 const duplicado=await s.enviar();
 assert.equal(duplicado.status,200);
 assert.equal(duplicado.data.repetido,true);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_inbox_staging').get().n,1);
 const guardado=s.inbox.consultarEvento('evt_WebhookSandbox00001');
 assert.equal(guardado.valorAvisadoCentavos,25000);
 assert.equal(JSON.stringify(guardado).includes('NAO_PERSISTIR'),false);
 assert.equal(s.worker.consultar('evt_WebhookSandbox00001'),null);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('rejeita token errado, evento alheio, valor e pagamento divergentes e IDs reutilizados',async t=>{
 const s=await cenario(t);
 for(const token of [null,'SENHA_ERRADA',TOKEN+'errado']){
  assert.equal((await s.enviar(s.evento(),{token})).status,401);
 }
 assert.equal((await s.enviar(s.evento(),{origin:'https://externo.invalid'})).status,403);
 assert.equal((await s.enviar(s.evento(),{contentType:'text/plain'})).status,415);
 assert.equal((await s.enviar(s.evento(),{body:'{'})).status,400);
 assert.equal((await s.enviar(s.evento(),{body:' '.repeat(17000)})).status,413);
 assert.equal((await s.enviar({...s.evento(),payment:{
  ...s.evento().payment,externalReference:'LOOPLAB-hom-00000000-0000-0000-0000-000000000000'
 }})).status,409);
 assert.equal((await s.enviar({...s.evento(),payment:{
  ...s.evento().payment,id:'pay_IntrusoSandbox00002'
 }})).status,409);
 assert.equal((await s.enviar({...s.evento(),payment:{
  ...s.evento().payment,value:249.99
 }})).status,409);
 assert.equal((await s.enviar({...s.evento(),event:'SAQUE_REAL'})).status,400);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_inbox_staging').get().n,0);
 assert.equal((await s.enviar()).status,200);
 assert.equal((await s.enviar({...s.evento(),payment:{
  ...s.evento().payment,value:300
 }})).status,409);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_inbox_staging').get().n,1);
});
test('worker exige autorizacao, reconsulta PSP; payload RECEIVED nao pode confirmar PENDING',async t=>{
 const s=await cenario(t);
 assert.equal((await s.enviar()).status,200);
 await assert.rejects(s.worker.processar({eventoId:'evt_WebhookSandbox00001',provedor:s.provedor}),
  {codigo:'RECONSULTA_NAO_AUTORIZADA'});
 s.estado.status='PENDING';
 const inconclusivo=await s.worker.processar({eventoId:'evt_WebhookSandbox00001',
  provedor:s.provedor,execucaoLiberada:true});
 assert.equal(inconclusivo.estado,'EXIGE_REVISAO');
 assert.equal(inconclusivo.codigo,'PSP_DIVERGENTE_OU_REVISAO');
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:s.pedidoId}).estado,
  'PENDENTE_SANDBOX');
 assert.equal(inconclusivo.pagamentoReal,false);
 assert.equal(inconclusivo.posicoesCriadas,0);
 s.estado.status='RECEIVED';
 const repetido=await s.worker.processar({eventoId:'evt_WebhookSandbox00001',
  provedor:s.provedor,execucaoLiberada:true});
 assert.equal(repetido.repetido,true,'evento ja analisado nao autoriza reconfirmacao');
 assert.equal(s.chamadas.filter(x=>x==='GET').length,1);
 const eventoNovo=s.evento('evt_WebhookSandbox00002');
 assert.equal((await s.enviar(eventoNovo)).status,200);
 const segundo=await s.worker.processar({eventoId:eventoNovo.id,
  provedor:s.provedor,execucaoLiberada:true});
 assert.equal(segundo.estado,'CONCLUIDO');
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:s.pedidoId}).estado,
  'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(segundo.posicoesCriadas,0);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_asaas_consultas_staging').get().n,2);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('baixa manual e erro de rede nunca creditam; reversao exige reconsulta independente',async t=>{
 const s=await cenario(t);
 s.estado.status='RECEIVED_IN_CASH';
 const m=s.evento('evt_BaixaManualSandbox01','PAYMENT_RECEIVED','RECEIVED');
 assert.equal((await s.enviar(m)).status,200);
 const result=await s.worker.processar({eventoId:m.id,provedor:s.provedor,execucaoLiberada:true});
 assert.equal(result.estado,'EXIGE_REVISAO');
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:s.pedidoId}).estado,'EXIGE_REVISAO');
 s.estado.erro=true;
 const e=s.evento('evt_FalhaRedeSandbox002','PAYMENT_RECEIVED','RECEIVED');
 assert.equal((await s.enviar(e)).status,200);
 const falha=await s.worker.processar({eventoId:e.id,provedor:s.provedor,execucaoLiberada:true});
 assert.equal(falha.estado,'EXIGE_REVISAO');
 assert.equal(falha.codigo,'RECONSULTA_INCONCLUSIVA');
 assert.equal(s.worker.consultar(e.id).estado,'EXIGE_REVISAO');
 s.estado.erro=false;s.estado.status='REFUNDED';
 const refund=s.evento('evt_EstornoSandbox003','PAYMENT_REFUNDED','REFUNDED');
 assert.equal((await s.enviar(refund)).status,200);
 const r=await s.worker.processar({eventoId:refund.id,provedor:s.provedor,execucaoLiberada:true});
 assert.equal(r.estado,'EXIGE_REVISAO','estorno demanda verificacao manual mesmo com reconsulta');
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:s.pedidoId}).estado,
  'REVERSAO_INFORMADA_SANDBOX');
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_reconsulta_staging').get().n,3);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('16 requisições concorrentes e 10 reconsultas do mesmo evento não duplicam transições',async t=>{
 const s=await cenario(t),evento=s.evento('evt_ConcorrenciaSandbox0001');
 const respostas=await Promise.all(Array.from({length:16},()=>s.enviar(evento)));
 assert.equal(respostas.every(r=>r.status===200),true);
 assert.equal(respostas.filter(r=>r.data.registrado).length,1);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_inbox_staging').get().n,1);
 s.estado.status='RECEIVED';
 const conclusoes=await Promise.all(Array.from({length:10},()=>s.worker.processar({
  eventoId:evento.id,provedor:s.provedor,execucaoLiberada:true
 })));
 assert.equal(conclusoes.filter(x=>!x.repetido).length,1);
 assert.equal(s.chamadas.filter(x=>x==='GET').length,1);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_reconsulta_staging').get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('webhook nao esta no app publico nem existe fallback remoto em producao',async t=>{
 const s=await cenario(t);
 const app=require('../src/server');
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const base='http://127.0.0.1:'+servidor.address().port;
 assert.equal((await fetch(base+'/api/checkout/webhook-prepedido-asaas',{
  method:'POST',headers:{'asaas-access-token':TOKEN}
 })).status,503);
 assert.equal((await fetch(base+'/staging/webhook-prepedido-asaas',{method:'POST'})).status,404);
 assert.equal((await fetch(base+'/health/ready')).status,503);
 assert.equal(s.chamadas.filter(x=>x==='GET').length,0);
});

test('apos interrupcao worker novo encontra evento travado, exige revisao e nao refaz Pix',async t=>{
 const s=await cenario(t),aviso=s.evento('evt_QuedaRecuperacaoLocal01');
 assert.equal((await s.enviar(aviso)).status,200);
 const inicio='2026-10-31T20:00:00.000Z';
 s.banco.prepare([
  'INSERT INTO akitemm_prepedido_webhook_reconsulta_staging',
  "(evento_id,estado,codigo,iniciado_em) VALUES(?,'PROCESSANDO','RECONSULTA',?)"
 ].join(' ')).run(aviso.id,inicio);
 const outroBanco=new DatabaseSync(s.arquivo);
 outroBanco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 t.after(()=>outroBanco.close());
 const novaPonte=new PontePrepedidoAsaasSandboxStaging({banco:outroBanco});
 const novaInbox=new InboxWebhookPrepedidoAsaasStaging({banco:outroBanco,token:TOKEN});
 const novoWorker=new ReconsultaWebhookPrepedidoAsaasStaging({
  banco:outroBanco,ponte:novaPonte,inbox:novaInbox,
  agoraMs:()=>Date.parse('2026-11-01T20:00:00.000Z')
 });
 assert.deepEqual(novoWorker.pendencias(),[{
  eventoId:aviso.id,estado:'PROCESSANDO',codigo:'RECONSULTA'
 }]);
 assert.throws(()=>novoWorker.recuperarTravados(),{codigo:'RECUPERACAO_NAO_AUTORIZADA'});
 assert.throws(()=>novoWorker.recuperarTravados({
  execucaoLiberada:true,idadeMinimaMs:0
 }),{codigo:'LIMITE_RECUPERACAO_INVALIDO'});
 assert.equal(novoWorker.recuperarTravados({
  execucaoLiberada:true,idadeMinimaMs:7*86400000
 }).recuperados,0,'evento recente demais para limite de 7 dias');
 const primeiro=novoWorker.recuperarTravados({execucaoLiberada:true});
 assert.equal(primeiro.recuperados,1);
 assert.deepEqual(primeiro.eventos,[aviso.id]);
 assert.equal(primeiro.novaCobranca,false);
 assert.equal(primeiro.reconsultaRemotaExecutada,false);
 assert.equal(novoWorker.recuperarTravados({execucaoLiberada:true}).recuperados,0);
 assert.equal(novoWorker.consultar(aviso.id).estado,'EXIGE_REVISAO');
 assert.equal(novoWorker.consultar(aviso.id).codigo,'PROCESSAMENTO_INTERROMPIDO_REVISAR');
 assert.equal(s.chamadas.filter(v=>v==='POST').length,1);
 assert.equal(s.chamadas.filter(v=>v==='GET').length,0);
 assert.equal(outroBanco.prepare(
  'SELECT COUNT(*) n FROM akitemm_prepedido_webhook_recuperacoes_staging'
 ).get().n,1);
 assert.deepEqual(novoWorker.pendencias(),[{
  eventoId:aviso.id,estado:'EXIGE_REVISAO',
  codigo:'PROCESSAMENTO_INTERROMPIDO_REVISAR'
 }]);
 assert.throws(()=>outroBanco.prepare(
  'DELETE FROM akitemm_prepedido_webhook_recuperacoes_staging').run(),
 /auditoria recuperacao imutavel/);
 assert.throws(()=>outroBanco.prepare(
  "UPDATE akitemm_prepedido_webhook_recuperacoes_staging SET codigo='INVENTADO'").run(),
 /auditoria recuperacao imutavel/);
 assert.equal(outroBanco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(outroBanco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('worker antigo que retorna depois de recuperacao nao sobrepoe a revisao manual',async t=>{
 const s=await cenario(t),aviso=s.evento('evt_ConcorrenciaQuedaLocal01');
 assert.equal((await s.enviar(aviso)).status,200);
 let liberar,avisarInicio;
 const iniciou=new Promise(resolve=>{avisarInicio=resolve;});
 const trava=new Promise(resolve=>{liberar=resolve;});
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  consultarCobranca:async id=>{
   assert.equal(id,PAY);
   avisarInicio();
   await trava;
   return {pagamentoId:PAY,externalReference:'LOOPLAB-'+s.pedidoId,
    clienteAsaasId:CLIENTE,billingType:'PIX',valorCentavos:25000,status:'RECEIVED'};
  }};
 const emCurso=s.worker.processar({
  eventoId:aviso.id,provedor,execucaoLiberada:true
 });
 await iniciou;
 assert.equal(s.worker.consultar(aviso.id).estado,'PROCESSANDO');
 const novoWorker=new ReconsultaWebhookPrepedidoAsaasStaging({
  banco:s.banco,inbox:s.inbox,ponte:s.ponte,
  agoraMs:()=>Date.now()+120000
 });
 const recuperado=novoWorker.recuperarTravados({execucaoLiberada:true});
 assert.equal(recuperado.recuperados,1);
 liberar();
 const antigo=await emCurso;
 assert.equal(antigo.repetido,true);
 assert.equal(antigo.revisaoManualObrigatoria,true);
 assert.equal(antigo.estado,'EXIGE_REVISAO');
 assert.equal(novoWorker.consultar(aviso.id).estado,'EXIGE_REVISAO');
 assert.equal(novoWorker.consultar(aviso.id).codigo,
  'PROCESSAMENTO_INTERROMPIDO_REVISAR');
 assert.equal(s.banco.prepare(
  'SELECT COUNT(*) n FROM akitemm_prepedido_webhook_recuperacoes_staging'
 ).get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('pendencias lista eventos nao processados sem divulgar dados pessoais',async t=>{
 const s=await cenario(t);
 const a=s.evento('evt_PendenteSemWorkerLocal01');
 assert.equal((await s.enviar(a)).status,200);
 assert.deepEqual(s.worker.pendencias(),[{
  eventoId:a.id,estado:'PENDENTE',codigo:'SEM_RECONSULTA'
 }]);
 assert.throws(()=>s.worker.pendencias({limite:101}),
  {codigo:'LIMITE_RECUPERACAO_INVALIDO'});
 const n=s.worker.recuperarTravados({execucaoLiberada:true});
 assert.equal(n.recuperados,0,'nao transformar evento ainda nao iniciado em processando');
 assert.equal(JSON.stringify(s.worker.pendencias()).includes('CPF'),false);
 assert.equal(s.chamadas.filter(x=>x==='GET').length,0);
});

test('operador local ve callbacks pendentes e libera revisao de travados sem expor dados ou enviar Pix',async t=>{
 const s=await cenario(t),aviso=s.evento('evt_OperacaoLocalTravada01');
 const {criarRouterOperacoesWebhookPrepedidoStagingLocal}=
  require('../src/routes/operacoes-webhook-prepedido-staging-local');
 assert.equal((await s.enviar(aviso)).status,200);
 s.banco.prepare([
  'INSERT INTO akitemm_prepedido_webhook_reconsulta_staging',
  "(evento_id,estado,codigo,iniciado_em) VALUES(?,'PROCESSANDO','RECONSULTA',?)"
 ].join(' ')).run(aviso.id,'2026-10-31T20:00:00.000Z');
 const worker=new ReconsultaWebhookPrepedidoAsaasStaging({
  banco:s.banco,inbox:s.inbox,ponte:s.ponte,
  agoraMs:()=>Date.parse('2026-11-01T20:00:00.000Z')
 });
 const app=express();app.use(express.json({limit:'4kb'}));
 app.use('/operador',criarRouterOperacoesWebhookPrepedidoStagingLocal({
  worker,autorizarOperador:req=>req.get('X-Fixture-Operador')==='sim',
  autorizarMutacao:req=>req.get('X-Fixture-Csrf')==='segredo-ensaio'
 }));
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port+'/operador';
 async function pedido(rota,{method='GET',operador='sim',csrf='segredo-ensaio',
  body,origin}={}){
  const res=await fetch(base+rota,{method,headers:{
   'Content-Type':'application/json',
   ...(operador?{'X-Fixture-Operador':operador}:{}),
   ...(csrf?{'X-Fixture-Csrf':csrf}:{}),
   ...(origin?{Origin:origin}:{})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,body:await res.json(),
   cache:res.headers.get('cache-control')};
 }
 assert.equal((await pedido('/webhooks/pendencias',{operador:null})).status,403);
 assert.equal((await pedido('/webhooks/pendencias',{
  origin:'https://origem-externa.invalid'})).status,403);
 const pendentes=await pedido('/webhooks/pendencias');
 assert.equal(pendentes.status,200);
 assert.equal(pendentes.cache,'no-store');
 assert.deepEqual(pendentes.body.pendencias,[{
  eventoId:aviso.id,estado:'PROCESSANDO',codigo:'RECONSULTA'
 }]);
 assert.deepEqual(pendentes.body.resumo,{
  pendentes:0,processando:1,exigeRevisao:0,total:1
 });
 assert.equal(pendentes.body.exibidos,1);
 assert.equal(pendentes.body.haMais,false);
 assert.equal(pendentes.body.consultaRemotaExecutada,false);
 assert.equal((await pedido('/webhooks/recuperar',{method:'POST',
  csrf:null,body:{}})).status,403);
 assert.equal((await pedido('/webhooks/recuperar',{method:'POST',
  body:{valorCentavos:25000}})).status,400);
 const antes=s.chamadas.length;
 const feito=await pedido('/webhooks/recuperar',{method:'POST',body:{}});
 assert.equal(feito.status,200);
 assert.equal(feito.body.recuperados,1);
 assert.equal(feito.body.reconsultaRemotaExecutada,false);
 assert.equal(feito.body.novaCobranca,false);
 assert.equal(feito.body.posicoesCriadas,0);
 const refeito=await pedido('/webhooks/recuperar',{method:'POST',body:{}});
 assert.equal(refeito.status,200);
 assert.equal(refeito.body.recuperados,0);
 assert.equal(s.chamadas.length,antes);
 assert.equal((await pedido('/webhooks/pendencias')).body.pendencias[0].estado,
  'EXIGE_REVISAO');
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_recuperacoes_staging').get().n,1);
});

test('fila com mais de 50 avisos mostra volume total sem perder a revisao',async t=>{
 const s=await cenario(t);
 for(let i=0;i<53;i++){
  const id='evt_AvisoLote_'+String(i).padStart(4,'0');
  const recebido=await s.enviar(s.evento(id));
  assert.equal(recebido.status,200);
 }
 assert.equal(s.worker.pendencias().length,50,'pagina de operador limitada');
 assert.deepEqual(s.worker.resumoPendencias(),{
  pendentes:53,processando:0,exigeRevisao:0,total:53
 });
 const resposta=await s.worker.processar({
  eventoId:'evt_AvisoLote_0000',provedor:s.provedor,execucaoLiberada:true
 });
 assert.equal(resposta.estado,'EXIGE_REVISAO');
 assert.deepEqual(s.worker.resumoPendencias(),{
  pendentes:52,processando:0,exigeRevisao:1,total:53
 });
 assert.equal(s.chamadas.filter(x=>x==='GET').length,1,
  'contar e listar nao devem consultar PSP');
 assert.equal(JSON.stringify(s.worker.resumoPendencias()).includes('CPF'),false);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
