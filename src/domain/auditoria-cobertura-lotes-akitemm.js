'use strict';
// Auditoria READ-ONLY da viabilidade aritmetica dos LOTES AKITEMM.
// O valor de referencia de cada posicao nao equivale ao custo total da
// obrigacao condicional: sao medidas distintas. Nenhum valor "aprovado"
// aqui pode ativar saques, giros, PSP comercial ou posicoes reais.
const {planejarPosicoesCompraAkitemm}=require('./plano-posicoes-compra-akitemm');
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const {consultarResumoFinanceiroOperacionalLab}=require('./resumo-financeiro-operacional-lab');
const REF=25000, EXPOSICAO_TEORICA_CICLO=75000;
const CAMPOS_CUSTO=Object.freeze(['fornecedorCentavos','pspCentavos',
 'tributosCentavos','freteSuportadoCentavos','reservaReembolsosCentavos',
 'bonusPrevistosCentavos','outrosCustosCentavos']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function seguro(n){return Number.isSafeInteger(n)&&n>=0;}
function somar(a,b){const r=a+b;if(!seguro(r))falha('VALOR_CENTAVOS_INSEGURO');return r;}
function vezes(a,b){const r=a*b;if(!seguro(r))falha('VALOR_CENTAVOS_INSEGURO');return r;}
function validarCustos(custos){
 if(custos===null)return null;
 if(!custos||typeof custos!=='object'||Array.isArray(custos)||
    Object.keys(custos).sort().join(',')!==[...CAMPOS_CUSTO].sort().join(','))
   falha('CUSTOS_INCOMPLETOS');
 let total=0;for(const campo of CAMPOS_CUSTO){
  if(!seguro(custos[campo]))falha('CUSTOS_INVALIDOS');
  total=somar(total,custos[campo]);
 }
 return total;
}
function auditarCoberturaDePedido({fotografia,valorPedidoCentavos,
 custosEstimados=null}={}){
 if(!seguro(valorPedidoCentavos))falha('VALOR_PEDIDO_INVALIDO');
 if(!fotografia||typeof fotografia!=='object'||Array.isArray(fotografia))
  falha('FOTOGRAFIA_INVALIDA');
 const plano=fotografia.planejamentoPosicoes;
 if(!plano||!Array.isArray(fotografia.itens))
  return {estado:'FOTO_SEM_PLANO_VIGENTE',alertas:['PLANEJAMENTO_HISTORICO_AUSENTE'],
   podeLiberarOperacaoReal:false,dinheiroRealComprovadoCentavos:0,
   validacaoBancariaExecutada:false};
 const calculado=planejarPosicoesCompraAkitemm(fotografia.itens);
 if(JSON.stringify(calculado)!==JSON.stringify(plano)||
    plano.valorTotalCentavos!==valorPedidoCentavos||
    fotografia.totalCentavos!==valorPedidoCentavos)
  falha('FOTOGRAFIA_PLANO_DIVERGENTE');
 const n=calculado.quantidadePosicoesPrevistas;
 const referencia=vezes(n,REF);
 const exposicao=vezes(n,EXPOSICAO_TEORICA_CICLO);
 const diferencaBruta=valorPedidoCentavos-referencia;
 // Um CINZA caro nao pode mascarar um ROXO sem valor suficiente.
 // VERDE forma apenas um grupo por pedido; ROXO e DOURADO sao
 // auditados por LINHA de produto, sem compensar deficits individuais.
 const grupos=[];
 const verde=calculado.valorVerdeConsideradoCentavos;
 if(calculado.posicoesVerde)grupos.push({
  grupo:'VERDE',produtoId:null,subtotalCentavos:verde,
  posicoes:1,referenciaCentavos:REF
 });
 for(const item of fotografia.itens){
  const classe=item.classificacao==='EVENTO'?'ROXO':item.classificacao;
  const posicoes=classe==='DOURADO'?item.quantidade:
   classe==='ROXO'?(item.posicoesPorUnidadeRoxo||0)*item.quantidade:0;
  if(posicoes)grupos.push({
   grupo:classe,produtoId:item.produtoId,
   subtotalCentavos:item.subtotalCentavos,posicoes,
   referenciaCentavos:vezes(posicoes,REF)
  });
 }
 const segmentosInsuficientes=grupos.filter(g=>
  g.subtotalCentavos<g.referenciaCentavos).map(g=>({
   grupo:g.grupo,produtoId:g.produtoId,posicoes:g.posicoes,
   deficitCentavos:g.referenciaCentavos-g.subtotalCentavos
  }));
 const deficitSegmentosCentavos=segmentosInsuficientes.reduce((v,g)=>
  somar(v,g.deficitCentavos),0);
 const valorDeProdutosQueGeramPosicaoCentavos=grupos.reduce((v,g)=>
  somar(v,g.subtotalCentavos),0);
 const custo=validarCustos(custosEstimados);
 const margem= custo===null?null:valorPedidoCentavos-custo-referencia;
 const alertas=[];
 if(calculado.pendenciasConfiguracaoRoxo)alertas.push('EVENTO_ROXO_NAO_CONFIGURADO');
 if(calculado.excedeLimitePorPedido)alertas.push('LIMITE_DEZ_POSICOES');
 if(diferencaBruta<0)alertas.push('REFERENCIA_POR_POSICAO_SUPERA_PRECO_BRUTO');
 if(segmentosInsuficientes.length)
  alertas.push('PRODUTO_QUALIFICADOR_COM_COBERTURA_BRUTA_INSUFICIENTE');
 if(custo===null)alertas.push('FORNECEDOR_PSP_TRIBUTOS_FRETE_RESERVAS_SEM_EVIDENCIA');
 else if(margem<0)alertas.push('REFERENCIA_SEM_COBERTURA_APOS_CUSTOS_ESTIMADOS');
 // Nao ha validação de KYC, banco ou legitimidade das bases estimadas.
 alertas.push('FALTA_LIQUIDACAO_BANCARIA_E_COMPROVACAO_EXTERNA');
 return {
  estado:diferencaBruta<0?'BRUTO_INSUFICIENTE':
   segmentosInsuficientes.length?'SEGMENTO_SEM_COBERTURA_BRUTA':
   custo===null?'CUSTOS_NAO_COMPROVADOS':
    margem<0?'INSUFICIENTE_APOS_CUSTOS_ESTIMADOS':
     'COBERTURA_ARITMETICA_COM_PREMISSAS_NAO_AUDITADAS',
  posicoesVerde:calculado.posicoesVerde,posicoesDourado:calculado.posicoesDourado,
  posicoesRoxo:calculado.posicoesRoxo,totalPosicoesPlanejadas:n,
  valorBrutoCentavos:valorPedidoCentavos,
  reservaReferenciaPosicoesCentavos:referencia,
  diferencaBrutaAposReferenciaCentavos:diferencaBruta,
  valorDeProdutosQueGeramPosicaoCentavos,
  diferencaDeQualificadoresAposReferenciaCentavos:
   valorDeProdutosQueGeramPosicaoCentavos-referencia,
  segmentosInsuficientes,deficitSegmentosCentavos,
  custosEstimadosCentavos:custo,
  saldoAposCustosEReferenciaCentavos:margem,
  exposicaoCondicionalSeTodasPosicoesConcluiremCentavos:exposicao,
  exposicaoCondicionalNaoEhDividaLiquida:true,
  referencialPorPosicaoCentavos:REF,
  alertas,
  nenhumaTransferenciaExecutada:true,podeLiberarOperacaoReal:false,
  dinheiroRealComprovadoCentavos:0,validacaoBancariaExecutada:false
 };
}
function auditarCarteiraDePedidosAkitemmLab({banco,sinalizacao,limite=50}={}){
 if(process.env.NODE_ENV==='production')falha('AUDITORIA_STAGING_PROIBIDA_PRODUCAO');
 if(typeof banco?.prepare!=='function'||sinalizacao?.db!==banco||
    typeof sinalizacao?.consultarFotografiaPrepedido!=='function')
  falha('FONTES_SQLITE_DO_PEDIDO_OBRIGATORIAS');
 if(!Number.isSafeInteger(limite)||limite<1||limite>100)
  falha('LIMITE_AUDITORIA_INVALIDO');
 const livros=consultarResumoFinanceiroOperacionalLab({banco});
 const total=banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n;
 const existeLote=!!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_motor_ensaio_lotes_pedido'").get();
 const existeAceite=!!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_motor_ensaio_aceites_posicao'").get();
 // Conferencia GLOBAL: tambem detecta lotes ou aceites que nao
 // pertencem a nenhum prepedido legitimo (nao somente os da pagina).
 const lotesSemPedido=existeLote?banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=l.prepedido_id AND p.titular_id=l.titular_id',
  'WHERE p.prepedido_id IS NULL'
 ].join(' ')).get().n:0;
 const aceitesSemVinculoConsistente=existeLote&&existeAceite?banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao a',
  'LEFT JOIN akitemm_motor_ensaio_lotes_pedido l',
  'ON l.numero_posicao=a.numero_posicao AND',
  'l.prepedido_id=a.prepedido_id AND l.titular_id=a.titular_id',
  'WHERE l.numero_posicao IS NULL'
 ].join(' ')).get().n:0;
 const contarAceites=existeLote&&existeAceite?banco.prepare([
  'SELECT COUNT(*) AS quantidade,',
  'COALESCE(SUM(CASE WHEN a.numero_posicao IS NOT NULL THEN 1 ELSE 0 END),0) AS aceites,',
  'COALESCE(SUM(CASE WHEN a.numero_posicao IS NOT NULL AND',
  '(a.prepedido_id<>l.prepedido_id OR a.titular_id<>l.titular_id)',
  'THEN 1 ELSE 0 END),0) AS identidadesDivergentes',
  'FROM akitemm_motor_ensaio_lotes_pedido l',
  'LEFT JOIN akitemm_motor_ensaio_aceites_posicao a ON a.numero_posicao=l.numero_posicao',
  'WHERE l.prepedido_id=? AND l.titular_id=?'
 ].join(' ')):null;
 const rows=banco.prepare([
  'SELECT prepedido_id AS prepedidoId,titular_id AS titularId,',
  'total_centavos AS valorCentavos',
  'FROM akitemm_checkout_prepedidos_staging',
  'ORDER BY criado_em DESC,prepedido_id DESC LIMIT ?'
 ].join(' ')).all(limite);
 const resumo={pedidosNaAmostra:rows.length,pedidosTotal:total,
  brutoInsuficiente:0,segmentosInsuficientes:0,
  semComprovacaoDeCustos:0,
  semFotografiaVigente:0,lotesDivergentes:0,
  lotesSemPSPConferido:0,reversoesOuRevisoes:0,comPSPConferido:0,
  referenciaTotalCalculadaCentavos:0,exposicaoCondicionalCentavos:0,
  posicoesNoMotorEnsaio:0,aceitesHistoricosIndividuais:0,
  aceitesSemPSPVigente:0,aceitesComTitularDivergente:0,
  lotesParciais:0,valorCondicionalDosLotesCentavos:0,
  lotesSemPedidoValidoNoBanco:lotesSemPedido,
  aceitesSemVinculoConsistenteNoBanco:aceitesSemVinculoConsistente};
 const pedidos=[];
 for(const row of rows){
  const foto=sinalizacao.consultarFotografiaPrepedido({
   prepedidoId:row.prepedidoId,titularId:row.titularId
  });
  let resultado;
  try{resultado=auditarCoberturaDePedido({
   fotografia:foto,valorPedidoCentavos:row.valorCentavos
  });}catch(e){
   resultado={estado:'FOTOGRAFIA_DIVERGENTE',
    alertas:[e.codigo||'FOTOGRAFIA_INCONSISTENTE'],
    podeLiberarOperacaoReal:false};
  }
  const psp=consultarPedido({
   banco,prepedidoId:row.prepedidoId,titularId:row.titularId
  });
  const lidos=contarAceites?contarAceites.get(row.prepedidoId,row.titularId):null;
  const lotes=lidos?lidos.quantidade:existeLote?banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido',
   'WHERE prepedido_id=? AND titular_id=?'
  ].join(' ')).get(row.prepedidoId,row.titularId).n:0;
  const aceites=lidos?.aceites||0;
  resumo.posicoesNoMotorEnsaio=somar(resumo.posicoesNoMotorEnsaio,lotes);
  resumo.aceitesHistoricosIndividuais=somar(resumo.aceitesHistoricosIndividuais,aceites);
  resumo.valorCondicionalDosLotesCentavos=somar(
   resumo.valorCondicionalDosLotesCentavos,vezes(lotes,EXPOSICAO_TEORICA_CICLO));
  const flags=[...resultado.alertas||[]];
  const confirmado=psp?.conferenciaPSPConcluida===true&&
   psp?.exigeRevisaoManual!==true&&psp?.ultimoStatusPSP==='RECEIVED';
  if(psp?.exigeRevisaoManual)resumo.reversoesOuRevisoes++;
  if(confirmado)resumo.comPSPConferido++;
  if(lotes&&!confirmado){flags.push('LOTE_SEM_PSP_VIGENTE');resumo.lotesSemPSPConferido++;}
  if(aceites&&!confirmado){
   flags.push('ACEITES_HISTORICOS_SEM_PSP_VIGENTE');
   resumo.aceitesSemPSPVigente=somar(resumo.aceitesSemPSPVigente,aceites);
  }
  if(lidos?.identidadesDivergentes){
   flags.push('ACEITE_INDIVIDUAL_TITULAR_OU_PEDIDO_DIVERGENTE');
   resumo.aceitesComTitularDivergente=somar(resumo.aceitesComTitularDivergente,
    lidos.identidadesDivergentes);
  }
  if(resultado.totalPosicoesPlanejadas!==undefined&&lotes>0&&
     lotes<resultado.totalPosicoesPlanejadas){
   flags.push('LOTE_INCOMPLETO_FRENTE_AO_PLANO');
   resumo.lotesParciais++;
  }
  if(resultado.totalPosicoesPlanejadas!==undefined&&
     lotes>resultado.totalPosicoesPlanejadas){
   flags.push('LOTE_EXCEDE_POSICOES_PLANEJADAS');
   resumo.lotesDivergentes++;
  }
  if(resultado.estado==='BRUTO_INSUFICIENTE')resumo.brutoInsuficiente++;
  if(resultado.segmentosInsuficientes?.length)resumo.segmentosInsuficientes++;
  if(resultado.estado==='CUSTOS_NAO_COMPROVADOS'||
     resultado.estado==='BRUTO_INSUFICIENTE'||
     resultado.estado==='SEGMENTO_SEM_COBERTURA_BRUTA')
   resumo.semComprovacaoDeCustos++;
  if(resultado.totalPosicoesPlanejadas===undefined)resumo.semFotografiaVigente++;
  resumo.referenciaTotalCalculadaCentavos=somar(
   resumo.referenciaTotalCalculadaCentavos,resultado.reservaReferenciaPosicoesCentavos||0);
  resumo.exposicaoCondicionalCentavos=somar(
   resumo.exposicaoCondicionalCentavos,
   resultado.exposicaoCondicionalSeTodasPosicoesConcluiremCentavos||0);
  // Somente metadados do pedido. Jamais expor CPF, nick ou ID do titular.
  pedidos.push({prepedidoId:row.prepedidoId,estado:resultado.estado,
   posicoesPlanejadas:resultado.totalPosicoesPlanejadas??null,
   posicoesNoMotorEnsaio:lotes,aceitesHistoricosIndividuais:aceites,
   posicoesSemAceiteIndividual:lotes-aceites,
   exposicaoCondicionalDeLotesCentavos:vezes(lotes,EXPOSICAO_TEORICA_CICLO),
   pspSandboxConferido:confirmado,
   saldoBrutoAposReservaCentavos:resultado.diferencaBrutaAposReferenciaCentavos??null,
   referenciaCentavos:resultado.reservaReferenciaPosicoesCentavos??null,
   deficitQualificadoresCentavos:resultado.deficitSegmentosCentavos??null,
   segmentosInsuficientes:resultado.segmentosInsuficientes??[],
   alertas:[...new Set(flags)],aptoParaLiberarReal:false});
 }
 return {modo:'AUDITORIA_COBERTURA_AKITEMM_SOMENTE_ENSAIO',
  amostraParcial:rows.length<total,temCustosFornecedorComprovados:false,
  posicoesReaisCriadas:0,saquesReaisAutorizados:false,
  estoqueOuFreteContratualConfirmado:false,bancoConciliado:false,
  marcoZeroFinanceiroAprovado:false,
  custosBonificacaoComprovados:false,reservasBancariasDisponiveisComprovadas:false,
  pagamentosDoPSPSaoSomenteSandbox:true,somenteLeitura:true,
  alertasGlobais:[
   ...(lotesSemPedido?['LOTES_COM_TITULAR_OU_PEDIDO_INEXISTENTE']:[]),
   ...(aceitesSemVinculoConsistente?['ACEITES_SEM_LOTE_CONSISTENTE']:[]),
   ...(livros.destinosDesconhecidos?['DESTINO_DE_COFRE_DESCONHECIDO']:[])
  ],
  livrosFinanceirosLab:{
   fontesAusentes:livros.fontesAusentes,
   fontesDocumentaisCompletas:livros.fontesAusentes.length===0,
   provisoesDeCiclosNaoLiquidadasCentavos:livros.ciclos?.previstoCentavos??null,
   provisoesDeParcelasNaoLiquidadasCentavos:livros.parcelas?.previstoCentavos??null,
   bonusSolicitadoNoEnsaioCentavos:livros.bonus?.solicitadoBrutoCentavos??null,
   saquesCentroSolicitadosNoEnsaioCentavos:livros.centro?.solicitadoCentavos??null,
   gestaoCofresPendenteNoEnsaioCentavos:livros.gestao?.solicitadoCentavos??null,
   destinosProjetadosPorCofre:livros.destinosPrevistosPorCofre,
   destinosDesconhecidos:livros.destinosDesconhecidos,
   dadosDaLojaNaoEquivalemAoLivroFinanceiro:true,
   provisoesNaoSaoCaixaReal:true,saquesReais:0,
   extratosBancariosConciliados:false
  },
  resumo,pedidos};
}
module.exports={auditarCoberturaDePedido,auditarCarteiraDePedidosAkitemmLab,
 REF,EXPOSICAO_TEORICA_CICLO};
