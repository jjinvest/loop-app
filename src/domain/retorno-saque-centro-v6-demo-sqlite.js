'use strict';

// LABORATORIO: ensaia devolucao de saque do CENTRO sem banco, CPF ou Pix.
// Montantes sao referencias de ciclos ja concluidos, NAO saldo liquidado real.
// Nunca converte provisoes em disponibilidades reais.
const {prazoDaSolicitacao}=require('./solicitacoes-saque-demo-sqlite');
const ID=/^saque-centro-[a-z0-9-]{8,76}$/;
const EVENTO_ID=/^evt-saque-[a-z0-9-]{8,76}$/;
const FASES={
  ENVIAR_SIMULADO:['SOLICITADO','ENVIADO_SIMULADO'],
  FALHA_BANCARIA_SIMULADA:['ENVIADO_SIMULADO','FALHOU_AGUARDANDO_RETORNO'],
  RETORNO_CONFIRMADO_SIMULADO:['FALHOU_AGUARDANDO_RETORNO','DEVOLVIDO_AO_ESCRITORIO_SIMULADO'],
  SUCESSO_BANCARIO_SIMULADO:['ENVIADO_SIMULADO','CONCLUIDO_SIMULADO']
};
const RAZOES=['DADOS_DESTINATARIO_INVALIDOS','CHAVE_INVALIDA','CONTA_INEXISTENTE',
  'BANCO_RECUSOU','OUTRO_MOTIVO'];
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class RetornoSaqueCentroV6DemoSQLite{
 constructor({banco,livro,contas,agora=()=>new Date().toISOString()}={}){
  if(!banco||livro?.banco!==banco||contas?.banco!==banco)
    throw new TypeError('Conta, livro do centro e banco ficticios obrigatorios');
  this.banco=banco;this.livro=livro;this.contas=contas;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_v6_saques_centro_teste (',
   'solicitacao_id TEXT PRIMARY KEY,conta_id TEXT NOT NULL,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'criado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_v6_eventos_saques_centro_teste (',
   'sequencia INTEGER PRIMARY KEY AUTOINCREMENT,',
   'evento_id TEXT NOT NULL UNIQUE,',
   'solicitacao_id TEXT NOT NULL REFERENCES loop_v6_saques_centro_teste(solicitacao_id),',
   'tipo TEXT NOT NULL, motivo TEXT, criado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loop_saques_centro_conta',
   'ON loop_v6_saques_centro_teste(conta_id,criado_em);',
   ...['loop_v6_saques_centro_teste','loop_v6_eventos_saques_centro_teste'].flatMap(t=>[
     'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_update BEFORE UPDATE ON '+t+
      " BEGIN SELECT RAISE(ABORT,'historico saque imutavel'); END;",
     'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_delete BEFORE DELETE ON '+t+
      " BEGIN SELECT RAISE(ABORT,'historico saque imutavel'); END;"
   ])
  ].join('\n'));
 }
 _existente(id){
  return this.banco.prepare([
   'SELECT solicitacao_id AS solicitacaoId,conta_id AS contaId,',
   'valor_centavos AS valorCentavos,criado_em AS criadoEm',
   'FROM loop_v6_saques_centro_teste WHERE solicitacao_id=?'
  ].join(' ')).get(id);
 }
 _status(id){
  return this.banco.prepare([
   'SELECT tipo,motivo,criado_em AS criadoEm FROM loop_v6_eventos_saques_centro_teste',
   'WHERE solicitacao_id=? ORDER BY sequencia DESC LIMIT 1'
  ].join(' ')).get(id)||null;
 }
 _detalhe(reg){
  const evento=this._status(reg.solicitacaoId);
  const status=evento?FASES[evento.tipo][1]:'SOLICITADO';
  return {solicitacaoId:reg.solicitacaoId,
   valorSimuladoCentavos:reg.valorCentavos,
   criadoEm:reg.criadoEm,status,
   motivoDeFalha:status==='FALHOU_AGUARDANDO_RETORNO'||
     status==='DEVOLVIDO_AO_ESCRITORIO_SIMULADO'?this._motivoFalha(reg.solicitacaoId):null,
   prazo:prazoDaSolicitacao(reg.criadoEm,this.agora()).prazoMaximoAnaliseEm,
   podeSolicitarNovamente:status==='DEVOLVIDO_AO_ESCRITORIO_SIMULADO',
   resultadoBancarioApenasFicticio:true,transferenciaReal:false};
 }
 _motivoFalha(id){
  return this.banco.prepare([
   "SELECT motivo FROM loop_v6_eventos_saques_centro_teste",
   "WHERE solicitacao_id=? AND tipo='FALHA_BANCARIA_SIMULADA'",
   'ORDER BY sequencia DESC LIMIT 1'
  ].join(' ')).get(id)?.motivo||null;
 }
 consultar(contaId){
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  const previsto=this.livro.extrato(contaId);
  // Apenas para demonstrar ciclo completo -> reserva -> devolucao -> novo pedido.
  // Zero Pix: esta conta de teste NAO tem saldo monetario confirmado.
  const registros=this.banco.prepare([
   'SELECT solicitacao_id AS solicitacaoId,valor_centavos AS valorCentavos,',
   'criado_em AS criadoEm FROM loop_v6_saques_centro_teste',
   'WHERE conta_id=? ORDER BY criado_em,solicitacao_id'
  ].join(' ')).all(contaId);
  let retido=0,concluido=0,devolvido=0;
  const historico=registros.map(reg=>{
   const d=this._detalhe(reg);
   if(d.status==='DEVOLVIDO_AO_ESCRITORIO_SIMULADO')devolvido+=reg.valorCentavos;
   else if(d.status==='CONCLUIDO_SIMULADO')concluido+=reg.valorCentavos;
   else retido+=reg.valorCentavos;
   return d;
  });
  const restante=previsto.totalPrevistoCentavos-retido-concluido;
  if(!Number.isSafeInteger(restante)||restante<0)
    throw falha('INTEGRIDADE_SALDO_SAQUE_SIMULADO');
  return {modo:'ENSAIO_DE_SAQUE_CENTRO_SEM_BANCO',
   creditoCicloConcluidoPrevistoCentavos:previsto.totalPrevistoCentavos,
   reservadoEmPedidosDeTesteCentavos:retido,
   simuladoConcluidoCentavos:concluido,
   totalHistoricoRetornadoCentavos:devolvido,
   referenciaParaNovoPedidoFicticioCentavos:restante,
   disponivelParaSaqueRealCentavos:0,
   bancoConectado:false,transferenciasReaisExecutadas:0,
   aviso:'REFERENCIA DE TESTE. NAO E DINHEIRO RECEBIDO OU SACAVEL.',
   historico};
 }
 solicitar({contaId,solicitacaoId,valorCentavos}={}){
  if(!ID.test(solicitacaoId||''))throw falha('SOLICITACAO_ID_INVALIDO');
  if(!Number.isSafeInteger(valorCentavos)||valorCentavos<=0)
    throw falha('VALOR_INVALIDO');
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this._existente(solicitacaoId);
   if(anterior){
    if(anterior.contaId!==contaId||anterior.valorCentavos!==valorCentavos)
      throw falha('CONFLITO_IDEMPOTENCIA');
    b.exec('COMMIT');
    return {...this._detalhe(anterior),repetida:true};
   }
   const saldo=this.consultar(contaId);
   if(valorCentavos>saldo.referenciaParaNovoPedidoFicticioCentavos)
     throw falha('REFERENCIA_CENTRO_TESTE_INSUFICIENTE');
   const criadoEm=this.agora();
   if(!Number.isFinite(Date.parse(criadoEm)))throw falha('RELOGIO_INVALIDO');
   b.prepare([
     'INSERT INTO loop_v6_saques_centro_teste',
     '(solicitacao_id,conta_id,valor_centavos,criado_em) VALUES(?,?,?,?)'
   ].join(' ')).run(solicitacaoId,contaId,valorCentavos,criadoEm);
   b.exec('COMMIT');
   return {...this._detalhe({solicitacaoId,valorCentavos,criadoEm}),repetida:false};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 evento({solicitacaoId,eventoId,tipo,motivo=null}={}){
  if(!ID.test(solicitacaoId||'')||!EVENTO_ID.test(eventoId||'')||
     !Object.hasOwn(FASES,tipo)||(
      tipo==='FALHA_BANCARIA_SIMULADA'?!RAZOES.includes(motivo):motivo!==null
     ))throw falha('EVENTO_BANCARIO_TESTE_INVALIDO');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const anterior=b.prepare([
    'SELECT solicitacao_id AS solicitacaoId,tipo,motivo',
    'FROM loop_v6_eventos_saques_centro_teste WHERE evento_id=?'
   ].join(' ')).get(eventoId);
   if(anterior){
    if(anterior.solicitacaoId!==solicitacaoId||
       anterior.tipo!==tipo||anterior.motivo!==motivo)
      throw falha('CONFLITO_IDEMPOTENCIA');
    const pedido=this._existente(solicitacaoId);
    b.exec('COMMIT');
    return {...this._detalhe(pedido),repetido:true};
   }
   const pedido=this._existente(solicitacaoId);
   if(!pedido)throw falha('PEDIDO_NAO_ENCONTRADO');
   const atual=this._status(solicitacaoId);
   const status=atual?FASES[atual.tipo][1]:'SOLICITADO';
   if(status!==FASES[tipo][0])throw falha('TRANSICAO_INVALIDA');
   b.prepare([
    'INSERT INTO loop_v6_eventos_saques_centro_teste',
    '(evento_id,solicitacao_id,tipo,motivo,criado_em) VALUES(?,?,?,?,?)'
   ].join(' ')).run(eventoId,solicitacaoId,tipo,motivo,this.agora());
   b.exec('COMMIT');
   return {...this._detalhe(pedido),repetido:false};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
}
module.exports={RetornoSaqueCentroV6DemoSQLite};
