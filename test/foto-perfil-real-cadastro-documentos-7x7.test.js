'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {FotoPerfilRealSQLite}=
 require('../src/producao/foto-perfil-real-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://perfil-real.example.invalid';
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
const termos=fs.readFileSync(path.join(__dirname,
 '../docs/TERMOS_CADASTRO_LOOP_2026_11_PARA_APROVACAO.md'),'utf8');
const privacidade=fs.readFileSync(path.join(__dirname,
 '../docs/POLITICA_PRIVACIDADE_LOOP_2026_11_PARA_APROVACAO.md'),'utf8');
test('foto real privada, upload autenticado, documentos 7+7 legiveis sem abrir cadastro',async t=>{
 assert.equal((termos.match(/^## [1-7]\. /gm)||[]).length,7);
 assert.equal((privacidade.match(/^## [1-7]\. /gm)||[]).length,7);
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026-11-V1',texto:termos},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-11-V1',texto:privacidade},
  enviarEmail:async()=>true
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(p,headers)=>fetch(base+p,{headers});
 assert.equal((await get('/api/contas/documentos')).status,503);
 const publicos=await get('/api/contas/documentos-leitura');
 assert.equal(publicos.status,200);
 const leitura=await publicos.json();
 assert.equal(leitura.somenteLeitura,true);
 assert.equal(leitura.cadastroAtivo,false);
 assert.equal(leitura.financeiroReal,false);
 assert.equal(leitura.termos.texto,termos);
 assert.equal(leitura.privacidade.texto,privacidade);
 assert.equal((await get('/api/contas/foto-perfil')).status,401);
 const docs=contas.documentos();
 const c=await contas.cadastrar({
  nome:'Cliente Foto',nick:'FotoCliente',
  email:'fotocliente@example.invalid',senha:'SenhaClienteForte2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 assert.ok(c.titularId);
 const entrada=await fetch(base+'/api/contas/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'FotoCliente',senha:'SenhaClienteForte2026!'})
 });
 assert.equal(entrada.status,200);
 const d=await entrada.json();
 const cookie=entrada.headers.get('set-cookie').split(';')[0];
 assert.match(cookie,/^loop_real_s=[a-f0-9]{64}$/);
 assert.equal((await get('/api/contas/foto-perfil',{Cookie:cookie})).status,404);
 const upload=(headers,body=PNG)=>fetch(base+'/api/contas/foto-perfil',{
  method:'POST',headers:{Cookie:cookie,Origin:ORIGEM,
   'Content-Type':'image/png',...headers},body
 });
 assert.equal((await upload({})).status,403);
 assert.equal((await upload({'X-Loop-Csrf':d.csrf,Origin:'https://fake.invalid'})).status,403);
 assert.equal((await upload({'X-Loop-Csrf':d.csrf,'Content-Type':'image/svg+xml'})).status,415);
 const res=await upload({'X-Loop-Csrf':d.csrf});
 assert.equal(res.status,201);
 assert.equal((await res.json()).fotoSalva,true);
 const imagem=await get('/api/contas/foto-perfil',{Cookie:cookie});
 assert.equal(imagem.status,200);
 assert.equal(imagem.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await imagem.arrayBuffer()),PNG);
 assert.deepEqual(new FotoPerfilRealSQLite({banco}).consultar(c.titularId).dados,PNG);
 assert.equal((await get('/api/contas/foto-perfil')).status,401);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
