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

test('vendas continuam entrando com catraca pausada, e caixa central so compromete sob comando verificado',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const banco=repo.banco,contas=new ContasParticipantesDemoSQLite({banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 let data='2026-10-18T14:00:00.000Z';
 const agora=()=>data,controle=new CircuitBreakV6DemoSQLite({banco,agora});
 const circuito=new CircuitBreakPonteV6DemoSQLite({banco,ponte,controle,agora});
 let revisao=0;
 const comando=(tipo,valor)=>{
  const resultado=controle.executar({
   tipo,comandoId:'cb-ritmo-'+String(++revisao).padStart(5,'0'),
   ...(valor===undefined?{}:{valor}),
   revisaoEsperada:controle.resumo().revisao
  });
  return resultado;
 };
 const liberar=(id='cb-ritmo-liberacao-001')=>circuito.liberar({
  comandoId:id,quantidade:1,revisaoEsperada:controle.resumo().revisao
 });
 const compras=[];
 async function comprar(i){
  const pessoa=contas.cadastrar({nome:'Cliente no teste '+i,
   email:'cliente-catraca-'+i+'@exemplo.invalid',senha:'senha-catraca-segura-2026'});
  const pedidoId='pedido-ritmo-'+String(i).padStart(3,'0');
  comprovantes.set(pedidoId,{pedidoId,contaId:pessoa.contaId,
   produtoId:'curso-pdf-ficticio',valorCentavos:25000,
   confirmadoEm:data,status:STATUS_CONFIRMADO});
  const r=await ponte.processar({pedidoId});
  assert.equal(r.posicaoCriada,true);compras.push({pessoa,pedidoId});
  return pessoa;
 }
 const primeiro=await comprar(1);
 new AdesoesPosicoesDemoSQLite({ponte}).ativar({
  contaId:primeiro.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
 });
 for(let i=2;i<=12;i++)await comprar(i);
 assert.equal(controle.resumo().status,'PAUSADA');
 assert.equal(circuito.resumo().comprasPendentes,12);
 assert.equal(circuito.resumo().girosConcluidos,0);
 assert.equal(circuito.livro.resumo().ciclosRegistrados,0);
 assert.equal(circuito.conciliacao.conferir().dinheiroBancarioComprovadoCentavos,0);
 assert.throws(()=>liberar(),{codigo:'CATRACA_PAUSADA'});
 circuito.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 for(const [i,compra] of compras.entries()){
  circuito.preLancamento.registrarAporteFicticio({
   aporteId:'aporte-ritmo-'+String(i+1).padStart(3,'0'),
   pedidoId:compra.pedidoId,valorLoopCentavos:25000
  });
 }
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,150000);
 assert.equal(circuito.resumo().comprasPendentes,12);
 assert.equal(circuito.resumo().girosConcluidos,0);
 comando('ABRIR');
 comando('LIMITE_DIARIO',1);
 assert.throws(()=>liberar('cb-ritmo-antes-start'),{codigo:'AGUARDANDO_START'});
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,150000);
 circuito.preLancamento.iniciar();
 const a=liberar('cb-ritmo-giro-001');
 assert.equal(a.girosLiberados.length,1);
 assert.equal(circuito.resumo().comprasPendentes,6);
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,75000);
 assert.equal(circuito.livro.resumo().ciclosRegistrados,1);
 assert.equal(circuito.livro.resumo().valorRealLiquidadoCentavos,0);
 assert.throws(()=>liberar('cb-ritmo-limite-diario'),{codigo:'LIMITE_DIARIO_ATINGIDO'});
 comando('PAUSAR');
 for(let i=13;i<=18;i++)await comprar(i);
 assert.equal(circuito.resumo().comprasPendentes,12);
 assert.equal(circuito.resumo().girosConcluidos,1);
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,75000);
 assert.throws(()=>liberar('cb-ritmo-paused-com-compras'),{codigo:'CATRACA_PAUSADA'});
 assert.equal(circuito.livro.resumo().ciclosRegistrados,1);
 data='2026-10-19T14:00:00.000Z';
 comando('ABRIR');
 const b=liberar('cb-ritmo-giro-002');
 assert.equal(b.girosLiberados.length,1);
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,0);
 assert.equal(circuito.livro.resumo().ciclosRegistrados,2);
 assert.equal(circuito.resumo().comprasPendentes,6);
 assert.equal(circuito.preLancamento.resumo().totalHipoteticoCentavos,300000);
 assert.equal(circuito.conciliacao.conferir().quantidadeDivergencias,0);
 // Existem compras confirmadas suficientes, mas falta lastro CENTRAL para
 // terceiro giro. A transacao nao pode gravar giro nem consumir compras.
 data='2026-10-20T14:00:00.000Z';
 const antes=circuito.resumo();
 assert.throws(()=>liberar('cb-ritmo-sem-cobertura-central'),
  {codigo:'SALDO_CENTRAL_SIMULADO_INSUFICIENTE'});
 const depois=circuito.resumo();
 assert.equal(depois.girosConcluidos,antes.girosConcluidos);
 assert.equal(depois.comprasPendentes,antes.comprasPendentes);
 assert.equal(circuito.livro.resumo().ciclosRegistrados,2);
 assert.equal(circuito.preLancamento.resumo().centroRestanteSimuladoCentavos,0);
 assert.equal(circuito.conciliacao.conferir().disponivelParaSaqueCentavos,0);
 // Mesmo id de giro aprovado devolve comprovante sem causar novo giro.
 assert.equal(circuito.liberar({
  comandoId:'cb-ritmo-giro-002',quantidade:1,revisaoEsperada:0
 }).repetido,true);
 assert.equal(circuito.resumo().girosConcluidos,2);
});