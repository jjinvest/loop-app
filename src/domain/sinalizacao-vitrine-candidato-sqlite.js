'use strict';
// Sinalização VISUAL da vitrine aprovada, apenas para homologação local.
// NÃO é fonte de elegibilidade financeira, direito a posição ou evento real.
const ID=/^[a-z0-9-]{3,80}$/;
const CLASSES=new Set(['CINZA','VERDE','EVENTO']);
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validar(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||
  Object.keys(x).sort().join(',')!==
  'classificacao,quantidadeMinimaLoop,revisaoEsperada')
  fail('CAMPOS_SINALIZACAO_INVALIDOS');
 if(!CLASSES.has(x.classificacao))fail('COR_VITRINE_INVALIDA');
 if(!Number.isSafeInteger(x.quantidadeMinimaLoop)||
    x.quantidadeMinimaLoop<1||x.quantidadeMinimaLoop>50)
  fail('QUANTIDADE_MINIMA_INVALIDA');
 if(!Number.isSafeInteger(x.revisaoEsperada)||x.revisaoEsperada<0)
  fail('REVISAO_INVALIDA');
 if(x.classificacao==='CINZA'&&x.quantidadeMinimaLoop!==1)
  fail('COR_NEUTRA_SEM_REGRAS_LOOP');
 return x;
}
class SinalizacaoVitrineCandidatoSQLite{
 constructor({banco,catalogo}={}){
  if(process.env.NODE_ENV==='production')fail('SINALIZACAO_LAB_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     catalogo?.db!==banco||typeof catalogo.buscar!=='function')
   fail('CATALOGO_INTEGRADO_OBRIGATORIO');
  this.db=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_vitrine_sinalizacao_staging(',
   'produto_id TEXT PRIMARY KEY,classificacao TEXT NOT NULL',
   "CHECK(classificacao IN ('CINZA','VERDE','EVENTO')),",
   'quantidade_minima INTEGER NOT NULL CHECK(quantidade_minima BETWEEN 1 AND 50),',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_vitrine_sinalizacao_historico_staging(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,produto_id TEXT NOT NULL',
   'REFERENCES akitemm_vitrine_sinalizacao_staging(produto_id),',
   'revisao INTEGER NOT NULL,antes_json TEXT NOT NULL,',
   'depois_json TEXT NOT NULL,criado_em INTEGER NOT NULL,',
   'UNIQUE(produto_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS vitrine_sinal_hist_no_update',
   'BEFORE UPDATE ON akitemm_vitrine_sinalizacao_historico_staging',
   "BEGIN SELECT RAISE(ABORT,'historico vitrine imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS vitrine_sinal_hist_no_delete',
   'BEFORE DELETE ON akitemm_vitrine_sinalizacao_historico_staging',
   "BEGIN SELECT RAISE(ABORT,'historico vitrine imutavel'); END;"
  ].join(' '));
 }
 consultar(id){
  if(typeof id!=='string'||!ID.test(id))fail('PRODUTO_INVALIDO');
  const row=this.db.prepare(
   'SELECT classificacao,quantidade_minima AS quantidadeMinimaLoop,'+
   ' revisao,atualizado_em AS atualizadoEm FROM akitemm_vitrine_sinalizacao_staging WHERE produto_id=?'
  ).get(id);
  return {produtoId:id,classificacao:row?.classificacao||'CINZA',
   quantidadeMinimaLoop:row?.quantidadeMinimaLoop||1,
   revisao:row?.revisao||0,atualizadoEm:row?.atualizadoEm||null,
   apenasSinalizacao:true,beneficioRealHabilitado:false};
 }
 async atualizar(id,entrada){
  if(typeof id!=='string'||!ID.test(id))fail('PRODUTO_INVALIDO');
  validar(entrada);
  const p=await this.catalogo.buscar(id);
  if(!p)fail('PRODUTO_NAO_ENCONTRADO');
  const antigo=this.consultar(id);
  if(antigo.revisao!==entrada.revisaoEsperada)fail('CONFLITO_REVISAO');
  const novo={produtoId:id,classificacao:entrada.classificacao,
   quantidadeMinimaLoop:entrada.quantidadeMinimaLoop};
  const now=Date.now(),db=this.db;
  db.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar(id);
   if(atual.revisao!==entrada.revisaoEsperada)fail('CONFLITO_REVISAO');
   const rev=atual.revisao+1;
   if(rev===1){
    db.prepare([
     'INSERT INTO akitemm_vitrine_sinalizacao_staging',
     '(produto_id,classificacao,quantidade_minima,revisao,atualizado_em)',
     'VALUES(?,?,?,?,?)'
    ].join(' ')).run(id,novo.classificacao,novo.quantidadeMinimaLoop,1,now);
   }else{
    db.prepare([
     'UPDATE akitemm_vitrine_sinalizacao_staging',
     'SET classificacao=?,quantidade_minima=?,revisao=?,atualizado_em=? WHERE produto_id=?'
    ].join(' ')).run(novo.classificacao,novo.quantidadeMinimaLoop,rev,now,id);
   }
   db.prepare([
    'INSERT INTO akitemm_vitrine_sinalizacao_historico_staging',
    '(produto_id,revisao,antes_json,depois_json,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(id,rev,JSON.stringify(atual),JSON.stringify(novo),now);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return this.consultar(id);
 }
 historico(id){
  if(typeof id!=='string'||!ID.test(id))fail('PRODUTO_INVALIDO');
  return this.db.prepare([
   'SELECT revisao,antes_json AS antesJson,depois_json AS depoisJson,',
   'criado_em AS criadoEm FROM akitemm_vitrine_sinalizacao_historico_staging',
   'WHERE produto_id=? ORDER BY revisao DESC LIMIT 100'
  ].join(' ')).all(id).map(r=>({revisao:r.revisao,criadoEm:r.criadoEm,
   antes:JSON.parse(r.antesJson),depois:JSON.parse(r.depoisJson)}));
 }
 decorar(p){
  const s=this.consultar(p.id);
  const classe=s.classificacao;
  return {produtoId:p.id,nome:p.nome,descricao:p.descricao,
   precoCentavos:p.precoCentavos,tipo:p.tipo,fotos:p.fotos,
   detalhes:p.detalhes,novidade:false,quantidadeVendida:0,
   elegivelLoop:classe==='VERDE',
   quantidadeMinimaLoop:s.quantidadeMinimaLoop,
   // EVENTO é apenas decoração local até regras, datas e autorização formal.
   // Não inventar quantidade de posições nem evento no motor.
   eventoId:null,posicoesPorPedidoLoop:0,
   classeVisual:classe,
   fotoSomenteSeAutorizada:true,somenteLaboratorio:true};
 }
}
module.exports={SinalizacaoVitrineCandidatoSQLite};
