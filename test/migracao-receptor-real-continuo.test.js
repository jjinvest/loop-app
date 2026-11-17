'use strict';
// A origem AKITEMM continua migrando contas para o MESMO banco real depois
// de ativar o escritório; sem checkout, sem reimportação insegura e sem DNS.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {atenderMigracaoIdentidadeReal}=
 require('../src/producao/receber-migracao-identidade-real');
function arquivo(p){return readFileSync(path.join(__dirname,'..',p),'utf8');}
const rota='/internal/loop/migracao-identidade';
const env={
 LOOP_REAL_MIGRAR_IDENTIDADE:'SIM',
 LOOP_REAL_CADASTRO_GO:'NAO',
 LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
 LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN:'b'.repeat(64)
};
test('receptor único é conectado à preparação e ao motor real já ativo',()=>{
 const prep=arquivo('scripts/iniciar-identidade-real-preparacao.js');
 const real=arquivo('scripts/iniciar-identidade-real-loop.js');
 const nome='receber-migracao-identidade-real';
 assert.ok(prep.includes(nome));
 assert.ok(real.includes(nome));
 assert.ok(real.includes('atenderMigracaoIdentidadeReal(req,res,{ambiente,banco})'));
 assert.ok(!real.includes("app.post('/internal/loop/migracao-identidade'"));
});
test('recusa HTTP inválido, falta de autorização e pacote adulterado, sem alterar conta',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('CREATE TABLE custodia(id INTEGER PRIMARY KEY, marcador TEXT NOT NULL)');
 banco.prepare('INSERT INTO custodia(id,marcador) VALUES(1,?)').run('INTACTO');
 t.after(()=>banco.close());
 let ambiente={...env};
 const servidor=http.createServer((req,res)=>
  void atenderMigracaoIdentidadeReal(req,res,{ambiente,banco}));
 servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(done=>servidor.close(done)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const consultar=(method,body)=>fetch(base+rota,{
  method,headers:{'content-type':'application/json'},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 });
 const somenteGet=await consultar('GET');
 assert.equal(somenteGet.status,405);
 ambiente={...env,LOOP_REAL_MIGRAR_IDENTIDADE:'NAO'};
 const bloqueado=await consultar('POST',{version:1});
 assert.equal(bloqueado.status,503);
 assert.equal((await bloqueado.json()).erro,'MIGRACAO_REAL_BLOQUEADA');
 ambiente={...env};
 const inválido=await consultar('POST',{version:1});
 assert.equal(inválido.status,503);
 assert.equal((await inválido.json()).erro,'MIGRACAO_PACOTE_INVALIDO');
 assert.equal(banco.prepare('SELECT marcador FROM custodia WHERE id=1').get().marcador,'INTACTO');
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
