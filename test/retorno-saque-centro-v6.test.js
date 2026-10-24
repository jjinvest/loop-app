'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {RetornoSaqueCentroV6DemoSQLite}=require('../src/domain/retorno-saque-centro-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('resposta bancaria falsa nao pode ser produzida pelo titular ou rota publica',async t=>{
 const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='senha-admin-lab-retorno-2026-forte';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo})
  .listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origem='http://127.0.0.1:'+server.address().port;
 const participante=origem+'/api/laboratorio/participante/saque-centro-v6-demo';
 const admin=origem+'/api/admin/circuit-break-v6-demo/saque-centro-v6-demo/eventos';
 assert.equal((await fetch(participante)).status,401);
 assert.equal((await fetch(participante,{method:'POST',
  headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:JSON.stringify({solicitacaoId:'saque-centro-teste-sem-sessao',
   valorCentavos:1000})
 })).status,401);
 const fake={solicitacaoId:'saque-centro-nao-existe-12345',
  eventoId:'evt-saque-nao-existe-12345',tipo:'RETORNO_CONFIRMADO_SIMULADO'};
 assert.equal((await fetch(admin,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(fake)
 })).status,401);
 assert.equal((await fetch(admin,{method:'POST',
  headers:{Authorization:'Bearer '+segredo,'Content-Type':'application/json'},
  body:JSON.stringify({...fake,saldoRealCentavos:75000})
 })).status,400);
 assert.equal((await fetch(admin,{method:'POST',
  headers:{Authorization:'Bearer '+segredo,'Content-Type':'application/json'},
  body:JSON.stringify(fake)
 })).status,409);
});
test('saque central errado somente restaura referencia apos comprovacao ficticia de retorno',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const compras=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>compras.get(id)});
 const pessoas=[];
 for(let n=1;n<=8;n++){
  const pessoa=contas.cadastrar({nome:'Saque Centro Demo '+n,
   email:'saque-centro-'+n+'@exemplo.invalid',senha:'senha-centro-demo-2026'});
  pessoas.push(pessoa);
  const pedidoId='pedido-saquecentro-'+n;
  compras.set(pedidoId,{pedidoId,contaId:pessoa.contaId,
    produtoId:'pdf-laboratorio',valorCentavos:25000,status:STATUS_CONFIRMADO,
    confirmadoEm:'2026-10-17T10:00:00.000Z'});
  await ponte.processar({pedidoId});
 }
 new AdesoesPosicoesDemoSQLite({ponte}).ativar({
  contaId:pessoas[0].contaId,cpfFicticio:'11144477735',aceitaTermos:true,
  versaoTermos:'LOOP-DEMO-V1'
 });
 const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco,
  agora:()=> '2026-10-17T15:00:00.000Z'});
 const cb=new CircuitBreakPonteV6DemoSQLite({banco:repo.banco,ponte,controle,
  agora:()=> '2026-10-17T15:00:00.000Z'});
 cb.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 for(let n=1;n<=8;n++)cb.preLancamento.registrarAporteFicticio({
  aporteId:'aporte-saquecentro-'+n,pedidoId:'pedido-saquecentro-'+n,
  valorLoopCentavos:25000
 });
 cb.preLancamento.iniciar();
 controle.executar({tipo:'ABRIR',comandoId:'cb-abrir-catraca-saquecentro-test-001',
  revisaoEsperada:0});
 const primeiro=cb.liberar({quantidade:1,
  comandoId:'cb-giro-saquecentro-teste-001',revisaoEsperada:1});
 assert.equal(primeiro.centrosDeParticipantes,1);
 const titular=pessoas[0].contaId;
 assert.equal(cb.livro.extrato(titular).totalPrevistoCentavos,75000);
 const servico=new RetornoSaqueCentroV6DemoSQLite({banco:repo.banco,
  livro:cb.livro,contas,agora:()=> '2026-10-17T18:00:00.000Z'});
 assert.equal(servico.consultar(titular).referenciaParaNovoPedidoFicticioCentavos,75000);
 const pedido={contaId:titular,solicitacaoId:'saque-centro-teste-pedido-0001',
  valorCentavos:75000};
 assert.equal(servico.solicitar(pedido).status,'SOLICITADO');
 assert.equal(servico.solicitar(pedido).repetida,true);
 assert.equal(servico.consultar(titular).reservadoEmPedidosDeTesteCentavos,75000);
 assert.equal(servico.consultar(titular).referenciaParaNovoPedidoFicticioCentavos,0);
 assert.throws(()=>servico.solicitar({...pedido,
  solicitacaoId:'saque-centro-teste-pedido-0002'}),{
   codigo:'REFERENCIA_CENTRO_TESTE_INSUFICIENTE'
  });
 const e=(tipo,i,motivo)=>servico.evento({
  solicitacaoId:pedido.solicitacaoId,eventoId:'evt-saque-teste-'+i,tipo,
  ...(motivo?{motivo}:{})
 });
 assert.equal(e('ENVIAR_SIMULADO','00000001').status,'ENVIADO_SIMULADO');
 assert.equal(e('FALHA_BANCARIA_SIMULADA','00000002','DADOS_DESTINATARIO_INVALIDOS')
  .status,'FALHOU_AGUARDANDO_RETORNO');
 assert.equal(servico.consultar(titular).referenciaParaNovoPedidoFicticioCentavos,0);
 assert.equal(servico.consultar(titular).reservadoEmPedidosDeTesteCentavos,75000);
 assert.throws(()=>e('SUCESSO_BANCARIO_SIMULADO','00000003'),
  {codigo:'TRANSICAO_INVALIDA'});
 const reembolso=e('RETORNO_CONFIRMADO_SIMULADO','00000004');
 assert.equal(reembolso.status,'DEVOLVIDO_AO_ESCRITORIO_SIMULADO');
 assert.equal(reembolso.podeSolicitarNovamente,true);
 assert.equal(servico.consultar(titular).totalHistoricoRetornadoCentavos,75000);
 assert.equal(servico.consultar(titular).referenciaParaNovoPedidoFicticioCentavos,75000);
 assert.equal(e('RETORNO_CONFIRMADO_SIMULADO','00000004').repetido,true);
 assert.throws(()=>e('RETORNO_CONFIRMADO_SIMULADO','00000005'),
  {codigo:'TRANSICAO_INVALIDA'});
 assert.throws(()=>servico.solicitar({...pedido,contaId:pessoas[1].contaId}),
  {codigo:'CONFLITO_IDEMPOTENCIA'});
 const novo=servico.solicitar({...pedido,
  solicitacaoId:'saque-centro-teste-pedido-0002'});
 assert.equal(novo.status,'SOLICITADO');
 assert.equal(novo.criadoEm,'2026-10-17T18:00:00.000Z');
 const extrato=servico.consultar(titular);
 assert.equal(extrato.referenciaParaNovoPedidoFicticioCentavos,0);
 assert.equal(extrato.reservadoEmPedidosDeTesteCentavos,75000);
 assert.equal(extrato.disponivelParaSaqueRealCentavos,0);
 assert.equal(extrato.transferenciasReaisExecutadas,0);
 assert.equal(cb.livro.extrato(titular).disponivelParaSaqueCentavos,0);
 assert.equal(cb.preLancamento.resumo().centroRestanteSimuladoCentavos,25000);
 assert.equal(cb.conciliacao.conferir().quantidadeDivergencias,0);
 assert.throws(()=>repo.banco.exec('DELETE FROM loop_v6_eventos_saques_centro_teste'),
  /historico saque imutavel/);
});
