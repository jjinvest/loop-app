'use strict';
// Fonte unica do marcador da catraca em PC/celular, laboratorio e identidade.
// Exibe apenas estados autenticos recebidos do servidor. Nunca gera pagamentos.
(function(){
 function criar({elemento}={}){
  if(typeof elemento!=='function')throw Error('VISOR_CATRACA_ELEMENTO_OBRIGATORIO');
  const $=elemento;
 let agendaVisorCatraca=null,leituraVisorCatracaEm=0;
  let ultimoGiroCatracaVisto=null,ultimaLuzCatracaVista=null,limpezaFestaCatraca=null;
  function atualizarMarcadorCatraca(){
   const visor=$('relogioTabuleiroIntegrado');
   const titulo=$('tituloRelogioTabuleiro');
   const estado=$('estadoRelogioTabuleiro');
   if(!visor||!titulo||!estado)return;
   const agenda=agendaVisorCatraca,modo=agenda?.modoExecucao;
   const meta=agenda?.metaLotes;
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
     estado.textContent=meta?.ativa===true?
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
