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
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const {criarTransporteRecuperacaoResend}=
 require('../src/adapters/email-recuperacao-resend');
const TERMOS='Aceite exclusivo para teste de recuperacao de acesso, sem quaisquer pagamentos e posicoes reais.';
function configurar(db,opts={}){
 return criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'OPERADOR_RECUPERACAO_TESTE_'+('z'.repeat(45)),
  termosVersao:'LAB-recuperacao-2026',termosTexto:TERMOS,...opts
 });
}
test('recuperacao por e-mail usa codigo unico, prazo, tentativas e revoga sessoes',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const enviados=[];
 const {app}=configurar(db,{
  chaveRecuperacao:randomBytes(32),
  enviarRecuperacao:async dados=>{enviados.push(dados);return true;}
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,body,cookie)=>{
  const response=await fetch(base+path,{
   method:body?'POST':'GET',
   headers:{...(body?{'Content-Type':'application/json'}:{}),
    ...(cookie?{Cookie:cookie}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  return {status:response.status,data:await response.json(),
   headers:response.headers};
 };
 const cadastro=async(nick,email)=>{
  const x=await req('/staging/contas/cadastrar',{
   nome:nick+' Exemplo',nick,email,senha:'Abc123xy',
   aceiteExplicito:true
  });
  assert.equal(x.status,201,JSON.stringify(x.data));
 };
 await cadastro('Alice','alice@example.invalid');
 await cadastro('Bianca','bianca@example.invalid');
 const a=await req('/staging/contas/entrar',{nick:'Alice',senha:'Abc123xy'});
 assert.equal(a.status,200);
 const cookie=a.headers.get('set-cookie').match(new RegExp(COOKIE+'=[a-f0-9]{64}'))[0];
 assert.equal((await req('/staging/contas/me',null,cookie)).status,200);
 const inexistente=await req('/staging/contas/recuperar-senha',
  {email:'naoexiste@example.invalid'});
 assert.equal(inexistente.status,202);
 assert.equal(enviados.length,0);
 const solicitar=await req('/staging/contas/recuperar-senha',
  {email:'ALICE@example.invalid'});
 assert.equal(solicitar.status,202);
 assert.deepEqual(solicitar.data,inexistente.data,'nao identifica e-mail existente');
 assert.equal(enviados.length,1);
 assert.equal(enviados[0].para,'alice@example.invalid');
 assert.match(enviados[0].codigo,/^[0-9]{8}$/);
 assert.equal((await req('/staging/contas/recuperar-senha',
  {email:'alice@example.invalid'})).status,202);
 assert.equal(enviados.length,1,'cooldown nao envia dois codigos');
 const errado=enviados[0].codigo==='12345678'?'12345679':'12345678';
 const erro=await req('/staging/contas/redefinir-senha',{
  email:'alice@example.invalid',codigo:errado,novaSenha:'NovaAbc123'
 });
 assert.equal(erro.status,400);
 assert.equal(erro.data.erro,'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS');
 const novo=await req('/staging/contas/redefinir-senha',{
  email:'alice@example.invalid',codigo:enviados[0].codigo,novaSenha:'NovaAbc123'
 });
 assert.equal(novo.status,200,JSON.stringify(novo.data));
 assert.equal(novo.data.senhaRedefinida,true);
 assert.equal(novo.data.todasSessoesRevogadas,true);
 assert.equal((await req('/staging/contas/me',null,cookie)).status,401);
 assert.equal((await req('/staging/contas/entrar',
  {nick:'Alice',senha:'Abc123xy'})).status,401);
 assert.equal((await req('/staging/contas/entrar',
  {nick:'Alice',senha:'NovaAbc123'})).status,200);
 assert.equal((await req('/staging/contas/redefinir-senha',{
  email:'alice@example.invalid',codigo:enviados[0].codigo,
  novaSenha:'OutraAbc12'
 })).status,400,'codigo nao pode ser reutilizado');
 const raw=JSON.stringify(db.prepare(
  'SELECT * FROM akitemm_recuperacao_senha_candidata'
 ).all());
 assert.equal(raw.includes(enviados[0].codigo),false,'codigo so em HMAC');
 assert.equal(raw.includes('alice@example.invalid'),false,'email nao gravado em claro');
 await req('/staging/contas/recuperar-senha',{email:'bianca@example.invalid'});
 assert.equal(enviados.length,2);
 const err2=enviados[1].codigo==='11111111'?'11111112':'11111111';
 for(let i=0;i<5;i++){
  const bad=await req('/staging/contas/redefinir-senha',{
   email:'bianca@example.invalid',codigo:err2,novaSenha:'NovaBianca1'
  });
  assert.equal(bad.status,400);
 }
 assert.equal((await req('/staging/contas/redefinir-senha',{
  email:'bianca@example.invalid',codigo:enviados[1].codigo,
  novaSenha:'NovaBianca1'
 })).status,400,'quinta falha bloqueia o desafio');
 assert.equal((await req('/staging/contas/entrar',{
  nick:'Bianca',senha:'Abc123xy'
 })).status,200,'nunca altera senha sem comprovacao');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('sem provedor de e-mail, pedido nao finge que enviou codigo',async t=>{
 const db=new DatabaseSync(':memory:');
 const {app}=configurar(db);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/staging/contas/recuperar-senha',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'exemplo@example.invalid'})
 });
 assert.equal(r.status,503);
 assert.equal((await r.json()).erro,'RECUPERACAO_EMAIL_INDISPONIVEL');
});
test('adaptador Resend exige chave e nao registra senha ou token em URL',async()=>{
 const chamadas=[];
 const envio=criarTransporteRecuperacaoResend({
  apiKey:'re_CHAVE_DE_TESTE_RESEND_123456',
  remetente:'recuperar@akitemm.example',
  fetchImpl:async(url,args)=>{
   chamadas.push({url,args});return {status:200,json:async()=>({id:'email-teste-123456'})};
  }
 });
 assert.equal(await envio({para:'pessoa@example.invalid',codigo:'12345678',
  expiraEm:Date.now()+600000}),true);
 assert.equal(chamadas.length,1);
 assert.equal(chamadas[0].url,'https://api.resend.com/emails');
 assert.ok(!chamadas[0].url.includes('12345678'));
 assert.match(JSON.parse(chamadas[0].args.body).text,/12345678/);
});
