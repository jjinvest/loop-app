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
  let configuracoes=[];
  let salvando=false;

  function limpar(){
    dados.hidden=true;
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
      if(resposta.status===409)throw new Error('Aparência alterada em outra sessão. Recarregue e confira antes de salvar.');
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
      await carregarHistorico();
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
  el('limparFinanceiroDemo').addEventListener('click',()=>{
    ++versao;
    ++versaoHistorico;
    token='';
    tokenInput.value='';
    limpar();
    status.textContent='Chave descartada da página. Nenhuma operação financeira.';
  });
})();
