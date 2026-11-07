'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const express=require('express');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {criarRouterAdminEconomiaAkitemm}=
 require('../src/producao/rotas-admin-economia-akitemm');
const ORIGEM='https://admin.example.invalid';
function fixture(t){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false
 });
 catalogo.criarProduto({produtoId:'camiseta',titulo:'Camiseta'});
 catalogo.vincularOferta({produtoId:'camiseta',distribuidorId:'wedrop',
  sku:'WD_001',precoUnitCentavos:19000});
 const controle=new ControleEconomicoLojaSQLite({banco:db});
 return {db,controle};
}
test('rotas de custos reais só são criadas com autorização e CSRF administrativo',t=>{
 const {controle}=fixture(t);
 assert.throws(()=>criarRouterAdminEconomiaAkitemm({
  controle,origemHttps:ORIGEM
 }),{codigo:'ADMIN_REAL_SEM_AUTORIZACAO'});
 assert.throws(()=>criarRouterAdminEconomiaAkitemm({
  controle,origemHttps:'http://localhost:3000',
  autorizarAdministrador:(_req,_res,next)=>next(),
  validarCsrfAdmin:(_req,_res,next)=>next()
 }),{codigo:'ORIGEM_ADMIN_REAL_INVALIDA'});
});
test('admin edita custo sem disponibilizar números ao cliente, exporta dados ao contador',async t=>{
 const {controle}=fixture(t);
 const app=express();
 const autorizarAdministrador=(req,res,next)=>
  req.get('x-sessao-admin-teste')==='AUTORIZADA'?
   next():res.status(401).json({erro:'ADMIN_OBRIGATORIO'});
 const validarCsrfAdmin=(req,res,next)=>
  req.get('x-csrf-admin-teste')==='CORRETO'?
   next():res.status(403).json({erro:'CSRF_ADMIN_INVALIDO'});
 app.use('/api/admin/comercial',criarRouterAdminEconomiaAkitemm({
  controle,origemHttps:ORIGEM,autorizarAdministrador,validarCsrfAdmin
 }));
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(ok=>srv.close(ok)));
 const url='http://127.0.0.1:'+srv.address().port+'/api/admin/comercial';
 const cliente=await fetch(url+'/produtos-valores',{headers:{
  Cookie:'loop_real_s=qualquer-token'
 }});
 assert.equal(cliente.status,401);
 assert.equal((await cliente.text()).includes('19000'),false);
 const headers={'x-sessao-admin-teste':'AUTORIZADA'};
 const autorizado=await fetch(url+'/produtos-valores',{headers});
 assert.equal(autorizado.status,200);
 const dados=await autorizado.json();
 assert.equal(dados.impostosCalculados,false);
 assert.equal(dados.profitLiquidoCalculado,false);
 assert.equal(dados.ofertas[0].precoVendaCentavos,19000);
 assert.equal(dados.ofertas[0].custoFornecedorCentavos,null);
 const body=JSON.stringify({custoUnitCentavos:12000,revisaoEsperada:0});
 const post=(more={})=>fetch(url+'/produtos-valores/camiseta/wedrop',{
  method:'POST',headers:{...headers,'Content-Type':'application/json',...more},
  body
 });
 assert.equal((await post()).status,403,'bloquear origem ausente');
 assert.equal((await post({Origin:ORIGEM})).status,403,'bloquear sem CSRF');
 const c=await post({Origin:ORIGEM,'x-csrf-admin-teste':'CORRETO'});
 assert.equal(c.status,200);
 const alterado=await c.json();
 assert.equal(alterado.custoFornecedorCentavos,12000);
 assert.equal(alterado.diferencaBrutaCentavos,7000);
 assert.equal(alterado.lucroLiquidoCalculado,false);
 assert.equal((await post({
  Origin:ORIGEM,'x-csrf-admin-teste':'CORRETO'
 })).status,409,'concorrência não pode sobrescrever custo antigo');
 const csv=await fetch(url+'/contador/catalogo.csv',{headers});
 assert.equal(csv.status,200);
 assert.match(csv.headers.get('content-disposition'),/attachment/);
 const conteudo=await csv.text();
 assert.match(conteudo,/"camiseta";"wedrop";"WD_001";"190,00";"120,00";"70,00"/);
 assert.equal(conteudo.includes('CPF'),false);
 assert.equal((await fetch(url+'/contador/catalogo.csv')).status,401);
});
