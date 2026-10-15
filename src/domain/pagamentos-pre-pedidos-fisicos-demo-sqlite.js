'use strict';

// Confirmacoes e estornos somente FICTICIOS, vinculados a pre-pedidos
// fisicos com valores variaveis. Sem PSP externo, bancos, cofre, split,
// separacao pelo distribuidor ou qualquer alteracao do motor de filas.
const ID_PEDIDO=/^[a-z0-9][a-z0-9-]{2,70}$/;
const ID_EVENTO=/^[a-z0-9][a-z0-9-]{2,62}$/;
const TIPOS=Object.freeze({
 CONFIRMAR:'CONFIRMAR_FICTICIO',
 ESTORNAR:'ESTORNAR_FICTICIO'
});
function falha(codigo,mensagem){const e=new Error(mensagem);e.codigo=codigo;return e;}
function validar(id,re,campo){
 if(typeof id!=='string'||!re.test(id))throw falha('INVALIDO',campo+' invalido');
}
class PagamentosPrePedidosFisicosDemoSQLite{
 constructor({planejamento}={}){
  const db=planejamento?.banco;
  if(!db||typeof planejamento.buscarPrePedido!=='function'||
     typeof db.prepare!=='function'){
   throw new TypeError('Planejamento fisico SQLite compartilhado obrigatorio');
  }
  this.banco=db;this.planejamento=planejamento;
  db.exec(`
   CREATE TABLE IF NOT EXISTS admin_pre_pedidos_pagamentos_eventos_demo (
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id TEXT NOT NULL UNIQUE,
    pedido_id TEXT NOT NULL REFERENCES admin_pre_pedidos_fisicos_demo(pedido_id) ON DELETE RESTRICT,
    pagamento_intento_teste_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO')),
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
    registrado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_pre_pedidos_pag_eventos_pedido
     ON admin_pre_pedidos_pagamentos_eventos_demo(pedido_id,sequencia);
   CREATE TRIGGER IF NOT EXISTS admin_pre_pedidos_pag_eventos_no_update
    BEFORE UPDATE ON admin_pre_pedidos_pagamentos_eventos_demo
    BEGIN SELECT RAISE(ABORT,'evento financeiro ficticio de pre-pedido imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pre_pedidos_pag_eventos_no_delete
    BEFORE DELETE ON admin_pre_pedidos_pagamentos_eventos_demo
    BEGIN SELECT RAISE(ABORT,'evento financeiro ficticio de pre-pedido imutavel'); END;
  `);
 }
 historico(pedidoId){
  validar(pedidoId,ID_PEDIDO,'pedidoId');
  return this.banco.prepare(`
   SELECT sequencia,evento_id AS eventoId,pedido_id AS pedidoId,
    pagamento_intento_teste_id AS pagamentoIntentoTesteId,
    tipo,valor_centavos AS valorCentavos,registrado_em AS registradoEm
   FROM admin_pre_pedidos_pagamentos_eventos_demo
   WHERE pedido_id=? ORDER BY sequencia
  `).all(pedidoId);
 }
 buscar(pedidoId){
  validar(pedidoId,ID_PEDIDO,'pedidoId');
  const pedido=this.planejamento.buscarPrePedido(pedidoId);
  if(!pedido)return null;
  const eventos=this.historico(pedidoId);
  for(const evt of eventos){
   if(evt.valorCentavos!==pedido.precoCatalogoCentavos||
      evt.pagamentoIntentoTesteId!==pedido.pagamentoIntentoTesteId){
    throw new Error('Integridade entre pre-pedido e pagamento de teste divergente');
   }
  }
  const ultimo=eventos.at(-1);
  const situacao=!ultimo?'AGUARDANDO_FICTICIO':
   ultimo.tipo===TIPOS.CONFIRMAR?'CONFIRMADO_FICTICIO':'ESTORNADO_FICTICIO';
  return {
   ...pedido,
   situacaoPagamentoFicticio:situacao,
   quantidadeEventosPagamentoFicticio:eventos.length,
   valorVinculadoPagamentoFicticioCentavos:pedido.precoCatalogoCentavos,
   conferenciaPreco:'CORRESPONDE_AO_PRE_PEDIDO',
   integridade:'VINCULO_FICTICIO_CONFERIDO',
   situacaoLogistica:'NAO_INICIADA',
   fornecedorBloqueado:true,
   requerPSPRealParaLiberarFornecedor:true,
   pagamentoPSPReal:false,
   recebimentoBancarioReal:false,
   reservaLoopReal:false,
   contabilizacaoReal:false,
   entregaReal:false,
   movimentacaoFila:false,
   autorizacaoLogistica:false,
   consultaSomenteLaboratorio:true
  };
 }
 listar(){
  return {
   modo:'PAGAMENTOS_DE_PRE_PEDIDOS_FISICOS_SOMENTE_FICTICIOS',
   confirmacaoRealDePSP:false,
   estoqueOuFornecedorRealAcionado:false,
   lancamentosReais:false,
   alocacaoLOOP:false,
   catracaMovimentada:false,
   pedidos:this.planejamento.listarPrePedidos().pedidos
    .map(p=>this.buscar(p.pedidoId))
  };
 }
 registrarEvento({pedidoId,pagamentoIntentoTesteId,eventoId,tipo}={}){
  validar(pedidoId,ID_PEDIDO,'pedidoId');
  validar(pagamentoIntentoTesteId,/^intent-fisico-[a-z0-9][a-z0-9-]{2,70}$/,'pagamentoIntentoTesteId');
  validar(eventoId,ID_EVENTO,'eventoId');
  if(!Object.values(TIPOS).includes(tipo))throw falha('INVALIDO','Tipo ficticio nao permitido');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const pedido=this.planejamento.buscarPrePedido(pedidoId);
   if(!pedido)throw falha('NAO_ENCONTRADO','Pre-pedido fisico nao encontrado');
   if(pedido.pagamentoIntentoTesteId!==pagamentoIntentoTesteId){
    throw falha('CONFLITO','ID de pagamento nao corresponde ao pre-pedido');
   }
   const usado=this.banco.prepare(`
     SELECT pedido_id AS pedidoId,pagamento_intento_teste_id AS pagamentoIntentoTesteId,
      tipo FROM admin_pre_pedidos_pagamentos_eventos_demo WHERE evento_id=?
   `).get(eventoId);
   if(usado){
    if(usado.pedidoId!==pedidoId||
       usado.pagamentoIntentoTesteId!==pagamentoIntentoTesteId||
       usado.tipo!==tipo)throw falha('CONFLITO','Evento ficticio ja usado com outros dados');
    this.banco.exec('COMMIT');
    return {repetido:true,conferencia:this.buscar(pedidoId)};
   }
   const eventos=this.historico(pedidoId);
   if((tipo===TIPOS.CONFIRMAR&&eventos.length!==0)||
      (tipo===TIPOS.ESTORNAR&&
       (eventos.length!==1||eventos[0].tipo!==TIPOS.CONFIRMAR))){
    throw falha('CONFLITO','Sequencia de confirmacao ou estorno ficticio invalida');
   }
   this.banco.prepare(`
    INSERT INTO admin_pre_pedidos_pagamentos_eventos_demo
     (evento_id,pedido_id,pagamento_intento_teste_id,tipo,valor_centavos,registrado_em)
    VALUES (?,?,?,?,?,?)
   `).run(eventoId,pedidoId,pagamentoIntentoTesteId,tipo,
    pedido.precoCatalogoCentavos,new Date().toISOString());
   this.banco.exec('COMMIT');
   return {repetido:false,conferencia:this.buscar(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={PagamentosPrePedidosFisicosDemoSQLite,TIPOS};
