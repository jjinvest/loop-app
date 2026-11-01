'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
test('ensaio HTTP pode retomar o SQLite sem repetir compra, ativacao, indicacao, aporte ou giro',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-http-retomada-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const primeira=await executar({total:12,pasta});
 const retomada=await executar({total:12,pasta,retomar:true});
 for(const campo of ['pedidos','posicoes','ativacoesIndividuais','indicacoes','giros',
  'eventosDocumentados','faturamentoBrutoFicticioCentavos','posicoesAtivas'])
  assert.equal(retomada[campo],primeira[campo],campo);
 assert.deepEqual(retomada.conciliacaoCofres,primeira.conciliacaoCofres);
 assert.equal(retomada.retomadaDeProcesso,true);
 assert.equal(retomada.giros,2);
 assert.equal(retomada.pagamentosReais,0);
});
