'use strict';
// Politica comercial exclusiva de laboratorio:
// todo novo produto vale para o LOOP por padrao;
// o administrador pode desmarcar, sem retirar o item da loja.
// Regras anteriores nao sao reescritas.
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class ElegibilidadeProdutosLoopDemoSQLite{
 constructor({catalogo}={}){
  if(!catalogo?.banco||typeof catalogo.buscarRegistro!=='function')
   throw new TypeError('Catalogo de laboratorio obrigatorio');
  this.catalogo=catalogo;this.banco=catalogo.banco;
  this.banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_produtos_elegibilidade_loop_demo(
    produto_id TEXT PRIMARY KEY NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    elegivel INTEGER NOT NULL CHECK(elegivel IN (0,1)),
    revisao INTEGER NOT NULL CHECK(revisao>=2),
    atualizado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_produtos_elegibilidade_historico_demo(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    revisao INTEGER NOT NULL CHECK(revisao>=2),
    de_elegivel INTEGER NOT NULL CHECK(de_elegivel IN (0,1)),
    para_elegivel INTEGER NOT NULL CHECK(para_elegivel IN (0,1)),
    registrado_em TEXT NOT NULL,
    UNIQUE(produto_id,revisao)
   );
   -- Quantidade minima independente da chave de autorizacao.
   -- Por padrao, uma unidade basta para contar o subtotal do produto.
   CREATE TABLE IF NOT EXISTS admin_produtos_quantidade_minima_loop_demo(
    produto_id TEXT PRIMARY KEY NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    quantidade_minima INTEGER NOT NULL CHECK(quantidade_minima BETWEEN 1 AND 100),
    revisao INTEGER NOT NULL CHECK(revisao>=2),
    atualizado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_produtos_quantidade_minima_historico_demo(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    revisao INTEGER NOT NULL CHECK(revisao>=2),
    quantidade_anterior INTEGER NOT NULL CHECK(quantidade_anterior BETWEEN 1 AND 100),
    quantidade_nova INTEGER NOT NULL CHECK(quantidade_nova BETWEEN 1 AND 100),
    registrado_em TEXT NOT NULL,
    UNIQUE(produto_id,revisao)
   );
   CREATE TRIGGER IF NOT EXISTS admin_quantidade_minima_hist_no_update
    BEFORE UPDATE ON admin_produtos_quantidade_minima_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico de quantidade imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_quantidade_minima_hist_no_delete
    BEFORE DELETE ON admin_produtos_quantidade_minima_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico de quantidade imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_produtos_quantidade_minima_loop_demo(
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    revisao INTEGER NOT NULL CHECK(revisao>=2),
    quantidade_minima INTEGER NOT NULL CHECK(quantidade_minima BETWEEN 1 AND 100),
    registrado_em TEXT NOT NULL,
    PRIMARY KEY(produto_id,revisao)
   );
   CREATE TRIGGER IF NOT EXISTS admin_produtos_quantidade_minima_sem_update
    BEFORE UPDATE ON admin_produtos_quantidade_minima_loop_demo
    BEGIN SELECT RAISE(ABORT,'quantidade de elegibilidade imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_produtos_quantidade_minima_sem_delete
    BEFORE DELETE ON admin_produtos_quantidade_minima_loop_demo
    BEGIN SELECT RAISE(ABORT,'quantidade de elegibilidade imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_produtos_elegibilidade_historico_no_update
    BEFORE UPDATE ON admin_produtos_elegibilidade_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_produtos_elegibilidade_historico_no_delete
    BEFORE DELETE ON admin_produtos_elegibilidade_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
  `);
 }
 consultar(produtoId){
  if(typeof produtoId!=='string'||!this.catalogo.buscarRegistro(produtoId))
   throw erro('PRODUTO_INEXISTENTE');
  const reg=this.banco.prepare(
   'SELECT elegivel,revisao,atualizado_em AS atualizadoEm FROM admin_produtos_elegibilidade_loop_demo WHERE produto_id=?'
  ).get(produtoId);
  const quantidade=this.banco.prepare(
   'SELECT quantidade_minima AS minima,revisao,atualizado_em AS atualizadoEm FROM admin_produtos_quantidade_minima_loop_demo WHERE produto_id=?'
  ).get(produtoId);
  const q=this.banco.prepare(
   'SELECT quantidade_minima AS minima FROM admin_produtos_quantidade_minima_loop_demo WHERE produto_id=? ORDER BY revisao DESC LIMIT 1'
  ).get(produtoId);
  return {produtoId,elegivelLoop:reg?!!reg.elegivel:true,
   quantidadeMinimaLoop:q?.minima??1,
   revisaoElegibilidade:reg?.revisao??1,
   quantidadeMinimaLoop:quantidade?.minima??1,
   revisaoQuantidadeMinima:quantidade?.revisao??1,
   padrao:!reg,atualizadoEm:reg?.atualizadoEm??null};
 }
 listar(){
  return {produtos:this.catalogo.listar().map(p=>({
   nome:p.nome,tipo:p.tipo,precoCentavos:p.precoCentavos,
   estado:p.estado,...this.consultar(p.id)
  })),padraoElegivel:true,semPagamentoReal:true};
 }
 alterar({produtoId,elegivelLoop,quantidadeMinimaLoop,revisaoEsperada}={}){
  if(typeof elegivelLoop!=='boolean'||!Number.isSafeInteger(revisaoEsperada)||
   revisaoEsperada<1||
   (quantidadeMinimaLoop!==undefined&&
    (!Number.isSafeInteger(quantidadeMinimaLoop)||
     quantidadeMinimaLoop<1||quantidadeMinimaLoop>100)))
   throw erro('DADOS_INVALIDOS');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar(produtoId);
   if(atual.revisaoElegibilidade!==revisaoEsperada)throw erro('CONFLITO_REVISAO');
   const novaQuantidade=quantidadeMinimaLoop??atual.quantidadeMinimaLoop;
   if(atual.elegivelLoop===elegivelLoop&&atual.quantidadeMinimaLoop===novaQuantidade){
    this.banco.exec('COMMIT');
    return {...atual,alterado:false};
   }
   const nova=atual.revisaoElegibilidade+1;
   const agora=new Date().toISOString();
   this.banco.prepare(`
    INSERT INTO admin_produtos_elegibilidade_loop_demo(produto_id,elegivel,revisao,atualizado_em)
    VALUES(?,?,?,?)
    ON CONFLICT(produto_id) DO UPDATE SET
    elegivel=excluded.elegivel,revisao=excluded.revisao,atualizado_em=excluded.atualizado_em
   `).run(produtoId,elegivelLoop?1:0,nova,agora);
   this.banco.prepare(`
    INSERT INTO admin_produtos_elegibilidade_historico_demo(
     produto_id,revisao,de_elegivel,para_elegivel,registrado_em)
    VALUES(?,?,?,?,?)
   `).run(produtoId,nova,atual.elegivelLoop?1:0,elegivelLoop?1:0,agora);
   this.banco.prepare(`
    INSERT INTO admin_produtos_quantidade_minima_loop_demo
     (produto_id,revisao,quantidade_minima,registrado_em)
    VALUES (?,?,?,?)
   `).run(produtoId,nova,novaQuantidade,agora);
   this.banco.exec('COMMIT');
   return {...this.consultar(produtoId),alterado:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 // Somente novos pedidos recebem a nova quantidade exigida;
 // um pedido ja registrado preserva a fotografia no proprio pedido.
 alterarQuantidadeMinima({produtoId,quantidadeMinimaLoop,revisaoEsperada}={}){
  if(!Number.isSafeInteger(quantidadeMinimaLoop)||
   quantidadeMinimaLoop<1||quantidadeMinimaLoop>100||
   !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1)
   throw erro('DADOS_INVALIDOS');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar(produtoId);
   if(atual.revisaoQuantidadeMinima!==revisaoEsperada)
    throw erro('CONFLITO_REVISAO');
   if(atual.quantidadeMinimaLoop===quantidadeMinimaLoop){
    this.banco.exec('COMMIT');
    return {...atual,alterado:false};
   }
   const nova=atual.revisaoQuantidadeMinima+1,agora=new Date().toISOString();
   this.banco.prepare(`
    INSERT INTO admin_produtos_quantidade_minima_loop_demo
     (produto_id,quantidade_minima,revisao,atualizado_em)
    VALUES(?,?,?,?)
    ON CONFLICT(produto_id) DO UPDATE SET
     quantidade_minima=excluded.quantidade_minima,
     revisao=excluded.revisao,atualizado_em=excluded.atualizado_em
   `).run(produtoId,quantidadeMinimaLoop,nova,agora);
   this.banco.prepare(`
    INSERT INTO admin_produtos_quantidade_minima_historico_demo
     (produto_id,revisao,quantidade_anterior,quantidade_nova,registrado_em)
    VALUES(?,?,?,?,?)
   `).run(produtoId,nova,atual.quantidadeMinimaLoop,quantidadeMinimaLoop,agora);
   this.banco.exec('COMMIT');
   return {...this.consultar(produtoId),alterado:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 historicoQuantidadeMinima(produtoId){
  this.consultar(produtoId);
  return this.banco.prepare(`
   SELECT produto_id AS produtoId,revisao,
    quantidade_anterior AS quantidadeAnterior,quantidade_nova AS quantidadeNova,
    registrado_em AS registradoEm
   FROM admin_produtos_quantidade_minima_historico_demo
   WHERE produto_id=? ORDER BY revisao
  `).all(produtoId);
 }
 historico(produtoId){
  this.consultar(produtoId);
  return this.banco.prepare(`
   SELECT h.produto_id AS produtoId,h.revisao,
    h.de_elegivel AS deElegivel,h.para_elegivel AS paraElegivel,
    q.quantidade_minima AS quantidadeMinimaLoop,
    h.registrado_em AS registradoEm
   FROM admin_produtos_elegibilidade_historico_demo h
   LEFT JOIN admin_produtos_quantidade_minima_loop_demo q
    ON q.produto_id=h.produto_id AND q.revisao=h.revisao
   WHERE h.produto_id=? ORDER BY h.revisao
  `).all(produtoId).map(p=>({
   ...p,deElegivel:!!p.deElegivel,paraElegivel:!!p.paraElegivel,
   quantidadeMinimaLoop:p.quantidadeMinimaLoop??1
  }));
 }
}
module.exports={ElegibilidadeProdutosLoopDemoSQLite};
