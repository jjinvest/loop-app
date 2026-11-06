'use strict';
// Distribui uma META de ate N ciclos ENTRE o inicio e fim do turno.
// Meta nunca e pagamento nem garantia de completar N movimentos.
// Somente compras do PSP ja conciliadas permitem completar ciclos.
const {PADRAO,validarAgenda,avaliarAgenda,minutos,agoraLocal}=
 require('./agenda-catraca-loop');
const DIA=/^\d{4}-\d{2}-\d{2}$/;
function diaValido(d){
 if(d===null)return true;
 if(typeof d!=='string'||!DIA.test(d))return false;
 const parsed=new Date(d+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&
  parsed.toISOString().slice(0,10)===d;
}
function validarMeta(m){
 if(!m||typeof m!=='object'||Array.isArray(m)||
    !Number.isSafeInteger(m.quantidade)||m.quantidade<0||
    !diaValido(m.dataAlvo)||
    !diaValido(m.ativadaDia)||!diaValido(m.ultimoDia)||
    !Number.isSafeInteger(m.ativadaMinuto)||m.ativadaMinuto<0||
    m.ativadaMinuto>1439||
    !Number.isSafeInteger(m.baseGiros)||m.baseGiros<0||
    !Number.isSafeInteger(m.ultimoMinuto)||m.ultimoMinuto< -1)
  throw Error('META_LOTES_CONFIG_INVALIDA');
 return m;
}
function planejado(meta,agenda,agoraMs){
 validarMeta(meta);
 validarAgenda({...PADRAO,...agenda});
 const horario=avaliarAgenda({...PADRAO,...agenda,
  ativo:true,intervaloMinutos:1},agoraMs);
 const inicio=minutos(agenda.abertura);
 let fim=minutos(horario.fechamentoAplicado);
 if(fim<=inicio)fim+=1440;
 const duracao=fim-inicio;
 const dia=horario.dia;
 const minuto=horario.slot;
 const aplicaDia=meta.dataAlvo===null||meta.dataAlvo===dia;
 // Se o admin programar no meio do turno, distribuir a quantidade
 // entre a ativacao e o encerramento; nunca liberar atrasos de rajada.
 let comeco=0;
 if(meta.ativadaDia===dia){
  const d=meta.ativadaMinuto-inicio;
  comeco=Math.max(0,Math.min(d,duracao));
 }
 const restante=duracao-comeco;
 const prazo=horario.dentroDoHorario&&aplicaDia&&restante>0&&
  minuto>=comeco&&meta.quantidade>0;
 const transcorrido= Math.max(0,minuto-comeco+1);
 const alvo=prazo?Math.min(meta.quantidade,
  Math.floor(transcorrido*meta.quantidade/restante)):0;
 return {
  dia,horarioLocal:horario.horarioLocal,
  dentroDoHorario:horario.dentroDoHorario,
  dataAlvoAtendida:aplicaDia,
  abertoParaMeta:prazo,
  duracaoMinutos:restante,
  minutoNoTurno:minuto,
  metaDoDia:meta.quantidade,
  // Este numero e um TETO, nunca uma promessa de execucao.
  ciclosAutorizadosAteAgora:alvo,
  ultimoMinutoProcessado:meta.ultimoDia===dia?meta.ultimoMinuto:-1,
  fuso:horario.fuso
 };
}
function dadosAtivacao(agoraMs){
 const a=agoraLocal(agoraMs);
 return {ativadaDia:a.dia,
  ativadaMinuto:minutos(a.horario)};
}
module.exports={validarMeta,planejado,dadosAtivacao};
