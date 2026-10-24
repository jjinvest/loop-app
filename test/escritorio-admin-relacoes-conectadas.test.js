'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const rota=fs.readFileSync(path.join(root,'src/routes/admin-escritorio-demo.js'),'utf8');
const tela=fs.readFileSync(path.join(root,'src/laboratorio/admin-loop03.html'),'utf8');
const script=fs.readFileSync(path.join(root,'src/laboratorio/admin-loop03.js'),'utf8');
test('Cenario demonstrativo nao cria posicao sem valor minimo e ativacao',()=>{
 assert.match(rota,/valorMinimoCentavos=25000/);
 assert.match(rota,/totalCentavos>=valorMinimoCentavos&&p\.termosAceitos&&p\.ativacaoIndividual/);
 assert.match(rota,/v\.posicaoAtivavel&&v\.clienteId===p\.clienteId/);
 assert.match(rota,/clienteId:pedidos\.find\(v=>v\.id===p\.pedidoId\)\.clienteId/);
 assert.match(rota,/clienteId:posicoes\.find\(p=>p\.id===x\.posicaoId\)\.clienteId/);
});
test('Departamentos compartilham IDs e deixam simulacao visivel',()=>{
 assert.match(tela,/departamentosConectadosAdmin/);
 assert.match(tela,/SIMULAÇÃO ISOLADA/);
 assert.match(script,/Inconsistência entre clientes, pedidos, posições e ciclos/);
 assert.match(script,/posicoes\.get\(x\.posicaoId\)\.clienteId!==x\.clienteId/);
});
