'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AsaasSandboxPixOutReadOnly}=
 require('../src/producao/adaptadores-psp-readonly');
const {coletarExtratoReadOnly,fontesCandidatasExtrato,validarPeriodo}=
 require('../src/producao/contrato-extratos-readonly');
const chave='$aact_hmlg_'+('X'.repeat(50));
const periodo={inicio:'2026-11-01',fim:'2026-11-09'};
function resposta(status,body){
 const b=JSON.stringify(body);
 return {status,headers:{get:()=>String(Buffer.byteLength(b))},
  text:async()=>b};
}
test('Asaas consulta extrato paginado GET com datas fixas e sem segredo no retorno',async()=>{
 const requisicoes=[];
 const extrato=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async(url,opcoes)=>{
   requisicoes.push({url,opcoes});
   if(url.includes('offset=0&limit=2'))
    return resposta(200,{data:[
     {id:'item_101',type:'PAYMENT_RECEIVED',value:250},
     {id:'item_102',type:'PAYMENT_FEE',value:-5}
    ],hasMore:true,totalCount:3});
   if(url.includes('offset=2&limit=2'))
    return resposta(200,{data:[
     {id:'item_103',type:'PIX_TRANSACTION_CREDIT',value:15}
    ],hasMore:false,totalCount:3});
   throw Error('PAGINA_INESPERADA');
  }
 });
 const r=await extrato.consultarExtratoPaginado({...periodo,limite:2});
 assert.equal(r.paginas,2);
 assert.equal(r.totalRegistros,3);
 assert.equal(r.registros[1].centavosExatosInformados,-500);
 assert.equal(r.registros[0].classificacao,'SOMENTE_EXTRATO_SANDBOX');
 assert.equal(r.liquidacaoRealCertificada,false);
 assert.equal(r.contaTitularComprovada,false);
 assert.equal(r.permiteSaqueReal,false);
 assert.equal(JSON.stringify(r).includes('access_token'),false);
 assert.equal(requisicoes.length,2);
 assert.ok(requisicoes.every(x=>x.opcoes.method==='GET'&&
  x.opcoes.body===undefined&&x.opcoes.redirect==='error'&&
  x.opcoes.headers.access_token===chave&&
  x.url.startsWith('https://api-sandbox.asaas.com/v3/financialTransactions?')&&
  x.url.includes('startDate=2026-11-01&finishDate=2026-11-09')));
});
test('tipos novos do Asaas nao quebram importacao, mas ficam em quarentena',async()=>{
 const result=await coletarExtratoReadOnly({
  origem:'ASAAS_SANDBOX',...periodo,
  consultarPagina:async()=>({hasMore:false,totalCount:2,data:[
   {id:'txn_001',type:'PRODUTO_NOVO_2026',value:10},
   {id:'txn_002',type:'TRANSFER',value:1.1234}
  ]})
 });
 assert.equal(result.tiposNaoClassificados,2);
 assert.equal(result.registros[0].classificacao,'TIPO_NAO_CLASSIFICADO');
 assert.equal(result.registros[1].classificacao,'VALOR_INDETERMINADO');
 assert.equal(result.liquidacaoRealCertificada,false);
});
test('pagina 2 ausente, sobreposta ou contagem mutante falham sem resultado parcial',async()=>{
 await assert.rejects(coletarExtratoReadOnly({
  origem:'ASAAS_SANDBOX',...periodo,maxPaginas:1,limite:1,
  consultarPagina:async()=>({data:[{id:'txn_1',type:'TRANSFER',value:25}],
   hasMore:true,totalCount:2})
 }),{codigo:'EXTRATO_INCOMPLETO_LIMITE_PAGINAS'});
 await assert.rejects(coletarExtratoReadOnly({
  origem:'ASAAS_SANDBOX',...periodo,limite:1,
  consultarPagina:async({offset})=>({
   data:[{id:'txn_1',type:'TRANSFER',value:25}],
   hasMore:offset===0,totalCount:2
  })
 }),{codigo:'EXTRATO_ITEM_DUPLICADO_ENTRE_PAGINAS'});
 await assert.rejects(coletarExtratoReadOnly({
  origem:'ASAAS_SANDBOX',...periodo,
  consultarPagina:async()=>({data:[],hasMore:false,totalCount:1})
 }),{codigo:'EXTRATO_TOTAL_PAGINACAO_DIVERGENTE'});
});
test('ambientes, dados e endpoints maliciosos nao entram no extrato',async()=>{
 const cli=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async()=>resposta(403,{})
 });
 await assert.rejects(cli.consultarExtratoPaginado(periodo),
  {codigo:'PORTAS_SANDBOX_SEM_PERMISSAO'});
 await assert.rejects(cli.consultarExtratoPaginado({
  inicio:'2026-11-01',fim:'2026-11-01?redirect=https://evil.invalid'
 }),{codigo:'EXTRATO_DATA_INVALIDA'});
 assert.throws(()=>validarPeriodo({
  inicio:'2026-02-30',fim:'2026-03-01'
 }),{codigo:'EXTRATO_DATA_INVALIDA'});
 assert.throws(()=>validarPeriodo({
  inicio:'2025-01-01',fim:'2026-11-09'
 }),{codigo:'EXTRATO_PERIODO_INVALIDO'});
 await assert.rejects(coletarExtratoReadOnly({
  origem:'INTER_REAL',...periodo,consultarPagina:async()=>({})
 }),{codigo:'EXTRATO_CONTRATO_INVALIDO'});
 const fontes=fontesCandidatasExtrato();
 assert.equal(fontes.INTER.dadosDeContaRealDisponiveis,false);
 assert.equal(fontes.MERCADO_PAGO.apenasGetSuficiente,false);
 assert.equal(fontes.ASAAS.contaRealHomologada,false);
 const old=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  await assert.rejects(cli.consultarExtratoPaginado(periodo),
   {codigo:'PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO'});
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
 }
});
