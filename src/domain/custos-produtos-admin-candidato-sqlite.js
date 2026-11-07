'use strict';
// CUSTOS INTERNOS por produto do cadastro ADMIN de homologacao.
// Nao sao divulgados a clientes, nao alteram cotacao nem transferem fundos.
// A referencia do LOOP vem da classificacao aprovada, nao de livre digitacao.
const {PISO_VERDE}=require('./plano-posicoes-compra-akitemm');
const ID=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function centavos(v){return Number.isSafeInteger(v)&&v>=0&&v<=100000000;}
const CAMPOS=['custoFornecedorCentavos','freteCustoCentavos',
 'tarifaPspEstimadaCentavos','reservaTributariaEstimadaCentavos'];
class CustosProdutoAdminCandidatoSQLite{
 constructor({banco,catalogo,sinalizacao}={}){
  if(process.env.NODE_ENV==='production')falha('CUSTOS_ADMIN_NAO_HOMOLOGADOS');
  if(typeof banco?.prepare!=='function'||catalogo?.db!==banco||
   sinalizacao?.db!==banco||typeof catalogo?.buscar!=='function'||
   typeof sinalizacao?.consultar!=='function')
   falha('CUSTOS_EXIGEM_SQLITE_UNICO');
  this.db=banco;this.catalogo=catalogo;this.sinalizacao=sinalizacao;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_custos_produtos_admin_lab(',
   'produto_id TEXT PRIMARY KEY,',
   'custo_fornecedor_centavos INTEGER NOT NULL,',
   'frete_centavos INTEGER NOT NULL,',
   'tarifa_psp_estimada_centavos INTEGER NOT NULL,',
   'reserva_tributaria_estimada_centavos INTEGER NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_custos_produtos_admin_historico_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,produto_id TEXT NOT NULL,',
   'revisao INTEGER NOT NULL,antes_json TEXT, depois_json TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,UNIQUE(produto_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS custos_produtos_admin_hist_no_update',
   'BEFORE UPDATE ON akitemm_custos_produtos_admin_historico_lab',
   "BEGIN SELECT RAISE(ABORT,'custo historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS custos_produtos_admin_hist_no_delete',
   'BEFORE DELETE ON akitemm_custos_produtos_admin_historico_lab',
   "BEGIN SELECT RAISE(ABORT,'custo historico imutavel'); END;"
  ].join(' '));
 }
 _id(id){if(typeof id!=='string'||!ID.test(id))falha('PRODUTO_INVALIDO');}
 _atual(id){
  const r=this.db.prepare([
   'SELECT custo_fornecedor_centavos AS custoFornecedorCentavos,',
   'frete_centavos AS freteCustoCentavos,',
   'tarifa_psp_estimada_centavos AS tarifaPspEstimadaCentavos,',
   'reserva_tributaria_estimada_centavos AS reservaTributariaEstimadaCentavos,',
   'revisao FROM akitemm_custos_produtos_admin_lab WHERE produto_id=?'
  ].join(' ')).get(id);
  return r||null;
 }
 async consultar(id){
  this._id(id);
  const produto=await this.catalogo.buscar(id);
  if(!produto)falha('PRODUTO_NAO_ENCONTRADO');
  const cor=this.sinalizacao.consultar(id);
  const atual=this._atual(id);
  const referencia=cor.classificacao==='DOURADO'?PISO_VERDE:
   cor.classificacao==='CINZA'?0:
   cor.classificacao==='ROXO'&&cor.posicoesPorUnidadeRoxo>0?
    cor.posicoesPorUnidadeRoxo*PISO_VERDE:null;
  const receita=produto.precoCentavos;
  const custo=atual?CAMPOS.reduce((s,c)=>s+atual[c],0):null;
  const margem=Number.isSafeInteger(receita)&&referencia!==null&&custo!==null?
   receita-referencia-custo:null;
  return {produtoId:id,classificacao:cor.classificacao,
   quantidadePosicoesPorUnidade:cor.classificacao==='DOURADO'?1:
    cor.classificacao==='ROXO'?cor.posicoesPorUnidadeRoxo:
    cor.classificacao==='CINZA'?0:null,
   precoVendaCentavos:receita,referenciaLoopCentavos:referencia,
   ...(atual?Object.fromEntries(CAMPOS.map(c=>[c,atual[c]])):
    Object.fromEntries(CAMPOS.map(c=>[c,null]))),
   margemComercialEstimadaCentavos:margem,
   somaCustosEstimadosCentavos:custo,
   situacao:atual===null?'CUSTOS_NAO_CADASTRADOS':
    referencia===null?'LOOP_DEPENDE_DO_CARRINHO_OU_EVENTO':
    margem<0?'MARGEM_NEGATIVA_EXIGE_REVISAO':'ESTIMATIVA_CALCULADA',
   revisao:atual?.revisao||0,financeiroReal:false,
   custosInternosSigilosos:true,transferenciaExecutada:false,
   aviso:'Estimativa interna, sem imposto apurado, PSP liquidado ou fornecedor pago.'};
 }
 async salvar(id,entrada){
  this._id(id);
  if(!entrada||typeof entrada!=='object'||Array.isArray(entrada)||
     Object.keys(entrada).sort().join(',')!==
      [...CAMPOS,'revisaoEsperada'].sort().join(',')||
     !Number.isSafeInteger(entrada.revisaoEsperada)||entrada.revisaoEsperada<0||
     CAMPOS.some(c=>!centavos(entrada[c])))
   falha('CUSTOS_DADOS_INVALIDOS');
  const p=await this.catalogo.buscar(id);
  if(!p)falha('PRODUTO_NAO_ENCONTRADO');
  const db=this.db;db.exec('BEGIN IMMEDIATE');
  try{
   const antes=this._atual(id);
   const revisao=antes?.revisao||0;
   if(revisao!==entrada.revisaoEsperada)falha('CUSTOS_CONFLITO_REVISAO');
   const proxima=revisao+1,now=Date.now();
   const vals=CAMPOS.map(c=>entrada[c]);
   db.prepare([
    'INSERT INTO akitemm_custos_produtos_admin_lab',
    '(produto_id,custo_fornecedor_centavos,frete_centavos,',
    'tarifa_psp_estimada_centavos,reserva_tributaria_estimada_centavos,',
    'revisao,atualizado_em) VALUES(?,?,?,?,?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET',
    'custo_fornecedor_centavos=excluded.custo_fornecedor_centavos,',
    'frete_centavos=excluded.frete_centavos,',
    'tarifa_psp_estimada_centavos=excluded.tarifa_psp_estimada_centavos,',
    'reserva_tributaria_estimada_centavos=excluded.reserva_tributaria_estimada_centavos,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(id,...vals,proxima,now);
   const novo=Object.fromEntries(CAMPOS.map(c=>[c,entrada[c]]));
   db.prepare([
    'INSERT INTO akitemm_custos_produtos_admin_historico_lab',
    '(produto_id,revisao,antes_json,depois_json,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(id,proxima,antes?JSON.stringify(antes):null,
    JSON.stringify(novo),now);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return this.consultar(id);
 }
}
module.exports={CustosProdutoAdminCandidatoSQLite};
