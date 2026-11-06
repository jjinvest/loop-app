'use strict';
// Preparacao transacional de pre-pedido: SEM venda, sem Asaas, sem posicao,
// sem estoque reservado e sem fonte de pagamento. Exclusivo do staging local.
// A transicao para pedido comercial exigira outro modulo e gates homologados.
const {randomUUID}=require('node:crypto');
const {cotarCheckoutPublico}=require('./cotacao-checkout-publico');
const RASCUNHO=/^pre-[a-f0-9-]{36}$/;
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^[a-zA-Z0-9_-]{6,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function entradaRascunho(itens){
 if(!Array.isArray(itens)||itens.length<1||itens.length>20)
  throw falha('RASCUNHO_INCONSISTENTE');
 return {itens:itens.map(i=>({produtoId:i.produtoId,quantidade:i.quantidade}))};
}
function itensEquivalentes(original,atual){
 if(!Array.isArray(original)||!Array.isArray(atual)||original.length!==atual.length)
  return false;
 const ordenar=a=>a.map(i=>({
  produtoId:i.produtoId,quantidade:i.quantidade,tipo:i.tipo,
  nome:i.nome,precoUnitarioCentavos:i.precoUnitarioCentavos,
  subtotalCentavos:i.subtotalCentavos
 })).sort((x,y)=>x.produtoId.localeCompare(y.produtoId));
 return JSON.stringify(ordenar(original))===JSON.stringify(ordenar(atual));
}
class PrePedidosCheckoutStagingSQLite{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco.exec!=='function')
   throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.agora=agora;this.fotografiaClassificacao=null;
  const existem=banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_checkout_intencoes_preparacao'"
  ).get();
  if(!existem)throw new TypeError('IntencoesCheckoutSQLite precisa ser inicializado primeiro');
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_checkout_prepedidos_staging(',
   'prepedido_id TEXT PRIMARY KEY NOT NULL,',
   'rascunho_id TEXT NOT NULL UNIQUE REFERENCES',
   'akitemm_checkout_intencoes_preparacao(pedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL,',
   'fotografia_json TEXT NOT NULL,',
   'total_centavos INTEGER NOT NULL CHECK(total_centavos>0 AND total_centavos<=100000000),',
   "estado TEXT NOT NULL CHECK(estado='AGUARDANDO_HOMOLOGACAO_EXTERNA'),",
   'criado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_checkout_prepedidos_titular',
   'ON akitemm_checkout_prepedidos_staging(titular_id,criado_em);',
   'CREATE TRIGGER IF NOT EXISTS checkout_prepedido_no_update',
   'BEFORE UPDATE ON akitemm_checkout_prepedidos_staging',
   "BEGIN SELECT RAISE(ABORT,'prepedido imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS checkout_prepedido_no_delete',
   'BEFORE DELETE ON akitemm_checkout_prepedidos_staging',
   "BEGIN SELECT RAISE(ABORT,'prepedido imutavel'); END;"
  ].join(' '));
 }
 definirFotografiaClassificacao(fn){
  if(typeof fn!=='function'||this.fotografiaClassificacao)
   throw falha('FOTOGRAFIA_CLASSIFICACAO_INVALIDA');
  this.fotografiaClassificacao=fn;
 }
 _validarTitular(titularId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))
   throw falha('SESSAO_AUSENTE');
 }
 _validarRascunho(rascunhoId){
  if(typeof rascunhoId!=='string'||!RASCUNHO.test(rascunhoId))
   throw falha('RASCUNHO_NAO_ENCONTRADO');
 }
 _saida(registro){
  if(!registro)return null;
  return {
   prepedidoId:registro.prepedido_id,rascunhoId:registro.rascunho_id,
   estado:registro.estado,criadoEm:registro.criado_em,
   moeda:'BRL',totalCentavos:registro.total_centavos,
   itens:JSON.parse(registro.fotografia_json),
   semCompraReal:true,checkoutHabilitado:false,precoReservado:false,
   pedidoComercialCriado:false,pagamentoIniciado:false,
   posicoesCriadas:0,contabilizacaoFinanceira:false,
   prontoParaAsaas:false
  };
 }
 _buscarRascunho(titularId,rascunhoId){
  return this.banco.prepare([
   'SELECT * FROM akitemm_checkout_intencoes_preparacao',
   'WHERE pedido_id=? AND titular_id=?'
  ].join(' ')).get(rascunhoId,titularId);
 }
 _buscarExistente(titularId,rascunhoId){
  return this.banco.prepare([
   'SELECT * FROM akitemm_checkout_prepedidos_staging',
   'WHERE rascunho_id=? AND titular_id=?'
  ].join(' ')).get(rascunhoId,titularId);
 }
 consultar({titularId,prepedidoId}={}){
  this._validarTitular(titularId);
  if(typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
   throw falha('PREPEDIDO_NAO_ENCONTRADO');
  return this._saida(this.banco.prepare([
   'SELECT * FROM akitemm_checkout_prepedidos_staging',
   'WHERE prepedido_id=? AND titular_id=?'
  ].join(' ')).get(prepedidoId,titularId));
 }
 listar({titularId,limite=30}={}){
  this._validarTitular(titularId);
  if(!Number.isSafeInteger(limite)||limite<1||limite>50)
   throw falha('LIMITE_INVALIDO');
  return this.banco.prepare([
   'SELECT * FROM akitemm_checkout_prepedidos_staging',
   'WHERE titular_id=? ORDER BY criado_em DESC,prepedido_id DESC LIMIT ?'
  ].join(' ')).all(titularId,limite).map(x=>this._saida(x));
 }
 // A lista antiga continua limitada para leitores internos; o cliente
 // navega todo o historico, sempre filtrado por titular e ordem estavel.
 paginar({titularId,pagina=0,tamanho=20}={}){
  this._validarTitular(titularId);
  if(!Number.isSafeInteger(pagina)||pagina<0||pagina>1000000||
     !Number.isSafeInteger(tamanho)||tamanho<1||tamanho>50)
   throw falha('PAGINACAO_PEDIDOS_INVALIDA');
  const total=this.banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging',
   'WHERE titular_id=?'
  ].join(' ')).get(titularId).n;
  const linhas=this.banco.prepare([
   'SELECT * FROM akitemm_checkout_prepedidos_staging',
   'WHERE titular_id=?',
   'ORDER BY criado_em DESC,prepedido_id DESC LIMIT ? OFFSET ?'
  ].join(' ')).all(titularId,tamanho,pagina*tamanho);
  return {pedidos:linhas.map(x=>this._saida(x)),pagina,tamanho,total,
   haAnterior:pagina>0,haMais:(pagina+1)*tamanho<total};
 }
 async preparar({titularId,rascunhoId,repositorioCatalogo}={}){
  this._validarTitular(titularId);
  this._validarRascunho(rascunhoId);
  if(typeof repositorioCatalogo?.buscar!=='function')
   throw new TypeError('Fonte de catalogo obrigatoria');
  // Snapshot existente tem precedencia ao catalogo (idempotencia sem reprecificar).
  // Ambas as leituras devem filtrar por titular.
  const anterior=this._buscarExistente(titularId,rascunhoId);
  if(anterior)return {repetido:true,prepedido:this._saida(anterior)};
  const rascunho=this._buscarRascunho(titularId,rascunhoId);
  if(!rascunho)throw falha('RASCUNHO_NAO_ENCONTRADO');
  if(rascunho.estado!=='RASCUNHO_SEM_COBRANCA')
   throw falha('RASCUNHO_NAO_ELEGIVEL');
  let antigo;
  try{antigo=JSON.parse(rascunho.cotacao_json);}
  catch{throw falha('RASCUNHO_INCONSISTENTE');}
  // Nao comprar pelo valor do rascunho: deve recomputar precos atuais.
  let cotacaoAtual;
  try{
   cotacaoAtual=await cotarCheckoutPublico({
    repositorio:repositorioCatalogo,entrada:entradaRascunho(antigo?.itens)
   });
  }catch(e){
   if(e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO')
    throw falha('CATALOGO_ALTERADO_REFAZER_COTACAO');
   throw e;
  }
  if(cotacaoAtual.totalCentavos!==rascunho.total_centavos||
     !itensEquivalentes(antigo.itens,cotacaoAtual.itens))
   throw falha('CATALOGO_ALTERADO_REFAZER_COTACAO');
  const data=this.agora();
  if(typeof data!=='string'||!Number.isFinite(Date.parse(data)))
   throw falha('RELOGIO_NAO_CONFIAVEL');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const existente=this._buscarExistente(titularId,rascunhoId);
   if(existente){
    this.banco.exec('COMMIT');
    return {repetido:true,prepedido:this._saida(existente)};
   }
   const atual=this._buscarRascunho(titularId,rascunhoId);
   if(!atual||atual.cotacao_json!==rascunho.cotacao_json||
      atual.total_centavos!==rascunho.total_centavos)
    throw falha('RASCUNHO_NAO_ELEGIVEL');
   const id='hom-'+randomUUID();
   this.banco.prepare([
    'INSERT INTO akitemm_checkout_prepedidos_staging',
    '(prepedido_id,rascunho_id,titular_id,fotografia_json,total_centavos,estado,criado_em)',
    "VALUES(?,?,?,?,?,'AGUARDANDO_HOMOLOGACAO_EXTERNA',?)"
   ].join(' ')).run(id,rascunhoId,titularId,
    JSON.stringify(cotacaoAtual.itens),cotacaoAtual.totalCentavos,data);
   // Fotografia das classes é gravada na MESMA transação do pré-pedido.
   // Qualquer falha cancela a criação, sem pré-pedido órfão de evidência.
   if(this.fotografiaClassificacao){
    const foto=this.fotografiaClassificacao({prepedidoId:id,titularId,
     itens:cotacaoAtual.itens,totalCentavos:cotacaoAtual.totalCentavos,
     criadoEm:data});
    if(!foto||typeof foto.then==='function')
     throw falha('FOTOGRAFIA_CLASSIFICACAO_NAO_GRAVADA');
   }
   this.banco.exec('COMMIT');
   return {repetido:false,prepedido:this.consultar({titularId,prepedidoId:id})};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={PrePedidosCheckoutStagingSQLite};
