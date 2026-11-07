'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const DOCUMENTO='A conta de cliente real do LOOP e da Loja AKITEMM exige aceite '+
 'específico, consentimento informado e e-mail próprio, sem habilitar operações financeiras.';
function ambiente(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-limites-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const dados={
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026-v1',texto:DOCUMENTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-v1',texto:DOCUMENTO},
  enviarEmail:async()=>true
 };
 let ts=1_800_000_000_000;
 const banco1=new DatabaseSync(arquivo),banco2=new DatabaseSync(arquivo);
 for(const db of [banco1,banco2])
  db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 t.after(()=>{banco2.close();banco1.close();});
 const contas1=new IdentidadeClienteLoopReal({...dados,banco:banco1,agora:()=>ts});
 const contas2=new IdentidadeClienteLoopReal({...dados,banco:banco2,agora:()=>ts});
 return {contas1,contas2,banco1,banco2,avancar:ms=>{ts+=ms;}};
}
test('limite por titular nao reinicia ao trocar conexao SQLite ou processo',t=>{
 const {contas1:a,contas2:b,banco1,banco2,avancar}=ambiente(t);
 for(let i=0;i<20;i++)assert.equal(
  (i%2?a:b).limitar('login','ClienteExemplo'),true);
 assert.throws(()=>a.limitar('login','ClienteExemplo'),
  {codigo:'ACESSO_TEMPORARIAMENTE_LIMITADO'});
 assert.throws(()=>b.limitar('login','clienteexemplo'),
  {codigo:'ACESSO_TEMPORARIAMENTE_LIMITADO'});
 assert.equal(banco2.prepare(
  'SELECT COUNT(*) AS total FROM loop_real_limites'
 ).get().total,1);
 const dados=JSON.stringify(banco1.prepare('SELECT * FROM loop_real_limites').all());
 assert.equal(dados.includes('ClienteExemplo'),false);
 assert.equal(dados.includes('clienteexemplo'),false);
 assert.equal(banco1.prepare(
  'SELECT usos FROM loop_real_limites'
 ).get().usos,20);
 avancar(15*60000+1);
 assert.equal(b.limitar('login','clienteexemplo'),true);
 assert.equal(banco1.prepare('SELECT usos FROM loop_real_limites').get().usos,1);
 assert.equal(banco2.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco2.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('quotas separadas de login, cadastro e recuperacao',t=>{
 const {contas1:a,contas2:b,avancar}=ambiente(t);
 for(let i=0;i<5;i++)assert.equal(a.limitar('cadastro','ana@example.invalid'),true);
 assert.throws(()=>b.limitar('cadastro','ana@example.invalid'),
  {codigo:'ACESSO_TEMPORARIAMENTE_LIMITADO'});
 assert.equal(b.limitar('cadastro','bia@example.invalid'),true);
 assert.equal(b.limitar('login','ana'),true);
 assert.equal(b.limitar('solicitar','ana@example.invalid:SENHA'),true);
 assert.equal(b.limitar('confirmar','ana@example.invalid:SENHA'),true);
 avancar(60*60000+1);
 assert.equal(a.limitar('cadastro','ana@example.invalid'),true);
});
test('API protege login e recuperacao contra excesso sem bloquear titulares alheios',async t=>{
 const {contas1:contas}=ambiente(t);
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:'https://contas.example.invalid',permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(rota,data)=>fetch(base+rota,{
  method:'POST',
  headers:{Origin:'https://contas.example.invalid',
   'Content-Type':'application/json'},
  body:JSON.stringify(data)
 });
 for(let i=0;i<20;i++)contas.limitar('login','ana');
 const blocked=await post('/api/contas/entrar',{
  nick:'Ana',senha:'SenhaIncorreta2026!'
 });
 assert.equal(blocked.status,429);
 assert.equal((await blocked.json()).erro,'ACESSO_TEMPORARIAMENTE_LIMITADO');
 const outro=await post('/api/contas/entrar',{
  nick:'Bia',senha:'SenhaIncorreta2026!'
 });
 assert.equal(outro.status,401);
 for(let i=0;i<12;i++)contas.limitar('solicitar','ana@example.invalid:SENHA');
 const recovery=await post('/api/contas/senha/solicitar',{
  email:'ana@example.invalid'
 });
 assert.equal(recovery.status,429);
 assert.equal((await recovery.json()).erro,'ACESSO_TEMPORARIAMENTE_LIMITADO');
 assert.equal((await fetch(base+'/readyz')).status,200);
 assert.equal(contas.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
