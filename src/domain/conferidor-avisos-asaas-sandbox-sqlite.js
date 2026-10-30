'use strict';
// Conciliação exclusiva de AVISOS de sandbox com COBRANÇAS da AKITEMM.
// Nunca alimenta motor, caixa real, entrega ou saque. Sem HTTP e sem credenciais.
const ID=/^[A-Za-z0-9_&-]{5,150}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class ConferidorAvisosAsaasSandboxSQLite{
 constructor({banco,caixaAvisos,cobrancas,agora=()=>new Date().toISOString()}={}){
  if(!banco?.prepare||!banco?.exec||caixaAvisos?.banco!==banco||
     cobrancas?.banco!==banco||typeof cobrancas.conferir!=='function')
   throw new TypeError('Servicos de sandbox com mesmo SQLite sao obrigatorios');
  this.banco=banco;this.caixaAvisos=caixaAvisos;this.cobrancas=cobrancas;
  this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_asaas_sandbox_conciliacoes (',
   'evento_id TEXT PRIMARY KEY, pedido_id TEXT,',
   'resultado TEXT NOT NULL, codigo TEXT NOT NULL,',
   'status_local TEXT, conferido_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS asaas_conciliacoes_imutaveis_update',
   "BEFORE UPDATE ON akitemm_asaas_sandbox_conciliacoes BEGIN SELECT RAISE(ABORT,'imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS asaas_conciliacoes_imutaveis_delete',
   "BEFORE DELETE ON akitemm_asaas_sandbox_conciliacoes BEGIN SELECT RAISE(ABORT,'imutavel'); END;"
  ].join(' '));
 }
 _registro(eventoId){
  return this.banco.prepare([
   'SELECT evento_id AS eventoId, pedido_id AS pedidoId,',
   'resultado,codigo,status_local AS statusLocal,',
   'conferido_em AS conferidoEm FROM akitemm_asaas_sandbox_conciliacoes',
   'WHERE evento_id=?'
  ].join(' ')).get(eventoId)||null;
 }
 _salvar(eventoId,pedidoId,resultado,codigo,statusLocal){
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this._registro(eventoId);
   if(!anterior){
    this.banco.prepare([
     'INSERT INTO akitemm_asaas_sandbox_conciliacoes',
     '(evento_id,pedido_id,resultado,codigo,status_local,conferido_em)',
     'VALUES (?,?,?,?,?,?)'
    ].join(' ')).run(eventoId,pedidoId,resultado,codigo,statusLocal,this.agora());
   }
   this.banco.exec('COMMIT');
   return this._registro(eventoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 _resposta(reg,duplicado){
  return Object.freeze({...reg,duplicado:Boolean(duplicado),
   modo:'CONCILIACAO_ASAAS_SANDBOX_APENAS_LAB',
   liquidezRealComprovada:false,autorizarPosicao:false,
   autorizarSaque:false,alterarCatraca:false});
 }
 async conferirEvento(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))
   throw falha('EVENTO_ID_INVALIDO');
  const registrado=this._registro(eventoId);
  if(registrado)return this._resposta(registrado,true);
  // Caixa interna ja validou token; nunca aceitar payload vindo do caller.
  const aviso=this.caixaAvisos.listar().find(x=>x.eventoId===eventoId);
  if(!aviso)throw falha('AVISO_NAO_ENCONTRADO');
  if(!aviso.pedidoReferencia.startsWith('LOOPLAB-'))
   throw falha('REFERENCIA_AVISO_INVALIDA');
  const pedidoId=aviso.pedidoReferencia.slice('LOOPLAB-'.length);
  let cobranca;
  try{cobranca=this.cobrancas.consultar(pedidoId);}
  catch{cobranca=null;}
  if(!cobranca?.encontrado){
   const reg=this._salvar(eventoId,pedidoId,'EXIGE_REVISAO',
    'SEM_COBRANCA_LOCAL',null);
   return this._resposta(reg,false);
  }
  if(cobranca.pagamentoId!==aviso.pagamentoId||
     cobranca.valorCentavos!==aviso.valorInformadoCentavos||
     cobranca.pedidoId!==pedidoId){
   const reg=this._salvar(eventoId,pedidoId,'EXIGE_REVISAO',
    'VINCULO_OU_VALOR_DIVERGENTE',cobranca.status);
   return this._resposta(reg,false);
  }
  // Rede apenas agora; o provedor consulta pelo ID local ja vinculado.
  // Uma resposta externa nao equivale a liquidez nem a direitos do LOOP.
  const reconsulta=await this.cobrancas.conferir(pedidoId);
  const reg=this._salvar(eventoId,pedidoId,'CONFERIDO_SANDBOX',
   'RECONSULTA_ASAAS_SANDBOX',reconsulta.status);
  return this._resposta(reg,false);
 }
 listarConferencias(){
  return this.banco.prepare([
   'SELECT evento_id AS eventoId, pedido_id AS pedidoId,',
   'resultado,codigo,status_local AS statusLocal,',
   'conferido_em AS conferidoEm FROM akitemm_asaas_sandbox_conciliacoes',
   'ORDER BY rowid'
  ].join(' ')).all();
 }
}
module.exports={ConferidorAvisosAsaasSandboxSQLite};