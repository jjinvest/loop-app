'use strict';

// Somente dados ficticios via API local, nunca CPF ou saldo de cliente.
(() => {
  const byId = id => document.getElementById(id);
  const tokenInput=byId('tokenEscritorioDemo');
  const mensagem=byId('estadoEscritorioDemo');
  const conteudo=byId('conteudoEscritorioDemo');
  const selecao=byId('titularEscritorioDemo');
  let segredo='';
  let versaoSolicitacao=0;

  function texto(id,valor) { byId(id).textContent=String(valor); }
  function limparDados() {
    selecao.replaceChildren();
    byId('listaAtivasDemo').replaceChildren();
    byId('listaConcluidasDemo').replaceChildren();
    texto('totalAtivasDemo','—');
    texto('vagasDisponiveisDemo','—');
    texto('concluidasDemo','—');
    texto('titularResumoDemo','');
    conteudo.hidden=true;
  }
  async function buscar(recurso) {
    const resposta=await fetch(recurso,{
      headers:{Authorization:'Bearer '+segredo},
      cache:'no-store',
      credentials:'omit'
    });
    if(!resposta.ok) throw new Error(
      resposta.status===401?'Chave de laboratório inválida.':
      'Não foi possível consultar a demonstração ('+resposta.status+').'
    );
    return resposta.json();
  }
  function preencherLista(id,lista,formatador) {
    const alvo=byId(id);
    alvo.replaceChildren();
    if(!lista.length) {
      const li=document.createElement('li');
      li.textContent='Nenhum registro neste exemplo.';
      alvo.append(li);
      return;
    }
    for(const registro of lista) {
      const li=document.createElement('li');
      li.textContent=formatador(registro);
      alvo.append(li);
    }
  }
  function apresentar(visao) {
    texto('titularResumoDemo',visao.titular.nome+' — somente exemplo, sem CPF real');
    texto('totalAtivasDemo',visao.posicoesAtivas+' de '+visao.limitePosicoesAtivas);
    texto('vagasDisponiveisDemo',visao.vagasDisponiveis);
    texto('concluidasDemo',visao.posicoesConcluidas);
    preencherLista('listaAtivasDemo',visao.ativas,p=>
      p.id+' — '+(p.local==='FILA'?'Fila '+p.fila:
        p.local==='CENTRO'?'Centro':p.local.replace('_',' ')));
    preencherLista('listaConcluidasDemo',visao.historico,p=>
      p.id+' — participação concluída (fictícia)');
    conteudo.hidden=false;
    mensagem.textContent='Prévia local carregada. Nenhuma operação real foi executada.';
  }
  async function carregarConta() {
    if(!segredo)return;
    const esta=++versaoSolicitacao;
    mensagem.textContent='Consultando conta fictícia...';
    try {
      const id=selecao.value;
      if(!id)throw new Error('Selecione uma conta fictícia.');
      const dados=await buscar('/api/admin/escritorio-demo/'+encodeURIComponent(id));
      if(esta===versaoSolicitacao) apresentar(dados);
    } catch(erro) {
      if(esta===versaoSolicitacao) {
        limparDados();
        mensagem.textContent=erro.message;
      }
    }
  }
  byId('entrarEscritorioDemo').addEventListener('click',async()=>{
    ++versaoSolicitacao;
    segredo=tokenInput.value;
    tokenInput.value='';
    limparDados();
    mensagem.textContent='Abrindo laboratório...';
    const esta=++versaoSolicitacao;
    try {
      const dados=await buscar('/api/admin/escritorio-demo');
      if(esta!==versaoSolicitacao)return;
      for(const titular of dados.titulares){
        const option=document.createElement('option');
        option.value=titular.id;
        option.textContent=titular.nome;
        selecao.append(option);
      }
      await carregarConta();
    }catch(erro){
      if(esta!==versaoSolicitacao)return;
      segredo='';
      limparDados();
      mensagem.textContent=erro.message;
    }
  });
  byId('sairEscritorioDemo').addEventListener('click',()=>{
    ++versaoSolicitacao;
    segredo='';
    tokenInput.value='';
    limparDados();
    mensagem.textContent='Sessão fictícia encerrada; chave descartada da página.';
  });
  selecao.addEventListener('change',carregarConta);
  byId('atualizarEscritorioDemo').addEventListener('click',carregarConta);
})();
