'use strict';
// Carrinho PERSISTENTE do titular no banco de identidade real.
// Armazena somente IDs e quantidades. NÃO cria pedidos, cotações,
// cobrança, crédito, posições, frete ou autorização financeira.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
class CarrinhoInternoRealSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')
   erro('CARRINHO_REAL_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_carrinho_itens(',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'produto_id TEXT NOT NULL,',
   'quantidade INTEGER NOT NULL CHECK(quantidade BETWEEN 1 AND 50),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0),',
   'PRIMARY KEY(titular_id,produto_id));',
   'CREATE INDEX IF NOT EXISTS idx_loop_real_carrinho_titular',
   'ON loop_real_carrinho_itens(titular_id,atualizado_em DESC);'
  ].join(' '));
 }
 _titular(titularId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))
   erro('CARRINHO_TITULAR_INVALIDO');
 }
 _produto(produtoId){
  if(typeof produtoId!=='string'||!ID.test(produtoId))
   erro('CARRINHO_PRODUTO_INVALIDO');
 }
 listar({titularId}={}){
  this._titular(titularId);
  const itens=this.banco.prepare([
   'SELECT produto_id AS produtoId, quantidade,',
   'atualizado_em AS atualizadoEm',
   'FROM loop_real_carrinho_itens WHERE titular_id=?',
   'ORDER BY atualizado_em DESC,produto_id ASC LIMIT 30'
  ].join(' ')).all(titularId);
  const total=this.banco.prepare([
   'SELECT COUNT(*) AS linhas, COALESCE(SUM(quantidade),0) AS quantidade',
   'FROM loop_real_carrinho_itens WHERE titular_id=?'
  ].join(' ')).get(titularId);
  if(total.linhas>20||total.linhas!==itens.length||
     itens.some(x=>!ID.test(x.produtoId)||
      !Number.isSafeInteger(x.quantidade)||x.quantidade<1||
      x.quantidade>50||!Number.isSafeInteger(x.atualizadoEm)||
      x.atualizadoEm<1))
   erro('CARRINHO_INTEGRIDADE_INVALIDA');
  return Object.freeze({fonte:'CARRINHO_INTERNO_REAL',
   itens,itensDistintos:total.linhas,quantidadeTotal:total.quantidade,
   checkoutReal:false,financeiroReal:false,
   precosConfirmados:false,freteConfirmado:false});
 }
 definir({titularId,produtoId,quantidade}={}){
  this._titular(titularId);this._produto(produtoId);
  if(!Number.isSafeInteger(quantidade)||quantidade<0||quantidade>50)
   erro('CARRINHO_QUANTIDADE_INVALIDA');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)erro('CARRINHO_RELOGIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  let aberta=true;
  try{
   if(quantidade===0){
    this.banco.prepare('DELETE FROM loop_real_carrinho_itens WHERE titular_id=? AND produto_id=?')
     .run(titularId,produtoId);
   }else{
    const n=this.banco.prepare([
     'SELECT COUNT(*) AS n FROM loop_real_carrinho_itens',
     'WHERE titular_id=?'
    ].join(' ')).get(titularId).n;
    const existe=this.banco.prepare([
     'SELECT 1 AS ok FROM loop_real_carrinho_itens',
     'WHERE titular_id=? AND produto_id=?'
    ].join(' ')).get(titularId,produtoId);
    if(!existe&&n>=20)erro('CARRINHO_LIMITE_ITENS');
    this.banco.prepare([
     'INSERT INTO loop_real_carrinho_itens',
     '(titular_id,produto_id,quantidade,atualizado_em)',
     'VALUES(?,?,?,?)',
     'ON CONFLICT(titular_id,produto_id) DO UPDATE SET',
     'quantidade=excluded.quantidade,atualizado_em=excluded.atualizado_em'
    ].join(' ')).run(titularId,produtoId,quantidade,ts);
   }
   this.banco.exec('COMMIT');aberta=false;
  }catch(e){if(aberta)this.banco.exec('ROLLBACK');throw e;}
  return this.listar({titularId});
 }
 limpar({titularId}={}){
  this._titular(titularId);
  this.banco.prepare('DELETE FROM loop_real_carrinho_itens WHERE titular_id=?')
   .run(titularId);
  return this.listar({titularId});
 }
 verificar(){
  // Conferencia sem escrita; segura para snapshots, restaurações e auditorias.
  // A integridade deve valer para TODOS os titulares, não só o usuário ativo.
  const linhas=this.banco.prepare([
   'SELECT c.titular_id AS titularId,c.produto_id AS produtoId,',
   'c.quantidade,c.atualizado_em AS atualizadoEm,t.id AS contaId',
   'FROM loop_real_carrinho_itens c',
   'LEFT JOIN loop_real_contas t ON t.id=c.titular_id',
   'ORDER BY c.titular_id,c.produto_id'
  ].join(' ')).iterate();
  // Cursor em streaming: memória constante mesmo com grande volume.
  let ultimoTitular=null,contadorTitular=0,quantidadeItens=0;
  for(const item of linhas){
   if(typeof item.titularId!=='string'||!TITULAR.test(item.titularId)||
      item.contaId!==item.titularId||
      typeof item.produtoId!=='string'||!ID.test(item.produtoId)||
      !Number.isSafeInteger(item.quantidade)||item.quantidade<1||
      item.quantidade>50||
      !Number.isSafeInteger(item.atualizadoEm)||item.atualizadoEm<1)
    erro('CARRINHO_INTEGRIDADE_INVALIDA');
   if(item.titularId!==ultimoTitular){
    ultimoTitular=item.titularId;contadorTitular=0;
   }
   contadorTitular++;
   quantidadeItens++;
   if(contadorTitular>20)erro('CARRINHO_INTEGRIDADE_INVALIDA');
  }
  return {integridade:'OK',itens:quantidadeItens,financeiroReal:false};
 }
}
module.exports={CarrinhoInternoRealSQLite};
