'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {BannersLojaAkitemmRealSQLite}=
 require('../src/producao/banners-loja-akitemm-real-sqlite');
const {BannersEscritorioCandidatoSQLite}=
 require('../src/domain/banners-escritorio-candidato-sqlite');
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7sAAAAASUVORK5CYII=','base64');
const nova=t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 return {db,loja:new BannersLojaAkitemmRealSQLite({banco:db}),
  escritorio:new BannersEscritorioCandidatoSQLite({banco:db})};
};
test('quatro banners da AKITEMM são independentes dos quatro banners do LOOP',t=>{
 const {db,loja,escritorio}=nova(t);
 assert.equal(loja.listar().quantidadeMaxima,4);
 assert.deepEqual(loja.listar().slots.map(x=>x.slot),[1,2,3,4]);
 assert.ok(loja.listar().slots.every(x=>!x.temImagem));
 assert.ok(escritorio.listar().slots.every(x=>!x.temImagem));
 const salvo=loja.salvar({slot:1,mime:'image/png',bytes:PNG,
  revisaoEsperada:0,enquadramento:'INTEIRA'});
 assert.equal(salvo.slots[0].revisao,1);
 assert.equal(salvo.slots[0].temImagem,true);
 assert.equal(salvo.slots[0].enquadramento,'INTEIRA');
 assert.deepEqual(loja.imagem(1),{mime:'image/png',bytes:PNG});
 assert.ok(escritorio.listar().slots.every(x=>!x.temImagem),
  'salvar na AKITEMM não altera nenhuma imagem do LOOP');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('trocar a ordem mantém foto e enquadramento, inclusive após reiniciar serviço',t=>{
 const {db,loja}=nova(t);
 loja.salvar({slot:1,mime:'image/png',bytes:PNG,
  revisaoEsperada:0,enquadramento:'INTEIRA'});
 const duas=loja.salvar({slot:2,mime:'image/png',bytes:PNG,
  revisaoEsperada:0,enquadramento:'PREENCHER'});
 const movidas=loja.trocar({
  origem:1,destino:2,revisaoOrigem:1,revisaoDestino:1
 });
 assert.equal(movidas.slots[0].enquadramento,'PREENCHER');
 assert.equal(movidas.slots[1].enquadramento,'INTEIRA');
 assert.equal(movidas.slots[0].revisao,2);
 assert.equal(movidas.slots[1].revisao,2);
 assert.deepEqual(loja.imagem(2).bytes,PNG);
 const reload=new BannersLojaAkitemmRealSQLite({banco:db});
 assert.deepEqual(reload.listar(),loja.listar());
 assert.throws(()=>reload.trocar({
  origem:1,destino:2,revisaoOrigem:1,revisaoDestino:2
 }),{codigo:'BANNER_LOJA_CONFLITO_REVISAO'});
 assert.equal(reload.listar().slots[0].revisao,2);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('editar enquadramento, substituir e remover só um slot',t=>{
 const {loja}=nova(t);
 loja.salvar({slot:3,mime:'image/png',bytes:PNG,revisaoEsperada:0});
 const f=loja.enquadrar({slot:3,revisaoEsperada:1,enquadramento:'INTEIRA'});
 assert.equal(f.slots[2].revisao,2);
 assert.equal(f.slots[2].enquadramento,'INTEIRA');
 assert.throws(()=>loja.salvar({slot:3,mime:'image/png',bytes:PNG,
  revisaoEsperada:0}),{codigo:'BANNER_LOJA_CONFLITO_REVISAO'});
 assert.throws(()=>loja.salvar({slot:4,mime:'image/png',
  bytes:Buffer.alloc(120,3),revisaoEsperada:0
 }),{codigo:'BANNER_LOJA_IMAGEM_INVALIDA'});
 loja.salvar({slot:4,mime:'image/png',bytes:PNG,revisaoEsperada:0});
 assert.equal(loja.remover({slot:3,revisaoEsperada:2}).slots[2].temImagem,false);
 assert.equal(loja.listar().slots[3].temImagem,true);
 assert.deepEqual(loja.imagem(4).bytes,PNG);
 assert.throws(()=>loja.imagem(3),{codigo:'BANNER_LOJA_SEM_IMAGEM'});
});
test('loja preserva formato original e upload depende da sessão de operador',()=>{
 const root=path.join(__dirname,'..');
 const src=p=>readFileSync(path.join(root,p),'utf8');
 const html=require('../src/producao/interface-aprovada-loop').renderizarLojaAprovada();
 const front=src('src/producao/banners-loja-akitemm-client.js');
 const back=src('src/producao/gateway-admin-comercial.js');
 const css=src('src/candidato/vitrine-horizontal.css');
 assert.match(html,/akitemm-banner-conteudo/);
 assert.match(html,/identidade\/assets\/loja-banners\.js/);
 assert.match(front,/api\/loja\/banners/);
 assert.match(front,/api\/operador\/estado/);
 assert.match(front,/visaoCliente/);
 assert.match(front,/atualizarAcesso/);
 assert.match(front,/escolher\.click\(\)/);
 assert.match(front,/api\/admin\/akitemm\/banners/);
 assert.match(front,/Mover para esquerda/);
 assert.match(front,/Mover para direita/);
 assert.match(back,/proteger,validarCsrf,corpoBanner/);
 assert.match(back,/app\.post\('\/api\/admin\/akitemm\/banners\/trocar'/);
 assert.match(css,/akitemm-banner-com-foto/);
 assert.match(css,/aspect-ratio:2\/1/);
});
