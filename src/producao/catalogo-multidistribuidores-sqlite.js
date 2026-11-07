'use strict';
// Catálogo permanente de produtos fisicos da AKITEMM. Um produto pode ter
// ofertas de VARIOS distribuidores; um distribuidor pode atender VARIOS SKUs.
// Nenhum produto ou fornecedor ficticio é inserido automaticamente.
// As funções de escrita são administrativas e não montadas na API pública.
const PRODUTO=/^[A-Za-z0-9_-]{1,80}$/;
const IDENT=/^[A-Za-z0-9_-]{1,80}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function id(s){return typeof s==='string'&&IDENT.test(s);}
class CatalogoMultiDistribuidoresSQLite{
 constructor({banco,distribuidorHomologado,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof distribuidorHomologado!=='function'||typeof agora!=='function')
   erro('CATALOGO_REAL_NAO_CONFIGURADO');
  this.db=banco;this.homologado=distribuidorHomologado;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_produtos(',
   'produto_id TEXT PRIMARY KEY,titulo TEXT NOT NULL,',
   'descricao TEXT NOT NULL,tipo TEXT NOT NULL',
   "CHECK(tipo IN ('FISICO')),",
   'ativo INTEGER NOT NULL CHECK(ativo IN (0,1)),',
   'criado_em INTEGER NOT NULL,atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loja_real_ofertas_distribuidores(',
   'produto_id TEXT NOT NULL REFERENCES loja_real_produtos(produto_id)',
   'ON DELETE RESTRICT,distribuidor_id TEXT NOT NULL,sku TEXT NOT NULL,',
   'preco_centavos INTEGER NOT NULL CHECK(preco_centavos>0),',
   'prioridade INTEGER NOT NULL CHECK(prioridade BETWEEN 1 AND 9999),',
   'ativo INTEGER NOT NULL CHECK(ativo IN (0,1)),',
   'atualizado_em INTEGER NOT NULL,',
   'PRIMARY KEY(produto_id,distribuidor_id),',
   'UNIQUE(distribuidor_id,sku));',
   'CREATE INDEX IF NOT EXISTS idx_loja_real_ofertas_distribuidores',
   'ON loja_real_ofertas_distribuidores(distribuidor_id,ativo);'
  ].join(' '));
 }
 criarProduto({produtoId,titulo,descricao='',tipo='FISICO'}={}){
  if(!id(produtoId)||typeof titulo!=='string'||
     titulo.trim().length<2||titulo.length>150||
     typeof descricao!=='string'||descricao.length>2000||
     tipo!=='FISICO')erro('PRODUTO_COMERCIAL_INVALIDO');
  const agora=this.agora();
  this.db.prepare([
   'INSERT INTO loja_real_produtos(',
   'produto_id,titulo,descricao,tipo,ativo,criado_em,atualizado_em)',
   'VALUES(?,?,?,?,0,?,?)'
  ].join(' ')).run(produtoId,titulo.trim(),descricao.trim(),tipo,agora,agora);
  return {produtoId,ativo:false,semVendaReal:true};
 }
 vincularOferta({produtoId,distribuidorId,sku,
  precoUnitCentavos,prioridade=100}={}){
  if(!id(produtoId)||!id(distribuidorId)||!id(sku)||
     !Number.isSafeInteger(precoUnitCentavos)||precoUnitCentavos<1||
     precoUnitCentavos>100000000||
     !Number.isSafeInteger(prioridade)||prioridade<1||prioridade>9999)
   erro('OFERTA_COMERCIAL_INVALIDA');
  if(!this.db.prepare(
   'SELECT produto_id FROM loja_real_produtos WHERE produto_id=?'
  ).get(produtoId))erro('PRODUTO_COMERCIAL_NAO_EXISTE');
  // Criar oferta não significa ter contrato, frete ou integração.
  this.db.prepare([
   'INSERT INTO loja_real_ofertas_distribuidores(',
   'produto_id,distribuidor_id,sku,preco_centavos,prioridade,ativo,atualizado_em)',
   'VALUES(?,?,?,?,?,0,?)',
   'ON CONFLICT(produto_id,distribuidor_id) DO UPDATE SET',
   'sku=excluded.sku,preco_centavos=excluded.preco_centavos,',
   'prioridade=excluded.prioridade,ativo=0,',
   'atualizado_em=excluded.atualizado_em'
  ].join(' ')).run(produtoId,distribuidorId,sku,precoUnitCentavos,
   prioridade,this.agora());
  return {produtoId,distribuidorId,ofertaAtiva:false};
 }
 ativarProduto({produtoId,ativo=false}={}){
  if(!id(produtoId)||typeof ativo!=='boolean')
   erro('PRODUTO_COMERCIAL_INVALIDO');
  const r=this.db.prepare(
   'UPDATE loja_real_produtos SET ativo=?,atualizado_em=? WHERE produto_id=?'
  ).run(ativo?1:0,this.agora(),produtoId);
  if(r.changes!==1)erro('PRODUTO_COMERCIAL_NAO_EXISTE');
  return {produtoId,ativo};
 }
 ativarOferta({produtoId,distribuidorId,ativo=false}={}){
  if(!id(produtoId)||!id(distribuidorId)||typeof ativo!=='boolean')
   erro('OFERTA_COMERCIAL_INVALIDA');
  if(ativo&&this.homologado(distribuidorId)!==true)
   erro('DISTRIBUIDOR_SEM_HOMOLOGACAO');
  const r=this.db.prepare([
   'UPDATE loja_real_ofertas_distribuidores',
   'SET ativo=?,atualizado_em=?',
   'WHERE produto_id=? AND distribuidor_id=?'
  ].join(' ')).run(ativo?1:0,this.agora(),produtoId,distribuidorId);
  if(r.changes!==1)erro('OFERTA_COMERCIAL_NAO_EXISTE');
  return {produtoId,distribuidorId,ativo};
 }
 ofertasConfiaveis({produtoId}={}){
  if(!id(produtoId))erro('PRODUTO_COMERCIAL_INVALIDO');
  const p=this.db.prepare([
   'SELECT produto_id,titulo,tipo FROM loja_real_produtos',
   'WHERE produto_id=? AND ativo=1'
  ].join(' ')).get(produtoId);
  if(!p)return null;
  const ofertas=this.db.prepare([
   'SELECT distribuidor_id,sku,preco_centavos,prioridade',
   'FROM loja_real_ofertas_distribuidores',
   'WHERE produto_id=? AND ativo=1',
   'ORDER BY prioridade ASC,distribuidor_id ASC'
  ].join(' ')).all(produtoId).filter(
   x=>this.homologado(x.distribuidor_id)===true
  ).map(x=>({
   distribuidorId:x.distribuidor_id,sku:x.sku,
   precoUnitCentavos:x.preco_centavos,prioridade:x.prioridade
  }));
  return {produtoId:p.produto_id,titulo:p.titulo,tipo:p.tipo,
   ofertas,compravel:ofertas.length>0};
 }
 listarVitrine({limite=50}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100)
   erro('CONSULTA_CATALOGO_INVALIDA');
  return this.db.prepare([
   'SELECT produto_id FROM loja_real_produtos',
   'WHERE ativo=1 ORDER BY titulo ASC,produto_id ASC LIMIT ?'
  ].join(' ')).all(limite).map(x=>
   this.ofertasConfiaveis({produtoId:x.produto_id})
  ).filter(x=>x&&x.compravel).map(x=>({
   produtoId:x.produtoId,titulo:x.titulo,tipo:x.tipo,
   // Não inventar estoque, frete ou disponibilidade comercial de venda.
   precoAPartirDeCentavos:Math.min(...x.ofertas.map(o=>o.precoUnitCentavos)),
   distribuidoresHabilitados:x.ofertas.length,
   estoqueConfirmado:false,
   checkoutReal:false
  }));
 }
}
module.exports={CatalogoMultiDistribuidoresSQLite};
