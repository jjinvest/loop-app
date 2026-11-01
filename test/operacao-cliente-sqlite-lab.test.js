'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {consultarOperacaoClienteLab}=require('../src/domain/operacao-cliente-sqlite-lab');
test('admin le pedido, Asaas, posicao e ciclos corretos do mesmo SQLite, com paginacao e sem gravar',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-admin-operacao-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 await executar({total:12,pasta});
 const m=await abrirLaboratorio(path.join(pasta,'laboratorio.sqlite'));
 t.after(()=>m.fechar());
 const cliente=m.banco.prepare('SELECT conta_id id,posicao_centro posicaoId FROM loop_v6_provisoes_ciclos WHERE giro=2').get();
 const rota=m.base+'/api/admin/escritorio-demo/clientes/'+cliente.id+'/operacao';
 const headers={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
 assert.equal((await fetch(rota)).status,401);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const r=await fetch(rota+'?limite=1&offset=0',{headers});assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.cliente.id,cliente.id);assert.equal(d.pedidos.total,1);
 assert.equal(d.pedidos.itens[0].valorCentavos,25000);
 assert.equal(d.pedidos.itens[0].pagamentoSandbox.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.deepEqual(d.pedidos.itens[0].posicoes,[cliente.posicaoId]);
 assert.equal(d.pedidos.itens[0].eventoQueFinanciouCiclo.giro,1);
 assert.equal(d.ciclosCentro.itens[0].giro,2);
 assert.equal(d.ciclosCentro.itens[0].previstoCentavos,75000);
 assert.equal(d.disponivelParaSaqueRealCentavos,0);
 assert.equal(d.somenteLeitura,true);
 const segunda=await(await fetch(rota+'?limite=1&offset=1',{headers})).json();
 assert.equal(segunda.pedidos.total,1);assert.deepEqual(segunda.pedidos.itens,[]);
 for(const query of ['?limite=101','?offset=-1','?limite=1&limite=2','?contaId=outra'])
  assert.equal((await fetch(rota+query,{headers})).status,400);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 // A mesma projecao funciona com conexao SQLite realmente somente leitura.
 const {DatabaseSync}=require('node:sqlite');
 const leitura=new DatabaseSync(path.join(pasta,'laboratorio.sqlite'),{readOnly:true});
 try{
  const propria=consultarOperacaoClienteLab({banco:leitura,contaId:cliente.id});
  assert.equal(propria.ciclosCentro.total,1);
 }finally{leitura.close();}
});
