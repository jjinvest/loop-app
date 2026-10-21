'use strict';
// Avaliações da AKITEMM: titular da compra + pagamento fictício
// confirmado + entrega marcada pelo operador de laboratório.
// Nenhum status é considerado comprovação de entrega real.
const FOTO=/^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g)$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class AkitemmAvaliacoesDemoSQLite{
 constructor({banco,carrinhos,agora=()=>new Date().toISOString()}={}){
  if(!banco||!carrinhos||banco!==carrinhos.banco)throw new TypeError('Carrinhos e SQLite compartilhados obrigatorios');
  this.banco=banco;this.carrinhos=carrinhos;this.agora=agora;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS akitemm_entregas_confirmadas_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_carrinho_loop_demo(pedido_id),
    conta_id TEXT NOT NULL,confirmada_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS akitemm_avaliacoes_demo(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id TEXT NOT NULL REFERENCES admin_carrinho_loop_demo(pedido_id),
    conta_id TEXT NOT NULL,produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id),
    nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
    comentario TEXT NOT NULL CHECK(length(comentario) BETWEEN 10 AND 1000),
    status TEXT NOT NULL CHECK(status IN ('PENDENTE','APROVADA','REJEITADA')),
    imagem_caminho TEXT,criada_em TEXT NOT NULL,moderada_em TEXT,
    UNIQUE(pedido_id,produto_id)
   );
   CREATE INDEX IF NOT EXISTS idx_akitemm_avaliacoes_produto
    ON akitemm_avaliacoes_demo(produto_id,status);
   CREATE TRIGGER IF NOT EXISTS akitemm_entregas_sem_update
    BEFORE UPDATE ON akitemm_entregas_confirmadas_demo
    BEGIN SELECT RAISE(ABORT,'entrega ficticia imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS akitemm_entregas_sem_delete
    BEFORE DELETE ON akitemm_entregas_confirmadas_demo
    BEGIN SELECT RAISE(ABORT,'entrega ficticia imutavel'); END;
  `);
 }
 entregue({pedidoId}={}){
  const pedido=this.carrinhos.buscar(pedidoId);
  if(!pedido)throw erro('PEDIDO_NAO_ENCONTRADO');
  if(pedido.situacaoPagamentoFicticio!=='CONFIRMADO_FICTICIO'||
    !pedido.itens.some(i=>i.tipo==='FISICO'))
    throw erro('PAGAMENTO_OU_PRODUTO_INVALIDO');
  const dados=this.banco.prepare('SELECT 1 FROM admin_akitemm_entrega_pedido_demo WHERE pedido_id=? AND conta_id=?')
   .get(pedidoId,pedido.contaId);
  if(!dados)throw erro('ENDERECO_NAO_REGISTRADO');
  const sql=`INSERT OR IGNORE INTO akitemm_entregas_confirmadas_demo
   (pedido_id,conta_id,confirmada_em) VALUES(?,?,?)`;
  const r=this.banco.prepare(sql).run(pedidoId,pedido.contaId,this.agora());
  return {pedidoId,entregaFicticia:true,repetido:r.changes===0,semEntregaReal:true};
 }
 itensAvaliaveis(contaId){
  const rows=this.banco.prepare(`
    SELECT i.pedido_id AS pedidoId,i.produto_id AS produtoId,i.nome,
     e.confirmada_em AS entregueEm,
     av.status AS statusAvaliacao
    FROM akitemm_entregas_confirmadas_demo e
    JOIN admin_carrinho_loop_itens_demo i ON i.pedido_id=e.pedido_id
    LEFT JOIN akitemm_avaliacoes_demo av ON av.pedido_id=i.pedido_id AND av.produto_id=i.produto_id
    WHERE e.conta_id=? AND i.tipo='FISICO'
    ORDER BY e.confirmada_em DESC,i.pedido_id DESC,i.ordem
    LIMIT 100
  `).all(contaId);
  return rows.filter(x=>this.carrinhos.buscarDaConta(x.pedidoId,contaId)?.situacaoPagamentoFicticio==='CONFIRMADO_FICTICIO');
 }
 criar({contaId,pedidoId,produtoId,nota,comentario}={}){
  if(typeof pedidoId!=='string'||typeof produtoId!=='string'||
     !Number.isInteger(nota)||nota<1||nota>5||
     typeof comentario!=='string'||comentario.trim().length<10||
     comentario.length>1000||/[\u0000-\u0008\u000b-\u001f]/.test(comentario))
   throw erro('AVALIACAO_INVALIDA');
  const pode=this.itensAvaliaveis(contaId).find(x=>
   x.pedidoId===pedidoId&&x.produtoId===produtoId);
  if(!pode)throw erro('AVALIACAO_SEM_ENTREGA_CONFIRMADA');
  if(pode.statusAvaliacao)throw erro('AVALIACAO_JA_REGISTRADA');
  this.banco.prepare(`
   INSERT INTO akitemm_avaliacoes_demo
   (pedido_id,conta_id,produto_id,nota,comentario,status,imagem_caminho,criada_em)
   VALUES(?,?,?,?,?,'PENDENTE',NULL,?)
  `).run(pedidoId,contaId,produtoId,nota,comentario.trim(),this.agora());
  return {pedidoId,produtoId,status:'PENDENTE',aguardandoModeracao:true,semEntregaReal:true};
 }
 publicadas(produtoId){
  if(typeof produtoId!=='string'||!/^[a-z0-9-]{3,80}$/.test(produtoId))
   throw erro('PRODUTO_INVALIDO');
  return this.banco.prepare(`
    SELECT nota,comentario,imagem_caminho AS imagemCaminho,criada_em AS criadaEm
    FROM akitemm_avaliacoes_demo
    WHERE produto_id=? AND status='APROVADA'
    ORDER BY id DESC LIMIT 50
  `).all(produtoId);
 }
 moderar({id,status,imagemCaminho=null}={}){
  if(!Number.isSafeInteger(id)||id<1||
    !['APROVADA','REJEITADA'].includes(status)||
    (imagemCaminho!==null&&!FOTO.test(imagemCaminho)))
   throw erro('MODERACAO_INVALIDA');
  const r=this.banco.prepare(`
   UPDATE akitemm_avaliacoes_demo
    SET status=?,imagem_caminho=?,moderada_em=?
    WHERE id=? AND status='PENDENTE'
  `).run(status,imagemCaminho,this.agora(),id);
  if(!r.changes)throw erro('AVALIACAO_NAO_PENDENTE');
  return {id,status,moderada:true};
 }
 pendentesAdmin(){
  return this.banco.prepare(`
   SELECT id,pedido_id AS pedidoId,produto_id AS produtoId,
    nota,comentario,criada_em AS criadaEm
   FROM akitemm_avaliacoes_demo WHERE status='PENDENTE' ORDER BY id
  `).all();
 }
}
module.exports={AkitemmAvaliacoesDemoSQLite};
