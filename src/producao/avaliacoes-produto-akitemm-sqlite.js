'use strict';
// Apenas avaliações verificadas de compradores, quando existirem.
// Não publica depoimentos inventados nem aceita postagens por esta rota.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
class AvaliacoesProdutoAkitemmSQLite{
 constructor({banco}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function')
   throw Error('AVALIACOES_BANCO_INVALIDO');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_avaliacoes_verificadas(',
   'id TEXT PRIMARY KEY,',
   'produto_id TEXT NOT NULL REFERENCES loja_real_produtos(produto_id) ON DELETE RESTRICT,',
   'pedido_id TEXT NOT NULL,',
   'nome_exibicao TEXT NOT NULL CHECK(length(nome_exibicao) BETWEEN 2 AND 50),',
   'nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),',
   'comentario TEXT NOT NULL CHECK(length(comentario) BETWEEN 10 AND 1500),',
   'publicado_em INTEGER NOT NULL CHECK(publicado_em>0),',
   'verificada INTEGER NOT NULL CHECK(verificada=1),',
   'visivel INTEGER NOT NULL DEFAULT 0 CHECK(visivel IN (0,1)),',
   'UNIQUE(produto_id,pedido_id));',
   'CREATE INDEX IF NOT EXISTS loja_real_avaliacoes_visiveis_idx',
   'ON loja_real_avaliacoes_verificadas(produto_id,visivel,publicado_em);'
  ].join(' '));
 }
 listar({produtoId,limite=25}={}){
  if(typeof produtoId!=='string'||!ID.test(produtoId)||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   throw Error('AVALIACAO_CONSULTA_INVALIDA');
  const principal=this.banco.prepare([
   'SELECT COUNT(*) total,AVG(nota) media',
   'FROM loja_real_avaliacoes_verificadas',
   'WHERE produto_id=? AND verificada=1 AND visivel=1'
  ].join(' ')).get(produtoId);
  const itens=this.banco.prepare([
   'SELECT id,nome_exibicao AS nome,nota,comentario,publicado_em AS publicadoEm',
   'FROM loja_real_avaliacoes_verificadas',
   'WHERE produto_id=? AND verificada=1 AND visivel=1',
   'ORDER BY publicado_em DESC,id DESC LIMIT ?'
  ].join(' ')).all(produtoId,limite);
  return {produtoId,total:principal.total,
   notaMedia:principal.media===null?null:Math.round(principal.media*10)/10,
   avaliacoes:itens.map(x=>({...x,compraVerificada:true})),
   origem:'COMPRAS_VERIFICADAS',aceitaAvaliacaoNestaRota:false};
 }
}
module.exports={AvaliacoesProdutoAkitemmSQLite};
