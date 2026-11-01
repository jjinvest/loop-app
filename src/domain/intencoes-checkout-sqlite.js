'use strict';
// Preparacao de pedido duravel, NAO venda. Nenhum PSP, CPF, sessao, estoque,
// saque, posicao ou integracao com o motor sao acionados.
// A rota de teste que o utiliza NAO e montada no servidor publico.
const {createHash,randomUUID}=require('node:crypto');
const {entradaValida}=require('./cotacao-checkout-publico');

const TITULAR=/^[a-zA-Z0-9_-]{6,80}$/;
const CHAVE=/^[a-zA-Z0-9_-]{16,128}$/;
const PEDIDO=/^pre-[a-f0-9-]{36}$/;
function falha(codigo){const erro=new Error(codigo);erro.codigo=codigo;return erro;}
function validarTitular(titularId){
 if(typeof titularId!=='string'||!TITULAR.test(titularId))
  throw falha('SESSAO_CHECKOUT_INVALIDA');
}
function hashChave(chave){
 if(typeof chave!=='string'||!CHAVE.test(chave))
  throw falha('CHAVE_IDEMPOTENCIA_INVALIDA');
 return createHash('sha256').update('AKITEMM_PREPARACAO_V1\0'+chave).digest('hex');
}
function itensCanonicos(entrada){
 return entradaValida(entrada).map(({produtoId,quantidade})=>
  ({produtoId,quantidade})).sort((a,b)=>a.produtoId.localeCompare(b.produtoId));
}
function validarCotacao(cotacao,itens){
 if(!cotacao||cotacao.modo!=='COTACAO_INFORMATIVA_SEM_PEDIDO'||
   cotacao.compraDisponivel!==false||cotacao.pagamentoReal!==false||
   !Number.isSafeInteger(cotacao.totalCentavos)||cotacao.totalCentavos<=0||
   cotacao.moeda!=='BRL'||!Array.isArray(cotacao.itens)||
   cotacao.itens.length!==itens.length)throw falha('COTACAO_NAO_CONFIAVEL');
 const canonica=itensCanonicos({itens:cotacao.itens.map(({produtoId,quantidade})=>
  ({produtoId,quantidade}))});
 if(JSON.stringify(canonica)!==JSON.stringify(itens)||
   cotacao.itens.some(i=>!Number.isSafeInteger(i.precoUnitarioCentavos)||
    i.precoUnitarioCentavos<1||!Number.isSafeInteger(i.subtotalCentavos)||
    i.subtotalCentavos!==i.precoUnitarioCentavos*i.quantidade)||
   cotacao.itens.reduce((s,i)=>s+i.subtotalCentavos,0)!==cotacao.totalCentavos)
  throw falha('COTACAO_NAO_CONFIAVEL');
}
class IntencoesCheckoutSQLite{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco.exec!=='function')
   throw new TypeError('Banco SQLite explicito obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_checkout_intencoes_preparacao(',
   'pedido_id TEXT PRIMARY KEY NOT NULL, titular_id TEXT NOT NULL,',
   'chave_hash TEXT NOT NULL, itens_canonicos_json TEXT NOT NULL,',
   'cotacao_json TEXT NOT NULL,',
   'total_centavos INTEGER NOT NULL CHECK(total_centavos>0 AND total_centavos<=100000000),',
   "estado TEXT NOT NULL CHECK(estado='RASCUNHO_SEM_COBRANCA'),",
   'criado_em TEXT NOT NULL, UNIQUE(titular_id,chave_hash));',
   'CREATE INDEX IF NOT EXISTS idx_checkout_preparacao_titular',
   'ON akitemm_checkout_intencoes_preparacao(titular_id,criado_em,pedido_id);',
   'CREATE TRIGGER IF NOT EXISTS checkout_preparacao_imutavel_update',
   'BEFORE UPDATE ON akitemm_checkout_intencoes_preparacao',
   "BEGIN SELECT RAISE(ABORT,'rascunho imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS checkout_preparacao_imutavel_delete',
   'BEFORE DELETE ON akitemm_checkout_intencoes_preparacao',
   "BEGIN SELECT RAISE(ABORT,'rascunho imutavel'); END;"
  ].join(' '));
 }
 _saida(row){
  if(!row)return null;
  const cotacao=JSON.parse(row.cotacao_json);
  return {
   pedidoId:row.pedido_id,estado:row.estado,criadoEm:row.criado_em,
   totalCentavos:row.total_centavos,moeda:'BRL',itens:cotacao.itens,
   precoNaoReservado:true,pedidoComercialCriado:false,
   pagamentoIniciado:false,posicoesCriadas:0,semCompraReal:true
  };
 }
 _porChave(titularId,hash){
  return this.banco.prepare(
   'SELECT * FROM akitemm_checkout_intencoes_preparacao WHERE titular_id=? AND chave_hash=?'
  ).get(titularId,hash);
 }
 consultarPorChave({titularId,chaveIdempotencia,entrada}={}){
  validarTitular(titularId);
  const hash=hashChave(chaveIdempotencia);
  const itens=JSON.stringify(itensCanonicos(entrada));
  const existente=this._porChave(titularId,hash);
  if(existente&&existente.itens_canonicos_json!==itens)
   throw falha('CHAVE_IDEMPOTENCIA_CONFLITANTE');
  return this._saida(existente);
 }
 criar({titularId,chaveIdempotencia,entrada,cotacao}={}){
  validarTitular(titularId);
  const hash=hashChave(chaveIdempotencia);
  const itens=itensCanonicos(entrada);
  const itensJson=JSON.stringify(itens);
  validarCotacao(cotacao,itens);
  const data=this.agora();
  if(typeof data!=='string'||!Number.isFinite(Date.parse(data)))
   throw falha('RELOGIO_NAO_CONFIAVEL');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this._porChave(titularId,hash);
   if(anterior){
    if(anterior.itens_canonicos_json!==itensJson)
     throw falha('CHAVE_IDEMPOTENCIA_CONFLITANTE');
    this.banco.exec('COMMIT');
    return {repetido:true,intencao:this.consultarDoTitular({titularId,pedidoId:anterior.pedido_id})};
   }
   const pedidoId='pre-'+randomUUID();
   this.banco.prepare([
    'INSERT INTO akitemm_checkout_intencoes_preparacao',
    '(pedido_id,titular_id,chave_hash,itens_canonicos_json,cotacao_json,',
    'total_centavos,estado,criado_em)',
    "VALUES (?,?,?,?,?,?,'RASCUNHO_SEM_COBRANCA',?)"
   ].join(' ')).run(pedidoId,titularId,hash,itensJson,JSON.stringify(cotacao),cotacao.totalCentavos,data);
   this.banco.exec('COMMIT');
   return {repetido:false,intencao:this.consultarDoTitular({titularId,pedidoId})};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 consultarDoTitular({titularId,pedidoId}={}){
  validarTitular(titularId);
  if(typeof pedidoId!=='string'||!PEDIDO.test(pedidoId))
   throw falha('INTENCAO_NAO_ENCONTRADA');
  return this._saida(this.banco.prepare(
   'SELECT * FROM akitemm_checkout_intencoes_preparacao WHERE pedido_id=? AND titular_id=?'
  ).get(pedidoId,titularId));
 }
 listarDoTitular({titularId,limite=30}={}){
  validarTitular(titularId);
  if(!Number.isSafeInteger(limite)||limite<1||limite>50)
   throw falha('LIMITE_LISTAGEM_INVALIDO');
  return this.banco.prepare(
   'SELECT * FROM akitemm_checkout_intencoes_preparacao WHERE titular_id=? ORDER BY criado_em DESC,pedido_id DESC LIMIT ?'
  ).all(titularId,limite).map(r=>this._saida(r));
 }
}
module.exports={IntencoesCheckoutSQLite};
