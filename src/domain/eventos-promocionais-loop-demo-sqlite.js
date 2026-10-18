'use strict';
// Excecao PROMOCIONAL, criada/encerrada manualmente pelo administrador local.
// A regra ordinaria de cada produto e preservada fora do periodo da campanha.
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
const ID=/^[a-z0-9][a-z0-9-]{2,69}$/;
const dataValida=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
class EventosPromocionaisLoopDemoSQLite {
 constructor({catalogo,publicacoes,configuracaoValor,relogio=()=>new Date().toISOString()}={}){
  if(!catalogo?.banco||publicacoes?.banco!==catalogo.banco||
    configuracaoValor?.banco!==catalogo.banco)throw new TypeError('Catalogo, banners e valor LOOP compartilham SQLite');
  this.catalogo=catalogo;this.banco=catalogo.banco;
  this.publicacoes=publicacoes;this.configuracaoValor=configuracaoValor;this.relogio=relogio;
  this.banco.exec(`
    CREATE TABLE IF NOT EXISTS loop_eventos_comerciais_especiais_demo (
      evento_id TEXT PRIMARY KEY,
      produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
      titulo TEXT NOT NULL,descricao TEXT NOT NULL,
      quantidade_minima INTEGER NOT NULL CHECK(quantidade_minima BETWEEN 1 AND 100),
      posicoes INTEGER NOT NULL CHECK(posicoes BETWEEN 1 AND 6),
      referencia_no_inicio INTEGER NOT NULL CHECK(referencia_no_inicio>0),
      data_inicio TEXT,data_fim TEXT CHECK(data_inicio<=data_fim),
      estado TEXT NOT NULL CHECK(estado IN ('ATIVO','ENCERRADO')),
      publicacao_id INTEGER NOT NULL REFERENCES loop_home_publicacoes_demo(id),
      criado_em TEXT NOT NULL,encerrado_em TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS loop_evento_um_ativo_por_produto
      ON loop_eventos_comerciais_especiais_demo(produto_id) WHERE estado='ATIVO';
    CREATE TABLE IF NOT EXISTS loop_evento_especial_historico_demo (
      sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id TEXT NOT NULL,acao TEXT NOT NULL CHECK(acao IN ('CRIADO','ENCERRADO')),
      registrado_em TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS loop_evento_historico_no_update
      BEFORE UPDATE ON loop_evento_especial_historico_demo
      BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
    CREATE TRIGGER IF NOT EXISTS loop_evento_historico_no_delete
      BEFORE DELETE ON loop_evento_especial_historico_demo
      BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
  `);
  const col=this.banco.prepare('PRAGMA table_info(loop_eventos_comerciais_especiais_demo)').all().map(p=>p.name);
  if(!col.includes('data_inicio'))this.banco.exec('ALTER TABLE loop_eventos_comerciais_especiais_demo ADD COLUMN data_inicio TEXT');
  if(!col.includes('data_fim'))this.banco.exec('ALTER TABLE loop_eventos_comerciais_especiais_demo ADD COLUMN data_fim TEXT');
 }
 listar(){
  return this.banco.prepare(`
   SELECT evento_id AS eventoId,produto_id AS produtoId,titulo,descricao,
    quantidade_minima AS quantidadeMinimaLoop,
    posicoes AS posicoesPorPedidoLoop,referencia_no_inicio AS referenciaNoInicioCentavos,
    data_inicio AS dataInicio,data_fim AS dataFim,
    estado,publicacao_id AS publicacaoId,criado_em AS criadoEm,encerrado_em AS encerradoEm
   FROM loop_eventos_comerciais_especiais_demo ORDER BY criado_em DESC,evento_id DESC LIMIT 100
  `).all();
 }
 consultarProduto(produtoId){
  return this.banco.prepare(`
   SELECT evento_id AS eventoId,titulo,descricao,
    data_inicio AS dataInicio,data_fim AS dataFim,
    quantidade_minima AS quantidadeMinimaLoop,
    posicoes AS posicoesPorPedidoLoop
   FROM loop_eventos_comerciais_especiais_demo
   WHERE produto_id=? AND estado='ATIVO'
    AND (data_inicio IS NULL OR data_inicio<=?)
    AND (data_fim IS NULL OR data_fim>=?)
  `).get(produtoId,this.relogio().slice(0,10),this.relogio().slice(0,10))||null;
 }
 historico(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))throw erro('EVENTO_INVALIDO');
  return this.banco.prepare(`
   SELECT acao,registrado_em AS registradoEm FROM loop_evento_especial_historico_demo
   WHERE evento_id=? ORDER BY sequencia
  `).all(eventoId);
 }
 criar({eventoId,produtoId,titulo,descricao,quantidadeMinimaLoop,posicoesPorPedidoLoop,dataInicio,dataFim}={}){
  if(typeof eventoId!=='string'||!ID.test(eventoId)||
     typeof produtoId!=='string'||!ID.test(produtoId)||
     typeof titulo!=='string'||titulo.trim().length<5||titulo.length>90||
     typeof descricao!=='string'||descricao.trim().length<8||descricao.length>450||
     !dataValida(dataInicio)||!dataValida(dataFim)||dataInicio>dataFim||dataFim<this.relogio().slice(0,10)||
     !Number.isSafeInteger(quantidadeMinimaLoop)||quantidadeMinimaLoop<1||quantidadeMinimaLoop>100||
     !Number.isSafeInteger(posicoesPorPedidoLoop)||posicoesPorPedidoLoop<1||posicoesPorPedidoLoop>6)
    throw erro('EVENTO_INVALIDO');
  const produto=this.catalogo.buscarRegistro(produtoId)?.produto;
  if(!produto||produto.estado!=='PUBLICADO'||!['FISICO','PDF'].includes(produto.tipo))
   throw erro('PRODUTO_INDISPONIVEL');
  const referencia=this.configuracaoValor.atual().valorCentavos;
  // Esta barreira cobre SOMENTE as referencias do motor, ainda sem custo
  // do fornecedor, tributos, taxas e margem: exige analise comercial.
  if(produto.precoCentavos*quantidadeMinimaLoop<posicoesPorPedidoLoop*referencia)
   throw erro('LASTRO_MINIMO_INSUFICIENTE');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   if(this.banco.prepare('SELECT 1 FROM loop_eventos_comerciais_especiais_demo WHERE evento_id=?').get(eventoId))
    throw erro('EVENTO_JA_EXISTE');
   if(this.banco.prepare("SELECT 1 FROM loop_eventos_comerciais_especiais_demo WHERE produto_id=? AND estado='ATIVO' AND (data_fim IS NULL OR data_fim>=?)").get(produtoId,this.relogio().slice(0,10)))throw erro('EVENTO_ATIVO_NO_PRODUTO');
   const pub=this.publicacoes.publicar({tipo:'EVENTO',titulo,descricao,linkDestino:'/loja'});
   const agora=this.relogio();
   this.banco.prepare(`
    INSERT INTO loop_eventos_comerciais_especiais_demo
     (evento_id,produto_id,titulo,descricao,quantidade_minima,posicoes,referencia_no_inicio,
      data_inicio,data_fim,estado,publicacao_id,criado_em)
    VALUES(?,?,?,?,?,?,?,?,?,'ATIVO',?,?)
   `).run(eventoId,produtoId,titulo.trim(),descricao.trim(),quantidadeMinimaLoop,
     posicoesPorPedidoLoop,referencia,dataInicio,dataFim,pub.id,agora);
   this.banco.prepare(`
    INSERT INTO loop_evento_especial_historico_demo(evento_id,acao,registrado_em)
    VALUES(?,'CRIADO',?)
   `).run(eventoId,agora);
   this.banco.exec('COMMIT');
   return this.listar().find(e=>e.eventoId===eventoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 encerrar(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))throw erro('EVENTO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const row=this.banco.prepare(`
    SELECT estado,publicacao_id AS publicacaoId
    FROM loop_eventos_comerciais_especiais_demo WHERE evento_id=?
   `).get(eventoId);
   if(!row)throw erro('EVENTO_NAO_ENCONTRADO');
   if(row.estado!=='ATIVO')throw erro('EVENTO_JA_ENCERRADO');
   const agora=this.relogio();
   this.publicacoes.arquivar(row.publicacaoId);
   this.banco.prepare(`
    UPDATE loop_eventos_comerciais_especiais_demo
    SET estado='ENCERRADO',encerrado_em=? WHERE evento_id=?
   `).run(agora,eventoId);
   this.banco.prepare(`
    INSERT INTO loop_evento_especial_historico_demo(evento_id,acao,registrado_em)
    VALUES(?,'ENCERRADO',?)
   `).run(eventoId,agora);
   this.banco.exec('COMMIT');
   return this.listar().find(x=>x.eventoId===eventoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={EventosPromocionaisLoopDemoSQLite};