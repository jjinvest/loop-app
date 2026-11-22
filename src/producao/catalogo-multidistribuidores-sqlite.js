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
 constructor({banco,distribuidorHomologado,auditoria=null,
  manutencao=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof distribuidorHomologado!=='function'||typeof agora!=='function')
   erro('CATALOGO_REAL_NAO_CONFIGURADO');
  if(auditoria!==null&&
     (typeof auditoria.registrar!=='function'||auditoria.db!==banco))
   erro('AUDITORIA_CATALOGO_NAO_CONFIGURADA');
  if(manutencao!==null&&(!auditoria||manutencao.db!==banco||
     typeof manutencao.garantirOperacaoDisponivel!=='function'))
   erro('MANUTENCAO_CATALOGO_NAO_CONFIGURADA');
  this.db=banco;this.homologado=distribuidorHomologado;
  this.auditoria=auditoria;this.manutencao=manutencao;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_produtos(',
   'produto_id TEXT PRIMARY KEY,titulo TEXT NOT NULL,',
   'descricao TEXT NOT NULL,tipo TEXT NOT NULL',
   "CHECK(tipo IN ('FISICO')),",
   'ativo INTEGER NOT NULL CHECK(ativo IN (0,1)),',
   'arquivado_em INTEGER,',
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
  // Migração aditiva, sem mexer nas mercadorias já cadastradas.
  if(!banco.prepare('PRAGMA table_info(loja_real_produtos)').all()
      .some(col=>col.name==='arquivado_em'))
   banco.exec('ALTER TABLE loja_real_produtos ADD COLUMN arquivado_em INTEGER');
 }
 criarProduto({produtoId,titulo,descricao='',tipo='FISICO'}={}){
  if(!id(produtoId)||typeof titulo!=='string'||
     titulo.trim().length<2||titulo.length>150||
     typeof descricao!=='string'||descricao.length>2000||
     tipo!=='FISICO')erro('PRODUTO_COMERCIAL_INVALIDO');
  const agora=this.agora();
  if(this.auditoria)this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   this.db.prepare([
    'INSERT INTO loja_real_produtos(',
    'produto_id,titulo,descricao,tipo,ativo,criado_em,atualizado_em)',
    'VALUES(?,?,?,?,0,?,?)'
   ].join(' ')).run(produtoId,titulo.trim(),descricao.trim(),tipo,agora,agora);
   if(this.auditoria){
    this.auditoria.registrar({acao:'PRODUTO_CRIADO',ator:'ADMIN_COMERCIAL',
     entidade:'PRODUTO_'+produtoId,antes:{existe:false},
     depois:{existe:true,tipo:'FISICO',ativo:false},revisaoNova:1});
    this.db.exec('COMMIT');
   }
  }catch(e){if(this.auditoria)this.db.exec('ROLLBACK');throw e;}
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
   'SELECT produto_id FROM loja_real_produtos',
   'WHERE produto_id=? AND arquivado_em IS NULL'
  ].join(' ')).get(produtoId))erro('PRODUTO_COMERCIAL_NAO_EXISTE');
  // Criar oferta não significa ter contrato, frete ou integração.
  if(this.auditoria)this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   const anterior=this.db.prepare([
    'SELECT sku,preco_centavos,prioridade,ativo',
    'FROM loja_real_ofertas_distribuidores',
    'WHERE produto_id=? AND distribuidor_id=?'
   ].join(' ')).get(produtoId,distribuidorId);
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
   if(this.auditoria){
    this.auditoria.registrar({acao:'OFERTA_RASCUNHO_CRIADA',
     ator:'ADMIN_COMERCIAL',entidade:produtoId+'__'+distribuidorId,
     antes:anterior?{sku:anterior.sku,precoCentavos:anterior.preco_centavos,
      prioridade:anterior.prioridade,ativo:anterior.ativo===1}:{existe:false},
     depois:{sku,precoCentavos:precoUnitCentavos,prioridade,ativo:false}});
    this.db.exec('COMMIT');
   }
  }catch(e){if(this.auditoria)this.db.exec('ROLLBACK');throw e;}
  return {produtoId,distribuidorId,ofertaAtiva:false};
 }
 ativarProduto({produtoId,ativo=false}={}){
  if(!id(produtoId)||typeof ativo!=='boolean')
   erro('PRODUTO_COMERCIAL_INVALIDO');
  if(this.auditoria)this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   const antes=this.db.prepare(
    'SELECT ativo FROM loja_real_produtos',
    'WHERE produto_id=? AND arquivado_em IS NULL'
   ).get(produtoId);
   const r=this.db.prepare(
    'UPDATE loja_real_produtos SET ativo=?,atualizado_em=?',
    'WHERE produto_id=? AND arquivado_em IS NULL'
   ).run(ativo?1:0,this.agora(),produtoId);
   if(r.changes!==1)erro('PRODUTO_COMERCIAL_NAO_EXISTE');
   if(this.auditoria){
    this.auditoria.registrar({
     acao:'PRODUTO_STATUS_ALTERADO',ator:'ADMIN_COMERCIAL',
     entidade:'PRODUTO_'+produtoId,
     antes:{ativo:antes.ativo===1},depois:{ativo}
    });
    this.db.exec('COMMIT');
   }
   return {produtoId,ativo};
  }catch(e){if(this.auditoria)this.db.exec('ROLLBACK');throw e;}
 }
 ativarOferta({produtoId,distribuidorId,ativo=false}={}){
  if(!id(produtoId)||!id(distribuidorId)||typeof ativo!=='boolean')
   erro('OFERTA_COMERCIAL_INVALIDA');
  if(ativo&&this.homologado(distribuidorId)!==true)
   erro('DISTRIBUIDOR_SEM_HOMOLOGACAO');
  if(this.auditoria)this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   const antes=this.db.prepare([
    'SELECT ativo FROM loja_real_ofertas_distribuidores',
    'WHERE produto_id=? AND distribuidor_id=?'
   ].join(' ')).get(produtoId,distribuidorId);
   const r=this.db.prepare([
    'UPDATE loja_real_ofertas_distribuidores',
    'SET ativo=?,atualizado_em=?',
    'WHERE produto_id=? AND distribuidor_id=?'
   ].join(' ')).run(ativo?1:0,this.agora(),produtoId,distribuidorId);
   if(r.changes!==1)erro('OFERTA_COMERCIAL_NAO_EXISTE');
   if(this.auditoria){
    this.auditoria.registrar({
     acao:'OFERTA_STATUS_ALTERADO',ator:'ADMIN_COMERCIAL',
     entidade:produtoId+'__'+distribuidorId,
     antes:{ativo:antes.ativo===1},depois:{ativo}
    });
    this.db.exec('COMMIT');
   }
   return {produtoId,distribuidorId,ativo};
  }catch(e){if(this.auditoria)this.db.exec('ROLLBACK');throw e;}
 }
 ofertasConfiaveis({produtoId}={}){
  if(!id(produtoId))erro('PRODUTO_COMERCIAL_INVALIDO');
  const p=this.db.prepare([
   'SELECT produto_id,titulo,tipo FROM loja_real_produtos',
   'WHERE produto_id=? AND ativo=1 AND arquivado_em IS NULL'
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
 // A foto armazenada no acervo de mídia pode pertencer a um produto
 // administrativo deste mesmo titular comercial, sem duplicar seu cadastro.
 buscarProdutoAdministrativo({produtoId}={}){
  if(!id(produtoId))erro('PRODUTO_COMERCIAL_INVALIDO');
  const row=this.db.prepare([
   'SELECT produto_id AS produtoId,titulo,descricao,tipo,ativo,',
   'atualizado_em AS revisao',
   'FROM loja_real_produtos WHERE produto_id=? AND arquivado_em IS NULL'
  ].join(' ')).get(produtoId);
  return row?Object.freeze({
   ...row,ativo:row.ativo===1
  }):null;
 }
 atualizarDescricaoProduto({produtoId,titulo,descricao='',revisaoEsperada}={}){
  if(!id(produtoId)||typeof titulo!=='string'||titulo.trim().length<2||
     titulo.length>150||typeof descricao!=='string'||descricao.length>2000||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1)
   erro('PRODUTO_COMERCIAL_INVALIDO');
  if(this.auditoria)this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   const antes=this.buscarProdutoAdministrativo({produtoId});
   if(!antes)erro('PRODUTO_COMERCIAL_NAO_EXISTE');
   if(antes.revisao!==revisaoEsperada)
    erro('PRODUTO_COMERCIAL_CONFLITO_REVISAO');
   const novoTitulo=titulo.trim(),novaDescricao=descricao.trim();
   const revisao=Math.max(this.agora(),antes.revisao+1);
   const x=this.db.prepare([
    'UPDATE loja_real_produtos SET titulo=?,descricao=?,atualizado_em=?',
    'WHERE produto_id=? AND atualizado_em=?'
   ].join(' ')).run(novoTitulo,novaDescricao,revisao,produtoId,revisaoEsperada);
   if(x.changes!==1)erro('PRODUTO_COMERCIAL_CONFLITO_REVISAO');
   if(this.auditoria){
    this.auditoria.registrar({
     acao:'PRODUTO_DESCRICAO_ALTERADA',ator:'ADMIN_COMERCIAL',
     entidade:'PRODUTO_'+produtoId,
     antes:{titulo:antes.titulo,descricao:antes.descricao},
     depois:{titulo:novoTitulo,descricao:novaDescricao}
    });
    this.db.exec('COMMIT');
   }
   return {produtoId,titulo:novoTitulo,descricao:novaDescricao,
    revisao,ativo:antes.ativo};
  }catch(e){
   if(this.auditoria)this.db.exec('ROLLBACK');
   throw e;
  }
 }
 // A lixeira retira somente um produto nunca publicado da vitrine admin.
 // O registro permanece no SQLite para não romper fotos, auditoria ou backups.
 arquivarRascunho({produtoId,revisaoEsperada}={}){
  if(!id(produtoId)||!Number.isSafeInteger(revisaoEsperada)||
     revisaoEsperada<1)erro('RASCUNHO_EXCLUSAO_INVALIDA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   const anterior=this.db.prepare([
    'SELECT produto_id,titulo,ativo,atualizado_em,arquivado_em',
    'FROM loja_real_produtos WHERE produto_id=?'
   ].join(' ')).get(produtoId);
   if(!anterior||anterior.arquivado_em!==null)
    erro('RASCUNHO_NAO_ENCONTRADO');
   if(anterior.ativo!==0)erro('PRODUTO_PUBLICADO_NAO_EXCLUIR');
   if(anterior.atualizado_em!==revisaoEsperada)
    erro('RASCUNHO_CONFLITO_REVISAO');
   // Nunca arquivar produto que foi publicado anteriormente.
   if(this.auditoria&&this.db.prepare([
    "SELECT 1 FROM loja_real_auditoria_admin",
    "WHERE entidade=? AND acao='PRODUTO_STATUS_ALTERADO' LIMIT 1"
   ].join(' ')).get('PRODUTO_'+produtoId))
    erro('PRODUTO_COM_HISTORICO_PUBLICACAO');
   const tabelas=['loja_real_vitrine_posicoes','loja_real_custos_pedido'];
   for(const tabela of tabelas){
    const existe=this.db.prepare([
     "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ].join(' ')).get(tabela);
    if(existe&&this.db.prepare(
     'SELECT 1 FROM '+tabela+' WHERE produto_id=? LIMIT 1'
    ).get(produtoId))erro('PRODUTO_JA_VINCULADO_NAO_EXCLUIR');
   }
   const data=Math.max(this.agora(),anterior.atualizado_em+1);
   const result=this.db.prepare([
    'UPDATE loja_real_produtos',
    'SET arquivado_em=?,atualizado_em=?',
    'WHERE produto_id=? AND ativo=0 AND arquivado_em IS NULL',
    'AND atualizado_em=?'
   ].join(' ')).run(data,data,produtoId,revisaoEsperada);
   if(result.changes!==1)erro('RASCUNHO_CONFLITO_REVISAO');
   if(this.auditoria)this.auditoria.registrar({
    acao:'PRODUTO_RASCUNHO_ARQUIVADO',ator:'ADMIN_COMERCIAL',
    entidade:'PRODUTO_'+produtoId,
    antes:{arquivado:false,ativo:false},
    depois:{arquivado:true,ativo:false}
   });
   this.db.exec('COMMIT');
   return {produtoId,excluido:true,arquivado:true};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 listarProdutosAdministrativos({limite=500}={}){
  if(!Number.isInteger(limite)||limite<1||limite>500)
   erro('CONSULTA_CATALOGO_INVALIDA');
  return this.db.prepare([
   'SELECT p.produto_id AS produtoId,p.titulo,p.descricao,p.tipo,',
   'p.ativo,COUNT(o.distribuidor_id) AS quantidadeDistribuidores',
   'FROM loja_real_produtos p',
   'LEFT JOIN loja_real_ofertas_distribuidores o',
   'ON o.produto_id=p.produto_id',
   'WHERE p.arquivado_em IS NULL',
   'GROUP BY p.produto_id ORDER BY p.titulo,p.produto_id LIMIT ?'
  ].join(' ')).all(limite).map(p=>({
   produtoId:p.produtoId,titulo:p.titulo,descricao:p.descricao,
   tipo:p.tipo,ativo:p.ativo===1,
   quantidadeDistribuidores:p.quantidadeDistribuidores
  }));
 }
 // Pré-vitrine pública somente dos produtos explicitamente publicados
 // pelo administrador. Nunca pressupor preço, estoque ou frete não homologados.
 listarVitrinePreparacao({limite=50}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>400)
   erro('CONSULTA_CATALOGO_INVALIDA');
  const regrasPresentes=!!this.db.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_regras_cor'"
  ].join(' ')).get();
  const temPedidos=['loja_real_pedidos','loja_real_custos_pedido']
   .every(nome=>!!this.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
   ).get(nome));
  const vendas=temPedidos?this.db.prepare([
   'SELECT c.produto_id,SUM(c.quantidade) AS unidades',
   'FROM loja_real_custos_pedido c',
   'JOIN loja_real_pedidos p ON p.pedido_id=c.pedido_id',
   "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
   'AND c.produto_id IS NOT NULL GROUP BY c.produto_id'
  ].join(' ')).all():[];
  const porProduto=new Map(vendas.map(x=>[x.produto_id,x.unidades]));
  const agora=this.agora();
  const rows=this.db.prepare(regrasPresentes?[
   'SELECT p.produto_id,p.titulo,p.descricao,p.tipo,p.criado_em,',
   'COALESCE(r.cor,\'CINZA\') AS cor',
   'FROM loja_real_produtos p LEFT JOIN loop_real_regras_cor r',
   'ON r.produto_id=p.produto_id',
   'WHERE p.ativo=1 AND p.arquivado_em IS NULL',
   'ORDER BY p.titulo,p.produto_id LIMIT ?'
  ].join(' '):[
   "SELECT produto_id,titulo,descricao,tipo,criado_em,'CINZA' AS cor",
   'FROM loja_real_produtos WHERE ativo=1 AND arquivado_em IS NULL',
   'ORDER BY titulo,produto_id LIMIT ?'
  ].join(' ')).all(limite);
  return rows.map(r=>Object.freeze({
   produtoId:r.produto_id,titulo:r.titulo,
   descricao:r.descricao,tipo:r.tipo,cor:r.cor,
   criadoEm:r.criado_em,
    novidade:Number.isSafeInteger(r.criado_em)&&r.criado_em<=agora&&
     r.criado_em>=agora-30*86400000,
    unidadesConfirmadas:porProduto.get(r.produto_id)||0,
   precoCentavos:null,estoqueConfirmado:false,
   compravel:false,checkoutReal:false,
   estado:'AGUARDANDO_HOMOLOGACAO_FORNECEDOR'
  }));
 }
 listarVitrine({limite=50}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100)
   erro('CONSULTA_CATALOGO_INVALIDA');
  return this.db.prepare([
   'SELECT produto_id FROM loja_real_produtos',
   'WHERE ativo=1 AND arquivado_em IS NULL',
   'ORDER BY titulo ASC,produto_id ASC LIMIT ?'
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
