'use strict';
// Fonte unica do marcador da catraca em PC/celular, laboratorio e identidade.
// Exibe apenas estados autenticos recebidos do servidor. Nunca gera pagamentos.
(function(){
 function criar({elemento}={}){
  if(typeof elemento!=='function')throw Error('VISOR_CATRACA_ELEMENTO_OBRIGATORIO');
  const $=elemento;
 let agendaVisorCatraca=null,leituraVisorCatracaEm=0;
  let ultimoGiroCatracaVisto=null,ultimaLuzCatracaVista=null,limpezaFestaCatraca=null;
  let ultimaJanelaVisual=null;
  // Horário vindo do servidor (SQLite do operador), não do fuso do celular.
  const fusoVisual=new Intl.DateTimeFormat('en-US',{
   timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',
   day:'2-digit',hour:'2-digit',minute:'2-digit',
   second:'2-digit',hourCycle:'h23'
  });
  function minuto(h){
   if(typeof h!=='string'||!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(h))
    return null;
   return Number(h.slice(0,2))*60+Number(h.slice(3));
  }
  function diaAnterior(dia){
   const x=Date.parse(dia+'T12:00:00Z');
   return new Date(x-86400000).toISOString().slice(0,10);
  }
  function horarioVisual({agenda,agoraMs}){
   const meta=agenda?.metaLotes;
   if((agenda?.luzesDoRelogioCompartilhado!==true&&
      agenda?.luzesDoRelogioOperador!==true)||
      agenda.modoExecucao!=='AGENDADA'||agenda.pausaManual===true||
      meta?.ativa!==true||meta.quantidade<1||
      !Number.isSafeInteger(meta.quantidade)||meta.quantidade>1000000)
    return null;
   const inicio=minuto(agenda.abertura),fim=minuto(agenda.fechamento);
   if(inicio===null||fim===null||
      !Number.isSafeInteger(agoraMs)||agoraMs<0)return null;
   const partes=Object.fromEntries(
    fusoVisual.formatToParts(new Date(agoraMs))
     .map(x=>[x.type,x.value]));
   const atual=Number(partes.hour)*60+Number(partes.minute);
   const dia=partes.year+'-'+partes.month+'-'+partes.day;
   const diaTurno=atual<inicio?diaAnterior(dia):dia;
   if(meta.dataAlvo!==null&&meta.dataAlvo!==undefined&&
      meta.dataAlvo!==diaTurno)return null;
   const duracaoMin=((fim-inicio+1440)%1440)||1440;
   const duracaoMs=duracaoMin*60000;
   const decorrido=((atual-inicio+1440)%1440)*60000+
    Number(partes.second)*1000+(agoraMs%1000);
   if(decorrido>=duracaoMs)return null;
   const total=meta.quantidade*6;
   const passadas=Math.min(total,Math.floor(decorrido*total/duracaoMs));
   const luzes=passadas===0?0:(passadas-1)%6+1;
   const proxima=passadas<total?
    agoraMs+Math.max(0,Math.ceil((passadas+1)*duracaoMs/total-decorrido)):
    null;
   return {luzes,passadas,total,proxima,diaTurno,
    intervalo:Math.max(1,Math.round(duracaoMs/total/1000))};
  }
  function sincronizarLuzesVisuais(estado){
   const valido=estado!==null;
   const chave=valido?estado.diaTurno+':'+estado.passadas:null;
   // Usa exatamente o brilho aprovado, sem alterar o CSS do tabuleiro.
   // A classe separada e o contador distinguem relógio de eventos confirmados.
   const compartilhado=agendaVisorCatraca?.luzesDoRelogioCompartilhado===true||
    agendaVisorCatraca?.luzesDoRelogioOperador===true;
   const eventos=compartilhado&&Number.isSafeInteger(
    agendaVisorCatraca.eventosReaisNoCiclo)?
    agendaVisorCatraca.eventosReaisNoCiclo:0;
   for(let i=1;i<=6;i++){
    const bola=$('motorBolinha'+i);
    if(!bola)continue;
    const ligada=compartilhado&&valido&&i<=estado.luzes;
    const lampadaAtual=ligada&&estado.luzes>0&&i===estado.luzes;
    bola.classList.toggle('loop03-relogio-luz-visual',ligada);
    // A lâmpada alcançada pelo próximo marco do relógio pulsa enquanto
    // o turno está ativo. As anteriores permanecem acesas; a próxima
    // acende exatamente ao vencer o intervalo. Sem executar giro/pagamento.
    bola.classList.toggle('loop03-relogio-luz-atual',lampadaAtual);
    if(compartilhado)bola.classList.toggle('loop03-marcador-aceso',
     ligada||i<=eventos);
    if(ligada&&chave!==ultimaJanelaVisual&&
       i===estado.luzes&&ultimaJanelaVisual!==null&&
       !document.hidden&&$('conteudoTabuleiro')?.hidden===false){
     bola.classList.remove('loop03-pulso-luz');
     void bola.offsetWidth;
     bola.classList.add('loop03-pulso-luz');
     setTimeout(()=>bola.classList.remove('loop03-pulso-luz'),920);
    }
   }
   ultimaJanelaVisual=chave;
   // A evolução visual não é contabilizada como giro/ciclo comprovado.
   // Os números fortes dos 3 indicadores continuam vindos do livro real.
   const resumo=$('loop03StatusPosicao'),selecionada=$('loop03NumeroIntegrado');
   const operadorAberto=document.body?.classList?.contains?.('loop03-modo-operador')===true;
   const giroReal=agendaVisorCatraca?.girosReaisHoje;
   const ciclosReais=agendaVisorCatraca?.ciclosReaisConcluidos;
   if(resumo&&compartilhado&&Number.isSafeInteger(giroReal)&&
      Number.isSafeInteger(ciclosReais)&&
      (operadorAberto||selecionada?.textContent==='—')){
    resumo.textContent=valido?
     'Relógio visual: '+estado.passadas+'/'+estado.total+
      ' luzes previstas · Ciclos reais: '+ciclosReais+
      ' · Giros reais hoje: '+giroReal:
     'Relógio fora do turno · Ciclos reais: '+ciclosReais+
      ' · Giros reais hoje: '+giroReal;
   }
   const contador=$('motorContadorEventos');
   if(contador&&compartilhado){
    const reais=agendaVisorCatraca.eventosReaisNoCiclo;
    contador.textContent=valido?
     'Relógio: '+estado.luzes+' de 6 luzes · Eventos confirmados: '+
      (Number.isSafeInteger(reais)?reais:0)+' de 6':
     'Relógio de teste fora do turno ou pausado · Eventos confirmados: '+
      (Number.isSafeInteger(reais)?reais:0)+' de 6';
   }
  }
  function atualizarMarcadorCatraca(){
   const visor=$('relogioTabuleiroIntegrado');
   const titulo=$('tituloRelogioTabuleiro');
   const estado=$('estadoRelogioTabuleiro');
   if(!visor||!titulo||!estado)return;
   const agenda=agendaVisorCatraca,modo=agenda?.modoExecucao;
   const meta=agenda?.metaLotes;
   const agoraServidor=Number.isSafeInteger(agenda?.agoraServidorMs)?
    agenda.agoraServidorMs+(Date.now()-leituraVisorCatracaEm):Date.now();
   const visual=horarioVisual({agenda,agoraMs:agoraServidor});
   sincronizarLuzesVisuais(visual);
   if(agenda?.luzesDoRelogioCompartilhado===true||
      agenda?.luzesDoRelogioOperador===true){
    if(visual){
     const proxima=visual.proxima;
     if(proxima!==null){
      const segundos=Math.max(0,Math.ceil((proxima-agoraServidor)/1000));
      visor.textContent=String(Math.floor(segundos/60)).padStart(2,'0')+
       ':'+String(segundos%60).padStart(2,'0');
      titulo.textContent='PRÓXIMA LUZ · RELÓGIO';
     }else{
      visor.textContent='00:00';
      titulo.textContent='LUZES DO TURNO COMPLETAS';
     }
     estado.textContent='Relógio: '+visual.luzes+'/6 luzes · '+
      visual.passadas+'/'+visual.total+' do dia · '+
      Math.floor(visual.intervalo/60)+' min'+
      (visual.intervalo%60?' '+visual.intervalo%60+' s':'')+
      '/luz · execução visual';
    }else{
     visor.textContent='--:--';
     titulo.textContent=modo==='STOP'||agenda?.pausaManual===true?
      'CATRACA PAUSADA':modo==='NATURAL'?'MODO MANUAL':'FORA DO TURNO';
     estado.textContent='Luzes do relógio aguardando horário e meta ativa';
    }
    return;
   }
   if(modo==='AGENDADA'&&agenda.dentroDoHorario===true&&
      agenda.pausaManual!==true){
    const proxima=meta?.ativa===true?
     meta.proximaLuzPrevistaEmMs:agenda.proximaLuzPrevistaEmMs;
    if(Number.isSafeInteger(proxima)&&proxima>0){
     const servidor=Number.isSafeInteger(agenda.agoraServidorMs)?
      agenda.agoraServidorMs+(Date.now()-leituraVisorCatracaEm):Date.now();
     const segundos=Math.max(0,Math.ceil((proxima-servidor)/1000));
     visor.textContent=String(Math.floor(segundos/60)).padStart(2,'0')+
      ':'+String(segundos%60).padStart(2,'0');
     titulo.textContent='PRÓXIMA LUZ · PREVISÃO';
     const intervalo=meta?.intervaloLuzSegundos;
    const descricaoIntervalo=Number.isSafeInteger(intervalo)&&intervalo>0?
     Math.floor(intervalo/60)+' min'+(intervalo%60?
      ' '+intervalo%60+' s':'')+'/luz':'horario a confirmar';
    estado.textContent=meta?.ativa===true?
     meta.exigeCaixaReal===true?
      'Meta '+meta.quantidade+' centro(s) · '+descricaoIntervalo+
      ' · exige caixa real comprovado':
      'Meta '+meta.quantidade+' ciclos · '+Math.round(
       meta.intervaloLuzSegundos/60)+' min/luz · depende de vendas':
     'Janela programada · depende de vendas';
     return;
    }
    titulo.textContent='JANELAS DO TURNO';
    visor.textContent='--:--';
    estado.textContent='Aguardando novo horário ou vendas conciliadas';
    return;
   }
   visor.textContent='--:--';
   if(modo==='STOP'||agenda?.pausaManual===true){
    titulo.textContent='CATRACA PAUSADA';
    estado.textContent='Pelo administrador';
   }else if(modo==='NATURAL'){
    titulo.textContent='FLUXO NATURAL';
    estado.textContent='Sem contagem regressiva';
   }else if(modo==='AGENDADA'){
    titulo.textContent='FORA DO TURNO';
    estado.textContent=(agenda.abertura||'09:00')+'–'+
     (agenda.fechamentoAplicado||agenda.fechamento||'18:00');
   }else{
    titulo.textContent='AGUARDANDO AGENDA';
    estado.textContent='A catraca não tem janela ativa';
   }
  }
  function registrarAgendaNoMarcador(agenda){
   agendaVisorCatraca=agenda&&typeof agenda==='object'?agenda:null;
   leituraVisorCatracaEm=Date.now();
   atualizarMarcadorCatraca();
  }
  function iniciarRelogioTabuleiro(){
   atualizarMarcadorCatraca();
   window.setInterval(atualizarMarcadorCatraca,1000);
  }
  function festejarGiroCatraca(){
   const area=$('celebracaoGiroCatraca');
   if(!area||document.hidden||$('conteudoTabuleiro')?.hidden)return;
   area.replaceChildren();
   if(limpezaFestaCatraca!==null)clearTimeout(limpezaFestaCatraca);
   const selo=document.createElement('span');
   selo.className='selo';selo.textContent='✨ CICLO CONCLUÍDO · ENSAIO';
   area.appendChild(selo);
   const reduzido=typeof window.matchMedia==='function'&&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(!reduzido){
    const cores=['#caa3f9','#f4d480','#e8eef6','#a76aef'];
    for(let i=0;i<18;i++){
     const angulo=2*Math.PI*i/18,dist=90+(i%4)*22;
     const p=document.createElement('span');
     p.className='confete';
     p.style.setProperty('--dx',Math.round(Math.cos(angulo)*dist)+'px');
     p.style.setProperty('--dy',Math.round(Math.sin(angulo)*dist)+'px');
     p.style.setProperty('--giro',(180+i*37)+'deg');
     p.style.setProperty('--cor',cores[i%cores.length]);
     area.appendChild(p);
    }
   }
   limpezaFestaCatraca=setTimeout(()=>{area.replaceChildren();
    limpezaFestaCatraca=null;},1450);
  }
  function observarCatracaNoVisor(giros,luzes){
   if(!Number.isSafeInteger(giros)||giros<0||
      !Number.isSafeInteger(luzes)||luzes<0||luzes>6)return;
   if(ultimoGiroCatracaVisto!==null&&giros>ultimoGiroCatracaVisto)
    festejarGiroCatraca();
   else if(ultimoGiroCatracaVisto===giros&&
     ultimaLuzCatracaVista!==null&&luzes>ultimaLuzCatracaVista&&
     !document.hidden&&$('conteudoTabuleiro')?.hidden===false){
    for(let i=ultimaLuzCatracaVista+1;i<=luzes;i++){
     const bolinha=$('motorBolinha'+i);
     if(bolinha){bolinha.classList.remove('loop03-pulso-luz');
      void bolinha.offsetWidth;bolinha.classList.add('loop03-pulso-luz');
      setTimeout(()=>bolinha.classList.remove('loop03-pulso-luz'),920);
     }
    }
   }
   ultimoGiroCatracaVisto=giros;
   ultimaLuzCatracaVista=luzes;
  }
  
  let iniciado=false;
  return Object.freeze({
   iniciar(){if(iniciado)return;iniciado=true;iniciarRelogioTabuleiro();},
   registrarAgenda:registrarAgendaNoMarcador,
   observar:observarCatracaNoVisor
  });
 }
 Object.defineProperty(window,'LoopVisorCatraca',{
  value:Object.freeze({criar}),writable:false,configurable:false
 });
})();
