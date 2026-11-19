'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
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
 const imagemComRevisao=await get('/api/contas/foto-perfil?revisao=123',{Cookie:cookie});
 assert.equal(imagemComRevisao.status,200);
 const imagem=await get('/api/contas/foto-perfil',{Cookie:cookie});
 assert.equal(imagem.status,200);
 assert.equal(imagem.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await imagem.arrayBuffer()),PNG);
 assert.deepEqual(new FotoPerfilRealSQLite({banco}).consultar(c.titularId).dados,PNG);
 assert.equal((await get('/api/contas/foto-perfil')).status,401);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('galeria Android: imagem grande e enquadrada antes do POST, sem mudar molduras',async()=>{
 const codigo=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-contas.js'),'utf8');
 const ini=codigo.indexOf('async function prepararFotoPerfilReal(arquivo){');
 const fim=codigo.indexOf('async function salvarFotoPerfilReal(ev){',ini);
 assert.ok(ini>0&&fim>ini,'preparador do REAL deve existir');
 const funcao=codigo.slice(ini,fim).trim();
 const tamanhoOriginal=5*1024*1024,arquivo={type:'image/jpeg',size:tamanhoOriginal};
 const chamadas=[];
 const canvas={
  width:0,height:0,
  getContext:()=>({
   fillRect(){},drawImage(){},
   set fillStyle(valor){assert.equal(valor,'#ffffff');}
  }),
  toBlob(callback,mime,qualidade){
   chamadas.push({mime,qualidade,width:canvas.width,height:canvas.height});
   callback({size:550000,type:'image/jpeg'});
  }
 };
 const preparar=vm.runInNewContext('('+funcao+')',{
  document:{createElement:tipo=>{assert.equal(tipo,'canvas');return canvas;}},
  createImageBitmap:async()=>({width:4032,height:3024,close(){}})
 });
 const grande=await preparar(arquivo);
 assert.equal(grande.mime,'image/jpeg');
 assert.equal(grande.dados.size,550000);
 assert.equal(canvas.width,1920);
 assert.equal(canvas.height,1440);
 assert.ok(chamadas.length>0);
 const pequena={type:'image/png',size:12500};
 const pronta=await preparar(pequena);
 assert.equal(pronta.dados,pequena,'imagem ja compativel nao deve ser tocada');
 assert.equal(pronta.mime,'image/png');
 const heic=await preparar({type:'image/heic',size:4000000});
 assert.equal(heic.mime,'image/jpeg','HEIC decodificavel pelo aparelho vira JPEG');
 await assert.rejects(preparar({type:'text/html',size:999}),/imagem com até 24 MB/);
 await assert.rejects(preparar({type:'image/png',size:25*1024*1024}),
  /imagem com até 24 MB/);
 assert.ok(codigo.includes("const url='/api/contas/foto-perfil?revisao='"));
 assert.ok(!codigo.includes('const url=URL.createObjectURL(blob)'));
 assert.match(codigo,/credentials:'same-origin',cache:'no-store'/);
});

test('erros visiveis do REAL indicam causa sem expor detalhes internos',()=>{
 const codigo=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-contas.js'),'utf8');
 const ini=codigo.indexOf('function explicarFalhaFotoReal(e){');
 const fim=codigo.indexOf('function avisarFalhaFotoReal(mensagem){',ini);
 assert.ok(ini>0&&fim>ini);
 const explicar=vm.runInNewContext('('+codigo.slice(ini,fim).trim()+')');
 assert.match(explicar({message:'FOTO_INVALIDA'}),/foto.*inválida/i);
 assert.match(explicar({message:'FOTO_GRANDE_DEMAIS'}),/3 MB/);
 assert.match(explicar({message:'CSRF_INVALIDO'}),/sessão expirou/i);
 assert.match(explicar({message:'FOTO_REAL_INDISPONIVEL',status:503}),/armazenamento/i);
 assert.match(explicar({message:'Z',status:415}),/JPEG.*PNG.*WebP/);
 assert.match(explicar({message:'Z',status:413}),/3 MB/);
 assert.match(explicar({message:'Z',status:401}),/Sessão não autorizada/);
 assert.match(explicar({message:'Z',name:'TypeError'}),/conexão/i);
 assert.ok(!explicar({message:'INTERNAL_STACK_SECRET',status:500}).includes('INTERNAL_STACK_SECRET'));
 assert.match(codigo,/if\(avisoId\)\{\$\(avisoId\)\.textContent=mensagem;/);
 assert.match(codigo,/id==='formLogin'\?'erroLogin'/);
 assert.match(codigo,/id==='formCadastro'\?'erroCadastro'/);
 assert.match(codigo,/CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos/);
});
