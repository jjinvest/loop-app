'use strict';
// Fonte unica do marcador da catraca em PC/celular, laboratorio e identidade.
// Exibe apenas estados autenticos recebidos do servidor. Nunca gera pagamentos.
(function(){
 function criar({elemento}={}){
  if(typeof elemento!=='function')throw Error('VISOR_CATRACA_ELEMENTO_OBRIGATORIO');
  const $=elemento;
 let agendaVisorCatraca=null,leituraVisorCatracaEm=0;
  let ultimoGiroCatracaVisto=null,ultimaLuzCatracaVista=null,limpezaFestaCatraca=null;
  let ultimaJanelaVisual=null,ultimoCentroObservado=null,ultimaFonteObservada=null;
  let festasPendentes=[];
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
   // A projeção visual permanece consultável após o fechamento do turno.
   // Ela não cria movimentação de dinheiro ou registros do motor.
   const finalizado=decorrido>=duracaoMs;
   const total=meta.quantidade*6;
   const passadasOriginais=Math.min(total,Math.floor(decorrido*total/duracaoMs));
   // O placar começa do zero no marco registrado, sem reescrever o turno.
   // A agenda permanece com a programação original e os LEDs acompanham
   // apenas os marcos posteriores à limpeza operacional de ensaio.
   let passadas=passadasOriginais;
   const marco=agenda.marcoZeramentoVisualMs;
   if(Number.isSafeInteger(marco)&&marco<=agoraMs){
    const anterior=horarioVisual({agenda:{...agenda,marcoZeramentoVisualMs:null},
     agoraMs:marco});
    if(anterior?.diaTurno===diaTurno)
     passadas=Math.max(0,passadasOriginais-anterior.passadas);
   }
   const luzes=passadas===0?0:(passadas-1)%6+1;
   const proxima=!finalizado&&passadasOriginais<total?
    agoraMs+Math.max(0,Math.ceil((passadasOriginais+1)*duracaoMs/total-decorrido)):
    null;
   // Quantidade de LUZES desta hora, não giros financeiros nem total do dia.
   // Mantém o mesmo cálculo por intervalos do relógio do tabuleiro.
   const emTurno=inicio<fim?atual>=inicio&&atual<fim:
    inicio>fim?atual>=inicio||atual<fim:true;
   const decorridoAntesHora=decorrido-
    (Number(partes.minute)*60000+Number(partes.second)*1000+agoraMs%1000);
   const passadasNoInicioHora=Math.min(total,Math.floor(
    Math.max(0,decorridoAntesHora)*total/duracaoMs));
   const luzesHora=emTurno&&!finalizado?
    Math.max(0,passadasOriginais-passadasNoInicioHora):0;
   return {luzes,passadas,total,proxima,diaTurno,finalizado,emTurno,luzesHora,
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
    // Ao encerrar, apagar LEDs, preservando os totais no placar.
    const ligada=compartilhado&&valido&&!estado.finalizado&&i<=estado.luzes;
    const lampadaAtual=ligada&&!estado.finalizado&&estado.luzes>0&&i===estado.luzes;
    bola.classList.toggle('loop03-relogio-luz-visual',ligada);
    // A lâmpada alcançada pelo próximo marco do relógio pulsa enquanto
    // o turno está ativo. As anteriores permanecem acesas; a próxima
    // acende exatamente ao vencer o intervalo. Sem executar giro/pagamento.
    bola.classList.toggle('loop03-relogio-luz-atual',lampadaAtual);
    if(compartilhado)bola.classList.toggle('loop03-marcador-aceso',
     ligada||i<=eventos);
    if(ligada&&!estado.finalizado&&chave!==ultimaJanelaVisual&&
       i===estado.luzes&&ultimaJanelaVisual!==null&&
       !document.hidden&&$('conteudoTabuleiro')?.hidden===false){
     bola.classList.remove('loop03-pulso-luz');
     void bola.offsetWidth;
     bola.classList.add('loop03-pulso-luz');
     setTimeout(()=>bola.classList.remove('loop03-pulso-luz'),920);
    }
   }
   ultimaJanelaVisual=chave;
   // Contador representativo de ciclos do turno, escolhido para o
   // ensaio interno. Uma volta visual completa exige 6 luzes do relogio.
   // Nunca creditar contemplacao, giro financeiro, posicao ou pagamento.
   const resumo=$('loop03StatusPosicao'),selecionada=$('loop03NumeroIntegrado');
   const operadorAberto=document.body?.classList?.contains?.('loop03-modo-operador')===true;
   if(compartilhado){
    // Contagem CANÔNICA: o servidor conta do 00h ao 23h59 em Brasília.
    // A janela móvel de 24h e a projeção local da agenda NÃO substituem
    // os registros do dia; o cronômetro local só estima a próxima luz.
    const hoje=agendaVisorCatraca?.luzesRelogioHoje;
    const fonteDia=Number.isSafeInteger(hoje)&&hoje>=0;
    const luzesDia=fonteDia?hoje:(valido?estado.passadas:null);
    const centrosDia=fonteDia?Math.floor(hoje/6):
     (valido?Math.floor(estado.passadas/6):null);
    const pulsosMeta=agendaVisorCatraca?.metaLotes?.quantidade;
    // Sem meta salva no relógio, mostrar zero; não reutilizar 60.
    const totalMeta=agendaVisorCatraca?.metaLotes===null?0:
     Number.isSafeInteger(pulsosMeta)&&pulsosMeta>=0?
     pulsosMeta*6:(valido?estado.total:null);
    const ciclos=$('loop03Giros24Integrado');
    if(ciclos)ciclos.textContent=centrosDia===null?'—':
     String(centrosDia);
    const luzes24h=$('loop03LuzesHoraIntegrado');
    if(luzes24h)luzes24h.textContent=luzesDia===null?'—':
     luzesDia+' / '+(totalMeta===null?'—':totalMeta);
    if(operadorAberto&&selecionada&&luzesDia!==null){
     selecionada.textContent=(luzesDia===0?0:((luzesDia-1)%6)+1)+' / 6';
     const titulo=selecionada.parentElement?.querySelector?.('small');
     if(titulo)titulo.textContent='EVENTOS NO CICLO';
    }
   }
   // No quadro direito do operador fica somente a luz do centro
   // (0/6 a 6/6). O progresso do dia já está no quadro central.
   if(resumo&&compartilhado&&operadorAberto)
    resumo.textContent='';
   const contador=$('motorContadorEventos');
   if(contador){
    // Estado legível da participação de lucro, sem repetir 0/6 ou 6/6.
    // Indicadores contábeis e eventos reais permanecem nos seus painéis.
    const pausa=agendaVisorCatraca?.pausaManual===true||
     agendaVisorCatraca?.modoExecucao==='STOP';
    const rodando=valido&&estado.emTurno===true&&!estado.finalizado&&
     !pausa;
    const livre=agendaVisorCatraca?.modoExecucao==='NATURAL'&&!pausa;
    const mensagem='RELÓGIO DE PARTICIPAÇÃO DE LUCRO — '+
     (rodando?'EM ANDAMENTO':livre?'MODO LIVRE':
      'FORA DO TURNO OU PAUSADO');
    if(contador.textContent!==mensagem)contador.textContent=mensagem;
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
     if(visual.finalizado){
      visor.textContent='00:00';
      titulo.textContent='TURNO ENCERRADO';
     }else if(proxima!==null){
      const segundos=Math.max(0,Math.ceil((proxima-agoraServidor)/1000));
      visor.textContent=String(Math.floor(segundos/60)).padStart(2,'0')+
       ':'+String(segundos%60).padStart(2,'0');
      titulo.textContent='PRÓXIMA LUZ · EVENTO';
     }else{
      visor.textContent='00:00';
      titulo.textContent='LUZES DO TURNO COMPLETAS';
     }
     estado.textContent='Eventos: '+visual.luzes+'/6 luzes · '+
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
  function festejarGiroCatraca(ordem){
   const area=$('celebracaoGiroCatraca');
   if(!area||document.hidden||$('conteudoTabuleiro')?.hidden)return;
   area.replaceChildren();
   if(limpezaFestaCatraca!==null)clearTimeout(limpezaFestaCatraca);
   const selo=document.createElement('span');
   selo.className='selo';selo.textContent='✨ '+((ordem+1)/2)+'º EVENTO DO TITULAR';
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
    limpezaFestaCatraca=null;
    if(festasPendentes.length)festejarGiroCatraca(festasPendentes.shift());
   },1450);
  }
  function observarCatracaNoVisor(giros,luzes,{centro=null,fonte=null}={}){
   if(!Number.isSafeInteger(giros)||giros<0||
      !Number.isSafeInteger(luzes)||luzes<0||luzes>6)return;
   // Somente eventos do ciclo observados no mesmo centro confirmado.
   // Não usar LEDs do relógio, saltos de giro, douradas ou referências visuais.
   const titular=centro?.dourada===false&&Number.isSafeInteger(centro.numero)&&centro.numero>0?
    centro.numero:null;
   const mesmaFonte=fonte!==null&&fonte===ultimaFonteObservada;
   const mesmoCiclo=mesmaFonte&&ultimoGiroCatracaVisto===giros;
   const visivel=!document.hidden&&$('conteudoTabuleiro')?.hidden===false;
   if(!mesmoCiclo||titular!==ultimoCentroObservado||!visivel){
    festasPendentes=[];
    if(limpezaFestaCatraca!==null){clearTimeout(limpezaFestaCatraca);limpezaFestaCatraca=null;}
    $('celebracaoGiroCatraca')?.replaceChildren();
   }
   if(mesmoCiclo&&ultimaLuzCatracaVista!==null&&luzes<ultimaLuzCatracaVista&&titular===ultimoCentroObservado)return;
   if(mesmoCiclo&&ultimaLuzCatracaVista!==null&&luzes>ultimaLuzCatracaVista&&visivel){
    for(let i=ultimaLuzCatracaVista+1;i<=luzes;i++){
     const bolinha=$('motorBolinha'+i);
     if(bolinha){bolinha.classList.remove('loop03-pulso-luz');
      void bolinha.offsetWidth;bolinha.classList.add('loop03-pulso-luz');
      setTimeout(()=>bolinha.classList.remove('loop03-pulso-luz'),920);
     }
     if(titular!==null&&titular===ultimoCentroObservado&&[1,3,5].includes(i))festasPendentes.push(i);
    }
    if(limpezaFestaCatraca===null&&festasPendentes.length)festejarGiroCatraca(festasPendentes.shift());
   }
   ultimoGiroCatracaVisto=giros;
   ultimaLuzCatracaVista=luzes;
   ultimoCentroObservado=titular;
   ultimaFonteObservada=fonte;
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
