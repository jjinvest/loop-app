'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {orientar}=require('../src/laboratorio/educacao-carrinho-loop-v6');

test('ensino no carrinho: compras anteriores nao somam, R$180 mostra faltar R$70',()=>{
 const r=orientar({itens:1,totalElegivelCentavos:18000});
 assert.equal(r.estado,'AINDA_NAO_QUALIFICA');
 assert.equal(r.faltamCentavos,7000);
 assert.match(r.mensagem,/Faltam R\$\s*70,00/);
 assert.match(r.mensagem,/Compras finalizadas em pedidos separados não se acumulam/);
 assert.doesNotMatch(r.mensagem,/lucro|imposto|frete|fornecedor|margem/i);
});
test('ensino no carrinho: 2x R$190 no mesmo pedido atinge minimo de R$250',()=>{
 const r=orientar({itens:1,totalElegivelCentavos:38000});
 assert.equal(r.estado,'PEDIDO_POTENCIAL');
 assert.equal(r.faltamCentavos,0);
 assert.equal(r.progressoCentavos,25000);
 assert.match(r.mensagem,/pagamento confirmado/);
 assert.match(r.mensagem,/demais regras do LOOP/);
});
test('itens nao elegiveis nao contam para minimo do LOOP',()=>{
 const r=orientar({itens:3,totalElegivelCentavos:12000});
 assert.equal(r.estado,'AINDA_NAO_QUALIFICA');
 assert.equal(r.faltamCentavos,13000);
});
test('carrinho vazio e pacote especial tem textos diferentes',()=>{
 assert.equal(orientar().estado,'CARRINHO_VAZIO');
 const p=orientar({itens:1,totalElegivelCentavos:250000,
  valorPacoteEspecialCentavos:150000});
 assert.equal(p.estado,'PACOTE_POTENCIAL');
 assert.equal(p.minimoCentavos,150000);
 assert.match(p.mensagem,/pacote especial/i);
});
test('dados monetarios invalidos sao recusados sem calculo estimado',()=>{
 assert.throws(()=>orientar({itens:1,totalElegivelCentavos:-10}));
 assert.throws(()=>orientar({itens:1,totalElegivelCentavos:10.5}));
});
