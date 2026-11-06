'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const TOKEN='EnsaioWebhookConfirmacaoAsaas2026TokenFortissimo';
const OP='OperadorSomenteLocalConfirmacaoPagamento_'+('R'.repeat(50));
const CUSTOMER='cus_TestadorPagamentoSandbox2026';
const PAYMENT='pay_TestadorPagamentoSandbox2026';
test('webhook bruto nao gera posicoes; PSP reconsultado cria lote ROXO pendente unico, sem direito',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 let gets=0,posts=0,estadoPSP='RECEIVED';
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   posts++;
   assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAYMENT,
    valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(id){
   gets++;assert.equal(id,PAYMENT);
   return {pagamentoId:PAYMENT,status:estadoPSP,valorCentavos:25000,
    billingType:'PIX',clienteAsaasId:CUSTOMER,
    externalReference:'LOOPLAB-'+pedidoId};
  }
 };
 const r=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,
  segredoOperador:OP,termosVersao:'LAB-auto-conciliacao-2026',
  termosTexto:'Termos de homologacao sem dinheiro, saques, premios, saldos nem creditos reais.'
 });
 const server=r.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const base='http://127.0.0.1:'+server.address().port;
 async function call(route,{method='GET',cookie,csrf,key,admin=false,body}={}){
  const x=await fetch(base+route,{method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(admin?{Authorization:'Bearer '+OP}:{}),
   ...(body?{'Content-Type':'application/json','X-LOOP-LAB':'participante'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:x.status,json:await x.json(),cookie:x.headers.get('set-cookie')};
 }
 const cadastro=await call('/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Cliente Laboratorio',nick:'Labor',email:'labor@example.invalid',
  senha:'SenhaLaboratorio2026#Forte',aceiteExplicito:true
 }});
 assert.equal(cadastro.status,201,JSON.stringify(cadastro.json));
 const login=await call('/staging/contas/entrar',{method:'POST',body:{
  nick:'Labor',senha:'SenhaLaboratorio2026#Forte'
 }});
 assert.equal(login.status,200);
 const titularId=cadastro.json.titularId;
 const cookie=login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],csrf=login.json.csrf;
 const cor=await call('/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',{
  method:'PATCH',admin:true,body:{classificacao:'ROXO',quantidadeMinimaLoop:1,
   revisaoEsperada:0,posicoesPorUnidadeRoxo:5}
 });
 assert.equal(cor.status,200,JSON.stringify(cor.json));
 const pedir=await call('/staging/vitrine/loja/pedidos',{method:'POST',cookie,csrf,
  key:'auto-sandbox-posicoes-roxas-0001',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
 });
 assert.equal(pedir.status,201,JSON.stringify(pedir.json));
 const pedidoId=pedir.json.pedido.pedidoId;
 const snap=r.sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:pedidoId});
 assert.equal(snap.planejamentoPosicoes.quantidadePosicoesPrevistas,5);
 const preparo=r.ponte.preparar({titularId,prepedidoId:pedidoId,clienteAsaasId:CUSTOMER});
 assert.equal(preparo.repetido,false);
 // Modo estrito de pre-cobranca barra o ROXO 250/5 antes de qualquer POST
 // ao PSP e sem deixar tentativa de criacao indeterminada.
 await assert.rejects(r.ponte.enviarUmaVez({
  titularId,prepedidoId:pedidoId,provedor,execucaoLiberada:true,
  exigirCoberturaBruta:true
 }),{codigo:'COBERTURA_BRUTA_INSUFICIENTE_PARA_COBRANCA'});
 assert.equal(posts,0);
 assert.equal(r.ponte.consultar({titularId,prepedidoId:pedidoId}).estado,'PREPARADA');
 // Operador pode executar simulacao NEGATIVA de laboratorio mesmo assim.
 await r.ponte.enviarUmaVez({titularId,prepedidoId:pedidoId,provedor,
  execucaoLiberada:true});
 assert.equal(posts,1);
 assert.throws(()=>r.motorConta.vincularPedidoConferidoSandbox({prepedidoId:pedidoId}),
  /PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE/);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,0);
 const evt='evt_AutoMotorPaymentReceived2026';
 r.inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(JSON.stringify({
  id:evt,event:'PAYMENT_RECEIVED',payment:{id:PAYMENT}
 }))});
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,0);
 assert.equal((await call('/staging/escritorio-unificado/motor/conciliar-pedido-sandbox',
  {method:'POST',admin:true,body:{prepedidoId:pedidoId}})).status,400);
 assert.equal((await call('/staging/escritorio-unificado/motor/conciliar-pedido-sandbox',
  {method:'POST',body:{prepedidoId:pedidoId}})).status,401);
 const conf=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:evt}
 });
 assert.equal(conf.status,200,JSON.stringify(conf.json));
 assert.equal(conf.json.estado,'CONCLUIDO');
 assert.equal(conf.json.vinculoMotorEnsaio.estado,'PENDENTES_GERADAS');
 assert.equal(conf.json.vinculoMotorEnsaio.quantidade,5);
 assert.equal(gets,1);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 assert.equal(r.motorConta.consultar({titularId}).pendentesDeEnsaio,5);
 // Auditoria do mesmo pedido: ROXO a R$ 250 com 5 posicoes eh
 // aritmeticamente inviavel antes de pagar fornecedor ou PSP.
 const mudancasAntesAuditoria=db.prepare('SELECT total_changes() AS n').get().n;
 const auditoria=await call('/staging/escritorio-unificado/auditoria-cobertura',
  {admin:true});
 assert.equal(db.prepare('SELECT total_changes() AS n').get().n,mudancasAntesAuditoria,
  'auditoria de pedidos, posicoes e cofres nunca pode escrever no banco');
 assert.equal(auditoria.status,200,JSON.stringify(auditoria.json));
 assert.equal(auditoria.json.resumo.brutoInsuficiente,1);
 assert.equal(auditoria.json.resumo.posicoesNoMotorEnsaio,5);
 assert.equal(auditoria.json.resumo.aceitesHistoricosIndividuais,0);
 assert.equal(auditoria.json.resumo.valorCondicionalDosLotesCentavos,375000);
 assert.equal(auditoria.json.pedidos[0].posicoesSemAceiteIndividual,5);
 assert.equal(auditoria.json.reservasBancariasDisponiveisComprovadas,false);
 assert.equal(auditoria.json.livrosFinanceirosLab.provisoesNaoSaoCaixaReal,true);
 assert.equal(auditoria.json.livrosFinanceirosLab.extratosBancariosConciliados,false);
 assert.equal(auditoria.json.livrosFinanceirosLab.saquesReais,0);
 assert.ok(Array.isArray(auditoria.json.livrosFinanceirosLab.fontesAusentes));
 assert.equal(auditoria.json.livrosFinanceirosLab.dadosDaLojaNaoEquivalemAoLivroFinanceiro,true);
 assert.equal(auditoria.json.custosBonificacaoComprovados,false);
 assert.equal(auditoria.json.resumo.referenciaTotalCalculadaCentavos,125000);
 assert.equal(auditoria.json.pedidos[0].posicoesPlanejadas,5);
 assert.equal(auditoria.json.pedidos[0].saldoBrutoAposReservaCentavos,-100000);
 assert.equal(auditoria.json.pedidos[0].aptoParaLiberarReal,false);
 assert.equal(auditoria.json.marcoZeroFinanceiroAprovado,false);
 assert.equal(auditoria.json.somenteLeitura,true);
 assert.equal(JSON.stringify(auditoria.json).includes(titularId),false);
 assert.equal((await call('/staging/escritorio-unificado/auditoria-cobertura'))
  .status,401);
 assert.equal((await call('/staging/escritorio-unificado/auditoria-cobertura?limite=1000',
  {admin:true})).status,400);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 const primeiraPosicao=r.motorConta.consultar({titularId}).minhasPosicoes[0].numero;
 const versaoTermos='LAB-auto-conciliacao-2026';
 const bodyAceite={posicaoId:primeiraPosicao,versaoTermos,aceiteExplicito:true};
 const rotaAceite='/staging/motor/posicoes/confirmar-ensaio';
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,409,
  'sem CPF ainda nao ha aceite individual');
 assert.equal((await call(rotaAceite,{method:'POST',body:bodyAceite})).status,401);
 assert.equal((await call(rotaAceite,{method:'POST',cookie,body:bodyAceite})).status,403);
 const cpf=await call('/staging/contas/identidade',{method:'POST',cookie,csrf,body:{
  cpf:'52998224725',aceiteExplicito:true
 }});
 assert.equal(cpf.status,201,JSON.stringify(cpf.json));
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:{
  ...bodyAceite,aceiteExplicito:false
 }})).status,400);
 const aceite=await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite});
 assert.equal(aceite.status,201,JSON.stringify(aceite.json));
 assert.equal(aceite.json.aceiteIndividualRegistrado,true);
 assert.equal(aceite.json.identidadeExternaVerificada,false);
 assert.equal(aceite.json.criouDireitoReal,false);
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,200);
 const pos=r.motorConta.consultar({titularId});
 assert.equal(pos.pendentesDeEnsaio,4);
 assert.equal(pos.minhasPosicoes.filter(x=>x.aceiteIndividualRegistrado).length,1);
 assert.equal(pos.minhasPosicoes.filter(x=>x.pendente).length,4);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,1);
 const auditoriaAposAceite=await call('/staging/escritorio-unificado/auditoria-cobertura',
  {admin:true});
 assert.equal(auditoriaAposAceite.status,200,JSON.stringify(auditoriaAposAceite.json));
 assert.equal(auditoriaAposAceite.json.resumo.aceitesHistoricosIndividuais,1);
 assert.equal(auditoriaAposAceite.json.resumo.aceitesSemPSPVigente,0);
 assert.equal(auditoriaAposAceite.json.pedidos[0].posicoesSemAceiteIndividual,4);
 assert.equal(auditoriaAposAceite.json.pedidos[0].aceitesHistoricosIndividuais,1);
 // Outra conta nao ve nem consegue aceitar a posicao vinculada ao titular.
 const outro=await call('/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Outro titular laboratorio',nick:'Outro',email:'outro@example.invalid',
  senha:'OutraSenhaLaboratorio2026#Forte',aceiteExplicito:true
 }});
 assert.equal(outro.status,201);
 const loginOutro=await call('/staging/contas/entrar',{method:'POST',body:{
  nick:'Outro',senha:'OutraSenhaLaboratorio2026#Forte'
 }});
 assert.equal(loginOutro.status,200);
 const cookieOutro=loginOutro.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 assert.equal((await call(rotaAceite,{method:'POST',cookie:cookieOutro,
  csrf:loginOutro.json.csrf,body:bodyAceite})).status,404);
 assert.equal(r.motorConta.consultar({titularId:outro.json.titularId}).posicoesAtivasDoTitular,0);
 const replay=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:evt}
 });
 assert.equal(replay.status,200);
 assert.equal(replay.json.vinculoMotorEnsaio.estado,'JA_VINCULADO');
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 assert.equal(gets,1,'repetir webhook nao faz GET ao PSP novamente');
 assert.equal(posts,1,'replay nao gera nova cobranca');
 assert.equal(r.motorConta.consultar({titularId}).posicoesReais,0);
 assert.equal(r.motorConta.consultar({titularId}).dinheiroReal,false);
 // Reversão reconsultada não apaga o histórico, mas tira as posições
 // da elegibilidade de fila/catraca e impede reativação por replay.
 estadoPSP='REFUNDED';
 const reversaoId='evt_AutoMotorRefund2026';
 r.inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(JSON.stringify({
  id:reversaoId,event:'PAYMENT_REFUNDED',payment:{id:PAYMENT}
 }))});
 const devolucao=await call('/staging/escritorio-unificado/reconciliar-pendentes-sandbox',{
  method:'POST',admin:true,body:{limite:20}
 });
 assert.equal(devolucao.status,200,JSON.stringify(devolucao.json));
 assert.equal(devolucao.json.consultados,1);
 assert.equal(devolucao.json.lotesSuspensos,1);
 assert.equal(devolucao.json.pendentesRestantes,0);
 assert.equal(devolucao.json.posicoesComerciais,0);
 // A reconsulta manual permanece disponivel, mas nao deve ressuscitar
 // uma posicao depois de reembolso ja conciliado.
 const reconsultaRepetida=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:reversaoId}
 });
 assert.equal(reconsultaRepetida.status,200);
 assert.equal(reconsultaRepetida.json.repetido,true);
 assert.equal(reconsultaRepetida.json.vinculoMotorEnsaio.estado,
  'SUSPENSO_POR_REVERSAO_PSP');
 assert.equal(reconsultaRepetida.json.vinculoMotorEnsaio.quantidadeSuspensa,0);
 const suspensas=r.motorConta.consultar({titularId});
 assert.equal(suspensas.posicoesAtivasDoTitular,5);
 assert.equal(suspensas.pendentesDeEnsaio,0);
 assert.ok(suspensas.minhasPosicoes.every(x=>x.estado==='ENSAIO_EM_REVISAO_PSP'));
 const auditoriaRevertida=await call('/staging/escritorio-unificado/auditoria-cobertura',
  {admin:true});
 assert.equal(auditoriaRevertida.status,200,JSON.stringify(auditoriaRevertida.json));
 assert.equal(auditoriaRevertida.json.resumo.aceitesHistoricosIndividuais,1);
 assert.equal(auditoriaRevertida.json.resumo.aceitesSemPSPVigente,1);
 assert.equal(auditoriaRevertida.json.resumo.lotesSemPSPConferido,1);
 assert.ok(auditoriaRevertida.json.pedidos[0].alertas.includes('ACEITES_HISTORICOS_SEM_PSP_VIGENTE'));
 assert.equal(auditoriaRevertida.json.resumo.posicoesNoMotorEnsaio,5);
 assert.equal(auditoriaRevertida.json.pagamentosDoPSPSaoSomenteSandbox,true);
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,1,
  'reversao nao apaga aceite historico');
 assert.throws(()=>r.motorConta.vincularPedidoConferidoSandbox({prepedidoId:pedidoId}),
  /PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE/);
 // Mesmo se um lote ou aceite estranho ficar FORA da pagina atual,
 // a auditoria deve detectar a inconsistencia globalmente e sem PII.
 db.exec('SAVEPOINT teste_integridade_auditoria');
 try{
  db.prepare([
   'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
   '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
  ].join(' ')).run('hom-00000000-0000-4000-8000-000000000000',1,
   'titular-forjado-lab',999999);
  db.prepare([
   'INSERT INTO akitemm_motor_ensaio_aceites_posicao',
   '(numero_posicao,prepedido_id,titular_id,cpf_hmac,versao_termos,hash_termos,criado_em)',
   'VALUES(?,?,?,?,?,?,?)'
  ].join(' ')).run(999999,'hom-00000000-0000-4000-8000-000000000000',
   'outro-titular-forjado','hash-fixture','LAB-fixture','sha-fixture',new Date().toISOString());
  const suspeita=await call('/staging/escritorio-unificado/auditoria-cobertura',
   {admin:true});
  assert.equal(suspeita.status,200,JSON.stringify(suspeita.json));
  assert.equal(suspeita.json.resumo.lotesSemPedidoValidoNoBanco,1);
  assert.equal(suspeita.json.resumo.aceitesSemVinculoConsistenteNoBanco,1);
  assert.ok(suspeita.json.alertasGlobais.includes('LOTES_COM_TITULAR_OU_PEDIDO_INEXISTENTE'));
  assert.ok(suspeita.json.alertasGlobais.includes('ACEITES_SEM_LOTE_CONSISTENTE'));
  assert.equal(JSON.stringify(suspeita.json).includes('titular-forjado-lab'),false);
 }finally{
  db.exec('ROLLBACK TO teste_integridade_auditoria');
  db.exec('RELEASE teste_integridade_auditoria');
 }
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 // O primeiro painel exibia somente os 50 pedidos mais recentes. A partir
 // desta etapa a navegação deve percorrer TODOS, com contadores por página.
 const segundo=await call('/staging/vitrine/loja/pedidos',{
  method:'POST',cookie,csrf,key:'segundo-pedido-sandbox-auditoria-2026',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
 });
 assert.equal(segundo.status,201,JSON.stringify(segundo.json));
 const vistos=[];
 for(let offset=0;offset<2;offset++){
  const pagina=await call('/staging/escritorio-unificado/auditoria-cobertura?limite=1&offset='+offset,
   {admin:true});
  assert.equal(pagina.status,200,JSON.stringify(pagina.json));
  assert.equal(pagina.json.resumo.pedidosTotal,2);
  assert.equal(pagina.json.resumo.pedidosNaAmostra,1);
  assert.equal(pagina.json.escopoDosContadores,'PAGINA_ATUAL_NAO_TOTAL_GLOBAL');
  assert.equal(pagina.json.amostraParcial,true);
  assert.equal(pagina.json.paginacao.offset,offset);
  assert.equal(pagina.json.paginacao.totalDePedidos,2);
  assert.equal(pagina.json.paginacao.quantidadeNaPagina,1);
  assert.equal(pagina.json.paginacao.proximaPaginaOffset,offset===0?1:null);
  assert.equal(pagina.json.paginacao.paginaAnteriorOffset,offset===0?null:0);
  vistos.push(pagina.json.pedidos[0].prepedidoId);
 }
 assert.deepEqual(new Set(vistos),new Set([pedidoId,segundo.json.pedido.pedidoId]));
 const semPedidos=await call('/staging/escritorio-unificado/auditoria-cobertura?limite=1&offset=2',
  {admin:true});
 assert.equal(semPedidos.status,200);
 assert.equal(semPedidos.json.pedidos.length,0);
 assert.equal(semPedidos.json.paginacao.paginaVazia,true);
 for(const query of ['offset=-1','offset=1.5','offset=abc',
  'offset=1000000000000','limite=1&offset=1&intruso=sim']){
  const invalido=await call('/staging/escritorio-unificado/auditoria-cobertura?'+query,
   {admin:true});
  assert.equal(invalido.status,400,query);
 }
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
