'use strict';
// Decisão única de cadência. Vendas/filas não dependem desta autorização.
const {agoraLocal,minutos}=require('./agenda-catraca-loop');
function avaliarExecucaoDistribuicao({agenda={},agoraMs,ativa=false,
 girosHoje=0,ultimoEventoEm=null,marcoExecucaoEm=null}={}){
 const abertura=agenda.janelaInicio||'09:00',fechamento=agenda.janelaFim||'18:00';
 const inicio=minutos(abertura),fim=minutos(fechamento),local=agoraLocal(agoraMs);
 const duracao=((fim-inicio+1440)%1440)||1440;
 const noturno=fim<=inicio;
 const dia=noturno&&local.minuto<inicio?
  new Date(Date.parse(local.dia+'T12:00:00Z')-86400000).toISOString().slice(0,10):local.dia;
 const comeco=Date.parse(dia+'T'+abertura+':00-03:00');
 const decorrido=agoraMs-comeco;
 const meta=agenda.metaCentrosDia??0,limite=agenda.limiteDiario??null;
 if(!Number.isSafeInteger(meta)||meta<0||meta>1000000||
    (limite!==null&&(!Number.isSafeInteger(limite)||limite<1))||
    !Number.isSafeInteger(girosHoje)||girosHoje<0||
    !['PAUSADA','MANUAL','AUTOMATICA'].includes(agenda.modo||'PAUSADA'))
  throw Error('DISTRIBUICAO_POLITICA_INVALIDA');
 const modo=meta>0?'PROGRAMADO':'LIVRE';
 const intervaloMs=meta>0?duracao*60000/(meta*6):null;
 const indice=intervaloMs===null?null:Math.floor(Math.max(0,decorrido)/intervaloMs);
 const base={modo,dia,abertura,fechamento,intervaloMs,indice,
  aberturaEmMs:comeco,fechamentoEmMs:comeco+duracao*60000,
  agoraServidorMs:agoraMs,proximaLuzPrevistaEmMs:intervaloMs===null?null:
   comeco+Math.ceil((Math.max(0,indice)+1)*intervaloMs)};
 const negar=motivo=>({...base,podeExecutar:false,motivo});
 if(!ativa||agenda.modo==='PAUSADA')return negar('DISTRIBUICAO_PAUSADA');
 // A última luz programada pertence ao fechamento; no livre, 18:00 fecha.
 if(decorrido<0||decorrido>=duracao*60000+(modo==='PROGRAMADO'?60000:0))return negar('FORA_DO_HORARIO');
 if(agenda.metaDataAlvo&&agenda.metaDataAlvo!==dia)return negar('FORA_DA_DATA');
 if(limite!==null&&girosHoje>=limite)return negar('LIMITE_DIARIO_ATINGIDO');
 if(meta>0&&girosHoje>=meta)return negar('META_DIARIA_ATINGIDA');
 if(intervaloMs===null&&Number.isSafeInteger(ultimoEventoEm)&&ultimoEventoEm>=agoraMs)
  return negar('AGUARDANDO_NOVA_LEITURA');
 if(intervaloMs!==null){
  if(indice<1)return negar('AGUARDANDO_PRIMEIRA_LUZ');
  const marco=comeco+Math.ceil(indice*intervaloMs);
  // START, retomada ou reprogramação não recuperam marcos vencidos.
  if((Number.isSafeInteger(marcoExecucaoEm)&&marco<=marcoExecucaoEm)||
     (Number.isSafeInteger(ultimoEventoEm)&&
      (ultimoEventoEm>=marco||agoraMs-ultimoEventoEm<intervaloMs)))
   return negar('AGUARDANDO_INTERVALO');
 }
 return {...base,podeExecutar:true,motivo:null};
}
module.exports={avaliarExecucaoDistribuicao};
