'use strict';
// Conciliação multibancos SOMENTE de declaracoes de extratos de laboratorio.
// A origem nao e autenticada; jamais certifica deposito, Pix, split ou caixa real.
const {createHash}=require('node:crypto');
const TABELAS_CONCILIACAO_BANCOS_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_extratos_bancarios'
]);
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const CONTA=/^(LOOP|LOJA|PAGADOR|COFRES):[A-Za-z0-9_-]{1,120}$/;
const VALOR=n=>Number.isSafeInteger(n)&&n>0&&n<=1e12;
const TIPOS=new Set(['CREDITO','DEBITO','REVERSAO']);
const assinar=d=>createHash('sha256').update(JSON.stringify(d)).digest('hex');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function camposValidos(x){
 return x&&typeof x==='object'&&!Array.isArray(x)&&
  ID.test(x.evidenciaId||'')&&ID.test(x.banco||'')&&
  CONTA.test(x.conta||'')&&ID.test(x.movimentoId||'')&&
  TIPOS.has(x.tipo)&&VALOR(x.valorCentavos)&&
  (x.tipo==='REVERSAO'?
   ID.test(x.reversaoDe||''):x.reversaoDe==null);
}
function chave(movimento,conta,tipo){
 return [movimento,conta,tipo].join('|');
}
function contaBancaria(c){
 return typeof c==='string'&&CONTA.test(c);
}
class ConciliacaoMultibancosEnsaioSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('CONCILIACAO_BANCO_ENSAIO_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    typeof agora!=='function'||!banco.prepare(
     "SELECT name FROM sqlite_master WHERE type='table' AND name='loop_lab_tesouraria_movimentos'"
    ).get())
   falha('CONCILIACAO_BANCO_ENSAIO_REQUER_LIVRO_UNIFICADO');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_extratos_bancarios(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,evidencia_id TEXT NOT NULL UNIQUE,',
   'banco TEXT NOT NULL,conta TEXT NOT NULL,movimento_id TEXT NOT NULL,',
   "tipo TEXT NOT NULL CHECK(tipo IN ('CREDITO','DEBITO','REVERSAO')),",
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'reversao_de TEXT,registrado_em INTEGER NOT NULL,',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_extratos_bancarios_immut_u',
   'BEFORE UPDATE ON loop_lab_tesouraria_extratos_bancarios',
   "BEGIN SELECT RAISE(ABORT,'EXTRATO_ENSAIO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_extratos_bancarios_immut_d',
   'BEFORE DELETE ON loop_lab_tesouraria_extratos_bancarios',
   "BEGIN SELECT RAISE(ABORT,'EXTRATO_ENSAIO_IMUTAVEL'); END;"
  ].join(' '));
  this.verificar();
 }
 _transacao(f){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const r=f();this.verificar();this.db.exec('COMMIT');return r;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _hora(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)
   falha('CONCILIACAO_BANCO_ENSAIO_RELOGIO_INVALIDO');
  return ts;
 }
 registrarExtratoDeclarado(x={}){
  if(!camposValidos(x))
   falha('CONCILIACAO_BANCO_ENSAIO_EXTRATO_INVALIDO');
  return this._transacao(()=>{
   const anterior=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_extratos_bancarios',
    'WHERE evidencia_id=?'
   ].join(' ')).get(x.evidenciaId);
   if(anterior){
    if(anterior.banco!==x.banco||anterior.conta!==x.conta||
       anterior.movimento_id!==x.movimentoId||
       anterior.tipo!==x.tipo||
       anterior.valor_centavos!==x.valorCentavos||
       (anterior.reversao_de||null)!==(x.reversaoDe||null))
     falha('CONCILIACAO_BANCO_ENSAIO_REPLAY_DIVERGENTE');
    return {registrado:false,repetido:true,financeiroReal:false};
   }
   if(x.tipo==='REVERSAO'){
    const origem=this.db.prepare([
     'SELECT * FROM loop_lab_tesouraria_extratos_bancarios',
     'WHERE evidencia_id=?'
    ].join(' ')).get(x.reversaoDe);
    if(!origem||origem.tipo==='REVERSAO'||
       origem.banco!==x.banco||origem.conta!==x.conta||
       origem.movimento_id!==x.movimentoId||
       x.valorCentavos>origem.valor_centavos)
     falha('CONCILIACAO_BANCO_ENSAIO_REVERSAO_INVALIDA');
    const somado=this.db.prepare([
     'SELECT COALESCE(SUM(valor_centavos),0) AS total',
     'FROM loop_lab_tesouraria_extratos_bancarios',
     "WHERE tipo='REVERSAO' AND reversao_de=?"
    ].join(' ')).get(x.reversaoDe).total;
    if(!Number.isSafeInteger(somado+x.valorCentavos)||
       somado+x.valorCentavos>origem.valor_centavos)
     falha('CONCILIACAO_BANCO_ENSAIO_REVERSAO_EXCESSIVA');
   }
   const last=this.db.prepare([
    'SELECT id,hash_atual FROM loop_lab_tesouraria_extratos_bancarios',
    'ORDER BY id DESC LIMIT 1'
   ].join(' ')).get();
   const id=(last?.id||0)+1,prev=last?.hash_atual||'GENESE',
    hora=this._hora();
   const dados=[id,x.evidenciaId,x.banco,x.conta,x.movimentoId,
    x.tipo,x.valorCentavos,x.reversaoDe||null,hora,prev];
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_extratos_bancarios(',
    'id,evidencia_id,banco,conta,movimento_id,tipo,valor_centavos,',
    'reversao_de,registrado_em,hash_anterior,hash_atual)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(id,x.evidenciaId,x.banco,x.conta,x.movimentoId,
    x.tipo,x.valorCentavos,x.reversaoDe||null,hora,prev,assinar(dados));
   return {registrado:true,repetido:false,financeiroReal:false,
    saldoExternoRealComprovado:false};
  });
 }
 verificar(){
  let prev='GENESE',seq=0;
  const anteriores=new Map(),reversoes=new Map();
  for(const e of this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_extratos_bancarios ORDER BY id'
  ].join(' ')).iterate()){
   if(!camposValidos({
    evidenciaId:e.evidencia_id,banco:e.banco,conta:e.conta,
    movimentoId:e.movimento_id,tipo:e.tipo,
    valorCentavos:e.valor_centavos,reversaoDe:e.reversao_de
   })||e.id!==++seq||!Number.isSafeInteger(e.registrado_em)||
     e.registrado_em<=0||e.hash_anterior!==prev||
     e.hash_atual!==assinar([
      e.id,e.evidencia_id,e.banco,e.conta,e.movimento_id,
      e.tipo,e.valor_centavos,e.reversao_de,e.registrado_em,e.hash_anterior
     ]))
    falha('CONCILIACAO_BANCO_ENSAIO_HISTORICO_ADULTERADO');
   if(e.tipo==='REVERSAO'){
    const base=anteriores.get(e.reversao_de);
    if(!base||base.tipo==='REVERSAO'||base.banco!==e.banco||
       base.conta!==e.conta||base.movimento_id!==e.movimento_id)
     falha('CONCILIACAO_BANCO_ENSAIO_REVERSAO_ADULTERADA');
    const v=(reversoes.get(e.reversao_de)||0)+e.valor_centavos;
    if(!Number.isSafeInteger(v)||v>base.valor_centavos)
     falha('CONCILIACAO_BANCO_ENSAIO_REVERSAO_EXCESSIVA');
    reversoes.set(e.reversao_de,v);
   }
   anteriores.set(e.evidencia_id,e);prev=e.hash_atual;
  }
  return {integridade:'OK',totalEvidencias:seq,financeiroReal:false};
 }
 analisar(){
  this.verificar();
  const esperado=new Map();
  const provas=new Map(),revertidos=new Set();
  let totais=0,divergencias=0;
  const codigos=new Map(),amostras=[];
  const avisar=(codigo,ref)=>{
   divergencias++;codigos.set(codigo,(codigos.get(codigo)||0)+1);
   if(amostras.length<30)amostras.push({codigo,referencia:ref});
  };
  // Cada perna bancaria do livro e cobrada separadamente; dinheiro em PSP
  // interno e em transito nao equivale a extrato independente de banco.
  for(const m of this.db.prepare([
   'SELECT operacao_id,origem,destino,centavos',
   'FROM loop_lab_tesouraria_movimentos ORDER BY id'
  ].join(' ')).iterate()){
   for(const [conta,tipo] of [[m.origem,'DEBITO'],[m.destino,'CREDITO']]){
    if(!contaBancaria(conta))continue;
    const k=chave(m.operacao_id,conta,tipo);
    if(esperado.has(k))falha('CONCILIACAO_BANCO_ENSAIO_LIVRO_DUPLICADO');
    esperado.set(k,{conta,tipo,movimentoId:m.operacao_id,
     banco:conta.split(':')[1],centavos:m.centavos});
    totais++;
   }
  }
  for(const e of this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_extratos_bancarios ORDER BY id'
  ].join(' ')).iterate()){
   if(e.tipo==='REVERSAO'){revertidos.add(e.reversao_de);continue;}
   const k=chave(e.movimento_id,e.conta,e.tipo);
   const previsto=esperado.get(k);
   if(!previsto){avisar('EXTRATO_SEM_MOVIMENTO_COMPATIVEL',e.evidencia_id);continue;}
   if(provas.has(k)){
    avisar('LANCAMENTO_BANCARIO_DUPLICADO',e.evidencia_id);continue;
   }
   provas.set(k,e);
   if(e.banco!==previsto.banco)
    avisar('BANCO_DIVERGENTE',e.evidencia_id);
   if(e.valor_centavos!==previsto.centavos)
    avisar('VALOR_BANCARIO_DIVERGENTE',e.evidencia_id);
  }
  let conferidas=0;
  for(const [k,previsto] of esperado){
   const e=provas.get(k);
   if(!e){
    avisar('MOVIMENTO_SEM_EXTRATO',previsto.movimentoId);
    continue;
   }
   if(revertidos.has(e.evidencia_id)){
    avisar('MOVIMENTO_BANCARIO_REVERTIDO',e.evidencia_id);
    continue;
   }
   if(e.banco===previsto.banco&&e.valor_centavos===previsto.centavos)
    conferidas++;
  }
  return {
   modo:'EXTRATOS_DECLARADOS_SEM_AUTENTICACAO',
   movimentosBancariosEsperados:totais,
   movimentosComDeclaracoesConcordantes:conferidas,
   totalDivergencias:divergencias,
   divergenciasPorCodigo:Object.fromEntries(codigos),
   amostraDivergencias:amostras,
   todasDeclaracoesCoincidem:divergencias===0,
   extratosExternosAutenticados:false,
   titularidadeBancariaComprovada:false,
   dinheiroRealMovimentado:false,
   conciliacaoRealCertificada:false,
   creditoOuSaqueRealLiberado:false,
   rotacaoDeBancoAutorizada:false
  };
 }
}
module.exports={ConciliacaoMultibancosEnsaioSQLite,
 TABELAS_CONCILIACAO_BANCOS_ENSAIO};
