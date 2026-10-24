'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {ProgramadorCatracaV6DemoSQLite}=require('../src/domain/programador-catraca-v6-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('agendamento distribui dois giros no tempo, pausa, limite e saldo sacavel sempre zero',async t=>{
  const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
  t.after(()=>repo.fechar());
  const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
  const comprovantes=new Map();
  const ponte=new PonteComprasConvitesDemoSQLite({
    banco:repo.banco,contas,
    consultarPagamentoConfiavel:async id=>comprovantes.get(id)
  });
  const titulares=[];
  for(let i=1;i<=14;i++){
    const pessoa=contas.cadastrar({nome:'Pessoa Agenda '+i,
      email:'pessoa-agenda-'+i+'@exemplo.invalid',
      senha:'senha-agenda-laboratorio-segura'});
    titulares.push(pessoa);
    const pedidoId='pdfagenda'+i;
    comprovantes.set(pedidoId,{pedidoId,contaId:pessoa.contaId,
      produtoId:'pdf-demo',status:STATUS_CONFIRMADO,valorCentavos:25000,
      confirmadoEm:'2026-10-17T12:00:00.000Z'});
    await ponte.processar({pedidoId});
  }
  new AdesoesPosicoesDemoSQLite({ponte}).ativar({
    contaId:titulares[0].contaId,cpfFicticio:'11144477735',
    aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
  });
  let tempo='2026-10-18T11:00:00.000Z'; // 08:00 Brasil
  const agora=()=>tempo;
  const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco,agora});
  const ponteControle=new CircuitBreakPonteV6DemoSQLite({
    banco:repo.banco,ponte,controle,agora
  });
  const agenda=new ProgramadorCatracaV6DemoSQLite({
    banco:repo.banco,ponteControle,controle,agora
  });
  assert.equal(agenda.listar().agendas.length,0);
  assert.throws(()=>agenda.criar({
    agendaId:'agenda-limite-alto-001',modo:'DISTRIBUIDO',quantidade:11,
    inicioEm:'2026-10-18T09:00:00-03:00',
    fimEm:'2026-10-18T18:00:00-03:00'
  }),{codigo:'LIMITE_AGENDAMENTO_DIARIO'});
  const salvo=agenda.criar({
    agendaId:'agenda-ponte-auto-001',modo:'DISTRIBUIDO',quantidade:2,
    inicioEm:'2026-10-18T09:00:00-03:00',
    fimEm:'2026-10-18T10:00:00-03:00'
  });
  assert.equal(salvo.horarios.length,2);
  assert.equal(salvo.horarios[0].horarioBrasilia.includes('09:00'),true);
  assert.equal(salvo.horarios[1].horarioBrasilia.includes('09:30'),true);
  assert.equal(salvo.girosExecutados,0);
  tempo='2026-10-18T12:00:00.000Z'; // 09:00
  assert.equal(agenda.processarVencimento().motivo,'CATRACA_PAUSADA');
  assert.equal(ponteControle.resumo().girosConcluidos,0);
  controle.executar({tipo:'ABRIR',comandoId:'cb-agenda-abrir-v6',revisaoEsperada:0});
  const primeira=agenda.processarVencimento();
  assert.equal(primeira.executado,true);
  assert.equal(primeira.giro,1);
  assert.equal(ponteControle.resumo().comprasConsumidas,6);
  assert.equal(ponteControle.livro.resumo().parcelasPrevistas,3);
  assert.equal(ponteControle.livro.resumo().valorRealLiquidadoCentavos,0);
  assert.equal(agenda.detalhe('agenda-ponte-auto-001').girosExecutados,1);
  assert.equal(agenda.processarVencimento().motivo,'SEM_SLOT_VENCIDO_NA_JANELA');
  tempo='2026-10-18T12:30:00.000Z'; // 09:30
  const segunda=agenda.processarVencimento();
  assert.equal(segunda.executado,true);
  assert.equal(segunda.giro,2);
  assert.equal(ponteControle.resumo().girosConcluidos,2);
  assert.equal(ponteControle.resumo().comprasConsumidas,12);
  assert.equal(agenda.detalhe('agenda-ponte-auto-001').girosExecutados,2);
  assert.equal(agenda.listar().saldoSacavelCentavos,0);
  assert.equal(agenda.listar().transferenciasBancariasExecutadas,0);
  const antes=repo.banco.prepare(
    'SELECT count(*) AS n FROM loop_v6_agenda_execucoes_demo'
  ).get().n;
  assert.equal(antes,2);
  assert.equal(agenda.processarVencimento().executado,false);
  assert.equal(repo.banco.prepare(
    'SELECT count(*) AS n FROM loop_v6_agenda_execucoes_demo'
  ).get().n,2);
  assert.throws(()=>repo.banco.exec('DELETE FROM loop_v6_agenda_execucoes_demo'),
    /historico imutavel/);
});

test('programacao pontual respeita fim do horario e cancelamento; nao faz catch-up',()=>{
  const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
  const banco=repo.banco;
  let tempo='2026-10-18T11:00:00.000Z';
  const agora=()=>tempo;
  const controle=new CircuitBreakV6DemoSQLite({banco,agora});
  const ponte={banco,
    liberar:()=>{throw new Error('nao pode liberar sem compras');}};
  const prog=new ProgramadorCatracaV6DemoSQLite({
    banco,ponteControle:ponte,controle,agora});
  const entrada={agendaId:'agenda-ponte-cancelar01',quantidade:2,modo:'PONTUAL',
    inicioEm:'2026-10-18T09:00:00-03:00',
    fimEm:'2026-10-18T10:00:00-03:00'};
  prog.criar(entrada);
  assert.throws(()=>prog.criar(entrada),{codigo:'AGENDA_ID_REUTILIZADA'});
  assert.equal(prog.cancelar(entrada.agendaId).status,'CANCELADA');
  assert.equal(prog.listar().agendas[0].girosExecutados,0);
  tempo='2026-10-18T14:00:00.000Z'; // 11:00 Brasil, passou a janela
  controle.executar({tipo:'ABRIR',comandoId:'cb-agenda-abrir-cancel01',
    revisaoEsperada:0});
  assert.equal(prog.processarVencimento().motivo,'SEM_SLOT_VENCIDO_NA_JANELA');
  repo.fechar();
});
