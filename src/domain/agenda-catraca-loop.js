'use strict';
// Relogio de exibicao de eventos JA CONFIRMADOS: nao cria venda, nao
// movimenta dinheiro, nao muda a prioridade das filas nem o PSP.
// Fonte unica de fuso horario: America/Sao_Paulo.
const FUSO='America/Sao_Paulo';
const RELOGIO=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATA=/^\d{4}-\d{2}-\d{2}$/;
const PADRAO=Object.freeze({
 ativo:false,abertura:'09:00',fechamento:'18:00',
 intervaloMinutos:10,excecaoData:null,excecaoFechamento:null,
 pausaManual:false,ultimoDia:null,ultimoSlot:-1
});
function minutos(horario){
 if(typeof horario!=='string'||!RELOGIO.test(horario))
  throw new Error('AGENDA_HORARIO_INVALIDO');
 const [h,m]=horario.split(':').map(Number);
 return h*60+m;
}
function validarAgenda(p){
 if(typeof p!=='object'||p===null||Array.isArray(p)||
    typeof p.ativo!=='boolean'||
    typeof p.pausaManual!=='boolean'||
    !Number.isInteger(p.intervaloMinutos)||
    p.intervaloMinutos<1||p.intervaloMinutos>60||
    minutos(p.abertura)>=minutos(p.fechamento)||
    (p.excecaoData===null)!==(p.excecaoFechamento===null))
  throw new Error('AGENDA_CONFIG_INVALIDA');
 if(p.excecaoData!==null){
  if(typeof p.excecaoData!=='string'||!DATA.test(p.excecaoData)||
     Number.isNaN(Date.parse(p.excecaoData+'T12:00:00Z'))||
     minutos(p.excecaoFechamento)<=minutos(p.abertura))
   throw new Error('AGENDA_EXCECAO_INVALIDA');
 }
 if(p.ultimoDia!==null&&(!DATA.test(p.ultimoDia)||
    Number.isNaN(Date.parse(p.ultimoDia+'T12:00:00Z'))))
  throw new Error('AGENDA_DIA_INVALIDO');
 if(!Number.isSafeInteger(p.ultimoSlot)||p.ultimoSlot< -1)
  throw new Error('AGENDA_SLOT_INVALIDO');
 return p;
}
function agoraLocal(agoraMs){
 if(!Number.isSafeInteger(agoraMs)||agoraMs<0)
  throw new Error('AGENDA_RELOGIO_INVALIDO');
 const partes=new Intl.DateTimeFormat('en-US',{
  timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date(agoraMs));
 const map=Object.fromEntries(partes.map(p=>[p.type,p.value]));
 const dia=map.year+'-'+map.month+'-'+map.day;
 const minuto=Number(map.hour)%24*60+Number(map.minute);
 return {dia,minuto,horario:map.hour+':'+map.minute};
}
function avaliarAgenda(config,agoraMs){
 const c=validarAgenda({...config});
 const agora=agoraLocal(agoraMs);
 const fechar=agora.dia===c.excecaoData?c.excecaoFechamento:c.fechamento;
 const inicio=minutos(c.abertura),fim=minutos(fechar);
 const dentroDoHorario=agora.minuto>=inicio&&agora.minuto<fim;
 const slot=Math.floor((agora.minuto-inicio)/c.intervaloMinutos);
 const liberavel=c.ativo&&dentroDoHorario&&!c.pausaManual&&slot>=1&&
  (c.ultimoDia!==agora.dia||slot>c.ultimoSlot);
 return {fuso:FUSO,dia:agora.dia,horarioLocal:agora.horario,
  abertura:c.abertura,fechamentoAplicado:fechar,
  dentroDoHorario,pausaManual:c.pausaManual,ativo:c.ativo,
  podeContabilizar:liberavel,slot,
  // Nunca multiplicar pulsos apos falta de energia: apenas UM por execucao.
  pulsoMaximo:liberavel?1:0,
  intervaloMinutos:c.intervaloMinutos,
  proximaLuzNoMinuto:slot>=0?inicio+(slot+1)*c.intervaloMinutos:inicio+c.intervaloMinutos};
}
module.exports={PADRAO,FUSO,minutos,validarAgenda,agoraLocal,avaliarAgenda};