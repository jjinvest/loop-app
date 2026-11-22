'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://akitemm.example.invalid';
test('atendimento pertence à AKITEMM e exige sessão do próprio titular e CSRF',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const doc={versao:'LOOP-TERMOS-2026',
  texto:'Documento oficial da identidade de acesso para testes da AKITEMM sem dados reais, sem compras e sem pagamentos habilitados.'};
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:doc,
  privacidade:{...doc,versao:'LOOP-PRIVACIDADE-2026'},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos();
 await contas.cadastrar({
  nome:'Cliente de Exemplo',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaValidaInofensiva2026',cpf:'529.982.247-25',
  telefone:'11987654321',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const app=criarAppIdentidadeLoop({contas,origemHttps:ORIGEM,permitirCadastro:false});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(done=>srv.close(done)));
 const base='http://127.0.0.1:'+srv.address().port;
 const r=async(path,opts={})=>fetch(base+path,opts);
 assert.equal((await r('/api/loja/atendimentos')).status,401);
 const semSessao=await r('/api/loja/atendimentos',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({tipo:'PRODUTO',mensagem:'Quero esclarecer uma dúvida do produto.'})
 });
 assert.equal(semSessao.status,401);
 const login=await r('/api/contas/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Ana',senha:'SenhaValidaInofensiva2026'})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const perfil=await r('/api/contas/me',{headers:{Cookie:cookie}});
 const me=await perfil.json();
 assert.equal(perfil.status,200);
 const pedido={tipo:'PRODUTO',mensagem:'Quero esclarecer uma dúvida do produto.'};
 const enviar=(csrf,origem=ORIGEM)=>r('/api/loja/atendimentos',{
  method:'POST',headers:{Cookie:cookie,Origin:origem,
   'Content-Type':'application/json','X-Loop-Csrf':csrf},
  body:JSON.stringify(pedido)
 });
 assert.equal((await enviar('invalido')).status,403);
 assert.equal((await enviar(me.csrf,'https://outra-loja.invalid')).status,403);
 const salvo=await enviar(me.csrf);
 assert.equal(salvo.status,201);
 const protocolo=(await salvo.json()).protocolo;
 assert.match(protocolo,/^[0-9a-f-]{36}$/);
 const lista=await r('/api/loja/atendimentos',{headers:{Cookie:cookie}});
 assert.equal(lista.status,200);
 const dados=await lista.json();
 assert.equal(dados.atendimentos.length,1);
 assert.equal(dados.atendimentos[0].mensagem,pedido.mensagem);
 assert.equal(dados.atendimentos[0].estado,'ABERTO');
 assert.equal((await r('/api/admin/akitemm/atendimentos')).status,404,
  'sem central administrativa configurada, operador não está exposto');
 assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
});
