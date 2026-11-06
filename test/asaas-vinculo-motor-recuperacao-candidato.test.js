'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');

const TOKEN='SandboxRetryMotorCandidato2026Token'+('T'.repeat(42));
const OPERADOR='SandboxRetryMotorCandidato2026Operador'+('R'.repeat(42));
const CUSTOMER='cus_RetryMotorCandidato2026';
const PAYMENT='pay_RetryMotorCandidato2026';

test('GET PSP concluido recupera vinculo motor apos falha transitoria sem nova cobranca',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let pedidoId=null,gets=0,posts=0;
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   posts++;
   assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAYMENT,
    valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(pagamentoId){
   gets++;
   assert.equal(pagamentoId,PAYMENT);
   return {pagamentoId,status:'RECEIVED',valorCentavos:25000,
    billingType:'PIX',clienteAsaasId:CUSTOMER,
    externalReference:'LOOPLAB-'+pedidoId};
  }
 };
 const r=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,
  segredoOperador:OPERADOR,termosVersao:'LAB-retry-motor-2026',
  termosTexto:'Somente ensaio local sem dinheiro, premios, saques ou direitos reais.'
 });
 const server=r.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const monitorar=async rota=>{
  const resp=await fetch('http://127.0.0.1:'+server.address().port+
   '/staging/escritorio-unificado'+rota,{
    headers:{Authorization:'Bearer '+OPERADOR}
   });
  assert.equal(resp.status,200);
  return resp.json();
 };
 const titular=await r.contas.cadastrar({
  nome:'Cliente Ensaio',nick:'Retry',
  email:'retry-motor@example.invalid',senha:'SenhaFicticiaEnsaio2026#Forte',
  termosVersao:'LAB-retry-motor-2026',
  termosTexto:'Somente ensaio local sem dinheiro, premios, saques ou direitos reais.',
  aceiteExplicito:true
 });
 await r.sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0
 });
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const catalogo=catalogoFicticioCheckout();
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const draft=r.intencoes.criar({titularId:titular.titularId,
  chaveIdempotencia:'retry-motor-2026-01',entrada,cotacao});
 const pedido=await r.prePedidos.preparar({
  titularId:titular.titularId,rascunhoId:draft.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 pedidoId=pedido.prepedido.prepedidoId;
 r.ponte.preparar({titularId:titular.titularId,
  prepedidoId:pedidoId,clienteAsaasId:CUSTOMER});
 await r.ponte.enviarUmaVez({titularId:titular.titularId,
  prepedidoId:pedidoId,provedor,execucaoLiberada:true,
  exigirCoberturaBruta:true});
 assert.equal(posts,1);
 const novoEvento=(id,tipo)=>{
  r.inbox.registrar({cabecalhoToken:TOKEN,
   corpoBruto:Buffer.from(JSON.stringify({
    id,event:tipo,payment:{id:PAYMENT,status:'RECEIVED',
     value:250,billingType:'PIX',externalReference:'LOOPLAB-'+pedidoId}
   }))});
 };
 const recebido='evt_RetryMotorReceived2026';
 novoEvento(recebido,'PAYMENT_RECEIVED');
 const vincular=r.motorConta.vincularPedidoConferidoSandbox.bind(r.motorConta);
 let falhasRestantes=1;
 r.motorConta.vincularPedidoConferidoSandbox=(args)=>{
  if(falhasRestantes-->0)throw Object.assign(new Error('falha temporaria simulada'),
   {codigo:'MOTOR_FALHA_TRANSITORIA_TESTE'});
  return vincular(args);
 };
 const tentativa=await r.executarConciliacaoSandbox(20);
 assert.equal(tentativa.consultados,1);
 assert.equal(tentativa.conciliados,1,'GET PSP confirmou no primeiro ciclo');
 assert.equal(tentativa.revisaoNecessaria,1,'falha do motor fica sinalizada');
 assert.equal(tentativa.lotesPendentesCriados,0);
 assert.equal(tentativa.vinculosMotorAusentes,1);
 assert.equal((await monitorar('/monitor-psp')).resumo.vinculosMotorAusentes,1);
 assert.equal((await monitorar('')).vinculosMotorAusentes,1);
 assert.equal(tentativa.pendentesRestantes,1,
  'falha depois de GET PSP nao desaparece do trabalho pendente');
 assert.equal(r.worker.consultar(recebido).estado,'CONCLUIDO');
 assert.equal(r.motorConta.consultar({titularId:titular.titularId}).posicoesAtivasDoTitular,0);
 assert.equal(gets,1);
 // Evento novo tem prioridade, sem deixar a falha antiga bloquear a inbox.
 novoEvento('evt_RetryMotorUpdated2026','PAYMENT_UPDATED');
 const novo=await r.executarConciliacaoSandbox(1);
 assert.equal(novo.consultados,1);
 assert.equal(novo.vinculosMotorAusentes,1);
 assert.equal(novo.pendentesRestantes,1);
 assert.equal(gets,2);
 const recuperado=await r.executarConciliacaoSandbox(20);
 assert.equal(recuperado.consultados,1);
 assert.equal(recuperado.lotesPendentesCriados,1);
 assert.equal(recuperado.vinculosMotorAusentes,0);
 assert.equal((await monitorar('/monitor-psp')).resumo.vinculosMotorAusentes,0);
 assert.equal((await monitorar('')).vinculosMotorAusentes,0);
 assert.equal(recuperado.pendentesRestantes,0);
 assert.equal(gets,2,'replay do GET conferido nao faz nova consulta remota');
 assert.equal(posts,1,'retomar motor nao cria nova cobranca');
 assert.equal(r.motorConta.consultar({titularId:titular.titularId}).posicoesAtivasDoTitular,1);
 assert.equal(banco.prepare([
  "SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes",
  "WHERE tipo='VINCULAR_PEDIDO' AND prepedido_id=?"
 ].join(' ')).get(pedidoId).n,1);
 const replay=await r.executarConciliacaoSandbox(20);
 assert.equal(replay.consultados,0);
 assert.equal(replay.pendentesRestantes,0);
 assert.equal(r.motorConta.consultar({titularId:titular.titularId}).posicoesAtivasDoTitular,1);
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
