'use strict';
// Teste de CONVERGENCIA entre departamentos apos restart real SQLite.
// 12 compras HTTP e Asaas FICTICIO, nunca usa secrets ou PSP externo.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
async function consultar(m,recurso){
 const r=await fetch(m.base+'/api/admin/'+recurso,{
  headers:ADMIN,cache:'no-store'});
 assert.equal(r.status,200,recurso);
 assert.equal(r.headers.get('cache-control'),'no-store',recurso);
 return r.json();
}
test('Escritorio integra clientes, compras, Asaas, posicoes, filas, ciclos, cofres e saques no SQLite reaberto',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-escritorio-convergencia-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const laboratorio=await executar({total:12,pasta:dir});
 assert.equal(laboratorio.clientesSequenciais,12);
 assert.equal(laboratorio.giros,2);
 assert.equal(laboratorio.eventosDocumentados,12);
 const m=await abrirLaboratorio(path.join(dir,'laboratorio.sqlite'));
 t.after(()=>m.fechar());
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const url=m.base+'/api/admin/financeiro-operacional-lab';
 assert.equal((await fetch(url)).status,401);
 const [clientes,auditoria,asaas,motor,financeiro,razao]=await Promise.all([
  consultar(m,'escritorio-demo/clientes'),
  consultar(m,'escritorio-demo/auditoria-operacional'),
  consultar(m,'asaas-conciliacao-lab'),
  consultar(m,'circuit-break-v6-demo/ponte'),
  consultar(m,'financeiro-operacional-lab'),
  consultar(m,'livro-financeiro-demo')
 ]);
 assert.equal(clientes.total,12);
 assert.equal(clientes.clientesComPosicoesCriadas,12);
 assert.equal(clientes.clientesSomenteLoja,0);
 assert.deepEqual(clientes.clientesPorTipoProduto,{PDF:12,FISICO:0});
 assert.equal(auditoria.clientes,12);
 assert.equal(auditoria.pedidosCarrinho,12);
 assert.equal(auditoria.posicoesOriginadasDeCompras,12);
 assert.equal(asaas.cobrancas,12);
 assert.equal(asaas.pedidosComPosicao,12);
 assert.equal(asaas.recebimentosInformados,12);
 assert.equal(asaas.revisaoManualIndicada,false);
 assert.equal(asaas.pagamentosReais,false);
 assert.equal(motor.girosConcluidos,2);
 assert.equal(financeiro.ciclos.quantidade,2);
 assert.equal(financeiro.eventos.quantidade,12);
 assert.equal(financeiro.parcelas.quantidade,6);
 assert.equal(financeiro.ciclos.previstoCentavos,150000);
 assert.equal(financeiro.bancoConciliado,false);
 assert.equal(financeiro.saquesReais,false);
 assert.equal(financeiro.saldosSacaveisReaisCentavos,0);
 assert.equal(razao.pagamentosReais,false);
 assert.equal(razao.saldosReais,false);
 // Nao confundir conta do ciclo com pedido que financiou evento anterior.
 const conta=m.banco.prepare(
  "SELECT id FROM admin_contas_participantes_demo WHERE nome='Cliente Sequencial 1'"
 ).get();
 assert.ok(conta?.id);
 const ficha=await consultar(m,'escritorio-demo/clientes/'+conta.id+'/operacao?limite=20&offset=0');
 assert.equal(ficha.cliente.id,conta.id);
 assert.equal(ficha.pedidos.total,1);
 assert.equal(ficha.pedidos.itens[0].pagamentoSandbox.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(ficha.pedidos.itens[0].posicoes.length,1);
 assert.equal(ficha.somenteLeitura,true);
 assert.equal(ficha.disponivelParaSaqueRealCentavos,0);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
