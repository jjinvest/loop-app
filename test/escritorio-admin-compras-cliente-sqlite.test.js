'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/routes/admin-escritorio-demo.js'),'utf8');
test('Compras individuais do escritorio consultam SQLite sem simular vinculacoes',()=>{
 assert.match(src,/router\.get\('\/escritorio-demo\/clientes\/:id\/compras'/);
 assert.match(src,/FROM admin_ponte_compras_demo/);
 assert.match(src,/WHERE conta_id=\?/);
 assert.match(src,/SELECT COUNT\(\*\) AS n FROM admin_ponte_compras_demo/);
 assert.match(src,/semPagamentosReais:true/);
 assert.match(src,/ciclos:'NAO_CONCILIADOS_NESTA_CONSULTA'/);
 assert.match(src,/FROM admin_ponte_posicoes_adicionais_demo/);
 assert.match(src,/posicoesAdicionais:possuiPosicoesAdicionais\?'CONCILIADAS_SQLITE':'TABELA_AUSENTE'/);
 assert.match(src,/compras:comprasComPosicoes/);
});
