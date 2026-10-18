'use strict';
// Eventos EXCEPCIONAIS do operador. Nao alteram permanentemente a modalidade do produto.
// Toda condicao especial fica ligada a uma campanha ATIVA, publicada e auditavel.
// Ambiente de laboratorio local, sem autorizacao de pagamentos reais.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
const ID=/^[a-z0-9][a-z0-9-]{2,69}$/;
class EventosPromocionaisLoopDemoSQLite {
 constructor({catalogo,publicacoes=null,relogio=()=>new Date().toISOString()}={}){
  if(!catalogo?.banco||typeof catalogo.buscarRegistro!=='function')
   throw new TypeError('Catalogo SQLite obrigatorio para eventos');
  this.catalogo=catalogo;this.banco=catalogo.banco;this.publicacoes=publicacoes;this.relogio=relogio;
  this.banco.exec(`
   CREATE TABLE IF NOT EXISTS loop_eventos_comerciais_especiais_demo (
    evento_id TEXT PRIMARY KEY,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    titulo TEXT NOT NULL,descricao TEXT NOT NULL,
    posicoes INTEGER NOT NULL CHECK(posicoes IN (5,6)),
    estado TEXT NOT NULL CHECK(estado IN ('ATIVO','ENCERRADO')),
    publicacao_id INTEGER NOT NULL REFERENCES loop_home_publicacoes_demo(id),
    criado_em TEXT NOT NULL,encerrado_em TEXT
   );
   CREATE UNIQUE INDEX IF NOT EXISTS loop_evento_unico_produto_ativo_demo
    ON loop_eventos_comerciais_especiais_demo(produto_id) WHERE estado='ATIVO';
   CREATE TABLE IF NOT EXISTS loop_evento_especial_historico_demo (
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,evento_id TEXT NOT NULL,
    acao TEXT NOT NULL CHECK(acao IN ('CRIADO','ENCERRADO')),
    registrado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS loop_evento_historico_no_update
    BEFORE UPDATE ON loop_evento_especial_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS loop_evento_historico_no_delete
    BEFORE DELETE ON loop_evento_especial_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
  `);
 }
 listar(){
  return this.banco.prepare(`
   SELECT evento_id AS eventoId,produto_id AS produtoId,titulo,descricao,
    posicoes AS posicoesPorPedidoLoop,estado,publicacao_id AS publicacaoId,
    criado_em AS criadoEm,encerrado_em AS encerradoEm
   FROM loop_eventos_comerciais_especiais_demo
   ORDER BY criado_em DESC,evento_id DESC LIMIT 100`).all();
 }
 consultarProduto(produtoId){
  return this.banco.prepare(`
   SELECT evento_id AS eventoId,posicoes AS posicoesPorPedidoLoop
   FROM loop_eventos_comerciais_especiais_demo
   WHERE produto_id=? AND estado='ATIVO'`).get(produtoId)||null;
 }
 historico(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))throw falha('EVENTO_INVALIDO');
  return this.banco.prepare(`
   SELECT acao,registrado_em AS registradoEm FROM loop_evento_especial_historico_demo
   WHERE evento_id=? ORDER BY sequencia`).all(eventoId);
 }
 criar({eventoId,produtoId,titulo,descricao,posicoesPorPedidoLoop}={}){
  if(typeof eventoId!=='string'||!ID.test(eventoId)||
   typeof produtoId!=='string'||!ID.test(produtoId)||
   typeof titulo!=='string'||titulo.trim().length<5||titulo.length>90||
   typeof descricao!=='string'||descricao.trim().length<8||descricao.length>450||
   ![5,6].includes(posicoesPorPedidoLoop))
   throw falha('EVENTO_INVALIDO');
  if(!this.publicacoes||this.publicacoes.banco!==this.banco)
   throw falha('PUBLICACAO_DO_EVENTO_INDISPONIVEL');
  const r=this.catalogo.buscarRegistro(produtoId);
  if(!r||r.produto.estado!=='PUBLICADO'||!['PDF','FISICO'].includes(r.produto.tipo))
   throw falha('PRODUTO_INDISPONIVEL');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   if(this.banco.prepare('SELECT 1 FROM loop_eventos_comerciais_especiais_demo WHERE evento_id=?').get(eventoId))
    throw falha('EVENTO_JA_EXISTE');
   if(this.consultarProduto(produtoId))throw falha('EVENTO_ATIVO_NO_PRODUTO');
   // O evento deve aparecer nos banners do escritorio. Publicacao e
   // ativacao ocorrem na MESMA transacao: nao deixar campanha invisivel.
   const publicacao=this.publicacoes.publicar({tipo:'EVENTO',titulo,descricao,
    linkDestino:'/loja'});
   const agora=this.relogio();
   this.banco.prepare(`
    INSERT INTO loop_eventos_comerciais_especiais_demo(
     evento_id,produto_id,titulo,descricao,posicoes,estado,publicacao_id,criado_em)
    VALUES(?,?,?,?,?,'ATIVO',?,?)`).run(eventoId,produtoId,titulo.trim(),descricao.trim(),
     posicoesPorPedidoLoop,publicacao.id,agora);
   this.banco.prepare(`
    INSERT INTO loop_evento_especial_historico_demo(evento_id,acao,registrado_em)
    VALUES(?,'CRIADO',?)`).run(eventoId,agora);
   this.banco.exec('COMMIT');
   return this.listar().find(e=>e.eventoId===eventoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 encerrar(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))throw falha('EVENTO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const e=this.banco.prepare(
    'SELECT estado,publicacao_id AS publicacaoId FROM loop_eventos_comerciais_especiais_demo WHERE evento_id=?'
   ).get(eventoId);
   if(!e)throw falha('EVENTO_NAO_ENCONTRADO');
   if(e.estado!=='ATIVO')throw falha('EVENTO_JA_ENCERRADO');
   const agora=this.relogio();
   this.publicacoes.arquivar(e.publicacaoId);
   this.banco.prepare(
    "UPDATE loop_eventos_comerciais_especiais_demo SET estado='ENCERRADO',encerrado_em=? WHERE evento_id=?"
   ).run(agora,eventoId);
   this.banco.prepare(`
    INSERT INTO loop_evento_especial_historico_demo(evento_id,acao,registrado_em)
    VALUES(?,'ENCERRADO',?)`).run(eventoId,agora);
   this.banco.exec('COMMIT');
   return this.listar().find(x=>x.eventoId===eventoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={EventosPromocionaisLoopDemoSQLite};