'use strict';
// Percurso empresarial INTEGRADO em SQLite de laboratorio:
// AKITEMM carrinho -> confirmacao ADMIN ficticia -> 1 posicao por venda
// qualificada -> ativacao individual -> convidado VERDE -> atribuicao a
// UMA posicao -> A/B + escritorio -> provisao -> saque simulado 0% ->
// tabuleiro e ciclo de seis vendas APENAS no motor de simulacao.
// Nao existem pagamento, beneficio ou Pix reais; giros deste ensaio sao
// marcadores do motor e nao eventos liquidados em PSP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {auditarEntregasEstornosCarrinhoDemo}=require('../src/domain/auditoria-entregas-estornos-carrinho-demo');
const BASE='2036-09-20T12:00:00.000Z',SENHA='senha-longa-laboratorio-jornada-2026';
const CPF=['11144477735','12345678909','52998224725','39053344705','86288366757',
 '16899535009','18412407881','58617453079','41876862076'];
const DESTINOS=['PARTICIPANTE','EMPRESA','PARTICIPANTE','EMPRESA','PARTICIPANTE','EMPRESA_INVESTIMENTO'];
function produto(id,tipo,preco){
 return {id,nome:'Produto de laboratorio '+id,descricao:'Item ficticio',
  tipo,estado:'PUBLICADO',precoCentavos:preco,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function abrir(arquivo){
 const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 for(const [id,tipo,valor] of [['curso-250','PDF',25000],['fisico-190','FISICO',19000]]){
  if(!repo.buscar(id))repo.salvar({produto:produto(id,tipo,valor),revisaoEsperada:0});
 }
 const banco=repo.banco,contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>BASE});
 let carrinhos;
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,
  relogio:()=>BASE,consultarPagamentoConfiavel:async id=>carrinhos.comprovanteConfirmado(id)
 });
 carrinhos=new CarrinhoLojaLoopDemoSQLite({
  catalogo:repo,contas,pedidosIdentificados:pedidos,ponte,relogio:()=>BASE});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>BASE});
 return {repo,banco,contas,pedidos,ponte,carrinhos,adesoes,
  escritorio:new EscritorioIndividualDemo({contas,ponte}),
  saques:new SolicitacoesSaqueDemoSQLite({
   banco,contas,links:ponte.linksComissoes,relogio:()=>BASE})};
}
function cadastrar(m,num,codigoIndicador=null){
 return m.contas.cadastrar({
  nome:'Pessoa Jornada '+num,email:'jornada-'+num+'@exemplo.invalid',
  senha:SENHA,...(codigoIndicador?{codigoIndicador}:{})
 });
}
async function comprar(m,conta,id,produtoId='curso-250'){
 const antes=m.carrinhos.criar({pedidoId:id,contaId:conta.contaId,
  itens:[{produtoId,quantidade:1}]});
 assert.equal(antes.posicaoCriada,false);
 const conf=m.carrinhos.registrarEvento({pedidoId:id,eventoId:'conf-'+id,
  tipo:'CONFIRMAR_FICTICIO'});
 assert.equal(conf.repetido,false);
 const venda=await m.carrinhos.sincronizar(id);
 const replay=await m.carrinhos.sincronizar(id);
 assert.equal(m.carrinhos.registrarEvento({pedidoId:id,eventoId:'conf-'+id,
  tipo:'CONFIRMAR_FICTICIO'}).repetido,true);
 assert.equal(replay.posicaoCriada,venda.posicaoCriada);
 return venda;
}
function ativar(m,conta,posicaoId,cpf=null){
 return m.adesoes.ativar({contaId:conta.contaId,posicaoId,
  ...(cpf?{cpfFicticio:cpf,aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}:{})});
}
function integridade(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
}
test('ponta a ponta: loja, fila A/B individual, tabuleiro simulado, equipe, bonus e saque 0%',
 {timeout:120000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-e2e-cliente-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'e2e.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repo.fechar()}catch{}});
 // Sete titulares ficticios tornam o tabuleiro inicial completo.
 const iniciais=[];
 for(let i=0;i<7;i++){
  const pessoa=cadastrar(m,'inicial-'+i);
  const compra=await comprar(m,pessoa,'pedido-inicial-'+i);
  assert.equal(compra.posicaoCriada,true);
  ativar(m,pessoa,compra.posicaoId,CPF[i]);
  iniciais.push(compra.posicaoId);
 }
 const inicio=m.ponte.prepararTabuleiroDemo();
 assert.ok(inicio.tabuleiro.centro);
 assert.equal(inicio.tabuleiro.vagas.length,6);
 assert.ok(inicio.tabuleiro.vagas.every(Boolean));
 // O titular compra duas posicoes elegiveis, confirmadas UMA A UMA.
 const titular=cadastrar(m,'titular');
 const primeira=await comprar(m,titular,'pedido-titular-a');
 const segunda=await comprar(m,titular,'pedido-titular-b');
 assert.equal(primeira.posicaoCriada,true);
 assert.equal(segunda.posicaoCriada,true);
 const comum=await comprar(m,titular,'pedido-titular-fisico','fisico-190');
 assert.equal(comum.posicaoCriada,false);
 assert.equal(m.escritorio.consultar(titular.contaId).posicoes.length,2);
 ativar(m,titular,primeira.posicaoId,CPF[7]);
 ativar(m,titular,segunda.posicaoId); // CPF/aceite so primeira posicao
 assert.deepEqual(m.escritorio.consultar(titular.contaId).posicoes.map(
  p=>p.statusAdesao),['ATIVA','ATIVA']);
 const indicado=cadastrar(m,'convidado',titular.codigoConvite);
 const compraIndicado=await comprar(m,indicado,'pedido-convidado');
 assert.equal(compraIndicado.posicaoCriada,true);
 assert.equal(m.escritorio.consultar(titular.contaId).contadoresRede.aguardandoAtivacao,1);
 assert.equal(m.ponte._restaurar().filas.filaA.some(
  p=>p.participanteId===titular.contaId),false);
 ativar(m,indicado,compraIndicado.posicaoId,CPF[8]);
 const pendentes=m.escritorio.consultar(titular.contaId);
 assert.equal(pendentes.contadoresRede.aDistribuir,1);
 assert.equal(pendentes.equipe[0].situacao,'ATIVO');
 // Um convidado verde nao promove todas as cadeiras do mesmo titular.
 const link=m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:indicado.contaId,posicaoId:primeira.posicaoId});
 assert.equal(link.repetida,false);
 assert.equal(m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:indicado.contaId,posicaoId:primeira.posicaoId}).repetida,true);
 assert.throws(()=>m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:indicado.contaId,posicaoId:segunda.posicaoId}),
  x=>x.codigo==='INDICACAO_JA_VINCULADA');
 const simInicial=m.ponte._restaurar();
 assert.ok(simInicial.filas.filaA.some(p=>p.id===primeira.posicaoId));
 assert.ok(simInicial.filas.filaB.some(p=>p.id===segunda.posicaoId));
 const visao=m.escritorio.consultar(titular.contaId);
 assert.equal(visao.equipe.length,1);
 assert.equal(visao.equipe[0].posicaoAtribuidaId,primeira.posicaoId);
 assert.equal(visao.posicoes.find(p=>p.posicaoId===primeira.posicaoId).indicacoesRecebidas,1);
 assert.equal(visao.posicoes.find(p=>p.posicaoId===segunda.posicaoId).indicacoesRecebidas,0);
 assert.equal(visao.contadoresRede.jaDistribuidas,1);
 assert.equal(visao.contadoresRede.aDistribuir,0);
 assert.equal(visao.comprasLojaSemLoop.length,1);
 // Bônus verde: somente provisao; nada autoriza pagamento do banco.
 const extrato=m.saques.consultar(titular.contaId);
 assert.equal(extrato.bonusBrutoHistoricoCentavos,2500);
 assert.equal(extrato.bonusDisponivelSimuladoCentavos,2500);
 const idSaque='saque-11111111-2222-4333-8444-555555555555';
 const saque=m.saques.registrar({contaId:titular.contaId,
  solicitacaoId:idSaque,tipo:'BONUS',valorSolicitadoCentavos:2500});
 assert.equal(saque.taxaPercentual,0);
 assert.equal(saque.taxaSaqueCentavos,0);
 assert.equal(saque.valorLiquidoCentavos,2500);
 assert.equal(saque.transferenciaExecutada,false);
 assert.equal(m.saques.registrar({contaId:titular.contaId,
  solicitacaoId:idSaque,tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,true);
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,0);
 assert.equal(disponibilidadeCofreDemo(m.banco,{
  cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000}).saldoLivreDemonstrativoCentavos,47500);
 integridade(m);
 assert.equal(auditarEntregasEstornosCarrinhoDemo({carrinhos:m.carrinhos}).situacao,
  'SEM_ALERTAS_DE_CONCILIACAO');
 // MOTOR: oito ciclos no objeto do simulador; as vendas AQUI sao somente
 // marcadores ficticios e NAO liquidacoes/pedidos reais da AKITEMM.
 const motor=m.ponte._restaurar();
 motor.abrirCatraca();
 for(let ciclo=1;ciclo<=8;ciclo++){
  for(let ordem=1;ordem<=6;ordem++){
   const p=motor.registrarVendaNoCicloSimulada({
    vendaId:'marcador-ciclo-'+ciclo+'-'+ordem});
   assert.equal(p.venda.destinoPrevisto,DESTINOS[ordem-1]);
  }
  const giro=motor.tentarGiro();
  assert.equal(giro.girou,true);
  if(ciclo===1)assert.equal(giro.novaPosicao6.id,primeira.posicaoId);
  if(ciclo===7)assert.equal(motor.tabuleiro.centro.id,primeira.posicaoId);
  if(ciclo===8){
   assert.equal(giro.centroConcluido.id,primeira.posicaoId);
   assert.deepEqual(motor.tabuleiro.ciclosConcluidos.at(-1).vendas.map(
    v=>v.destinoPrevisto),DESTINOS);
  }
 }
 assert.equal(motor.estado().catraca.giros,8);
 assert.equal(m.ponte.consultar().catracaMovimentada,false);
 // Nao persistimos giros de teste no banco: a ponte ainda nao liquidou
 // seis pagamentos por ciclo, nao pode inventar contemplacao nem lucro.
 const persistido=m.ponte._restaurar();
 assert.equal(persistido.tabuleiro.ciclosConcluidos.length,0);
 integridade(m);
 const totalPedidos=m.carrinhos.listar().pedidos.length;
 assert.equal(totalPedidos,11);
 assert.equal(m.ponte.consultar().compras.length,10);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,1);
 m.repo.fechar();m=abrir(arquivo);
 assert.equal(m.ponte.consultar().compras.length,10);
 assert.equal(m.escritorio.consultar(titular.contaId).contadoresRede.jaDistribuidas,1);
 assert.equal(m.saques.consultar(titular.contaId).historico.length,1);
 assert.equal(m.saques.consultar(titular.contaId).historico[0].taxaPercentual,0);
 integridade(m);
 console.log('LOOP_E2E_CLIENTE_INTEGRADO='+JSON.stringify({
  contasFicticias:9,pedidosTotais:totalPedidos,pedidosQualificados:10,
  vendasSemPosicao:1,vinculosIndividuais:1,posicoesTitular:2,
  posicoesTitularFilaA:1,posicoesTitularFilaB:1,
  bonusVerdeCentavos:2500,saqueSimuladoCentavos:2500,
  tarifaParticipanteCentavos:0,saqueBancarioExecutado:false,
  ciclosSimuladosSomenteMemoria:8,eventosFicticiosDeCiclo:48,
  ciclosFinanceirosLiquidados:0,persistenciaReaberta:true,
  auditadoSemDivergencias:true,lojaOuMotorEmProducao:false}));
});
