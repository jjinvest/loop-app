'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {caminhoLinkDestino,extrairLink}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
const TOKEN='lp-0123456789abcdefabcd';
test('duas portas individuais do LOOP direcionam loja AKITEMM e escritorio sem nome Vilela global',()=>{
 const loja=caminhoLinkDestino(TOKEN,'vilela','loja');
 const escritorio=caminhoLinkDestino(TOKEN,'vilela','escritorio');
 assert.equal(loja,'/loja/convite/'+TOKEN+'/vilela');
 assert.equal(escritorio,'/escritorio/convite/'+TOKEN+'/vilela');
 assert.notEqual(loja,escritorio);
 assert.deepEqual(extrairLink(loja),{token:TOKEN,apelido:'vilela',destino:'loja'});
 assert.deepEqual(extrairLink(escritorio),{token:TOKEN,apelido:'vilela',destino:'escritorio'});
 const outros=['ana','pedro','maria'];
 for(const apelido of outros){
  const l=caminhoLinkDestino(TOKEN,apelido,'loja');
  const e=caminhoLinkDestino(TOKEN,apelido,'escritorio');
  assert.equal(extrairLink(l).token,TOKEN);
  assert.equal(extrairLink(e).token,TOKEN);
  assert.equal(extrairLink(l).destino,'loja');
  assert.equal(extrairLink(e).destino,'escritorio');
 }
 // Todos os links antigos continuam resolvidos, nao perdem rastreio.
 assert.deepEqual(extrairLink('/loja-vilela/convite/'+TOKEN+'/vilela'),
  {token:TOKEN,apelido:'vilela',destino:'loja'});
 assert.deepEqual(extrairLink('/escritorio-vilela/convite/'+TOKEN+'/vilela'),
  {token:TOKEN,apelido:'vilela',destino:'escritorio'});
});
