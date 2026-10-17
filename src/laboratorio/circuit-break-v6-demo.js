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
