'use strict';
// Fonte UNICA de leitura do pagamento homologado para o operador e Meus Pedidos.
// Nao faz rede, nao confirma pagamento, nao registra posicao ou direito real.
const {DatabaseSync}=require('node:sqlite');
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function tabela(banco,nome){
 return !!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
}
const T={
 pedidos:'akitemm_checkout_prepedidos_staging',
 cobrancas:'akitemm_prepedido_asaas_sandbox_staging',
 eventos:'akitemm_prepedido_webhook_inbox_staging',
 consultas:'akitemm_prepedido_asaas_consultas_staging',
 reconsultas:'akitemm_prepedido_webhook_reconsulta_staging',
 posicoes:'akitemm_prepedido_posicoes_pendentes_sandbox_staging'
};
function abrirLeitura(banco){
 if(process.env.NODE_ENV==='production')falha('ESCRITORIO_STAGING_PROIBIDO_EM_PRODUCAO');
 if(typeof banco?.prepare!=='function')throw new TypeError('SQLite obrigatorio');
 if(!tabela(banco,T.pedidos)||!tabela(banco,T.cobrancas))
  falha('FONTE_STAGING_OBRIGATORIA');
}
function consultarPedido({banco,prepedidoId,titularId=null}={}){
 abrirLeitura(banco);
 if(typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
  falha('PREPEDIDO_INVALIDO');
 if(titularId!==null&&(typeof titularId!=='string'||titularId.length>80||
    !/^[a-zA-Z0-9_-]{6,80}$/.test(titularId)))falha('TITULAR_INVALIDO');
 const query=[
  'SELECT p.prepedido_id AS prepedidoId,p.titular_id AS titularId,',
  'p.total_centavos AS valorCentavos,p.criado_em AS criadoEm,',
  'a.estado AS estadoSandbox,a.pagamento_id AS pagamentoId',
  'FROM akitemm_checkout_prepedidos_staging p',
  'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging a',
  'ON a.prepedido_id=p.prepedido_id AND a.titular_id=p.titular_id',
  'WHERE p.prepedido_id=?',
  ...(titularId!==null?['AND p.titular_id=?']:[])
 ].join(' ');
 const pedido=banco.prepare(query).get(...(titularId!==null?
  [prepedidoId,titularId]:[prepedidoId]));
 if(!pedido)return null;
 const h={eventosCriados:0,eventosRecebidos:0,eventosRecebidosReconsultados:0,
  eventosExigemRevisao:0};
 if(tabela(banco,T.eventos)){
  const temReconsulta=tabela(banco,T.reconsultas);
  const sql=[
   'SELECT a.tipo AS tipo,',
   ...(temReconsulta?
    ["r.estado AS estadoReconsulta,r.codigo AS codigoReconsulta"]:
    ["NULL AS estadoReconsulta,NULL AS codigoReconsulta"]),
   'FROM akitemm_prepedido_webhook_inbox_staging a',
   ...(temReconsulta?[
    'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
    'ON r.evento_id=a.evento_id'
   ]:[]),
   'WHERE a.prepedido_id=?',
   ...(pedido.pagamentoId?['AND a.pagamento_id=?']:[])
  ].join(' ');
  const args=pedido.pagamentoId?
   [prepedidoId,pedido.pagamentoId]:[prepedidoId];
  for(const row of banco.prepare(sql).all(...args)){
   if(row.tipo==='PAYMENT_CREATED')h.eventosCriados++;
   if(row.tipo==='PAYMENT_RECEIVED'){
    h.eventosRecebidos++;
    if(row.estadoReconsulta==='CONCLUIDO'&&
       row.codigoReconsulta==='PSP_RECONSULTADO')
     h.eventosRecebidosReconsultados++;
   }
   if(row.estadoReconsulta==='EXIGE_REVISAO')h.eventosExigemRevisao++;
  }
 }
 const ultima=tabela(banco,T.consultas)&&pedido.pagamentoId?
  banco.prepare([
   'SELECT status_asaas AS statusAsaas,consultado_em AS consultadoEm',
   'FROM akitemm_prepedido_asaas_consultas_staging',
   'WHERE prepedido_id=? AND pagamento_id=?',
   'ORDER BY id DESC LIMIT 1'
  ].join(' ')).get(prepedidoId,pedido.pagamentoId):null;
 const pos=tabela(banco,T.posicoes)?banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging',
  'WHERE prepedido_id=? AND titular_id=?'
 ].join(' ')).get(prepedidoId,pedido.titularId).n:0;
 const temVinculos=tabela(banco,'akitemm_checkout_escritorio_vinculos_staging');
 const contaEscritorioVinculada=temVinculos&&!!banco.prepare([
  'SELECT 1 FROM akitemm_checkout_escritorio_vinculos_staging',
  'WHERE titular_checkout_id=?'
 ].join(' ')).get(pedido.titularId);
 const comprovado=pedido.estadoSandbox==='RECEBIMENTO_INFORMADO_SANDBOX'&&
  ultima?.statusAsaas==='RECEIVED'&&h.eventosRecebidosReconsultados===1&&
  h.eventosExigemRevisao===0;
 const exigeRevisao=pedido.estadoSandbox==='EXIGE_REVISAO'||
  pedido.estadoSandbox==='REVERSAO_INFORMADA_SANDBOX'||
  pedido.estadoSandbox==='CRIACAO_INDETERMINADA'||
  h.eventosExigemRevisao>0||h.eventosRecebidosReconsultados>1||
  pos>1;
 const status=exigeRevisao?'EXIGE_REVISAO_SANDBOX':
  comprovado&&pos===1?'POSICAO_FICTICIA_PENDENTE':
  comprovado?'RECEBIMENTO_PSP_CONCILIADO':
  h.eventosRecebidos>0?'WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA':
  pedido.estadoSandbox||'SEM_COBRANCA_SANDBOX';
 return {
  prepedidoId:pedido.prepedidoId,titularId:pedido.titularId,
  criadoEm:pedido.criadoEm,valorCentavos:pedido.valorCentavos,
  estadoOperacional:status,estadoSandbox:pedido.estadoSandbox||'SEM_COBRANCA_SANDBOX',
  ultimoStatusPSP:ultima?.statusAsaas||null,
  ultimoGETPSPPersistidoEm:ultima?.consultadoEm||null,
  eventos:h,conferenciaPSPConcluida:comprovado,
  // Historico nunca é apagado. A posição fictícia só é "apta agora"
  // enquanto o último GET PSP continuar RECEIVED e sem revisão.
  posicoesPendentesFicticias:pos,
  posicoesFicticiasAptasAgora:comprovado&&!exigeRevisao?pos:0,
  contaEscritorioVinculada,
  exigeRevisaoManual:exigeRevisao,
  posicoesReaisCriadas:0,pagamentoReal:false,
  pedidoComercial:false,bonusLiberados:0,saquesReais:0,
  consultaPSPExecutadaNestaLeitura:false
 };
}
function consultarEscritorioHomologacao({banco,limite=30}={}){
 abrirLeitura(banco);
 if(!Number.isSafeInteger(limite)||limite<1||limite>50)
  falha('LIMITE_INVALIDO');
 const contagem=banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
 ].join(' ')).get().n;
 const ids=banco.prepare([
  'SELECT prepedido_id FROM akitemm_checkout_prepedidos_staging',
  'ORDER BY criado_em DESC,prepedido_id DESC LIMIT ?'
 ].join(' ')).all(limite);
 const pedidos=ids.map(x=>consultarPedido({banco,prepedidoId:x.prepedido_id}));
 // Mesmos criterios atuais de consultarPedido, sobre TODA a base, nao apenas
 // a amostra visual. Um RECEIVED historico nao substitui o ultimo GET PSP.
 const recebimentosPSPConciliados=[T.eventos,T.consultas,T.reconsultas]
  .every(nome=>tabela(banco,nome))?banco.prepare(`
   WITH historico AS (
    SELECT a.prepedido_id,a.pagamento_id,
     SUM(CASE WHEN a.tipo='PAYMENT_RECEIVED' AND r.estado='CONCLUIDO'
      AND r.codigo='PSP_RECONSULTADO' THEN 1 ELSE 0 END) recebidos,
     SUM(CASE WHEN r.estado='EXIGE_REVISAO' THEN 1 ELSE 0 END) revisoes
    FROM akitemm_prepedido_webhook_inbox_staging a
    LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r ON r.evento_id=a.evento_id
    GROUP BY a.prepedido_id,a.pagamento_id
   ) SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging p
   JOIN akitemm_checkout_prepedidos_staging c
    ON c.prepedido_id=p.prepedido_id AND c.titular_id=p.titular_id
   JOIN historico h ON h.prepedido_id=p.prepedido_id AND h.pagamento_id=p.pagamento_id
   WHERE p.estado='RECEBIMENTO_INFORMADO_SANDBOX' AND h.recebidos=1 AND h.revisoes=0
   AND (SELECT status_asaas FROM akitemm_prepedido_asaas_consultas_staging u
    WHERE u.prepedido_id=p.prepedido_id AND u.pagamento_id=p.pagamento_id
    ORDER BY u.id DESC LIMIT 1)='RECEIVED'
   ${tabela(banco,T.posicoes)?`AND (SELECT COUNT(*) FROM
    akitemm_prepedido_posicoes_pendentes_sandbox_staging s
    WHERE s.prepedido_id=p.prepedido_id AND s.titular_id=p.titular_id)<=1`:''}
  `).get().n:0;
 const resumo={
  prepedidosStaging:contagem,
  cobrancasSandbox:tabela(banco,T.cobrancas)?banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging'
  ).get().n:0,
  eventosPersistidos:tabela(banco,T.eventos)?banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
  ).get().n:0,
  recebimentosPSPConciliados,
  posicoesPendentesSimuladas:tabela(banco,T.posicoes)?banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging'
  ).get().n:0,
  contasVinculadasEscritorioDemo:tabela(banco,'akitemm_checkout_escritorio_vinculos_staging')?
   banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_escritorio_vinculos_staging').get().n:0,
  posicoesReais:0,saquesReais:0,bonusReais:0,pagamentosReais:0
 };
 return {modo:'ESCRITORIO_HOMOLOGACAO_SQLITE_SOMENTE_LEITURA',
  fonte:'BANCO_STAGING_MESMO_PREPEDIDO_WEBHOOK_PSP',
  resumo,pedidos,limite,paginacaoNecessaria:contagem>limite,
  semVendaComercial:true,semDinheiroReal:true,
  checkoutPublicoHabilitado:false,consultaPSPExecutadaNestaLeitura:false};
}
module.exports={consultarPedido,consultarEscritorioHomologacao};
