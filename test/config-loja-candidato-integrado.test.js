'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {AkitemmConfigLojaDemoSQLite}=
 require('../src/domain/akitemm-config-loja-demo-sqlite');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-config-loja-'+('S'.repeat(48));
async function request(base,url,{method='GET',body,cookie,admin=false}={}){
 const r=await fetch(base+url,{method,headers:{
  ...(body?{'Content-Type':'application/json'}:{}),
  ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
  ...(admin?{Authorization:'Bearer '+ADMIN}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};
}
async function login(base,nick){
 const senha='SenhaFicticia2026!';
 const inscricao=await request(base,'/staging/contas/cadastrar',{
  method:'POST',body:{nome:nick+' Exemplo',nick,
   email:nick.toLowerCase()+'@example.invalid',senha,aceiteExplicito:true}
 });
 assert.equal(inscricao.status,201,JSON.stringify(inscricao.body));
 const acesso=await request(base,'/staging/contas/entrar',{
  method:'POST',body:{nick,senha}
 });
 assert.equal(acesso.status,200);
 const token=acesso.cookie?.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))?.[1];
 assert.ok(token,'cookie do titular deve ser criado');
 return token;
}
test('banners, suporte, redes e informações são ligados ao admin e loja no mesmo SQLite auditado',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const app=criarAppLojaEscritorioCandidato({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  repositorioCatalogo:catalogoFicticioCheckout(),segredoOperador:ADMIN,
  termosVersao:'LAB-loja-config-2026',
  termosTexto:'Configuração editorial fictícia para homologação local, sem pagamentos, produtos entregues ou promessas financeiras.'
 }).app;
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(ok=>server.close(ok)));
 const base='http://127.0.0.1:'+server.address().port;
 const alice=await login(base,'Alice');
 const bia=await login(base,'Bia');
 const area='/staging/escritorio-unificado/loja/config';
 const vitrine='/staging/vitrine/loja/config';
 assert.equal((await request(base,vitrine)).status,401);
 assert.equal((await request(base,area)).status,401);
 const inicial=await request(base,area,{admin:true});
 assert.equal(inicial.status,200);
 assert.equal(inicial.body.revisao,0);
 assert.deepEqual(inicial.body.config.banners,[]);
 assert.equal((await request(base,area,{
  method:'PUT',body:{revisaoEsperada:0,config:inicial.body.config}
 })).status,401,'cliente nao pode alterar divulgacao');
 const config=structuredClone(inicial.body.config);
 config.informacoes.suporte='Atendimento de ensaio segunda a sexta.';
 config.informacoes.sobre='AKITEMM, loja integrante do LOOP.';
 config.informacoes.privacidade='Politica de dados em revisao no laboratorio.';
 config.redes.instagram='https://instagram.com/akitemm';
 config.banners=[
  {titulo:'Campanha ficticia de cursos',descricao:'Somente laboratorio',
   produtoId:'curso-homologacao-250',imagemCaminho:''},
  {titulo:'Novo comunicado de teste',descricao:'Sem beneficio automatico',
   produtoId:'',imagemCaminho:''}
 ];
 const salvo=await request(base,area,{method:'PUT',admin:true,
  body:{config,revisaoEsperada:0}});
 assert.equal(salvo.status,200,JSON.stringify(salvo.body));
 assert.equal(salvo.body.revisao,1);
 const visible=await request(base,vitrine,{cookie:alice});
 assert.equal(visible.status,200);
 assert.deepEqual(visible.body.config,config);
 assert.equal(visible.body.apenasEnsaio,true);
 assert.equal(visible.body.semOfertasComerciais,true);
 assert.deepEqual((await request(base,vitrine,{cookie:bia})).body.config,config);
 assert.equal((await request(base,area,{admin:true})).body.revisao,1);
 assert.equal((await request(base,area,{method:'PUT',admin:true,
  body:{config,revisaoEsperada:0}})).status,409,
 'edicao obsoleta nao pode sobrescrever configuracao');
 const invalido=structuredClone(config);
 invalido.banners[0].imagemCaminho='https://site-inseguro.example/arquivo.png';
 assert.equal((await request(base,area,{method:'PUT',admin:true,
  body:{config:invalido,revisaoEsperada:1}})).status,400);
 assert.equal((await request(base,vitrine,{cookie:alice})).body.revisao,1);
 const mod=new AkitemmConfigLojaDemoSQLite({banco});
 assert.equal(mod.consultarComRevisao().revisao,1);
 assert.equal(mod.consultar().informacoes.suporte,config.informacoes.suporte);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_akitemm_config_loja_auditoria'
 ).get().n,1);
 assert.throws(()=>banco.exec(
  'DELETE FROM admin_akitemm_config_loja_auditoria'
 ),/historico configuracao imutavel/);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
 ).get().n,0,'conteudo editorial nao cria pedido');
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});