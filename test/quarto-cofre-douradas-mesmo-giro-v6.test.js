'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('posicao dourada cumpre mesmo giro, mas destino financeiro e o quarto cofre',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 const titulares=[];
 for(let i=1;i<=8;i++){
  const conta=contas.cadastrar({nome:'Dourada Laboratorio '+i,
    email:'dourada-'+i+'@exemplo.invalid',senha:'senha-super-segura-lab-2026'});
  titulares.push(conta);
  const pedidoId='dourada-demo-'+i;
  comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,
    status:STATUS_CONFIRMADO,produtoId:'curso-pdf',valorCentavos:25000,
    confirmadoEm:'2026-10-17T12:00:00.000Z'});
  await ponte.processar({pedidoId});
 }
 const cbControle=new CircuitBreakV6DemoSQLite({banco:repo.banco,
  agora:()=> '2026-10-17T15:00:00.000Z'});
 const cb=new CircuitBreakPonteV6DemoSQLite({
  banco:repo.banco,ponte,controle:cbControle,
  agora:()=> '2026-10-17T15:00:00.000Z'
 });
 const cofre=cb.preLancamento;
 cofre.habilitar({valorFixoLoopCentavos:25000});
 for(let i=1;i<=8;i++)cofre.registrarAporteFicticio({
  aporteId:'aporte-dourada-teste-'+i,pedidoId:'dourada-demo-'+i,
  valorLoopCentavos:25000
 });
 const inicial=cofre.resumo();
 assert.equal(inicial.totalHipoteticoCentavos,200000);
 assert.equal(inicial.douradasAcumuladoSimuladoCentavos,0);
 assert.equal(inicial.centroRestanteSimuladoCentavos,100000);
 cbControle.executar({tipo:'ABRIR',comandoId:'cb-abrir-cofre-douradas-teste',
  revisaoEsperada:0});
 cofre.iniciar();
 const resposta=cb.liberar({comandoId:'cb-giro-cofre-douradas-001',
  revisaoEsperada:1,quantidade:1});
 assert.equal(resposta.girosLiberados.length,1);
 assert.equal(resposta.girosLiberados[0].centroEmpresa,true);
 assert.equal(resposta.centrosDourados,1);
 assert.equal(resposta.centrosDeParticipantes,0);
 assert.deepEqual(resposta.girosLiberados[0].eventos.map(e=>e.destinoCofre),
  ['LOOP_DOURADAS','LOOP_ESQUERDA','LOOP_DOURADAS',
   'LOOP_DIREITA','LOOP_DOURADAS','LOOP_ESQUERDA']);
 const depois=cofre.resumo();
 assert.equal(depois.centroRestanteSimuladoCentavos,25000);
 assert.equal(depois.douradasAcumuladoSimuladoCentavos,75000);
 assert.equal(depois.escritoriosPrevistosSimuladoCentavos,0);
 assert.equal(depois.girosComCentroDourado,1);
 assert.equal(depois.totalDemonstrativoConservadoCentavos,200000);
 assert.equal(cb.livro.resumo().totalPrevistoParaTitularesCentavos,0);
 assert.equal(cb.livro.resumo().destinoMatematicoPorCofreCentavos.LOOP_DOURADAS,75000);
 assert.equal(cb.livro.extrato(titulares[0].contaId).totalPrevistoCentavos,0);
 assert.equal(depois.saldoRealCentavos,0);
 assert.equal(depois.valorParaSaqueCentavos,0);
 const ordem=cbControle.historico().filter(v=>v.tipo==='LIBERAR_LOTE_PONTE');
 assert.equal(ordem.length,1);
 assert.equal(ordem[0].saida.girosLiberados[0].centroEmpresa,true);
});
