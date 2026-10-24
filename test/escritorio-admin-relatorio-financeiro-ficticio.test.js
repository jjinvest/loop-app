'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Escritorio admin mostra livro financeiro ficticio autenticado sem saldo bancario',()=>{
 const base=path.join(__dirname,'../src/laboratorio');
 const html=fs.readFileSync(path.join(base,'admin-loop03.html'),'utf8');
 const js=fs.readFileSync(path.join(base,'admin-loop03.js'),'utf8');
 const ids=['finLotesAdmin','finLancamentosAdmin','finSaldoAdmin','finConciliacaoAdmin','finCofresAdmin','finStatusAdmin'];
 for(const id of ids){assert.match(html,new RegExp('id="'+id+'"'));assert.ok(js.includes("$('"+id+"')"));}
 assert.ok(js.includes("'/api/admin/livro-financeiro-demo'"));
 assert.ok(js.includes("Authorization:'Bearer '+token"));
 assert.ok(js.includes('d.pagamentosReais!==false||d.saldosReais!==false'));
 assert.ok(js.includes("carregarFinanceiro()"));
 assert.match(html,/Não somar com pedidos AKITEMM/);
 assert.match(html,/Saldos projetados, não bancários/);
 assert.match(html,/Não conciliada/);
});
