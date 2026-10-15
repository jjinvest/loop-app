'use strict';

// Pedidos de CURSOS PDF e faturas de valores VARIAVEIS, somente laboratorio.
// Sem arquivos reais, dados de clientes, checkout, PSP externo, carteira,
// alocacao de R$100, indicacoes, criacao de posicao ou giro de catraca.
// A confirmacao abaixo apenas simula a elegibilidade futura de um download.
const ID_PEDIDO=/^[a-z0-9][a-z0-9-]{2,54}$/;
const ID_EVENTO=/^[a-z0-9][a-z0-9-]{2,62}$/;
const TIPOS=Object.freeze({CONFIRMAR:'CONFIRMAR_FICTICIO',ESTORNAR:'ESTORNAR_FICTICIO'});
function falha(codigo,mensagem){
 const e=new Error(mensagem);e.codigo=codigo;return e;
}
function idOk(id,padrao,campo){
 if(typeof id!=='string'||!padrao.test(id))throw falha('INVALIDO',campo+' invalido');
}
class PedidosPDFPagamentosDemoSQLite{
 constructor({repositorioCatalogo}={}){
  const banco=repositorioCatalogo?.banco;
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('Catalogo local SQLite obrigatorio');
  this.banco=banco;
  this.catalogo=repositorioCatalogo;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_pdf_demo_pedidos (
    pedido_id TEXT PRIMARY KEY NOT NULL,
    pagamento_id TEXT NOT NULL UNIQUE,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    nome_produto TEXT NOT NULL,
    revisao_produto INTEGER NOT NULL CHECK(revisao_produto>0),
    preco_centavos INTEGER NOT NULL CHECK(preco_centavos>0),
    criado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_pdf_demo_eventos (
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id TEXT NOT NULL UNIQUE,
    pedido_id TEXT NOT NULL REFERENCES admin_pdf_demo_pedidos(pedido_id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK(tipo IN ('CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO')),
    registrado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_admin_pdf_demo_eventos_pedido
    ON admin_pdf_demo_eventos(pedido_id,sequencia);
   CREATE TRIGGER IF NOT EXISTS admin_pdf_demo_pedidos_no_update
    BEFORE UPDATE ON admin_pdf_demo_pedidos
    BEGIN SELECT RAISE(ABORT,'pedido PDF demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pdf_demo_pedidos_no_delete
    BEFORE DELETE ON admin_pdf_demo_pedidos
    BEGIN SELECT RAISE(ABORT,'pedido PDF demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pdf_demo_eventos_no_update
    BEFORE UPDATE ON admin_pdf_demo_eventos
    BEGIN SELECT RAISE(ABORT,'historico PDF demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pdf_demo_eventos_no_delete
    BEFORE DELETE ON admin_pdf_demo_eventos
    BEGIN SELECT RAISE(ABORT,'historico PDF demo imutavel'); END;
  `);
 }
 status(pedidoId){
  const eventos=this.historico(pedidoId);
  const ultimo=eventos.at(-1);
  return {
   situacaoPagamentoFicticio:!ultimo?'AGUARDANDO_FICTICIO':
    ultimo.tipo===TIPOS.CONFIRMAR?'CONFIRMADO_FICTICIO':'ESTORNADO_FICTICIO',
   eventosPagamentoFicticio:eventos.length,
   habilitacaoDownloadFicticia:Boolean(ultimo&&ultimo.tipo===TIPOS.CONFIRMAR)
  };
 }
 historico(pedidoId){
  idOk(pedidoId,ID_PEDIDO,'pedidoId');
  return this.banco.prepare(
   'SELECT sequencia,evento_id AS eventoId, tipo, registrado_em AS registradoEm FROM admin_pdf_demo_eventos WHERE pedido_id=? ORDER BY sequencia'
  ).all(pedidoId);
 }
 saida(row){
  if(!row)return null;
  return {
   pedidoId:row.pedido_id,pagamentoId:row.pagamento_id,
   produtoId:row.produto_id,nomeProduto:row.nome_produto,
   revisaoProduto:row.revisao_produto,precoBrutoCentavos:row.preco_centavos,
   tipoProduto:'PDF',entrega:'DOWNLOAD_APOS_CONFIRMACAO',
   criadoEm:row.criado_em,...this.status(row.pedido_id),
   downloadRealDisponivel:false,arquivoPDFRealDisponivel:false,
   meioPagamentoRealConectado:false,parcelaLOOPCalculada:false,
   posicaoCriada:false,catracaMovimentada:false,snapshotImutavel:true
  };
 }
 buscar(pedidoId){
  idOk(pedidoId,ID_PEDIDO,'pedidoId');
  return this.saida(this.banco.prepare(
   'SELECT * FROM admin_pdf_demo_pedidos WHERE pedido_id=?'
  ).get(pedidoId));
 }
 listar(){
  return {
   modo:'PEDIDOS_PDF_COM_VALORES_VARIAVEIS_APENAS_FICTICIOS',
   semCheckout:true,pagamentosReais:false,arquivosReais:false,
   alocacaoDeCofres:false,nenhumaPosicaoCriada:true,
   pedidos:this.banco.prepare(
    'SELECT * FROM admin_pdf_demo_pedidos ORDER BY criado_em,pedido_id'
   ).all().map(p=>this.saida(p))
  };
 }
 opcoes(){
  return {
   modo:'CURSOS_PDF_PUBLICADOS_APENAS_LABORATORIO',
   produtos:this.catalogo.listar().filter(p=>
    p.tipo==='PDF'&&p.estado==='PUBLICADO'&&
    Number.isSafeInteger(p.precoCentavos)&&p.precoCentavos>0
   ).map(p=>({produtoId:p.id,nome:p.nome,precoCentavos:p.precoCentavos})),
   pagamentoReal:false,entregaReal:false
  };
 }
 criar({pedidoId,produtoId}={}){
  idOk(pedidoId,ID_PEDIDO,'pedidoId');idOk(produtoId,/^[a-z0-9-]{3,80}$/,'produtoId');
  const pagamentoId='pdf-'+pedidoId;
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const existente=this.banco.prepare(
    'SELECT * FROM admin_pdf_demo_pedidos WHERE pedido_id=?'
   ).get(pedidoId);
   if(existente){
    if(existente.produto_id!==produtoId)throw falha('CONFLITO','ID do pedido PDF atribuido a outro produto');
    this.banco.exec('COMMIT');
    return {repetido:true,pedido:this.saida(existente)};
   }
   const registro=this.catalogo.buscarRegistro(produtoId);
   if(!registro)throw falha('NAO_ENCONTRADO','Curso PDF nao encontrado no catalogo');
   const item=registro.produto;
   if(item.tipo!=='PDF'||item.estado!=='PUBLICADO'||
      !Number.isSafeInteger(item.precoCentavos)||item.precoCentavos<1){
    throw falha('INVALIDO','Somente PDF publicado com preco valido');
   }
   const agora=new Date().toISOString();
   this.banco.prepare(
    'INSERT INTO admin_pdf_demo_pedidos(pedido_id,pagamento_id,produto_id,nome_produto,revisao_produto,preco_centavos,criado_em) VALUES (?,?,?,?,?,?,?)'
   ).run(pedidoId,pagamentoId,produtoId,item.nome,registro.revisao,item.precoCentavos,agora);
   this.banco.exec('COMMIT');
   return {repetido:false,pedido:this.buscar(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 registrarEvento({pedidoId,eventoId,tipo}={}){
  idOk(pedidoId,ID_PEDIDO,'pedidoId');idOk(eventoId,ID_EVENTO,'eventoId');
  if(!Object.values(TIPOS).includes(tipo))throw falha('INVALIDO','Tipo de evento PDF invalido');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const pedido=this.banco.prepare(
    'SELECT pedido_id FROM admin_pdf_demo_pedidos WHERE pedido_id=?'
   ).get(pedidoId);
   if(!pedido)throw falha('NAO_ENCONTRADO','Pedido PDF ficticio inexistente');
   const anterior=this.banco.prepare(
    'SELECT pedido_id,tipo FROM admin_pdf_demo_eventos WHERE evento_id=?'
   ).get(eventoId);
   if(anterior){
    if(anterior.pedido_id!==pedidoId||anterior.tipo!==tipo){
     throw falha('CONFLITO','Identificador de evento reutilizado com dados diferentes');
    }
    this.banco.exec('COMMIT');
    return {repetido:true,pedido:this.buscar(pedidoId)};
   }
   const eventos=this.historico(pedidoId);
   if((tipo===TIPOS.CONFIRMAR&&eventos.length!==0)||
      (tipo===TIPOS.ESTORNAR&&(eventos.length!==1||eventos[0].tipo!==TIPOS.CONFIRMAR))){
    throw falha('CONFLITO','Transicao de pagamento PDF ficticio indevida');
   }
   this.banco.prepare(
    'INSERT INTO admin_pdf_demo_eventos(evento_id,pedido_id,tipo,registrado_em) VALUES (?,?,?,?)'
   ).run(eventoId,pedidoId,tipo,new Date().toISOString());
   this.banco.exec('COMMIT');
   return {repetido:false,pedido:this.buscar(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={PedidosPDFPagamentosDemoSQLite,TIPOS};
