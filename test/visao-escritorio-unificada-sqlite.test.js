'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {VisaoEscritorioUnificadaSQLite}=
 require('../src/producao/visao-escritorio-unificada-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://contas.example.invalid';
const SENHA='SenhaDeEnsaioReal2026!';
const DOC='Termos para teste do Escritório Virtual, posições, filas e rede. '+
 'Nenhum recebimento financeiro, ganho, comissao ou saque real existe no ensaio.';
async function fixture(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco});
 const docs=contas.documentos();
 async function cadastrar(nick,indicadorNick=null){
  return contas.cadastrar({
   nome:'Pessoa de Ensaio',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:SENHA,aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash,
   ...(indicadorNick?{indicadorNick}:{})
  });
 }
 const ana=await cadastrar('Ana'),bia=await cadastrar('Bia','Ana'),
  caio=await cadastrar('Caio','Ana'),vera=await cadastrar('Vera');
 motor.registrarCompraEnsaio({titularId:ana.titularId,pedidoId:'pedido-ana'});
 motor.registrarCompraEnsaio({titularId:bia.titularId,pedidoId:'pedido-bia'});
 motor.registrarCompraEnsaio({titularId:vera.titularId,pedidoId:'pedido-vera'});
 motor.registrarIndicacaoEnsaio({
  indicadorId:ana.titularId,indicadoId:bia.titularId,
  posicaoId:1,pedidoIndicado:'pedido-bia',eventoId:'convite-bia'
 });
 const visao=new VisaoEscritorioUnificadaSQLite({banco,motor});
 return {banco,contas,motor,visao,ana,bia,caio,vera};
}
test('Uma leitura une posição, compra, fila e indicação do mesmo titular sem remuneração',async t=>{
 const x=await fixture(t);
 const estado=x.visao.consultarEstado({titularId:x.ana.titularId});
 assert.equal(estado.fonte,'IDENTIDADE_E_MOTOR_MESMO_SQLITE');
 assert.equal(estado.minhasPosicoesAtivasEmEnsaio,1);
 assert.equal(estado.minhasPosicoes[0].numero,1);
 assert.equal(estado.minhasPosicoes[0].pedidoDeOrigemEnsaio,'pedido-ana');
 assert.equal(estado.minhasPosicoes[0].indicacoesQualificadasEnsaio,1);
 assert.equal(estado.minhasPosicoes[0].posicaoRemuneradaReal,false);
 assert.equal(estado.redeResumo.cadastros,2);
 assert.equal(estado.redeResumo.comprasEmEnsaio,1);
 assert.equal(estado.redeResumo.qualificadasEmEnsaio,1);
 assert.equal(estado.redeResumo.cadastrosAguardandoCompra,1);
 assert.equal(estado.catracaClientePodeGirar,false);
 assert.equal(estado.financeiroReal,false);
 assert.equal(x.visao.consultarEstado({
  titularId:x.vera.titularId
 }).minhasPosicoes[0].pedidoDeOrigemEnsaio,'pedido-vera');
 assert.equal(x.visao.listarRede({titularId:x.ana.titularId}).indicados
  .map(x=>x.estado).join(','),
  'QUALIFICACAO_ENSAIO,CADASTRO_AGUARDANDO_COMPRA');
 assert.equal(x.visao.listarRede({titularId:x.ana.titularId})
  .remuneracoesConfirmadas,0);
 assert.equal(x.visao.listarRede({
  titularId:x.ana.titularId,limite:1
 }).temMais,true);
 assert.throws(()=>x.visao.listarRede({
  titularId:x.ana.titularId,offset:-1
 }),{codigo:'ESCRITORIO_PAGINACAO_INVALIDA'});
 assert.equal(x.motor.verificar().integridade,'OK');
});
test('HTTP mesmo Escritório: sessão de outra conta não lê pedidos ou equipe alheios',async t=>{
 const x=await fixture(t);
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,permitirCadastro:true,
  origemHttps:ORIGEM
 });
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 assert.equal((await fetch(base+'/api/loop/estado')).status,401);
 assert.equal((await fetch(base+'/api/contas/minha-rede')).status,401);
 const cookies=[];
 for(const nick of ['Ana','Vera']){
  const login=await fetch(base+'/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:SENHA})
  });
  assert.equal(login.status,200);
  cookies.push(login.headers.get('set-cookie').split(';')[0]);
 }
 const own=await (await fetch(base+'/api/loop/estado',{
  headers:{Cookie:cookies[0]}
 })).json();
 const another=await (await fetch(
  base+'/api/loop/estado?titularId='+encodeURIComponent(x.ana.titularId),{
   headers:{Cookie:cookies[1]}
  })).json();
 assert.equal(own.minhasPosicoes[0].pedidoDeOrigemEnsaio,'pedido-ana');
 assert.equal(another.minhasPosicoes[0].pedidoDeOrigemEnsaio,'pedido-vera');
 assert.equal(another.redeResumo.cadastros,0);
 assert.equal(JSON.stringify(another).includes('pedido-ana'),false);
 const lista=await (await fetch(base+'/api/contas/minha-rede',{
  headers:{Cookie:cookies[0]}
 })).json();
 assert.equal(lista.total,2);
 assert.deepEqual(lista.indicados.map(i=>i.nick),['bia','caio']);
 assert.equal(lista.resumo.qualificadasEmEnsaio,1);
 assert.equal(lista.indicados[0].posicaoDestinoEnsaio,1);
 const vazia=await (await fetch(base+'/api/contas/minha-rede',{
  headers:{Cookie:cookies[1]}
 })).json();
 assert.equal(vazia.total,0);
 assert.equal(JSON.stringify(vazia).includes('bia'),false);
 assert.equal((await fetch(base+'/api/loop/registrar-compra',{
  method:'POST',headers:{Cookie:cookies[0],Origin:ORIGEM,
   'Content-Type':'application/json'},
  body:JSON.stringify({pedidoId:'forjado'})
 })).status,404);
 assert.equal((await fetch(base+'/api/loop/controlar-catraca',{
  method:'POST',headers:{Cookie:cookies[0],Origin:ORIGEM,
   'Content-Type':'application/json'},
  body:JSON.stringify({acao:'GIRAR'})
 })).status,404);
 assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
});
test('não montar projeção em banco diferente ou sem cliente; nenhuma posição inventada',async t=>{
 const x=await fixture(t);
 const outro=new DatabaseSync(':memory:');
 t.after(()=>outro.close());
 assert.throws(()=>new VisaoEscritorioUnificadaSQLite({
  banco:outro,motor:x.motor
 }),{codigo:'ESCRITORIO_UNIFICADO_EXIGE_MESMO_SQLITE'});
 assert.throws(()=>criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:{
   banco:outro,consultar:()=>({}),verificar:()=>({})
  },origemHttps:ORIGEM
 }),/LOOP_MOTOR_INTERNO_INVALIDO/);
 const vazio=x.visao.consultarEstado({titularId:x.caio.titularId});
 assert.equal(vazio.minhasPosicoesAtivasEmEnsaio,0);
 assert.equal(vazio.posicoesReais,0);
});


test('tabuleiro, seis eventos e giro pertencem ao mesmo motor consultado no Escritorio',async t=>{
 const x=await fixture(t);
 for(let i=1;i<=5;i++)
  x.motor.registrarCompraEnsaio({
   titularId:x.vera.titularId,
   pedidoId:'pedido-extra-'+i
  });
 x.motor.prepararTabuleiroEnsaio();
 const pedidos=['pedido-ana','pedido-bia','pedido-vera',
  'pedido-extra-1','pedido-extra-2','pedido-extra-3'];
 for(const [i,pedidoId] of pedidos.entries()){
  const r=x.motor.registrarEventoEnsaio({pedidoId});
  assert.equal(r.eventosNoCiclo,i+1);
 }
 const antes=x.visao.consultarEstado({titularId:x.ana.titularId});
 assert.equal(antes.tabuleiro.eventosNoCiclo,6);
 assert.equal(antes.tabuleiro.vagas.length,6);
 assert.equal(antes.eventosPorCiclo,6);
 assert.equal(antes.catracaClientePodeGirar,false);
 assert.equal(antes.posicoesReais,0);
 x.motor.controlarCatracaEnsaio({acao:'ABRIR'});
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 const depois=x.visao.consultarEstado({titularId:x.ana.titularId});
 assert.equal(depois.catraca.giros,1);
 assert.equal(depois.tabuleiro.eventosNoCiclo,0);
 assert.equal(depois.somenteLeitura,true);
 assert.equal(depois.financeiroReal,false);
 assert.equal(x.motor.verificar().giros,1);
});
