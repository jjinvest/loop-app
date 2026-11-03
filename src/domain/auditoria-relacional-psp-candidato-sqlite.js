'use strict';
// Auditoria SOMENTE LEITURA. Nunca transforma webhook em recebimento,
// entrega ou posição comercial. Não chama Asaas nem altera dados.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const T={
 pedidos:'akitemm_checkout_prepedidos_staging',
 cobrancas:'akitemm_prepedido_asaas_sandbox_staging',
 inbox:'akitemm_prepedido_webhook_inbox_staging',
 reconsultas:'akitemm_prepedido_webhook_reconsulta_staging',
 posicoes:'akitemm_prepedido_posicoes_pendentes_sandbox_staging',
 entregas:'akitemm_prepedido_entregas_sandbox_staging',
 contas:'akitemm_conta_unica_candidata'
};
const prod=/^[a-z0-9-]{3,80}$/;
function auditarRelacoesPspCandidato({banco}={}){
 if(process.env.NODE_ENV==='production')
  falha('AUDITORIA_CANDIDATO_NAO_HOMOLOGADA');
 if(typeof banco?.prepare!=='function')
  throw new TypeError('SQLite obrigatorio');
 const existe=n=>Boolean(banco.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
 ).get(n));
 const has=Object.fromEntries(Object.entries(T).map(([k,v])=>[k,existe(v)]));
 if(!has.pedidos||!has.cobrancas||!has.contas)
  falha('FONTE_CANDIDATO_NAO_PREPARADA');
 const count=sql=>banco.prepare(sql).get().n;
 const cobrancasInconsistentes=count([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging a',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=a.prepedido_id',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=a.titular_id',
  'WHERE p.prepedido_id IS NULL OR c.id IS NULL',
  'OR p.titular_id<>a.titular_id OR p.total_centavos<>a.valor_centavos',
  "OR a.external_ref<>'LOOPLAB-' || a.prepedido_id"
 ].join(' '));
 const numPosicoes=has.posicoes?count(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging'
 ):0;
 const numEntregas=has.entregas?count(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_entregas_sandbox_staging'
 ):0;
 let posicoesDivergentes=0;
 let posicoesEmRevisao=0;
 if(has.posicoes){
  // Se faltam as tabelas que provam o evento, qualquer posição é ilegítima.
  if(!has.inbox||!has.reconsultas){
   posicoesDivergentes=numPosicoes;
  }else{
   const rows=banco.prepare([
    'SELECT s.prepedido_id,s.titular_id,s.pagamento_id,s.valor_centavos,',
    'p.prepedido_id AS pedido_id,p.total_centavos,p.titular_id AS dono,',
    'a.pagamento_id AS pagamento_atual,a.estado AS estado_cobranca,',
    'i.tipo AS tipo_evento,i.prepedido_id AS pedido_evento,',
    'i.pagamento_id AS pagamento_evento,',
    'r.estado AS estado_reconsulta,r.codigo AS codigo_reconsulta',
    'FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging s',
    'LEFT JOIN akitemm_checkout_prepedidos_staging p',
    'ON p.prepedido_id=s.prepedido_id',
    'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging a',
    'ON a.prepedido_id=s.prepedido_id',
    'LEFT JOIN akitemm_prepedido_webhook_inbox_staging i',
    'ON i.evento_id=s.evento_id',
    'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
    'ON r.evento_id=s.evento_id'
   ].join(' ')).all();
   for(const v of rows){
    if(!v.pedido_id||v.titular_id!==v.dono||
       v.valor_centavos!==25000||v.total_centavos!==25000||
       v.pagamento_id!==v.pagamento_atual||
       v.tipo_evento!=='PAYMENT_RECEIVED'||
       v.pedido_evento!==v.prepedido_id||
       v.pagamento_evento!==v.pagamento_id||
       v.estado_reconsulta!=='CONCLUIDO'||
       v.codigo_reconsulta!=='PSP_RECONSULTADO')
     posicoesDivergentes++;
    else if(v.estado_cobranca!=='RECEBIMENTO_INFORMADO_SANDBOX')
     posicoesEmRevisao++; // Histórico legítimo após estorno.
   }
  }
 }
 let entregasDivergentes=0;
 let entregasEmRevisao=0;
 if(has.entregas){
  const rows=banco.prepare([
   'SELECT e.prepedido_id,e.produto_id,e.titular_id,',
   'e.pagamento_id,e.tipo,e.quantidade,e.valor_centavos,',
   'p.prepedido_id AS pedido_id,p.titular_id AS dono,',
   'p.total_centavos,p.fotografia_json,',
   'a.pagamento_id AS pagamento_atual,a.estado AS estado_cobranca',
   'FROM akitemm_prepedido_entregas_sandbox_staging e',
   'LEFT JOIN akitemm_checkout_prepedidos_staging p',
   'ON p.prepedido_id=e.prepedido_id',
   'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging a',
   'ON a.prepedido_id=e.prepedido_id'
  ].join(' ')).all();
  const byOrder=new Map();
  for(const e of rows){
   let item=null;
   try{
    const snapshot=JSON.parse(e.fotografia_json);
    if(Array.isArray(snapshot)&&snapshot.length<=20)
     item=snapshot.find(i=>i.produtoId===e.produto_id);
   }catch{}
   if(!e.pedido_id||e.titular_id!==e.dono||
      e.pagamento_id!==e.pagamento_atual||
      !prod.test(e.produto_id)||!item||
      item.tipo!==e.tipo||item.quantidade!==e.quantidade||
      item.subtotalCentavos!==e.valor_centavos)
    entregasDivergentes++;
   else if(e.estado_cobranca!=='RECEBIMENTO_INFORMADO_SANDBOX')
    entregasEmRevisao++;
   let order=byOrder.get(e.prepedido_id);
   if(!order){order={soma:0,quantidadeLinhas:0,valorPedido:e.total_centavos,
      esperados:null};
    try{
     const snapshot=JSON.parse(e.fotografia_json);
     if(Array.isArray(snapshot)&&snapshot.length<=20)
      order.esperados=snapshot.length;
    }catch{}
    byOrder.set(e.prepedido_id,order);
   }
   order.soma+=e.valor_centavos;
   order.quantidadeLinhas++;
  }
  for(const o of byOrder.values()){
   if(o.soma!==o.valorPedido||o.quantidadeLinhas!==o.esperados)
    entregasDivergentes++;
  }
 }
 const total=cobrancasInconsistentes+posicoesDivergentes+entregasDivergentes;
 return {
  estado:total?'DIVERGENCIA_ESTRUTURAL_BLOQUEAR':'ESTRUTURA_COERENTE_STAGING',
  cobrancasInconsistentes,posicoesDivergentes,entregasDivergentes,
  posicoesEmRevisao,entregasEmRevisao,
  posicoesHistoricasSimuladas:numPosicoes,entregasHistoricasSimuladas:numEntregas,
  totalInconsistencias:total,
  prontoParaLaboratorio:total===0,
  prontoParaOperacaoComercial:false,
  pagamentosReais:0,saquesReais:0,creditosReais:0,
  pspConsultadoNestaLeitura:false
 };
}
module.exports={auditarRelacoesPspCandidato};
