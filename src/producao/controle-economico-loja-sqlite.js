'use strict';
// Custos privados da AKITEMM: venda ao cliente e pagamento ao distribuidor
// são obrigações distintas. Sem alíquotas/tributação presumidos. O catálogo
// público expõe preço de venda, NUNCA custo, margem ou documentos fiscais.
const SKU=/^[A-Za-z0-9_-]{1,80}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const inteiro=(v,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=100000000;
const id=v=>typeof v==='string'&&SKU.test(v);
const bruto=(v)=>v===null?'':String(v);
function excelSeguro(v){
 const s=String(v??'');
 const guarded=/^[=+\-@\t\r]/.test(s)?"'"+s:s;
 return '"'+guarded.replaceAll('"','""')+'"';
}
class ControleEconomicoLojaSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')falha('CONTROLE_ECONOMICO_NAO_CONFIGURADO');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_custos_ofertas(',
   'produto_id TEXT NOT NULL,distribuidor_id TEXT NOT NULL,',
   'sku TEXT NOT NULL,custo_unit_centavos INTEGER NOT NULL',
   'CHECK(custo_unit_centavos>=0),',
   'revisao INTEGER NOT NULL CHECK(revisao>0),',
   'atualizado_em INTEGER NOT NULL,',
   'PRIMARY KEY(produto_id,distribuidor_id));',
   'CREATE TABLE IF NOT EXISTS loja_real_custos_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'produto_id TEXT NOT NULL,distribuidor_id TEXT NOT NULL,',
   'sku TEXT NOT NULL,custo_anterior_centavos INTEGER,',
   'custo_novo_centavos INTEGER NOT NULL,revisao INTEGER NOT NULL,',
   'alterado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loja_real_custos_historico_imutavel_u',
   'BEFORE UPDATE ON loja_real_custos_historico BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loja_real_custos_historico_imutavel_d',
   'BEFORE DELETE ON loja_real_custos_historico BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;",
   'CREATE TABLE IF NOT EXISTS loja_real_revisoes_preco(',
   'produto_id TEXT NOT NULL,distribuidor_id TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'PRIMARY KEY(produto_id,distribuidor_id));',
   'CREATE TABLE IF NOT EXISTS loja_real_precos_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'produto_id TEXT NOT NULL,distribuidor_id TEXT NOT NULL,',
   'sku TEXT NOT NULL,preco_anterior_centavos INTEGER NOT NULL,',
   'preco_novo_centavos INTEGER NOT NULL,revisao INTEGER NOT NULL,',
   'alterado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loja_real_precos_historico_imutavel_u',
   'BEFORE UPDATE ON loja_real_precos_historico BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loja_real_precos_historico_imutavel_d',
   'BEFORE DELETE ON loja_real_precos_historico BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;"
  ].join(' '));
 }
 _oferta(produtoId,distribuidorId){
  return this.db.prepare([
   'SELECT produto_id,distribuidor_id,sku,preco_centavos,ativo',
   'FROM loja_real_ofertas_distribuidores',
   'WHERE produto_id=? AND distribuidor_id=?'
  ].join(' ')).get(produtoId,distribuidorId);
 }
 definirCusto({produtoId,distribuidorId,custoUnitCentavos,
  revisaoEsperada=0}={}){
  if(!id(produtoId)||!id(distribuidorId)||
     !inteiro(custoUnitCentavos)||!inteiro(revisaoEsperada))
   falha('CUSTO_FORNECEDOR_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const oferta=this._oferta(produtoId,distribuidorId);
   if(!oferta)falha('OFERTA_NAO_EXISTE');
   const atual=this.db.prepare([
    'SELECT custo_unit_centavos,revisao',
    'FROM loja_real_custos_ofertas',
    'WHERE produto_id=? AND distribuidor_id=?'
   ].join(' ')).get(produtoId,distribuidorId);
   if((atual?.revisao||0)!==revisaoEsperada)
    falha('REVISAO_CUSTO_EM_CONFLITO');
   const revisao=revisaoEsperada+1,ts=this.agora();
   this.db.prepare([
    'INSERT INTO loja_real_custos_ofertas(',
    'produto_id,distribuidor_id,sku,custo_unit_centavos,revisao,atualizado_em)',
    'VALUES(?,?,?,?,?,?) ON CONFLICT(produto_id,distribuidor_id)',
    'DO UPDATE SET sku=excluded.sku,custo_unit_centavos=excluded.custo_unit_centavos,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,distribuidorId,oferta.sku,
    custoUnitCentavos,revisao,ts);
   this.db.prepare([
    'INSERT INTO loja_real_custos_historico(',
    'produto_id,distribuidor_id,sku,custo_anterior_centavos,',
    'custo_novo_centavos,revisao,alterado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,distribuidorId,oferta.sku,
    atual?.custo_unit_centavos??null,custoUnitCentavos,revisao,ts);
   this.db.exec('COMMIT');
   return this.consultarOferta({produtoId,distribuidorId});
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 atualizarPrecoVenda({produtoId,distribuidorId,precoVendaCentavos,
  precoAnteriorCentavos,revisaoPrecoEsperada}={}){
  if(!id(produtoId)||!id(distribuidorId)||
     !inteiro(precoVendaCentavos,1)||
     !inteiro(precoAnteriorCentavos,1)||
     !inteiro(revisaoPrecoEsperada))
   falha('PRECO_VENDA_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const oferta=this._oferta(produtoId,distribuidorId);
   if(!oferta)falha('OFERTA_NAO_EXISTE');
   const atual=this.db.prepare([
    'SELECT revisao FROM loja_real_revisoes_preco',
    'WHERE produto_id=? AND distribuidor_id=?'
   ].join(' ')).get(produtoId,distribuidorId);
   if((atual?.revisao||0)!==revisaoPrecoEsperada||
      oferta.preco_centavos!==precoAnteriorCentavos)
    falha('REVISAO_PRECO_EM_CONFLITO');
   const ts=this.agora(),revisao=revisaoPrecoEsperada+1;
   const mudanca=this.db.prepare([
    'UPDATE loja_real_ofertas_distribuidores',
    'SET preco_centavos=?,atualizado_em=?',
    'WHERE produto_id=? AND distribuidor_id=? AND preco_centavos=?'
   ].join(' ')).run(precoVendaCentavos,ts,produtoId,distribuidorId,
    precoAnteriorCentavos);
   if(mudanca.changes!==1)falha('REVISAO_PRECO_EM_CONFLITO');
   this.db.prepare([
    'INSERT INTO loja_real_revisoes_preco(',
    'produto_id,distribuidor_id,revisao) VALUES(?,?,?)',
    'ON CONFLICT(produto_id,distribuidor_id)',
    'DO UPDATE SET revisao=excluded.revisao'
   ].join(' ')).run(produtoId,distribuidorId,revisao);
   this.db.prepare([
    'INSERT INTO loja_real_precos_historico(',
    'produto_id,distribuidor_id,sku,preco_anterior_centavos,',
    'preco_novo_centavos,revisao,alterado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,distribuidorId,oferta.sku,
    precoAnteriorCentavos,precoVendaCentavos,revisao,ts);
   this.db.exec('COMMIT');
   return this.consultarOferta({produtoId,distribuidorId});
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 consultarOferta({produtoId,distribuidorId}={}){
  if(!id(produtoId)||!id(distribuidorId))
   falha('OFERTA_INVALIDA');
  const oferta=this._oferta(produtoId,distribuidorId);
  if(!oferta)return null;
  const custos=this.db.prepare([
   'SELECT custo_unit_centavos,revisao,atualizado_em',
   'FROM loja_real_custos_ofertas',
   'WHERE produto_id=? AND distribuidor_id=?'
  ].join(' ')).get(produtoId,distribuidorId);
  const revisaoPreco=this.db.prepare([
   'SELECT revisao FROM loja_real_revisoes_preco',
   'WHERE produto_id=? AND distribuidor_id=?'
  ].join(' ')).get(produtoId,distribuidorId)?.revisao||0;
  const preco=oferta.preco_centavos;
  const custo=custos?.custo_unit_centavos??null;
  const margemBruta=custo===null?null:preco-custo;
  return {produtoId,distribuidorId,sku:oferta.sku,
   precoVendaCentavos:preco,custoFornecedorCentavos:custo,
   diferencaBrutaCentavos:margemBruta,
   // Este valor NÃO é lucro; não considera frete, PSP, impostos,
   // encargos, estornos, comissões, reserva ou operação do LOOP.
   lucroLiquidoCalculado:false,
   tributosApurados:false,ativo:oferta.ativo===1,
   revisaoCusto:custos?.revisao||0,revisaoPreco};
 }
 listarOfertas({limite=100}={}){
  if(!Number.isInteger(limite)||limite<1||limite>500)
   falha('PAGINACAO_INVALIDA');
  const linhas=this.db.prepare([
   'SELECT produto_id,distribuidor_id FROM loja_real_ofertas_distribuidores',
   'ORDER BY produto_id,distribuidor_id LIMIT ?'
  ].join(' ')).all(limite);
  return linhas.map(x=>this.consultarOferta({
   produtoId:x.produto_id,distribuidorId:x.distribuidor_id
  }));
 }
 csvContador({limite=500}={}){
  const linhas=this.listarOfertas({limite});
  const cabecalho=[
   'Produto_ID','Distribuidor_ID','SKU',
   'Preco_de_venda_R$','Custo_fornecedor_R$',
   'Diferenca_bruta_R$','Tributos_apurados','Lucro_liquido_apurado',
   'Revisao_do_custo'
  ];
  const dinheiro=n=>n===null?'':(n/100).toFixed(2).replace('.',',');
  return [cabecalho,...linhas.map(x=>[
   x.produtoId,x.distribuidorId,x.sku,
   dinheiro(x.precoVendaCentavos),dinheiro(x.custoFornecedorCentavos),
   dinheiro(x.diferencaBrutaCentavos),
   'NAO','NAO',x.revisaoCusto
  ])].map(cols=>cols.map(excelSeguro).join(';')).join('\r\n')+'\r\n';
 }
}
module.exports={ControleEconomicoLojaSQLite};
