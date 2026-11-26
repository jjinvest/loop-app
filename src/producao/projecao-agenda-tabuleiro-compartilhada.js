'use strict';
// Uma projeção LEITURA para os visores OPERADOR e CLIENTE do mesmo motor.
// Não agenda, movimenta, vende, confirma caixa ou executa giro.
const MODOS=new Set(['PAUSADA','MANUAL','AUTOMATICA']);
const HORA=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATA=/^\d{4}-\d{2}-\d{2}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function projetarAgendaTabuleiroCompartilhada(estado){
 if(!estado||!MODOS.has(estado.modo)||
    !HORA.test(estado.janelaInicio||'')||
    !HORA.test(estado.janelaFim||'')||
    !Number.isSafeInteger(estado.agoraServidorMs)||
    !Number.isSafeInteger(estado.metaCentrosDia)||
    estado.metaCentrosDia<0||estado.metaCentrosDia>1000000||
    !Number.isSafeInteger(estado.eventosNoCiclo)||
    estado.eventosNoCiclo<0||estado.eventosNoCiclo>6||
    !Number.isSafeInteger(estado.ciclosConcluidos)||
    estado.ciclosConcluidos<0||
    !Number.isSafeInteger(estado.girosHoje)||estado.girosHoje<0||
    !Number.isSafeInteger(estado.giros24h)||estado.giros24h<0||
    (estado.luzesRelogio24h!==undefined&&
     (!Number.isSafeInteger(estado.luzesRelogio24h)||estado.luzesRelogio24h<0))||
    (estado.ciclosRelogio24h!==undefined&&
     (!Number.isSafeInteger(estado.ciclosRelogio24h)||estado.ciclosRelogio24h<0))||
    (estado.girosHora!==undefined&&
     (!Number.isSafeInteger(estado.girosHora)||estado.girosHora<0))||
    (estado.metaDataAlvo!==null&&estado.metaDataAlvo!==undefined&&
     !DATA.test(estado.metaDataAlvo))||
    (estado.marcoZeramentoVisualMs!==null&&
     estado.marcoZeramentoVisualMs!==undefined&&
     (!Number.isSafeInteger(estado.marcoZeramentoVisualMs)||
      estado.marcoZeramentoVisualMs>estado.agoraServidorMs)))
  falha('TABULEIRO_AGENDA_PUBLICA_INVALIDA');
 // Flag designa o mesmo relógio de visualização nas DUAS sessões.
 // Contagens dessa agenda não são eventos financeiros ou ciclos concluídos.
 return Object.freeze({
  origem:'CATRACA_REAL_MESMO_SQLITE',
  somenteLeitura:true,financeiroReal:false,
  modoExecucao:estado.modo==='PAUSADA'?'STOP':
   estado.metaCentrosDia>0?'AGENDADA':'NATURAL',
  pausaManual:estado.modo==='PAUSADA',
  dentroDoHorario:estado.horarioPermitido===true,
  abertura:estado.janelaInicio,fechamento:estado.janelaFim,
  agoraServidorMs:estado.agoraServidorMs,
  luzesDoRelogioCompartilhado:true,
  marcoZeramentoVisualMs:estado.marcoZeramentoVisualMs??null,
  eventosReaisNoCiclo:estado.eventosNoCiclo,
  ciclosReaisConcluidos:estado.ciclosConcluidos,
  girosReaisHoje:estado.girosHoje,girosReais24h:estado.giros24h,
  girosReaisHora:estado.girosHora??null,
  // Contadores visuais de 24h calculados pelo historico do MESMO SQLite.
  // Independentes de giros e pagamentos reais (contagem separada).
  luzesRelogio24h:estado.luzesRelogio24h??null,
  ciclosRelogio24h:estado.ciclosRelogio24h??null,
  luzesRelogioHoje:estado.luzesRelogioHoje??null,
  ciclosRelogioHoje:estado.ciclosRelogioHoje??null,
  luzesRelogioAcumuladas:estado.luzesRelogioAcumuladas??null,
  ciclosRelogioAcumulados:estado.ciclosRelogioAcumulados??null,
  metaLotes:estado.metaCentrosDia>0?{
   ativa:true,quantidade:estado.metaCentrosDia,
   dataAlvo:estado.metaDataAlvo??null,
   intervaloLuzSegundos:estado.intervaloLuzSegundos,
   proximaLuzPrevistaEmMs:estado.proximaLuzPrevistaEmMs,
   exigeCaixaReal:true
  }:null
 });
}
module.exports={projetarAgendaTabuleiroCompartilhada};