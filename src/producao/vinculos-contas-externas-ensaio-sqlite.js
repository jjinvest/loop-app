'use strict';
// Vínculos de contas DECLARADOS no ensaio. Não recebe tokens bancários.
// CPF/CNPJ e número de conta são reduzidos a HMAC local com segredo externo.
// Correspondência de dados fornecidos NÃO autentica uma conta junto ao banco.
const {createHmac,createHash}=require('node:crypto');
const TABELAS_VINCULOS_CONTAS_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_vinculos_contas'
]);
const ALIASES=/^(LOOP|LOJA|PAGADOR|COFRES):([A-Z][A-Z0-9_]{1,63})$/;
const ID=/^[A-Za-z0-9_-]{5,120}$/;
const CONTA=/^[A-Za-z0-9_.-]{3,160}$/;
const DOCUMENTO=/^\d{11}(\d{3})?$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const mac=(segredo,x)=>createHmac('sha256',segredo).update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function validarCampos({vinculoId,contaAlias,provedor,contaReferencia,
 documentoTitular,documentoTitularEsperado}={}){
 if(!ID.test(vinculoId||'')||
    typeof contaAlias!=='string'||!ALIASES.test(contaAlias)||
    !ID.test(provedor||'')||provedor!==contaAlias.split(':')[1]||
    !CONTA.test(contaReferencia||'')||
    !DOCUMENTO.test(documentoTitular||'')||
    !DOCUMENTO.test(documentoTitularEsperado||''))
  falha('VINCULO_CONTAS_ENSAIO_DADOS_INVALIDOS');
 if(documentoTitular!==documentoTitularEsperado)
  falha('VINCULO_CONTAS_ENSAIO_TITULAR_DIVERGENTE');
}
class VinculosContasExternasEnsaioSQLite{
 constructor({banco,segredoHmac=null,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('VINCULO_CONTAS_ENSAIO_PROIBIDO_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function'||
     !banco.prepare([
      "SELECT 1 FROM sqlite_master WHERE type='table' AND",
      "name='loop_lab_tesouraria_movimentos'"
     ].join(' ')).get()||
     (segredoHmac!==null&&(!Buffer.isBuffer(segredoHmac)||
      segredoHmac.length!==32)))
   falha('VINCULO_CONTAS_ENSAIO_DEPENDENCIA_INVALIDA');
  this.db=banco;this._segredo=segredoHmac;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_vinculos_contas(',
   'seq INTEGER PRIMARY KEY AUTOINCREMENT,',
   'vinculo_id TEXT NOT NULL UNIQUE,',
   'conta_alias TEXT NOT NULL UNIQUE,',
   'provedor TEXT NOT NULL,',
   'referencia_hmac TEXT NOT NULL,titular_hmac TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_vinculos_contas_no_update',
   'BEFORE UPDATE ON loop_lab_tesouraria_vinculos_contas',
   "BEGIN SELECT RAISE(ABORT,'VINCULO_CONTA_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_vinculos_contas_no_delete',
   'BEFORE DELETE ON loop_lab_tesouraria_vinculos_contas',
   "BEGIN SELECT RAISE(ABORT,'VINCULO_CONTA_IMUTAVEL'); END;"
  ].join(' '));
  this.verificar();
 }
 registrarDeclaracao(args={}){
  if(!this._segredo)
   falha('VINCULO_CONTAS_ENSAIO_SEGREDO_INDISPONIVEL');
  validarCampos(args);
  const referencia=mac(this._segredo,
   'AKITEMM-CONTA-v1:'+args.contaAlias+':'+args.contaReferencia);
  const titular=mac(this._segredo,
   'AKITEMM-TITULAR-v1:'+args.documentoTitular);
  const b=this.db;
  b.exec('BEGIN IMMEDIATE');
  try{
   const antigo=b.prepare([
    'SELECT * FROM loop_lab_tesouraria_vinculos_contas',
    'WHERE vinculo_id=?'
   ].join(' ')).get(args.vinculoId);
   if(antigo){
    if(antigo.conta_alias!==args.contaAlias||
       antigo.provedor!==args.provedor||
       antigo.referencia_hmac!==referencia||
       antigo.titular_hmac!==titular)
     falha('VINCULO_CONTAS_ENSAIO_REPLAY_DIVERGENTE');
    b.exec('COMMIT');
    return Object.freeze({registrado:false,repetido:true,
     contaAutenticada:false,titularidadeBancariaAutenticada:false});
   }
   if(b.prepare([
    'SELECT 1 FROM loop_lab_tesouraria_vinculos_contas',
    'WHERE conta_alias=?'
   ].join(' ')).get(args.contaAlias))
    falha('VINCULO_CONTAS_ENSAIO_ALIAS_JA_CADASTRADO');
   const ultimo=b.prepare([
    'SELECT seq,hash_atual FROM loop_lab_tesouraria_vinculos_contas',
    'ORDER BY seq DESC LIMIT 1'
   ].join(' ')).get();
   const seq=(ultimo?.seq||0)+1,anterior=ultimo?.hash_atual||'GENESE';
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<=0)
    falha('VINCULO_CONTAS_ENSAIO_RELOGIO_INVALIDO');
   const atual=hash([seq,args.vinculoId,args.contaAlias,args.provedor,
    referencia,titular,ts,anterior]);
   b.prepare([
    'INSERT INTO loop_lab_tesouraria_vinculos_contas(',
    'seq,vinculo_id,conta_alias,provedor,referencia_hmac,titular_hmac,',
    'criado_em,hash_anterior,hash_atual) VALUES(?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(seq,args.vinculoId,args.contaAlias,args.provedor,
    referencia,titular,ts,anterior,atual);
   this.verificar();
   b.exec('COMMIT');
   return Object.freeze({registrado:true,repetido:false,
    declaracaoDeTitularConcordante:true,
    contaAutenticada:false,titularidadeBancariaAutenticada:false});
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 verificar(){
  let seq=0,anterior='GENESE';
  for(const v of this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_vinculos_contas ORDER BY seq'
  ].join(' ')).iterate()){
   if(v.seq!==++seq||!ID.test(v.vinculo_id)||
      !ALIASES.test(v.conta_alias)||
      v.provedor!==v.conta_alias.split(':')[1]||
      !hex(v.referencia_hmac)||!hex(v.titular_hmac)||
      !Number.isSafeInteger(v.criado_em)||v.criado_em<=0||
      v.hash_anterior!==anterior||
      v.hash_atual!==hash([v.seq,v.vinculo_id,v.conta_alias,
       v.provedor,v.referencia_hmac,v.titular_hmac,v.criado_em,
       v.hash_anterior]))
    falha('VINCULO_CONTAS_ENSAIO_HISTORICO_INCONSISTENTE');
   anterior=v.hash_atual;
  }
  return Object.freeze({integridade:'OK',vinculosDeclarados:seq,
   fontesBancariasAutenticadas:0});
 }
 diagnosticarExtratosDeclarados(){
  this.verificar();
  const avisos=new Map();
  const registrar=(codigo)=>avisos.set(codigo,(avisos.get(codigo)||0)+1);
  const declarados=new Set(this.db.prepare([
   'SELECT conta_alias FROM loop_lab_tesouraria_vinculos_contas'
  ].join(' ')).all().map(x=>x.conta_alias));
  let movimentosBancarios=0,extratosDeclarados=0,comAlias=0;
  const existentes=new Set();
  for(const e of this.db.prepare([
   'SELECT DISTINCT origem,destino FROM loop_lab_tesouraria_movimentos'
  ].join(' ')).iterate()){
   for(const alias of [e.origem,e.destino]){
    if(typeof alias==='string'&&ALIASES.test(alias))
     existentes.add(alias);
   }
  }
  for(const alias of existentes){
   movimentosBancarios++;
   if(!declarados.has(alias))
    registrar('SEM_CADASTRO_DE_CONTA_DECLARADA');
  }
  for(const e of this.db.prepare([
   'SELECT DISTINCT conta FROM loop_lab_tesouraria_extratos_bancarios'
  ].join(' ')).iterate()){
   extratosDeclarados++;
   if(declarados.has(e.conta))comAlias++;
   else registrar('EXTRATO_SEM_VINCULO_DE_TITULAR');
  }
  return Object.freeze({
   contaVinculadaSomentePorDeclaracao:true,
   contasDeclaradas:declarados.size,
   contasNecessariasPeloLivro:movimentosBancarios,
   contasDosExtratosDeclarados:extratosDeclarados,
   contasExtratoComAlias:comAlias,
   alertas:Object.fromEntries(avisos),
   titularidadeBancariaAutenticada:false,
   contaRealAutenticada:false,
   conformidadeContratualComprovada:false,
   concilicaoRealCertificada:false,
   dinheiroRealLiberado:false
  });
 }
}
module.exports={VinculosContasExternasEnsaioSQLite,
 TABELAS_VINCULOS_CONTAS_ENSAIO};
