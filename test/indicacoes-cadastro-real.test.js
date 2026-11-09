'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const DOC='Termos fictícios para testar vínculos de convites, sem compras reais, '+
 'sem ganhos, sem pagamentos e sem promessa de bonificação.';
const ORIGEM='https://contas.example.invalid';
function preparar(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco});
 const docs=contas.documentos();
 async function cadastrar(nick,indicadorNick=null){
  return contas.cadastrar({nome:'Pessoa de Ensaio',nick,
   email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaExemplo2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash,
   ...(indicadorNick?{indicadorNick}:{})
  });
 }
 return {banco,contas,motor,cadastrar,docs};
}
test('convite é atribuído uma vez, sem autoindicação nem indicação forjada',async t=>{
 const x=preparar();
 t.after(()=>x.banco.close());
 await assert.rejects(x.cadastrar('Bravo','Desconhecido'),{
  codigo:'INDICADOR_NAO_ENCONTRADO'
 });
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_contas'
 ).get().n,0);
 const a=await x.cadastrar('Alpha');
 await assert.rejects(x.cadastrar('AlphaB','AlphaB'),{
  codigo:'AUTOINDICACAO_PROIBIDA'
 });
 const b=await x.cadastrar('Bravo','Alpha');
 const c=await x.cadastrar('Charlie');
 assert.equal(b.vinculoCadastro,true);
 assert.equal(x.contas.listarIndicados(a.titularId).total,1);
 assert.equal(x.contas.listarIndicados(c.titularId).total,0);
 assert.deepEqual(x.contas.listarIndicados(a.titularId).indicados.map(v=>v.nick),
  ['bravo']);
 const vinculo=x.banco.prepare(
  'SELECT indicado_id,indicador_id FROM loop_real_vinculos_indicacao'
 ).get();
 assert.equal(vinculo.indicado_id,b.titularId);
 assert.equal(vinculo.indicador_id,a.titularId);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loop_real_vinculos_indicacao SET indicador_id=? WHERE indicado_id=?'
 ).run(c.titularId,b.titularId),/imutavel/);
 x.motor.registrarCompraEnsaio({
  titularId:a.titularId,pedidoId:'pedido-a'
 });
 x.motor.registrarCompraEnsaio({
  titularId:b.titularId,pedidoId:'pedido-b'
 });
 x.motor.registrarCompraEnsaio({
  titularId:c.titularId,pedidoId:'pedido-c'
 });
 const valido={indicadorId:a.titularId,indicadoId:b.titularId,
  posicaoId:1,pedidoIndicado:'pedido-b',eventoId:'convite-b'};
 const falso={indicadorId:a.titularId,indicadoId:c.titularId,
  posicaoId:1,pedidoIndicado:'pedido-c',eventoId:'convite-c'};
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio(falso),
  /LOOP_SEM_CONVITE_CADASTRADO/);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,pedidoIndicado:'pedido-c',eventoId:'fraude'
 }),/LOOP_INDICADO_SEM_COMPRA_VERIFICADA/);
 assert.equal(x.motor.registrarIndicacaoEnsaio(valido).repetida,false);
 assert.equal(x.motor.registrarIndicacaoEnsaio(valido).repetida,true);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,eventoId:'requalificacao'
 }),/LOOP_INDICACAO_JA_QUALIFICADA/);
 assert.throws(()=>x.motor.registrarIndicacaoEnsaio({
  ...valido,indicadorId:c.titularId,eventoId:'roubo'
 }),/LOOP_SEM_CONVITE_CADASTRADO/);
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_motor_qualificacoes'
 ).get().n,1);
 assert.equal(x.motor.consultar({titularId:a.titularId}).posicoesReais,0);
});
test('API de convites usa sessão e o cadastro atribui pelo nick do link',async t=>{
 const x=preparar();
 t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,
  origemHttps:ORIGEM,permitirCadastro:true
 });
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const url='http://127.0.0.1:'+srv.address().port;
 assert.equal((await fetch(url+'/api/contas/minha-rede')).status,401);
 const redir=await fetch(url+'/convite/loja?ref=Alpha',{redirect:'manual'});
 assert.equal(redir.status,303);
 assert.equal(redir.headers.get('location'),
  '/escritorio?ref=Alpha&origem=loja');
 assert.equal((await fetch(url+'/convite/loja?ref=%2Ffoo',{
  redirect:'manual'
 })).status,400);
 const dados=x.docs;
 const cadastro=await fetch(url+'/api/contas/cadastrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({
   nome:'Pessoa de Ensaio',nick:'Bravo',email:'bravo@example.invalid',
   senha:'SenhaExemplo2026!',indicadorNick:'Alpha',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:dados.termos.versao,hashTermos:dados.termos.hash,
   versaoPrivacidade:dados.privacidade.versao,
   hashPrivacidade:dados.privacidade.hash
  })
 });
 assert.equal(cadastro.status,201);
 assert.equal((await cadastro.json()).vinculoCadastro,true);
 const login=await x.contas.entrar({nick:'Alpha',senha:'SenhaExemplo2026!'});
 const consulta=await fetch(url+'/api/contas/minha-rede',{
  headers:{Cookie:'loop_real_s='+login.token}
 });
 assert.equal(consulta.status,200);
 const l=await consulta.json();
 assert.equal(l.total,1);
 assert.equal(l.indicados[0].nick,'bravo');
 assert.equal(JSON.stringify(l).includes('bravo@example.invalid'),false);
 assert.equal(l.remuneracoesConfirmadas,0);
 assert.equal((await fetch(url+'/api/checkout/finalizar')).status,503);
});
