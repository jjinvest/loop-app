'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const TEXTO='Termos e aviso de privacidade do ambiente controlado de teste de identidade '+
 'para acesso unificado da loja AKITEMM e do Escritório LOOP sem transações reais.';
test('SQLite da identidade separado conserva cadastro e consentimento apos reinicio',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contas-real-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'clientes.sqlite');
 const cfg={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async()=>true};
 let db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON');
 let conta=new IdentidadeClienteLoopReal({...cfg,banco:db});
 const docs=conta.documentos();
 const dados={nome:'Ana Exemplo',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaDeEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash};
 const antes=await conta.cadastrar(dados);
 db.close();
 db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON');
 conta=new IdentidadeClienteLoopReal({...cfg,banco:db});
 const sessao=await conta.entrar({nick:'Ana',senha:dados.senha});
 assert.equal(sessao.titularId,antes.titularId);
 assert.equal(conta.dadosTitular(sessao.titularId).email,'ana@example.invalid');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 db.close();
});

test('tres contas reais de ensaio sobrevivem ao reinicio com isolamento da loja e recuperacao de sessao',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-tres-clientes-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'titulares.sqlite');
 const cfg={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async()=>true};
 const origem='https://contas.example.invalid';
 let db,server,contas,base;
 const iniciar=async()=>{
  db=new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON');
  contas=new IdentidadeClienteLoopReal({...cfg,banco:db});
  const app=criarAppIdentidadeLoop({contas,origemHttps:origem,
   permitirCadastro:true});
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  base='http://127.0.0.1:'+server.address().port;
 };
 const parar=async()=>{
  if(server){await new Promise(resolve=>server.close(resolve));server=null;}
  if(db){db.close();db=null;}
 };
 t.after(parar);
 const senhas='SenhaDeEnsaio2026!';
 const nicks=['Ana','Bia','Ceci'];
 await iniciar();
 const documentos=contas.documentos();
 const titulares={};
 for(const nick of nicks){
  titulares[nick]=await contas.cadastrar({
   nome:nick+' Exemplo',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:senhas,aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:documentos.termos.versao,
   hashTermos:documentos.termos.hash,
   versaoPrivacidade:documentos.privacidade.versao,
   hashPrivacidade:documentos.privacidade.hash
  });
 }
 const login=async nick=>{
  const res=await fetch(base+'/api/contas/entrar',{
   method:'POST',headers:{Origin:origem,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:senhas})
  });
  assert.equal(res.status,200,nick+' entrou');
  return {cookie:res.headers.get('set-cookie').split(';')[0],
   ...await res.json()};
 };
 const sessoes={};
 for(const nick of nicks)sessoes[nick]=await login(nick);
 const verificar=async()=>{
  for(const nick of nicks){
   const {cookie}=sessoes[nick],headers={Cookie:cookie};
   const perfil=await fetch(base+'/api/contas/me',{headers});
   assert.equal(perfil.status,200);
   const me=await perfil.json();
   assert.equal(me.titularId,titulares[nick].titularId);
   assert.equal(me.nick,nick);
   assert.equal(me.financeiroReal,false);
   const outra=nick==='Ana'?'Bia':'Ana';
   const dados=await fetch(base+'/api/contas/meus-dados?titularId='+
    titulares[outra].titularId,{headers});
   assert.equal(dados.status,200);
   const body=await dados.json();
   assert.equal(body.nick,nick,'a consulta ignora titularId do navegador');
   assert.equal(body.email,nick.toLowerCase()+'@example.invalid');
   assert.equal((await fetch(base+'/loja',{headers})).status,200);
   assert.equal((await fetch(base+'/api/loja/pedidos',{headers})).status,503);
   assert.equal((await fetch(base+'/api/checkout/finalizar',{headers})).status,503);
   assert.equal((await fetch(base+'/api/saques/solicitar',{headers})).status,503);
  }
 };
 await verificar();
 const duplicado=await fetch(base+'/api/contas/me',{
  headers:{Cookie:sessoes.Ana.cookie+'; '+sessoes.Bia.cookie}});
 assert.equal(duplicado.status,401,'dois cookies não elegem um titular');
 await parar();
 // O mesmo SQLite persistido abre em outro processo lógico sem importar LAB.
 await iniciar();
 await verificar();
 assert.equal((await fetch(base+'/api/contas/me')).status,401);
 assert.equal((await fetch(base+'/api/loja/estado')).status,401);
 assert.equal((await fetch(base+'/staging/motor/estado')).status,404);
 const cookieAna=sessoes.Ana.cookie;
 const csrfAna=sessoes.Ana.csrf;
 const semCsrf=await fetch(base+'/api/contas/senha/trocar',{
  method:'POST',headers:{Cookie:cookieAna,Origin:origem,
   'Content-Type':'application/json'},body:JSON.stringify({
    senhaAtual:senhas,novaSenha:'NovaSenhaDeEnsaio2026!'
   })
 });
 assert.equal(semCsrf.status,403);
 const mudanca=await fetch(base+'/api/contas/senha/trocar',{
  method:'POST',headers:{Cookie:cookieAna,Origin:origem,
   'Content-Type':'application/json','X-Loop-Csrf':csrfAna},
  body:JSON.stringify({senhaAtual:senhas,novaSenha:'NovaSenhaDeEnsaio2026!'})
 });
 assert.equal(mudanca.status,200);
 assert.equal((await fetch(base+'/api/contas/me',{
  headers:{Cookie:cookieAna}})).status,401);
 assert.equal((await fetch(base+'/api/contas/me',{
  headers:{Cookie:sessoes.Bia.cookie}})).status,200);
 assert.equal((await fetch(base+'/api/contas/me',{
  headers:{Cookie:sessoes.Ceci.cookie}})).status,200);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 await parar();
});
