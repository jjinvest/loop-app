'use strict';
// Conferência sem reconsultar PSP, despachar pedidos, expor PII ou gerar dinheiro.
// O mesmo snapshot do SQLite contém identidade, catálogo, pedidos, custos
// congelados e outbox. Provas bancárias/tributárias exigem fontes EXTERNAS.
function falha(codigo){const erro=new Error(codigo);erro.codigo=codigo;throw erro;}
const TABELAS_COMERCIAIS=Object.freeze([
 'loja_real_cotacoes','loja_real_pedidos','loja_real_custos_pedido',
 'loja_real_outbox_fornecedor'
]);
function validarRecuperacaoComercial(banco,lista){
 const contem=t=>lista.includes(t);
 const cotacoes=contem('loja_real_cotacoes');
 const pedidos=contem('loja_real_pedidos');
 const custos=contem('loja_real_custos_pedido');
 const outbox=contem('loja_real_outbox_fornecedor');
 // A existência parcial não é prova de recuperação completa.
 if(pedidos!==custos||(outbox&&!pedidos))
  falha('BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS');
 const exigir=(t,campos)=>{
  const existentes=new Set(banco.prepare('PRAGMA table_info('+t+')')
   .all().map(x=>x.name));
  if(campos.some(c=>!existentes.has(c)))
   falha('BACKUP_COMERCIAL_ESQUEMA_INCOMPLETO');
 };
 if(cotacoes)exigir('loja_real_cotacoes',[
  'cotacao_id','titular_id','payload_iv','payload_ct','payload_tag',
  'criado_em','expira_em'
 ]);
 const totalCotacoes=cotacoes?banco.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_cotacoes'
 ).get().n:0;
 if(!pedidos)return {
  recuperacaoComercialIncluida:false,pedidos:0,linhasCustos:0,
  remessas:0,cotacoes:totalCotacoes
 };
 exigir('loja_real_pedidos',[
  'pedido_id','titular_id','cotacao_id','idempotencia_hmac',
  'payload_iv','payload_ct','payload_tag','pagamento_id','status',
  'frete_centavos','valor_total_centavos','criado_em','atualizado_em'
 ]);
 exigir('loja_real_custos_pedido',[
  'pedido_id','fornecedor_id','sku','custo_unit_centavos',
  'preco_unit_centavos','quantidade','capturado_em'
 ]);
 if(outbox)exigir('loja_real_outbox_fornecedor',[
  'pedido_id','fornecedor_id','pagamento_id','valor_pago_centavos',
  'chave_idempotencia','payload_hash','payload_iv','payload_ct',
  'payload_tag','estado','pedido_parceiro_id','criado_em','atualizado_em'
 ]);
 const cotacaoDoTitular=cotacoes?banco.prepare([
  'SELECT titular_id FROM loja_real_cotacoes WHERE cotacao_id=?'
 ].join(' ')):null;
 let totalPedidos=0,totalLinhas=0,totalRemessas=0;
 // Percurso completo por cursor: não ocultar registros além de 50/1000/100 mil.
 for(const p of banco.prepare([
  'SELECT p.pedido_id,p.titular_id,p.cotacao_id,p.status,p.pagamento_id,',
  'p.frete_centavos,p.valor_total_centavos,',
  'COUNT(c.sku) AS linhas,',
  'COALESCE(SUM(c.preco_unit_centavos*c.quantidade),0) AS itens_centavos',
  'FROM loja_real_pedidos p LEFT JOIN loja_real_custos_pedido c',
  'ON c.pedido_id=p.pedido_id GROUP BY p.pedido_id'
 ].join(' ')).iterate()){
  totalPedidos++;totalLinhas+=p.linhas;
  if(!Number.isSafeInteger(p.valor_total_centavos)||
     !Number.isSafeInteger(p.frete_centavos)||
     !Number.isSafeInteger(p.itens_centavos)||
     p.valor_total_centavos<=0||p.frete_centavos<0||
     p.linhas<1||p.itens_centavos<=0||
     p.itens_centavos+p.frete_centavos!==p.valor_total_centavos)
   falha('BACKUP_COMERCIAL_PEDIDO_CUSTO_DIVERGENTE');
  if((p.status==='APROVADO_PARA_EXPEDICAO'&&!p.pagamento_id)||
     (p.status==='AGUARDANDO_PAGAMENTO'&&p.pagamento_id))
   falha('BACKUP_COMERCIAL_PAGAMENTO_INCONSISTENTE');
  // Uma cotação existente não pode ser usada por outro titular.
  if(cotacaoDoTitular){
   const origem=cotacaoDoTitular.get(p.cotacao_id);
   if(!origem||origem.titular_id!==p.titular_id)
    falha('BACKUP_COMERCIAL_COTACAO_TITULAR_DIVERGENTE');
  }
 }
 if(outbox){
  const doPedido=banco.prepare([
   'SELECT pagamento_id,valor_total_centavos FROM loja_real_pedidos',
   'WHERE pedido_id=?'
  ].join(' '));
  const doFornecedor=banco.prepare([
   'SELECT 1 AS existe FROM loja_real_custos_pedido',
   'WHERE pedido_id=? AND fornecedor_id=? LIMIT 1'
  ].join(' '));
  for(const r of banco.prepare([
   'SELECT pedido_id,fornecedor_id,pagamento_id,valor_pago_centavos,',
   'estado,pedido_parceiro_id FROM loja_real_outbox_fornecedor'
  ].join(' ')).iterate()){
   totalRemessas++;
   const p=doPedido.get(r.pedido_id);
   if(!p||!p.pagamento_id||p.pagamento_id!==r.pagamento_id||
      p.valor_total_centavos!==r.valor_pago_centavos||
      !doFornecedor.get(r.pedido_id,r.fornecedor_id)||
      (r.estado==='ENVIADO'&&!r.pedido_parceiro_id))
    falha('BACKUP_COMERCIAL_OUTBOX_DIVERGENTE');
   // INDETERMINADO é preservado, nunca reenviado durante a restauração.
  }
 }
 return {
  recuperacaoComercialIncluida:true,pedidos:totalPedidos,
  linhasCustos:totalLinhas,remessas:totalRemessas,cotacoes:totalCotacoes
 };
}
module.exports={TABELAS_COMERCIAIS,validarRecuperacaoComercial};
