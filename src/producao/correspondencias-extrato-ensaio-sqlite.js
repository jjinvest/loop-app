'use strict';
// Referencia cruzada entre extrato Asaas SANDBOX e livro de ensaio.
// ID e valor precisam coincidir no mesmo alias e na mesma direcao.
// Relacao manual com evidencias de teste NAO certifica extrato bancario.
const {createHash}=require('node:crypto');
const TABELAS_VINCULOS_TRANSACOES_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_correspondencias_extrato'
]);
const ID=/^[A-Za-z0-9_-]{5,120}$/;
const ALIAS=/^(PSP|PAGADOR):ASAAS$/;
const SHA=/^[a-f0-9]{64}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function verificarArgs({ligacaoId,contaAlias,transacaoId,operacaoId}={}){
 if(!ID.test(ligacaoId||'')||!ALIAS.test(contaAlias||'')||
    !ID.test(transacaoId||'')||!ID.test(operacaoId||''))
  falha('CORRESPONDENCIA_EXTRATO_PARAMETROS_INVALIDOS');
}
class CorrespondenciasExtratoEnsaioSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('CORRESPONDENCIA_EXTRATO_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')
   falha('CORRESPONDENCIA_EXTRATO_BANCO_INVALIDO');
  for(const t of ['loop_lab_tesouraria_movimentos',
   'loop_lab_tesouraria_lotes_extrato',
   'loop_lab_tesouraria_itens_extrato',
   'loop_lab_tesouraria_vinculos_contas']){
   if(!banco.prepare(
    'SELECT 1 FROM sqlite_master WHERE type=? AND name=?'
   ).get('table',t))
    falha('CORRESPONDENCIA_EXTRATO_BASE_INCOMPLETA');
  }
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_correspondencias_extrato(',
   'seq INTEGER PRIMARY KEY AUTOINCREMENT,',
   'ligacao_id TEXT NOT NULL UNIQUE,',
   'conta_alias TEXT NOT NULL,transacao_id TEXT NOT NULL,',
   'operacao_id TEXT NOT NULL,centavos_assinados INTEGER NOT NULL,',
   'digest_item TEXT NOT NULL,criado_em INTEGER NOT NULL,',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL,',
   'UNIQUE(conta_alias,transacao_id),',
   'UNIQUE(conta_alias,operacao_id));',
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_correspondencias_extrato_no_update',
   'BEFORE UPDATE ON loop_lab_tesouraria_correspondencias_extrato',
   "BEGIN SELECT RAISE(ABORT,'CORRESPONDENCIA_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lab_tesouraria_correspondencias_extrato_no_delete',
   'BEFORE DELETE ON loop_lab_tesouraria_correspondencias_extrato',
   "BEGIN SELECT RAISE(ABORT,'CORRESPONDENCIA_IMUTAVEL'); END;"
  ].join(' '));
  this.verificar();
 }
 _resolver(contaAlias,transacaoId,operacaoId){
  const contas=this.db.prepare([
   'SELECT 1 FROM loop_lab_tesouraria_vinculos_contas',
   'WHERE conta_alias=?'
  ].join(' ')).get(contaAlias);
  if(!contas)falha('CORRESPONDENCIA_SEM_VINCULO_CONTA');
  const extra=this.db.prepare([
   'SELECT DISTINCT i.tipo,i.centavos,i.classificacao,i.digest',
   'FROM loop_lab_tesouraria_itens_extrato i',
   'JOIN loop_lab_tesouraria_lotes_extrato l',
   'ON l.consulta_id=i.consulta_id',
   'WHERE l.conta_alias=? AND i.transacao_id=?'
  ].join(' ')).all(contaAlias,transacaoId);
  if(extra.length!==1||extra[0].classificacao!=='SOMENTE_EXTRATO_SANDBOX'||
     !SHA.test(extra[0].digest))
   falha('CORRESPONDENCIA_EXTRATO_NAO_CONFIAVEL');
  const m=this.db.prepare([
   'SELECT origem,destino,centavos FROM loop_lab_tesouraria_movimentos',
   'WHERE operacao_id=?'
  ].join(' ')).get(operacaoId);
  if(!m||!Number.isSafeInteger(m.centavos)||m.centavos<=0||
     (m.origem===contaAlias&&m.destino===contaAlias)||
     (m.origem!==contaAlias&&m.destino!==contaAlias))
   falha('CORRESPONDENCIA_LIVRO_SEM_OPERACAO_COMPATIVEL');
  const esperado=m.destino===contaAlias?m.centavos:-m.centavos;
  if(!Number.isSafeInteger(extra[0].centavos)||
     extra[0].centavos!==esperado)
   falha('CORRESPONDENCIA_EXTRATO_DIRECAO_OU_VALOR_DIVERGENTE');
  return {centavos:esperado,digest:extra[0].digest};
 }
 registrarVinculo(args={}){
  verificarArgs(args);
  const {ligacaoId,contaAlias,transacaoId,operacaoId}=args;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_correspondencias_extrato',
    'WHERE ligacao_id=?'
   ].join(' ')).get(ligacaoId);
   const p=this._resolver(contaAlias,transacaoId,operacaoId);
   if(anterior){
    if(anterior.conta_alias!==contaAlias||
       anterior.transacao_id!==transacaoId||
       anterior.operacao_id!==operacaoId||
       anterior.centavos_assinados!==p.centavos||
       anterior.digest_item!==p.digest)
     falha('CORRESPONDENCIA_EXTRATO_REPLAY_DIVERGENTE');
    this.db.exec('COMMIT');
    return {registrado:false,repetido:true,financeiroReal:false};
   }
   const ja=this.db.prepare([
    'SELECT 1 FROM loop_lab_tesouraria_correspondencias_extrato',
    'WHERE conta_alias=? AND (transacao_id=? OR operacao_id=?)'
   ].join(' ')).get(contaAlias,transacaoId,operacaoId);
   if(ja)falha('CORRESPONDENCIA_EXTRATO_ATRIBUICAO_DUPLA');
   const last=this.db.prepare([
    'SELECT seq,hash_atual FROM loop_lab_tesouraria_correspondencias_extrato',
    'ORDER BY seq DESC LIMIT 1'
   ].join(' ')).get();
   const seq=(last?.seq||0)+1,prev=last?.hash_atual||'GENESE';
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<=0)
    falha('CORRESPONDENCIA_EXTRATO_RELOGIO_INVALIDO');
   const digest=hash([seq,ligacaoId,contaAlias,transacaoId,operacaoId,
    p.centavos,p.digest,ts,prev]);
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_correspondencias_extrato(',
    'seq,ligacao_id,conta_alias,transacao_id,operacao_id,',
    'centavos_assinados,digest_item,criado_em,hash_anterior,hash_atual)',
    'VALUES(?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(seq,ligacaoId,contaAlias,transacaoId,operacaoId,
    p.centavos,p.digest,ts,prev,digest);
   this.verificar();
   this.db.exec('COMMIT');
   return {registrado:true,repetido:false,
    referenciaDeclaradaConferidaNoEnsaio:true,
    titularidadeAutenticada:false,recebimentoRealLiberado:false,
    saqueRealLiberado:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 verificar(){
  let seq=0,prev='GENESE';
  for(const r of this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_correspondencias_extrato',
   'ORDER BY seq'
  ].join(' ')).iterate()){
   if(r.seq!==++seq||!ID.test(r.ligacao_id)||
      !ALIAS.test(r.conta_alias)||
      !ID.test(r.transacao_id)||!ID.test(r.operacao_id)||
      r.hash_anterior!==prev||
      r.hash_atual!==hash([r.seq,r.ligacao_id,r.conta_alias,
       r.transacao_id,r.operacao_id,r.centavos_assinados,
       r.digest_item,r.criado_em,r.hash_anterior]))
    falha('CORRESPONDENCIA_EXTRATO_HISTORICO_ADULTERADO');
   const vinculo=this._resolver(r.conta_alias,r.transacao_id,r.operacao_id);
   if(vinculo.centavos!==r.centavos_assinados||
      vinculo.digest!==r.digest_item)
    falha('CORRESPONDENCIA_EXTRATO_ORIGEM_DIVERGENTE');
   prev=r.hash_atual;
  }
  return {integridade:'OK',correspondencias:seq,
   liquidacoesReaisComprovadas:0,saquesReaisLiberados:false};
 }
 diagnosticar(){
  const ver=this.verificar();
  const total=this.db.prepare([
   'SELECT COUNT(*) AS n FROM loop_lab_tesouraria_itens_extrato'
  ].join(' ')).get().n;
  const ligados=this.db.prepare([
   'SELECT COUNT(DISTINCT conta_alias||char(31)||transacao_id) AS n',
   'FROM loop_lab_tesouraria_correspondencias_extrato'
  ].join(' ')).get().n;
  return {...ver,itensRecebidosDasConsultas:total,
   itensComCorrespondenciaDeclarada:ligados,
   comprovacaoExternaAutenticada:false,
   conciliacaoRealCertificada:false,financeiroReal:false};
 }
}
module.exports={CorrespondenciasExtratoEnsaioSQLite,
 TABELAS_VINCULOS_TRANSACOES_ENSAIO};
