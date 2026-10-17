'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {simularElegibilidadeSaque}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');

test('duas ativacoes: compra libera link, CPF e termos liberam bonus futuros, cadeira permite campanha',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const provas=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>provas.get(id)});
 const dia=n=>'2037-06-'+String(n).padStart(2,'0')+'T12:00:00.000Z';
 const comprar=(pedidoId,c,valor,n)=>{
  provas.set(pedidoId,{pedidoId,contaId:c.contaId,produtoId:'pdf-teste',
   valorCentavos:valor,confirmadoEm:dia(n),status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId});
 };
 const titular=contas.cadastrar({nome:'Indicador de Teste',
  email:'indicador-duplo@exemplo.invalid',senha:'senha-ficticia-123456'});
 const indicado=contas.cadastrar({nome:'Convidado Teste',
  email:'convidado-duplo@exemplo.invalid',senha:'senha-ficticia-123456',
  codigoIndicador:titular.codigoConvite});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>dia(3)});
 const dados={contaId:titular.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'};
 assert.equal(ponte.linksComissoes.linkDaConta(titular.contaId).ativo,false);
 assert.throws(()=>adesoes.ativar(dados),e=>e.codigo==='COMPRA_INICIAL_OBRIGATORIA');
 assert.equal((await comprar('pedido-compra-link',titular,5000,1)).posicaoCriada,false);
 assert.equal(ponte.linksComissoes.linkDaConta(titular.contaId).ativo,true);
 assert.equal(ponte.linksComissoes.habilitadoBonificacoes(titular.contaId),false);
 const semAceite=await comprar('pedido-indicado-antes-aceite',indicado,25000,2);
 assert.equal(semAceite.comissaoSimuladaCentavos,0);
 assert.equal(ponte.linksComissoes.comissoesDaConta(titular.contaId).quantidade,0);
 const ativacao=adesoes.ativar(dados);
 assert.equal(ativacao.ativadas,0);
 assert.equal(ativacao.adesaoComissoesAtivada,true);
 assert.equal(ponte.linksComissoes.habilitadoBonificacoes(titular.contaId,dia(4)),true);
 assert.throws(()=>adesoes.ativar(dados),e=>e.codigo==='ADESAO_JA_REALIZADA');
 const primeiro=await comprar('pedido-indicado-bonus-basico',indicado,25000,4);
 assert.equal(primeiro.comissaoSimuladaCentavos,2500);
 assert.equal(primeiro.percentualBonusAplicado,10);
 const cadeira=await comprar('pedido-cadeira-indicador',titular,25000,5);
 assert.equal(cadeira.statusAdesao,'ATIVA');
 ponte.linksComissoes.taxas.agora=()=>dia(5).replace('T12:00','T13:00');
 assert.equal(ponte.linksComissoes.taxas.alterar({percentual:30,revisaoEsperada:1}).percentual,30);
 const promocional=await comprar('pedido-indicado-promocional',indicado,25000,6);
 assert.equal(promocional.comissaoSimuladaCentavos,7500);
 assert.equal(promocional.percentualBonusAplicado,30);
 const retroativo=await comprar('pedido-indicado-retroativo',indicado,25000,2);
 assert.equal(retroativo.comissaoSimuladaCentavos,0);
 const bonus=ponte.linksComissoes.comissoesDaConta(titular.contaId);
 assert.equal(bonus.totalSimuladoCentavos,10000);
 assert.equal(bonus.quantidade,2);
 assert.equal(bonus.cpfTermosConfirmados,true);
 assert.equal(bonus.solicitarSaqueSimuladoHabilitado,true);
 assert.equal(bonus.saqueDisponivelReal,false);
 assert.throws(()=>simularElegibilidadeSaque({saldoSimuladoCentavos:10000,
  valorSolicitadoCentavos:10000}),e=>e.codigo==='CPF_E_TERMOS_OBRIGATORIOS');
 assert.equal(simularElegibilidadeSaque({saldoSimuladoCentavos:10000,
  valorSolicitadoCentavos:10000,cpfTermosConfirmados:true}).transferenciaExecutada,false);
});
