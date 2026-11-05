'use strict';
// Sinalização VISUAL da vitrine aprovada, apenas para homologação local.
// NÃO é fonte de elegibilidade financeira, direito a posição ou evento real.
const {planejarPosicoesCompraAkitemm}=require('./plano-posicoes-compra-akitemm');
const ID=/^[a-z0-9-]{3,80}$/;
const CLASSES=new Set(['CINZA','VERDE','DOURADO','ROXO','EVENTO']); // EVENTO legado = ROXO
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validar(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||
  !['classificacao,quantidadeMinimaLoop,revisaoEsperada',
   'classificacao,posicoesPorUnidadeRoxo,quantidadeMinimaLoop,revisaoEsperada']
   .includes(Object.keys(x).sort().join(',')))
  fail('CAMPOS_SINALIZACAO_INVALIDOS');
 if(!CLASSES.has(x.classificacao))fail('COR_VITRINE_INVALIDA');
 if(!Number.isSafeInteger(x.quantidadeMinimaLoop)||
    x.quantidadeMinimaLoop<1||x.quantidadeMinimaLoop>50)
  fail('QUANTIDADE_MINIMA_INVALIDA');
 if(!Number.isSafeInteger(x.revisaoEsperada)||x.revisaoEsperada<0)
  fail('REVISAO_INVALIDA');
 if(x.classificacao==='CINZA'&&x.quantidadeMinimaLoop!==1)
  fail('COR_NEUTRA_SEM_REGRAS_LOOP');
 if(['DOURADO','ROXO','EVENTO'].includes(x.classificacao)&&x.quantidadeMinimaLoop!==1)
  fail('PRODUTO_ESPECIAL_QUANTIDADE_MINIMA_UM');
 if(x.posicoesPorUnidadeRoxo!==undefined&&
  (!['ROXO','EVENTO'].includes(x.classificacao)||
   !Number.isSafeInteger(x.posicoesPorUnidadeRoxo)||
   x.posicoesPorUnidadeRoxo<0||x.posicoesPorUnidadeRoxo>10))
  fail('CONFIGURACAO_ROXO_INVALIDA');
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
   // A tabela original tem CHECK de tres cores; sobrepor uma V2 transacional
   // preserva as versoes/historicos/volumes SQLite existentes sem rebuild.
   'CREATE TABLE IF NOT EXISTS akitemm_vitrine_cores_v2_staging(',
   'produto_id TEXT PRIMARY KEY REFERENCES akitemm_vitrine_sinalizacao_staging(produto_id)',
   "ON DELETE RESTRICT,classificacao TEXT NOT NULL CHECK(classificacao IN ('CINZA','VERDE','DOURADO','ROXO')) ,",
   'revisao INTEGER NOT NULL CHECK(revisao>=1));',
   'CREATE TABLE IF NOT EXISTS akitemm_vitrine_evento_roxo_staging(',
   'produto_id TEXT PRIMARY KEY REFERENCES akitemm_vitrine_sinalizacao_staging(produto_id)',
   'ON DELETE RESTRICT,posicoes_por_unidade INTEGER NOT NULL',
   'CHECK(posicoes_por_unidade BETWEEN 1 AND 10),revisao INTEGER NOT NULL);',
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
   "BEGIN SELECT RAISE(ABORT,'historico vitrine imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS akitemm_vitrine_fotografia_classificacao_prepedido(',
   'prepedido_id TEXT PRIMARY KEY REFERENCES akitemm_checkout_prepedidos_staging(prepedido_id)',
   'ON DELETE RESTRICT,titular_id TEXT NOT NULL,fotografia_json TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS akitemm_foto_class_no_update BEFORE UPDATE',
   'ON akitemm_vitrine_fotografia_classificacao_prepedido',
   "BEGIN SELECT RAISE(ABORT,'fotografia historica imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_foto_class_no_delete BEFORE DELETE',
   'ON akitemm_vitrine_fotografia_classificacao_prepedido',
   "BEGIN SELECT RAISE(ABORT,'fotografia historica imutavel'); END;"
  ].join(' '));
 }
 consultar(id){
  if(typeof id!=='string'||!ID.test(id))fail('PRODUTO_INVALIDO');
  const row=this.db.prepare(
   'SELECT classificacao,quantidade_minima AS quantidadeMinimaLoop,'+
   ' revisao,atualizado_em AS atualizadoEm FROM akitemm_vitrine_sinalizacao_staging WHERE produto_id=?'
  ).get(id);
  const nova=row?this.db.prepare('SELECT classificacao,revisao FROM akitemm_vitrine_cores_v2_staging WHERE produto_id=?').get(id):null;
  if(nova&&nova.revisao!==row.revisao)fail('REVISAO_COR_V2_INCONSISTENTE');
  const classe=nova?.classificacao||(row?.classificacao==='EVENTO'?'ROXO':row?.classificacao)||'CINZA';
  const evento=classe==='ROXO'?this.db.prepare('SELECT posicoes_por_unidade AS quantidade,revisao FROM akitemm_vitrine_evento_roxo_staging WHERE produto_id=?').get(id):null;
  if(evento&&evento.revisao!==row.revisao)fail('REVISAO_EVENTO_INCONSISTENTE');
  return {produtoId:id,classificacao:classe,
   posicoesPorUnidadeRoxo:evento?.quantidade||0,
   quantidadeMinimaLoop:row?.quantidadeMinimaLoop||1,
   revisao:row?.revisao||0,atualizadoEm:row?.atualizadoEm||null,
   apenasSinalizacao:true,beneficioRealHabilitado:false};
 }
 async atualizar(id,entrada){
  if(typeof id!=='string'||!ID.test(id))fail('PRODUTO_INVALIDO');
  validar(entrada);
  const p=await this.catalogo.buscar(id);
  if(!p)fail('PRODUTO_NAO_ENCONTRADO');
  const classe=entrada.classificacao==='EVENTO'?'ROXO':entrada.classificacao;
  if(classe==='DOURADO'&&p.precoCentavos<25000)fail('DOURADO_EXIGE_VALOR_MINIMO_DO_PRODUTO');
  const antigo=this.consultar(id);
  if(antigo.revisao!==entrada.revisaoEsperada)fail('CONFLITO_REVISAO');
  const novo={produtoId:id,classificacao:classe,
   posicoesPorUnidadeRoxo:classe==='ROXO'?(entrada.posicoesPorUnidadeRoxo||0):0,
   quantidadeMinimaLoop:entrada.quantidadeMinimaLoop};
  const legado=classe==='ROXO'?'EVENTO':classe==='DOURADO'?'VERDE':classe;
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
    ].join(' ')).run(id,legado,novo.quantidadeMinimaLoop,1,now);
   }else{
    db.prepare([
     'UPDATE akitemm_vitrine_sinalizacao_staging',
     'SET classificacao=?,quantidade_minima=?,revisao=?,atualizado_em=? WHERE produto_id=?'
    ].join(' ')).run(legado,novo.quantidadeMinimaLoop,rev,now,id);
   }
   db.prepare([
    'INSERT INTO akitemm_vitrine_cores_v2_staging',
    '(produto_id,classificacao,revisao) VALUES(?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET classificacao=excluded.classificacao,revisao=excluded.revisao'
   ].join(' ')).run(id,classe,rev);
   db.prepare('DELETE FROM akitemm_vitrine_evento_roxo_staging WHERE produto_id=?').run(id);
   if(classe==='ROXO'&&novo.posicoesPorUnidadeRoxo>0)
    db.prepare('INSERT INTO akitemm_vitrine_evento_roxo_staging(produto_id,posicoes_por_unidade,revisao) VALUES(?,?,?)')
     .run(id,novo.posicoesPorUnidadeRoxo,rev);
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
 gravarFotografiaPrepedido({prepedidoId,titularId,itens,totalCentavos,criadoEm}={}){
  if(process.env.NODE_ENV==='production')fail('FOTOGRAFIA_NAO_HOMOLOGADA');
  if(typeof prepedidoId!=='string'||!/^hom-[a-f0-9-]{36}$/.test(prepedidoId)||
     typeof titularId!=='string'||!/^[A-Za-z0-9_-]{6,80}$/.test(titularId)||
     !Number.isSafeInteger(totalCentavos)||totalCentavos<=0||
     !Array.isArray(itens)||itens.length===0||itens.length>20||
     typeof criadoEm!=='string'||!Number.isFinite(Date.parse(criadoEm)))
   fail('FOTOGRAFIA_INVALIDA');
  let total=0,verde=0,evento=false;
  const fotografiaItens=[];
  for(const p of itens){
   if(!p||typeof p.produtoId!=='string'||!ID.test(p.produtoId)||
      !Number.isSafeInteger(p.quantidade)||p.quantidade<1||p.quantidade>50||
      !Number.isSafeInteger(p.precoUnitarioCentavos)||p.precoUnitarioCentavos<=0||
      !Number.isSafeInteger(p.subtotalCentavos)||
      p.subtotalCentavos!==p.quantidade*p.precoUnitarioCentavos)
    fail('FOTOGRAFIA_ITEM_INVALIDO');
   const s=this.consultar(p.produtoId);
   const apto=s.classificacao==='VERDE'&&p.quantidade>=s.quantidadeMinimaLoop;
   total+=p.subtotalCentavos;
   if(apto)verde+=p.subtotalCentavos;
   if(s.classificacao==='ROXO')evento=true;
   fotografiaItens.push({produtoId:p.produtoId,quantidade:p.quantidade,
    precoUnitarioCentavos:p.precoUnitarioCentavos,
    subtotalCentavos:p.subtotalCentavos,classificacao:s.classificacao,
    minimo:s.quantidadeMinimaLoop,revisao:s.revisao,verdeApto:apto,
    posicoesPorUnidadeRoxo:s.posicoesPorUnidadeRoxo});
  }
  if(total!==totalCentavos)fail('FOTOGRAFIA_TOTAL_DIVERGENTE');
  const planejamentoPosicoes=planejarPosicoesCompraAkitemm(fotografiaItens);
  const snap={prepedidoId,titularId,criadoEm,totalCentavos,
   valorVerdeConsideradoCentavos:verde,referenciaVerdeAtingida:verde>=25000,
   eventoPendente:evento&&planejamentoPosicoes.pendenciasConfiguracaoRoxo>0,
   podeSimularFilaBAzul:planejamentoPosicoes.podeVincularEnsaio,
   planejamentoPosicoes,
   itens:fotografiaItens,somenteLaboratorio:true,direitosCriados:0};
  this.db.prepare([
   'INSERT INTO akitemm_vitrine_fotografia_classificacao_prepedido',
   '(prepedido_id,titular_id,fotografia_json) VALUES(?,?,?)'
  ].join(' ')).run(prepedidoId,titularId,JSON.stringify(snap));
  return snap;
 }
 consultarFotografiaPrepedido({prepedidoId,titularId=null}={}){
  if(typeof prepedidoId!=='string'||!/^hom-[a-f0-9-]{36}$/.test(prepedidoId))
   fail('PREPEDIDO_INVALIDO');
  if(titularId!==null&&(typeof titularId!=='string'||
     !/^[A-Za-z0-9_-]{6,80}$/.test(titularId)))fail('TITULAR_INVALIDO');
  const row=this.db.prepare([
   'SELECT fotografia_json FROM akitemm_vitrine_fotografia_classificacao_prepedido',
   'WHERE prepedido_id=?',...(titularId!==null?['AND titular_id=?']:[])
  ].join(' ')).get(...(titularId===null?[prepedidoId]:[prepedidoId,titularId]));
  return row?JSON.parse(row.fotografia_json):null;
 }
 decorar(p){
  const s=this.consultar(p.id);
  const classe=s.classificacao;
  return {produtoId:p.id,nome:p.nome,descricao:p.descricao,
   precoCentavos:p.precoCentavos,tipo:p.tipo,fotos:p.fotos,
   detalhes:p.detalhes,novidade:false,quantidadeVendida:0,
   elegivelLoop:classe==='VERDE'||classe==='DOURADO',
   quantidadeMinimaLoop:s.quantidadeMinimaLoop,
   // ROXO é apenas decoração local até regras, datas e autorização formal.
   // Não inventar quantidade de posições nem evento no motor.
   eventoId:null,posicoesPorPedidoLoop:classe==='ROXO'?s.posicoesPorUnidadeRoxo:0,
   classeVisual:classe,
   fotoSomenteSeAutorizada:true,somenteLaboratorio:true};
 }
}
module.exports={SinalizacaoVitrineCandidatoSQLite};
