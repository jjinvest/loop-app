'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('prelancamento separa venda da loja e aporte fixo, so libera depois do START',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,consultarPagamentoConfiavel:async p=>comprovantes.get(p)
 });
 const titulares=[];
 for(let i=1;i<=12;i++){
  const conta=contas.cadastrar({nome:'Pre Cliente '+i,
   email:'pre-lancamento-'+i+'@exemplo.invalid',senha:'senha-exclusiva-demo-2026'});
  titulares.push(conta);
  const pedidoId='pedido-pre-'+String(i).padStart(2,'0');
  comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,
   produtoId:'pdf-teste-250',valorCentavos:25000,
   status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-18T11:00:00.000Z'});
  assert.equal((await ponte.processar({pedidoId})).posicaoCriada,true);
 }
 new AdesoesPosicoesDemoSQLite({ponte}).ativar({
  contaId:titulares[0].contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
 });
 const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco,
  agora:()=> '2026-10-18T13:00:00.000Z'});
 const cb=new CircuitBreakPonteV6DemoSQLite({banco:repo.banco,ponte,controle,
  agora:()=> '2026-10-18T13:00:00.000Z'});
 assert.equal(cb.preLancamento.resumo().configurado,false);
 const ativo=cb.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 assert.equal(ativo.fase,'ARRECADACAO');
 assert.equal(ativo.comprasConferidas,0);
 assert.equal(ativo.centroRestanteSimuladoCentavos,0);
 assert.equal(ativo.totalHipoteticoCentavos,0);
 assert.equal(cb.preLancamento.sincronizar().comprasNovas,0);
 assert.throws(()=>cb.preLancamento.registrarAporteFicticio({
  aporteId:'aporte-sem-referencia-0001',
  pedidoId:'pedido-pre-01',valorLoopCentavos:22500
 }),{codigo:'SOMENTE_250_REAIS_LOOP'});
 for(let i=1;i<=12;i++){
  const aporteId='aporte-demo-separado-'+String(i).padStart(2,'0');
  const pedidoId='pedido-pre-'+String(i).padStart(2,'0');
  const novo=cb.preLancamento.registrarAporteFicticio({
   aporteId,pedidoId,valorLoopCentavos:25000
  });
  assert.equal(novo.repetido,false);
  assert.equal(cb.preLancamento.registrarAporteFicticio({
   aporteId,pedidoId,valorLoopCentavos:25000
  }).repetido,true);
 }
 const caixa=cb.preLancamento.resumo();
 assert.equal(caixa.comprasConferidas,12);
 assert.equal(caixa.totalHipoteticoCentavos,300000);
 assert.equal(caixa.centroRecebidoSimuladoCentavos,150000);
 assert.equal(caixa.investimentoRestanteSimuladoCentavos,100000);
 assert.equal(caixa.reservaRestanteSimuladoCentavos,50000);
 assert.equal(caixa.girosRegistrados,0);
 assert.equal(caixa.valorParaSaqueCentavos,0);
 assert.equal(caixa.douradasAcumuladoSimuladoCentavos,0);
 assert.deepEqual(caixa.cofresDoLoop,
  ['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS']);
 assert.equal(caixa.caixaDaLojaSeparado,true);
 controle.executar({tipo:'ABRIR',comandoId:'cb-start-demo-open1',revisaoEsperada:0});
 assert.throws(()=>cb.liberar({
  comandoId:'cb-tentativa-antes-do-start',quantidade:1,revisaoEsperada:1
 }),{codigo:'AGUARDANDO_START'});
 assert.equal(cb.preLancamento.resumo().centroRestanteSimuladoCentavos,150000);
 assert.equal(cb.livro.resumo().ciclosRegistrados,0);
 assert.equal(cb.resumo().girosConcluidos,0);
 cb.preLancamento.iniciar();
 const primeiro=cb.liberar({
  comandoId:'cb-depois-do-start-001',quantidade:1,revisaoEsperada:1
 });
 assert.equal(primeiro.centrosDeParticipantes,1);
 assert.equal(primeiro.girosLiberados.length,1);
 assert.equal(cb.preLancamento.resumo().centroRestanteSimuladoCentavos,75000);
 const segundo=cb.liberar({
  comandoId:'cb-depois-do-start-002',quantidade:1,revisaoEsperada:2
 });
 assert.equal(segundo.girosLiberados.length,1);
 assert.equal(cb.preLancamento.resumo().centroRestanteSimuladoCentavos,0);
 assert.equal(cb.preLancamento.resumo().girosRegistrados,2);
 assert.equal(cb.preLancamento.resumo().centroComprometidoSimuladoCentavos,150000);
 assert.equal(cb.preLancamento.resumo().escritoriosPrevistosSimuladoCentavos,150000);
 assert.equal(cb.preLancamento.resumo().totalDemonstrativoConservadoCentavos,300000);
 assert.equal(cb.preLancamento.resumo().saldoRealCentavos,0);
 assert.equal(cb.preLancamento.resumo().valorParaSaqueCentavos,0);
 assert.equal(cb.preLancamento.sincronizar().comprasNovas,0);
 assert.throws(()=>cb.preLancamento.registrarAporteFicticio({
  aporteId:'aporte-duplicado-pedido-003',pedidoId:'pedido-pre-02',
  valorLoopCentavos:25000
 }),{codigo:'APORTE_JA_VINCULADO_A_COMPRA'});
 assert.throws(()=>repo.banco.exec('DELETE FROM loop_v6_pre_aportes_demo'),
  /caixa-demo imutavel/);
});
