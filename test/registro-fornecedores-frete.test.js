'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=
 require('../src/integracoes/registro-fornecedores');

function adaptador(opcional={}){
 return {versaoContrato:CONTRATO_FORNECEDOR,
  async consultarEstoque(){return {quantidade:2};},
  async consultarStatus(){return {status:'PENDENTE'};},
  ...opcional};
}
test('sem API aprovada nao inventa nem consulta valor de frete',async()=>{
 const r=new RegistroFornecedores();
 r.registrar({fornecedorId:'franquia_teste',adaptador:adaptador()});
 await assert.rejects(r.cotarFrete({
  fornecedorId:'franquia_teste',cepDestino:'27250-010',
  itens:[{sku:'SKU_001',quantidade:2}]
 }),/FRETE_FORNECEDOR_NAO_INTEGRADO/);
});
test('cota pelo CEP e SKU diretamente no adaptador do fornecedor',async()=>{
 const r=new RegistroFornecedores();
 let recebido;
 r.registrar({fornecedorId:'franquia_teste',adaptador:adaptador({
  async cotarFrete(x){
   recebido=x;
   return {opcoes:[
    {servicoId:'PADRAO',cotacaoId:'qt_TESTE_0001',
     valorCentavos:1650,prazoDiasUteis:6,
     expiraEm:new Date(Date.now()+600000).toISOString()},
    {servicoId:'EXPRESSO',cotacaoId:'qt_TESTE_0002',
     valorCentavos:4200,prazoDiasUteis:2,
     expiraEm:new Date(Date.now()+600000).toISOString()}
   ]};
  }
 })});
 const x=await r.cotarFrete({fornecedorId:'franquia_teste',
  cepDestino:'27250-010',
  itens:[{sku:'SKU_001',quantidade:2},
   {sku:'SKU_002',quantidade:1}]});
 assert.deepEqual(recebido,{cepDestino:'27250010',
  itens:[{sku:'SKU_001',quantidade:2},{sku:'SKU_002',quantidade:1}]});
 assert.equal(x.origem,'API_DO_FORNECEDOR');
 assert.equal(x.opcoes.length,2);
 assert.equal(x.opcoes[0].valorCentavos,1650);
 assert.equal(x.opcoes[0].prazoDiasUteis,6);
 assert.equal(x.naoEhPagamento,true);
 assert.equal(x.pedidoEnviadoAoFornecedor,false);
 assert.equal(x.opcoes[0].valorCentavos+25000,26650,
  'cotacao de frete fica separada do preco de itens e da posicao LOOP');
});
test('entrada rejeita CEP, SKU, quantidade invalida e duplicacao',async()=>{
 const r=new RegistroFornecedores();
 let chamadas=0;
 r.registrar({fornecedorId:'franquia_teste',adaptador:adaptador({
  async cotarFrete(){chamadas++;throw Error('nao deve chegar aqui');}
 })});
 const args={fornecedorId:'franquia_teste',cepDestino:'27250010',
  itens:[{sku:'SKU_001',quantidade:1}]};
 for(const entrada of [
  {...args,cepDestino:'27250-000-999'},
  {...args,cepDestino:'CEP'},
  {...args,itens:[]},
  {...args,itens:[{sku:'SKU_001',quantidade:0}]},
  {...args,itens:[{sku:'SKU_001',quantidade:51}]},
  {...args,itens:[{sku:'SKU_001',quantidade:1},{sku:'SKU_001',quantidade:1}]},
  {...args,itens:[{sku:'SKU/INSEGURO',quantidade:1}]}
 ])await assert.rejects(r.cotarFrete(entrada));
 assert.equal(chamadas,0);
});
test('cotacao vencida, sem prazo, preco negativo ou servico duplicado e recusada',async()=>{
 const r=new RegistroFornecedores();
 let resposta;
 const futuro=()=>new Date(Date.now()+600000).toISOString();
 const valido=()=>({servicoId:'PADRAO',cotacaoId:'qt_TESTE_0001',
  valorCentavos:1500,prazoDiasUteis:6,expiraEm:futuro()});
 r.registrar({fornecedorId:'franquia_teste',adaptador:adaptador({
  async cotarFrete(){return resposta;}
 })});
 const req={fornecedorId:'franquia_teste',
  cepDestino:'27250010',itens:[{sku:'SKU_001',quantidade:1}]};
 for(const item of [
  {...valido(),valorCentavos:-1},
  {...valido(),prazoDiasUteis:'6'},
  {...valido(),expiraEm:new Date(Date.now()-600000).toISOString()},
  {...valido(),cotacaoId:''},
  {...valido(),servicoId:'INVALIDO /'},
 ]){
  resposta={opcoes:[item]};
  await assert.rejects(r.cotarFrete(req),/FRETE_FORNECEDOR_RESPOSTA_INVALIDA/);
 }
 resposta={opcoes:[valido(),valido()]};
 await assert.rejects(r.cotarFrete(req),/FRETE_FORNECEDOR_RESPOSTA_INVALIDA/);
});
