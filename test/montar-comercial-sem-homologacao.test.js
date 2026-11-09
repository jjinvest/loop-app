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
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {montarComercialSemHomologacao}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {validarIdentidade}=
 require('../src/producao/backup-identidade-real');
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
 const cotacao=criarCotacao(x.usuarios[0].titularId);
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
