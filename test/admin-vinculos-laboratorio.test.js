'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const TOKEN='somente-laboratorio-com-segredo-longo-12345678';
function produto(id,tipo='FISICO'){
  return {id,nome:'Produto de laboratorio',tipo,estado:'RASCUNHO',
    descricao:'Descricao para testar codigo SKU',precoCentavos:null,
    entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
    fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
async function ambiente(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-api-vinculo-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const repo=new RepositorioCatalogoSQLite({caminho:path.join(dir,'catalogo.sqlite')});
  t.after(()=>repo.fechar());
  for(const p of [produto('produto-a'),produto('produto-b'),produto('curso-pdf','PDF')]){
    repo.salvar({produto:p,revisaoEsperada:0});
  }
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  return {url:'http://127.0.0.1:'+server.address().port,repo};
}
async function chamar(url,rota,opts={}){
  const resp=await fetch(url+'/api/admin'+rota,{
    method:opts.method||'GET',
    headers:{...(opts.token===false?{}:{Authorization:'Bearer '+(opts.token||TOKEN)}),
      ...(opts.body?{'Content-Type':'application/json'}:{})},
    ...(opts.body?{body:JSON.stringify(opts.body)}:{})
  });
  return {status:resp.status,body:await resp.json()};
}
test('painel permite vincular, trocar e desativar fornecedor mantendo produto',async t=>{
  const {url,repo}=await ambiente(t);
  const base='/produtos/produto-a/fornecedor';
  assert.deepEqual((await chamar(url,base)).body.vinculo,null);
  const a=await chamar(url,base,{method:'PUT',body:{
    fornecedorId:'franquia_A',sku:'PRODUTO_001',revisaoEsperada:0
  }});
  assert.equal(a.status,200);
  assert.equal(a.body.vinculo.revisao,1);
  const b=await chamar(url,base,{method:'PUT',body:{
    fornecedorId:'franquia_B',sku:'ITEM-ABC',revisaoEsperada:1
  }});
  assert.equal(b.status,200);
  assert.equal(b.body.vinculo.fornecedorId,'franquia_B');
  const historico=await chamar(url,base+'/historico');
  assert.deepEqual(historico.body.eventos.map(x=>x.acao),['VINCULADO','SUBSTITUIDO']);
  const off=await chamar(url,base+'/desativar',{method:'POST',body:{revisaoEsperada:2}});
  assert.equal(off.status,200);
  assert.equal(off.body.vinculo.ativo,false);
  assert.equal(repo.buscar('produto-a').id,'produto-a');
  assert.equal(repo.buscar('produto-a').compraDisponivel,false);
  assert.equal(repo.buscarRegistro('produto-a').revisao,1);
  assert.equal((await chamar(url,base+'/historico')).body.eventos.length,3);
});

test('protecoes de laboratorio exigem chave e rejeitam edicoes conflitantes',async t=>{
  const {url}=await ambiente(t);
  const base='/produtos/produto-a/fornecedor';
  assert.equal((await chamar(url,base,{token:false})).status,401);
  assert.equal((await chamar(url,base,{token:'incorreta'})).status,401);
  const dados={fornecedorId:'franquia',sku:'SKU_001',revisaoEsperada:0};
  assert.equal((await chamar(url,base,{method:'PUT',token:false,body:dados})).status,401);
  assert.equal((await chamar(url,base,{method:'PUT',body:{...dados,apiKey:'PROIBIDO'}})).status,400);
  assert.equal((await chamar(url,base,{method:'PUT',body:dados})).status,200);
  assert.equal((await chamar(url,base,{method:'PUT',body:{
    fornecedorId:'nova',sku:'SKU_002',revisaoEsperada:0
  }})).status,409);
  assert.equal((await chamar(url,'/produtos/produto-b/fornecedor',{method:'PUT',body:dados})).status,409);
  assert.equal((await chamar(url,'/produtos/curso-pdf/fornecedor',{method:'PUT',body:{
    fornecedorId:'franquia',sku:'PDF_001',revisaoEsperada:0
  }})).status,400);
  assert.equal((await chamar(url,'/produtos/inexistente/fornecedor')).status,404);
  const publicResp=await fetch(url+'/catalogo');
  const content=await publicResp.text();
  assert.doesNotMatch(content,/franquia|SKU_001|apiKey|revisao/);
});
