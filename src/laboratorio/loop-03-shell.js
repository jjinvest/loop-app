'use strict';
// LOOP 0.3: camada visual sobre o escritorio JA EXISTENTE.
// Os formularios, IDs, sessoes, motor de filas e a loja continuam os mesmos.
(()=>{
 const e=id=>document.getElementById(id);
 let selecionada=null, visaoAtual=null, abaAtual='home', destinoInicialTratado=false;
 const paginas=['home','tabuleiro','posicoes','rede','financeiro','perfil'];
 function montar(){
  const root=e('conteudoParticipante');
  if(!root||e('loop03Shell'))return;
  const shell=document.createElement('div');
  shell.id='loop03Shell';
  shell.className='loop03-shell';
  shell.innerHTML=String.raw`
   <aside class="loop03-sidebar" id="loop03Sidebar" aria-label="Menu LOOP 0.3">
    <div class="loop03-marca">LOOP <span>0.3</span></div>
    <nav aria-label="Áreas do escritório">
     <button data-loop03-aba="home" type="button"><span>⌂</span> Escritório Virtual</button>
     <button data-loop03-aba="tabuleiro" type="button"><span>◉</span> Tabuleiro</button>
     <button data-loop03-aba="posicoes" type="button"><span>▤</span> Minhas Posições</button>
     <button data-loop03-aba="rede" type="button"><span>♧</span> Rede e Equipe</button>
     <button data-loop03-aba="financeiro" type="button"><span>▥</span> Financeiro</button>
     <a href="/loja"><span>▦</span> AKITEMM</a>
    </nav>
    <a href="/loja" class="loop03-vitrine-lateral" aria-label="Abrir vitrine AKITEMM">
     <span class="loop03-vitrine-marca">AKITEMM</span>
     <small>VITRINE ROTATIVA</small>
     <span class="loop03-vitrine-ilustracao" aria-hidden="true"><span class="loop03-vitrine-caneta"></span></span>
     <strong>PRODUTOS E CURSOS</strong>
     <span class="loop03-vitrine-link">CONHECER A LOJA →</span>
    </a>
    <div class="loop03-identidade" aria-label="Identificação visual, sem ação">
     <div class="loop03-avatar" aria-hidden="true">◉</div>
     <div><strong id="loop03NomeBaixo">Participante</strong><small id="loop03SituacaoBaixo">Selecione sua posição</small></div>
    </div>
    <button id="loop03Sair" type="button" class="loop03-sair">Sair da conta de teste</button>
   </aside>
   <div class="loop03-corpo">
    <div class="loop03-banner-topo">
     <div><div class="loop03-logomarca">LOOP <span>0.3</span></div>
      <p>PLATAFORMA DE CICLOS INTELIGENTES</p>
      <small>ESTRATÉGIA · ORGANIZAÇÃO · RESULTADOS</small></div>
     <div class="loop03-enfeite" aria-hidden="true">✧</div>
    </div>
    <div class="loop03-boasvindas">
     <button class="loop03-hamburguer" id="loop03Menu" type="button" aria-expanded="false" aria-controls="loop03Sidebar" aria-label="Abrir menu">☰</button>
     <div><h2 id="loop03BoasVindas">Bem-vindo!</h2><p>Disciplina hoje, liberdade amanhã.</p></div>
     <div class="loop03-acoes-perfil">
      <span class="loop03-sino" title="Notificações; integração pendente" aria-label="Notificações">♧</span>
      <button data-loop03-aba="perfil" type="button" id="loop03PerfilTopo">Meu perfil ⚙</button>
     </div>
    </div>
    <div class="loop03-indicadores" aria-label="Resumo da conta">
     <button data-loop03-aba="posicoes" type="button" class="loop03-indicador"><small>ϟ POSIÇÕES</small><strong id="loop03TotalAtivacoes">6/6</strong><span>Minhas posições</span></button>
     <div class="loop03-indicador"><small>◷ GIROS</small><strong id="loop03Giros24">—</strong><span>Últimas 24 horas · aguardando indicador</span></div>
     <button data-loop03-aba="posicoes" type="button" class="loop03-indicador"><small>♙ NÚMERO</small><strong id="loop03Numero">#0000</strong><span id="loop03NumeroDetalhe">Escolha uma posição</span></button>
     <button data-loop03-aba="financeiro" type="button" class="loop03-indicador"><small>▥ FINANCEIRO</small><strong id="loop03Saldo">R$ 0,00</strong><span>Saldo fictício disponível</span></button>
    </div>
    <div class="loop03-paginas">
     <section id="loop03-home" class="loop03-pagina" aria-label="Escritório Virtual">
      <header class="loop03-titulo-pagina"><div><small>ESCRITÓRIO LOOP 0.3</small><h2>Novidades e eventos</h2></div><span class="loop03-luz">● Comunicados</span></header>
      <div class="loop03-hero-escritorio" aria-label="Escritório Virtual LOOP 0.3">
        <div class="loop03-hero-titulo">ESCRITÓRIO <span>VIRTUAL</span></div>
        <p class="loop03-hero-subtitulo">GERENCIE <b>·</b> ACOMPANHE <b>·</b> EVOLUA</p>
        <div class="loop03-cenario-escritorio" aria-hidden="true">
         <div class="loop03-cenario-luz loop03-cenario-luz-a"></div>
         <div class="loop03-cenario-luz loop03-cenario-luz-b"></div>
         <div class="loop03-cenario-monitor"><div class="loop03-cenario-tela"><span>LOOP <em>0.3</em></span><small>ACOMPANHE SUAS POSIÇÕES</small></div><div class="loop03-cenario-base"></div></div>
         <div class="loop03-cenario-mesa"></div>
        </div>
        <button type="button" data-loop03-aba="posicoes" class="loop03-hero-botao">ACOMPANHAR MINHAS POSIÇÕES →</button>
       </div>
       <div class="loop03-mural-titulo">COMUNICADOS DA ADMINISTRAÇÃO</div>
       <div id="loop03Publicacoes" class="loop03-publicacoes" aria-live="polite"><p>Os banners selecionados pela administração aparecerão aqui.</p></div>
     </section>
     <section id="loop03-tabuleiro" class="loop03-pagina" aria-label="Tabuleiro">
      <header class="loop03-titulo-pagina"><div><small>LOOP · MOTOR DE FILAS</small><h2>Tabuleiro LOOP 0.3</h2></div><span class="loop03-luz">● Ciclo em andamento</span></header>
      <div class="loop03-escolha"><span id="loop03EscolhaTexto">Visão geral, nenhuma posição escolhida</span><button id="loop03EscolherNoTabuleiro" type="button">Escolher minha posição</button></div>
      <div id="loop03EscolhaPainel" class="loop03-escolha-painel" hidden><h3>Qual posição você quer acompanhar?</h3><div id="loop03AtivacoesTabuleiro" class="loop03-opcoes"></div></div>
     </section>
     <section id="loop03-posicoes" class="loop03-pagina" aria-label="Minhas Posições">
      <header class="loop03-titulo-pagina loop03-titulo-central"><div><h2>Minhas Posições</h2><p>Acompanhe suas posições e o andamento de cada uma no LOOP.</p></div></header>
      <div class="loop03-saldo-indicados" aria-live="polite">
       <span>Indicações disponíveis para distribuir</span>
       <strong id="loop03SaldoDisponivel">0</strong>
      </div>
      <p id="loop03AvisoDistribuicao" class="loop03-aviso-distribuicao" role="status" aria-live="polite"></p>
      <div id="loop03OpcoesPosicoes" class="loop03-opcoes loop03-grade-posicoes"></div>
      <div id="loop03DetalhesPosicao" class="loop03-detalhes" aria-live="polite">Nenhuma posição selecionada.</div>
     </section>
     <section id="loop03-rede" class="loop03-pagina" aria-label="Rede e Equipe">
      <header class="loop03-titulo-pagina loop03-cabecalho-equipe">
       <div class="loop03-contador-rede loop03-contador-total"><small>TOTAL DE POSIÇÕES</small><strong id="loop03RedeTotalPosicoes">0</strong><span>Indicações confirmadas</span></div>
       <div class="loop03-titulo-equipe"><small>INDICAÇÕES</small><h2>Minha Equipe</h2><p>Pessoas que entraram pelo seu link</p></div>
       <div class="loop03-contador-rede loop03-contador-pendentes"><small>POSIÇÕES A DISTRIBUIR</small><strong id="loop03RedeADistribuir">0</strong><span>Aguardando sua escolha</span></div>
      </header>
      <div id="loop03ListaEquipe" class="loop03-opcoes" aria-live="polite"></div>
     </section>
     <section id="loop03-financeiro" class="loop03-pagina" aria-label="Financeiro"><header class="loop03-titulo-pagina"><div><small>EXTRATO E SAQUES</small><h2>Financeiro</h2></div></header></section>
     <section id="loop03-perfil" class="loop03-pagina" aria-label="Meu perfil"><header class="loop03-titulo-pagina"><div><small>CADASTRO</small><h2>Meu perfil</h2></div></header><p>Atualização de foto, telefone e e-mail ainda será integrada. A confirmação individual e o CPF fictício ficam em Minhas Posições.</p></section>
    </div>
   </div>`;
  shell.prepend(shell.querySelector('.loop03-banner-topo'));
  root.prepend(shell);
  // Reaproveita as telas e operacoes existentes, sem duplicar IDs ou formularios.
  const mover=(selector,pagina)=>{
   const node=root.querySelector(selector);
   if(node)e('loop03-'+pagina).append(node);
  };
  const extrato=e('tituloCreditosPrevistosV6')?.closest('section.cartao-participante');
  if(extrato)e('loop03-financeiro').append(extrato);
  if(e('tituloCreditosPrevistosV6'))e('tituloCreditosPrevistosV6').textContent='Meu extrato de ciclos — LOOP 0.3';
  const resumo=e('nomeLogadoParticipante')?.closest('section.cartao-participante');
  if(resumo){
   const links=resumo.querySelector('.area-indicacoes-participante');
   const bonus=resumo.querySelector('.area-bonus-participante');
   if(links)e('loop03-rede').append(links);
   if(bonus)e('loop03-financeiro').append(bonus);
   e('loop03-posicoes').append(resumo);
  }
  const historico=e('tituloHistoricoLojaParticipante')?.closest('section.cartao-participante');
  if(historico)e('loop03-posicoes').append(historico);
  for(const id of ['secaoAtivacaoParticipante','secaoDesistenciaVaga6Participante']){
   mover('#'+id,'posicoes');
  }
  const mapa=e('tituloMapaParticipante')?.closest('section.cartao-participante');
  if(mapa){
   e('loop03-tabuleiro').append(mapa);
   const filas=mapa.querySelector('.colunas-filas-participante');
   const filaA=filas?.children[0], filaB=filas?.children[1];
   // Simbolos definidos no desenho: moedas amarelas na A, boneco branco na B.
   for(const [coluna,icone] of [[filaA,'🪙'],[filaB,'♟']]){
    const h=coluna?.querySelector('h3');
    if(!h)continue;
    const tag=document.createElement('span');tag.className='loop03-icone-cabecalho';
    tag.textContent=icone;tag.setAttribute('aria-hidden','true');
    h.prepend(tag);
   }
   const painel=mapa.querySelector('.painel-tabuleiro-imersivo');
   const titulo=mapa.querySelector('.titulo-tabuleiro-participante');
   if(filaA&&filaB&&painel&&titulo){
    const grid=document.createElement('div');grid.className='loop03-mapa-grade';
    const centro=document.createElement('div');centro.className='loop03-roda';
    const detalhe=titulo.nextElementSibling;
    centro.append(titulo);
    if(detalhe?.matches('p'))centro.append(detalhe);
    centro.append(painel);
    grid.append(filaA,centro,filaB);
    // Desenho das filas e centro primeiro; explicacoes e filtros seguem acessiveis abaixo.
    mapa.prepend(grid);
    filas.remove();
   }
   const contaB=e('contadorFilaBParticipante');
   if(contaB)contaB.hidden=true;
  }
  const posicoes=e('posicoesParticipante')?.closest('section.cartao-participante');
  const compras=e('pedidosParticipante')?.closest('section.cartao-participante');
  if(posicoes)e('loop03-posicoes').append(posicoes);
  if(compras)e('loop03-posicoes').append(compras);
  // Seis cartoes e contador primeiro; nenhum formulario e removido.
  const secundarios=[resumo,historico,posicoes,compras].filter(Boolean);
  if(secundarios.length){
   const detalhes=document.createElement('details');
   detalhes.className='loop03-extras-posicoes';
   const cabeca=document.createElement('summary');
   cabeca.textContent='Consultar histórico, pedidos e informações da conta';
   detalhes.append(cabeca,...secundarios);
   e('loop03-posicoes').append(detalhes);
  }
  const limites=e('atualizarParticipante')?.closest('section.cartao-participante');
  if(limites)e('loop03-perfil').append(limites);
  // Cartao anterior de atalho à loja: preservar a mesma loja.
  const atalhoLoja=[...root.querySelectorAll('section.cartao-participante')]
   .find(n=>n.querySelector('h2')?.textContent==='Minha loja de testes');
  if(atalhoLoja)e('loop03-home').append(atalhoLoja);
  const antiga=root.querySelector('.atalhos-participante');
  if(antiga)antiga.classList.add('loop03-atalhos-legados');
  const tituloMarcos=mapa?.querySelector('.titulo-marcos-loop');
  if(tituloMarcos)tituloMarcos.remove();
  for(const container of root.querySelectorAll('.duas-colunas-participante')){
   if(!container.children.length)container.remove();
  }
  for(const control of root.querySelectorAll('[data-loop03-aba]'))
   control.addEventListener('click',()=>abrir(control.dataset.loop03Aba));
  e('loop03Menu').addEventListener('click',()=>{
   const aberto=e('loop03Sidebar').classList.toggle('loop03-aberto');
   e('loop03Menu').setAttribute('aria-expanded',String(aberto));
  });
  e('loop03Sair').addEventListener('click',()=>e('botaoSairParticipante').click());
  e('loop03EscolherNoTabuleiro').addEventListener('click',()=>{
   const painel=e('loop03EscolhaPainel');painel.hidden=!painel.hidden;
  });
  abrir('home');
  carregarPublicacoes();
 }
 function abrir(aba){
  if(!paginas.includes(aba))return;
  abaAtual=aba;
  for(const item of paginas)e('loop03-'+item).hidden=item!==aba;
  for(const b of document.querySelectorAll('[data-loop03-aba]'))
   b.setAttribute('aria-current',b.dataset.loop03Aba===aba?'page':'false');
  e('loop03Sidebar').classList.remove('loop03-aberto');
  e('loop03Menu').setAttribute('aria-expanded','false');
 }
 function statusPosicao(p){
  const l=p.local||'';
  return /^FILA_[AB]$/.test(l)?'Fila '+l.slice(-1):l==='FILA'?'Fila '+(p.fila||'—'):l==='CENTRO'?'Centro do giro':
    l.startsWith('VAGA_')?'Dentro do giro · Vaga '+l.slice(5):l||'Em acompanhamento';
 }
 function selecionar(p,abrirTabuleiro=false){
  selecionada=p.posicaoId;
  if(abrirTabuleiro)abrir('tabuleiro');
  e('loop03Numero').textContent='#'+p.posicaoId;
  e('loop03NumeroDetalhe').textContent=statusPosicao(p);
  e('loop03EscolhaTexto').textContent='Posição #'+p.posicaoId+' · '+statusPosicao(p);
  e('loop03SituacaoBaixo').textContent=statusPosicao(p);
  const ordem=(visaoAtual?.posicoes||[]).findIndex(x=>x.posicaoId===p.posicaoId);
  if(ordem>=0)e('loop03TotalAtivacoes').textContent=visaoAtual.posicoes.length+'/'+visaoAtual.limitePosicoesAtivas;
  const precisa=p.statusAdesao==='PENDENTE';
  const caixa=e('secaoAtivacaoParticipante');
  if(caixa)caixa.hidden=!precisa;
  const primeiro=!visaoAtual?.adesao?.cpfConfirmadoNoTeste;
  for(const id of ['cpfFicticioParticipante','aceiteTermosParticipante']){
   const campo=e(id);if(!campo)continue;
   campo.required=precisa&&primeiro;
   campo.disabled=!primeiro;
   const rotulo=campo.id==='cpfFicticioParticipante'?document.querySelector('label[for="cpfFicticioParticipante"]'):campo.closest('label');
   if(rotulo)rotulo.hidden=!primeiro;
   if(campo.id==='cpfFicticioParticipante')campo.hidden=!primeiro;
  }
  const btn=e('confirmarAtivacaoParticipante');
  if(btn)btn.textContent=primeiro?'Confirmar CPF fictício e esta posição':'Confirmar somente esta posição';
  const tit=caixa?.querySelector('h2');if(tit)tit.textContent='Confirmar posição #'+p.posicaoId;
  const alvo=e('loop03DetalhesPosicao');
  alvo.replaceChildren();
  const titulo=document.createElement('h3');titulo.textContent='Posição nº '+p.posicaoId;
  const info=document.createElement('p');
  info.textContent=statusPosicao(p)+' · '+(p.statusAdesao==='PENDENTE'?'Aguardando confirmação individual':'Posição confirmada no laboratório');
  const ir=document.createElement('button');ir.type='button';
  ir.textContent='Localizar no tabuleiro';ir.addEventListener('click',()=>abrir('tabuleiro'));
  alvo.append(titulo,info,ir);
  for(const no of document.querySelectorAll('[data-posicao-id]'))
   no.classList.toggle('loop03-destaque-posicao',no.dataset.posicaoId===String(selecionada));
  for(const no of document.querySelectorAll('[data-loop03-posicao]'))
   no.setAttribute('aria-pressed',no.dataset.loop03Posicao===String(selecionada)?'true':'false');
 }
 function destacarPosicoes(){
  for(const node of document.querySelectorAll('.mapa-fila-posicoes-demo .selo-posicao-demo, .mapa-tabuleiro-posicoes-demo .selo-posicao-demo')){
   node.classList.toggle('loop03-iluminada',node.classList.contains('minha-posicao-demo'));
   node.classList.toggle('loop03-destaque-posicao',node.dataset.posicaoId===String(selecionada));
  }
 }
 function atualizar(visao){
  if(!e('loop03Shell'))montar();
  visaoAtual=visao;
  document.body.classList.add('loop03-logado');
  const nome=visao.conta.nome;
  e('loop03NomeBaixo').textContent=nome;
  e('loop03BoasVindas').textContent='Bem-vindo, '+nome.split(/\s+/)[0]+'!';
  e('loop03PerfilTopo').textContent=nome+' ⚙';
  const n=visao.posicoes.length;
  e('loop03TotalAtivacoes').textContent=n+'/'+visao.limitePosicoesAtivas;
  const bonus=visao.saquesSimulados?.bonusDisponivelSimuladoCentavos||0;
  e('loop03Giros24').textContent=Number.isSafeInteger(visao.girosUltimas24Horas)?String(visao.girosUltimas24Horas):'—';
  e('loop03Saldo').textContent=(bonus/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const etapa=visao.progressoCiclo?.eventosValidos;
  for(const [i,m] of [...document.querySelectorAll('.marcos-v6 > span')].entries()){
   m.classList.toggle('loop03-aceso',Number.isSafeInteger(etapa)&&i<etapa);
   m.setAttribute('aria-label','Evento '+(i+1)+': '+
    (!Number.isSafeInteger(etapa)?'andamento ainda nao disponivel':i<etapa?'registrado':'aguardando'));
  }
  // Opcoes existentes do titular para localizar a sua posicao no Tabuleiro.
  const opcoesTabuleiro=e('loop03AtivacoesTabuleiro');
  opcoesTabuleiro.replaceChildren();
  for(const [indice,p] of visao.posicoes.entries()){
   const botao=document.createElement('button');botao.type='button';
   botao.className='loop03-opcao';botao.dataset.loop03Posicao=String(p.posicaoId);
   const titulo=document.createElement('strong');titulo.textContent='Posição '+(indice+1)+' · #'+p.posicaoId;
   const detalhe=document.createElement('small');detalhe.textContent=statusPosicao(p);
   botao.append(titulo,detalhe);
   botao.addEventListener('click',()=>{selecionar(p,true);e('loop03EscolhaPainel').hidden=true;});
   opcoesTabuleiro.append(botao);
  }

  // Seis espacos da grade aprovada. Apenas as posicoes compradas tem numero e acao.
  const cartoes=e('loop03OpcoesPosicoes');cartoes.replaceChildren();
  for(let indice=0;indice<6;indice++){
   const p=visao.posicoes[indice];
   const estado=p?.statusAdesao==='PENDENTE'?'pendente':
    p?.local==='CENTRO'?'centro':p?.local==='FILA_A'?'a':
    p?.local==='FILA_B'?'b':p?'giro':'vazia';
   const cartao=document.createElement(p?'button':'div');
   cartao.className='loop03-opcao loop03-cartao-posicao loop03-posicao-'+estado+
    (p?'':' loop03-posicao-vazia');
   if(p){
    cartao.type='button';cartao.dataset.loop03Posicao=String(p.posicaoId);
    cartao.setAttribute('aria-pressed',String(p.posicaoId===selecionada));
   }
   const rotulo=document.createElement('span');rotulo.className='loop03-cartao-rotulo';
   rotulo.textContent='POSIÇÃO '+(indice+1);
   const miolo=document.createElement('div');miolo.className='loop03-cartao-miolo';
   const selo=document.createElement('span');selo.className='loop03-cartao-selo';
   selo.textContent=estado==='centro'?'C':estado==='a'?'A':estado==='b'?'B':
    estado==='pendente'?'•':estado==='giro'?'◉':'+';
   const identidade=document.createElement('div');identidade.className='loop03-cartao-identidade';
   const numero=document.createElement('strong');numero.textContent=p?'#'+p.posicaoId:'—';
   const situacao=document.createElement('span');
   situacao.textContent=!p?'SEM POSIÇÃO':estado==='pendente'?'AGUARDANDO CONFIRMAÇÃO':
    statusPosicao(p).toUpperCase();
   identidade.append(numero,situacao);miolo.append(selo,identidade);
   const resumo=document.createElement('div');resumo.className='loop03-cartao-resumo';
   const resumoTitulo=document.createElement('strong');
   resumoTitulo.textContent=!p?'Espaço disponível':estado==='pendente'?
    'Confirmação individual necessária':estado==='centro'?'Ciclo em andamento':
    (p.indicacoesRecebidas||0)+' indicação(ões) válida(s)';
   const resumoTexto=document.createElement('small');
   resumoTexto.textContent=!p?'Sem posição cadastrada':estado==='pendente'?
    'Selecione para confirmar':estado==='centro'?'Acompanhamento ativo':'Aguardando avanço';
   resumo.append(resumoTitulo,resumoTexto);cartao.append(rotulo,miolo,resumo);
   if(estado==='pendente'){
    const ponto=document.createElement('span');ponto.className='loop03-pendencia-ponto';
    ponto.title='Confirmação individual pendente';
    ponto.setAttribute('aria-label','Posição aguardando confirmação');
    cartao.append(ponto);
   }
   if(p)cartao.addEventListener('click',()=>selecionar(p));
   const unidade=document.createElement('div');unidade.className='loop03-unidade-posicao';
   unidade.append(cartao);
   if(p){
    const adicionar=document.createElement('button');
    adicionar.type='button';adicionar.className='loop03-adicionar-indicado';
    adicionar.textContent='+ Adicionar indicado';
    adicionar.setAttribute('aria-label','Adicionar um indicado à posição #'+p.posicaoId);
    const ativa=p.statusAdesao!=='PENDENTE'&&
     /^(FILA_[AB]|CENTRO|VAGA_[1-6])$/.test(p.local);
    adicionar.disabled=!ativa||!(visao.contadoresRede?.disponiveisParaVincular>0);
    adicionar.title=!ativa?'Confirme esta posição primeiro':
     'Vincular definitivamente o próximo indicado ativo disponível';
    adicionar.addEventListener('click',async()=>{
     const aviso=e('loop03AvisoDistribuicao');
     if(!window.confirm('Vincular uma indicação à posição #'+p.posicaoId+
      '? Esse vínculo é definitivo.'))return;
     adicionar.disabled=true;aviso.textContent='Registrando indicação…';
     try{
      const resposta=await fetch('/api/laboratorio/participante/atribuir-proxima-indicacao',{
       method:'POST',credentials:'same-origin',
       headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
       body:JSON.stringify({posicaoId:p.posicaoId})
      });
      const dados=await resposta.json();
      if(!resposta.ok)throw Error(dados.erro||'Não foi possível adicionar');
      aviso.textContent='Indicação vinculada à posição #'+p.posicaoId+'.';
      await window.LoopParticipanteAtualizar?.();
     }catch(err){aviso.textContent='Falha ao adicionar: '+err.message;
      adicionar.disabled=false;}
    });
    unidade.append(adicionar);
   }
   cartoes.append(unidade);
  }
  // A esquerda o total so aumenta; a direita somente os vinculos ainda nao
  // atribuidos manualmente (nunca auto-repassados pelo sistema).
  e('loop03SaldoDisponivel').textContent=String(visao.contadoresRede?.disponiveisParaVincular??0);
  e('loop03RedeTotalPosicoes').textContent=String(visao.contadoresRede?.totalPosicoes??0);
  e('loop03RedeADistribuir').textContent=String(visao.contadoresRede?.aDistribuir??0);
  const equipes=e('loop03ListaEquipe');equipes.replaceChildren();
  for(const pessoa of visao.equipe||[]){
   const cartao=document.createElement('div');cartao.className='loop03-opcao loop03-equipe-linha';
   const titulo=document.createElement('strong');titulo.textContent=pessoa.nome;
   const dados=document.createElement('small');dados.className='loop03-equipe-informacoes';
   const situacao=pessoa.situacao==='AGUARDANDO_CONFIRMACAO'?'AGUARDANDO CONFIRMAÇÃO':
    pessoa.estado==='ATIVO'?'ATIVO':'PENDENTE';
   dados.textContent=(pessoa.telefone||'Telefone não informado')+' · '+situacao;
   if(pessoa.filaAtual==='A'||pessoa.filaAtual==='B'||pessoa.filaAtual==='TABULEIRO'){
    const fila=document.createElement('span');
    fila.className='loop03-fila-equipe-'+pessoa.filaAtual.toLowerCase();
    fila.textContent=pessoa.filaAtual==='TABULEIRO'?' · Tabuleiro':' · Fila '+pessoa.filaAtual;
    dados.append(fila);
   }
   if(pessoa.posicaoAtribuidaId!==null){
    dados.append(document.createTextNode(' · Vinculada à posição #'+pessoa.posicaoAtribuidaId));
   }else if(pessoa.estado!=='ATIVO'){
    dados.append(document.createTextNode(' · Atribuição indisponível até a confirmação'));
   }
   cartao.append(titulo,dados);
   if(pessoa.posicaoAtribuidaId===null&&pessoa.estado==='ATIVO'){
    const botao=document.createElement('button');botao.type='button';
    botao.textContent='⋮';botao.setAttribute('aria-label','Escolher posição para '+pessoa.nome);
    const escolhas=document.createElement('div');escolhas.hidden=true;
    const op=document.createElement('select');op.setAttribute('aria-label','Posição destinatária');
    const vazio=document.createElement('option');vazio.value='';vazio.textContent='Escolher minha posição';
    op.append(vazio);
    for(const [i,p] of visao.posicoes.entries()){
     if(p.statusAdesao==='PENDENTE'||
      !/^(FILA_[AB]|CENTRO|VAGA_[1-6])$/.test(p.local))continue;
     const item=document.createElement('option');item.value=String(p.posicaoId);
     item.textContent='Posição '+(i+1)+' · #'+p.posicaoId;op.append(item);
    }
    const confirmar=document.createElement('button');confirmar.type='button';
    confirmar.textContent='Confirmar vínculo definitivo';
    const aviso=document.createElement('small');aviso.setAttribute('role','status');
    botao.addEventListener('click',()=>{escolhas.hidden=!escolhas.hidden;});
    confirmar.addEventListener('click',async()=>{
     const posicaoId=Number(op.value);
     if(!op.value)return aviso.textContent='Escolha uma posição ativa.';
     if(!window.confirm('Vincular '+pessoa.nome+' à posição #'+posicaoId+
       '? Depois de confirmado, não será possível alterar.'))return;
     confirmar.disabled=true;
     try{
      const resposta=await fetch('/api/laboratorio/participante/atribuir-indicacao',{
       method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
       credentials:'same-origin',body:JSON.stringify({convidadoId:pessoa.convidadoId,posicaoId})
      });
      const resultado=await resposta.json();
      if(!resposta.ok)throw Error(resultado.erro||'Falha ao atribuir');
      await window.LoopParticipanteAtualizar?.();
     }catch(err){aviso.textContent=err.message;confirmar.disabled=false;}
    });
    escolhas.append(op,confirmar,aviso);cartao.append(botao,escolhas);
   } else if(pessoa.posicaoAtribuidaId!==null){
    const botao=document.createElement('button');botao.type='button';
    botao.textContent='⋮';botao.setAttribute('aria-label','Ver vínculo de '+pessoa.nome);
    const leitura=document.createElement('small');leitura.hidden=true;
    leitura.textContent='Vinculada definitivamente à posição #'+pessoa.posicaoAtribuidaId;
    botao.addEventListener('click',()=>{leitura.hidden=!leitura.hidden;});
    cartao.append(botao,leitura);
   } else {
    const botao=document.createElement('button');botao.type='button';
    botao.textContent='⋮';botao.disabled=true;
    botao.title='Aguarde a confirmação individual da posição do indicado';
    botao.setAttribute('aria-label','Indicação ainda pendente de confirmação');
    cartao.append(botao);
   }
   equipes.append(cartao);
  }
  if(!visao.equipe?.length)equipes.textContent='Ainda não há pessoas cadastradas pelo seu link.';
  destacarPosicoes();
  const atual=visao.posicoes.find(p=>p.posicaoId===selecionada);
  if(atual)selecionar(atual);
  else{
   selecionada=null;
   e('loop03Numero').textContent='#0000';
   e('loop03NumeroDetalhe').textContent='Escolha uma posição';
   e('loop03EscolhaTexto').textContent='Visão geral, nenhuma posição escolhida';
   e('loop03SituacaoBaixo').textContent='Nenhuma posição selecionada';
   e('loop03DetalhesPosicao').textContent='Selecione uma posição acima.';
   const caixa=e('secaoAtivacaoParticipante');if(caixa)caixa.hidden=true;
  }
  if(!destinoInicialTratado){
   destinoInicialTratado=true;
   const hash=location.hash.slice(1);
   if(hash==='tituloMapaParticipante')abrir('tabuleiro');
   if(hash==='tituloHistoricoLojaParticipante'||hash==='secaoAtivacaoParticipante')abrir('posicoes');
  }
 }
 async function carregarPublicacoes(){
  const target=e('loop03Publicacoes');
  try{
   const resp=await fetch('/api/laboratorio/loop03/publicacoes',{cache:'no-store'});
   if(!resp.ok)throw Error('Indisponível');
   const dados=await resp.json();
   target.replaceChildren();
   if(!dados.publicacoes.length){
    const vazio=document.createElement('p');
    vazio.textContent='Nenhum banner publicado pela administração por enquanto.';
    target.append(vazio);return;
   }
   for(const pub of dados.publicacoes){
    const card=document.createElement('article');card.className='loop03-publicacao';
    if(pub.imagemCaminho){const img=document.createElement('img');img.src=pub.imagemCaminho;img.alt=pub.titulo;img.loading='lazy';card.append(img);}
    const tipo=document.createElement('small');tipo.textContent=pub.tipo;
    const title=document.createElement('h3');title.textContent=pub.titulo;
    const descricao=document.createElement('p');descricao.textContent=pub.descricao;
    card.append(tipo,title,descricao);
    if(pub.linkDestino&&['/loja','/escritorio'].includes(pub.linkDestino)){
     const a=document.createElement('a');a.href=pub.linkDestino;
     a.textContent=pub.linkDestino==='/loja'?'Ver na AKITEMM':'Abrir conteúdo';card.append(a);
    }
    target.append(card);
   }
  }catch{
   target.textContent='Não foi possível consultar os comunicados. Tente novamente mais tarde.';
  }
 }
 function encerrar(){document.body.classList.remove('loop03-logado');selecionada=null;visaoAtual=null;destinoInicialTratado=false;abrir('home');}
 window.Loop03Shell={montar,atualizar,encerrar,abrir,destacarPosicoes,
  posicaoSelecionada:()=>selecionada};
 montar();
})();