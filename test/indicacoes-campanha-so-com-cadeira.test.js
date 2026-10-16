'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');

test('tres anos depois: campanha 50% exige cadeira no minimo atual de R$500, senao mantem 10%',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 const indicador=contas.cadastrar({
  nome:'Indicador Somente Link',email:'link-50@exemplo.invalid',
  senha:'senha-ficticia-completa-2026'
 });
 const comprador=contas.cadastrar({
  nome:'Comprador da Campanha',email:'cliente-50@exemplo.invalid',
  senha:'senha-ficticia-completa-2026',codigoIndicador:indicador.codigoConvite
 });
 const dia=n=>'2033-04-'+String(n).padStart(2,'0')+'T12:00:00.000Z';
 const comprar=(pedidoId,conta,centavos,quando)=>{
  comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,
   produtoId:'produto-ficticio',valorCentavos:centavos,
   confirmadoEm:quando,status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId});
 };
 const base=await comprar('compra-link-50',indicador,3000,
  '2030-01-02T12:00:00.000Z');
 assert.equal(base.posicaoCriada,false);
 assert.equal(ponte.linksComissoes.linkDaConta(indicador.contaId).ativo,true);
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>'2030-01-03T12:00:00.000Z'});
 assert.equal(adesoes.ativar({contaId:indicador.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,0);
 const config=ponte.configuracaoValor;
 config.agora=()=>dia(1);
 assert.equal(config.alterar({valorCentavos:50000,revisaoEsperada:1}).valorCentavos,50000);
 const taxas=ponte.linksComissoes.taxas;
 taxas.agora=()=>dia(1);
 assert.equal(taxas.alterar({percentual:50,revisaoEsperada:1}).percentual,50);
 const convidado1=await comprar('compra-convidado-500-1',comprador,50000,dia(2));
 assert.equal(convidado1.posicaoCriada,true);
 assert.equal(convidado1.comissaoSimuladaCentavos,5000);
 assert.equal(convidado1.percentualBonusAplicado,10);
 assert.equal(convidado1.indicadorElegivelBonusExtra,false);
 const escritorio=new EscritorioIndividualDemo({ponte,contas});
 let bonusEscritorio=escritorio.consultar(indicador.contaId).bonusIndicacoes;
 assert.equal(bonusEscritorio.ativoNoLoopAgora,false);
 assert.equal(bonusEscritorio.porcentagemCampanhaHoje,50);
 assert.equal(bonusEscritorio.porcentagemAplicavelHoje,10);
 assert.equal(bonusEscritorio.valorMinimoPosicaoHojeCentavos,50000);
 // Na nova referencia R$250 NAO cria cadeira, so mantem link ja liberado.
 const insuficiente=await comprar('compra-indicador-250',indicador,25000,dia(3));
 assert.equal(insuficiente.posicaoCriada,false);
 assert.equal(ponte.consultar().filas.A.quantidade,0);
 const convidado2=await comprar('compra-convidado-500-2',comprador,50000,dia(4));
 assert.equal(convidado2.comissaoSimuladaCentavos,5000);
 // O indicador precisa de R$500 naquele momento para criar sua cadeira.
 const ativacao=await comprar('compra-indicador-500',indicador,50000,dia(5));
 assert.equal(ativacao.posicaoCriada,true);
 assert.equal(ativacao.statusAdesao,'ATIVA'); // Aceite anterior ativa a cadeira automaticamente.
 bonusEscritorio=escritorio.consultar(indicador.contaId).bonusIndicacoes;
 assert.equal(bonusEscritorio.ativoNoLoopAgora,true);
 assert.equal(bonusEscritorio.porcentagemAplicavelHoje,50);
 assert.equal(ponte.consultar().filas.A.quantidade,1); // Indicacoes anteriores promovem.
 const convidado3=await comprar('compra-convidado-500-3',comprador,50000,dia(6));
 assert.equal(convidado3.comissaoSimuladaCentavos,25000);
 assert.equal(convidado3.percentualBonusAplicado,50);
 assert.equal(convidado3.indicadorElegivelBonusExtra,true);
 const extrato=ponte.linksComissoes.comissoesDaConta(indicador.contaId);
 assert.deepEqual(extrato.registros.map(x=>x.percentual),[10,10,50]);
 assert.deepEqual(extrato.registros.map(x=>x.percentualCampanha),[50,50,50]);
 assert.deepEqual(extrato.registros.map(x=>x.indicadorAtivoNoLoop),[0,0,1]);
 assert.equal(extrato.totalSimuladoCentavos,35000);
 assert.equal(extrato.origemExclusiva,'LOOP_DIREITA');
 assert.equal(extrato.atingiuMinimoSaque,true);
 // Uma compra retroativa nao pode aproveitar cadeira comprada depois.
 const antiga=await comprar('compra-convidado-retroativa',comprador,50000,dia(4));
 assert.equal(antiga.percentualBonusAplicado,10);
 assert.equal(antiga.comissaoSimuladaCentavos,5000);
 assert.equal(antiga.indicadorElegivelBonusExtra,false);
 const original=await ponte.processar({pedidoId:'compra-convidado-500-3'});
 assert.equal(original.repetido,true);
 assert.equal(ponte.linksComissoes.comissoesDaConta(indicador.contaId).quantidade,4);
 assert.equal(repo.banco.prepare(
  "SELECT COUNT(*) AS total FROM admin_comissoes_criterio_v2_demo WHERE ativo_no_loop=1"
 ).get().total,1);
});
test('cadeira azul que virou ouro LOOP nao habilita bonificacao promocional do antigo comprador',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 const todos=[];
 for(let i=0;i<6;i++)todos.push(contas.cadastrar({
  nome:'Pessoa Ouro '+i,email:'ouro-'+i+'@exemplo.invalid',
  senha:'senha-ficticia-completa-2026'
 }));
 const indicar=todos[0];
 const convidado=contas.cadastrar({
  nome:'Convidado Ouro',email:'convidado-ouro@exemplo.invalid',
  senha:'senha-ficticia-completa-2026',codigoIndicador:indicar.codigoConvite
 });
 const tempo=n=>'2034-01-'+String(n).padStart(2,'0')+'T12:00:00.000Z';
 const comprar=async(pedidoId,c,valor,dia)=>{
  comprovantes.set(pedidoId,{pedidoId,contaId:c.contaId,
   produtoId:'curso',valorCentavos:valor,confirmadoEm:tempo(dia),
   status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId});
 };
 for(let i=0;i<6;i++)await comprar('compra-ouro-'+i,todos[i],25000,i+1);
 const preparada=ponte.prepararTabuleiroDemo();
 assert.equal(preparada.tabuleiro.centro.statusAdesao,'PRAZO_ENCERRADO');
 assert.equal(preparada.tabuleiro.centro.participanteId,indicar.contaId);
 // A cadeira perdeu o prazo; CPF agora habilita apenas os bonus basicos futuros.
 const adesoesOuro=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>tempo(7)});
 assert.equal(adesoesOuro.ativar({contaId:indicar.contaId,cpfFicticio:'52998224725',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,0);
 ponte.linksComissoes.taxas.agora=()=>tempo(7);
 ponte.linksComissoes.taxas.alterar({percentual:30,revisaoEsperada:1});
 const bonificacao=await comprar('convidado-ouro-250',convidado,25000,8);
 assert.equal(bonificacao.indicadorElegivelBonusExtra,false);
 assert.equal(bonificacao.percentualBonusAplicado,10);
 assert.equal(bonificacao.comissaoSimuladaCentavos,2500);
 const extrato=ponte.linksComissoes.comissoesDaConta(indicar.contaId);
 assert.equal(extrato.registros[0].percentualCampanha,30);
 assert.equal(extrato.registros[0].percentual,10);
});
