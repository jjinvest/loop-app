'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {executar}=require('../scripts/simular-10000-clientes-http-asaas-sqlite');
const {consultarResumoFinanceiroOperacionalLab}=require('../src/domain/resumo-financeiro-operacional-lab');
const AUTH={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
const URL='/api/admin/financeiro-operacional-lab';
test('Resumo financeiro nao confunde fonte ausente com zero e consulta sem escrever',()=>{
 const b=new DatabaseSync(':memory:');
 try{
  const vazio=consultarResumoFinanceiroOperacionalLab({banco:b});
  assert.equal(vazio.fontesAusentes.length,9);
  assert.equal(vazio.ciclos,null);
  assert.equal(vazio.bonus,null);
  assert.equal(vazio.saldosSacaveisReaisCentavos,0);
  b.exec([
   'CREATE TABLE loop_v6_provisoes_ciclos(giro INTEGER,previsto_centro INTEGER);',
   'CREATE TABLE loop_v6_provisoes_eventos(destino_cofre TEXT,referencia_centavos INTEGER);',
   'CREATE TABLE loop_v6_provisoes_parcelas(previsto_centavos INTEGER);',
   'CREATE TABLE admin_solicitacoes_saque_demo(valor_bruto_centavos INTEGER,valor_liquido_centavos INTEGER,taxa_percentual INTEGER);',
   'CREATE TABLE loop_v6_saques_centro_teste(valor_centavos INTEGER);',
   'CREATE TABLE loop_v6_eventos_saques_centro_teste(solicitacao_id TEXT,tipo TEXT);',
   'CREATE TABLE loop_v6_gestao_cofres_solicitacoes_demo(status TEXT,valor_centavos INTEGER);',
   'CREATE TABLE loop_v6_pre_receitas(centro_centavos INTEGER,esquerda_centavos INTEGER,direita_centavos INTEGER);',
   'CREATE TABLE loop_v6_pre_saidas(destino TEXT,valor_centavos INTEGER);',
   'INSERT INTO loop_v6_provisoes_ciclos VALUES(1,75000);',
   "INSERT INTO loop_v6_provisoes_eventos VALUES('LOOP_CENTRO',25000);",
   "INSERT INTO loop_v6_provisoes_eventos VALUES('LOOP_DOURADAS',25000);",
   'INSERT INTO loop_v6_provisoes_parcelas VALUES(25000);',
   'INSERT INTO admin_solicitacoes_saque_demo VALUES(2500,2500,0);',
   'INSERT INTO admin_solicitacoes_saque_demo VALUES(10000,9700,3);',
   'INSERT INTO loop_v6_saques_centro_teste VALUES(2500);',
   "INSERT INTO loop_v6_eventos_saques_centro_teste VALUES('s1','FALHA_BANCARIA_SIMULADA');",
   "INSERT INTO loop_v6_eventos_saques_centro_teste VALUES('s1','RETORNO_CONFIRMADO_SIMULADO');",
   "INSERT INTO loop_v6_gestao_cofres_solicitacoes_demo VALUES('PENDENTE_CONCILIACAO_REAL',5000);",
   'INSERT INTO loop_v6_pre_receitas VALUES(25000,25000,25000);',
   "INSERT INTO loop_v6_pre_saidas VALUES('LOOP_DOURADAS',75000);"
  ].join('\n'));
  const antes=b.prepare('SELECT total_changes() AS n').get().n;
  const d=consultarResumoFinanceiroOperacionalLab({banco:b});
  assert.deepEqual(d.fontesAusentes,[]);
  assert.equal(d.ciclos.quantidade,1);
  assert.equal(d.ciclos.previstoCentavos,75000);
  assert.equal(d.eventos.quantidade,2);
  assert.equal(d.parcelas.quantidade,1);
  assert.equal(d.bonus.quantidade,2);
  assert.equal(d.bonus.historicosTaxaTres,1);
  assert.equal(d.bonus.solicitadoLiquidoCentavos,12200);
  assert.equal(d.centro.solicitadoCentavos,2500);
  assert.equal(d.falhasCentro.quantidade,1);
  assert.equal(d.gestao.solicitadoCentavos,5000);
  assert.equal(d.douradas.previstoCentavos,75000);
  assert.equal(d.destinosPrevistosPorCofre.LOOP_CENTRO,25000);
  assert.equal(d.destinosPrevistosPorCofre.LOOP_DOURADAS,25000);
  assert.equal(d.receitas.pedidosComReferencia,1);
  assert.equal(b.prepare('SELECT total_changes() AS n').get().n,antes);
 }finally{b.close();}
});
test('Escritorio autentica financeiro operacional e integra visual sem movimentar banco',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 assert.equal((await fetch(m.base+URL)).status,401);
 assert.equal((await fetch(m.base+URL+'?giro=1',{headers:AUTH})).status,400);
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await fetch(m.base+URL,{headers:AUTH});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control'),'no-store');
 const d=await r.json();
 assert.equal(d.modo,'FINANCEIRO_OPERACIONAL_SQLITE_SOMENTE_LEITURA');
 assert.equal(d.ciclos.quantidade,0);
 assert.equal(d.eventos.quantidade,0);
 assert.equal(d.parcelas.quantidade,0);
 assert.equal(d.bancoConciliado,false);
 assert.equal(d.pagamentosReais,false);
 assert.equal(d.saquesReais,false);
 assert.equal(d.movimentosExecutados,0);
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 const html=await(await fetch(m.base+'/admin/loop03')).text();
 const js=await(await fetch(m.base+'/admin/loop03.js')).text();
 for(const id of ['finLivroOperacionalAdmin','finOpCiclosAdmin','finOpEventosAdmin',
  'finOpParcelasAdmin','finOpPrevistoAdmin','finOpBonusAdmin',
  'finOpSaquesCentroAdmin','finOpGestaoAdmin','finOpDouradasAdmin',
  'finOpCofresAdmin','finOpFalhasSaqueAdmin','finOpTaxasHistoricasAdmin',
  'finOpBancarioAdmin','finOpStatusAdmin'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/async function carregarFinanceiroOperacional/);
 assert.match(js,/await carregarFinanceiroOperacional\(\)/);
 assert.match(js,/financeiro-operacional-lab/);
 assert.match(js,/saldosSacaveisReaisCentavos!==0/);
});
test('Resumo financeiro lê 2 ciclos e 12 eventos do HTTP com SQLite reaberto',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-fin-operacional-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const r=await executar({total:12,pasta});
 assert.equal(r.giros,2);assert.equal(r.eventosDocumentados,12);
 const leitura=new DatabaseSync(path.join(pasta,'laboratorio.sqlite'),{readOnly:true});
 try{
  const d=consultarResumoFinanceiroOperacionalLab({banco:leitura});
  assert.equal(d.ciclos.quantidade,2);
  assert.equal(d.eventos.quantidade,12);
  assert.equal(d.parcelas.quantidade,6);
  assert.equal(d.ciclos.previstoCentavos,150000);
  assert.equal(d.bancoConciliado,false);
  assert.equal(d.saldosSacaveisReaisCentavos,0);
  assert.equal(Object.values(leitura.prepare('PRAGMA integrity_check').get())[0],'ok');
  assert.deepEqual(leitura.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{leitura.close();}
});
