'use strict';
// 400 espaços: 10 abas x 4 fileiras x 10.
// Apenas indexa produtos já existentes, nunca cria pedidos, posições LOOP
// ou movimentação financeira. Persiste no mesmo SQLite da conta real.
const {DatabaseSync}=require('node:sqlite');
// O CHECK original do SQLite já permite 400 e preserva os vínculos existentes.
// A API e as novas atribuicoes usam o mesmo TOTAL (400).
const TOTAL=400;
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const TABELAS_POSICOES_VITRINE=Object.freeze(['loja_real_vitrine_posicoes']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class PosicoesVitrineRealSQLite{
 constructor({banco,agora=()=>Date.now(),auditoria=null}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function'||
     (auditoria!==null&&(auditoria.db!==banco||
      typeof auditoria.registrar!=='function')))
   falha('VITRINE_REAL_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;this.auditoria=auditoria;
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
   if(this.auditoria){
    this.auditoria.registrar({
     acao:'VITRINE_PRODUTO_VINCULADO',ator:'ADMIN_COMERCIAL',
     entidade:'SLOT_'+posicao,
     antes:{ocupado:false},depois:{posicao,produtoId},revisaoNova:1
    });
   }
   this.banco.exec('COMMIT');
   return {posicao,produtoId,revisao:1,jaVinculado:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 // A ordem publica e sequencial: mover um item desloca os vizinhos.
 // A operacao e atomica, auditada e nao altera nenhum estado financeiro.
 mover({produtoId,novaPosicao,revisaoEsperada}={}){
  if(!ID.test(produtoId)||!Number.isSafeInteger(novaPosicao)||
     novaPosicao<1||novaPosicao>TOTAL||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1)
   falha('VITRINE_REAL_MOVIMENTO_INVALIDO');
  const agora=this.agora();
  if(!Number.isSafeInteger(agora)||agora<1)
   falha('VITRINE_REAL_RELOGIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const lista=this.listar();
   const origem=lista.findIndex(x=>x.produtoId===produtoId);
   if(origem<0)falha('VITRINE_REAL_PRODUTO_NAO_POSICIONADO');
   if(lista[origem].revisao!==revisaoEsperada)
    falha('VITRINE_REAL_REVISAO_CONCORRENTE');
   if(novaPosicao>lista.length)
    falha('VITRINE_REAL_MOVIMENTO_INVALIDO');
   const anterior=origem+1;
   if(anterior===novaPosicao){
    this.banco.exec('COMMIT');
    return {produtoId,posicao:novaPosicao,ordem:lista.length,
     revisao:lista[origem].revisao,jaOrdenado:true};
   }
   const [movido]=lista.splice(origem,1);
   lista.splice(novaPosicao-1,0,movido);
   this.banco.prepare('DELETE FROM loja_real_vitrine_posicoes').run();
   const gravar=this.banco.prepare([
    'INSERT INTO loja_real_vitrine_posicoes',
    '(posicao,produto_id,revisao,atualizado_em) VALUES(?,?,?,?)'
   ].join(' '));
   for(let i=0;i<lista.length;i++){
    const atual=lista[i];
    const mudando=atual.posicao!==i+1;
    gravar.run(i+1,atual.produtoId,
     atual.revisao+(mudando?1:0),mudando?agora:atual.atualizadoEm);
   }
   if(this.auditoria)this.auditoria.registrar({
    acao:'VITRINE_ORDEM_ALTERADA',ator:'ADMIN_COMERCIAL',
    entidade:'PRODUTO_'+produtoId,
    antes:{posicao:anterior},
    depois:{posicao:novaPosicao},revisaoNova:movido.revisao+1
   });
   this.banco.exec('COMMIT');
   return {produtoId,posicao:novaPosicao,ordem:lista.length,
    revisao:movido.revisao+1,jaOrdenado:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 projetar(produtos){
  if(!Array.isArray(produtos)||produtos.length>TOTAL||
     produtos.some(p=>typeof p?.produtoId!=='string'||
      !ID.test(p.produtoId)))
   falha('VITRINE_REAL_PRODUTOS_INVALIDOS');
  const registrados=this.listar();
  const porProduto=new Map(produtos.map(p=>[p.produtoId,p]));
  if(porProduto.size!==produtos.length)
   falha('VITRINE_REAL_PRODUTO_DUPLICADO');
  // Respeitar a ordem definida pelo operador, mas nunca mostrar lacunas.
  // Produtos novos entram depois dos anteriores, pela data de cadastro.
  const posicionados=registrados
   .filter(r=>porProduto.has(r.produtoId))
   .map(r=>porProduto.get(r.produtoId));
  const vinculados=new Set(registrados.map(r=>r.produtoId));
  const semPosicao=produtos.filter(p=>!vinculados.has(p.produtoId))
   .sort((a,b)=>{
    const ta=Number.isSafeInteger(a.criadoEm)?a.criadoEm:0;
    const tb=Number.isSafeInteger(b.criadoEm)?b.criadoEm:0;
    return ta-tb||a.produtoId.localeCompare(b.produtoId);
   });
  return [...posicionados,...semPosicao].map((produto,i)=>
   Object.freeze({...produto,posicaoVitrine:i+1}));
 }
}
module.exports={PosicoesVitrineRealSQLite,TABELAS_POSICOES_VITRINE,TOTAL};
