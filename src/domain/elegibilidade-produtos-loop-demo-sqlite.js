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
  return {produtoId,elegivelLoop:reg?!!reg.elegivel:true,
   revisaoElegibilidade:reg?.revisao??1,
   padrao:!reg,atualizadoEm:reg?.atualizadoEm??null};
 }
 listar(){
  return {produtos:this.catalogo.listar().map(p=>({
   nome:p.nome,tipo:p.tipo,precoCentavos:p.precoCentavos,
   estado:p.estado,...this.consultar(p.id)
  })),padraoElegivel:true,semPagamentoReal:true};
 }
 alterar({produtoId,elegivelLoop,revisaoEsperada}={}){
  if(typeof elegivelLoop!=='boolean'||!Number.isSafeInteger(revisaoEsperada)||
   revisaoEsperada<1)throw erro('DADOS_INVALIDOS');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar(produtoId);
   if(atual.revisaoElegibilidade!==revisaoEsperada)throw erro('CONFLITO_REVISAO');
   if(atual.elegivelLoop===elegivelLoop){
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
   this.banco.exec('COMMIT');
   return {...this.consultar(produtoId),alterado:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 historico(produtoId){
  this.consultar(produtoId);
  return this.banco.prepare(`
   SELECT produto_id AS produtoId,revisao,de_elegivel AS deElegivel,
    para_elegivel AS paraElegivel,registrado_em AS registradoEm
   FROM admin_produtos_elegibilidade_historico_demo
   WHERE produto_id=? ORDER BY revisao
  `).all(produtoId).map(p=>({
   ...p,deElegivel:!!p.deElegivel,paraElegivel:!!p.paraElegivel
  }));
 }
}
module.exports={ElegibilidadeProdutosLoopDemoSQLite};
