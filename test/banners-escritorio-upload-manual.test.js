'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {BannersEscritorioCandidatoSQLite}=require(
 '../src/domain/banners-escritorio-candidato-sqlite');
const ADMIN='operador-banners-2026-'+('A'.repeat(40));
const ROOT='/staging/escritorio-unificado/banners-escritorio';
const FOTO=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7sAAAAASUVORK5CYII=','base64');
test('quatro banners: admin envia, persiste, cliente ve, substitui e remove sem acesso publico',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:ADMIN,
  termosVersao:'LAB-banners-escritorio',termosTexto:
   'Termos ficticios de teste para a conta do Escritorio sem transacao financeira real.'
 });
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(async()=>{await new Promise(resolve=>servidor.close(resolve));banco.close();});
 const url='http://127.0.0.1:'+servidor.address().port;
 const request=(rota,{method='GET',admin=false,cookie=null,json=null,
  bin=null,mime=null,revisao=null,enquadramento=null}={})=>fetch(url+rota,{method,headers:{
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(cookie?{Cookie:cookie}:{}),
   ...(json?{'Content-Type':'application/json'}:{}),
   ...(mime?{'Content-Type':mime}:{}),
   ...(revisao!==null?{'X-Banner-Revisao-Esperada':String(revisao)}:{}),
   ...(enquadramento?{'X-Banner-Enquadramento':enquadramento}:{})
  },...(json?{body:JSON.stringify(json)}:bin?{body:bin}:{})});
 const pagina=await request('/staging/cliente');
 assert.equal(pagina.status,200);
 const html=await pagina.text();
 assert.equal((html.match(/data-banner-imagem="[1-4]"/g)||[]).length,4);
 assert.equal((html.match(/data-banner-resumo="[0-3]"/g)||[]).length,4);
 assert.match(html,/Quatro banners que deslizam horizontalmente/);
 const adminHtml=await request('/staging/escritorio-admin');
 assert.equal(adminHtml.status,200);
 assert.match(await adminHtml.text(),/Banners do Escritório Virtual · subir fotos manualmente/);
 const js=await request('/staging/assets/admin.js');
 assert.match(await js.text(),/gerenciarBannerFotoAdmin/);
 const anon=await request('/staging/banners-escritorio');
 assert.equal(anon.status,401);
 const naoAdmin=await request(ROOT);
 assert.equal(naoAdmin.status,401);
 const inicial=await request(ROOT,{admin:true});
 assert.equal(inicial.status,200);
 const estados=(await inicial.json()).slots;
 assert.deepEqual(estados.map(x=>x.slot),[1,2,3,4]);
 assert.ok(estados.every(x=>!x.temImagem&&x.revisao===0));
 const tentativaInvalida=await request(ROOT+'/1/imagem',{
  method:'PUT',mime:'image/png',revisao:0,bin:FOTO});
 assert.equal(tentativaInvalida.status,401,'visitante nao grava imagem');
 const falso=await request(ROOT+'/1/imagem',{
  method:'PUT',admin:true,mime:'image/png',revisao:0,
  bin:Buffer.alloc(500,0x40)});
 assert.equal(falso.status,400,'cabecalho e dimensoes precisam ser validos');
 for(const slot of [1,2,3,4]){
  const upload=await request(ROOT+'/'+slot+'/imagem',{
   method:'PUT',admin:true,mime:'image/png',revisao:0,bin:FOTO,
   enquadramento:slot===2?'PREENCHER':'INTEIRA'});
  assert.equal(upload.status,200,'o operador consegue enviar no slot '+slot);
  const dados=await upload.json();
  const linha=dados.slots.find(x=>x.slot===slot);
  assert.equal(linha.temImagem,true);
  assert.equal(linha.revisao,1);
  assert.equal(linha.enquadramento,slot===2?'PREENCHER':'INTEIRA');
  const foto=await request(ROOT+'/'+slot+'/imagem',{admin:true});
  assert.equal(foto.status,200);
  assert.equal(foto.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await foto.arrayBuffer()),FOTO);
 }
 const invalido=await request(ROOT+'/3/imagem',{
  method:'PUT',admin:true,mime:'image/png',revisao:1,bin:FOTO,
  enquadramento:'HTML_INJETADO'});
 assert.equal(invalido.status,400,'nao aceitar enquadramento fora dos dois modos');
 const repetido=await request(ROOT+'/2/imagem',{
  method:'PUT',admin:true,mime:'image/png',revisao:0,bin:FOTO});
 assert.equal(repetido.status,409,'evita sobrescrita concorrente');
 const criou=await request('/staging/contas/cadastrar',{method:'POST',json:{
  nome:'Cliente Banner',nick:'BannerA',email:'banner-a@example.invalid',
  senha:'SenhaBannerCliente2026!',aceiteExplicito:true
 }});
 assert.equal(criou.status,201);
 const entrar=await request('/staging/contas/entrar',{method:'POST',json:{
  nick:'BannerA',senha:'SenhaBannerCliente2026!'
 }});
 assert.equal(entrar.status,200);
 const cookie=entrar.headers.get('set-cookie')?.split(';')[0];
 assert.ok(cookie);
 const cliente=await request('/staging/banners-escritorio',{cookie});
 assert.equal(cliente.status,200);
 const estadoCliente=await cliente.json();
 assert.ok(estadoCliente.slots.every(x=>x.temImagem));
 assert.equal(estadoCliente.slots[1].enquadramento,'PREENCHER');
 const clienteFoto=await request('/staging/banners-escritorio/4/imagem',{cookie});
 assert.equal(clienteFoto.status,200);
 assert.deepEqual(Buffer.from(await clienteFoto.arrayBuffer()),FOTO);
 assert.equal((await request('/staging/banners-escritorio/4/imagem')).status,401);
 assert.equal((await request(ROOT+'/4/imagem',{cookie,method:'DELETE',revisao:1})).status,401);
 const outraInstancia=new BannersEscritorioCandidatoSQLite({banco});
 assert.equal(outraInstancia.listar().slots[1].enquadramento,'PREENCHER');
 assert.ok(outraInstancia.listar().slots.every(x=>x.temImagem),
  'migracao idempotente preserva as fotos existentes');
 const removido=await request(ROOT+'/4/imagem',{method:'DELETE',admin:true,revisao:1});
 assert.equal(removido.status,200);
 assert.equal((await removido.json()).slots[3].temImagem,false);
 assert.equal((await request('/staging/banners-escritorio/4/imagem',{cookie})).status,404);
 assert.equal((await request('/staging/banners-escritorio/3/imagem',{cookie})).status,200);
});
test('carrossel de quatro e foto acessivel nas interfaces compartilhadas',()=>{
 const js=fs.readFileSync(require.resolve('../src/candidato/checkout-candidato-ui.js'),'utf8');
 const real=fs.readFileSync(require.resolve('../src/producao/interface-aprovada-contas.js'),'utf8');
 const admin=fs.readFileSync(require.resolve('../src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
 const css=fs.readFileSync(require.resolve('../src/candidato/escritorio-cliente-integrado.css'),'utf8');
 assert.match(js,/pontos\.length!==4/);
 assert.match(js,/\(atual\+1\)%pontos\.length/);
 assert.match(real,/pontosResumo\.length===4/);
 assert.match(real,/\(indice\+1\)%pontosResumo\.length/);
 assert.match(js,/async function carregarFotosBannersEscritorio/);
 assert.match(admin,/async function gerenciarBannerFotoAdmin/);
 assert.match(css,/\.loop03-banner-foto-manual\[hidden\]/);
 assert.match(css,/\.loop03-banner-foto-manual\[data-enquadramento="PREENCHER"\]/);
 assert.match(css,/object-fit:cover;object-position:center center/);
 assert.match(css,/\.loop03-banner-foto-manual\[data-enquadramento="INTEIRA"\]/);
 assert.match(css,/object-fit:contain;object-position:center center/);
 assert.match(css,/\.loop03-banner-item:has\(> \.loop03-banner-foto-manual:not\(\[hidden\]\)\)::after/);
 assert.match(css,/pointer-events:none/);
 assert.match(admin,/X-Banner-Enquadramento/);
 assert.match(admin,/Mostrar imagem inteira/);
 assert.match(admin,/Preencher moldura/);
});


test('migracao adiciona modo de enquadramento e preserva imagens antigas',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE loop_banner_escritorio_manual('+
   'slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 4),'+
   'mime TEXT,imagem BLOB,revisao INTEGER NOT NULL DEFAULT 0,'+
   'atualizado_em INTEGER NOT NULL DEFAULT 0)');
  db.prepare('INSERT INTO loop_banner_escritorio_manual('+
   'slot,mime,imagem,revisao,atualizado_em) VALUES(1,?,?,2,123)').run('image/png',FOTO);
  const banners=new BannersEscritorioCandidatoSQLite({banco:db});
  assert.equal(banners.listar().slots[0].temImagem,true);
  assert.equal(banners.listar().slots[0].revisao,2);
  assert.equal(banners.listar().slots[0].enquadramento,'INTEIRA');
  assert.deepEqual(banners.imagem(1).bytes,FOTO);
  const outra=new BannersEscritorioCandidatoSQLite({banco:db});
  assert.equal(outra.listar().slots[0].revisao,2);
  assert.deepEqual(outra.imagem(1).bytes,FOTO);
 }finally{db.close();}
});


test('AKITEMM preserva fotos de produto dentro de suas molduras sem esticar imagem',()=>{
 const css=fs.readFileSync(require.resolve('../src/laboratorio/loja-cliente-demo.css'),'utf8');
 assert.match(css,/\.akitemm-loja \.akitemm-imagem-produto img,\s*\.akitemm-loja \.akitemm-miniatura-carrinho img,/);
 assert.match(css,/\.akitemm-loja \.akitemm-detalhe-foto-principal img,/);
 assert.match(css,/\.akitemm-loja \.akitemm-detalhe-miniaturas img\{\s*object-fit:scale-down;object-position:center;/);
 assert.match(css,/\.akitemm-imagem-produto\{height:111px;overflow:hidden;/);
 assert.match(css,/\.akitemm-loja \.produto-loja-loop\{[^\n]*overflow:hidden;border-radius:10px;border:1px solid/);
});
