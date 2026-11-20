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
 // BigInt evita perda de precisao ao distribuir metas grandes,
 // inclusive 1 milhao ou qualquer inteiro seguro configurado pelo admin.
 const alvo=prazo?Number((
  BigInt(transcorrido)*BigInt(meta.quantidade)
 )/BigInt(restante)):0;
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

// A grade distribui seis janelas por ciclo, sem gerar venda ou prometer saldo.
// O minuto final pertence ao turno, nao ao minuto seguinte ao fechamento.
function janelasDeLuz(meta,agenda,agoraMs){
 const p=planejado(meta,agenda,agoraMs);
 if(!p.abertoParaMeta)return null;
 const inicio=minutos(agenda.abertura);
 const comeco=meta.ativadaDia===p.dia?
  Math.max(0,Math.min(meta.ativadaMinuto-inicio,
   p.minutoNoTurno+p.duracaoMinutos)):
  0;
 const duracao=p.duracaoMinutos;
 if(duracao<1||meta.quantidade<1)return null;
 const total=BigInt(meta.quantidade)*6n;
 // Ultima janela e agendada NO ultimo minuto aberto do turno.
 // 09:00–18:00 com 10 ciclos: primeira luz 09:09, sexto evento 09:54.
 const periodo=BigInt(Math.max(1,duracao-1));
 const percorrido=BigInt(Math.min(duracao-1,
  Math.max(0,p.minutoNoTurno-comeco)));
 const aprovadasBig=percorrido*total/periodo;
 const aprovadas=Number(aprovadasBig>BigInt(Number.MAX_SAFE_INTEGER)?
  BigInt(Number.MAX_SAFE_INTEGER):aprovadasBig);
 const proximo=aprovadasBig+1n;
 let proximaJanelaEmMs=null;
 if(proximo<=total){
  const indiceMinuto=(proximo*periodo+total-1n)/total;
  const diferenca=Number(indiceMinuto)-
   (p.minutoNoTurno-comeco);
  // O servidor e a fonte de tempo; cliente nao depende do fuso do aparelho.
  const segundos=new Date(agoraMs).getSeconds()*1000+
   new Date(agoraMs).getMilliseconds();
  proximaJanelaEmMs=agoraMs+diferenca*60000-segundos;
 }
 return {
  janelasAutorizadasAteAgora:aprovadas,
  proximaJanelaEmMs,
  intervaloLuzSegundos:Math.max(1,Math.round(duracao*60/
   (meta.quantidade*6))),
  intervaloCicloSegundos:Math.max(1,Math.round(duracao*60/meta.quantidade)),
  marcoEstimado:true,dependeDeCompraConciliada:true
 };
}

// Calculo exibido na configuracao do operador. O motor continua a
// distribuir cada uma das seis janelas por ciclo pelo relogio do servidor.
function calcularIntervaloMeta({abertura,fechamento,quantidade}={}){
 if(!Number.isSafeInteger(quantidade)||quantidade<0)
  throw Error('META_LOTES_CONFIG_INVALIDA');
 const inicio=minutos(abertura),fim=minutos(fechamento);
 const duracao=((fim-inicio+1440)%1440)||1440;
 if(quantidade===0)return {duracaoMinutos:duracao,
  luzesPlanejadas:0,intervaloMinutos:null,intervaloLuzSegundos:null};
 const luzes=BigInt(quantidade)*6n;
 const segundos=Math.max(1,Math.round((duracao*60)/(quantidade*6)));
 return {duracaoMinutos:duracao,
  luzesPlanejadas:luzes.toString(),
  intervaloMinutos:Math.max(1,Math.ceil(duracao/(quantidade*6))),
  intervaloLuzSegundos:segundos};
}
// Contador previsto do operador: distribui as seis janelas de cada centro
// no turno cadastrado. Nao cria luz, evento, giro, saldo nem pagamento.
// O horario e a data sao os da fonte de tempo do servidor em Brasilia.
function proximaJanelaMetaRelogio({abertura,fechamento,quantidade,
 agoraMs,horarioLocal}={}){
 const plano=calcularIntervaloMeta({abertura,fechamento,quantidade});
 if(!Number.isSafeInteger(agoraMs)||agoraMs<0||
    typeof horarioLocal!=='string'||
    !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(horarioLocal))
  throw Error('META_RELOGIO_HORARIO_INVALIDO');
 if(quantidade===0)return null;
 const inicio=minutos(abertura);
 const minutoAtual=minutos(horarioLocal);
 const duracaoMs=plano.duracaoMinutos*60000;
 // Modulo tambem contempla janela que atravessa a meia-noite.
 const decorrido=((minutoAtual-inicio+1440)%1440)*60000+
  agoraMs%60000;
 if(decorrido>=duracaoMs)return null;
 const total=quantidade*6;
 const indice=Math.floor(decorrido*total/duracaoMs)+1;
 if(indice>total)return null;
 const proxima=agoraMs-decorrido+
  Math.ceil(indice*duracaoMs/total);
 return proxima>agoraMs?proxima:null;
}
function dadosAtivacao(agoraMs){
 const a=agoraLocal(agoraMs);
 return {ativadaDia:a.dia,
  ativadaMinuto:minutos(a.horario)};
}
module.exports={validarMeta,planejado,janelasDeLuz,dadosAtivacao,
 calcularIntervaloMeta,proximaJanelaMetaRelogio};
