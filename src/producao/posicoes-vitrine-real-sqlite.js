'use strict';
// 400 espaços FIXOS da vitrine aprovada: 10 abas x 4 fileiras x 10.
// Apenas indexa produtos já existentes, nunca cria pedidos, posições LOOP
// ou movimentação financeira. Persiste no mesmo SQLite da conta real.
const {DatabaseSync}=require('node:sqlite');
const TOTAL=400;
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const TABELAS_POSICOES_VITRINE=Object.freeze(['loja_real_vitrine_posicoes']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class PosicoesVitrineRealSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')
   falha('VITRINE_REAL_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_vitrine_posicoes(',
   'posicao INTEGER PRIMARY KEY CHECK(posicao BETWEEN 1 AND 400),',
   'produto_id TEXT NOT NULL UNIQUE,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));'
  ].join(' '));
 }
 listar(){
  const lista=this.banco.prepare([
   'SELECT posicao,produto_id AS produtoId,',
   'revisao,atualizado_em AS atualizadoEm',
   'FROM loja_real_vitrine_posicoes ORDER BY posicao'
  ].join(' ')).all();
  if(lista.length>TOTAL||
     lista.some(x=>!Number.isSafeInteger(x.posicao)||x.posicao<1||
      x.posicao>TOTAL||!ID.test(x.produtoId)||
      !Number.isSafeInteger(x.revisao)||x.revisao<1))
   falha('VITRINE_REAL_POSICOES_CORROMPIDAS');
  return lista;
 }
 consultar({posicao}={}){
  if(!Number.isSafeInteger(posicao)||posicao<1||posicao>TOTAL)
   falha('VITRINE_REAL_POSICAO_INVALIDA');
  return this.listar().find(x=>x.posicao===posicao)||null;
 }
 atribuir({posicao,produtoId,revisaoEsperada=0,produtoExiste}={}){
  if(!Number.isSafeInteger(posicao)||posicao<1||posicao>TOTAL||
     !ID.test(produtoId)||!Number.isSafeInteger(revisaoEsperada)||
     revisaoEsperada<0||typeof produtoExiste!=='function')
   falha('VITRINE_REAL_ATRIBUICAO_INVALIDA');
  if(produtoExiste(produtoId)!==true)
   falha('VITRINE_REAL_PRODUTO_NAO_ENCONTRADO');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)
   falha('VITRINE_REAL_RELOGIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare([
    'SELECT produto_id AS produtoId,revisao',
    'FROM loja_real_vitrine_posicoes WHERE posicao=?'
   ].join(' ')).get(posicao);
   const revisao=anterior?.revisao||0;
   if(revisao!==revisaoEsperada)
    falha('VITRINE_REAL_REVISAO_CONCORRENTE');
   if(anterior&&anterior.produtoId!==produtoId)
    falha('VITRINE_REAL_ESPACO_OCUPADO');
   const mesmoProduto=this.banco.prepare([
    'SELECT posicao FROM loja_real_vitrine_posicoes',
    'WHERE produto_id=?'
   ].join(' ')).get(produtoId);
   if(mesmoProduto&&mesmoProduto.posicao!==posicao)
    falha('VITRINE_REAL_PRODUTO_JA_POSICIONADO');
   if(anterior){
    this.banco.exec('COMMIT');
    return {posicao,produtoId,revisao,jaVinculado:true};
   }
   this.banco.prepare([
    'INSERT INTO loja_real_vitrine_posicoes',
    '(posicao,produto_id,revisao,atualizado_em) VALUES(?,?,1,?)'
   ].join(' ')).run(posicao,produtoId,ts);
   this.banco.exec('COMMIT');
   return {posicao,produtoId,revisao:1,jaVinculado:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 projetar(produtos){
  if(!Array.isArray(produtos)||produtos.length>TOTAL||
     produtos.some(p=>typeof p?.produtoId!=='string'||
      !ID.test(p.produtoId)))
   falha('VITRINE_REAL_PRODUTOS_INVALIDOS');
  const registrados=this.listar();
  const reservados=new Set(registrados.map(x=>x.posicao));
  const porProduto=new Map(registrados.map(x=>[x.produtoId,x.posicao]));
  const porPosicao=new Set();
  let disponivel=1;
  return produtos.map(produto=>{
   let posicao=porProduto.get(produto.produtoId);
   if(!posicao){
    while(disponivel<=TOTAL&&reservados.has(disponivel))disponivel++;
    if(disponivel>TOTAL)
     falha('VITRINE_REAL_SEM_ESPACO_PARA_PRODUTO');
    posicao=disponivel++;reservados.add(posicao);
   }
   if(porPosicao.has(posicao))
    falha('VITRINE_REAL_POSICAO_DUPLICADA');
   porPosicao.add(posicao);
   return Object.freeze({...produto,posicaoVitrine:posicao});
  });
 }
}
module.exports={PosicoesVitrineRealSQLite,TABELAS_POSICOES_VITRINE,TOTAL};
