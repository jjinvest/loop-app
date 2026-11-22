'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const express=require('express');
const fs=require('node:fs');
const {BannersEscritorioCandidatoSQLite}=require('../src/domain/banners-escritorio-candidato-sqlite');
const {BannersLojaAkitemmRealSQLite}=require('../src/producao/banners-loja-akitemm-real-sqlite');
const {montarBannersEscritorioReal}=require('../src/producao/banners-escritorio-real');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64');

test('operador descarta extras sem tocar em quatro bases nem AKITEMM',async t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const akitemm=new BannersLojaAkitemmRealSQLite({banco});
 const app=express(),origem='https://akitemmloop.example.invalid';
 const sessaoOperador=req=>req.get('x-test-operador')==='sim'?
  {role:'ADMIN_COMERCIAL',csrf:'csrf-teste-operador-real'}:null;
 montarBannersEscritorioReal(app,{banco,origem,sessaoOperador,
  protegidoLoja:(req,res,next)=>req.get('x-test-cliente')==='sim'||
   sessaoOperador(req)?next():res.status(401).json({erro:'LOGIN_OBRIGATORIO'})});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const cliente={'x-test-cliente':'sim'};
 const operador={'x-test-operador':'sim',origin:origem,
  'X-Loop-Admin-Csrf':'csrf-teste-operador-real'};
 const requisitar=(url,method='GET',headers={})=>
  fetch(base+url,{method,headers});
 const slots=async()=> (await (await requisitar('/api/loop/banners','GET',cliente)).json()).slots;
 const adicionar=()=>requisitar('/api/admin/loop/banners/adicionar','POST',operador);
 assert.deepEqual((await slots()).map(x=>x.slot),[1,2,3,4]);
 assert.equal((await adicionar()).status,200);
 assert.equal((await adicionar()).status,200);
 assert.deepEqual((await slots()).map(x=>x.slot),[1,2,3,4,5,6]);
 const banners=new BannersEscritorioCandidatoSQLite({banco});
 banners.salvar({slot:6,mime:'image/png',bytes:PNG,revisaoEsperada:0});
 banners.configurarMosaico({slot:6,colunas:3,modo:'PREENCHER',revisaoEsperada:1});
 for(const pos of [2,3]){
  const rev=banners.listar().slots.find(x=>x.slot===6).revisao;
  banners.salvarFotoMosaico({slot:6,posicao:pos,mime:'image/png',bytes:PNG,
   revisaoEsperada:rev});
 }
 assert.equal(banners.listar().slots.find(x=>x.slot===6).publicado,true);
 const descartar=(slot,rev,auth=operador)=>
  requisitar('/api/admin/loop/banners/'+slot,'DELETE',
   {...auth,'X-Banner-Revisao-Esperada':String(rev)});
 assert.equal((await descartar(6,0,cliente)).status,401);
 assert.equal((await descartar(6,0,{...operador,origin:'https://falso.invalid'})).status,403);
 assert.equal((await descartar(1,0)).status,403,'os quatro originais são protegidos');
 assert.equal((await descartar(6,0)).status,409,'revisão defasada não exclui');
 const rev6=banners.listar().slots.find(x=>x.slot===6).revisao;
 assert.equal((await descartar(6,rev6)).status,200);
 assert.deepEqual((await slots()).map(x=>x.slot),[1,2,3,4,5]);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_banner_mosaico_foto WHERE slot=6').get().n,0);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_banner_mosaico_layout WHERE slot=6').get().n,0);
 assert.equal((await descartar(5,0)).status,200);
 assert.deepEqual((await slots()).map(x=>x.slot),[1,2,3,4]);
 assert.equal((await adicionar()).status,200);
 assert.deepEqual((await slots()).map(x=>x.slot),[1,2,3,4,5]);
 assert.deepEqual(akitemm.listar().slots.map(x=>x.slot),[1,2,3,4]);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('no cliente apenas publicados; lixeira exclusiva dos extras do operador',()=>{
 const codigo=fs.readFileSync(require.resolve(
  '../src/producao/banners-escritorio-real-client.js'),'utf8');
 const css=fs.readFileSync(require.resolve(
  '../src/producao/banners-editor-real.css'),'utf8');
 assert.match(codigo,/const mostrar=editavel\|\|slot\.publicado;/);
 assert.match(codigo,/slot\.slot>4/);
 assert.match(codigo,/lixeira\.hidden=!editavel/);
 assert.match(codigo,/descartarBotao\.hidden=slotEditor<=4/);
 assert.match(codigo,/window\.confirm\(/);
 assert.match(codigo,/slotsAtuais/);
 assert.match(css,/\.loop03-banner-lixeira\[hidden\]/);
});
