'use strict';
// Livro LOCAL DE LABORATORIO para triagem humana de divergencias.
// Nao cancela pedidos/posicoes, nao bloqueia saque real e nao executa Pix.
// O estado "CONTENCAO_PROPOSTA" e orientacao operacional, nao um pagamento impedido.
const PEDIDO=/^[A-Za-z0-9_-]{1,100}$/;
const EVENTO=/^[a-z0-9][a-z0-9-]{7,99}$/;
const NOTA=/^[^\u0000-\u001f\u007f]{8,400}$/u;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class PendenciasConciliacaoDemoSQLite{
 constructor({banco,relogio=()=>new Date().toISOString()}={}){
  if(!banco?.exec||!banco?.prepare)throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.relogio=relogio;
  banco.exec(`CREATE TABLE IF NOT EXISTS admin_conciliacao_pendencias_lab(
   pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_carrinho_loop_demo(pedido_id) ON DELETE RESTRICT,
   criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_conciliacao_pendencias_eventos_lab(
   evento_id TEXT PRIMARY KEY NOT NULL,
   pedido_id TEXT NOT NULL REFERENCES admin_conciliacao_pendencias_lab(pedido_id) ON DELETE RESTRICT,
   acao TEXT NOT NULL CHECK(acao IN ('ABERTURA','ASSUMIR_REVISAO','ENCERRAMENTO')),
   alerta_snapshot_json TEXT NOT NULL,
   observacao TEXT NOT NULL,
   registrado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conciliacao_pendencias_lab_pedido ON
   admin_conciliacao_pendencias_eventos_lab(pedido_id,registrado_em);
  CREATE TRIGGER IF NOT EXISTS admin_conciliacao_pendencias_lab_imutavel_u
   BEFORE UPDATE ON admin_conciliacao_pendencias_eventos_lab BEGIN
   SELECT RAISE(ABORT,'evento de conciliacao imutavel'); END;
  CREATE TRIGGER IF NOT EXISTS admin_conciliacao_pendencias_lab_imutavel_d
   BEFORE DELETE ON admin_conciliacao_pendencias_eventos_lab BEGIN
   SELECT RAISE(ABORT,'evento de conciliacao imutavel'); END;`);
 }
 consultar(pedidoId){
  if(!PEDIDO.test(pedidoId))throw falha('PEDIDO_INVALIDO');
  const linhas=this.banco.prepare(`SELECT evento_id AS eventoId,acao,
    alerta_snapshot_json AS alertasJson,observacao,registrado_em AS registradoEm
    FROM admin_conciliacao_pendencias_eventos_lab WHERE pedido_id=?
    ORDER BY rowid`).all(pedidoId);
  const historico=linhas.map(x=>({eventoId:x.eventoId,acao:x.acao,
   alertas:JSON.parse(x.alertasJson),observacao:x.observacao,registradoEm:x.registradoEm}));
  const ultimo=historico.at(-1);
  return {pedidoId,estado:!ultimo?'NAO_ABERTA':
   ultimo.acao==='ABERTURA'?'PENDENTE':
   ultimo.acao==='ASSUMIR_REVISAO'?'EM_REVISAO':'ENCERRADA',
   historico,liberacaoFinanceiraReal:false,revisaoHumanaNecessaria:!!ultimo&&ultimo.acao!=='ENCERRAMENTO',
   somenteLaboratorio:true};
 }
 registrar({pedidoId,eventoId,acao,observacao,diagnostico}={}){
  if(!PEDIDO.test(pedidoId)||!EVENTO.test(eventoId)||
   !['ABERTURA','ASSUMIR_REVISAO','ENCERRAMENTO'].includes(acao)||
   typeof observacao!=='string'||!NOTA.test(observacao))
   throw falha('REGISTRO_INVALIDO');
  if(!diagnostico||!Array.isArray(diagnostico.linhas)||
   !Array.isArray(diagnostico.alertasGlobais))
   throw falha('DIAGNOSTICO_AUSENTE');
  const linha=diagnostico.linhas.find(x=>x.pedidoId===pedidoId);
  if(!linha)throw falha('PEDIDO_FORA_DO_DIAGNOSTICO');
  const alertas=[...new Set(linha.alertas)];
  const snapshot=JSON.stringify(alertas);
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare(`SELECT pedido_id AS pedidoId,acao,
    observacao,alerta_snapshot_json AS snapshot FROM admin_conciliacao_pendencias_eventos_lab
    WHERE evento_id=?`).get(eventoId);
   if(anterior){
    if(anterior.pedidoId!==pedidoId||anterior.acao!==acao||
     anterior.observacao!==observacao||anterior.snapshot!==snapshot)
     throw falha('CONFLITO_IDEMPOTENCIA');
    this.banco.exec('COMMIT');
    return {repetido:true,...this.consultar(pedidoId)};
   }
   const estado=this.consultar(pedidoId).estado;
   if(acao==='ABERTURA'&&(estado!=='NAO_ABERTA'||!alertas.length))
    throw falha('ABERTURA_INDEVIDA');
   if(acao==='ASSUMIR_REVISAO'&&!['PENDENTE','EM_REVISAO'].includes(estado))
    throw falha('REVISAO_INDEVIDA');
   if(acao==='ENCERRAMENTO'&&
    (estado!=='EM_REVISAO'||alertas.length||diagnostico.alertasGlobais.length))
    throw falha('PENDENCIA_FINANCEIRA_NAO_CONCILIADA');
   const data=this.relogio();
   if(typeof data!=='string'||Number.isNaN(Date.parse(data)))
    throw falha('DATA_INVALIDA');
   this.banco.prepare(`INSERT OR IGNORE INTO admin_conciliacao_pendencias_lab
    (pedido_id,criado_em) VALUES(?,?)`).run(pedidoId,data);
   this.banco.prepare(`INSERT INTO admin_conciliacao_pendencias_eventos_lab
    (evento_id,pedido_id,acao,alerta_snapshot_json,observacao,registrado_em)
    VALUES(?,?,?,?,?,?)`).run(eventoId,pedidoId,acao,snapshot,observacao,data);
   this.banco.exec('COMMIT');
   return {repetido:false,...this.consultar(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={PendenciasConciliacaoDemoSQLite};
