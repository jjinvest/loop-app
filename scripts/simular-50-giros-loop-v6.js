'use strict';

/**
 * Stress test reproduzivel da CATrACA LOOP V6:
 * - 100 posicoes iniciais, 1 pessoa por posicao.
 * - 50 giros completos => 300 eventos de venda simulados.
 * - Cada evento gera UM novo cliente + UMA posicao nova na fila B.
 * - Algumas vendas sao de pessoas indicadas; convites validos promovem
 *   indicador B->A ou alteram prioridade de quem ja esta em A.
 * - Indicadores alternam 1,2,3,4 convites ao longo do tempo.
 * - Sem aleatoriedade, dinheiro, promessas de ganho ou dados de clientes.
 *
 * Execute: node scripts/simular-50-giros-loop-v6.js
 */
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {DESTINOS}=require('../src/domain/tabuleiro-loop');

const INICIAIS=100;
const GIROS=50;
const EVENTOS_POR_GIRO=DESTINOS.length;

function executarCenario50Giros(){
 let relogioContador=0;
 const relogio=()=>new Date(Date.UTC(2026,9,17,0,0,0)+(relogioContador++)*1000).toISOString();
 let sim=new SimuladorLoop({relogio});
 const idsPosicoes=new Set(),centrosConcluidos=new Set();
 const indicar={
  total:0,participantesComIndicacoes:new Set(),
  migraramParaA:new Set(),reordenacoesA:0,
  historicoPorIndicador:new Map(),eventos:[]
 };
 const candidatos=[
  ...Array.from({length:24},(_,i)=>28+i*3),
  ...Array.from({length:28},(_,i)=>104+i*10)
 ];
 let candidatoAtual=0,consecutivosA=0;
 let idPessoa=0,entradasA=0,entradasB=0,retornosB=0;
 const evolucao=[];
 const cadastrar=()=>{
  const numero=++idPessoa;
  const pos=sim.registrarPosicaoSimulada({
   nome:'Pessoa simulada '+numero,
   participanteId:'pessoa-'+numero,
   vendaId:'compra-ficticia-'+numero
  });
  assert.equal(pos.repetida,false);
  assert.ok(!idsPosicoes.has(pos.posicao.id),'ID de posicao deve ser unico');
  idsPosicoes.add(pos.posicao.id);
  assert.equal(pos.posicao.fila,'B');
  return pos.posicao;
 };
 for(let i=0;i<INICIAIS;i++)cadastrar();
 let inicial=sim.prepararTabuleiro();
 assert.ok(inicial.centro);
 assert.equal(inicial.vagas.length,6);
 assert.ok(inicial.vagas.every(Boolean));
 assert.equal(sim.filas.filaA.length,0);
 assert.equal(sim.filas.filaB.length,INICIAIS-7);
 sim.abrirCatraca();

 function tentarIndicar(convidado,giro,evento){
  // Calendario irregular: alguns compram sem indicacao, outros indicam 1 a 4.
  // Mesma pessoa pode indicar novamente meses/ciclos adiante; nunca mais de 4.
  const numeroEvento=(giro-1)*EVENTOS_POR_GIRO+evento;
  if(numeroEvento%3!==0&&numeroEvento%7!==0)return;
  while(candidatoAtual<candidatos.length){
   const numero=candidatos[candidatoAtual];
   const chave='pessoa-'+numero;
   const atual=indicar.historicoPorIndicador.get(chave)||0;
   const alvo=1+(candidatoAtual%4);
   const naFila=sim.filas.filaA.some(p=>p.participanteId===chave)||
    sim.filas.filaB.some(p=>p.participanteId===chave);
   if(atual>=alvo||(numero<=idPessoa&&!naFila)){
    candidatoAtual++;continue;
   }
   if(numero>idPessoa)return; // Esperar o candidato realmente comprar.
   const estavaEmB=sim.filas.filaB.some(p=>p.participanteId===chave);
   const resultado=sim.registrarIndicacaoSimulada({
    indicadorId:chave,
    eventoId:'convite-validado-'+numeroEvento+'-'+convidado.id,
    convidouEm:relogio()
   });
   assert.equal(resultado.repetida,false);
   assert.equal(resultado.quantidade,atual+1);
   if(estavaEmB){
    assert.ok(resultado.promovidas.some(p=>p.participanteId===chave));
    indicar.migraramParaA.add(chave);
   }else{
    assert.equal(resultado.promovidas.length,0);
    indicar.reordenacoesA++;
   }
   indicar.historicoPorIndicador.set(chave,atual+1);
   indicar.participantesComIndicacoes.add(chave);
   indicar.total++;
   indicar.eventos.push({giro,indicadorNumero:numero,convidadoNumero:idPessoa,
    novaQuantidade:atual+1,efeito:estavaEmB?'PROMOVE_B_PARA_A':'REORDENA_FILA_A'});
   if(atual+1===alvo)candidatoAtual++;
   return;
  }
 }
 function validarConservacao(numeroGiro){
  const ativos=[
   ...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas
  ].filter(Boolean);
  const concluidos=sim.tabuleiro.ciclosConcluidos.map(x=>x.centro);
  assert.equal(ativos.length+concluidos.length,idPessoa,
   'Nenhuma cadeira pode desaparecer: giro '+numeroGiro);
  assert.equal(new Set([...ativos,...concluidos].map(p=>p.id)).size,idPessoa,
   'Sem duplicata ou perda de posicoes: giro '+numeroGiro);
  assert.equal(centrosConcluidos.size,numeroGiro);
  assert.equal(sim.tabuleiro.ciclosConcluidos.length,numeroGiro);
  assert.ok(sim.tabuleiro.centro,'centro nao pode ficar vazio');
  assert.ok(sim.tabuleiro.vagas.every(Boolean),'tabuleiro deve ter seis periferias ocupadas');
  assert.equal(sim.tabuleiro.vendasDoCiclo.length,0);
 }
 for(let giro=1;giro<=GIROS;giro++){
  const centroAntes=sim.tabuleiro.centro.id;
  const vaga1Antes=sim.tabuleiro.vagas[0].id;
  const vagasAntes=sim.tabuleiro.vagas.map(p=>p.id);
  for(let evento=1;evento<=EVENTOS_POR_GIRO;evento++){
   const entrou=cadastrar();
   tentarIndicar(entrou,giro,evento);
   const venda=sim.registrarVendaNoCicloSimulada({
    vendaId:'evento-ciclo-'+giro+'-venda-'+evento
   });
   assert.equal(venda.repetida,false);
   assert.equal(venda.venda.ciclo,giro);
   assert.equal(venda.venda.ordem,evento);
   assert.equal(venda.venda.destinoPrevisto,DESTINOS[evento-1]);
   assert.equal(venda.venda.posicaoCentroId,centroAntes);
   assert.equal(venda.elegivelParaGiro,evento===EVENTOS_POR_GIRO);
  }
  assert.equal(sim.tentarGiro().girou,true);
  const ultimo=sim.tabuleiro.ciclosConcluidos.at(-1);
  assert.equal(ultimo.centro.id,centroAntes);
  assert.equal(ultimo.vendas.length,EVENTOS_POR_GIRO);
  assert.ok(!centrosConcluidos.has(centroAntes));
  centrosConcluidos.add(centroAntes);
  const nova=sim.tabuleiro.vagas[5];
  assert.equal(sim.tabuleiro.centro.id,vaga1Antes);
  for(let vaga=0;vaga<5;vaga++){
   assert.equal(sim.tabuleiro.vagas[vaga].id,vagasAntes[vaga+1],
    'Deslocamento uniforme da periferia no giro '+giro);
  }
  assert.ok(nova);
  assert.ok(['A','B'].includes(nova.origemFila));
  if(nova.origemFila==='A'){
   entradasA++;consecutivosA++;
   assert.ok(consecutivosA<=3,'Prioridade A deve intercalar B a cada tres chamadas');
  }else{entradasB++;consecutivosA=0;}
  validarConservacao(giro);
  evolucao.push({
   giro,centroConcluidoId:centroAntes,novoCentroId:sim.tabuleiro.centro.id,
   entradaVaga6DaFila:nova.origemFila,
   filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
   totalAguardando:sim.filas.filaA.length+sim.filas.filaB.length,
   posicoesCriadasAcumuladas:idPessoa,
   convitesAcumulados:indicar.total,saidasAcumuladas:centrosConcluidos.size
  });
  if(giro%10===0){
   const recuperado=SimuladorLoop.restaurarSnapshot(sim.exportarSnapshot(),{relogio});
   assert.deepEqual(recuperado.exportarSnapshot(),sim.exportarSnapshot());
   sim=recuperado;
  }
 }
 const ultimo=evolucao.at(-1);
 assert.equal(idPessoa,INICIAIS+GIROS*EVENTOS_POR_GIRO);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,GIROS);
 assert.equal(ultimo.totalAguardando,idPessoa-GIROS-7);
 assert.equal(entradasA+entradasB,GIROS);
 assert.equal(sim.tabuleiro.vendasProcessadas.size,GIROS*EVENTOS_POR_GIRO);
 assert.equal(sim.filas.vendasRegistradas.size,idPessoa);
 const convidadosPorIndicador=[0,0,0,0,0];
 for(const v of indicar.historicoPorIndicador.values()){
  assert.ok(v>=1&&v<=4);
  convidadosPorIndicador[v]++;
 }
 // Balanco de DESTINACOES do motor, nao contabilidade bancária:
 // cada evento de seis vendas traz referencia de R$250, independentemente
 // do preco efetivo do produto, fornecedor, impostos e eventuais estornos.
 const referenciaCentavos=25000;
 const destinosFinanceirosReferenciais={
  LOOP_CENTRO:0,LOOP_DOURADAS:0,LOOP_ESQUERDA:0,LOOP_DIREITA:0
 };
 let centrosDeClientes=0,centrosDoLoop=0;
 for(const ciclo of sim.tabuleiro.ciclosConcluidos){
  assert.equal(ciclo.vendas.length,6);
  if(ciclo.centro.empresa===true||ciclo.centro.titularOperacional==='LOOP_EMPRESA'){
   centrosDoLoop++;
  }else centrosDeClientes++;
  for(const v of ciclo.vendas){
   assert.ok(Object.hasOwn(destinosFinanceirosReferenciais,v.destinoCofre));
   destinosFinanceirosReferenciais[v.destinoCofre]+=referenciaCentavos;
  }
 }
 const totalAlocadoReferencialCentavos=Object.values(
  destinosFinanceirosReferenciais).reduce((a,b)=>a+b,0);
 assert.equal(totalAlocadoReferencialCentavos,GIROS*EVENTOS_POR_GIRO*referenciaCentavos);
 const comissoesHipoteticas10PorcentoCentavos=indicar.total*2500;
 // Comparacao de sustentabilidade comercial: nao altera os cofres
 // e explicita que parcela LOOP de R$250 + custo de fornecedor
 // nao cabe em venda a R$250.
 const custoFornecedorExemploCentavos=30000;
 const precoProdutoExemploCentavos=60000;
 const margemBrutaExemploPorVendaCentavos=
  precoProdutoExemploCentavos-custoFornecedorExemploCentavos-referenciaCentavos;
 const financeiro={
  modo:'DISTRIBUICAO_REFERENCIAL_NAO_CAIXA',
  referenciaPorEventoCentavos:referenciaCentavos,
  eventosCiclo:GIROS*EVENTOS_POR_GIRO,
  distribuicaoReferencialCentavos:destinosFinanceirosReferenciais,
  totalAlocadoReferencialCentavos,
  centrosDeClientes,centrosDoLoop,
  comprasIniciaisNaoIncluidasNosEventosDeCiclo:INICIAIS,
  vendaBrutaHipoteticaSeCadaUmaDas400ComprasFosse250Centavos:
   (INICIAIS+GIROS*EVENTOS_POR_GIRO)*referenciaCentavos,
  novasVendasHipoteticasSePrecoFor250Centavos:
   GIROS*EVENTOS_POR_GIRO*referenciaCentavos,
  comissoesHipoteticas10PorcentoCentavos,
  comissoesEfetivamentePagasCentavos:0,
  precoProdutoExemploCentavos,custoFornecedorExemploCentavos,
  margemBrutaExemploPorVendaCentavos,
  margemBrutaComercialExemploTotalCentavos:
   margemBrutaExemploPorVendaCentavos*GIROS*EVENTOS_POR_GIRO,
  margemComercialExemploAposComissaoHipoteticaCentavos:
   margemBrutaExemploPorVendaCentavos*GIROS*EVENTOS_POR_GIRO-
   comissoesHipoteticas10PorcentoCentavos,
  pagamentosReaisCentavos:0,saldoBancarioVerificado:false,
  lucrosReaisComprovados:false,obrigacoesTributariasCalculadas:false
 };
 const relatorio={
  tipo:'SIMULACAO_DE_FILAS_E_GIROS_LOO P_V6'.replace(' ',''),
  hipotese:'100 pessoas no inicio e 6 novos compradores por giro; uma unica posicao por compra',
  giros:GIROS,saidasDoCentro:centrosConcluidos.size,
  vendasSimuladasNoPeriodo:GIROS*EVENTOS_POR_GIRO,
  posicoesIniciais:INICIAIS,
  novasPosicoes:GIROS*EVENTOS_POR_GIRO,
  posicoesCriadasNoTotal:idPessoa,
  inicio:{filaA:0,filaB:INICIAIS-7,aguardando:INICIAIS-7,tabuleiroOcupado:7},
  final:{filaA:ultimo.filaA,filaB:ultimo.filaB,
   aguardando:ultimo.totalAguardando,tabuleiroOcupado:7,concluidos:GIROS},
  chamadasParaVaga6:{filaA:entradasA,filaB:entradasB},
  convites:{
   validados:indicar.total,
   pessoasQueIndicaram:indicar.participantesComIndicacoes.size,
   pessoasPromovidasDeBParaA:indicar.migraramParaA.size,
   convitesDeQuemJaEstavaEmA:indicar.reordenacoesA,
   indicadoresCom1:convidadosPorIndicador[1],
   indicadoresCom2:convidadosPorIndicador[2],
   indicadoresCom3:convidadosPorIndicador[3],
   indicadoresCom4:convidadosPorIndicador[4]
  },
  pontosDeControle:evolucao.filter(x=>[1,5,10,15,20,25,30,35,40,45,50].includes(x.giro)),
  historico:evolucao,
  financeiro,
  dinheiroReal:false,pagamentosReais:0,
  saquesReais:0,contemplacoesFinanceirasReais:0,
  promessaDeRecebimento:false
 };
 return relatorio;
}
if(require.main===module){
 try{
  const r=executarCenario50Giros();
  process.stdout.write('50 GIROS V6 · RESULTADO DO MOTOR (100% FICTICIO)\n');
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
 }catch(e){process.stderr.write('ERRO SIMULACAO: '+e.stack+'\n');process.exitCode=1;}
}
module.exports={executarCenario50Giros};
