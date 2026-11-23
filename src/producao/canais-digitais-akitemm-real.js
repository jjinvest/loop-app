'use strict';
// Vinculos dos produtos digitais sem depender do provedor de hospedagem.
// Os links de entrega ficam somente no SQLite administrativo e nao conferem
// acesso, pagamento, comissao ou posicao LOOP por si mesmos.
const {isIP}=require('node:net');
const MODOS=Object.freeze({
 PDF:Object.freeze(['PDF_SQLITE_PRIVADO','PDF_R2_PRIVADO']),
 CURSO:Object.freeze(['HOTMART_CLUB','HOSPEDAGEM_PROPRIA','OUTRO_PROVEDOR']),
 AFILIADO:Object.freeze(['HOTMART_AFILIADO','OUTRO_AFILIADO'])
});
const ID=/^[a-z0-9-]{3,80}$/;
const PROVEDOR=/^[A-Z0-9_-]{2,60}$/;
function falha(codigo){const e=Error(codigo);e.codigo=codigo;throw e;}
function validarUrlPrivada(valor){
 if(typeof valor!=='string'||valor.length>1800)falha('DIGITAL_URL_INVALIDA');
 let u;
 try{u=new URL(valor);}catch{falha('DIGITAL_URL_INVALIDA');}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.hash||
    !host.includes('.')||host==='localhost'||host.endsWith('.localhost')||
    host.endsWith('.local')||host.endsWith('.internal')||isIP(host)||
    u.port&&u.port!=='443')falha('DIGITAL_URL_INVALIDA');
 return u.href;
}
class CanaisDigitaisAkitemmReal{
 constructor({banco,catalogo}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof catalogo?.buscar!=='function')
   throw TypeError('BANCO_E_CATALOGO_DIGITAL_OBRIGATORIOS');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_canais_digitais_real(',
   'produto_id TEXT PRIMARY KEY NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,',
   'modo TEXT NOT NULL,provedor TEXT NOT NULL,referencia TEXT NOT NULL,',
   'url_destino TEXT NOT NULL,revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_canais_digitais_historico_real(',
   'sequencia INTEGER PRIMARY KEY AUTOINCREMENT,produto_id TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),antes_json TEXT NOT NULL,',
   'depois_json TEXT NOT NULL,criado_em TEXT NOT NULL,',
   'UNIQUE(produto_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS akitemm_canais_digitais_historico_bloq_update',
   "BEFORE UPDATE ON akitemm_canais_digitais_historico_real",
   "BEGIN SELECT RAISE(ABORT,'DIGITAL_HISTORICO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_canais_digitais_historico_bloq_delete',
   "BEFORE DELETE ON akitemm_canais_digitais_historico_real",
   "BEGIN SELECT RAISE(ABORT,'DIGITAL_HISTORICO_IMUTAVEL'); END;"
  ].join(' '));
 }
 _produto(id){
  if(typeof id!=='string'||!ID.test(id))falha('DIGITAL_PRODUTO_INVALIDO');
  const p=this.catalogo.buscar(id);
  if(!p)falha('DIGITAL_PRODUTO_NAO_ENCONTRADO');
  if(!Object.hasOwn(MODOS,p.tipo))falha('DIGITAL_TIPO_NAO_PERMITIDO');
  return p;
 }
 estado(id){
  this._produto(id);
  const r=this.banco.prepare([
   'SELECT modo,provedor,referencia,url_destino AS urlDestino,',
   'revisao,atualizado_em AS atualizadoEm',
   'FROM akitemm_canais_digitais_real WHERE produto_id=?'
  ].join(' ')).get(id);
  return {produtoId:id,configurado:!!r,modo:r?.modo||null,
   provedor:r?.provedor||null,referencia:r?.referencia||null,
   urlDestino:r?.urlDestino||null,revisao:r?.revisao||0,
   atualizadoEm:r?.atualizadoEm||null,
   entregaAtiva:false,pagamentoReal:false,geraPosicaoLoop:false};
 }
 configurar({produtoId,modo,provedor='',referencia='',urlDestino='',
  revisaoEsperada}={}){
  const p=this._produto(produtoId);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('DIGITAL_REVISAO_INVALIDA');
  if(typeof modo!=='string'||!MODOS[p.tipo].includes(modo))
   falha('DIGITAL_MODO_INCOMPATIVEL');
  if(typeof provedor!=='string'||typeof referencia!=='string'||
     typeof urlDestino!=='string')falha('DIGITAL_CAMPOS_INVALIDOS');
  const proprio=modo==='PDF_SQLITE_PRIVADO'||modo==='PDF_R2_PRIVADO';
  if(proprio){
   if(provedor!==''||referencia!==''||urlDestino!=='')
    falha('DIGITAL_PDF_PRIVADO_NAO_ACEITA_LINK');
  }else{
   if(!PROVEDOR.test(provedor)||referencia.length<2||
      referencia.length>160||/[\x00-\x1f<>]/.test(referencia))
    falha('DIGITAL_REFERENCIA_INVALIDA');
   urlDestino=validarUrlPrivada(urlDestino);
  }
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.estado(produtoId);
   if(anterior.revisao!==revisaoEsperada)falha('DIGITAL_CONFLITO_REVISAO');
   const atual={modo,provedor,referencia,urlDestino};
   const igual=anterior.configurado&&Object.keys(atual)
    .every(chave=>anterior[chave]===atual[chave]);
   if(igual){this.banco.exec('COMMIT');return {...anterior,repetido:true};}
   const revisao=revisaoEsperada+1,agora=new Date().toISOString();
   this.banco.prepare([
    'INSERT INTO akitemm_canais_digitais_real(',
    'produto_id,modo,provedor,referencia,url_destino,revisao,atualizado_em)',
    'VALUES(?,?,?,?,?,?,?) ON CONFLICT(produto_id) DO UPDATE SET',
    'modo=excluded.modo,provedor=excluded.provedor,',
    'referencia=excluded.referencia,url_destino=excluded.url_destino,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,modo,provedor,referencia,urlDestino,revisao,agora);
   const antes=anterior.configurado?{
    modo:anterior.modo,provedor:anterior.provedor,
    referencia:anterior.referencia,urlDestino:anterior.urlDestino
   }:null;
   this.banco.prepare([
    'INSERT INTO akitemm_canais_digitais_historico_real(',
    'produto_id,revisao,antes_json,depois_json,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(produtoId,revisao,JSON.stringify(antes),
    JSON.stringify(atual),agora);
   this.banco.exec('COMMIT');
   return {...this.estado(produtoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={CanaisDigitaisAkitemmReal,MODOS};
