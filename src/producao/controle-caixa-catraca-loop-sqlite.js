'use strict';
// Caixa / catraca: vendas criam posicoes e alimentam FILAS.
// A catraca distribui luzes de CENTROS previamente autorizados por caixa,
// sem procurar uma venda nova para cada luz. Este modulo NAO gira o motor,
// NAO gera credito, NAO efetua Pix e nao assume saldo do operador.
// A comprovacao e uma porta EXTERNA autenticada; sem ela, falha fechado.
const {calcularIntervaloMeta}=require('../domain/meta-lotes-catraca-loop');
const {agoraLocal,minutos}=require('../domain/agenda-catraca-loop');
const DIA=/^\d{4}-\d{2}-\d{2}$/;
const REF=/^[A-Za-z0-9:_-]{8,120}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function diaValido(d){
 if(typeof d!=='string'||!DIA.test(d))return false;
 const data=new Date(d+'T12:00:00Z');
 return Number.isFinite(data.getTime())&&data.toISOString().slice(0,10)===d;
}
const TABELAS_CATRACA_CAIXA=Object.freeze([
 'loop_real_catraca_caixa_programacao',
 'loop_real_catraca_caixa_autorizacoes'
]);
class ControleCaixaCatracaLoopSQLite{
 constructor({banco,provas=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')falha('CATRACA_CAIXA_BANCO_INVALIDO');
  this.banco=banco;this.provas=provas;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_caixa_programacao(',
   'dia TEXT PRIMARY KEY,abertura TEXT NOT NULL,fechamento TEXT NOT NULL,',
   'meta_centros INTEGER NOT NULL CHECK(meta_centros>=1),',
   'reserva_por_centro_centavos INTEGER NOT NULL CHECK(reserva_por_centro_centavos>0),',
   'reserva_total_centavos INTEGER NOT NULL CHECK(reserva_total_centavos>0),',
   'comprovante_reserva TEXT NOT NULL UNIQUE,',
   "estado TEXT NOT NULL CHECK(estado IN ('PAUSADA','AUTORIZADA')),",
   'criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_caixa_autorizacoes(',
   'dia TEXT NOT NULL REFERENCES loop_real_catraca_caixa_programacao(dia),',
   'indice_luz INTEGER NOT NULL CHECK(indice_luz>0),',
   'chave TEXT NOT NULL UNIQUE,emitida_em INTEGER NOT NULL,',
   'PRIMARY KEY(dia,indice_luz));',
   'CREATE TRIGGER IF NOT EXISTS catraca_caixa_autorizacoes_imutaveis_update',
   'BEFORE UPDATE ON loop_real_catraca_caixa_autorizacoes',
   "BEGIN SELECT RAISE(ABORT,'autorizacao de luz imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS catraca_caixa_autorizacoes_imutaveis_delete',
   'BEFORE DELETE ON loop_real_catraca_caixa_autorizacoes',
   "BEGIN SELECT RAISE(ABORT,'autorizacao de luz imutavel'); END;"
  ].join(' '));
 }
 _transacao(fn){
  const externa=this.banco.isTransaction===true;
  if(!externa)this.banco.exec('BEGIN IMMEDIATE');
  try{const r=fn();if(!externa)this.banco.exec('COMMIT');return r;}
  catch(e){if(!externa)this.banco.exec('ROLLBACK');throw e;}
 }
 _ler(dia){
  return this.banco.prepare([
   'SELECT dia,abertura,fechamento,meta_centros AS metaCentros,',
   'reserva_por_centro_centavos AS reservaPorCentroCentavos,',
   'reserva_total_centavos AS reservaTotalCentavos,',
   'comprovante_reserva AS comprovanteReserva,estado,criado_em AS criadoEm',
   'FROM loop_real_catraca_caixa_programacao WHERE dia=?'
  ].join(' ')).get(dia)||null;
 }
 consultar({dia}={}){
  if(!diaValido(dia))falha('CATRACA_CAIXA_DIA_INVALIDO');
  const p=this._ler(dia);
  if(!p)return {dia,programada:false,centrosAutorizados:0,
   luzesAutorizadas:0,caixaComprovado:false};
  const total=this.banco.prepare([
   'SELECT COUNT(*) AS n FROM loop_real_catraca_caixa_autorizacoes',
   'WHERE dia=?'
  ].join(' ')).get(dia).n;
  const ritmo=calcularIntervaloMeta({abertura:p.abertura,
   fechamento:p.fechamento,quantidade:p.metaCentros});
  return {dia,programada:true,estado:p.estado,
   abertura:p.abertura,fechamento:p.fechamento,
   metaCentros:p.metaCentros,centrosAutorizados:p.metaCentros,
   luzesPlanejadas:Number(ritmo.luzesPlanejadas),
   luzesAutorizadas:total,intervaloLuzSegundos:ritmo.intervaloLuzSegundos,
   reservaTotalCentavos:p.reservaTotalCentavos,
   caixaComprovado:true,
   movimentacaoFinanceiraExecutada:false};
 }
 // A meta, sozinha, NAO comprova caixa. Nenhum valor informado na tela
 // e aceito como prova. O adaptador confirma que a reserva ESTA SEGREGADA.
 programar({dia,abertura,fechamento,metaCentros,
  reservaPorCentroCentavos}={}){
  if(!diaValido(dia)||!Number.isSafeInteger(metaCentros)||metaCentros<1||
     !Number.isSafeInteger(reservaPorCentroCentavos)||
     reservaPorCentroCentavos<1)
   falha('CATRACA_CAIXA_PROGRAMACAO_INVALIDA');
  const ritmo=calcularIntervaloMeta({abertura,fechamento,
   quantidade:metaCentros});
  const totalBig=BigInt(metaCentros)*BigInt(reservaPorCentroCentavos);
  if(totalBig>BigInt(Number.MAX_SAFE_INTEGER))
   falha('CATRACA_CAIXA_VALOR_EXCESSIVO');
  const reservaTotalCentavos=Number(totalBig);
  if(typeof this.provas?.confirmarReservaCentros!=='function')
   falha('CATRACA_CAIXA_COMPROVACAO_EXTERNA_INDISPONIVEL');
  // Chamada ocorre no servidor, nunca no navegador e sem receber saldo
  // declarado por cliente/operador. Deve validar conciliacao e segregacao.
  const prova=this.provas.confirmarReservaCentros(Object.freeze({
   dia,metaCentros,reservaPorCentroCentavos,reservaTotalCentavos
  }));
  if(!prova||prova.ambiente!=='PRODUCAO'||
     prova.estado!=='RESERVA_SEGREGADA'||
     prova.valorReservadoCentavos!==reservaTotalCentavos||
     typeof prova.comprovanteId!=='string'||!REF.test(prova.comprovanteId))
   falha('CATRACA_CAIXA_RESERVA_NAO_COMPROVADA');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)
   falha('CATRACA_CAIXA_RELOGIO_INVALIDO');
  return this._transacao(()=>{
   const anterior=this._ler(dia);
   if(anterior){
    if(anterior.abertura!==abertura||anterior.fechamento!==fechamento||
       anterior.metaCentros!==metaCentros||
       anterior.reservaPorCentroCentavos!==reservaPorCentroCentavos||
       anterior.comprovanteReserva!==prova.comprovanteId)
     falha('CATRACA_CAIXA_DIA_JA_PROGRAMADO');
    return {...this.consultar({dia}),repetido:true};
   }
   this.banco.prepare([
    'INSERT INTO loop_real_catraca_caixa_programacao',
    '(dia,abertura,fechamento,meta_centros,',
    'reserva_por_centro_centavos,reserva_total_centavos,',
    'comprovante_reserva,estado,criado_em)',
    "VALUES(?,?,?,?,?,?,?,'PAUSADA',?)"
   ].join(' ')).run(dia,abertura,fechamento,metaCentros,
    reservaPorCentroCentavos,reservaTotalCentavos,prova.comprovanteId,ts);
   return {...this.consultar({dia}),repetido:false};
  });
 }
 // Operacao de registro de AUTORIZACAO DE LUZ, nao evento financeiro.
 // O motor real so podera consumi-la apos implementacao explicita de
 // ligacao transacional, sem fabricar pedidos nem movimentar saldo.
 autorizarLuz({dia,indiceLuz,liberacaoOperador=false}={}){
  if(!diaValido(dia)||!Number.isSafeInteger(indiceLuz)||
     indiceLuz<1||liberacaoOperador!==true)
   falha('CATRACA_CAIXA_LUZ_INVALIDA');
  const ts=this.agora();
  const horario=agoraLocal(ts);
  if(horario.dia!==dia)falha('CATRACA_CAIXA_FORA_DO_DIA');
  return this._transacao(()=>{
   const p=this._ler(dia);
   if(!p||p.estado!=='AUTORIZADA')
    falha('CATRACA_CAIXA_PAUSADA_OU_SEM_RESERVA');
   const ritmo=calcularIntervaloMeta({abertura:p.abertura,
    fechamento:p.fechamento,quantidade:p.metaCentros});
   const total=Number(ritmo.luzesPlanejadas);
   if(indiceLuz>total)falha('CATRACA_CAIXA_META_EXCEDIDA');
   const velha=this.banco.prepare([
    'SELECT chave FROM loop_real_catraca_caixa_autorizacoes',
    'WHERE dia=? AND indice_luz=?'
   ].join(' ')).get(dia,indiceLuz);
   if(velha)return {autorizada:true,repetida:true,
    chave:velha.chave,indiceLuz,movimentoFinanceiro:false};
   const emitidas=this.banco.prepare([
    'SELECT COUNT(*) AS n FROM loop_real_catraca_caixa_autorizacoes',
    'WHERE dia=?'
   ].join(' ')).get(dia).n;
   if(indiceLuz!==emitidas+1)
    falha('CATRACA_CAIXA_LUZ_FORA_DE_ORDEM');
   const inicio=minutos(p.abertura),fim=minutos(p.fechamento);
   const duracao=((fim-inicio+1440)%1440)||1440;
   const atual=minutos(horario.horario);
   const corrido=(atual-inicio+1440)%1440;
   const vencimento=Math.ceil(indiceLuz*(duracao*60)/(total));
   const transcorrido=corrido*60+new Date(ts).getUTCSeconds();
   if(corrido>=duracao||transcorrido<vencimento)
    falha('CATRACA_CAIXA_LUZ_FORA_DO_INTERVALO');
   const chave='caixa:'+dia+':'+String(indiceLuz);
   this.banco.prepare([
    'INSERT INTO loop_real_catraca_caixa_autorizacoes',
    '(dia,indice_luz,chave,emitida_em) VALUES(?,?,?,?)'
   ].join(' ')).run(dia,indiceLuz,chave,ts);
   return {autorizada:true,repetida:false,chave,indiceLuz,
    centroOrdinal:Math.ceil(indiceLuz/6),luzNoCentro:(indiceLuz-1)%6+1,
    movimentoFinanceiro:false};
  });
 }
 // A reserva fica segura mesmo apos configurada: nao comeca sozinha.
 // Apenas chamada protegida do operador pode alternar PAUSADA/AUTORIZADA.
 definirAtivacao({dia,ativa}={}){
  if(!diaValido(dia)||typeof ativa!=='boolean')
   falha('CATRACA_CAIXA_ATIVACAO_INVALIDA');
  return this._transacao(()=>{
   if(!this._ler(dia))falha('CATRACA_CAIXA_SEM_RESERVA');
   this.banco.prepare([
    'UPDATE loop_real_catraca_caixa_programacao SET estado=? WHERE dia=?'
   ].join(' ')).run(ativa?'AUTORIZADA':'PAUSADA',dia);
   return this.consultar({dia});
  });
 }
}
module.exports={ControleCaixaCatracaLoopSQLite,TABELAS_CATRACA_CAIXA};
