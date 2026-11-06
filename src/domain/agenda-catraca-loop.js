'use strict';
// A fila vive pelas vendas; a catraca apenas executa eventos comprovados.
// Horario e intervalo sao OPCIONAIS, nunca pre-condicao para receber vendas.
const FUSO='America/Sao_Paulo';
const RELOGIO=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATA=/^\d{4}-\d{2}-\d{2}$/;
const PADRAO=Object.freeze({
 ativo:false,abertura:'09:00',fechamento:'18:00',
 intervaloMinutos:10,excecaoData:null,excecaoFechamento:null,
 pausaManual:false,ultimoDia:null,ultimoSlot:-1
});
function minutos(h){
 if(typeof h!=='string'||!RELOGIO.test(h))
  throw Error('AGENDA_HORARIO_INVALIDO');
 const [hora,minuto]=h.split(':').map(Number);
 return hora*60+minuto;
}
function diaValido(d){
 if(typeof d!=='string'||!DATA.test(d))return false;
 const parsed=new Date(d+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&
  parsed.toISOString().slice(0,10)===d;
}
function validarAgenda(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||
    typeof p.ativo!=='boolean'||typeof p.pausaManual!=='boolean'||
    !Number.isSafeInteger(p.intervaloMinutos)||p.intervaloMinutos<1||
    (p.excecaoData===null)!==(p.excecaoFechamento===null))
  throw Error('AGENDA_CONFIG_INVALIDA');
 minutos(p.abertura);minutos(p.fechamento);
 if(p.excecaoData!==null){
  if(!diaValido(p.excecaoData))throw Error('AGENDA_EXCECAO_INVALIDA');
  minutos(p.excecaoFechamento);
 }
 if(p.ultimoDia!==null&&!diaValido(p.ultimoDia))
  throw Error('AGENDA_DIA_INVALIDO');
 if(!Number.isSafeInteger(p.ultimoSlot)||p.ultimoSlot< -1)
  throw Error('AGENDA_SLOT_INVALIDO');
 return p;
}
function agoraLocal(agoraMs){
 if(!Number.isSafeInteger(agoraMs)||agoraMs<0)
  throw Error('AGENDA_RELOGIO_INVALIDO');
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date(agoraMs));
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 const dia=m.year+'-'+m.month+'-'+m.day;
 const minuto=Number(m.hour)%24*60+Number(m.minute);
 return {dia,minuto,horario:m.hour+':'+m.minute};
}
function diaAnterior(dia){
 return new Date(Date.parse(dia+'T12:00:00Z')-86400000)
  .toISOString().slice(0,10);
}
function avaliarAgenda(config,agoraMs){
 const c=validarAgenda({...config});
 const agora=agoraLocal(agoraMs);
 const inicio=minutos(c.abertura);
 // Cada dia da agenda nasce na hora de abertura. Se a abertura for
 // 09:00 e o fim 00:00, o fim eh MEIA-NOITE DO DIA SEGUINTE.
 const diaJanela=agora.minuto<inicio?diaAnterior(agora.dia):agora.dia;
 const fechamentoAplicado=diaJanela===c.excecaoData?
  c.excecaoFechamento:c.fechamento;
 let fim=minutos(fechamentoAplicado);
 if(fim<=inicio)fim+=1440; // inclui horario igual: turno de 24 horas
 const transcorrido=(diaJanela===agora.dia?0:1440)+agora.minuto-inicio;
 const dentroDoHorario=transcorrido>=0&&transcorrido<fim-inicio;
 const slot=Math.floor(transcorrido/c.intervaloMinutos);
 const liberavel=c.ativo&&dentroDoHorario&&!c.pausaManual&&slot>=1&&
  (c.ultimoDia!==diaJanela||slot>c.ultimoSlot);
 return {fuso:FUSO,dia:diaJanela,horarioLocal:agora.horario,
  abertura:c.abertura,fechamentoAplicado,dentroDoHorario,
  pausaManual:c.pausaManual,ativo:c.ativo,
  podeContabilizar:liberavel,slot,
  pulsoMaximo:liberavel?1:0,
  intervaloMinutos:c.intervaloMinutos,
  proximaLuzNoMinuto:inicio+(Math.max(0,slot)+1)*c.intervaloMinutos};
}
module.exports={PADRAO,FUSO,minutos,validarAgenda,agoraLocal,avaliarAgenda};
