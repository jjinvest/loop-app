'use strict';
// Leitura do funil REAL: pedido -> evento comercial -> outbox -> capacidade -> fila.
// Nenhum pedido, saldo, posição, giro ou comprovação PSP é criado aqui.
// O status APROVADO_PARA_EXPEDICAO não prova liquidação bancária.
const TABELAS=Object.freeze([
 'loja_real_pedidos','loop_real_eventos_comerciais',
 'loop_real_outbox_compra_confirmada','loop_real_checkout_reservas_posicoes',
 'loop_real_motor_compras'
]);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function analisarQualificacaoPedidosReal({
 banco,motorLoop,classificacaoLoop=null,limite=200
}={}){
 if(typeof banco?.prepare!=='function'||motorLoop?.banco!==banco||
    !Number.isSafeInteger(limite)||limite<1||limite>500)
  falha('QUALIFICACAO_REAL_FONTE_INVALIDA');
 if(classificacaoLoop!==null&&(
    classificacaoLoop.db!==banco||
    typeof classificacaoLoop.avaliarPedido!=='function'))
  falha('QUALIFICACAO_REAL_CLASSIFICACAO_DIVERGENTE');
 const existentes=new Set(banco.prepare([
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN (",
  TABELAS.map(()=>'?').join(','),')'
 ].join(' ')).all(...TABELAS).map(r=>r.name));
 const ausentes=TABELAS.filter(n=>!existentes.has(n));
 const base={fonte:'PEDIDOS_MOTOR_NO_SQLITE_REAL',
  somenteLeitura:true,semDadosPessoais:true,
  comprovanteBancarioDisponivel:false,
  posicoesAtivadasPorEstaConsulta:0,pagamentosExecutados:0,
  catracaAlterada:false,financeiroReal:false,
  liberacaoAutomatica:false,
  // Nunca sugerir que o resultado desta consulta é uma prova do PSP.
  exigenciasExternas:['CONFIRMACAO_PSP_AUTENTICADA',
   'LIQUIDACAO_BANCARIA_CONCILIADA',
   'RESERVA_CAIXA_SEGREGADA_SE_APLICAVEL',
   'CONTROLE_DE_ESTORNOS_E_IDEMPOTENCIA']};
 if(ausentes.length||classificacaoLoop===null)
  return {...base,estado:'DEPENDENCIAS_INCOMPLETAS',
   tabelasIndisponiveis:ausentes,
   classificacaoDisponivel:classificacaoLoop!==null,
   totalAprovados:null,amostra:0,amostraCompleta:false,
   grupos:null};
 const total=banco.prepare([
  "SELECT COUNT(*) AS n FROM loja_real_pedidos",
  "WHERE status='APROVADO_PARA_EXPEDICAO'"
 ].join(' ')).get().n;
 if(!Number.isSafeInteger(total)||total<0)
  falha('QUALIFICACAO_REAL_TOTAL_INVALIDO');
 const linhas=banco.prepare([
  'SELECT p.pedido_id,p.titular_id,p.pagamento_id,p.valor_total_centavos,',
  'e.estado AS evento_estado,e.titular_id AS evento_titular,',
  'e.pagamento_id AS evento_pagamento,',
  'o.estado AS outbox_estado,o.titular_id AS outbox_titular,',
  'o.pagamento_id AS outbox_pagamento,',
  'r.estado AS reserva_estado,r.quantidade AS reserva_quantidade,',
  'r.titular_id AS reserva_titular,',
  'EXISTS(SELECT 1 FROM loop_real_motor_compras m',
  'WHERE m.pedido_id=p.pedido_id) AS ja_no_motor',
  'FROM loja_real_pedidos p',
  'LEFT JOIN loop_real_eventos_comerciais e ON e.pedido_id=p.pedido_id',
  'LEFT JOIN loop_real_outbox_compra_confirmada o ON o.pedido_id=p.pedido_id',
  'LEFT JOIN loop_real_checkout_reservas_posicoes r ON r.pedido_id=p.pedido_id',
  "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
  'ORDER BY p.criado_em,p.pedido_id LIMIT ?'
 ].join(' ')).all(limite);
 const grupos={
  semEventoOuOutbox:0,referenciasDivergentes:0,
  jaNoMotorExigeRevisao:0,semRegraAprovada:0,
  naoQualifica:0,especialAguardandoRegra:0,
  reservaIncompleta:0,aguardandoProvaBancaria:0,
  cancelamentoOuRevisao:0
 };
 let posicoesPotenciaisNaAmostra=0;
 for(const p of linhas){
  if(!p.evento_estado||!p.outbox_estado){
   grupos.semEventoOuOutbox++;continue;
  }
  if(p.evento_estado!=='AGUARDANDO_CONCILIACAO'||
     ['CANCELADO','REVISAO'].includes(p.outbox_estado)){
   grupos.cancelamentoOuRevisao++;continue;
  }
  if(!p.pagamento_id||p.evento_pagamento!==p.pagamento_id||
     p.outbox_pagamento!==p.pagamento_id||
     p.evento_titular!==p.titular_id||
     p.outbox_titular!==p.titular_id){
   grupos.referenciasDivergentes++;continue;
  }
  if(p.ja_no_motor){grupos.jaNoMotorExigeRevisao++;continue;}
  let regra;
  try{regra=classificacaoLoop.avaliarPedido({pedidoId:p.pedido_id});}
  catch{grupos.semRegraAprovada++;continue;}
  if(regra?.pedidoId!==p.pedido_id||
     !Number.isSafeInteger(regra.totalPosicoesMistasPrevistas)||
     regra.totalPosicoesMistasPrevistas<0||
     regra.totalPosicoesMistasPrevistas>10||
     !Number.isSafeInteger(regra.itensSemRegraExplicita)){
   grupos.semRegraAprovada++;continue;
  }
  if(regra.itensSemRegraExplicita>0){
   grupos.semRegraAprovada++;continue;
  }
  if(regra.totalPosicoesMistasPrevistas===0){
   grupos.naoQualifica++;continue;
  }
  if(regra.eventosEspeciaisNaoHomologados===true){
   grupos.especialAguardandoRegra++;continue;
  }
  if(p.reserva_estado!=='RESERVADA'||
     p.reserva_quantidade!==regra.totalPosicoesMistasPrevistas||
     p.reserva_titular!==p.titular_id){
   grupos.reservaIncompleta++;continue;
  }
  posicoesPotenciaisNaAmostra+=regra.totalPosicoesMistasPrevistas;
  // Prova real de liquidação não existe nesta composição. Sempre bloquear.
  grupos.aguardandoProvaBancaria++;
 }
 return {...base,estado:'CONFERENCIA_INTERNA_SEM_LIBERACAO_FINANCEIRA',
  classificacaoDisponivel:true,tabelasIndisponiveis:[],
  totalAprovados:total,amostra:linhas.length,
  amostraCompleta:linhas.length===total,
  posicoesPotenciaisNaAmostra,grupos};
}
module.exports={analisarQualificacaoPedidosReal,TABELAS};
