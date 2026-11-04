'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-catraca-unificada-'+('Q'.repeat(50));
const TOKEN='TokenMockSomenteLaboratorio'+('T'.repeat(50));
const SENHA='SenhaFicticiaSomenteLaboratorio2026!';
const TERMOS='Registro puramente de laboratorio sem pagamentos, posicoes, saques ou beneficios reais.';
async function criarContexto(t,{ativo=true}={}){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 let gets=0;
 const pagamentoId='pay_CANDIDATOPSPSIMULADO01';
 let status='RECEIVED';
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix(x){return {
   ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   pagamentoId,valorCentavos:x.valorCentavos,status:'PENDING'
  };},
  async consultarCobranca(_id){
   gets++;
   assert.equal(_id,pagamentoId);
   return {pagamentoId,status,valorCentavos:25000,
    clienteAsaasId:'cus_CANDIDATOPSP01',billingType:'PIX',
    externalReference:'LOOPLAB-'+ctx.prepedidoId};
  }
 };
 const {app,contas,intencoes,prePedidos,ponte,inbox,worker,posicoes,entregas,sinalizacaoVitrine}=
  criarAppLojaEscritorioCandidato({
   banco,repositorioCatalogo:catalogoFicticioCheckout(),
   chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
   segredoOperador:ADMIN,webhookHomologacaoToken:TOKEN,
   provedorReconsultaSandbox:provedor,
   operacoesSandboxAutorizadas:ativo,
   termosVersao:'LAB-candidato-psp-2026',termosTexto:TERMOS
  });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(uri,{method='GET',token,csrf,admin=false,data}={})=>{
  const r=await fetch(base+uri,{method,headers:{
   ...(token?{Cookie:COOKIE+'='+token}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(data?{'Content-Type':'application/json'}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,body:await r.json()};
 };
 const registro=await contas.cadastrar({nome:'Ana Exemplo',nick:'Ana',
  email:'ana-psp@example.invalid',senha:SENHA,
  termosVersao:'LAB-candidato-psp-2026',termosTexto:TERMOS,
  aceiteExplicito:true});
 await contas.cadastrar({nome:'Bia Exemplo',nick:'Bia',
  email:'bia-psp@example.invalid',senha:SENHA,
  termosVersao:'LAB-candidato-psp-2026',termosTexto:TERMOS,
  aceiteExplicito:true});
 const a=await contas.entrar({nick:'Ana',senha:SENHA});
 const b=await contas.entrar({nick:'Bia',senha:SENHA});
 // Oferta VERDE é definida ANTES do pré-pedido: fica imutável na fotografia.
 await sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0});
 const catalogo=catalogoFicticioCheckout();
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const draft=intencoes.criar({titularId:registro.titularId,
  chaveIdempotencia:'psp-conciliacao-2026-01',entrada,cotacao});
 const pedido=await prePedidos.preparar({titularId:registro.titularId,
  rascunhoId:draft.intencao.pedidoId,repositorioCatalogo:catalogo});
 const prepedidoId=pedido.prepedido.prepedidoId;
 const ctx={banco,request,contas,intencoes,prePedidos,ponte,inbox,worker,
  posicoes,entregas,sinalizacaoVitrine,prepedidoId,registro,a,b,provedor,pagamentoId,
  getGets:()=>gets,setStatus:v=>{status=v;}};
 return ctx;
}
test('uma conta -> PSP reconsultado -> 1 posicao e entrega ficticias -> Escritorio',async t=>{
 const c=await criarContexto(t);
 const root='/staging/escritorio-unificado';
 const eventoId='evt_CANDIDATORECEIVED01';
 const primeiro=await c.request(root+'/projetar-posicao-ficticia',{
  method:'POST',admin:true,data:{eventoId,prepedidoId:c.prepedidoId}
 });
 assert.equal(primeiro.status,409);
 assert.equal((await c.request(root+'/reconsultar-psp',{
  method:'POST',data:{eventoId}
 })).status,401);
 assert.equal((await c.request(root+'/monitor-psp')).status,401);
 const antesFila=await c.request(root+'/projecao-filas',{admin:true});
 assert.equal(antesFila.status,200);
 assert.equal(antesFila.body.pendentesConferidas,0);
 assert.equal((await c.request(root+'/projecao-filas')).status,401);
 assert.equal((await c.request('/staging/minha-previa-filas')).status,401);
 const noPsp=await c.request('/staging/meus-pedidos',{token:c.a.token});
 assert.equal(noPsp.status,200);
 assert.equal(noPsp.body.pedidos[0].conferenciaPSPConcluida,false);
 assert.equal(noPsp.body.pedidos[0].posicoesFicticiasConferidas,0);
 c.ponte.preparar({titularId:c.registro.titularId,
  prepedidoId:c.prepedidoId,clienteAsaasId:'cus_CANDIDATOPSP01'});
 await c.ponte.enviarUmaVez({
  titularId:c.registro.titularId,prepedidoId:c.prepedidoId,
  provedor:c.provedor,execucaoLiberada:true
 });
 for(const [ev,status] of [
  ['PAYMENT_CREATED','PENDING'],['PAYMENT_RECEIVED','RECEIVED']
 ]){
  c.inbox.registrar({cabecalhoToken:TOKEN,
   corpoBruto:Buffer.from(JSON.stringify({
    id:ev==='PAYMENT_RECEIVED'?eventoId:'evt_CANDIDATOCREATED01',
    event:ev,payment:{id:c.pagamentoId,status,value:250,
     billingType:'PIX',externalReference:'LOOPLAB-'+c.prepedidoId}
   }))});
 }
 const monitor=await c.request(root+'/monitor-psp',{admin:true});
 assert.equal(monitor.status,200);
 assert.equal(monitor.body.resumo.pendentes,2);
 assert.equal(monitor.body.posicoesReais,0);
 const antes=await c.request(root+'/projetar-posicao-ficticia',{
  method:'POST',admin:true,data:{eventoId,prepedidoId:c.prepedidoId}
 });
 assert.equal(antes.status,409,'webhook bruto nao deve criar posicao');
 const entregaAntes=await c.request(root+'/preparar-entrega',{
  method:'POST',admin:true,data:{prepedidoId:c.prepedidoId}
 });
 assert.equal(entregaAntes.status,409,'webhook bruto nao libera PDF');
 assert.equal(c.getGets(),0,'nenhuma consulta PSP implicitamente');
 const conc=await c.request(root+'/reconsultar-psp',{
  method:'POST',admin:true,data:{eventoId}
 });
 assert.equal(conc.status,200,JSON.stringify(conc.body));
 assert.equal(conc.body.estado,'CONCLUIDO');
 assert.equal(c.getGets(),1,'GET independente so mediante operacao autenticada');
 const retry=await c.request(root+'/reconsultar-psp',{
  method:'POST',admin:true,data:{eventoId}
 });
 assert.equal(retry.body.repetido,true);
 assert.equal(c.getGets(),1,'callback repetido nao consulta novamente');
 const p=await c.request(root+'/projetar-posicao-ficticia',{
  method:'POST',admin:true,data:{eventoId,prepedidoId:c.prepedidoId}
 });
 assert.equal(p.status,201,JSON.stringify(p.body));
 assert.equal(p.body.pendente.quantidadePosicoesPendentesSimuladas,1);
 assert.equal(p.body.pendente.posicoesReaisCriadas,0);
 const hipotese=await c.request(root+'/projecao-filas',{admin:true});
 assert.equal(hipotese.status,200,JSON.stringify(hipotese.body));
 assert.equal(hipotese.body.totalHistorico,1);
 assert.equal(hipotese.body.pendentesConferidas,1);
 assert.equal(hipotese.body.quantidadeSimuladaFilaA,0);
 assert.equal(hipotese.body.quantidadeSimuladaFilaB,1);
 assert.equal(hipotese.body.hipoteseFilaB[0].estado,'APENAS_PREVIA_FILA_B_AZUL');
 assert.equal(hipotese.body.habilitacaoMotorReal,false);
 assert.equal(hipotese.body.classificacaoHistoricaComprovada,false);
 const foto=c.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:c.prepedidoId,titularId:c.registro.titularId});
 assert.equal(foto.valorVerdeConsideradoCentavos,25000);
 assert.equal(foto.podeSimularFilaBAzul,true);
 assert.equal(foto.itens[0].classificacao,'VERDE');
 await c.sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'CINZA',quantidadeMinimaLoop:1,revisaoEsperada:1});
 const aindaHistorico=await c.request(root+'/projecao-filas',{admin:true});
 assert.equal(aindaHistorico.body.pendentesConferidas,1,
  'mudar a cor na vitrine não reescreve a classificação da compra anterior');
 assert.equal(c.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:c.prepedidoId}).itens[0].classificacao,'VERDE');
 assert.throws(()=>c.banco.prepare([
  'UPDATE akitemm_vitrine_fotografia_classificacao_prepedido',
  "SET fotografia_json='{}'"
 ].join(' ')).run(),/fotografia historica imutavel/);
 assert.equal(hipotese.body.posicoesReaisCriadas,0);
 assert.equal(hipotese.body.filaRealAlterada,false);
 assert.equal(hipotese.body.tabuleiroRealAlterado,false);
 const minhaFila=await c.request('/staging/minha-previa-filas',{token:c.a.token});
 const filaBia=await c.request('/staging/minha-previa-filas',{token:c.b.token});
 assert.equal(minhaFila.status,200);
 assert.equal(minhaFila.body.meusSimuladosNaFilaB,1);
 assert.equal(minhaFila.body.hipoteseFilaB[0].titularId,undefined);
 assert.equal(filaBia.body.meusSimuladosNaFilaB,0);
 assert.equal(JSON.stringify(filaBia.body).includes(c.prepedidoId),false);
 assert.equal(c.getGets(),1,'previa nunca faz GET PSP');
 assert.equal((await c.request(root+'/projetar-posicao-ficticia',{
  method:'POST',admin:true,data:{eventoId,prepedidoId:c.prepedidoId}
 })).status,200,'replay nao duplica');
 const entrega=await c.request(root+'/preparar-entrega',{
  method:'POST',admin:true,data:{prepedidoId:c.prepedidoId}
 });
 assert.equal(entrega.status,201);
 assert.equal(entrega.body.habilitadaParaEntregaReal,false);
 const ana=await c.request('/staging/meus-pedidos',{token:c.a.token});
 const bia=await c.request('/staging/meus-pedidos',{token:c.b.token});
 assert.equal(ana.status,200);
 assert.equal(ana.body.pedidos.length,1);
 assert.equal(ana.body.pedidos[0].conferenciaPSPConcluida,true);
 assert.equal(ana.body.pedidos[0].posicoesFicticiasConferidas,1);
 assert.equal(ana.body.pedidos[0].entregaFicticia.quantidadeLinhas,1);
 assert.equal(ana.body.pedidos[0].posicoesCriadas,0);
 assert.equal(bia.body.pedidos.length,0);
 const escritorio=await c.request(root,{admin:true});
 assert.equal(escritorio.status,200);
 assert.equal(escritorio.body.pedidos[0].titularId,c.registro.titularId);
 assert.equal(escritorio.body.resumo.posicoesPendentesSimuladas,1);
 assert.equal(escritorio.body.entregasFicticias,1);
 assert.equal(escritorio.body.posicoesPendentesFicticias,1);
 assert.equal(escritorio.body.resumo.posicoesReais,0);
 assert.equal(c.getGets(),1,'nenhuma leitura do cliente ou escritorio chama PSP');
 c.setStatus('REFUNDED');
 await c.ponte.conferir({
  titularId:c.registro.titularId,prepedidoId:c.prepedidoId,
  provedor:c.provedor
 });
 const filaReversa=await c.request(root+'/projecao-filas',{admin:true});
 assert.equal(filaReversa.status,200);
 assert.equal(filaReversa.body.pendentesConferidas,0);
 assert.equal(filaReversa.body.pendentesExigemRevisao,1);
 assert.equal(filaReversa.body.hipoteseFilaB[0].estado,'EXIGE_REVISAO_PSP');
 const reversao=await c.request('/staging/meus-pedidos',{token:c.a.token});
 assert.equal(reversao.body.pedidos[0].entregaFicticia.status,
  'BLOQUEADA_PARA_REVISAO_SANDBOX');
 assert.equal(reversao.body.pedidos[0].situacaoOperacional,
  'EXIGE_REVISAO_SANDBOX');
 assert.equal(reversao.body.pedidos[0].posicoesCriadas,0);
 // Estorno é evento financeiro legítimo para revisão, não corrupção
 // relacional. Preservar o histórico sem liberar nova posição ou entrega.
 const revisao=await c.request(root,{admin:true});
 assert.equal(revisao.body.integridadePagamentosEntregas.totalInconsistencias,0);
 assert.equal(revisao.body.integridadePagamentosEntregas.posicoesEmRevisao,1);
 assert.equal(revisao.body.integridadePagamentosEntregas.entregasEmRevisao,1);
 assert.equal((await c.request('/readyz')).status,200);
 // Corrupção por SQL direto que não gera erro de FK: detectar antes de
 // qualquer utilização de pagamento, posição ou entrega pelo operador.
 c.banco.exec('DROP TRIGGER posicao_pendente_sandbox_no_update');
 c.banco.prepare([
  'UPDATE akitemm_prepedido_posicoes_pendentes_sandbox_staging',
  'SET pagamento_id=? WHERE prepedido_id=?'
 ].join(' ')).run('pay_CORROMPIDO_1234',c.prepedidoId);
 const integridade=await c.request(root,{admin:true});
 assert.equal(integridade.body.integridadePagamentosEntregas.posicoesDivergentes,1);
 assert.equal(integridade.body.integridadePagamentosEntregas.prontoParaLaboratorio,false);
 assert.equal((await c.request('/readyz')).status,503);
 c.banco.exec('DROP TRIGGER entregas_sandbox_no_update');
 c.banco.prepare([
  'UPDATE akitemm_prepedido_entregas_sandbox_staging',
  'SET quantidade=quantidade+1 WHERE prepedido_id=?'
 ].join(' ')).run(c.prepedidoId);
 const divergente=await c.request(root,{admin:true});
 assert.ok(divergente.body.integridadePagamentosEntregas.entregasDivergentes>=1);
 assert.ok(divergente.body.integridadePagamentosEntregas.totalInconsistencias>=2);
 assert.equal(reversao.body.pedidos[0].posicoesFicticiasConferidas,0,
  'estorno jamais deixa posicao simulada parecer apta');
 assert.equal(reversao.body.pedidos[0].posicoesFicticiasHistoricas,1,
  'trilha de auditoria permanece sem apagar registros');
 const escritorioReversao=await c.request(root,{admin:true});
 assert.equal(escritorioReversao.body.pedidos[0].posicoesFicticiasAptasAgora,0);
 assert.equal(escritorioReversao.body.pedidos[0].posicoesPendentesFicticias,1);
 assert.equal(c.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(c.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('operacao PSP desligada por padrao e sem credencial nao expõe nem reconsulta',async t=>{
 const c=await criarContexto(t,{ativo:false});
 const root='/staging/escritorio-unificado';
 assert.equal((await c.request(root+'/monitor-psp',{admin:true})).status,403);
 assert.equal((await c.request(root+'/reconsultar-psp',{
  method:'POST',admin:true,data:{eventoId:'evt_FAKE123'}
 })).status,403);
 assert.equal((await c.request(root+'/projetar-posicao-ficticia',{
  method:'POST',admin:true,
  data:{prepedidoId:c.prepedidoId,eventoId:'evt_FAKE123'}
 })).status,403);
 assert.equal(c.getGets(),0);
 const semPsp=await c.request(root+'/projecao-filas',{admin:true});
 assert.equal(semPsp.status,200);
 assert.equal(semPsp.body.estado,'SOMENTE_CENARIO_NAO_ATIVADO');
 assert.equal(semPsp.body.pendentesConferidas,0);
 assert.equal((await c.request(root,{admin:true})).body.conciliacaoSandboxDisponivel,false);
 assert.equal((await c.request('/staging/meus-pedidos',{token:c.b.token})).body.pedidos.length,0);
});
