'use strict';
// Confirmacao apenas em ensaio: nao verifica CPF em base externa nem gera direitos.
const {createHmac}=require('node:crypto');
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const PEDIDO=/^[A-Za-z0-9_-]{3,120}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function cpfValido(cpf){
 if(typeof cpf!=='string'||!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;
 const d=[...cpf].map(Number);
 for(let n=9;n<=10;n++){
  const soma=d.slice(0,n).reduce((total,v,i)=>total+v*(n+1-i),0);
  const calc=(soma*10)%11;
  if(d[n]!==((calc===10)?0:calc))return false;
 }
 return true;
}
class AceitePosicaoAzulEnsaioSQLite{
 static TABELAS=Object.freeze([
  'loop_real_aceites_posicao_ensaio','loop_real_reversoes_promocao_ensaio'
 ]);
 constructor({banco,chaveCpfEnsaio=null,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')falha('AZUL_ENSAIO_PROIBIDO_PRODUCAO');
  if(!banco||typeof banco.prepare!=='function'||typeof agora!=='function'||
     (chaveCpfEnsaio!==null&&
      (!Buffer.isBuffer(chaveCpfEnsaio)||chaveCpfEnsaio.length!==32)))
   falha('AZUL_ENSAIO_CUSTODIA_INVALIDA');
  this.db=banco;this.chave=chaveCpfEnsaio;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_aceites_posicao_ensaio(',
   'posicao_id INTEGER PRIMARY KEY CHECK(posicao_id>0),',
   'pedido_id TEXT NOT NULL REFERENCES loop_real_promocoes_pedido_ensaio(pedido_id)',
   'ON DELETE RESTRICT,titular_id TEXT NOT NULL REFERENCES loop_real_contas(id)',
   'ON DELETE RESTRICT,cpf_hmac TEXT NOT NULL,termos_versao TEXT NOT NULL,',
   'termos_hash TEXT NOT NULL,criado_em INTEGER NOT NULL CHECK(criado_em>0));',
   'CREATE TRIGGER IF NOT EXISTS azul_aceite_no_update',
   'BEFORE UPDATE ON loop_real_aceites_posicao_ensaio',
   "BEGIN SELECT RAISE(ABORT,'ACEITE_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS azul_aceite_no_delete',
   'BEFORE DELETE ON loop_real_aceites_posicao_ensaio',
   "BEGIN SELECT RAISE(ABORT,'ACEITE_IMUTAVEL'); END;",
   'CREATE TABLE IF NOT EXISTS loop_real_reversoes_promocao_ensaio(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loop_real_promocoes_pedido_ensaio(pedido_id)',
   'ON DELETE RESTRICT,titular_id TEXT NOT NULL,posicao_id INTEGER NOT NULL,',
   'registrado_em INTEGER NOT NULL CHECK(registrado_em>0));',
   'CREATE TRIGGER IF NOT EXISTS azul_reversao_no_update',
   'BEFORE UPDATE ON loop_real_reversoes_promocao_ensaio',
   "BEGIN SELECT RAISE(ABORT,'REVERSAO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS azul_reversao_no_delete',
   'BEFORE DELETE ON loop_real_reversoes_promocao_ensaio',
   "BEGIN SELECT RAISE(ABORT,'REVERSAO_IMUTAVEL'); END;"
  ].join(' '));
 }
 _trocar({pedidoId,titularId,posicaoId,anterior,novo}){
  const linha=this.db.prepare('SELECT snapshot FROM loop_real_motor_estado WHERE id=1').get();
  if(this.db.isTransaction!==true||!linha)falha('AZUL_SNAPSHOT_TRANSACAO_OBRIGATORIA');
  const s=JSON.parse(linha.snapshot);
  const posicoes=[...s.filas.filaA,...s.filas.filaB,s.tabuleiro.centro,
   ...s.tabuleiro.vagas].filter(Boolean);
  const pos=posicoes.find(p=>p.id===posicaoId);
  const idx=s.filas.vendasRegistradas.find(x=>x[0]===pedidoId)?.[1];
  if(!pos||!idx||idx.id!==posicaoId||
     pos.participanteId!==titularId||idx.participanteId!==titularId||
     pos.statusAdesao!==anterior||idx.statusAdesao!==anterior)
   falha('AZUL_SNAPSHOT_DIVERGENTE');
  if(novo==='ACEITE_ENSAIO'&&!s.filas.filaB.some(p=>p.id===posicaoId))
   falha('AZUL_FORA_DA_ESPERA');
  pos.statusAdesao=novo;idx.statusAdesao=novo;
  if(novo==='REVISAR_PSP')s.catraca.aberta=false;
  this.db.prepare(
   'UPDATE loop_real_motor_estado SET revisao=revisao+1,snapshot=? WHERE id=1'
  ).run(JSON.stringify(s));
 }
 confirmar({titularId,posicaoId,cpf,versaoTermos,hashTermos,
  aceiteExplicito=false}={}){
  if(process.env.NODE_ENV==='production')falha('AZUL_ENSAIO_PROIBIDO_PRODUCAO');
  if(!this.chave)falha('AZUL_CPF_ENSAIO_SEM_CHAVE');
  if(!TITULAR.test(titularId||'')||
     !Number.isSafeInteger(posicaoId)||posicaoId<1||
     !cpfValido(cpf)||aceiteExplicito!==true||
     typeof versaoTermos!=='string'||typeof hashTermos!=='string')
   falha('AZUL_CPF_OU_ACEITE_INVALIDO');
  if(this.db.isTransaction)falha('AZUL_TRANSACAO_EXTERNA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const p=this.db.prepare([
    'SELECT x.*,e.estado FROM loop_real_promocoes_pedido_ensaio x',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=x.pedido_id',
    'WHERE x.posicao_id=? AND x.titular_id=?'
   ].join(' ')).get(posicaoId,titularId);
   if(!p)falha('AZUL_POSICAO_NAO_PERTENCE_A_CONTA');
   if(p.estado!=='AGUARDANDO_CONCILIACAO')falha('AZUL_PSP_EM_REVISAO');
   const conta=this.db.prepare([
    'SELECT termos_versao,termos_hash,email_confirmado_em',
    'FROM loop_real_contas WHERE id=?'
   ].join(' ')).get(titularId);
   if(!conta?.email_confirmado_em||conta.termos_versao!==versaoTermos||
      conta.termos_hash!==hashTermos)
    falha('AZUL_TERMOS_OU_EMAIL_INVALIDOS');
   const cpfHmac=createHmac('sha256',this.chave)
    .update('LOOP_AZUL_ENSAIO_CPF_V1:'+cpf).digest('hex');
   const antigo=this.db.prepare(
    'SELECT * FROM loop_real_aceites_posicao_ensaio WHERE posicao_id=?'
   ).get(posicaoId);
   if(antigo){
    if(antigo.pedido_id!==p.pedido_id||antigo.titular_id!==titularId||
       antigo.cpf_hmac!==cpfHmac||
       antigo.termos_versao!==versaoTermos||antigo.termos_hash!==hashTermos)
     falha('AZUL_ACEITE_REPLAY_DIVERGENTE');
    this.db.exec('COMMIT');
    return {repetido:true,posicaoId,estado:'ACEITE_ENSAIO',financeiroReal:false};
   }
   this._trocar({pedidoId:p.pedido_id,titularId,posicaoId,
    anterior:'PENDENTE',novo:'ACEITE_ENSAIO'});
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<1)falha('AZUL_RELOGIO_INVALIDO');
   this.db.prepare([
    'INSERT INTO loop_real_aceites_posicao_ensaio',
    '(posicao_id,pedido_id,titular_id,cpf_hmac,termos_versao,termos_hash,criado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(posicaoId,p.pedido_id,titularId,cpfHmac,
    versaoTermos,hashTermos,ts);
   this.db.exec('COMMIT');
   return {repetido:false,posicaoId,estado:'ACEITE_ENSAIO',
    identidadeExternaVerificada:false,financeiroReal:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 suspenderReversao({pedidoId,autorizadoEnsaio=false}={}){
  if(process.env.NODE_ENV==='production')falha('AZUL_ENSAIO_PROIBIDO_PRODUCAO');
  if(!PEDIDO.test(pedidoId||'')||autorizadoEnsaio!==true)
   falha('AZUL_REVERSAO_NAO_AUTORIZADA');
  if(this.db.isTransaction)falha('AZUL_TRANSACAO_EXTERNA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const p=this.db.prepare([
    'SELECT x.*,e.estado FROM loop_real_promocoes_pedido_ensaio x',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=x.pedido_id',
    'WHERE x.pedido_id=?'
   ].join(' ')).get(pedidoId);
   if(!p||p.estado!=='CANCELADO')falha('AZUL_REVERSAO_SEM_PSP');
   const repetido=this.db.prepare(
    'SELECT 1 FROM loop_real_reversoes_promocao_ensaio WHERE pedido_id=?'
   ).get(pedidoId);
   if(repetido){
    this.db.exec('COMMIT');
    return {repetido:true,estado:'REVISAR_PSP',financeiroReal:false};
   }
   const aceito=!!this.db.prepare(
    'SELECT 1 FROM loop_real_aceites_posicao_ensaio WHERE posicao_id=?'
   ).get(p.posicao_id);
   this._trocar({pedidoId,titularId:p.titular_id,posicaoId:p.posicao_id,
    anterior:aceito?'ACEITE_ENSAIO':'PENDENTE',novo:'REVISAR_PSP'});
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<1)falha('AZUL_RELOGIO_INVALIDO');
   this.db.prepare([
    'INSERT INTO loop_real_reversoes_promocao_ensaio',
    '(pedido_id,titular_id,posicao_id,registrado_em) VALUES(?,?,?,?)'
   ].join(' ')).run(pedidoId,p.titular_id,p.posicao_id,ts);
   this.db.exec('COMMIT');
   return {repetido:false,estado:'REVISAR_PSP',financeiroReal:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 static verificar(db){
  const a=db.prepare([
   'SELECT a.posicao_id,a.titular_id,a.termos_versao,a.termos_hash,',
   'p.posicao_id AS posicao_p,p.titular_id AS titular_p,',
   'c.termos_versao AS versao_c,c.termos_hash AS hash_c',
   'FROM loop_real_aceites_posicao_ensaio a',
   'JOIN loop_real_promocoes_pedido_ensaio p ON p.pedido_id=a.pedido_id',
   'JOIN loop_real_contas c ON c.id=a.titular_id'
  ].join(' ')).all();
  if(a.some(x=>x.posicao_id!==x.posicao_p||x.titular_id!==x.titular_p||
     x.termos_versao!==x.versao_c||x.termos_hash!==x.hash_c))
   falha('AZUL_ACEITE_AUDITORIA_DIVERGENTE');
  const r=db.prepare([
   'SELECT r.posicao_id,r.titular_id,e.estado,',
   'p.posicao_id AS posicao_p,p.titular_id AS titular_p',
   'FROM loop_real_reversoes_promocao_ensaio r',
   'JOIN loop_real_promocoes_pedido_ensaio p ON p.pedido_id=r.pedido_id',
   'JOIN loop_real_eventos_comerciais e ON e.pedido_id=r.pedido_id'
  ].join(' ')).all();
  if(r.some(x=>x.estado!=='CANCELADO'||x.posicao_id!==x.posicao_p||
     x.titular_id!==x.titular_p))
   falha('AZUL_REVERSAO_AUDITORIA_DIVERGENTE');
  return {aceitesIndividuaisEnsaio:a.length,reversoesEmQuarentena:r.length};
 }
 static estado(db,posicaoId){
  if(db.prepare(
   'SELECT 1 FROM loop_real_reversoes_promocao_ensaio WHERE posicao_id=?'
  ).get(posicaoId))return 'REVISAR_PSP';
  return db.prepare(
   'SELECT 1 FROM loop_real_aceites_posicao_ensaio WHERE posicao_id=?'
  ).get(posicaoId)?'ACEITE_ENSAIO':'PENDENTE';
 }
}
module.exports={AceitePosicaoAzulEnsaioSQLite};
