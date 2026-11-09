'use strict';
// Histórico de observações externas de SANDBOX no MESMO SQLite de ensaio.
// GET de PSP não é prova de liquidação bancária: nunca gera saques, saldo,
// posição ou expedição. Deduplicação persistente e cadeia de hash auditável.
const {createHash}=require('node:crypto');
const {
 conferirCobrancaSandbox,conferirSaqueSandbox
}=require('./conferencia-observacoes-psp');
const TABELAS_OBSERVACOES_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_compromissos_psp',
 'loop_lab_tesouraria_observacoes_psp'
]);
const ID=/^[A-Za-z0-9_-]{5,120}$/;
const TIPOS=new Set(['COBRANCA','PIX']);
const VALOR=n=>Number.isSafeInteger(n)&&n>0&&n<=1e12;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarBase(banco){
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
  falha('OBSERVACOES_ENSAIO_SQLITE_OBRIGATORIO');
 for(const t of ['loja_real_pedidos','loop_lab_tesouraria_saques']){
  if(!banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(t))falha('OBSERVACOES_ENSAIO_EXIGE_TESOURARIA_UNIFICADA');
 }
}
class ObservacoesPSPEnsaioSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('OBSERVACOES_PSP_ENSAIO_PROIBIDAS_EM_PRODUCAO');
  validarBase(banco);
  if(typeof agora!=='function')falha('OBSERVACOES_ENSAIO_RELOGIO_INVALIDO');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_compromissos_psp(',
   "tipo TEXT NOT NULL CHECK(tipo IN ('COBRANCA','PIX')),",
   'referencia TEXT NOT NULL,operacao_id TEXT NOT NULL,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'criado_em INTEGER NOT NULL,',
   'PRIMARY KEY(tipo,referencia),UNIQUE(tipo,operacao_id));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_observacoes_psp(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'observacao_id TEXT NOT NULL UNIQUE,',
   'tipo TEXT NOT NULL,referencia TEXT NOT NULL,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'estado TEXT NOT NULL,criado_em INTEGER NOT NULL,',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL,',
   'FOREIGN KEY(tipo,referencia) REFERENCES',
   'loop_lab_tesouraria_compromissos_psp(tipo,referencia)',
   'ON DELETE RESTRICT);',
   ...TABELAS_OBSERVACOES_ENSAIO.flatMap(t=>[
    'CREATE TRIGGER IF NOT EXISTS '+t+'_immut_u BEFORE UPDATE ON '+t+
     " BEGIN SELECT RAISE(ABORT,'OBSERVACAO_IMUTAVEL'); END;",
    'CREATE TRIGGER IF NOT EXISTS '+t+'_immut_d BEFORE DELETE ON '+t+
     " BEGIN SELECT RAISE(ABORT,'OBSERVACAO_IMUTAVEL'); END;"
   ])
  ].join(' '));
  this.verificar();
 }
 _agora(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)
   falha('OBSERVACOES_ENSAIO_RELOGIO_INVALIDO');
  return ts;
 }
 _tx(f){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const v=f();
   this.verificar();
   this.db.exec('COMMIT');
   return v;
  }catch(e){
   this.db.exec('ROLLBACK');throw e;
  }
 }
 _validar({tipo,referencia,operacaoId,valorCentavos}={}){
  if(!TIPOS.has(tipo)||!ID.test(referencia||'')||
     !ID.test(operacaoId||'')||!VALOR(valorCentavos))
   falha('OBSERVACOES_ENSAIO_COMPROMISSO_INVALIDO');
 }
 _origem(tipo,operacaoId,referencia){
  if(tipo==='COBRANCA'){
   return this.db.prepare([
    'SELECT pagamento_id,valor_total_centavos AS centavos',
    'FROM loja_real_pedidos WHERE pedido_id=?'
   ].join(' ')).get(operacaoId);
  }
  // Um saque pode ter uma tentativa FALHOU e outra posterior, sem perder
  // a referencia anterior. O campo ativo de saque pode virar NULL.
  return this.db.prepare([
   'SELECT t.tentativa_id,t.centavos FROM loop_lab_tesouraria_tentativas t',
   'JOIN loop_lab_tesouraria_saques s ON s.saque_id=t.saque_id',
   'WHERE s.saque_id=? AND t.tentativa_id=?'
  ].join(' ')).get(operacaoId,referencia);
 }
 registrarCompromisso({tipo,referencia,operacaoId,valorCentavos}={}){
  this._validar({tipo,referencia,operacaoId,valorCentavos});
  return this._tx(()=>{
   const origem=this._origem(tipo,operacaoId,referencia);
   if(!origem||origem.centavos!==valorCentavos||
      (tipo==='COBRANCA'&&origem.pagamento_id!==referencia)||
      (tipo==='PIX'&&origem.tentativa_id!==referencia))
    falha('OBSERVACOES_ENSAIO_ORIGEM_DIVERGENTE');
   const anterior=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_compromissos_psp',
    'WHERE tipo=? AND referencia=?'
   ].join(' ')).get(tipo,referencia);
   if(anterior){
    if(anterior.operacao_id!==operacaoId||
       anterior.valor_centavos!==valorCentavos)
     falha('OBSERVACOES_ENSAIO_REPLAY_DIVERGENTE');
    return {registrado:false,repetido:true,financeiroReal:false};
   }
   const outro=this.db.prepare([
    'SELECT 1 FROM loop_lab_tesouraria_compromissos_psp',
    'WHERE tipo=? AND operacao_id=?'
   ].join(' ')).get(tipo,operacaoId);
   if(outro)falha('OBSERVACOES_ENSAIO_OPERACAO_DUPLICADA');
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_compromissos_psp',
    '(tipo,referencia,operacao_id,valor_centavos,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(tipo,referencia,operacaoId,valorCentavos,this._agora());
   return {registrado:true,repetido:false,financeiroReal:false};
  });
 }
 registrarObservacao({observacaoId,tipo,referencia,observado}={}){
  if(!ID.test(observacaoId||'')||!TIPOS.has(tipo)||
     !ID.test(referencia||''))
   falha('OBSERVACOES_ENSAIO_OBSERVACAO_INVALIDA');
  // Conferência usa contrato de retorno do adaptador, não dados de webhook.
  return this._tx(()=>{
   const comp=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_compromissos_psp',
    'WHERE tipo=? AND referencia=?'
   ].join(' ')).get(tipo,referencia);
   if(!comp)falha('OBSERVACOES_ENSAIO_SEM_COMPROMISSO');
   const estado=tipo==='COBRANCA'?
    conferirCobrancaSandbox({
     compromisso:{pagamentoId:referencia,valorCentavos:comp.valor_centavos},
     observado
    }).estado:
    conferirSaqueSandbox({
     compromisso:{transferenciaId:referencia,valorCentavos:comp.valor_centavos},
     observado
    }).estado;
   const antigo=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_observacoes_psp',
    'WHERE observacao_id=?'
   ].join(' ')).get(observacaoId);
   if(antigo){
    if(antigo.tipo!==tipo||antigo.referencia!==referencia||
       antigo.valor_centavos!==comp.valor_centavos||
       antigo.estado!==estado)
     falha('OBSERVACOES_ENSAIO_OBSERVACAO_REPLAY_DIVERGENTE');
    return {registrado:false,repetido:true,estado,
     financeiroReal:false,permiteReenvio:false};
   }
   const last=this.db.prepare([
    'SELECT id,hash_atual FROM loop_lab_tesouraria_observacoes_psp',
    'ORDER BY id DESC LIMIT 1'
   ].join(' ')).get();
   const prox=(last?.id||0)+1,prev=last?.hash_atual||'GENESE';
   const ts=this._agora();
   const dados=[prox,observacaoId,tipo,referencia,
    comp.valor_centavos,estado,ts,prev];
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_observacoes_psp',
    '(id,observacao_id,tipo,referencia,valor_centavos,estado,',
    'criado_em,hash_anterior,hash_atual) VALUES(?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(prox,observacaoId,tipo,referencia,
    comp.valor_centavos,estado,ts,prev,hash(dados));
   return {registrado:true,repetido:false,estado,
    financeiroReal:false,permiteReenvio:false,
    saldoRealConfirmado:false};
  });
 }
 consultarCompromisso({tipo,referencia}={}){
  if(!TIPOS.has(tipo)||!ID.test(referencia||''))
   falha('OBSERVACOES_ENSAIO_CONSULTA_INVALIDA');
  this.verificar();
  const comp=this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_compromissos_psp',
   'WHERE tipo=? AND referencia=?'
  ].join(' ')).get(tipo,referencia);
  if(!comp)return null;
  const ultimo=this.db.prepare([
   'SELECT estado,criado_em FROM loop_lab_tesouraria_observacoes_psp',
   'WHERE tipo=? AND referencia=? ORDER BY id DESC LIMIT 1'
  ].join(' ')).get(tipo,referencia);
  return {tipo,referencia,valorCentavos:comp.valor_centavos,
   operacaoId:comp.operacao_id,ultimaObservacao:ultimo?.estado||null,
   proximaAcao:'RECONCILIACAO_BANCARIA_INDEPENDENTE',
   pagamentoRealHabilitado:false,reenviarAutomaticamente:false};
 }
 verificar(){
  const banco=this.db;
  const tabelas=TABELAS_OBSERVACOES_ENSAIO;
  if(tabelas.some(t=>!banco.prepare([
   'SELECT 1 FROM sqlite_master WHERE type=? AND name=?'
  ].join(' ')).get('table',t)))
   falha('OBSERVACOES_ENSAIO_ESQUEMA_INCOMPLETO');
  let totalComp=0,obs=0,seq=0,prev='GENESE';
  for(const c of banco.prepare([
   'SELECT * FROM loop_lab_tesouraria_compromissos_psp'
  ].join(' ')).iterate()){
   totalComp++;
   this._validar({tipo:c.tipo,referencia:c.referencia,
    operacaoId:c.operacao_id,valorCentavos:c.valor_centavos});
   const origem=this._origem(c.tipo,c.operacao_id,c.referencia);
   if(!origem||origem.centavos!==c.valor_centavos||
      (c.tipo==='COBRANCA'&&origem.pagamento_id!==c.referencia)||
      (c.tipo==='PIX'&&origem.tentativa_id!==c.referencia))
    falha('OBSERVACOES_ENSAIO_COMPROMISSO_ADULTERADO');
  }
  for(const o of banco.prepare([
   'SELECT * FROM loop_lab_tesouraria_observacoes_psp ORDER BY id'
  ].join(' ')).iterate()){
   obs++;
   if(o.id!==++seq||!ID.test(o.observacao_id||'')||
      !TIPOS.has(o.tipo)||!ID.test(o.referencia||'')||
      !VALOR(o.valor_centavos)||!Number.isSafeInteger(o.criado_em)||
      o.criado_em<=0||typeof o.estado!=='string'||
      !/^[A-Z_]{5,90}$/.test(o.estado)||o.hash_anterior!==prev||
      o.hash_atual!==hash([o.id,o.observacao_id,o.tipo,o.referencia,
       o.valor_centavos,o.estado,o.criado_em,o.hash_anterior]))
    falha('OBSERVACOES_ENSAIO_LIVRO_ADULTERADO');
   const c=banco.prepare([
    'SELECT valor_centavos FROM loop_lab_tesouraria_compromissos_psp',
    'WHERE tipo=? AND referencia=?'
   ].join(' ')).get(o.tipo,o.referencia);
   if(!c||c.valor_centavos!==o.valor_centavos)
    falha('OBSERVACOES_ENSAIO_VALOR_ADULTERADO');
   prev=o.hash_atual;
  }
  return {integridade:'OK',compromissos:totalComp,observacoes:obs,
   financeiroReal:false,comprovantesBancariosReais:0};
 }
}
async function consultarERegistrarObservacaoAsaasSandbox({
 caixa,adaptador,tipo,referencia,observacaoId
}={}){
 if(!caixa||typeof caixa.consultarCompromisso!=='function'||
    typeof caixa.registrarObservacao!=='function'||
    !adaptador||!TIPOS.has(tipo)||!ID.test(referencia||'')||
    !ID.test(observacaoId||''))
  falha('OBSERVACOES_ENSAIO_CONECTOR_INVALIDO');
 const comp=caixa.consultarCompromisso({tipo,referencia});
 if(!comp)falha('OBSERVACOES_ENSAIO_SEM_COMPROMISSO');
 const metodo=tipo==='COBRANCA'?'consultarCobranca':'consultarPix';
 if(typeof adaptador[metodo]!=='function')
  falha('OBSERVACOES_ENSAIO_CONECTOR_INCOMPLETO');
 // Unica chamada, nenhuma repeticao em queda/timeout.
 const observado=await adaptador[metodo](referencia);
 return caixa.registrarObservacao({observacaoId,tipo,referencia,observado});
}
module.exports={ObservacoesPSPEnsaioSQLite,
 TABELAS_OBSERVACOES_ENSAIO,consultarERegistrarObservacaoAsaasSandbox};
