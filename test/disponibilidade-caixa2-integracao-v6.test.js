'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {PreLancamentoCofresV6DemoSQLite}=require('../src/domain/prelancamento-cofres-v6-demo-sqlite');
const {ConciliacaoCofresV6DemoSQLite}=require('../src/domain/conciliacao-cofres-v6-demo-sqlite');
const {GestaoCofresProprietarioV6DemoSQLite}=require('../src/domain/gestao-cofres-proprietario-v6-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('segundo caixa deduz bonificacao confirmada, dourada e gestao sem utilizar reserva duas vezes',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const b=repo.banco,contas=new ContasParticipantesDemoSQLite({banco:b}),provas=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:b,contas,
  consultarPagamentoConfiavel:async id=>provas.get(id)});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,
  relogio:()=> '2037-06-02T12:00:00.000Z'});
 const titular=contas.cadastrar({nome:'Indicador da Reserva',
  email:'indicador-reserva@exemplo.invalid',senha:'senha-teste-loop-2026'});
 const convidado=contas.cadastrar({nome:'Convidado da Reserva',
  email:'convidado-reserva@exemplo.invalid',senha:'senha-teste-loop-2026',
  codigoIndicador:titular.codigoConvite});
 async function pagar(i,conta,dia){
  const pedidoId='pedido-saldo-caixa2-'+String(i).padStart(2,'0');
  provas.set(pedidoId,{pedidoId,contaId:conta.contaId,produtoId:'pdf-ficticio',
   valorCentavos:25000,confirmadoEm:'2037-06-'+String(dia).padStart(2,'0')+
    'T12:00:00.000Z',status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId});
 }
 assert.equal((await pagar(1,titular,1)).posicaoCriada,true);
 const ativacao=adesoes.ativar({contaId:titular.contaId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 assert.equal(ativacao.adesaoComissoesAtivada,true);
 const bonus=await pagar(2,convidado,3);
 assert.equal(bonus.comissaoSimuladaCentavos,2500);
 assert.equal(bonus.percentualBonusAplicado,10);
 // 10 outros pedidos para formar os saldos 12 x R$250 = R$3000.
 for(let i=3;i<=12;i++){
  const c=contas.cadastrar({nome:'Pessoa adicional '+i,
   email:'outro-caixa2-'+i+'@exemplo.invalid',senha:'senha-teste-loop-2026'});
  assert.equal((await pagar(i,c,4)).posicaoCriada,true);
 }
 const pre=new PreLancamentoCofresV6DemoSQLite({banco:b,ponte});
 const conf=pre.habilitar({valorFixoLoopCentavos:25000});
 assert.equal(conf.configurado,true);
 for(let i=1;i<=12;i++){
  pre.registrarAporteFicticio({
   aporteId:'aporte-saldo-caixa2-'+String(i).padStart(2,'0'),
   pedidoId:'pedido-saldo-caixa2-'+String(i).padStart(2,'0'),
   valorLoopCentavos:25000
  });
 }
 const conciliacao=new ConciliacaoCofresV6DemoSQLite({
  banco:b,preLancamento:pre,livro:pre.livro});
 const gestao=new GestaoCofresProprietarioV6DemoSQLite({
  banco:b,preLancamento:pre,conciliacao});
 const inicial=conciliacao.conferir();
 assert.equal(inicial.quantidadeDivergencias,0);
 assert.equal(inicial.cofreDireitaSimuladoCentavos,50000);
 assert.equal(inicial.bonificacoesComprometidasCentavos,2500);
 assert.equal(inicial.cofreDireitaDisponivelSimuladoCentavos,47500);
 assert.equal(inicial.cofreCentroRestanteSimuladoCentavos,150000);
 function solicitar(id,valor,cofreOrigem='LOOP_DIREITA'){
  return gestao.solicitar({movimentoId:'mov-prop-caixa2-'+id,
   cofreOrigem,destino:'EMPRESA_EXTERNA',
   valorCentavos:valor,justificativa:'Reserva demonstrativa do proprietario'});
 }
 const pedido=solicitar('primeira-solicitacao',12500);
 assert.equal(pedido.repetido,false);
 assert.equal(pedido.saldoSimuladoNoPedidoCentavos,47500);
 assert.equal(solicitar('primeira-solicitacao',12500).repetido,true);
 assert.equal(conciliacao.conferir().cofreDireitaDisponivelSimuladoCentavos,35000);
 const dourada=ponte.criarDouradaManualDemo({eventoId:'dourada-caixa2-protegida'});
 assert.equal(dourada.valorReferenciaCentavos,25000);
 assert.equal(dourada.reservaDisponivelDepoisCentavos,10000);
 assert.equal(dourada.receitaNovaCentavos,0);
 const apos=conciliacao.conferir();
 assert.equal(apos.bonificacoesComprometidasCentavos,2500);
 assert.equal(apos.reservaDouradasComprometidaCentavos,25000);
 assert.equal(apos.gestaoPendenteComprometidaCentavos,12500);
 assert.equal(apos.cofreDireitaDisponivelSimuladoCentavos,10000);
 assert.equal(apos.quantidadeDivergencias,0);
 assert.equal(apos.cofreCentroRestanteSimuladoCentavos,150000);
 assert.throws(()=>solicitar('valor-acima-do-livre',10001),
  {codigo:'SALDO_DEMONSTRATIVO_INSUFICIENTE'});
 assert.throws(()=>ponte.criarDouradaManualDemo({eventoId:'dourada-caixa2-bloqueada'}),
  {codigo:'SALDO_RESERVA_INSUFICIENTE'});
 assert.equal(solicitar('ultimo-livre',10000).repetido,false);
 assert.equal(conciliacao.conferir().cofreDireitaDisponivelSimuladoCentavos,0);
 assert.equal(ponte.criarDouradaManualDemo({eventoId:'dourada-caixa2-protegida'}).repetida,true);
 // Outra origem nao pode alterar o segundo caixa; nenhuma transferencia real.
 const esquerda=solicitar('outro-cofre',1000,'LOOP_ESQUERDA');
 assert.equal(esquerda.dinheiroTransferidoCentavos,0);
 assert.equal(conciliacao.conferir().cofreDireitaDisponivelSimuladoCentavos,0);
 assert.equal(gestao.listar().registros.length,3);
 assert.equal(ponte.consultar().douradasManuais.length,1);
 const reconstruida=new PonteComprasConvitesDemoSQLite({banco:b,contas,
  consultarPagamentoConfiavel:async id=>provas.get(id)});
 assert.throws(()=>reconstruida.criarDouradaManualDemo({eventoId:'dourada-caixa2-reinicio'}),
  {codigo:'SALDO_RESERVA_INSUFICIENTE'});
 assert.equal(reconstruida.criarDouradaManualDemo({eventoId:'dourada-caixa2-protegida'}).repetida,true);
 assert.equal(conciliacao.conferir().quantidadeDivergencias,0);
});
test('saldo demonstrativo nunca vira saldo bancario nem mistura central com caixa 2',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const b=repo.banco;
 b.exec(`
 CREATE TABLE admin_ponte_douradas_financiadas_demo(valor_referencia_centavos INTEGER);
 CREATE TABLE admin_comissoes_reserva_v2_demo(valor_centavos INTEGER);
 CREATE TABLE loop_v6_gestao_cofres_solicitacoes_demo(
   cofre_origem TEXT,status TEXT,valor_centavos INTEGER);
 INSERT INTO admin_ponte_douradas_financiadas_demo VALUES(25000);
 INSERT INTO admin_comissoes_reserva_v2_demo VALUES(2500);
 INSERT INTO loop_v6_gestao_cofres_solicitacoes_demo
  VALUES('LOOP_DIREITA','PENDENTE_CONCILIACAO_REAL',10000);
 `);
 const direita=disponibilidadeCofreDemo(b,{cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000});
 assert.equal(direita.saldoLivreDemonstrativoCentavos,12500);
 assert.equal(direita.totalComprometidoCentavos,37500);
 assert.equal(direita.pagamentoRealExecutado,false);
 const centro=disponibilidadeCofreDemo(b,{cofreId:'LOOP_CENTRO',saldoBrutoCentavos:120000});
 assert.equal(centro.saldoLivreDemonstrativoCentavos,120000);
 assert.equal(centro.centralReservadoParaParticipantes,true);
 assert.equal(centro.compromissoDouradasCentavos,0);
 assert.equal(centro.compromissoBonificacoesCentavos,0);
});