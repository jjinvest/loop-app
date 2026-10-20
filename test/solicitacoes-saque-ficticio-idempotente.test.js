'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
test('solicitacoes de bonus reais nunca acontecem, apenas reserva ficticia sem saldo duplicado',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const a=contas.cadastrar({nome:'Solicitante de teste',email:'solicitante@exemplo.invalid',senha:'senha-exemplo-123456'});
 const b=contas.cadastrar({nome:'Comprador indicado',email:'indicado-saque@exemplo.invalid',
  senha:'senha-exemplo-123456',codigoIndicador:a.codigoConvite});
 const mapa=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async pedidoId=>mapa.get(pedidoId)});
 async function comprar(pedidoId,conta,valorCentavos,dia){
  mapa.set(pedidoId,{pedidoId,contaId:conta.contaId,produtoId:'teste-pdf',
   valorCentavos,status:STATUS_CONFIRMADO,confirmadoEm:`2030-01-${dia}T12:00:00.000Z`});
  return ponte.processar({pedidoId});
 }
 const saques=new SolicitacoesSaqueDemoSQLite({banco:repo.banco,contas,links:ponte.linksComissoes});
 const id='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 assert.equal(saques.consultar(a.contaId).podeSolicitarBonus,false);
 assert.throws(()=>saques.registrar({contaId:a.contaId,solicitacaoId:id,
  tipo:'BONUS',valorSolicitadoCentavos:2500}),e=>e.codigo==='CPF_E_TERMOS_OBRIGATORIOS');
 assert.equal((await comprar('comprou-50',a,5000,'01')).posicaoCriada,false);
 const adesao=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=> '2030-01-01T17:00:00.000Z'});
 assert.equal(adesao.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,0);
 assert.equal((await comprar('indicado-250',b,25000,'02')).comissaoSimuladaCentavos,0);
 const confirmou=new AdesoesPosicoesDemoSQLite({ponte,
  relogio:()=> '2030-01-02T13:00:00.000Z'}).ativar({
   contaId:b.contaId,cpfFicticio:'12345678909',
   aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
  });
 assert.equal(confirmou.bonificacoes[0].valorComissaoCentavos,2500);
 const extrato=saques.consultar(a.contaId);
 assert.equal(extrato.bonusDisponivelSimuladoCentavos,2500);
 assert.equal(extrato.podeSolicitarBonus,true);
 const q=saques.registrar({contaId:a.contaId,solicitacaoId:id,
  tipo:'BONUS',valorSolicitadoCentavos:2500});
 assert.equal(q.repetida,false);
 assert.equal(q.taxaPercentual,3);
 assert.equal(q.taxaSaqueCentavos,75);
 assert.equal(q.valorLiquidoCentavos,2425);
 assert.equal(q.transferenciaExecutada,false);
 assert.equal(saques.registrar({contaId:a.contaId,solicitacaoId:id,
  tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,true);
 assert.equal(saques.consultar(a.contaId).bonusDisponivelSimuladoCentavos,0);
 assert.equal(saques.consultar(a.contaId).bonusSolicitadoSimuladoCentavos,2500);
 assert.throws(()=>saques.registrar({contaId:a.contaId,
  solicitacaoId:'saque-11111111-2222-4333-8444-555555555555',
  tipo:'BONUS',valorSolicitadoCentavos:2500}),
  e=>e.codigo==='SALDO_SIMULADO_INSUFICIENTE');
 assert.throws(()=>saques.registrar({contaId:a.contaId,solicitacaoId:id,
  tipo:'BONUS',valorSolicitadoCentavos:5000}),e=>e.codigo==='CONFLITO_IDEMPOTENCIA');
 assert.throws(()=>saques.registrar({contaId:b.contaId,solicitacaoId:id,
  tipo:'BONUS',valorSolicitadoCentavos:2500}),e=>e.codigo==='CONFLITO_IDEMPOTENCIA');
 assert.throws(()=>saques.registrar({contaId:a.contaId,
  solicitacaoId:'saque-77777777-2222-4333-8444-555555555555',
  tipo:'PARTICIPACAO_LUCRO',valorSolicitadoCentavos:2500}),
  e=>e.codigo==='SALDO_PARTICIPACAO_INDISPONIVEL');
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_solicitacoes_saque_demo SET taxa_centavos=0'),
  /solicitacao de teste imutavel/);
 assert.equal(saques.consultar(b.contaId).historico.length,0);
});
