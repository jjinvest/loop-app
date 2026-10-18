'use strict';

// Somente dados ficticios via API local, nunca CPF ou saldo de cliente.
(() => {
  const byId = id => document.getElementById(id);
  const tokenInput=byId('tokenEscritorioDemo');
  const mensagem=byId('estadoEscritorioDemo');
  const conteudo=byId('conteudoEscritorioDemo');
  const selecao=byId('titularEscritorioDemo');
  const origem=byId('origemEscritorioDemo');
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
    texto('etapaMotorDemo','');
    texto('indicacoesMotorDemo','');
    limparTabuleiro();
    byId('publicacoesHomeEscritorio').replaceChildren();
    conteudo.hidden=true;
    byId('acessoEscritorioDemo').hidden=false;
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
  let abaAtual='home';
  const secoes={home:'abaHomeEscritorio',tabuleiro:'abaTabuleiroEscritorio',
    conta:'abaContaEscritorio'};
  function abrirAba(nome){
    if(!Object.hasOwn(secoes,nome))return;
    abaAtual=nome;
    for(const [chave,id] of Object.entries(secoes)){
      byId(id).hidden=chave!==nome;
      const botao=document.querySelector('[data-aba-escritorio="'+chave+'"]');
      botao.setAttribute('aria-selected',chave===nome?'true':'false');
      botao.tabIndex=chave===nome?0:-1;
    }
    if(nome==='tabuleiro'&&segredo){
      if(origem.value!=='motor')origem.value='motor';
      carregarConta();
    }
  }
  function classePosicao(p){
    return p?.dourada?'dourada':p?.pendente?'pendente':p?.minha?'minha':'outra';
  }
  function limparTabuleiro(){
    for(const id of ['listaFilaAEscritorio','listaFilaBEscritorio',
      'anelTabuleiroEscritorio'])byId(id).replaceChildren();
    texto('qtdFilaAEscritorio','0');
    texto('qtdFilaBEscritorio','0');
    texto('estadoTabuleiroEscritorio','Nenhum dado do tabuleiro consultado.');
  }
  function mostrarFila(id,lista){
    const alvo=byId(id);alvo.replaceChildren();
    if(!lista.length){
      const linha=document.createElement('li');
      linha.className='fila-vazia-escritorio';
      linha.textContent='Aguardando posições';
      alvo.append(linha);return;
    }
    lista.forEach((p,i)=>{
      const li=document.createElement('li');
      li.className='linha-fila-escritorio tom-'+classePosicao(p);
      const ordem=document.createElement('span');
      ordem.className='numero-fila-escritorio';
      ordem.textContent=String(i+1).padStart(2,'0');
      const descricao=document.createElement('span');
      descricao.textContent='#'+p.id+' · '+(p.nome||'Titular em consulta')+
        ' · '+(p.convitesValidados??0)+' convites validados'+
        (p.minha?' · Sua posição':p.dourada?' · LOOP':'');
      li.append(ordem,descricao);alvo.append(li);
    });
  }
  function criarEsfera(posicao,rotulo,classe){
    const node=document.createElement('div');
    node.className='esfera-tabuleiro-escritorio esfera-'+classe+
      ' tom-'+classePosicao(posicao);
    node.setAttribute('aria-label',rotulo+': '+
      (posicao?'posição '+posicao.id:'posição vazia'));
    const small=document.createElement('small');
    small.textContent=rotulo;
    const numero=document.createElement('strong');
    numero.textContent=posicao?'#'+posicao.id:'—';
    node.append(small,numero);
    if(posicao?.minha){
      const mark=document.createElement('span');
      mark.className='marca-titular-escritorio';mark.textContent='SUA';
      node.append(mark);
    }
    return node;
  }
  function mostrarMapa(visao){
    limparTabuleiro();
    if(!visao.mapa){
      texto('estadoTabuleiroEscritorio',
        'Para conferir o tabuleiro, selecione o cenário do motor do LOOP.');
      return;
    }
    const m=visao.mapa;
    texto('qtdFilaAEscritorio',m.filaA.length);
    texto('qtdFilaBEscritorio',m.filaB.length);
    mostrarFila('listaFilaAEscritorio',m.filaA);
    mostrarFila('listaFilaBEscritorio',m.filaB);
    const board=byId('anelTabuleiroEscritorio');
    board.replaceChildren();
    m.vagas.forEach((p,i)=>board.append(criarEsfera(p,'Vaga '+(i+1),'vaga-'+(i+1))));
    board.append(criarEsfera(m.centro,'CENTRO','centro'));
    texto('estadoTabuleiroEscritorio',
      'Giros simulados: '+visao.tabuleiro.giros+
      ' · Ciclo nº '+visao.tabuleiro.cicloAtual+
      ' · Catraca: '+visao.tabuleiro.catraca+'.');
  }
  async function enviarPublicacao(rota,corpo){
    const resposta=await fetch('/api/admin/escritorio-demo/publicacoes'+rota,{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+segredo,'Content-Type':'application/json'},
      body:JSON.stringify(corpo)
    });
    const payload=await resposta.json();
    if(!resposta.ok)throw new Error(payload.erro||'Publicação recusada');
    return payload;
  }
  async function atualizarPublicacoesHome(){
    if(!segredo)return;
    const dados=await buscar('/api/admin/escritorio-demo/publicacoes');
    const alvo=byId('publicacoesHomeEscritorio');
    alvo.replaceChildren();
    if(!dados.publicacoes.length){
      const vazio=document.createElement('p');
      vazio.className='ajuda';vazio.textContent=
       'Nenhum comunicado publicado. A casinha ficará reservada às peças que você escolher.';
      alvo.append(vazio);return;
    }
    for(const pub of dados.publicacoes){
      const card=document.createElement('article');
      card.className='publicacao-home-escritorio';
      if(pub.imagemCaminho){
        const img=document.createElement('img');
        img.src=pub.imagemCaminho;img.alt=pub.titulo;
        img.loading='lazy';card.append(img);
      }
      const tipo=document.createElement('small');
      tipo.className='tipo-publicacao-escritorio';
      tipo.textContent=pub.tipo==='AKITEMM'?'AKITEMM · Loja':
        pub.tipo==='EVENTO'?'Evento LOOP':'Comunicado';
      const titulo=document.createElement('h3');titulo.textContent=pub.titulo;
      const descricao=document.createElement('p');descricao.textContent=pub.descricao;
      card.append(tipo,titulo,descricao);
      if(pub.linkDestino){
        const link=document.createElement('a');link.href=pub.linkDestino;
        link.textContent=pub.linkDestino==='/loja'?'Abrir AKITEMM':'Abrir conteúdo';
        card.append(link);
      }
      const arquivar=document.createElement('button');
      arquivar.type='button';arquivar.className='acao-arquivar-publicacao';
      arquivar.textContent='Arquivar publicação';
      arquivar.addEventListener('click',async()=>{
        arquivar.disabled=true;
        try{await enviarPublicacao('/'+pub.id+'/arquivar',{});
          await atualizarPublicacoesHome();}
        catch(e){texto('estadoPublicacaoHome',e.message);arquivar.disabled=false;}
      });
      card.append(arquivar);alvo.append(card);
    }
  }
  byId('formPublicacaoHome').addEventListener('submit',async evento=>{
    evento.preventDefault();
    if(!segredo)return;
    const botao=byId('publicarHomeEscritorio');botao.disabled=true;
    try{
      const tipo=byId('tipoPublicacaoHome').value;
      const destino=byId('destinoPublicacaoHome').value||null;
      await enviarPublicacao('',{
        tipo,titulo:byId('tituloPublicacaoHome').value.trim(),
        descricao:byId('descricaoPublicacaoHome').value.trim(),
        linkDestino:tipo==='AKITEMM'?'/loja':destino,
        imagemCaminho:byId('imagemPublicacaoHome').value.trim()||null
      });
      byId('formPublicacaoHome').reset();
      texto('estadoPublicacaoHome','Publicação criada somente pelo administrador.');
      await atualizarPublicacoesHome();
    }catch(e){texto('estadoPublicacaoHome',e.message);}
    finally{botao.disabled=false;}
  });
  for(const botao of document.querySelectorAll('[data-aba-escritorio]')){
    botao.addEventListener('click',()=>abrirAba(botao.dataset.abaEscritorio));
    botao.addEventListener('keydown',e=>{
      if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key))return;
      e.preventDefault();
      const nomes=Object.keys(secoes);
      const index=nomes.indexOf(botao.dataset.abaEscritorio);
      const proximo=(index+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+nomes.length)%nomes.length;
      abrirAba(nomes[proximo]);
      document.querySelector('[data-aba-escritorio="'+nomes[proximo]+'"]').focus();
    });
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
    if(visao.origem==='MOTOR_EXISTENTE_EM_CENARIO_FICTICIO'){
      texto('etapaMotorDemo','Cenário do motor existente: '+
        visao.tabuleiro.giros+' giro fictício; ciclo atual nº '+
        visao.tabuleiro.cicloAtual+'; catraca '+visao.tabuleiro.catraca+'.');
      texto('indicacoesMotorDemo','Indicações fictícias reconhecidas pelo motor: '+
        visao.indicacoes.quantidade+'.');
    } else {
      texto('etapaMotorDemo','Exemplo estático preservado, sem leitura do motor.');
      texto('indicacoesMotorDemo','Indicações: não integradas neste exemplo.');
    }
    preencherLista('listaAtivasDemo',visao.ativas,p=>
      p.id+' — '+(p.local==='FILA'?'Fila '+p.fila:
        p.local==='CENTRO'?'Centro':p.local.replace('_',' ')));
    preencherLista('listaConcluidasDemo',visao.historico,p=>
      p.id+' — participação concluída (fictícia)');
    mostrarMapa(visao);
    conteudo.hidden=false;
    byId('acessoEscritorioDemo').hidden=true;
    mensagem.textContent='Prévia local carregada. Nenhuma operação real foi executada.';
  }
  async function carregarConta() {
    if(!segredo)return;
    const esta=++versaoSolicitacao;
    mensagem.textContent='Consultando conta fictícia...';
    try {
      const id=selecao.value;
      if(!id)throw new Error('Selecione uma conta fictícia.');
      const sufixo=origem.value==='motor'?'motor/':'';
      const dados=await buscar('/api/admin/escritorio-demo/'+sufixo+encodeURIComponent(id));
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
      origem.value='motor';
      abrirAba('home');
      await carregarConta();
      await atualizarPublicacoesHome();
    }catch(erro){
      if(esta!==versaoSolicitacao)return;
      segredo='';
      limparDados();
      mensagem.textContent=erro.message;
    }
  });
  byId('sairMenuEscritorioDemo').addEventListener('click',()=>byId('sairEscritorioDemo').click());
  byId('sairEscritorioDemo').addEventListener('click',()=>{
    ++versaoSolicitacao;
    segredo='';
    tokenInput.value='';
    limparDados();
    mensagem.textContent='Sessão fictícia encerrada; chave descartada da página.';
  });
  selecao.addEventListener('change',carregarConta);
  origem.addEventListener('change',carregarConta);
  byId('atualizarEscritorioDemo').addEventListener('click',carregarConta);
})();
