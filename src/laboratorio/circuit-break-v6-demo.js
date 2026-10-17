'use strict';

// Interface local para giros FICTICIOS; nunca habilita saques nem PSP.
(()=>{
  const el=id=>document.getElementById(id);
  const money=centavos=>new Intl.NumberFormat('pt-BR',
    {style:'currency',currency:'BRL'}).format(centavos/100);
  const recurso='/api/admin/circuit-break-v6-demo';
  let token='',estado=null,ocupado=false;

  async function api(caminho='',opcoes={}){
    const resposta=await fetch(recurso+caminho,{
      cache:'no-store',...opcoes,
      headers:{'Authorization':'Bearer '+token,
        ...(opcoes.body?{'Content-Type':'application/json'}:{})}
    });
    const payload=await resposta.json();
    if(!resposta.ok)throw new Error(payload.erro||'REQUISICAO_RECUSADA');
    return payload;
  }
  function mostrar(dados){
    estado=dados;
    el('conteudoCBV6').hidden=false;
    const aberto=dados.status==='ABERTA';
    el('resumoCBV6').textContent=
      'Catraca: '+dados.status+
      ' | Giros concluídos: '+dados.girosConcluidos+
      ' / 300 | Hoje ('+dados.diaLocal+'): '+dados.girosHoje+
      ' de '+dados.limiteDiario+
      ' | Podem sair hoje: '+dados.restantesHoje+
      ' | Giros prontos aguardando liberação: '+dados.girosProntos+'.';
    el('filaCBV6').textContent=
      'Compras criadas no laboratório: '+dados.comprasFicticiasGeradas+
      ' | Eventos já usados: '+dados.comprasFicticiasProcessadas+
      ' | Compras fictícias pendentes: '+dados.comprasPendentes+
      ' | Fila A: '+dados.filaA+' | Fila B: '+dados.filaB+
      ' | Centro: '+(dados.centro||'não ocupado')+'.';
    el('caixaCBV6').textContent=
      'APENAS MATEMÁTICA DO TESTE — PDFs simulados: '+
      money(dados.financeiroFicticio.vendasBrutasCentavos)+
      ' | Centros: '+money(dados.financeiroFicticio.centrosCentavos)+
      ' | Investimento: '+money(dados.financeiroFicticio.investimentoCentavos)+
      ' | Reserva: '+money(dados.financeiroFicticio.reservaCentavos)+
      ' | Saldos e pagamentos reais: R$ 0,00.';
    el('limiteDiarioCBV6').value=String(dados.limiteDiario);
    el('abrirCatracaCBV6').disabled=aberto;
    el('pausarCatracaCBV6').disabled=!aberto;
    el('gerarComprasCBV6').disabled=dados.comprasFicticiasGeradas>=1800;
  }
  function exibirCofresPre(d){
    el('resumoPreV6').textContent=
      'Fase: '+d.fase+' | Aportes fictícios separados: '+(d.aportesFicticiosConfirmados||0)+
      ' | Total alocado no LOOP (sem dinheiro real): '+money(d.totalHipoteticoCentavos||0)+
      ' | Cofre central: '+money(d.centroRestanteSimuladoCentavos||0)+
      ' | Esquerda: '+money(d.investimentoRestanteSimuladoCentavos||0)+
      ' | Direita: '+money(d.reservaRestanteSimuladoCentavos||0)+
      ' | Douradas (quarto cofre): '+money(d.douradasAcumuladoSimuladoCentavos||0)+
      ' | Previsões lançadas no escritório: '+money(d.escritoriosPrevistosSimuladoCentavos||0)+
      ' | Saldo real sacável: R$ 0,00.';
    el('configurarPreV6').disabled=!!d.configurado;
    el('startPreV6').disabled=!d.configurado||d.fase!=='ARRECADACAO';
  }
  async function atualizarPre(){
    const dados=await api('/ponte/prelancamento');
    exibirCofresPre(dados);
    const conciliacao=await api('/ponte/conciliacao');
    const mostrar=el('balancoCofresV6');
    if(conciliacao.fase==='INATIVO'){
      mostrar.textContent='Pré-lançamento não configurado; nenhum saldo do LOOP apurado.';
    }else{
      mostrar.textContent=
        'Conferência: '+conciliacao.integridadeDemonstrativa+
        ' | Compras comerciais (não são saldo do LOOP): '+
        conciliacao.comprasComerciaisSemCreditoAutomatico+
        ' | Aportes separados: '+conciliacao.quantidadeAportesSeparados+
        ' | Centro restante: '+money(conciliacao.cofreCentroRestanteSimuladoCentavos)+
        ' | Investimento: '+money(conciliacao.cofreEsquerdaSimuladoCentavos)+
        ' | Reserva: '+money(conciliacao.cofreDireitaSimuladoCentavos)+
        ' | Douradas: '+money(conciliacao.cofreDouradasSimuladoCentavos)+
        ' | Escritórios (somente previsto): '+
        money(conciliacao.valoresApenasPrevistosNosEscritoriosCentavos)+
        ' | Divergências: '+conciliacao.quantidadeDivergencias+
        (conciliacao.divergencias.length?
          ' ('+conciliacao.divergencias.map(d=>d.codigo).join(', ')+')':'')+
        '. CONFERÊNCIA BANCÁRIA REAL: NÃO REALIZADA. Saques: R$ 0,00.';
    }
    return dados;
  }
  async function atualizarGestao(){
    const resposta=await api('/ponte/gestao-proprietario');
    const lista=el('historicoGestaoProprietarioV6');
    lista.replaceChildren();
    if(!resposta.registros.length){
      const item=document.createElement('li');
      item.textContent='Nenhuma solicitação de gestão registrada.';
      lista.append(item);
    }
    for(const linha of resposta.registros){
      const item=document.createElement('li');
      item.textContent=linha.criadoEm+' — '+linha.cofreOrigem+' → '+linha.destino+
        ': '+money(linha.valorCentavos)+' — '+linha.status+
        ' — '+linha.justificativa+' (nenhuma transferência real)';
      lista.append(item);
    }
  }
  async function solicitarGestao(e){
    e.preventDefault();
    if(ocupado||!token)return;
    ocupado=true;
    const msg=el('estadoGestaoProprietarioV6');
    try{
      const v=Number(el('valorGestaoV6').value);
      if(!Number.isFinite(v)||v<=0||!Number.isSafeInteger(Math.round(v*100)))
        throw new Error('Valor inválido');
      const body={
        movimentoId:'mov-prop-'+Array.from(
          crypto.getRandomValues(new Uint8Array(12)),
          x=>x.toString(16).padStart(2,'0')).join(''),
        cofreOrigem:el('cofreOrigemGestaoV6').value,
        destino:el('destinoGestaoV6').value,
        valorCentavos:Math.round(v*100),
        justificativa:el('motivoGestaoV6').value.trim()
      };
      const registro=await api('/ponte/gestao-proprietario',{
        method:'POST',body:JSON.stringify(body)});
      msg.textContent='Solicitação '+registro.movimentoId+
        ' registrada para análise. O saldo dos cofres não foi alterado e não houve Pix.';
      await atualizarGestao();
    }catch(err){msg.textContent='Solicitação recusada: '+err.message;}
    finally{ocupado=false;}
  }
  async function registrarPre(rota,payload){
    if(ocupado||!token)return;
    ocupado=true;
    try{
      const data=await api('/ponte/prelancamento/'+rota,{
        method:'POST',body:JSON.stringify(payload)});
      const estado=data.caixa||data;
      exibirCofresPre(estado);
      el('resultadoPreV6').textContent='Operação de laboratório registrada. Não houve depósito bancário.';
      await carregar();
    }catch(e){el('resultadoPreV6').textContent='Operação recusada: '+e.message;}
    finally{ocupado=false;}
  }
  async function carregarPonte(){
    const dados=await api('/ponte');
    el('resumoPonteCBV6').textContent=
      'Ponte cadastrada: '+dados.comprasElegiveis+
      ' pedidos internos fictícios; '+dados.comprasPendentes+
      ' ainda não utilizados; '+dados.girosProntosPorCompras+
      ' giros possíveis por compras, '+dados.girosConcluidos+
      ' concluídos. Lugares ocupados: '+dados.lugaresOcupados+
      '/7; aguardando na fila: '+dados.posicoesNaFila+
      '. Catraca: '+dados.catraca+'. Limite restante hoje: '+
      dados.restantesHoje+'. Créditos reais: R$ 0,00.';
    const livro=await api('/ponte/provisoes');
    el('provisoesPonteCBV6').textContent=
      'LIVRO DE PREVISÕES (sem dinheiro): '+livro.ciclosRegistrados+
      ' ciclos documentados, '+livro.eventosDocumentados+
      ' pedidos por eventos, '+livro.parcelasPrevistas+
      ' parcelas individuais previstas. Total das obrigações dos centros: '+
      money(livro.totalPrevistoParaTitularesCentavos)+
      '. Total referencial de compras fictícias: '+
      money(livro.referenciasDeComprasFicticiasCentavos)+
      '. Diferença entre fontes e obrigações do centro: '+
      money(livro.divergenciaReferenciasCentroCentavos)+
      '. Valor bancário liquidado: R$ 0,00; disponível para saques: R$ 0,00.';
    return dados;
  }
  async function liberarPonte(e){
    e.preventDefault();
    if(ocupado||!estado||!token)return;
    ocupado=true;
    const btn=el('liberarPonteCBV6');
    btn.disabled=true;
    try{
      const payload={
        comandoId:comandoId(),revisaoEsperada:estado.revisao,
        quantidade:Number(el('quantidadeLotePonteCBV6').value)
      };
      const retorno=await api('/ponte/liberar',{
        method:'POST',body:JSON.stringify(payload)
      });
      el('resultadoPonteCBV6').textContent=
        'Lote de '+retorno.girosLiberados.length+
        ' giros fictícios da ponte concluído. Sem pagamentos reais.';
      await carregar();
    }catch(err){
      el('resultadoPonteCBV6').textContent='Liberação recusada: '+err.message;
      try{await carregar();}catch(_){}
    }finally{ocupado=false;btn.disabled=false;}
  }

  function partesBR(data){
    const partes=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
      minute:'2-digit',hour12:false}).formatToParts(data);
    const campo=k=>partes.find(p=>p.type===k)?.value;
    return {dia:campo('year')+'-'+campo('month')+'-'+campo('day'),
      hora:campo('hour')+':'+campo('minute')};
  }
  function preencherHorario(adianteMinutos){
    const inicio=new Date(Date.now()+adianteMinutos*60_000);
    const fim=new Date(inicio.getTime()+60*60_000);
    const a=partesBR(inicio),b=partesBR(fim);
    el('modoAgendaCBV6').value='PONTUAL';
    el('dataAgendaCBV6').value=a.dia;
    el('inicioAgendaCBV6').value=a.hora;
    el('fimAgendaCBV6').value=a.dia===b.dia?b.hora:'23:59';
    el('quantidadeAgendaCBV6').value='1';
    el('resultadoAgendaCBV6').textContent=
      'Horário preenchido, mas não confirmado. Clique em salvar a programação.';
  }
  async function carregarAgendas(){
    const dados=await api('/programacoes');
    const lista=el('programacoesCBV6');
    lista.replaceChildren();
    if(!dados.agendas.length){
      const li=document.createElement('li');
      li.textContent='Nenhuma programação ainda.';
      lista.append(li);
    }
    for(const a of dados.agendas){
      const li=document.createElement('li');
      li.textContent=a.status+' — '+a.modo+' — '+a.quantidade+
        ' giros planejados, '+a.girosExecutados+' concluídos, '+
        a.girosNaoExecutados+' não executados. Horários: '+
        (a.horarios.length?a.horarios[0].horarioBrasilia+' até '+
        a.horarios[a.horarios.length-1].horarioBrasilia:'nenhum')+'. ';
      if(a.status==='ATIVA'){
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='secundario';
        btn.textContent='Cancelar esta programação';
        btn.addEventListener('click',async()=>{
          if(ocupado)return;
          ocupado=true;btn.disabled=true;
          try{
            await api('/programacoes/'+encodeURIComponent(a.agendaId)+'/cancelar',{
              method:'POST',body:'{}'
            });
            await carregarAgendas();
            el('resultadoAgendaCBV6').textContent='Programação cancelada.';
          }catch(err){
            el('resultadoAgendaCBV6').textContent='Não foi possível cancelar: '+err.message;
          }finally{ocupado=false;}
        });
        li.append(btn);
      }
      lista.append(li);
    }
  }
  async function salvarAgenda(e){
    e.preventDefault();
    if(ocupado||!token||!estado)return;
    ocupado=true;
    const botao=el('salvarAgendaCBV6');
    botao.disabled=true;
    try{
      const dia=el('dataAgendaCBV6').value;
      const inicio=el('inicioAgendaCBV6').value;
      const fim=el('fimAgendaCBV6').value;
      const quantidade=Number(el('quantidadeAgendaCBV6').value);
      if(!/^\d{4}-\d\d-\d\d$/.test(dia)||
         !/^\d\d:\d\d$/.test(inicio)||!/^\d\d:\d\d$/.test(fim))
        throw new Error('Informe dia e horários válidos.');
      const modo=el('modoAgendaCBV6').value;
      const payload={
        agendaId:'agenda-'+Array.from(crypto.getRandomValues(new Uint8Array(12)),
          x=>x.toString(16).padStart(2,'0')).join(''),
        modo,quantidade,
        inicioEm:dia+'T'+inicio+':00-03:00',
        fimEm:dia+'T'+fim+':00-03:00'
      };
      const a=await api('/programacoes',{method:'POST',body:JSON.stringify(payload)});
      el('resultadoAgendaCBV6').textContent='Programação de '+a.quantidade+
        ' giros fictícios criada. Nenhum pagamento autorizado ou executado.';
      await carregarAgendas();
    }catch(err){
      el('resultadoAgendaCBV6').textContent='Não foi possível programar: '+err.message;
    }finally{ocupado=false;botao.disabled=false;}
  }
  async function carregarHistorico(){
    const dados=await api('/historico');
    const lista=el('historicoCBV6');
    lista.replaceChildren();
    for(const h of dados.historico){
      const li=document.createElement('li');
      li.textContent='#'+h.sequencia+' — '+h.tipo+
        ' — '+h.registradoEm+
        (h.tipo==='LIBERAR_LOTE'?
          ' — '+h.saida.girosLiberados.length+' giros concluídos':'')+
        ' — revisão '+h.saida.resumo.revisao;
      lista.append(li);
    }
  }
  function comandoId(){
    const bits=new Uint8Array(12);
    crypto.getRandomValues(bits);
    return 'cb-'+Array.from(bits,x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function carregar(){
    if(!token)return;
    mostrar(await api());
    await carregarPonte();
    await atualizarPre();
    await atualizarGestao();
    await carregarAgendas();
    await carregarHistorico();
  }
  async function executar(tipo,valor){
    if(ocupado||!token||!estado)return;
    ocupado=true;
    const botoes=Array.from(document.querySelectorAll('#conteudoCBV6 button'));
    for(const b of botoes)b.disabled=true;
    const mensagem=el('resultadoCBV6');
    mensagem.textContent='Conferindo comando fictício...';
    try{
      const body={tipo,comandoId:comandoId(),revisaoEsperada:estado.revisao};
      if(valor!==undefined)body.valor=valor;
      const resposta=await api('/comandos',{method:'POST',body:JSON.stringify(body)});
      mostrar(resposta.resumo);
      mensagem.textContent=tipo==='LIBERAR_LOTE'?
        resposta.girosLiberados.length+' giros fictícios liberados. '+
        'Nenhum pagamento ou crédito bancário foi executado.':
        'Comando '+tipo+' registrado no laboratório.';
      await carregarHistorico();
    }catch(e){
      mensagem.textContent='Comando recusado: '+e.message+'. Nenhum giro deste lote foi feito.';
      try{mostrar(await api());}catch(_){/* manter aviso original */}
    }finally{
      ocupado=false;
      for(const b of botoes)b.disabled=false;
      if(estado)mostrar(estado);
    }
  }
  el('abrirPainelCBV6').addEventListener('click',async()=>{
    token=el('chaveCBV6').value;
    el('chaveCBV6').value='';
    try{
      await carregar();
      el('statusCBV6').textContent='Controle administrativo fictício conectado ao banco local.';
    }catch(e){
      token='';estado=null;
      el('conteudoCBV6').hidden=true;
      el('statusCBV6').textContent='Acesso recusado: '+e.message;
    }
  });
  el('limparCBV6').addEventListener('click',()=>{
    token='';estado=null;el('chaveCBV6').value='';
    el('conteudoCBV6').hidden=true;
    el('statusCBV6').textContent='Chave descartada desta página.';
    el('resultadoCBV6').textContent='';
  });
  el('configurarPreV6').addEventListener('click',()=>
    registrarPre('configurar',{valorFixoLoopCentavos:25000}));
  el('startPreV6').addEventListener('click',()=>
    registrarPre('start',{}));
  el('atualizarPreV6').addEventListener('click',async()=>{
    try{await atualizarPre();}catch(e){el('resultadoPreV6').textContent=e.message;}
  });
  el('formGestaoProprietarioV6').addEventListener('submit',solicitarGestao);
  el('formAportePreV6').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const bits=new Uint8Array(10);crypto.getRandomValues(bits);
    await registrarPre('aporte-ficticio',{
      aporteId:'aporte-'+Array.from(bits,x=>x.toString(16).padStart(2,'0')).join(''),
      pedidoId:el('pedidoAportePreV6').value.trim(),valorLoopCentavos:25000
    });
  });
  el('formProjecaoPrelancamentoV6').addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(ocupado||!token)return;
    const campo=el('resultadoProjecaoPrelancamentoV6');
    try{
      const compras=Number(el('comprasPrelancamentoV6').value);
      const liquidoPorCompraCentavos=Math.round(
        Number(el('liquidoPdfPrelancamentoV6').value)*100);
      const projecao=await api('/projecao-prelancamento',{
        method:'POST',body:JSON.stringify({compras,liquidoPorCompraCentavos})
      });
      campo.textContent='RECURSOS HIPOTÉTICOS: '+money(projecao.totalLiquidoHipoteticoCentavos)+
        ' | Centro: '+money(projecao.alocacaoMatematicaCentavos.centro)+
        ' | Investimento: '+money(projecao.alocacaoMatematicaCentavos.investimento)+
        ' | Reserva: '+money(projecao.alocacaoMatematicaCentavos.reserva)+
        ' | Giros por seis compras distintas: '+projecao.girosPelasCompras+
        ' | Giros suportados matematicamente pela alocação: '+
        projecao.girosPeloCaixaMatematico+
        ' | Máximo teórico considerando ambos: '+projecao.tetoHipoteticoDeGiros+
        ' | Falta para referência de todas as compras: '+
        money(projecao.diferencaReferenciaMenosLiquidoCentavos)+
        '. COMPROVAÇÃO BANCÁRIA: ZERO. NÃO É DINHEIRO SACÁVEL.';
    }catch(e){
      campo.textContent='Projeção recusada: '+e.message;
    }
  });
  el('formAgendaCBV6').addEventListener('submit',salvarAgenda);
  el('programarAgoraCBV6').addEventListener('click',()=>preencherHorario(0));
  el('programarUmaHoraCBV6').addEventListener('click',()=>preencherHorario(60));
  el('atualizarAgendaCBV6').addEventListener('click',async()=>{
    try{await carregarAgendas();}catch(e){el('resultadoAgendaCBV6').textContent=e.message;}
  });
  el('dataAgendaCBV6').value=partesBR(new Date()).dia;
  el('formLotePonteCBV6').addEventListener('submit',liberarPonte);
  el('atualizarPonteCBV6').addEventListener('click',async()=>{
    try{await carregarPonte();}catch(e){el('resultadoPonteCBV6').textContent=e.message;}
  });
  el('abrirCatracaCBV6').addEventListener('click',()=>executar('ABRIR'));
  el('pausarCatracaCBV6').addEventListener('click',()=>executar('PAUSAR'));
  el('gerarComprasCBV6').addEventListener('click',()=>executar('GERAR_30_COMPRAS'));
  el('formLimiteCBV6').addEventListener('submit',e=>{
    e.preventDefault();
    executar('LIMITE_DIARIO',Number(el('limiteDiarioCBV6').value));
  });
  el('formLoteCBV6').addEventListener('submit',e=>{
    e.preventDefault();
    executar('LIBERAR_LOTE',Number(el('quantidadeLoteCBV6').value));
  });
  el('atualizarCBV6').addEventListener('click',async()=>{
    try{await carregar();el('resultadoCBV6').textContent='Quadro atualizado.';}
    catch(e){el('resultadoCBV6').textContent=e.message;}
  });
  el('historicoAtualizarCBV6').addEventListener('click',async()=>{
    try{await carregarHistorico();}
    catch(e){el('resultadoCBV6').textContent=e.message;}
  });
})();
