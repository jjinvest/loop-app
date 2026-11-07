'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal,COOKIE}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const TXT='Documento de homologação técnica do cadastro de cliente real para o '+
 'Escritório LOOP e a Loja AKITEMM. Não autoriza compras, posições ou dinheiro.';
const ANTIGA='SenhaAntigaForte2026!';
const NOVA='SenhaNovaForte2026!';
const ORIGEM='https://contas.example.invalid';
async function preparar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 let ts=1_800_000_000_000;
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026-v1',texto:TXT},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-v1',texto:TXT},
  enviarEmail:async()=>true,agora:()=>ts
 });
 const docs=contas.documentos();
 for(const nick of ['Ana','Bia']){
  await contas.cadastrar({
   nome:nick+' de Ensaio',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:ANTIGA,aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
 }
 return {banco,contas,avancar:ms=>{ts+=ms;}};
}
test('senha alterada revoga todos dispositivos de um titular, sem afetar outro',async t=>{
 const {contas,banco}=await preparar(t);
 const a1=await contas.entrar({nick:'Ana',senha:ANTIGA});
 const a2=await contas.entrar({nick:'Ana',senha:ANTIGA});
 const b1=await contas.entrar({nick:'Bia',senha:ANTIGA});
 await assert.rejects(contas.trocarSenha({
  titularId:a1.titularId,senhaAtual:'Errada2026!Senha',novaSenha:NOVA
 }),{codigo:'SENHA_ATUAL_INCORRETA'});
 assert.equal(banco.prepare('SELECT tentativas FROM loop_real_contas WHERE id=?')
  .get(a1.titularId).tentativas,1);
 const trocada=await contas.trocarSenha({
  titularId:a1.titularId,senhaAtual:ANTIGA,novaSenha:NOVA
 });
 assert.deepEqual(trocada,{
  senhaAlterada:true,sessoesRevogadas:true,
  reentrarNecessario:true,financeiroReal:false
 });
 assert.equal(contas.sessao(a1.token),null);
 assert.equal(contas.sessao(a2.token),null);
 assert.ok(contas.sessao(b1.token),'senha de Ana não revoga sessões de Bia');
 await assert.rejects(contas.entrar({nick:'Ana',senha:ANTIGA}),
  {codigo:'CREDENCIAIS_INVALIDAS'});
 const ok=await contas.entrar({nick:'Ana',senha:NOVA});
 assert.equal(ok.titularId,a1.titularId);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('oito trocas com senha errada respeitam lock SQLite e bloqueio persistente',async t=>{
 const {contas,banco,avancar}=await preparar(t);
 const a=await contas.entrar({nick:'Ana',senha:ANTIGA});
 const r=await Promise.allSettled(Array.from({length:8},()=>contas.trocarSenha({
  titularId:a.titularId,senhaAtual:'Errada2026!Senha',novaSenha:NOVA
 })));
 assert.ok(r.every(x=>x.status==='rejected'));
 const codigos=r.map(x=>x.reason.codigo);
 assert.equal(codigos.filter(x=>x==='SENHA_ATUAL_INCORRETA').length,5);
 assert.equal(codigos.filter(x=>x==='CONTA_BLOQUEADA').length,3);
 assert.equal(banco.prepare('SELECT tentativas FROM loop_real_contas WHERE id=?')
  .get(a.titularId).tentativas,5);
 await assert.rejects(contas.trocarSenha({
  titularId:a.titularId,senhaAtual:ANTIGA,novaSenha:NOVA
 }),{codigo:'CONTA_BLOQUEADA'});
 avancar(15*60*1000+1);
 const ok=await contas.entrar({nick:'Ana',senha:ANTIGA});
 assert.equal(ok.titularId,a.titularId,'senha original não foi modificada');
});
test('troca por HTTP exige origem, CSRF, sessão e encerra cookie',async t=>{
 const {contas}=await preparar(t);
 const app=criarAppIdentidadeLoop({contas,origemHttps:ORIGEM,permitirCadastro:true});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const post=(rota,dados,headers={})=>fetch(base+rota,{
  method:'POST',redirect:'manual',headers:{
   Origin:ORIGEM,'Content-Type':'application/json',...headers
  },body:JSON.stringify(dados)
 });
 const login=await post('/api/contas/entrar',{nick:'Ana',senha:ANTIGA});
 assert.equal(login.status,200);
 const sessao=await login.json();
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.ok(cookie.startsWith(COOKIE+'='));
 const body={senhaAtual:ANTIGA,novaSenha:NOVA};
 const naoAutenticado=await post('/api/contas/senha/trocar',body);
 assert.equal(naoAutenticado.status,401);
 const semCsrf=await post('/api/contas/senha/trocar',body,{Cookie:cookie});
 assert.equal(semCsrf.status,403);
 const origemFalsa=await post('/api/contas/senha/trocar',body,{
  Cookie:cookie,Origin:'https://invasor.example.invalid',
  'X-Loop-Csrf':sessao.csrf
 });
 assert.equal(origemFalsa.status,403);
 const correção=await post('/api/contas/senha/trocar',body,{
  Cookie:cookie,'X-Loop-Csrf':sessao.csrf
 });
 assert.equal(correção.status,200);
 assert.equal((await correção.json()).reentrarNecessario,true);
 assert.match(correção.headers.get('set-cookie'),/Max-Age=0/);
 const me=await fetch(base+'/api/contas/me',{headers:{Cookie:cookie}});
 assert.equal(me.status,401);
 assert.equal((await post('/api/contas/entrar',{
  nick:'Ana',senha:NOVA
 })).status,200);
});
