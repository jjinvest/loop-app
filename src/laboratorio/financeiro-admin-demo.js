'use strict';

// Nenhum armazenamento de chave no navegador. Visualizacao ficticia protegida
// por token do servidor local de laboratorio.
(() => {
  const el=id=>document.getElementById(id);
  const money=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
  const tokenInput=el('chaveFinanceiroDemo');
  const status=el('statusFinanceiroDemo');
  const dados=el('dadosFinanceiroDemo');
  const modo=el('repasseFinanceiroDemo');
  let token='';
  let versao=0;

  function limpar(){
    dados.hidden=true;
    for(const id of ['cofresLoopFinanceiroDemo','cofresLojaFinanceiroDemo','historicoFinanceiroDemo']){
      el(id).replaceChildren();
    }
    for(const id of ['vendasBrutasFinanceiroDemo','distribuidorFinanceiroDemo','parcelaFinanceiroDemo','sobraFinanceiroDemo']){
      el(id).textContent='—';
    }
  }
  function caixa(c){
    const artigo=document.createElement('div');
    artigo.className='financeiro-caixa';
    const titulo=document.createElement('strong');
    titulo.textContent=c.nomeProvisorio;
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
    status.textContent='Demonstração carregada: apenas registros fictícios. Nenhuma transação ocorreu.';
  }
  async function buscar(){
    if(!token) {status.textContent='Informe a chave do laboratório.';return;}
    const atual=++versao;
    dados.hidden=true;
    status.textContent='Calculando cenário fictício...';
    try {
      const resposta=await fetch('/api/admin/financeiro-demo?modo='+encodeURIComponent(modo.value),{
        headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'
      });
      if(!resposta.ok)throw new Error(resposta.status===401?
        'Chave inválida.':'Não foi possível consultar o cenário ('+resposta.status+').');
      const corpo=await resposta.json();
      if(atual===versao)mostrar(corpo);
    }catch(e){
      if(atual===versao){limpar();status.textContent=e.message;}
    }
  }
  el('abrirFinanceiroDemo').addEventListener('click',()=>{
    token=tokenInput.value;
    tokenInput.value='';
    buscar();
  });
  modo.addEventListener('change',buscar);
  el('limparFinanceiroDemo').addEventListener('click',()=>{
    ++versao;
    token='';
    tokenInput.value='';
    limpar();
    status.textContent='Chave descartada da página. Nenhuma operação financeira.';
  });
})();
