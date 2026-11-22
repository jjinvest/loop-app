'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {BannersLojaAkitemmRealSQLite}=
 require('../src/producao/banners-loja-akitemm-real-sqlite');
const {montarBannersEscritorioReal}=
 require('../src/producao/banners-escritorio-real');
const origem='https://akitemmloop.example.invalid';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64');
const ler=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('banners LOOP reais: login, sessão de operador, CSRF, 4 slots e isolamento AKITEMM',async t=>{
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 const akitemm=new BannersLojaAkitemmRealSQLite({banco});
 const app=express();
 const sessaoOperador=req=>req.get('x-test-operador')==='sim'?
  {role:'ADMIN_COMERCIAL',csrf:'token-operador-real-2026'}:null;
 montarBannersEscritorioReal(app,{
  banco,origem,sessaoOperador,
  protegidoLoja:(req,res,next)=>
   req.get('x-test-cliente')==='sim'||sessaoOperador(req)?
    next():res.status(401).json({erro:'LOGIN_OBRIGATORIO'})
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 const fetchR=(route,opt={})=>fetch(base+route,opt);
 assert.equal((await fetchR('/api/loop/banners')).status,401);
 const auth={'x-test-cliente':'sim'};
 const op={'x-test-operador':'sim'};
 const estado=await (await fetchR('/api/loop/banners',{headers:auth})).json();
 assert.equal(estado.quantidadeMaxima,4);
 assert.deepEqual(estado.slots.map(x=>x.slot),[1,2,3,4]);
 assert.equal(akitemm.listar().slots[0].temImagem,false);
 const url='/api/admin/loop/banners/2/imagem';
 const cabe={'Content-Type':'image/png','X-Banner-Revisao-Esperada':'0',
  'X-Loop-Admin-Csrf':'token-operador-real-2026',origin:origem};
 const put=headers=>fetchR(url,{method:'PUT',headers,body:PNG});
 assert.equal((await put(cabe)).status,401,'cliente não grava banner');
 assert.equal((await put({...op,...cabe,origin:'https://falso.invalid'})).status,403);
 assert.equal((await put({...op,...cabe,'X-Loop-Admin-Csrf':'falso'})).status,403);
 const saved=await put({...op,...cabe});
 assert.equal(saved.status,200);
 assert.equal((await saved.json()).slots[1].revisao,1);
 assert.equal((await put({...op,...cabe})).status,409);
 const img=await fetchR('/api/loop/banners/2/imagem',{headers:auth});
 assert.equal(img.status,200);
 assert.equal(img.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await img.arrayBuffer()),PNG);
 assert.equal((await fetchR('/api/loop/banners/5/imagem',{headers:auth})).status,404);
 assert.equal(akitemm.listar().slots[1].temImagem,false,
  'salvar no LOOP jamais copia arquivo para a AKITEMM');
 const wrong=await fetchR(url,{method:'DELETE',headers:{
  ...op,origin:origem,'X-Loop-Admin-Csrf':'token-operador-real-2026',
  'X-Banner-Revisao-Esperada':'0'
 }});
 assert.equal(wrong.status,409);
 const del=await fetchR(url,{method:'DELETE',headers:{
  ...op,origin:origem,'X-Loop-Admin-Csrf':'token-operador-real-2026',
  'X-Banner-Revisao-Esperada':'1'
 }});
 assert.equal(del.status,200);
 assert.equal((await del.json()).slots[1].temImagem,false);
 assert.equal((await fetchR('/api/loop/banners/2/imagem',{headers:auth})).status,404);
});
test('formulários reais: sinal + abre área de foto e envia à tabela correta',()=>{
 const html=require('../src/producao/interface-aprovada-loop');
 const loop=html.renderizarInterfaceAprovada();
 const loja=html.renderizarLojaAprovada();
 assert.match(loop,/identidade\/assets\/loop-banners-real\.js\?rev=[a-f0-9]{16}/);
 assert.match(loop,/identidade\/assets\/banners-editor-real\.css/);
 assert.match(loja,/identidade\/assets\/loja-banners\.js\?rev=[a-f0-9]{16}/);
 const frente=ler('src/producao/banners-escritorio-real-client.js');
 const lojaJs=ler('src/producao/banners-loja-akitemm-client.js');
 const server=ler('src/producao/servidor-identidade-loop.js');
 const gateway=ler('scripts/iniciar-gateway-publico-real-loop.js');
 assert.match(frente,/loop03BannerMaisReal/);
 assert.match(frente,/loop03BannerFormularioReal/);
 assert.match(frente,/img\.loading='eager'/);
 assert.match(frente,/img\.hidden=false/);
 assert.match(frente,/api\/loop\/banners/);
 assert.match(frente,/api\/admin\/loop\/banners/);
 assert.match(frente,/document\.body\.classList\.contains\('loop03-modo-operador'\)/);
 assert.match(frente,/MutationObserver\(\(\)=>\{void checarAcesso\(\);\}\)/);
 assert.match(lojaJs,/akitemmBannerMaisReal/);
 assert.match(lojaJs,/akitemmBannerFormularioReal/);
 assert.match(lojaJs,/api\/admin\/akitemm\/banners/);
 assert.match(server,/montarBannersEscritorioReal/);
 assert.match(gateway,/api\\\/loop\\\/banners/);
 assert.doesNotMatch(frente,/staging\/|laboratorio\//);
 assert.doesNotMatch(lojaJs,/staging\/|laboratorio\//);
});

test('recorte opcional em banners e produtos, nunca nas fotos de perfil',()=>{
 const interfaceReal=require('../src/producao/interface-aprovada-loop');
 const htmls=[interfaceReal.renderizarInterfaceAprovada(),
  interfaceReal.renderizarLojaAprovada()];
 for(const html of htmls){
  assert.match(html,/\/identidade\/assets\/recorte-foto-real\.js\?rev=[a-f0-9]{16}/);
  assert.match(html,/\/identidade\/assets\/recorte-foto-real\.css/);
 }
 const shared=ler('src/producao/recorte-foto-compartilhado.js');
 const server=ler('src/producao/interface-aprovada-loop.js');
 assert.match(server,/recorte-foto-compartilhado\.js/);
 assert.match(server,/recorte-foto-compartilhado\.css/);
 assert.match(shared,/Recortar foto \(opcional\)/);
 assert.match(shared,/input\[type=file\]\[accept\*="image\/"\]/);
 assert.match(shared,/MutationObserver\(descobrir\)/);
 assert.match(shared,/if\(input\.id==='arquivoFotoPerfil'\|\|input\.closest\?\.\('#formFotoPerfil'\)\)return/);
 assert.doesNotMatch(shared,/loop03AlterarFotoTopo/);
 assert.match(shared,/input\.dataset\.recorteNativo==='sim'/);
 assert.match(shared,/new DataTransfer\(\)/);
 assert.match(shared,/entrada\.dispatchEvent\(new Event\('change'/);
 assert.match(shared,/canvas\.toBlob/);
 assert.match(shared,/formato\.value/);
 assert.match(shared,/const leitor=new FileReader\(\)/);
 assert.doesNotMatch(shared,/createObjectURL/);
});
