'use strict';
// LOOP 3.0: camada visual sobre o escritorio JA EXISTENTE.
// Os formularios, IDs, sessoes, motor de filas e a loja continuam os mesmos.
(()=>{
 const e=id=>document.getElementById(id);
 let selecionada=null, visaoAtual=null, abaAtual='home', destinoInicialTratado=false;
 let fotoPerfilAcao='MANTER';
 const paginas=['home','tabuleiro','posicoes','rede','financeiro','perfil'];
 function montar(){
  const root=e('conteudoParticipante');
  if(!root||e('loop03Shell'))return;
  const shell=document.createElement('div');
  shell.id='loop03Shell';
  shell.className='loop03-shell';
  shell.innerHTML=String.raw`
   <aside class="loop03-sidebar" id="loop03Sidebar" aria-label="Menu LOOP 3.0">
    <div class="loop03-marca">LOOP <span>3.0</span></div>
    <nav aria-label="Áreas do escritório">
     <button data-loop03-aba="home" type="button"><span>⌂</span> Escritório Virtual</button>
     <button data-loop03-aba="tabuleiro" type="button"><span>◉</span> Tabuleiro</button>
     <button data-loop03-aba="posicoes" type="button"><span class="loop03-menu-simbolo loop03-icone-posicoes" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="15" height="18" rx="2"/><path d="M8 8h9M8 12h9M8 16h6M3 6v12"/></svg></span> Minhas Posições</button>
     <button data-loop03-aba="rede" type="button"><span class="loop03-menu-simbolo loop03-icone-rede" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M5 20v-2c0-3 2.4-5 7-5s7 2 7 5v2"/><circle cx="4" cy="10" r="2"/><path d="M1 19v-3c0-1.5 1-2.4 2-2.7"/><circle cx="20" cy="10" r="2"/><path d="M23 19v-3c0-1.5-1-2.4-2-2.7"/></svg></span> Rede e Equipe</button>
     <button data-loop03-aba="financeiro" type="button"><span class="loop03-menu-simbolo loop03-icone-financeiro" aria-hidden="true">$</span> Financeiro</button>
     <a href="/loja"><span class="loop03-menu-simbolo loop03-icone-akitemm" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg></span> AKITEMM</a>
    </nav>
    <a href="/loja" class="loop03-vitrine-lateral" aria-label="Abrir vitrine AKITEMM">
     <span class="loop03-vitrine-marca">AKITEMM</span>
     <small>VITRINE ROTATIVA</small>
     <span class="loop03-vitrine-ilustracao" id="loop03VitrineArea">
      <img id="loop03VitrineFoto" alt="" hidden loading="lazy">
      <span id="loop03VitrineEstado" class="loop03-vitrine-sem-produto" hidden></span>
      <span id="loop03VitrineNome" class="loop03-vitrine-nome-produto" hidden></span>
     </span>
     <strong>PRODUTOS E CURSOS</strong>
     <span class="loop03-vitrine-link">CONHECER A LOJA →</span>
    </a>
    <div class="loop03-identidade loop03-identidade-selecionada" aria-label="Identidade da posição escolhida" aria-live="polite">
     <span class="loop03-avatar" aria-hidden="true"><img class="loop03-foto-privada" alt="" hidden><span class="loop03-foto-padrao">👤</span></span>
     <span class="loop03-dados-perfil" id="loop03DadosPosicaoLateral" hidden>
      <strong id="loop03NomeBaixo"></strong>
      <small id="loop03SituacaoBaixo" hidden></small>
     </span>
     <span id="loop03CoroaTabuleiro" class="loop03-coroa-tabuleiro" title="Posição dentro da catraca" aria-label="Posição dentro da catraca" hidden>♛</span>
    </div>
   </aside>
   <div class="loop03-corpo">
    <div class="loop03-banner-topo">
     <div><div class="loop03-logomarca">LOOP <span>3.0</span></div>
      <p>PLATAFORMA DE CICLOS INTELIGENTES</p>
      <small>ESTRATÉGIA · ORGANIZAÇÃO · RESULTADOS</small></div>
     <div class="loop03-enfeite" aria-hidden="true">✧</div>
    </div>
    <div class="loop03-boasvindas">
     <button class="loop03-hamburguer" id="loop03Menu" type="button" aria-expanded="false" aria-controls="loop03Sidebar" aria-label="Abrir menu">☰</button>
     <div><h2 id="loop03BoasVindas">Bem-vindo!</h2><p>Disciplina hoje, liberdade amanhã.</p></div>
     <div class="loop03-acoes-perfil">
      <button class="loop03-sino" id="loop03NotificacoesBotao" type="button"
       aria-haspopup="true" aria-expanded="false" aria-controls="loop03PainelNotificacoes"
       title="Notificações" aria-label="Abrir notificações">
       <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
        <path d="M10 21h4"/>
       </svg>
      </button>
      <div id="loop03PainelNotificacoes" class="loop03-painel-notificacoes" hidden
       role="region" aria-label="Minhas notificações">
       <div class="loop03-notificacoes-titulo"><strong>Notificações</strong>
        <button type="button" id="loop03FecharNotificacoes" aria-label="Fechar notificações">×</button>
       </div>
       <div id="loop03ItensNotificacoes" aria-live="polite">Nenhuma notificação por enquanto.</div>
      </div>
      <button type="button" id="loop03PerfilTopo" aria-label="Abrir configurações do meu perfil" title="Meu Perfil">
       <span class="loop03-foto-topo" aria-hidden="true"><img class="loop03-foto-privada" alt="" hidden><span class="loop03-foto-padrao">👤</span></span>
      </button>
     </div>
    </div>
    <div class="loop03-indicadores" aria-label="Resumo da conta">
     <button id="loop03AbrirEscolhaPosicao" type="button" class="loop03-indicador" aria-haspopup="dialog" aria-controls="loop03SeletorPosicao" aria-expanded="false"><small>ϟ POSIÇÕES</small><strong id="loop03TotalAtivacoes">0/6</strong><span>Escolher minha posição</span></button>
     <div id="loop03IndicadorGiros" class="loop03-indicador loop03-visor-passivo" aria-label="Visor de giros concluídos nas últimas 24 horas"><small>◷ GIROS</small><strong id="loop03Giros24">—</strong><span>Giros concluídos nas últimas 24 horas</span></div>
     <div id="loop03VisorNumero" class="loop03-indicador loop03-visor-passivo loop03-visor-numero" aria-label="Número da posição selecionada, somente leitura">
       <span id="loop03LetraFila" class="loop03-visor-letra" hidden></span>
       <span id="loop03CoroaVisor" class="loop03-visor-coroa" aria-label="Posição dentro da catraca" hidden>♛</span>
       <strong id="loop03Numero">#0000</strong>
       <span id="loop03IndicePosicao" class="loop03-visor-fracao">0/6</span>
       <span id="loop03NumeroDetalhe" class="loop03-visualmente-oculto">Nenhuma posição selecionada</span>
      </div>
     <div id="loop03IndicadorFinanceiro" class="loop03-indicador loop03-visor-passivo loop03-visor-financeiro" role="group" aria-label="Resumo financeiro da posição selecionada: somente leitura">
       <small>▥ FINANCEIRO</small>
       <span id="loop03BonusDez" class="loop03-bonus-superior">Bônus 10% · —</span>
       <strong id="loop03Saldo">—</strong>
       <span class="loop03-lucro-legenda">Participação de lucro</span>
      </div>
    </div>
    <div id="loop03SeletorPosicao" class="loop03-seletor-fundo" hidden role="dialog" aria-modal="true" aria-labelledby="loop03EscolhaTitulo">
     <div class="loop03-seletor-janela">
      <div class="loop03-seletor-topo"><h2 id="loop03EscolhaTitulo">Escolher posição para acompanhar</h2>
       <button id="loop03FecharEscolha" type="button" aria-label="Fechar escolha de posição">×</button>
      </div>
      <p>Selecione uma posição da sua conta. A catraca e as filas continuam funcionando para todos.</p>
      <div id="loop03ListaEscolha" class="loop03-lista-escolha" aria-live="polite"></div>
     </div>
    </div>
    <div id="loop03DetalheIndicador" class="loop03-seletor-fundo" hidden role="dialog" aria-modal="true" aria-labelledby="loop03DetalheTitulo">
     <div class="loop03-seletor-janela">
      <div class="loop03-seletor-topo"><h2 id="loop03DetalheTitulo"></h2>
       <button type="button" id="loop03FecharDetalhe" aria-label="Fechar informações">×</button>
      </div>
      <strong id="loop03DetalheValor" class="loop03-detalhe-valor"></strong>
      <p id="loop03DetalheTexto"></p>
     </div>
    </div>
    <div id="loop03FundoPerfil" class="loop03-fundo-perfil" hidden></div>
    <div class="loop03-paginas">
     <section id="loop03-home" class="loop03-pagina" aria-label="Escritório Virtual">
      <header class="loop03-titulo-pagina"><div><small>ESCRITÓRIO LOOP 3.0</small><h2>Novidades e eventos</h2></div><span class="loop03-luz">● Comunicados</span></header>
      <div class="loop03-hero-escritorio" aria-label="Escritório Virtual LOOP 3.0">
        <div class="loop03-hero-titulo">ESCRITÓRIO <span>VIRTUAL</span></div>
        <p class="loop03-hero-subtitulo">GERENCIE <b>·</b> ACOMPANHE <b>·</b> EVOLUA</p>
        <div class="loop03-cenario-escritorio" aria-hidden="true">
         <div class="loop03-cenario-luz loop03-cenario-luz-a"></div>
         <div class="loop03-cenario-luz loop03-cenario-luz-b"></div>
         <div class="loop03-cenario-monitor"><div class="loop03-cenario-tela"><span>LOOP <em>3.0</em></span><small>ACOMPANHE SUAS POSIÇÕES</small></div><div class="loop03-cenario-base"></div></div>
         <div class="loop03-cenario-plantas" aria-hidden="true">
          <span class="loop03-planta-folha f1"></span><span class="loop03-planta-folha f2"></span>
          <span class="loop03-planta-folha f3"></span><span class="loop03-planta-folha f4"></span>
          <span class="loop03-planta-folha f5"></span><span class="loop03-planta-vaso"></span>
         </div>
         <div class="loop03-cenario-livros" aria-hidden="true"><span></span><span></span><span></span></div>
         <div class="loop03-cenario-caneca" aria-hidden="true"><span>LOOP</span></div>
         <div class="loop03-cenario-caderno" aria-hidden="true"><span>∞</span></div>
         <div class="loop03-cenario-canetas" aria-hidden="true"><span></span><span></span><span></span></div>
         <div class="loop03-cenario-mesa"></div>
        </div>
        <button type="button" data-loop03-aba="posicoes" class="loop03-hero-botao">ACOMPANHAR MINHAS POSIÇÕES →</button>
       </div>
       <div class="loop03-mural-titulo">COMUNICADOS DA ADMINISTRAÇÃO</div>
       <div id="loop03Publicacoes" class="loop03-publicacoes" aria-live="polite"><p>Os banners selecionados pela administração aparecerão aqui.</p></div>
     </section>
     <section id="loop03-tabuleiro" class="loop03-pagina" aria-label="Tabuleiro">
      <header class="loop03-titulo-pagina"><div><small>LOOP · MOTOR DE FILAS</small><h2>Tabuleiro LOOP 3.0</h2></div><span class="loop03-luz">● Ciclo em andamento</span></header>
     </section>
     <section id="loop03-posicoes" class="loop03-pagina" aria-label="Minhas Posições">
      <header class="loop03-titulo-pagina loop03-titulo-central"><div><h2>Minhas Posições</h2><p>Acompanhe suas posições e o andamento de cada uma no LOOP.</p></div></header>
      <div class="loop03-saldo-indicados" aria-live="polite">
       <span>Indicações disponíveis para distribuir</span>
       <strong id="loop03SaldoDisponivel">0</strong>
      </div>
      <p id="loop03AvisoDistribuicao" class="loop03-aviso-distribuicao" role="status" aria-live="polite"></p>
      <div id="loop03OpcoesPosicoes" class="loop03-opcoes loop03-grade-posicoes"></div>
      <div id="loop03TermosFundo" class="loop03-termos-fundo" role="dialog" aria-modal="true" aria-labelledby="loop03TermosTitulo" hidden>
       <div class="loop03-termos-janela">
        <button type="button" id="loop03TermosFechar" class="loop03-termos-fechar" aria-label="Fechar termos">×</button>
        <h3 id="loop03TermosTitulo">Regras de participação — laboratório</h3>
        <div id="loop03TermosTexto" class="loop03-termos-texto"></div>
        <label class="loop03-termos-aceite"><input id="loop03TermosAceitar" type="checkbox"> Li e aceito os termos desta posição</label>
       </div>
      </div>
      <div id="loop03DetalhesPosicao" class="loop03-detalhes loop03-painel-links" aria-label="Dois links personalizados">
        <div class="loop03-link-compartilhar"><label for="loop03LinkEscritorio">Escritório Virtual</label><div class="loop03-campo-link"><input id="loop03LinkEscritorio" type="text" readonly spellcheck="false" aria-label="Link pessoal do Escritório Virtual"><button type="button" id="loop03CopiarEscritorio" class="loop03-botao-copiar" aria-label="Copiar link do Escritório Virtual" disabled>⧉</button></div></div>
        <div class="loop03-link-compartilhar"><label for="loop03LinkLoja">AKITEMM · Loja</label><div class="loop03-campo-link"><input id="loop03LinkLoja" type="text" readonly spellcheck="false" aria-label="Link pessoal da AKITEMM"><button type="button" id="loop03CopiarLoja" class="loop03-botao-copiar" aria-label="Copiar link da AKITEMM" disabled>⧉</button></div></div>
        <small id="loop03StatusCopiarLinks" role="status" aria-live="polite"></small>
       </div>
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
     <section id="loop03-perfil" class="loop03-pagina" aria-label="Meu perfil">
      <header class="loop03-titulo-pagina"><div><small>MINHA CONTA · CONFIGURAÇÕES</small><h2>Meu Perfil</h2><p>Seu espaço pessoal no LOOP 3.0.</p></div>
       <button id="loop03FecharPerfil" type="button" aria-label="Fechar configurações" hidden>×</button>
      </header>
      <div class="loop03-painel-perfil">
       <div class="loop03-resumo-perfil">
        <span class="loop03-foto-grande" aria-hidden="true"><img class="loop03-foto-privada" alt="" hidden><span class="loop03-foto-padrao">👤</span></span>
        <div><strong id="loop03NomePerfil">Meu perfil</strong><small>Personalize sua foto e seus dados de contato.</small></div>
       </div>
       <form id="loop03FormPerfil" autocomplete="on">
        <div class="loop03-campos-perfil">
         <label>Nome de exibição<input type="text" id="loop03PerfilNome" minlength="3" maxlength="60" autocomplete="name" required></label>
         <label>E-mail de contato<input type="email" id="loop03PerfilEmail" maxlength="254" autocomplete="email" required></label>
         <label>Telefone de contato<input type="tel" id="loop03PerfilTelefone" maxlength="32" autocomplete="tel" placeholder="(21) 99999-9999"></label>
        </div>
        <div class="loop03-perfil-validacoes">
         <details class="loop03-verificacao" id="loop03VerificacaoEMAIL">
          <summary>Verificar alteração de e-mail</summary>
          <div class="loop03-verificacao-campos">
           <p>Ao trocar seu e-mail, confirme um código de 6 dígitos recebido no novo endereço.</p>
           <button type="button" data-verificar-envio="EMAIL">Enviar código por e-mail</button>
           <label>Código de e-mail<input id="loop03CodigoEMAIL" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" pattern="[0-9]{6}"></label>
           <button type="button" data-verificar-confirmar="EMAIL">Confirmar e-mail</button>
          </div>
         </details>
         <details class="loop03-verificacao" id="loop03VerificacaoTELEFONE">
          <summary>Verificar alteração de telefone</summary>
          <div class="loop03-verificacao-campos">
           <p>Ao trocar o telefone, confirme um código recebido por SMS no novo número.</p>
           <button type="button" data-verificar-envio="TELEFONE">Enviar código por SMS</button>
           <label>Código SMS<input id="loop03CodigoTELEFONE" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" pattern="[0-9]{6}"></label>
           <button type="button" data-verificar-confirmar="TELEFONE">Confirmar telefone</button>
          </div>
         </details>
        </div>
        <p id="loop03StatusVerificacao" role="status" aria-live="polite"></p>
        <label class="loop03-rotulo-foto" for="loop03PerfilFoto">Minha foto</label>
        <input type="file" id="loop03PerfilFoto" accept="image/jpeg,image/png,image/webp">
        <small class="loop03-ajuda-perfil">Escolha uma foto JPG, PNG ou WebP de até 8 MB. O aplicativo adapta a imagem para o avatar.</small>
        <div class="loop03-acoes-salvar-perfil">
         <button type="button" id="loop03RemoverFoto" class="loop03-secundario-perfil">Remover foto</button>
         <button type="submit" id="loop03SalvarPerfil">Salvar alterações</button>
        </div>
        <p id="loop03StatusPerfil" role="status" aria-live="polite"></p>
       </form>
       <button id="loop03Sair" type="button" class="loop03-sair-perfil">Sair da conta</button>
       <details id="loop03TrocarSenha" class="loop03-trocar-senha">
        <summary>Trocar minha senha <span aria-hidden="true">🔒</span></summary>
        <form id="loop03FormSenha" autocomplete="on">
         <p>Informe a senha atual, escolha uma nova e confirme. Após salvar, será necessário entrar novamente.</p>
         <div class="loop03-campos-senha">
          <label for="loop03SenhaAtual">Senha atual
           <input id="loop03SenhaAtual" type="password" autocomplete="current-password" minlength="10" maxlength="128" required>
          </label>
          <label for="loop03SenhaNova">Nova senha
           <input id="loop03SenhaNova" type="password" autocomplete="new-password" minlength="10" maxlength="128" required>
          </label>
          <label for="loop03SenhaConfirma">Confirmar nova senha
           <input id="loop03SenhaConfirma" type="password" autocomplete="new-password" minlength="10" maxlength="128" required>
          </label>
         </div>
         <button type="submit" id="loop03SalvarSenha">Confirmar troca de senha</button>
         <p id="loop03StatusSenha" role="status" aria-live="polite"></p>
        </form>
       </details>
       <div class="loop03-cpf-travado" aria-label="Identificação legal protegida">
        <strong>CPF · protegido</strong>
        <span id="loop03SituacaoCPF">Será confirmado na primeira posição, em Minhas Posições.</span>
        <small>Nesta configuração o CPF não pode ser cadastrado, visualizado integralmente nem alterado.</small>
       </div>
       <p class="loop03-nota-perfil">E-mail e telefone novos só são salvos após confirmação do código enviado ao novo contato. Sem integração de envio, a alteração fica bloqueada. O nome e a foto são editáveis nesta conta de laboratório. Seu login e vínculos de indicações permanecem protegidos; CPF e aceite individual continuam em Minhas Posições.</p>
      </div>
     </section>
    </div>
   </div>`;
  shell.prepend(shell.querySelector('.loop03-banner-topo'));
  // Rodape somente identificacao; logout preservado no painel Meu Perfil.
  root.prepend(shell);
  // Reaproveita as telas e operacoes existentes, sem duplicar IDs ou formularios.
  const mover=(selector,pagina)=>{
   const node=root.querySelector(selector);
   if(node)e('loop03-'+pagina).append(node);
  };
  const extrato=e('tituloCreditosPrevistosV6')?.closest('section.cartao-participante');
  if(extrato)e('loop03-financeiro').append(extrato);
  if(e('tituloCreditosPrevistosV6'))e('tituloCreditosPrevistosV6').textContent='Meu extrato de ciclos — LOOP 3.0';
  const resumo=e('nomeLogadoParticipante')?.closest('section.cartao-participante');
  if(resumo){
   const links=resumo.querySelector('.area-indicacoes-participante');
   const bonus=resumo.querySelector('.area-bonus-participante');
   if(links){
    const util=document.createElement('details');
    util.className='loop03-rede-ferramentas';
    const sum=document.createElement('summary');
    sum.textContent='Meus links e ferramentas de indicação';
    util.append(sum,links);
    e('loop03-rede').append(util);
   }
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
   // Cabecalhos espelhados da arte original; apenas formato, sem pessoas ficticias.
   // IDs e conteudo dos contadores permanecem ligados aos dados reais.
   for(const [coluna,letra] of [[filaA,'A'],[filaB,'B']]){
    const h=coluna?.querySelector('h3');
    if(!h)continue;
    const contador=h.querySelector('small');
    const icone=document.createElement('span');
    icone.className='loop03-icone-cabecalho loop03-icone-fila-'+letra.toLowerCase();
    icone.setAttribute('aria-hidden','true');
    const tituloFila=document.createElement('span');
    tituloFila.className='loop03-texto-cabecalho';
    tituloFila.textContent='Fila '+letra;
    const seta=document.createElement('span');
    seta.className='loop03-seta-cabecalho';
    seta.textContent=letra==='A'?'»':'';
    seta.setAttribute('aria-hidden','true');
    h.classList.add('loop03-cabecalho-fila','loop03-cabecalho-fila-'+letra.toLowerCase());
    // A lista REAL fica visivel e rolavel neste mesmo painel.
    // Clicar no cabecalho so poe foco na lista: jamais abre outra tela.
    const lista=coluna.querySelector('.mapa-fila-posicoes-demo');
    lista?.setAttribute('tabindex','0');
    lista?.setAttribute('aria-label','Fila '+letra+': deslize para cima ou para baixo para percorrer');
    const abrirFila=document.createElement('button');
    abrirFila.type='button';
    abrirFila.className='loop03-abrir-fila';
    abrirFila.setAttribute('aria-label','Percorrer Fila '+letra+' aqui no Tabuleiro');
    abrirFila.setAttribute('aria-controls',letra==='A'?'mapaFilaAParticipante':'mapaFilaBParticipante');
    abrirFila.title='Toque na Fila '+letra+' e deslize para percorrer';
    abrirFila.append(icone,tituloFila,seta);
    h.replaceChildren(abrirFila);
    abrirFila.addEventListener('click',()=>lista?.focus({preventScroll:true}));
    if(contador){
     contador.classList.add('loop03-contagem-rodape-fila');
     coluna.append(contador);
    }
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
  if(limites){
   const informacoes=document.createElement('details');
   informacoes.className='loop03-informacoes-tecnicas';
   const rotulo=document.createElement('summary');
   rotulo.textContent='Informações e limites do ambiente de laboratório';
   informacoes.append(rotulo,limites);
   e('loop03-perfil').append(informacoes);
  }
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
  e('loop03CopiarEscritorio').addEventListener('click',()=>copiarLinkPosicao('Escritorio'));
  e('loop03CopiarLoja').addEventListener('click',()=>copiarLinkPosicao('Loja'));
  e('loop03TermosFechar').addEventListener('click',fecharTermosPosicao);
  e('loop03TermosFundo').addEventListener('click',ev=>{
   if(ev.target===e('loop03TermosFundo'))fecharTermosPosicao();
  });
  e('loop03TermosAceitar').addEventListener('change',ev=>{
   if(!ev.target.checked||termosPosicaoId===null)return;
   aceitesPosicao.set(termosPosicaoId,true);
   const p=visaoAtual?.posicoes.find(x=>x.posicaoId===termosPosicaoId);
   if(p)selecionar(p);
   const campo=document.querySelector('#loop03OpcoesPosicoes [data-termos-posicao="'+termosPosicaoId+'"]');
   if(campo)campo.checked=true;
   e('aceiteTermosParticipante').checked=true;
   fecharTermosPosicao();
  });
  document.addEventListener('keydown',ev=>{
   if(ev.key==='Escape'&&!e('loop03TermosFundo').hidden)fecharTermosPosicao();
  });
  e('loop03RemoverFoto').addEventListener('click',()=>{
   fotoPerfilAcao='REMOVER';e('loop03PerfilFoto').value='';
   e('loop03StatusPerfil').textContent='A foto será removida quando você salvar.';
  });
  e('loop03PerfilFoto').addEventListener('change',()=>{
   fotoPerfilAcao='MANTER';
   e('loop03StatusPerfil').textContent=e('loop03PerfilFoto').files.length?
    'Foto selecionada. Clique em Salvar alterações para atualizar seu avatar.':'';
  });
  for(const b of shell.querySelectorAll('[data-verificar-envio]'))
   b.addEventListener('click',()=>verificacaoContato(b.dataset.verificarEnvio,'solicitar'));
  for(const b of shell.querySelectorAll('[data-verificar-confirmar]'))
   b.addEventListener('click',()=>verificacaoContato(b.dataset.verificarConfirmar,'confirmar'));
  for(const tipo of ['EMAIL','TELEFONE']){
   const campo=e(tipo==='EMAIL'?'loop03PerfilEmail':'loop03PerfilTelefone');
   campo.addEventListener('input',()=>{
    const anterior=tipo==='EMAIL'?visaoAtual?.perfil?.email:visaoAtual?.perfil?.telefone;
    const atual=campo.value.trim();
    if(atual!==String(anterior||''))
     e('loop03Verificacao'+tipo).open=true;
   });
  }
  e('loop03FormPerfil').addEventListener('submit',salvarPerfil);
  e('loop03FormSenha').addEventListener('submit',trocarSenha);
  e('loop03PerfilTopo').addEventListener('click',abrirPerfilSobreposto);
  e('loop03FecharPerfil').addEventListener('click',()=>fecharPerfilSobreposto(true));
  e('loop03FundoPerfil').addEventListener('click',()=>fecharPerfilSobreposto(true));
  e('loop03FecharDetalhe').addEventListener('click',fecharDetalheIndicador);
  e('loop03DetalheIndicador').addEventListener('click',ev=>{
   if(ev.target===e('loop03DetalheIndicador'))fecharDetalheIndicador();
  });
  document.addEventListener('keydown',ev=>{
   if(ev.key!=='Escape')return;
   if(!e('loop03FundoPerfil').hidden)fecharPerfilSobreposto(true);
   else fecharDetalheIndicador();
  });
  e('loop03AbrirEscolhaPosicao').addEventListener('click',abrirSeletorPosicao);
  e('loop03FecharEscolha').addEventListener('click',fecharSeletorPosicao);
  e('loop03SeletorPosicao').addEventListener('click',ev=>{
   if(ev.target===e('loop03SeletorPosicao'))fecharSeletorPosicao();
  });
  document.addEventListener('keydown',ev=>{
   if(ev.key==='Escape'&&!e('loop03SeletorPosicao').hidden)fecharSeletorPosicao();
  });
  e('loop03NotificacoesBotao').addEventListener('click',()=>{
   const abrirPainel=e('loop03PainelNotificacoes').hidden;
   fecharNotificacoes();
   if(abrirPainel){
    e('loop03PainelNotificacoes').hidden=false;
    e('loop03NotificacoesBotao').setAttribute('aria-expanded','true');
    carregarNotificacoes();
   }
  });
  e('loop03FecharNotificacoes').addEventListener('click',()=>fecharNotificacoes());
  document.addEventListener('keydown',ev=>{
   if(ev.key==='Escape'&&!e('loop03PainelNotificacoes').hidden)
    fecharNotificacoes({retornarFoco:true});
  });
  document.addEventListener('click',ev=>{
   const area=e('loop03PainelNotificacoes');
   if(!area.hidden&&!area.contains(ev.target)&&
    !e('loop03NotificacoesBotao').contains(ev.target))fecharNotificacoes();
  });
  abrir('home');
  carregarPublicacoes();
  carregarVitrineAKITEMM();
 }
 function abrir(aba){
  if(!paginas.includes(aba))return;
  fecharTermosPosicao();
  fecharPerfilSobreposto();
  fecharDetalheIndicador();
  fecharSeletorPosicao();
  fecharNotificacoes();
  const anterior=abaAtual;
  abaAtual=aba;
  for(const item of paginas)e('loop03-'+item).hidden=item!==aba;
  for(const b of document.querySelectorAll('[data-loop03-aba]'))
   b.setAttribute('aria-current',b.dataset.loop03Aba===aba?'page':'false');
  e('loop03Sidebar').classList.remove('loop03-aberto');
  e('loop03Menu').setAttribute('aria-expanded','false');
  // Ao abrir o Tabuleiro, buscar o estado verdadeiro mais recente da sessao.
  // Consulta nao dispara movimentos e nao comanda a catraca.
  if(aba==='tabuleiro'&&anterior!==aba&&visaoAtual)
   Promise.resolve().then(()=>window.LoopParticipanteAtualizar?.());
 }
 async function verificacaoContato(tipo,acao){
  const nomeCampo=tipo==='EMAIL'?'loop03PerfilEmail':'loop03PerfilTelefone';
  const valor=e(nomeCampo).value;
  const rota=acao==='solicitar'?'solicitar':'confirmar';
  const estado=e('loop03StatusVerificacao');
  const botao=document.querySelector('#loop03-perfil [data-verificar-'+(acao==='solicitar'?'envio':'confirmar')+'="'+tipo+'"]');
  botao.disabled=true;
  estado.textContent=acao==='solicitar'?'Solicitando código para o novo contato…':'Conferindo código…';
  try{
   const body=acao==='solicitar'?{tipo,valor}:{tipo,codigo:e('loop03Codigo'+tipo).value.trim()};
   const resp=await fetch('/api/laboratorio/participante/perfil/codigo/'+rota,{
    method:'POST',cache:'no-store',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
    body:JSON.stringify(body)
   });
   const resposta=await resp.json();
   if(!resp.ok)throw Error(resposta.erro==='ENVIO_NAO_CONFIGURADO'?
    'O envio de código ainda não está conectado neste laboratório. Este contato não será alterado.':
    resposta.erro==='AGUARDE_NOVO_CODIGO'?'Aguarde um minuto para pedir outro código.':
    resposta.erro||'Não foi possível confirmar o contato.');
   estado.textContent=acao==='solicitar'?
    'Código enviado ao novo contato informado. Válido por 10 minutos.':
    'Código confirmado. Agora clique em Salvar alterações.';
  }catch(err){estado.textContent=err.message;}
  finally{botao.disabled=false;}
 }
 async function trocarSenha(ev){
  ev.preventDefault();
  const botao=e('loop03SalvarSenha'),form=e('loop03FormSenha'),status=e('loop03StatusSenha');
  if(botao.disabled)return;
  const senhaAtual=e('loop03SenhaAtual').value;
  const novaSenha=e('loop03SenhaNova').value;
  if(novaSenha!==e('loop03SenhaConfirma').value){
   status.textContent='A confirmação não corresponde à nova senha.';
   e('loop03SenhaConfirma').focus();return;
  }
  if(novaSenha===senhaAtual){
   status.textContent='Escolha uma senha diferente da atual.';return;
  }
  botao.disabled=true;status.textContent='Verificando e atualizando a senha…';
  try{
   const resp=await fetch('/api/laboratorio/participante/alterar-senha',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
    body:JSON.stringify({senhaAtual,novaSenha})
   });
   const dados=await resp.json();
   if(!resp.ok)throw Error(dados.erro==='CREDENCIAIS_INVALIDAS'?
    'Senha atual incorreta. Tente novamente.':
    dados.erro==='SENHA_REPETIDA'?'Escolha uma senha diferente da atual.':
    dados.erro||'Não foi possível alterar a senha.');
   form.reset();
   // O servidor revogou todas as sessoes desta conta.
   window.LoopParticipanteEncerrarAposSenha?.();
  }catch(err){
   status.textContent=err.message;
   for(const id of ['loop03SenhaAtual','loop03SenhaNova','loop03SenhaConfirma'])e(id).value='';
  }finally{botao.disabled=false;}
 }
 async function comprimirImagemPerfil(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)
   throw Error('Use JPG, PNG ou WebP com no máximo 8 MB.');
  const imagem=await createImageBitmap(file);
  try{
   const lado=Math.min(imagem.width,imagem.height);
   if(!lado)throw Error('Imagem inválida.');
   const canvas=document.createElement('canvas');
   canvas.width=320;canvas.height=320;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Não foi possível preparar a foto.');
   ctx.drawImage(imagem,(imagem.width-lado)/2,(imagem.height-lado)/2,lado,lado,
    0,0,320,320);
   const base64=canvas.toDataURL('image/jpeg',.75).split(',')[1];
   if(!base64||base64.length>245000)throw Error('A foto ficou grande demais. Escolha outra imagem.');
   return {mime:'image/jpeg',base64};
  }finally{imagem.close();}
 }
 async function salvarPerfil(ev){
  ev.preventDefault();
  const form=e('loop03FormPerfil'),botao=e('loop03SalvarPerfil'),status=e('loop03StatusPerfil');
  if(botao.disabled||!visaoAtual?.perfil)return;
  botao.disabled=true;status.textContent='Salvando seus dados…';
  try{
   const file=e('loop03PerfilFoto').files[0];
   const foto=file?await comprimirImagemPerfil(file):fotoPerfilAcao;
   const resp=await fetch('/api/laboratorio/participante/perfil',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
    body:JSON.stringify({
     nome:e('loop03PerfilNome').value,email:e('loop03PerfilEmail').value,
     telefone:e('loop03PerfilTelefone').value,foto,
     revisaoEsperada:visaoAtual.perfil.revisao
    })
   });
   const data=await resp.json();
   if(!resp.ok)throw Error(data.erro==='CONFLITO_REVISAO'?
    'Seus dados foram alterados em outra sessão. Atualize e tente novamente.':
    data.erro||'Não foi possível salvar seu perfil.');
   fotoPerfilAcao='MANTER';e('loop03PerfilFoto').value='';
   await window.LoopParticipanteAtualizar?.();
   // Depois de salvar, recolher validacoes antigas: codigo de contato ja consumido
   // e o teste anterior nao deve ficar aberto poluindo a area de configuracoes.
   for(const tipo of ['EMAIL','TELEFONE'])e('loop03Verificacao'+tipo).open=false;
   e('loop03StatusVerificacao').textContent='';
   status.textContent='Perfil atualizado e salvo com sucesso.';
  }catch(err){status.textContent='Não foi possível salvar: '+err.message;}
  finally{botao.disabled=false;}
 }
 function aplicarPerfil(visao){
  const p=visao.perfil||{},nome=p.nome||visao.conta.nome;
  e('loop03NomePerfil').textContent=nome;
  e('loop03BoasVindas').textContent='Bem-vindo!';
  const form=e('loop03FormPerfil');
  e('loop03SituacaoCPF').textContent=visao.adesao?.cpfConfirmadoNoTeste?
   'CPF de teste confirmado e fixado. Cadastro e alterações indisponíveis aqui.':
   'Aguardando sua primeira posição. Informe CPF fictício e aceite os termos em Minhas Posições.';
  if(form&&!e('loop03SalvarPerfil').disabled){
   e('loop03PerfilNome').value=nome;
   e('loop03PerfilEmail').value=p.email||'';
   e('loop03PerfilTelefone').value=p.telefone||'';
   for(const tipo of ['EMAIL','TELEFONE'])
    e('loop03Verificacao'+tipo).open=false;
  }
  const imagem=p.temFoto?'/api/laboratorio/participante/foto-perfil?rev='+p.revisao:null;
  for(const img of document.querySelectorAll('#loop03Shell .loop03-foto-privada')){
   const fallback=img.parentElement.querySelector('.loop03-foto-padrao');
   if(imagem){
    if(img.getAttribute('src')!==imagem)img.src=imagem;
    img.hidden=false;fallback.hidden=true;
   }else{
    img.hidden=true;img.removeAttribute('src');fallback.hidden=false;
   }
  }
 }
 function fecharDetalheIndicador(){
  const alvo=e('loop03DetalheIndicador');
  if(alvo)alvo.hidden=true;
 }
 function abrirDetalheIndicador(tipo){
  fecharSeletorPosicao();fecharDetalheIndicador();fecharNotificacoes();
  const giro=tipo==='GIROS';
  e('loop03DetalheTitulo').textContent=giro?'Giros do Tabuleiro':'Financeiro da conta';
  e('loop03DetalheValor').textContent=giro?e('loop03Giros24').textContent:e('loop03Saldo').textContent;
  e('loop03DetalheTexto').textContent=giro?
   'Giros registrados nas últimas 24 horas. O motor permanece independente desta consulta.':
   'Saldo individual conforme o estado consultado. No laboratório, valores simulados não representam dinheiro disponível para saque real.';
  e('loop03DetalheIndicador').hidden=false;
  e('loop03FecharDetalhe').focus();
 }
 function abrirPerfilSobreposto(){
  fecharDetalheIndicador();fecharSeletorPosicao();fecharNotificacoes();
  const secao=e('loop03-perfil');
  secao.hidden=false;
  secao.classList.add('loop03-perfil-sobreposto');
  secao.setAttribute('role','dialog');
  secao.setAttribute('aria-modal','true');
  e('loop03FundoPerfil').hidden=false;
  e('loop03FecharPerfil').hidden=false;
  e('loop03FecharPerfil').focus();
 }
 function fecharPerfilSobreposto(retornarFoco=false){
  const overlay=e('loop03FundoPerfil');
  if(!overlay)return;
  const estavaAberto=!overlay.hidden;
  overlay.hidden=true;
  const secao=e('loop03-perfil');
  secao.classList.remove('loop03-perfil-sobreposto');
  secao.removeAttribute('role');secao.removeAttribute('aria-modal');
  e('loop03FecharPerfil').hidden=true;
  if(abaAtual!=='perfil')secao.hidden=true;
  if(estavaAberto&&retornarFoco)e('loop03PerfilTopo').focus();
 }
 function fecharSeletorPosicao(){
  const painel=e('loop03SeletorPosicao');
  if(!painel)return;
  painel.hidden=true;
  e('loop03AbrirEscolhaPosicao').setAttribute('aria-expanded','false');
 }
 function abrirSeletorPosicao(ev){
  if(!visaoAtual)return;
  const area=e('loop03ListaEscolha');area.replaceChildren();
  const posicoes=visaoAtual.posicoes||[];
  if(posicoes.length===0){
   const vazia=document.createElement('p');
   vazia.className='loop03-escolha-vazia';
   vazia.textContent='Você ainda não possui posições. Elas serão criadas somente após uma compra elegível com pagamento confirmado.';
   area.append(vazia);
  }else{
   for(const [i,p] of posicoes.entries()){
    const botao=document.createElement('button');botao.type='button';
    botao.className='loop03-escolha-item';
    botao.dataset.posicaoId=String(p.posicaoId);
    botao.textContent='Posição '+(i+1)+' · #'+p.posicaoId+' · '+
     (p.statusAdesao==='PENDENTE'?'Aguardando confirmação':statusPosicao(p));
    botao.setAttribute('aria-pressed',String(p.posicaoId===selecionada));
    botao.addEventListener('click',()=>{
     selecionar(p); // Somente estado de visualizacao; nao cria e nao altera posicoes.
     fecharSeletorPosicao();
    });
    area.append(botao);
   }
  }
  e('loop03SeletorPosicao').hidden=false;
  e('loop03AbrirEscolhaPosicao').setAttribute('aria-expanded','true');
  const foco=area.querySelector('button')||e('loop03FecharEscolha');
  foco.focus();
 }
 function identidadeDaPosicao(p){
  const dados=e('loop03DadosPosicaoLateral');
  if(!p){
   dados.hidden=true;
   e('loop03NomeBaixo').textContent='';
   e('loop03SituacaoBaixo').textContent='';
   e('loop03CoroaTabuleiro').hidden=true;
   return;
  }
  dados.hidden=false;
  const nomeConta=(visaoAtual?.perfil?.nome||visaoAtual?.conta?.nome||'').trim();
  e('loop03NomeBaixo').textContent=nomeConta.replace(/^Participante\s+/i,'').trim()||nomeConta;
  const naCatraca=/^(?:VAGA_[1-6]|CENTRO)$/.test(p.local||'');
  const situacao=e('loop03SituacaoBaixo');
  // Somente o nome e, dentro da catraca, a coroa no rodape.
  // A fila continua disponivel nos dados contextuais, nunca nesta identidade.
  situacao.textContent='';
  situacao.hidden=true;
  e('loop03CoroaTabuleiro').hidden=!naCatraca;
 }
 function statusPosicao(p){
  const l=p.local||'';
  return /^FILA_[AB]$/.test(l)?'Fila '+l.slice(-1):l==='FILA'?'Fila '+(p.fila||'—'):l==='CENTRO'?'Centro do giro':
    l.startsWith('VAGA_')?'Dentro do giro · Vaga '+l.slice(5):l||'Em acompanhamento';
 }
 function atualizarVisorNumero(p){
  // Numerador = qual posicao individual da conta esta selecionada;
  // denominador vem do limite do servidor. Nunca interpretar como vaga da catraca.
  const limite=visaoAtual?.limitePosicoesAtivas;
  const valido=Number.isSafeInteger(limite)&&limite>0?limite:6;
  const indice=p?(visaoAtual?.posicoes||[]).findIndex(x=>x.posicaoId===p.posicaoId):-1;
  const numero=indice<0?0:indice+1;
  const fracao=numero+'/'+valido;
  e('loop03IndicePosicao').textContent=fracao;
  const local=p?.local||'';
  const letra=local==='FILA_A'?'A':local==='FILA_B'?'B':
   local==='FILA'&&['A','B'].includes(p?.fila)?p.fila:null;
  const selo=e('loop03LetraFila');
  selo.textContent=letra||'';
  selo.hidden=!letra;
  selo.classList.toggle('loop03-visor-letra-a',letra==='A');
  selo.classList.toggle('loop03-visor-letra-b',letra==='B');
  const dentroDaCatraca=!!p&&/^(?:VAGA_[1-6]|CENTRO)$/.test(local);
  e('loop03CoroaVisor').hidden=!dentroDaCatraca;
  e('loop03VisorNumero').setAttribute('aria-label',!p?
   'Nenhuma posição escolhida, '+fracao+'; visor de somente leitura':
   'Posição '+numero+' de '+valido+', número '+p.posicaoId+
   (letra?', Fila '+letra:dentroDaCatraca?', dentro da catraca':'')+
   '; visor de somente leitura');
 }
 function selecionar(p,abrirTabuleiro=false){
  selecionada=p.posicaoId;
  if(abrirTabuleiro)abrir('tabuleiro');
  e('loop03Numero').textContent='#'+p.posicaoId;
  e('loop03NumeroDetalhe').textContent=statusPosicao(p);
  atualizarVisorNumero(p);
  identidadeDaPosicao(p);
  const ordem=(visaoAtual?.posicoes||[]).findIndex(x=>x.posicaoId===p.posicaoId);
  if(ordem>=0)e('loop03TotalAtivacoes').textContent=visaoAtual.posicoes.length+'/'+visaoAtual.limitePosicoesAtivas;
  const precisa=p.statusAdesao==='PENDENTE';
  const caixa=e('secaoAtivacaoParticipante');
  if(caixa)caixa.hidden=!precisa;
  const primeiro=!visaoAtual?.adesao?.cpfConfirmadoNoTeste;
  if(primeiro&&cpfRascunho)e('cpfFicticioParticipante').value=cpfRascunho;
  e('aceiteTermosParticipante').checked=precisa&&aceitesPosicao.get(p.posicaoId)===true;
  for(const id of ['cpfFicticioParticipante','aceiteTermosParticipante']){
   const campo=e(id);if(!campo)continue;
   campo.required=precisa&&(id==='aceiteTermosParticipante'||primeiro);
   campo.disabled=!precisa||(id==='cpfFicticioParticipante'&&!primeiro);
   const rotulo=campo.id==='cpfFicticioParticipante'?document.querySelector('label[for="cpfFicticioParticipante"]'):campo.closest('label');
   if(rotulo)rotulo.hidden=!primeiro;
   if(campo.id==='cpfFicticioParticipante')campo.hidden=!primeiro;
  }
  const btn=e('confirmarAtivacaoParticipante');
  if(btn)btn.textContent=primeiro?'Confirmar CPF fictício e esta posição':'Confirmar somente esta posição';
  const tit=caixa?.querySelector('h2');if(tit)tit.textContent='Confirmar posição #'+p.posicaoId;
  // O painel inferior é da conta: os links não mudam ao selecionar uma posição.
  for(const no of document.querySelectorAll('[data-posicao-id]'))
   no.classList.toggle('loop03-destaque-posicao',no.dataset.posicaoId===String(selecionada));
  for(const no of document.querySelectorAll('[data-loop03-posicao]'))
   no.setAttribute('aria-pressed',no.dataset.loop03Posicao===String(selecionada)?'true':'false');
 }
 let termosPosicaoId=null;
 const aceitesPosicao=new Map();
 let cpfRascunho='';
 function atualizarLinksPosicao(link){
  // Não inserir nome de teste nem link com token: o campo do cliente
  // permanece vazio até que ele defina seu próprio nick no cadastro.
  const valido=!!(link?.linkEscritorioCurto&&link?.linkLojaCurto);
  for(const [destino,caminho] of [['Escritorio',link?.linkEscritorioCurto],['Loja',link?.linkLojaCurto]]){
   e('loop03Link'+destino).value=valido?location.origin+caminho:'';
   const botao=e('loop03Copiar'+destino);
   botao.disabled=!valido||!link.ativo;
   botao.title=!valido?'Link indisponível':!link.ativo?'Disponível após a primeira compra confirmada':'Copiar link';
  }
 }
 async function copiarLinkPosicao(destino){
  const campo=e('loop03Link'+destino),aviso=e('loop03StatusCopiarLinks');
  if(!campo.value||e('loop03Copiar'+destino).disabled)return;
  try{
   await navigator.clipboard.writeText(campo.value);
   aviso.textContent='Link '+(destino==='Loja'?'AKITEMM':'Escritório Virtual')+' copiado.';
  }catch{
   campo.focus();campo.select();aviso.textContent='Selecione e copie o link mostrado.';
  }
 }
 function fecharTermosPosicao(){
  const modal=e('loop03TermosFundo');
  if(modal)modal.hidden=true;
  termosPosicaoId=null;
 }
 function abrirTermosPosicao(p,indice){
  if(p)selecionar(p);
  termosPosicaoId=p?.posicaoId??null;
  const fonte=e('regrasDemonstracaoParticipante');
  const destino=e('loop03TermosTexto');destino.replaceChildren();
  for(const paragrafo of fonte?.querySelectorAll('p')||[]){
   const novo=document.createElement('p');novo.textContent=paragrafo.textContent;
   destino.append(novo);
  }
  if(!destino.children.length){
   const aviso=document.createElement('p');
   aviso.textContent='Termos do laboratorio indisponiveis. Nao confirme antes de ler.';
   destino.append(aviso);e('loop03TermosAceitar').disabled=true;
  }else e('loop03TermosAceitar').disabled=false;
  // Mesmo se a posicao ja for verde, a pessoa pode abrir, ler e fechar
  // o texto. A marcação de aceite desta janela encerra sua visualização.
  e('loop03TermosAceitar').checked=false;
  e('loop03TermosAceitar').disabled=!p||!destino.children.length;
  e('loop03TermosTitulo').textContent=p?'Termos da posição #'+p.posicaoId+' — laboratório':
   'Termos da posição '+indice+' — espaço disponível';
  e('loop03TermosFundo').hidden=false;
  e('loop03TermosAceitar').focus();
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
  aplicarPerfil(visao);
  const n=visao.posicoes.length;
  e('loop03TotalAtivacoes').textContent=n+'/'+visao.limitePosicoesAtivas;
  e('loop03Giros24').textContent=Number.isSafeInteger(visao.girosUltimas24Horas)&&visao.girosUltimas24Horas>=0?
   String(visao.girosUltimas24Horas):'—';
  // O snapshot nao informa lucro nem bonus creditado POR POSICAO selecionada.
  // Jamais usar bonusDisponivelSimuladoCentavos da CONTA como lucro da posicao.
  e('loop03Saldo').textContent='—';
  e('loop03BonusDez').textContent='Bônus 10% · —';
  const etapa=visao.progressoCiclo?.eventosValidos;
  for(const [i,m] of [...document.querySelectorAll('.marcos-v6 > span')].entries()){
   m.classList.toggle('loop03-aceso',Number.isSafeInteger(etapa)&&i<etapa);
   m.setAttribute('aria-label','Evento '+(i+1)+': '+
    (!Number.isSafeInteger(etapa)?'andamento ainda nao disponivel':i<etapa?'registrado':'aguardando'));
  }
  // Seis espacos: vazias roxas originais; confirmado verde, pendente vermelho.
  // Aceite do card espelha o formulario original; nao altera o motor sem envio.
  const cartoes=e('loop03OpcoesPosicoes');cartoes.replaceChildren();
  for(const [id] of aceitesPosicao){
   if(!visao.posicoes.some(p=>p.posicaoId===id&&p.statusAdesao==='PENDENTE'))
    aceitesPosicao.delete(id);
  }
  if(visao.adesao?.cpfConfirmadoNoTeste)cpfRascunho='';
  atualizarLinksPosicao(visao.linkIndicacao);
  for(let indice=0;indice<6;indice++){
   const p=visao.posicoes[indice];
   const estado=p?.statusAdesao==='PENDENTE'?'pendente':
    p?.local==='CENTRO'?'centro':p?.local==='FILA_A'?'a':
    p?.local==='FILA_B'?'b':p?'giro':'vazia';
   const pendente=estado==='pendente';
   // Todos os cartoes ocupados sao containers: nao colocar CPF ou checkbox
   // dentro de um <button>, pois controles aninhados perdem o clique no mobile.
   const cartao=document.createElement('div');
   cartao.className='loop03-opcao loop03-cartao-posicao loop03-posicao-'+estado+
    (!p?' loop03-posicao-vazia':pendente?' loop03-status-confirmacao-pendente':' loop03-status-confirmacao-ok');
   let cabecalho=cartao;
   if(p){
    cabecalho=document.createElement('button');cabecalho.type='button';
    cabecalho.className='loop03-cartao-abrir';cartao.append(cabecalho);
    cabecalho.dataset.loop03Posicao=String(p.posicaoId);
    cabecalho.setAttribute('aria-pressed',String(p.posicaoId===selecionada));
    cabecalho.addEventListener('click',()=>selecionar(p));
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
   // A esfera e o #ID bastam: sem a palavra "Fila A" abaixo deles.
   situacao.textContent=p?'':'SEM POSIÇÃO';
   situacao.hidden=!!p;
   identidade.append(numero,situacao);miolo.append(selo,identidade);
   cabecalho.append(rotulo,miolo);
   {
    // Sempre o mesmo alinhamento: primeira posição mostra CPF,
    // demais posições mostram link para o texto, todas com quadradinho à direita.
    const controles=document.createElement('div');controles.className='loop03-aceite-linha';
    if(p&&indice===0){
     const cpf=document.createElement('input');cpf.type='text';
     cpf.className='loop03-cpf-cartao';cpf.autocomplete='off';
     const precisaCpf=pendente&&!visao.adesao?.cpfConfirmadoNoTeste;
     if(precisaCpf){
      cpf.inputMode='numeric';cpf.maxLength=11;cpf.pattern='[0-9]{11}';
      cpf.placeholder='CPF';cpf.value=cpfRascunho;
      cpf.setAttribute('aria-label','CPF de teste da primeira posição');
      cpf.addEventListener('focus',()=>selecionar(p));
      cpf.addEventListener('input',()=>{
       cpfRascunho=cpf.value.replace(/\D/g,'').slice(0,11);
       cpf.value=cpfRascunho;e('cpfFicticioParticipante').value=cpfRascunho;
      });
     }else{
      cpf.readOnly=true;cpf.value='CPF ✓';
      cpf.title='CPF da conta protegido e fixado';cpf.setAttribute('aria-label',cpf.title);
      cpf.classList.add('loop03-cpf-protegido');
     }
     controles.append(cpf);
    }else{
     const abrirTexto=document.createElement('button');abrirTexto.type='button';
     abrirTexto.className='loop03-link-termos';abrirTexto.textContent='Ler termos';
     abrirTexto.setAttribute('aria-label','Ler termos da posição '+(indice+1));
     abrirTexto.addEventListener('click',()=>abrirTermosPosicao(p,indice+1));
     controles.append(abrirTexto);
    }
    const marcar=document.createElement('input');marcar.type='checkbox';
    marcar.className='loop03-check-cartao';
    if(p)marcar.dataset.termosPosicao=String(p.posicaoId);
    marcar.setAttribute('aria-label','Abrir termos da posição '+(indice+1));
    marcar.title=p?'Ler os termos desta posição':'Posição vazia: leia os termos, sem aceite possível';
    marcar.checked=!!p&&(!pendente||aceitesPosicao.get(p.posicaoId)===true);
    marcar.disabled=!p;
    marcar.addEventListener('click',ev=>{
     ev.preventDefault();
     abrirTermosPosicao(p,indice+1);
    });
    controles.append(marcar);
    cartao.append(controles);
   }
   const resumo=document.createElement('div');resumo.className='loop03-cartao-resumo';
   const conta=document.createElement('small');conta.className='loop03-indicacoes-curtas';
   conta.textContent=p?'Indicações: '+(p.indicacoesRecebidas||0):'Indicações';
   resumo.append(conta);
   cartao.append(resumo);
   if(estado==='pendente'){
    const ponto=document.createElement('span');ponto.className='loop03-pendencia-ponto';
    ponto.title='Confirmação individual pendente';
    ponto.setAttribute('aria-label','Posição aguardando confirmação');
    cartao.append(ponto);
   }
   const unidade=document.createElement('div');unidade.className='loop03-unidade-posicao';
   unidade.append(cartao);
   {
    const adicionar=document.createElement('button');
    adicionar.type='button';adicionar.className='loop03-adicionar-indicado';
    adicionar.textContent='+ Adicionar indicado';
    adicionar.setAttribute('aria-label',p?'Adicionar um indicado à posição #'+p.posicaoId:
     'Adicionar indicado indisponível: posição '+(indice+1)+' vazia');
    const ativa=!!p&&p.statusAdesao!=='PENDENTE'&&
     /^(FILA_[AB]|CENTRO|VAGA_[1-6])$/.test(p.local);
    adicionar.disabled=!ativa||!(visao.contadoresRede?.disponiveisParaVincular>0);
    adicionar.title=!p?'Disponível quando esta posição existir':!ativa?'Confirme esta posição primeiro':
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
   // Avatar tipografico: visual da equipe sem imagem ou identidade ficticia.
   const avatar=document.createElement('span');avatar.className='loop03-equipe-avatar';
   avatar.setAttribute('aria-hidden','true');
   avatar.textContent=String(pessoa.nome||'?').trim().split(/\s+/).slice(0,2)
    .map(parte=>parte[0]||'').join('').toLocaleUpperCase('pt-BR');
   const faixa=document.createElement('span');
   faixa.className='loop03-equipe-estado '+(situacao==='ATIVO'?'loop03-equipe-ativo':
    situacao==='PENDENTE'?'loop03-equipe-pendente':'loop03-equipe-conferencia');
   faixa.textContent=situacao;
   cartao.append(avatar,titulo,faixa,dados);
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
   e('loop03NumeroDetalhe').textContent='Nenhuma posição selecionada';
   atualizarVisorNumero(null);
   identidadeDaPosicao(null);
   // Os links da conta seguem disponíveis sem posição selecionada.
   const caixa=e('secaoAtivacaoParticipante');if(caixa)caixa.hidden=true;
  }
  if(!destinoInicialTratado){
   destinoInicialTratado=true;
   const hash=location.hash.slice(1);
   if(hash==='tituloMapaParticipante')abrir('tabuleiro');
   if(hash==='tituloHistoricoLojaParticipante'||hash==='secaoAtivacaoParticipante')abrir('posicoes');
  }
 }
 function fecharNotificacoes({retornarFoco=false}={}){
  const painel=e('loop03PainelNotificacoes');
  if(!painel)return;
  painel.hidden=true;
  e('loop03NotificacoesBotao').setAttribute('aria-expanded','false');
  if(retornarFoco)e('loop03NotificacoesBotao').focus();
 }
 async function carregarNotificacoes(){
  const alvo=e('loop03ItensNotificacoes');
  alvo.textContent='Consultando comunicados…';
  try{
   // Fonte real de comunicados do administrador, sem mensagens ou clientes fabricados.
   const resp=await fetch('/api/laboratorio/loop03/publicacoes',{credentials:'same-origin',cache:'no-store'});
   if(!resp.ok)throw Error('INDISPONIVEL');
   const dados=await resp.json();
   const publicacoes=Array.isArray(dados.publicacoes)?dados.publicacoes:[];
   // Evitar resultado atrasado de pesquisa aparecer depois do logout.
   if(!visaoAtual)return;
   alvo.replaceChildren();
   if(publicacoes.length===0){
    alvo.textContent='Nenhuma notificação por enquanto.';
    return;
   }
   for(const pub of publicacoes){
    const item=document.createElement('article');
    item.className='loop03-notificacao-item';
    const titulo=document.createElement('strong');titulo.textContent=pub.titulo||'Comunicado';
    const descricao=document.createElement('p');descricao.textContent=pub.descricao||'';
    item.append(titulo,descricao);alvo.append(item);
   }
  }catch{
   alvo.textContent='Não foi possível consultar as notificações agora.';
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

 let vitrineLista=[];
 let vitrineIndice=0;
 let intervaloVitrine=null;
 function pintarVitrineAKITEMM(){
  const foto=e('loop03VitrineFoto'),nome=e('loop03VitrineNome'),
   estado=e('loop03VitrineEstado'),link=e('loop03Sidebar')?.querySelector('.loop03-vitrine-lateral');
  if(!foto||!link)return;
  const produto=vitrineLista.length?vitrineLista[vitrineIndice%vitrineLista.length]:null;
  if(!produto){
   foto.hidden=true;foto.removeAttribute('src');foto.alt='';
   nome.hidden=true;nome.textContent='';
   // Nenhum produto ficticio, o banner fica vazio ate haver fotos reais.
   estado.hidden=true;estado.textContent='';
   link.setAttribute('aria-label','Conhecer a loja AKITEMM');return;
  }
  foto.src=produto.fotos[0];foto.alt=produto.nome;foto.hidden=false;
  nome.textContent=produto.nome;nome.hidden=false;estado.hidden=true;
  link.setAttribute('aria-label','Conhecer na AKITEMM: '+produto.nome);
 }
 async function carregarVitrineAKITEMM(){
  try{
   const resp=await fetch('/catalogo',{cache:'no-store',credentials:'same-origin'});
   if(!resp.ok)throw Error('CATALOGO_INDISPONIVEL');
   const dados=await resp.json();
   // Um catalogo demonstrativo jamais pode ser anunciado como produto real.
   vitrineLista=dados.modo==='CATALOGO_DEMONSTRATIVO_SEM_VENDAS'?[]:
    (Array.isArray(dados.produtos)?dados.produtos:[]).filter(p=>
     p&&p.estado==='PUBLICADO'&&p.compraDisponivel===true&&
     typeof p.nome==='string'&&p.nome.trim()&&
     Array.isArray(p.fotos)&&p.fotos.length&&
     /^\/imagens\/catalogo\/[a-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(p.fotos[0]));
  }catch{vitrineLista=[];}
  vitrineIndice=0;pintarVitrineAKITEMM();
  if(intervaloVitrine!==null){clearInterval(intervaloVitrine);intervaloVitrine=null;}
  if(vitrineLista.length>1)intervaloVitrine=setInterval(()=>{
   if(document.visibilityState==='visible'&&e('loop03Shell')){
    vitrineIndice=(vitrineIndice+1)%vitrineLista.length;pintarVitrineAKITEMM();
   }
  },6000);
 }
 function encerrar(){
  fecharPerfilSobreposto();
  fecharDetalheIndicador();
  fecharNotificacoes();
  if(intervaloVitrine!==null){clearInterval(intervaloVitrine);intervaloVitrine=null;}
  vitrineLista=[];vitrineIndice=0;pintarVitrineAKITEMM();
  fecharTermosPosicao();aceitesPosicao.clear();cpfRascunho='';
  document.body.classList.remove('loop03-logado');
  selecionada=null;visaoAtual=null;destinoInicialTratado=false;fotoPerfilAcao='MANTER';
  fecharSeletorPosicao();identidadeDaPosicao(null);
  for(const img of document.querySelectorAll('#loop03Shell .loop03-foto-privada')){
   img.hidden=true;img.removeAttribute('src');
   img.parentElement.querySelector('.loop03-foto-padrao').hidden=false;
  }
  if(e('loop03StatusPerfil'))e('loop03StatusPerfil').textContent='';
  if(e('loop03FormSenha'))e('loop03FormSenha').reset();
  if(e('loop03StatusSenha'))e('loop03StatusSenha').textContent='';
  if(e('loop03TrocarSenha'))e('loop03TrocarSenha').open=false;
  abrir('home');
 }
 window.Loop03Shell={montar,atualizar,encerrar,abrir,destacarPosicoes,
  posicaoSelecionada:()=>selecionada};
 montar();
})();