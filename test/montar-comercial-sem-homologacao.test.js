'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal,COOKIE}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {montarComercialSemHomologacao,
 exigirChaveParaHistoricoComercial}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const {TesourariaModularEnsaioSQLite}=
 require('../src/producao/tesouraria-modular-ensaio-sqlite');
const {ObservacoesPSPEnsaioSQLite,
 consultarERegistrarObservacaoAsaasSandbox}=
 require('../src/producao/observacoes-psp-ensaio-sqlite');
const {ConciliacaoMultibancosEnsaioSQLite}=
 require('../src/producao/conciliacao-multibancos-ensaio-sqlite');
const DOC='Termos de conta fictícia para exercício sem provedor PSP, sem saques, '+
 'sem dinheiro e sem liberação comercial. Não há posição remunerada.';
const ORIGEM='https://contas.example.invalid';
const END={destinatario:'Pessoa Teste',cep:'27250010',
 logradouro:'Rua Teste',numero:'10',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};

async function preparar(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-comercial-bloqueado-'));
 const arquivo=path.join(dir,'clientes.sqlite');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const segredos={email:randomBytes(32),cifra:randomBytes(32),
  codigo:randomBytes(32),auditoria:randomBytes(32),
  pedidos:randomBytes(32)};
 const abrir=()=>{
  const db=new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000');
  const contas=new IdentidadeClienteLoopReal({
   banco:db,chaveEmail:segredos.email,chaveCifra:segredos.cifra,
   chaveCodigo:segredos.codigo,
   termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
   privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:DOC},
   enviarEmail:async()=>true
  });
  const auditoria=new AuditoriaOperacionalSQLite({
   banco:db,chaveAuditoria:segredos.auditoria
  });
  const manutencao=new ManutencaoComercialSQLite({banco:db,auditoria});
  const catalogo=new CatalogoMultiDistribuidoresSQLite({
   banco:db,distribuidorHomologado:()=>false,auditoria,manutencao
  });
  new ControleEconomicoLojaSQLite({banco:db,auditoria,manutencao});
  new SessaoAdminComercialSQLite({
   banco:db,chaveAdmin:randomBytes(32),
   credencialAdmin:'CredencialAdministrativaSomenteTeste2026!'
  });
  const motor=new MotorLoopIntegradoSQLite({banco:db});
  return {banco:db,contas,auditoria,manutencao,catalogo,motor};
 };
 let env=abrir();
 const docs=env.contas.documentos();
 const usuarios=[];
 for(let i=0;i<2;i++){
  const nick=i===0?'Alice':'Bruna';
  const r=await env.contas.cadastrar({
   nome:'Pessoa '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaDeEnsaio2026!',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  usuarios.push(r);
 }
 env.banco.prepare(
  'UPDATE loop_real_contas SET email_confirmado_em=?'
 ).run(Date.now());
 return {get env(){return env},set env(v){env=v},abrir,arquivo,
  segredos,usuarios,encerrar:()=>{env.banco.close();}};
}
function criarCotacao(titularId){
 return {cotacaoId:'COT_COMERCIAL_1',titularId,
  status:'APROVADA',cepDestino:END.cep,
  expiraEm:Date.now()+600000,
  fornecedorId:'distribuidorA',freteCentavos:1500,
  itens:[{sku:'SKU_LIVRO',precoUnitCentavos:25000,quantidade:1}]};
}
function pedidosDeEnsaio(x,extras={}){
 const cotacao=extras.cotacao||criarCotacao(x.usuarios[0].titularId);
 let status='PENDENTE';
 const pedidos=new PedidosComerciaisSQLite({
  banco:x.env.banco,chavePedidos:x.segredos.pedidos,
  classificacaoLoop:extras.classificacaoLoop,
  eventosComerciais:extras.eventosComerciais,
  consultarCotacaoConfiavel:async()=>cotacao,
  consultarPagamentoPsp:async({pedidoId})=>{
   const p=x.env.banco.prepare(
    'SELECT valor_total_centavos FROM loja_real_pedidos WHERE pedido_id=?'
   ).get(pedidoId);
   return {pedidoId,status,pagamentoId:'PSP_TESTE_1',
    valorCentavos:p.valor_total_centavos,moeda:'BRL'};
  }
 });
 return {pedidos,status:v=>{status=v},cotacao};
}
test('serviço sem PSP monta cores+eventos e lê pedido do titular após reinício',async t=>{
 const x=await preparar(t);
 t.after(()=>{try{x.encerrar();}catch{}});
 let env=x.env;
 const comercial=montarComercialSemHomologacao({
  banco:env.banco,chavePedidos:x.segredos.pedidos,
  auditoria:env.auditoria,manutencao:env.manutencao
 });
 assert.equal(comercial.pspHomologado,false);
 assert.equal(comercial.checkoutHabilitado,false);
 assert.equal(comercial.ativacaoPosicoesHabilitada,false);
 assert.equal(Object.hasOwn(comercial,'pedidosComerciais'),false);
 assert.equal(Object.isFrozen(comercial),true);
 const {classificacaoLoop,eventosComerciais}=comercial;
 env.catalogo.criarProduto({produtoId:'livro',titulo:'Livro PDF fictício'});
 env.catalogo.vincularOferta({produtoId:'livro',distribuidorId:'distribuidorA',
  sku:'SKU_LIVRO',precoUnitCentavos:25000});
 classificacaoLoop.configurarProduto({
  produtoId:'livro',cor:'VERDE',autorizado:true
 });
 const simulado=pedidosDeEnsaio(x,{classificacaoLoop,eventosComerciais});
 const pedido=await simulado.pedidos.criarPedido({
  titularId:x.usuarios[0].titularId,cotacaoId:simulado.cotacao.cotacaoId,
  chaveIdempotencia:'CARRINHO_1',enderecoEntrega:END
 });
 assert.equal(classificacaoLoop.avaliarPedido({
  pedidoId:pedido.pedidoId
 }).posicoesVerdesPrevistas,1);
 assert.equal(eventosComerciais.verificar().eventos,0);
 await assert.rejects(simulado.pedidos.confirmarPagamento({
  pedidoId:pedido.pedidoId
 }),{codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 simulado.status('CONFIRMADO');
 await simulado.pedidos.confirmarPagamento({pedidoId:pedido.pedidoId});
 assert.equal(eventosComerciais.verificar().pendentes,1);
 assert.equal(env.motor.verificar().compras,0);
 assert.equal(env.motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
 const app=criarAppIdentidadeLoop({
  contas:env.contas,motorLoop:env.motor,eventosComerciais,
  origemHttps:ORIGEM,permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/loop/eventos-comerciais')).status,401);
  for(let i=0;i<2;i++){
   const login=await env.contas.entrar({
    nick:i===0?'Alice':'Bruna',senha:'SenhaDeEnsaio2026!'
   });
   const h={Cookie:COOKIE+'='+login.token};
   const resp=await fetch(base+'/api/loop/eventos-comerciais',{headers:h});
   assert.equal(resp.status,200);
   const body=await resp.json();
   assert.equal(body.eventos.length,i===0?1:0);
   assert.equal(body.financeiroReal,false);
   if(i===0)assert.equal(body.eventos[0].pedidoId,pedido.pedidoId);
   assert.equal((await fetch(base+'/api/checkout/finalizar',{
    method:'POST',headers:{...h,Origin:ORIGEM}
   })).status,503);
   assert.equal((await fetch(base+'/api/loop/eventos-comerciais',{
    method:'POST',headers:{...h,Origin:ORIGEM}
   })).status,404);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
 x.encerrar();
 x.env=x.abrir();
 env=x.env;
 const reaberto=montarComercialSemHomologacao({
  banco:env.banco,chavePedidos:x.segredos.pedidos,
  auditoria:env.auditoria,manutencao:env.manutencao
 });
 assert.equal(reaberto.eventosComerciais.verificar().pendentes,1);
 assert.equal(reaberto.classificacaoLoop.avaliarPedido({
  pedidoId:pedido.pedidoId
 }).posicoesVerdesPrevistas,1);
 assert.equal(env.motor.verificar().compras,0);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
test('comercial não inicia com pedido já pago sem evento no mesmo banco',async t=>{
 const x=await preparar(t);
 t.after(()=>{try{x.encerrar();}catch{}});
 const env=x.env;
 const ponte=montarComercialSemHomologacao({
  banco:env.banco,chavePedidos:x.segredos.pedidos,
  auditoria:env.auditoria,manutencao:env.manutencao
 });
 env.catalogo.criarProduto({produtoId:'livro',titulo:'Livro fictício'});
 env.catalogo.vincularOferta({
  produtoId:'livro',distribuidorId:'distribuidorA',
  sku:'SKU_LIVRO',precoUnitCentavos:25000
 });
 ponte.classificacaoLoop.configurarProduto({
  produtoId:'livro',cor:'VERDE',autorizado:true
 });
 const xpedido=pedidosDeEnsaio(x,{
  classificacaoLoop:ponte.classificacaoLoop
  // Falha proposital: legacy não alimenta eventos.
 });
 const p=await xpedido.pedidos.criarPedido({
  titularId:x.usuarios[0].titularId,cotacaoId:xpedido.cotacao.cotacaoId,
  chaveIdempotencia:'CARRINHO_1',enderecoEntrega:END
 });
 xpedido.status('CONFIRMADO');
 await xpedido.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(ponte.eventosComerciais.verificar().pedidosAprovadosSemEvento,1);
 assert.throws(()=>montarComercialSemHomologacao({
  banco:env.banco,chavePedidos:x.segredos.pedidos,
  auditoria:env.auditoria,manutencao:env.manutencao
 }),{codigo:'COMERCIAL_SEGURO_AUDITORIA_DIVERGENTE'});
 assert.equal(env.motor.consultar().posicoesReais,0);
});

test('reinício com pedidos existentes e sem chave comercial falha fechado',async t=>{
 const x=await preparar(t);
 t.after(()=>{try{x.encerrar();}catch{}});
 const y=x.env;
 assert.equal(exigirChaveParaHistoricoComercial({
  banco:y.banco,chavePedidos:null
 }).historicoComercialAutorizado,false);
 const ponte=montarComercialSemHomologacao({
  banco:y.banco,chavePedidos:x.segredos.pedidos,
  auditoria:y.auditoria,manutencao:y.manutencao
 });
 y.catalogo.criarProduto({produtoId:'livro',titulo:'Livro fictício'});
 y.catalogo.vincularOferta({produtoId:'livro',distribuidorId:'distribuidorA',
  sku:'SKU_LIVRO',precoUnitCentavos:25000});
 ponte.classificacaoLoop.configurarProduto({
  produtoId:'livro',cor:'VERDE',autorizado:true
 });
 const simulado=pedidosDeEnsaio(x,{
  classificacaoLoop:ponte.classificacaoLoop,eventosComerciais:ponte.eventosComerciais
 });
 const p=await simulado.pedidos.criarPedido({
  titularId:x.usuarios[0].titularId,cotacaoId:simulado.cotacao.cotacaoId,
  chaveIdempotencia:'TESTE_1',enderecoEntrega:END
 });
 assert.equal(p.status,'AGUARDANDO_PAGAMENTO');
 assert.throws(()=>exigirChaveParaHistoricoComercial({
  banco:y.banco,chavePedidos:null
 }),{codigo:'COMERCIAL_SEGURO_CHAVE_PEDIDOS_AUSENTE_COM_DADOS'});
 assert.equal(exigirChaveParaHistoricoComercial({
  banco:y.banco,chavePedidos:x.segredos.pedidos
 }).historicoComercialAutorizado,true);
 assert.equal(y.motor.consultar().posicoesReais,0);
});

test('cinco missoes integradas: distribuir, sacar, abastecer, trocar e restaurar sem Pix real',async t=>{
 const x=await preparar(t);
 t.after(()=>{try{x.encerrar();}catch{}});
 const env=x.env;
 const ponte=montarComercialSemHomologacao({
  banco:env.banco,chavePedidos:x.segredos.pedidos,
  auditoria:env.auditoria,manutencao:env.manutencao
 });
 env.catalogo.criarProduto({produtoId:'livro',titulo:'Livro de Ensaio'});
 env.catalogo.vincularOferta({
  produtoId:'livro',distribuidorId:'distribuidorA',
  sku:'SKU_LIVRO',precoUnitCentavos:50000
 });
 ponte.classificacaoLoop.configurarProduto({
  produtoId:'livro',cor:'VERDE',autorizado:true
 });
 const cotacao=criarCotacao(x.usuarios[0].titularId);
 cotacao.itens=[{sku:'SKU_LIVRO',precoUnitCentavos:50000,quantidade:1}];
 const sim=pedidosDeEnsaio(x,{
  cotacao,classificacaoLoop:ponte.classificacaoLoop,
  eventosComerciais:ponte.eventosComerciais
 });
 const novo=await sim.pedidos.criarPedido({
  titularId:x.usuarios[0].titularId,cotacaoId:cotacao.cotacaoId,
  chaveIdempotencia:'TESOURARIA_01',enderecoEntrega:END
 });
 sim.status('CONFIRMADO');
 await sim.pedidos.confirmarPagamento({pedidoId:novo.pedidoId});
 assert.equal(ponte.eventosComerciais.verificar().pendentes,1);
 const teso=new TesourariaModularEnsaioSQLite({banco:env.banco});
 let troca;
 for(const [papel,provedorDestino] of [
  ['CAPTACAO','CELCOIN'],['DISTRIBUICAO','CELCOIN'],
  ['EXECUTOR_SAQUE','ASAAS'],['CUSTODIA_COFRES','BANCO_3']
 ])troca=teso.trocarRotaEnsaio({
  papel,provedorDestino,motivo:'CONFIGURACAO_INICIAL'
 });
 assert.equal(troca.revisao,5);
 const foto={
  totalBrutoCotadoCentavos:51500,
  referenciaLoopPrevistaCentavos:25000,
  quantidadePosicoesPlanejadas:1,
  custoFornecedorPrevistoCentavos:17000,fretePrevistoCentavos:1500,
  tarifaPspPrevistaCentavos:500,reservaTributariaEstimadaCentavos:1000,
  custosCompletos:true,itens:[]
 };
 const receber=()=>teso.registrarRecebimentoEnsaio({
  pedidoId:novo.pedidoId,liquidacaoId:'LIQUIDACAO_FICTICIA_01',
  fotografia:foto,tarifaEnsaioCentavos:500,planoRevisao:5
 });
 assert.equal(receber().registrado,true);
 assert.equal(receber().repetido,true);
 assert.throws(()=>teso.registrarRecebimentoEnsaio({
  pedidoId:novo.pedidoId,liquidacaoId:'LIQUIDACAO_OUTRA',
  fotografia:foto,tarifaEnsaioCentavos:500,planoRevisao:5
 }),{codigo:'TESOURARIA_ENSAIO_REPLAY_DIVERGENTE'});
 assert.equal(env.banco.prepare(
  "SELECT centavos FROM loop_lab_tesouraria_saldos WHERE conta='LOOP:INTER'"
 ).get().centavos,25000);
 assert.equal(env.banco.prepare(
  "SELECT centavos FROM loop_lab_tesouraria_saldos WHERE conta='LOJA:MERCADO_PAGO'"
 ).get().centavos,6500);
 assert.equal(env.banco.prepare(
  "SELECT centavos FROM loop_lab_tesouraria_saldos WHERE conta='PSP:CELCOIN'"
 ).get().centavos,19500);
 assert.equal(teso.verificar().integridade,'OK');
 const titular=x.usuarios[0].titularId;
 assert.equal(teso.registrarCreditoEnsaio({
  titularId:titular,creditoId:'DIREITO_MANUAL_TESTE_01',valorCentavos:12000
 }).registrado,true);
 assert.equal(teso.registrarCreditoEnsaio({
  titularId:titular,creditoId:'DIREITO_MANUAL_TESTE_01',valorCentavos:12000
 }).registrado,false);
 assert.throws(()=>teso.registrarCreditoEnsaio({
  titularId:x.usuarios[1].titularId,
  creditoId:'DIREITO_INSUFICIENTE',valorCentavos:15000
 }),{codigo:'TESOURARIA_ENSAIO_COBERTURA_INSUFICIENTE'});
 // A solicitacao parte do MESMO Escritorio Virtual, com sessao e CSRF.
 // O operador so injeta CREDITOS FICTICIOS no banco de ensaio; a API HTTP
 // nao oferece nem creditos, nem transferencias, nem Pix bancario.
 const appFinanceiro=criarAppIdentidadeLoop({
  contas:env.contas,motorLoop:env.motor,
  eventosComerciais:ponte.eventosComerciais,
  tesourariaEnsaio:teso,origemHttps:ORIGEM,permitirCadastro:true
 });
 const servidorFinanceiro=appFinanceiro.listen(0,'127.0.0.1');
 await once(servidorFinanceiro,'listening');
 const baseFinanceiro='http://127.0.0.1:'+servidorFinanceiro.address().port;
 const solicitarApi=async(path,opts={})=>fetch(baseFinanceiro+path,opts);
 try{
  const login=await solicitarApi('/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick:'Alice',senha:'SenhaDeEnsaio2026!'})
  });
  assert.equal(login.status,200);
  const sessao=await login.json();
  assert.equal(sessao.tesourariaEnsaioAtiva,true);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await solicitarApi('/api/loop/tesouraria-ensaio')).status,401);
  assert.equal((await solicitarApi('/api/loop/tesouraria-ensaio',{
   headers:{Cookie:cookie}
  })).status,200);
  assert.equal((await solicitarApi('/api/saques/solicitar',{
   method:'POST',headers:{Cookie:cookie,Origin:ORIGEM}
  })).status,503);
  const dados={saqueId:'SAQUE_FICTICIO_01',
   chaveIdempotencia:'CLIENTE_UMA_VEZ',valorCentavos:5000};
  assert.equal((await solicitarApi('/api/loop/tesouraria-ensaio/saques',{
   method:'POST',
   headers:{Origin:ORIGEM,Cookie:cookie,'Content-Type':'application/json'},
   body:JSON.stringify(dados)
  })).status,403);
  assert.equal((await solicitarApi('/api/loop/tesouraria-ensaio/saques',{
   method:'POST',
   headers:{Origin:ORIGEM,Cookie:cookie,'Content-Type':'application/json',
    'X-Loop-Csrf':sessao.csrf},
   body:JSON.stringify({...dados,titularId:x.usuarios[1].titularId})
  })).status,400);
  const aprovado=await solicitarApi('/api/loop/tesouraria-ensaio/saques',{
   method:'POST',headers:{Origin:ORIGEM,Cookie:cookie,
    'Content-Type':'application/json','X-Loop-Csrf':sessao.csrf},
   body:JSON.stringify(dados)
  });
  assert.equal(aprovado.status,200);
  assert.equal((await aprovado.json()).estado,'RESERVADO');
  const repetir=await solicitarApi('/api/loop/tesouraria-ensaio/saques',{
   method:'POST',headers:{Origin:ORIGEM,Cookie:cookie,
    'Content-Type':'application/json','X-Loop-Csrf':sessao.csrf},
   body:JSON.stringify(dados)
  });
  assert.equal((await repetir.json()).repetido,true);
  const outro=await solicitarApi('/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick:'Bruna',senha:'SenhaDeEnsaio2026!'})
  });
  assert.equal(outro.status,200);
  const cookieOutro=outro.headers.get('set-cookie').split(';')[0];
  const vistaOutro=await solicitarApi('/api/loop/tesouraria-ensaio',{
   headers:{Cookie:cookieOutro}
  });
  assert.equal((await vistaOutro.json()).saldoFicticioDisponivelCentavos,0);
 }finally{
  await new Promise(resolve=>servidorFinanceiro.close(resolve));
 }
 const saque=()=>teso.solicitarSaqueEnsaio({
  titularId:titular,saqueId:'SAQUE_FICTICIO_01',
  chaveIdempotencia:'CLIENTE_UMA_VEZ',valorCentavos:5000
 });
 assert.equal(saque().estado,'RESERVADO');
 assert.equal(saque().repetido,true);
 assert.throws(()=>teso.solicitarSaqueEnsaio({
  titularId:titular,saqueId:'SAQUE_FICTICIO_02',
  chaveIdempotencia:'CLIENTE_UMA_VEZ',valorCentavos:5000
 }),{codigo:'TESOURARIA_ENSAIO_SAQUE_REPLAY_DIVERGENTE'});
 assert.equal(teso.iniciarAbastecimentoEnsaio({
  saqueId:'SAQUE_FICTICIO_01',transferenciaId:'TRANSF_FICTICIA_01'
 }).estado,'INDETERMINADA');
 assert.equal(teso.iniciarAbastecimentoEnsaio({
  saqueId:'SAQUE_FICTICIO_01',transferenciaId:'TRANSF_FICTICIA_01'
 }).repetido,true);
 assert.throws(()=>teso.iniciarAbastecimentoEnsaio({
  saqueId:'SAQUE_FICTICIO_01',transferenciaId:'TRANSF_FICTICIA_DUPLA'
 }),{codigo:'TESOURARIA_ENSAIO_TRANSFERENCIA_DUPLA_BLOQUEADA'});
 assert.throws(()=>teso.trocarRotaEnsaio({
  papel:'CUSTODIA_LOOP',provedorDestino:'BANCO_2',
  motivo:'INCIDENTE_EM_ABERTO'
 }),{codigo:'TESOURARIA_ENSAIO_TROCA_COM_OPERACOES_PENDENTES'});
 assert.equal(teso.conciliarAbastecimentoEnsaio({
  transferenciaId:'TRANSF_FICTICIA_01',resultado:'INDETERMINADA'
 }).aguardandoConsulta,true);
 assert.equal(teso.conciliarAbastecimentoEnsaio({
  transferenciaId:'TRANSF_FICTICIA_01',resultado:'CONFIRMADA'
 }).estado,'CONFIRMADA');
 assert.equal(teso.enviarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_FICTICIO_01'
 }).estado,'PIX_INDETERMINADO');
 assert.throws(()=>teso.enviarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_DUPLICADO'
 }),{codigo:'TESOURARIA_ENSAIO_PIX_DUPLO_BLOQUEADO'});
 assert.equal(teso.conciliarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_FICTICIO_01',
  resultado:'INDETERMINADA'
 }).aguardandoConsulta,true);
 assert.equal(teso.conciliarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_FICTICIO_01',
  resultado:'CONFIRMADA'
 }).pagoSomenteNoEnsaio,true);
 assert.equal(teso.conciliarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_FICTICIO_01',
  resultado:'CONFIRMADA'
 }).repetido,true);
 assert.throws(()=>teso.conciliarPixEnsaio({
  saqueId:'SAQUE_FICTICIO_01',tentativaId:'PIX_FICTICIO_01',
  resultado:'FALHOU'
 }),{codigo:'TESOURARIA_ENSAIO_PIX_PROVA_CONTRADITORIA'});
 assert.equal(teso.consultarTitularEnsaio({
  titularId:titular
 }).saldoFicticioDisponivelCentavos,7000);
 assert.equal(teso.consultarTitularEnsaio({
  titularId:x.usuarios[1].titularId
 }).saques.length,0);
 // Mesmo com dois bancos habilitados, migracao exige comando separado,
 // prova de destino e espera: uma troca de nome nao cria dinheiro.
 assert.equal(teso.iniciarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',bancoOrigem:'INTER',
  bancoDestino:'BANCO_2',valorCentavos:10000
 }).estado,'INDETERMINADA');
 assert.equal(teso.iniciarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',bancoOrigem:'INTER',
  bancoDestino:'BANCO_2',valorCentavos:10000
 }).repetido,true);
 assert.throws(()=>teso.trocarRotaEnsaio({
  papel:'CUSTODIA_LOOP',provedorDestino:'BANCO_2',
  motivo:'CONTINGENCIA_BLOQUEADA'
 }),{codigo:'TESOURARIA_ENSAIO_TROCA_COM_MIGRACAO_PENDENTE'});
 assert.equal(teso.conciliarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',resultado:'INDETERMINADA'
 }).aguardandoConsulta,true);
 assert.equal(teso.conciliarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',resultado:'CONFIRMADA'
 }).estado,'CONFIRMADA');
 assert.equal(teso.conciliarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',resultado:'CONFIRMADA'
 }).repetido,true);
 assert.throws(()=>teso.conciliarMigracaoCustodiaEnsaio({
  migracaoId:'MIG_LAB_01',resultado:'DEVOLVIDA'
 }),{codigo:'TESOURARIA_ENSAIO_MIGRACAO_PROVA_CONTRADITORIA'});
 assert.equal(env.banco.prepare(
  "SELECT centavos FROM loop_lab_tesouraria_saldos WHERE conta='LOOP:BANCO_2'"
 ).get().centavos,10000);
 const alternativo=teso.trocarRotaEnsaio({
  papel:'CUSTODIA_LOOP',provedorDestino:'BANCO_2',
  motivo:'ROTACAO_SEM_PENDENCIAS'
 });
 assert.equal(alternativo.revisao,6);
 assert.equal(alternativo.saldoMigradoAutomaticamente,false);
 assert.equal(alternativo.saldoAnteriorSimuladoCentavos,10000);
 assert.equal(teso.plano().rotas.CUSTODIA_LOOP,'BANCO_2');
 const volta=teso.trocarRotaEnsaio({
  papel:'CUSTODIA_LOOP',provedorDestino:'INTER',motivo:'ROTACAO_PROGRAMADA'
 });
 assert.equal(volta.revisao,7);
 assert.equal(teso.verificar().saques,1);
 // Reconsulta PSP só observa estado, nunca confunde GET com saldo real.
 const comprovante=env.banco.prepare(
  'SELECT pagamento_id FROM loja_real_pedidos WHERE pedido_id=?'
 ).get(novo.pedidoId).pagamento_id;
 const caixa=teso.observacoesPsp;
 assert.equal(caixa.registrarCompromisso({
  tipo:'COBRANCA',referencia:comprovante,operacaoId:novo.pedidoId,
  valorCentavos:51500
 }).registrado,true);
 assert.equal(caixa.registrarCompromisso({
  tipo:'COBRANCA',referencia:comprovante,operacaoId:novo.pedidoId,
  valorCentavos:51500
 }).repetido,true);
 assert.equal(caixa.registrarCompromisso({
  tipo:'PIX',referencia:'PIX_FICTICIO_01',
  operacaoId:'SAQUE_FICTICIO_01',valorCentavos:5000
 }).registrado,true);
 const fakeAsaas={
  consultarCobranca:async pagamentoId=>({
   origem:'ASAAS_SANDBOX',pagamentoId,
   estadoObservado:'RECEIVED',valorFicticioCentavos:51500,
   autorizaPosicao:false,autorizaPedidoReal:false
  }),
  consultarPix:async transferenciaId=>({
   origem:'ASAAS_SANDBOX',transferenciaId,
   estado:'CONCLUIDO_NO_SANDBOX',valorFicticioCentavos:5000,
   comprovanteRealConciliado:false,saqueRealPago:false,
   podeReenviarAutomaticamente:false
  })
 };
 const consultar=({tipo,referencia,observacaoId})=>
  consultarERegistrarObservacaoAsaasSandbox({
   caixa,adaptador:fakeAsaas,tipo,referencia,observacaoId
  });
 assert.equal((await consultar({
  tipo:'COBRANCA',referencia:comprovante,
  observacaoId:'OBS_PSP_TESTE_01'
 })).estado,'PSP_SANDBOX_SINALIZOU_RECEBIMENTO');
 assert.equal((await consultar({
  tipo:'COBRANCA',referencia:comprovante,
  observacaoId:'OBS_PSP_TESTE_01'
 })).repetido,true);
 assert.equal((await consultar({
  tipo:'PIX',referencia:'PIX_FICTICIO_01',
  observacaoId:'OBS_PIX_TESTE_01'
 })).estado,'CONFIRMACAO_SOMENTE_SANDBOX');
 assert.equal(caixa.verificar().observacoes,2);
 const bancos=teso.conciliacaoBancaria;
 const testeBanco=({evidenciaId,banco,conta,movimentoId,tipo,valorCentavos})=>
  bancos.registrarExtratoDeclarado({evidenciaId,banco,conta,movimentoId,
   tipo,valorCentavos});
 assert.equal(testeBanco({
  evidenciaId:'EXTRATO_INTER_01',banco:'INTER',conta:'LOOP:INTER',
  movimentoId:'LOOP_'+novo.pedidoId,tipo:'CREDITO',valorCentavos:25000
 }).registrado,true);
 assert.equal(testeBanco({
  evidenciaId:'EXTRATO_MP_01',banco:'MERCADO_PAGO',conta:'LOJA:MERCADO_PAGO',
  movimentoId:'LOJA_'+novo.pedidoId,tipo:'CREDITO',valorCentavos:6500
 }).registrado,true);
 assert.equal(bancos.verificar().totalEvidencias,2);
 assert.equal(bancos.analisar().conciliacaoRealCertificada,false);
 assert.equal(bancos.analisar().movimentosComDeclaracoesConcordantes>=2,true);
 const convergencia=teso.diagnosticarConvergenciaExternaEnsaio();
 assert.equal(convergencia.integridadeInterna,'OK');
 assert.equal(convergencia.recebimentosFicticios,1);
 assert.equal(convergencia.divergenciasPorCodigo
  .PSP_ORIGEM_NAO_CORRESPONDE_A_OBSERVACAO,1);
 assert.equal(convergencia.conciliacaoRealCertificada,false);
 assert.equal(convergencia.saquesReaisLiberados,false);
 assert.equal(caixa.consultarCompromisso({
  tipo:'PIX',referencia:'PIX_FICTICIO_01'
 }).pagamentoRealHabilitado,false);
 assert.equal(caixa.consultarCompromisso({
  tipo:'COBRANCA',referencia:comprovante
 }).reenviarAutomaticamente,false);
 await assert.rejects(consultarERegistrarObservacaoAsaasSandbox({
  caixa,adaptador:{
   consultarPix:async()=>{throw Error('TIMEOUT_FICTICIO');}
  },tipo:'PIX',referencia:'PIX_FICTICIO_01',
  observacaoId:'OBS_PIX_TIMEOUT_02'
 }),/TIMEOUT_FICTICIO/);
 assert.equal(caixa.verificar().observacoes,2);
 assert.throws(()=>caixa.registrarObservacao({
  observacaoId:'OBS_PSP_TESTE_01',tipo:'PIX',
  referencia:'PIX_FICTICIO_01',
  observado:{origem:'ASAAS_SANDBOX',transferenciaId:'PIX_FICTICIO_01',
   estado:'CONCLUIDO_NO_SANDBOX',valorFicticioCentavos:5000,
   comprovanteRealConciliado:false,saqueRealPago:false,
   podeReenviarAutomaticamente:false}
 }),{codigo:'OBSERVACOES_ENSAIO_OBSERVACAO_REPLAY_DIVERGENTE'});
 assert.equal(env.motor.consultar().posicoesReais,0);
 assert.equal(env.motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
 const arqBackup=x.arquivo.replace(/\.sqlite$/,'.looprealbak'),
  arqRestaurado=x.arquivo.replace(/\.sqlite$/,'-restaurado.sqlite');
 const chaveBackup=randomBytes(32);
 const backup=await criarBackupIdentidadeReal({
  origem:x.arquivo,destino:arqBackup,
  chaveBackup,autorizado:true
 });
 assert.equal(backup.integridadeSQLite,'ok');
 const restauro=await restaurarBackupIdentidadeReal({
  origem:arqBackup,destino:arqRestaurado,
  chaveBackup,autorizado:true
 });
 assert.equal(restauro.integridadeSQLite,'ok');
 assert.equal(validarIdentidade(arqRestaurado).integridade,'ok');
 const db2=new DatabaseSync(arqRestaurado,{readOnly:true});
 try{
  const rel=Object.create(TesourariaModularEnsaioSQLite.prototype);
  rel.db=db2;
  assert.equal(rel.verificar().integridade,'OK');
  assert.equal(rel.verificar().saques,1);
  assert.equal(rel.plano().revisao,7);
  assert.equal(rel.verificar().integridade,'OK');
  const recuperado=Object.create(ObservacoesPSPEnsaioSQLite.prototype);
  recuperado.db=db2;
  assert.equal(recuperado.verificar().observacoes,2);
  const extratosRestaurados=Object.create(
   ConciliacaoMultibancosEnsaioSQLite.prototype);
  extratosRestaurados.db=db2;
  assert.equal(extratosRestaurados.verificar().totalEvidencias,2);
  assert.equal(extratosRestaurados.analisar()
   .movimentosComDeclaracoesConcordantes>=2,true);
  assert.equal(extratosRestaurados.analisar().conciliacaoRealCertificada,false);
  assert.equal(recuperado.consultarCompromisso({
   tipo:'PIX',referencia:'PIX_FICTICIO_01'
  }).pagamentoRealHabilitado,false);
  assert.equal(rel.consultarTitularEnsaio({
   titularId:titular
  }).saldoFicticioDisponivelCentavos,7000);
 }finally{db2.close();}
});
