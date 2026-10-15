'use strict';

// Apenas laboratorio local. Chave na memoria da pagina; sem conta ou saldo real.
// Nomes e cores nao alteram o destino dos valores nem a arquitetura dos cofres.
(() => {
  const el=id=>document.getElementById(id);
  const money=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
  const tokenInput=el('chaveFinanceiroDemo');
  const status=el('statusFinanceiroDemo');
  const statusEdicao=el('statusAparenciaCofreDemo');
  const dados=el('dadosFinanceiroDemo');
  const modo=el('repasseFinanceiroDemo');
  const selecionar=el('cofreEditarFinanceiroDemo');
  const nome=el('nomeCofreFinanceiroDemo');
  const cor=el('corCofreFinanceiroDemo');
  let token='';
  let versao=0;
  let versaoHistorico=0;
  let versaoConciliacao=0;
  let versaoLivro=0;
  let configuracoes=[];
  let salvando=false;

  function limpar(){
    ++versaoConciliacao;
    ++versaoLivro;
    dados.hidden=true;
    el('caixasLivroPersistenteDemo').replaceChildren();
    el('historicoLivroPersistenteDemo').replaceChildren();
    el('statusLivroPersistenteDemo').textContent='';
    el('linhasConciliacaoDemo').replaceChildren();
    el('historicoConciliacaoDemo').replaceChildren();
    el('statusConciliacaoDemo').textContent='';
    configuracoes=[];
    selecionar.replaceChildren();
    statusEdicao.textContent='';
    el('historicoAparenciaCofreDemo').replaceChildren();
    for(const id of ['cofresLoopFinanceiroDemo','cofresLojaFinanceiroDemo','historicoFinanceiroDemo']){
      el(id).replaceChildren();
    }
    for(const id of ['vendasBrutasFinanceiroDemo','distribuidorFinanceiroDemo','parcelaFinanceiroDemo','sobraFinanceiroDemo']){
      el(id).textContent='—';
    }
  }
  async function requisitar(recurso,opcoes={}){
    if(!token)throw new Error('Informe a chave do laboratório.');
    const resposta=await fetch('/api/admin/'+recurso,{
      ...opcoes,
      cache:'no-store',
      credentials:'omit',
      headers:{
        Authorization:'Bearer '+token,
        ...(opcoes.body?{'Content-Type':'application/json'}:{})
      }
    });
    if(!resposta.ok){
      if(resposta.status===409)throw new Error('Identificador já usado com dados diferentes ou revisão alterada. Confira e recarregue.');
      if(resposta.status===401 || resposta.status===403)throw new Error('Chave inválida ou acesso local não permitido.');
      throw new Error('Operação não concluída ('+resposta.status+').');
    }
    return resposta.json();
  }
  function caixa(c){
    const artigo=document.createElement('div');
    artigo.className='financeiro-caixa';
    if(typeof c.corExibicao==='string' && /^#[0-9a-fA-F]{6}$/.test(c.corExibicao)){
      artigo.style.borderColor=c.corExibicao;
    }
    const titulo=document.createElement('strong');
    titulo.textContent=c.nomeExibicao||c.nomeProvisorio;
    const valor=document.createElement('span');
    valor.textContent=money(c.entradasAcumuladasCentavos);
    const nota=document.createElement('small');
    nota.textContent='Entradas fictícias acumuladas — NÃO é saldo bancário';
    artigo.append(titulo,valor,nota);
    return artigo;
  }
  function mostrar(res){
    el('vendasBrutasFinanceiroDemo').textContent=money(res.totalVendasCentavos);
    el('distribuidorFinanceiroDemo').textContent=money(res.totalFornecedorCentavos);
    el('parcelaFinanceiroDemo').textContent=money(res.totalLoopCentavos);
    el('sobraFinanceiroDemo').textContent=money(res.totalSobraBrutaCentavos);
    const loop=el('cofresLoopFinanceiroDemo');
    const loja=el('cofresLojaFinanceiroDemo');
    loop.replaceChildren();
    loja.replaceChildren();
    for(const c of res.caixas){
      (c.id.startsWith('LOOP_')?loop:loja).append(caixa(c));
    }
    const lista=el('historicoFinanceiroDemo');
    lista.replaceChildren();
    for(const lancamento of res.historico){
      const item=document.createElement('li');
      item.textContent='Lançamento '+lancamento.sequencia+' — '+lancamento.vendaId+
        ' — '+lancamento.tipo+' — '+lancamento.cofreId+
        ' — '+money(lancamento.valorCentavos);
      lista.append(item);
    }
    dados.hidden=false;
    status.textContent='Demonstração carregada. Nenhuma transação real foi executada.';
  }
  async function carregarConciliacao(){
    const atual=++versaoConciliacao;
    const destino=el('linhasConciliacaoDemo');
    const historico=el('historicoConciliacaoDemo');
    const situacao=el('statusConciliacaoDemo');
    destino.replaceChildren();
    historico.replaceChildren();
    if(!token){situacao.textContent='Informe a chave do laboratório.';return;}
    situacao.textContent='Conferindo dois conjuntos de valores FICTÍCIOS...';
    const parametros=new URLSearchParams({
      modo:modo.value,
      fluxo:el('fluxoConciliacaoDemo').value,
      extrato:el('extratoConciliacaoDemo').value
    });
    try{
      const res=await requisitar('conciliacao-cofres-demo?'+parametros.toString());
      if(atual!==versaoConciliacao)return;
      for(const linha of res.conciliacao.linhas){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=linha.nomeExibicao;
        const descricao=document.createElement('span');
        descricao.className='financeiro-linha-saldos';
        descricao.textContent='Projetado: '+money(linha.saldoProjetadoCentavos)+
          ' | Reserva FICTÍCIA: '+(linha.saldoReservaFicticiaCentavos===null?'indisponível':money(linha.saldoReservaFicticiaCentavos));
        const detalhe=document.createElement('small');
        detalhe.textContent=linha.status==='CONFERIDO_NO_TESTE'?'Conferido SOMENTE no teste':
          linha.status==='DIVERGENCIA_FICTICIA'?'DIVERGÊNCIA fictícia: '+money(linha.diferencaCentavos):
          'Sem extrato de demonstração';
        artigo.append(titulo,descricao,detalhe);
        destino.append(artigo);
      }
      situacao.textContent=res.conciliacao.todasConferidasNoTeste?
        'Contas do exemplo coincidem. NÃO é uma confirmação bancária.':
        'Existe diferença no extrato fictício. Nenhum dinheiro foi movimentado.';
      // Manter tela enxuta. O livro completo esta na API do admin local.
      const ultimos=res.razao.historico.slice(-10);
      for(const lancamento of ultimos){
        const item=document.createElement('li');
        item.textContent=lancamento.tipo+' — '+lancamento.cofreId+
          ' — '+money(lancamento.valorCentavos)+' — '+lancamento.referencia;
        historico.append(item);
      }
    }catch(e){
      if(atual===versaoConciliacao) situacao.textContent=e.message;
    }
  }

  // Livro independente do ciclo aritmetico anterior: seu historico so muda
  // quando uma operacao de teste foi explicitamente registrada pelo admin.
  async function carregarLivro(){
    const atual=++versaoLivro;
    const aviso=el('statusLivroPersistenteDemo');
    aviso.textContent='Consultando livro persistente do laboratório...';
    try{
      const livro=await requisitar('livro-financeiro-demo');
      if(atual!==versaoLivro)return;
      const caixas=el('caixasLivroPersistenteDemo');
      const historico=el('historicoLivroPersistenteDemo');
      caixas.replaceChildren();
      historico.replaceChildren();
      for(const c of livro.caixas){
        const artigo=document.createElement('div');
        artigo.className='financeiro-caixa';
        const titulo=document.createElement('strong');
        titulo.textContent=configuracoes.find(cfg=>cfg.id===c.id)?.nome||c.id;
        const linha=document.createElement('span');
        linha.className='financeiro-linha-saldos';
        linha.textContent='Entradas: '+money(c.entradasAcumuladasCentavos)+
          ' · Saídas: '+money(c.saidasAcumuladasCentavos)+
          ' · Retornos: '+money(c.retornosAcumuladosCentavos);
        const resumo=document.createElement('small');
        resumo.textContent='Saldo PROJETADO fictício: '+money(c.saldoProjetadoCentavos)+
          ' — não representa saldo bancário';
        artigo.append(titulo,linha,resumo);
        caixas.append(artigo);
      }
      for(const e of livro.historicoRecente){
        const item=document.createElement('li');
        item.textContent='#'+e.sequencia+' — '+e.eventoId+' — '+e.cofreId+
          ' — '+e.natureza+' '+money(e.valorCentavos)+
          ' — '+e.referencia+' — '+e.criadoEm;
        historico.append(item);
      }
      aviso.textContent='Livro local: '+livro.lotesRegistrados+' lotes, '+
        livro.lancamentosRegistrados+' lançamentos fictícios. Sem banco conectado.';
    }catch(e){
      if(atual===versaoLivro)aviso.textContent=e.message;
    }
  }
  function centavosDoFormulario(){
    const valor=el('valorMovimentoPersistenteDemo').value.trim();
    const n=Number(valor);
    if(!valor||!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100))||
       Math.abs(n*100-Math.round(n*100))>0.00001){
      throw new Error('Informe um valor positivo com até duas casas decimais.');
    }
    return Math.round(n*100);
  }
  async function registrarLivro(e,tipo){
    e.preventDefault();
    if(!token){el('statusLivroPersistenteDemo').textContent='Abra a demonstração com a chave local.';return;}
    const botao=e.submitter;
    if(botao)botao.disabled=true;
    const aviso=el('statusLivroPersistenteDemo');
    try{
      let rota,corpo;
      if(tipo==='ciclo'){
        rota='livro-financeiro-demo/ciclos';
        corpo={cicloId:el('idCicloPersistenteDemo').value.trim(),modo:modo.value};
      }else{
        rota='livro-financeiro-demo/movimentos';
        corpo={
          eventoId:el('idMovimentoPersistenteDemo').value.trim(),
          cofreId:el('cofreMovimentoPersistenteDemo').value,
          natureza:el('naturezaMovimentoPersistenteDemo').value,
          valorCentavos:centavosDoFormulario(),
          referencia:el('referenciaMovimentoPersistenteDemo').value.trim()
        };
      }
      const r=await requisitar(rota,{method:'POST',body:JSON.stringify(corpo)});
      await carregarLivro();
      aviso.textContent=r.resultado.repetido?
        'Operação fictícia já constava no livro. Nada foi duplicado.':
        'Operação fictícia registrada permanentemente no laboratório. Nenhum dinheiro transferido.';
    }catch(erro){
      aviso.textContent='Falha no registro fictício: '+erro.message;
    }finally{
      if(botao)botao.disabled=false;
    }
  }

  function selecionado(){
    return configuracoes.find(c=>c.id===selecionar.value)||null;
  }
  function preencherFormulario(){
    const c=selecionado();
    if(!c)return;
    nome.value=c.nome;
    cor.value=c.cor.toLowerCase();
    el('finalidadeCofreFinanceiroDemo').textContent=
      'Grupo: '+c.grupo+' — posição fixa: '+c.posicao+
      ' — finalidade fixa: '+c.finalidade+
      ' — revisão visual: '+c.revisao+
      '. Nenhuma conta bancária vinculada.';
  }
  function preencherConfiguracoes(lista){
    const idAntes=selecionar.value;
    configuracoes=lista;
    selecionar.replaceChildren();
    for(const c of configuracoes){
      const option=document.createElement('option');
      option.value=c.id;
      option.textContent=c.grupo+' · '+c.posicao+' · '+c.nome;
      selecionar.append(option);
    }
    if(configuracoes.some(c=>c.id===idAntes))selecionar.value=idAntes;
    preencherFormulario();
    const selecaoMovimento=el('cofreMovimentoPersistenteDemo');
    const antes=selecaoMovimento.value;
    selecaoMovimento.replaceChildren();
    for(const c of configuracoes){
      const option=document.createElement('option');
      option.value=c.id;
      option.textContent=c.nome+' ('+c.posicao+')';
      selecaoMovimento.append(option);
    }
    if(configuracoes.some(c=>c.id===antes))selecaoMovimento.value=antes;
  }
  async function carregarHistorico(){
    const atual=++versaoHistorico;
    const c=selecionado();
    const lista=el('historicoAparenciaCofreDemo');
    lista.replaceChildren();
    if(!c || !token)return;
    try{
      const res=await requisitar('cofres-demo/'+encodeURIComponent(c.id)+'/historico');
      if(atual!==versaoHistorico || selecionar.value!==c.id)return;
      if(!res.eventos.length){
        const li=document.createElement('li');
        li.textContent='Nenhuma alteração realizada neste cofre.';
        lista.append(li);
      }
      for(const evento of res.eventos){
        const li=document.createElement('li');
        li.textContent='Revisão '+evento.revisao+' — '+evento.alteradoEm+
          ' — '+evento.antesNome+' ('+evento.antesCor+') → '+
          evento.depoisNome+' ('+evento.depoisCor+')';
        lista.append(li);
      }
    }catch(e){
      if(atual===versaoHistorico)statusEdicao.textContent=e.message;
    }
  }
  async function buscar(){
    const atual=++versao;
    if(!token){status.textContent='Informe a chave do laboratório.';return;}
    ++versaoConciliacao;
    dados.hidden=true;
    status.textContent='Consultando cenários fictícios e aparência...';
    try{
      const [visao,config]=await Promise.all([
        requisitar('financeiro-demo?modo='+encodeURIComponent(modo.value)),
        requisitar('cofres-demo/configuracoes')
      ]);
      if(atual!==versao)return;
      preencherConfiguracoes(config.cofres);
      mostrar(visao);
      await Promise.all([carregarHistorico(),carregarConciliacao(),carregarLivro()]);
    }catch(e){
      if(atual===versao){limpar();status.textContent=e.message;}
    }
  }
  async function salvar(evento){
    evento.preventDefault();
    const c=selecionado();
    if(salvando || !token || !c)return;
    salvando=true;
    el('salvarAparenciaCofreDemo').disabled=true;
    statusEdicao.textContent='Salvando apenas o nome e a cor...';
    try{
      await requisitar('cofres-demo/'+encodeURIComponent(c.id),{
        method:'PATCH',
        body:JSON.stringify({nome:nome.value,cor:cor.value,revisaoEsperada:c.revisao})
      });
      await buscar();
      statusEdicao.textContent='Nome e cor salvos no laboratório. Finalidade e valores preservados.';
    }catch(e){
      statusEdicao.textContent=e.message;
    }finally{
      salvando=false;
      el('salvarAparenciaCofreDemo').disabled=false;
    }
  }
  el('abrirFinanceiroDemo').addEventListener('click',()=>{
    token=tokenInput.value;
    tokenInput.value='';
    buscar();
  });
  modo.addEventListener('change',buscar);
  selecionar.addEventListener('change',()=>{
    ++versaoHistorico;
    statusEdicao.textContent='';
    preencherFormulario();
    carregarHistorico();
  });
  el('formAparenciaCofreDemo').addEventListener('submit',salvar);
  el('formCicloPersistenteDemo').addEventListener('submit',e=>registrarLivro(e,'ciclo'));
  el('formMovimentoPersistenteDemo').addEventListener('submit',e=>registrarLivro(e,'movimento'));
  el('atualizarLivroPersistenteDemo').addEventListener('click',carregarLivro);
  el('verConciliacaoDemo').addEventListener('click',carregarConciliacao);
  el('limparFinanceiroDemo').addEventListener('click',()=>{
    ++versao;
    ++versaoHistorico;
    token='';
    tokenInput.value='';
    limpar();
    status.textContent='Chave descartada da página. Nenhuma operação financeira.';
  });
})();
