'use strict';
// Segundo caixa = LOOP_DIREITA; centro reservado a participantes.
// Apenas simulação de disponibilidades, nunca liquidação bancária.
const COFRES=['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'];
const existe=(b,n)=>!!b.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
function soma(b,sql,...args){
 const n=b.prepare(sql).get(...args).total;
 if(!Number.isSafeInteger(n)||n<0)throw new Error('COMPROMISSO_CAIXA_INVALIDO');
 return n;
}
function disponibilidadeCofreDemo(b,{cofreId,saldoBrutoCentavos}={}){
 if(!b?.prepare||!COFRES.includes(cofreId)||!Number.isSafeInteger(saldoBrutoCentavos)||saldoBrutoCentavos<0)
  throw new Error('CAIXA_INVALIDO');
 const direita=cofreId==='LOOP_DIREITA';
 const douradas=direita&&existe(b,'admin_ponte_douradas_financiadas_demo')?
  soma(b,'SELECT COALESCE(SUM(valor_referencia_centavos),0) AS total FROM admin_ponte_douradas_financiadas_demo'):0;
 const comissoesAntigas=direita&&existe(b,'admin_comissoes_reserva_demo')?
  soma(b,'SELECT COALESCE(SUM(valor_centavos),0) AS total FROM admin_comissoes_reserva_demo'):0;
 const comissoesNovas=direita&&existe(b,'admin_comissoes_reserva_v2_demo')?
  soma(b,'SELECT COALESCE(SUM(valor_centavos),0) AS total FROM admin_comissoes_reserva_v2_demo'):0;
 const gestao=existe(b,'loop_v6_gestao_cofres_solicitacoes_demo')?
  soma(b,"SELECT COALESCE(SUM(valor_centavos),0) AS total FROM loop_v6_gestao_cofres_solicitacoes_demo WHERE cofre_origem=? AND status='PENDENTE_CONCILIACAO_REAL'",cofreId):0;
 const total=douradas+comissoesAntigas+comissoesNovas+gestao;
 if(!Number.isSafeInteger(total))throw new Error('COMPROMISSO_CAIXA_INVALIDO');
 const livre=saldoBrutoCentavos-total;
 if(!Number.isSafeInteger(livre))throw new Error('CAIXA_INVALIDO');
 return {cofreId,segundoCaixa:direita,centralReservadoParaParticipantes:cofreId==='LOOP_CENTRO',
  saldoBrutoCentavos,compromissoDouradasCentavos:douradas,
  compromissoBonificacoesCentavos:comissoesAntigas+comissoesNovas,
  compromissoGestaoPendenteCentavos:gestao,totalComprometidoCentavos:total,
  saldoLivreDemonstrativoCentavos:livre,
  pagamentoRealExecutado:false};
}
module.exports={disponibilidadeCofreDemo};