'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
test('retomada recupera preparacao interrompida depois do cadastro e antes do primeiro pedido',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-http-inicio-interrompido-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const m=await abrirLaboratorio(path.join(pasta,'laboratorio.sqlite'));
 const primeira=m.contas.cadastrar({nome:'Cliente Sequencial 1',email:'sequencial-1@example.invalid',
  senha:'senha-ficticia-ensaio-sequencial-2026'});
 await m.fechar();
 const r=await executar({total:12,pasta,retomar:true});
 assert.equal(r.pedidos,12);assert.equal(r.posicoes,12);assert.equal(r.giros,2);
 const {DatabaseSync}=require('node:sqlite');const b=new DatabaseSync(path.join(pasta,'laboratorio.sqlite'),{readOnly:true});
 try{assert.equal(b.prepare('SELECT id FROM admin_contas_participantes_demo WHERE nome=?').get('Cliente Sequencial 1').id,primeira.contaId);}
 finally{b.close();}
});
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
