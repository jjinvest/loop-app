'use strict';
(()=>{
 const e=id=>document.getElementById(id);
 const form=e('formEntrarParticipante');
 const msg=e('estadoParticipante');
 const conteudo=e('conteudoParticipante');
 const sair=e('botaoSairParticipante');
 let versao=0;
 let mapaAtual=null;
 let filtroMapa='resumo';
 let destinoInicialTratado=false;
 function encerrarTela(){
  ++versao;conteudo.hidden=true;form.hidden=false;sair.hidden=true;
  e('senhaParticipante').value='';
  e('cpfFicticioParticipante').value='';
  e('aceiteTermosParticipante').checked=false;
  e('secaoAtivacaoParticipante').hidden=true;
  e('estadoAtivacaoParticipante').textContent='';
  e('posicoesParticipante').replaceChildren();
  e('pedidosParticipante').replaceChildren();
  e('enderecoLinkParticipante').value='';
  e('enderecoLinkLojaParticipante').value='';
  e('copiarLinkParticipante').disabled=true;
  e('copiarLinkLojaParticipante').disabled=true;
  e('statusLinkIndicacaoParticipante').textContent='';
  e('avisoLinkParticipante').textContent='';
  e('estadoLivroProvisoesV6').textContent='';
  e('resumoRetornoCentroV6').textContent='Nenhuma solicitação simulada.';
  e('historicoRetornoCentroV6').replaceChildren();
  e('mensagemSaqueCentroV6').textContent='';
  e('valorSaqueCentroV6').value='';
  e('solicitarSaqueCentroV6').disabled=true;
  e('bonusSaldoParticipante').textContent='R$ 0,00';
  e('bonusQuantidadeParticipante').textContent='0';
  e('bonusPercentualParticipante').textContent='10%';
  e('bonusCampanhaStatusParticipante').textContent='';
  e('bonusMinimoParticipante').textContent='R$ 25,00';
  e('bonusSaqueStatusParticipante').textContent='';
  e('bonusHistoricoParticipante').replaceChildren();
   e('historicoSaqueTesteParticipante').replaceChildren();
   e('bonusDisponivelSaqueParticipante').textContent='R$ 0,00';
   e('bonusReservadoSaqueParticipante').textContent='R$ 0,00';
   e('valorSaqueTesteParticipante').value='';
   e('enviarSaqueTesteParticipante').disabled=true;
   e('avisoSaqueTesteParticipante').textContent='';
   e('secaoDesistenciaVaga6Participante').hidden=true;
   e('aceiteDesistenciaVaga6Participante').checked=false;
   e('statusDesistenciaVaga6Participante').textContent='';
  e('historicoPedidosLojaParticipante').replaceChildren();
  e('totalPedidosLojaParticipante').textContent='0';
  e('aguardandoPedidosLojaParticipante').textContent='0';
  e('azuisPedidosLojaParticipante').textContent='0';
  e('alertaAzulParticipante').hidden=true;
  e('mapaFilaAParticipante').replaceChildren();
  e('mapaFilaBParticipante').replaceChildren();
  e('mapaTabuleiroParticipante').replaceChildren();
  e('resumoMapaParticipante').textContent='';
  e('contadorFilaAParticipante').textContent='';
  e('contadorFilaBParticipante').textContent='';
  e('atalhoAtivarParticipante').hidden=true;
  mapaAtual=null;
  filtroMapa='resumo';
  destinoInicialTratado=false;
  atualizarControlesMapa();
 }
 async function chamada(url,body){
  const r=await fetch('/api/laboratorio/participante/'+url,{
   method:body===undefined?'GET':'POST',
   headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
   body:body===undefined?undefined:JSON.stringify(body),
   credentials:'same-origin',cache:'no-store'
  });
  const data=await r.json();
  if(!r.ok){
   const erro=new Error(r.status===401?'Acesso de teste inválido ou expirado.':
    r.status===429?'Excesso de tentativas. Tente mais tarde no laboratório.':
    'Operação indisponível ('+r.status+').');
   erro.status=r.status;throw erro;
  }
  return data;
 }
 function lista(id,itens,formatar){
  const alvo=e(id);alvo.replaceChildren();
  if(!itens.length){
   const li=document.createElement('li');
   li.textContent='Nenhum registro nesta conta fictícia.';
   alvo.append(li);return;
  }
  for(const i of itens){
   const li=document.createElement('li');
   li.textContent=formatar(i);alvo.append(li);
  }
 }
 function elementoPosicao(p,rotulo){
  const item=document.createElement('span');
  item.className='selo-posicao-demo posicao-'+p.cor.toLowerCase()+
   (p.minha?' minha-posicao-demo':'');
  const descricao=p.cor==='AZUL'?'aguardando ativação':
   p.cor==='VERMELHO'?'ativada':
   p.cor==='DOURADO'?'pertence ao LOOP':'ativada por outra pessoa';
  item.textContent=rotulo+' #'+p.posicaoId+(p.minha?' · Minha':'');
  item.setAttribute('aria-label',rotulo+' '+p.posicaoId+
   ', '+descricao+(p.minha?', minha posição':''));
  return item;
 }
 function atualizarControlesMapa(){
  const controles=[
   ['filtroResumoMapaParticipante','resumo'],
   ['filtroMinhasMapaParticipante','minhas'],
   ['filtroTodasMapaParticipante','todas']
  ];
  for(const [id,valor] of controles){
   e(id).setAttribute('aria-pressed',String(filtroMapa===valor));
  }
  e('ajudaFiltroMapaParticipante').textContent=filtroMapa==='resumo'?
   'Resumo: primeiras 12 posições de cada fila, mais todas as suas posições. Os números indicam a ordem original.':
   filtroMapa==='minhas'?
   'Somente suas posições, com a ordem verdadeira dentro de A e B. Outras posições continuam na fila.':
   'Exibindo todas as posições em ordem. As cores não mudam a prioridade.';
 }
 function indicesDaFila(posicoes){
  if(filtroMapa==='todas')return posicoes.map((_,i)=>i);
  return posicoes.flatMap((p,i)=>
   filtroMapa==='minhas'?(p.minha?[i]:[]):
   (i<12||p.minha?[i]:[]));
 }
 function renderizarFila(posicoes,idFila,idContador,nomeFila){
  const lista=e(idFila);lista.replaceChildren();
  const minhas=posicoes.filter(p=>p.minha).length;
  e(idContador).textContent=posicoes.length+' posições · '+minhas+' minhas';
  const indices=indicesDaFila(posicoes);
  if(!indices.length){
   const item=document.createElement('li');
   item.className='fila-vazia-demo';
   item.textContent=posicoes.length===0?'Nenhuma posição nesta fila.':
    'Você não tem posições nesta fila.';
   lista.append(item);
   return;
  }
  let anterior=-1;
  for(const i of indices){
   const ocultas=i-anterior-1;
   if(ocultas>0){
    const intervalo=document.createElement('li');
    intervalo.className='intervalo-fila-demo';
    intervalo.textContent=ocultas+' posição(ões) entre os trechos exibidos';
    lista.append(intervalo);
   }
   const p=posicoes[i],item=document.createElement('li');
   item.className='linha-fila-demo'+(p.minha?' linha-minha-demo':'');
   const ordem=document.createElement('span');
   ordem.className='ordem-fila-demo';
   ordem.textContent=(i+1)+'º';
   ordem.setAttribute('aria-label',(i+1)+'ª posição na '+nomeFila);
   item.append(ordem,elementoPosicao(p,'Posição'));
   lista.append(item);
   anterior=i;
  }
  if(posicoes.length-anterior-1>0){
   const intervalo=document.createElement('li');
   intervalo.className='intervalo-fila-demo';
   intervalo.textContent=(posicoes.length-anterior-1)+' posição(ões) após as exibidas';
   lista.append(intervalo);
  }
 }
 function mostrarMapa(mapa){
  mapaAtual=mapa;
  atualizarControlesMapa();
  renderizarFila(mapa.filaA,'mapaFilaAParticipante','contadorFilaAParticipante','Fila A');
  renderizarFila(mapa.filaB,'mapaFilaBParticipante','contadorFilaBParticipante','Fila B');
  const todas=[...mapa.filaA,...mapa.filaB];
  const minhas=todas.filter(p=>p.minha).length;
  e('resumoMapaParticipante').textContent='Fila A: '+mapa.filaA.length+
   ' posições · Fila B: '+mapa.filaB.length+
   ' posições · '+minhas+' posição(ões) sua(s) nas filas.';
  const tabuleiro=e('mapaTabuleiroParticipante');tabuleiro.replaceChildren();
  const posicoes=[{valor:mapa.tabuleiro.centro,rotulo:'Centro',classe:'centro'},
   ...mapa.tabuleiro.vagas.map((valor,i)=>({
    valor,rotulo:'Vaga '+(i+1),classe:'vaga-'+(i+1)
   }))];
  for(const {valor,rotulo,classe} of posicoes){
   const bloco=document.createElement('div');
   bloco.className='espaco-tabuleiro-demo tabuleiro-'+classe+
    (valor?.minha?' espaco-meu-tabuleiro-demo':'');
   const titulo=document.createElement('strong');
   titulo.className='titulo-espaco-tabuleiro-demo';
   titulo.textContent=rotulo;
   bloco.append(titulo);
   if(valor)bloco.append(elementoPosicao(valor,'Posição'));
   else{
    const vazio=document.createElement('span');
    vazio.textContent='Livre';
    vazio.className='vazio-tabuleiro-demo';
    bloco.append(vazio);
   }
   tabuleiro.append(bloco);
  }
 }
 function dinheiro(centavos){
  return (centavos/100).toLocaleString('pt-BR',{
   style:'currency',currency:'BRL'
  });
 }
 const rotulos={
  AGUARDANDO_CONFIRMACAO:'Aguardando confirmação do pagamento de teste',
  AGUARDANDO_ATIVACAO:'Posição azul: aguardando sua ativação',
  POSICAO_ATIVADA:'Posição ativada',
  POSICAO_DOURADA_LOOP:'Posição dourada: pertence ao LOOP',
  COMPRA_SEM_POSICAO:'Compra confirmada, sem posição no LOOP',
  ESTORNO_EM_CONFERENCIA:'Estorno de teste: em conferência',
  SINCRONIZACAO_PENDENTE:'Confirmação ou posição em conferência'
 };
 function mostrarHistorico(historico){
  const res=historico?.contagens||{};
  e('totalPedidosLojaParticipante').textContent=res.total||0;
  e('aguardandoPedidosLojaParticipante').textContent=res.aguardandoConfirmacao||0;
  e('azuisPedidosLojaParticipante').textContent=res.aguardandoAtivacao||0;
  const destino=e('historicoPedidosLojaParticipante');
  destino.replaceChildren();
  const pedidos=historico?.pedidos||[];
  if(!pedidos.length){
   const vazio=document.createElement('li');
   vazio.textContent='Nenhum pedido registrado na loja de testes.';
   destino.append(vazio);return;
  }
  for(const pedido of pedidos){
   const item=document.createElement('li');
   item.className='pedido-historico-participante';
   const titulo=document.createElement('strong');
   titulo.textContent='Pedido '+pedido.pedidoId+' · '+dinheiro(pedido.valorCentavos);
   const detalhes=document.createElement('small');
   detalhes.textContent=pedido.itens.length?
    pedido.itens.map(p=>p.quantidade+' × '+p.nome).join(' + '):
    'Compra individual registrada no laboratório';
   const estado=document.createElement('span');
   estado.className='estado-pedido-participante estado-pedido-'+pedido.estado.toLowerCase().replaceAll('_','-');
   estado.textContent=rotulos[pedido.estado]||'Situação não identificada';
   item.append(titulo,detalhes,estado);
   if(pedido.posicaoId!==null){
    const numero=document.createElement('small');
    const numeros=pedido.posicaoIds?.length?pedido.posicaoIds:[pedido.posicaoId];
    numero.textContent=numeros.length===1?'Posição LOOP nº '+numeros[0]:
     'Pacote LOOP: '+numeros.length+' posições individuais nº '+numeros.join(', ');
    item.append(numero);
   }
   if(pedido.estado==='AGUARDANDO_ATIVACAO'){
    const link=document.createElement('a');
    link.href='#secaoAtivacaoParticipante';
    link.textContent='Ativar minha posição';
    link.className='acao-ativar-pedido-participante';
    item.append(link);
   }
   destino.append(item);
  }
 }
  function mostrar(visao){
  e('nomeLogadoParticipante').textContent=visao.conta.nome+' — meu resumo';
  const previstos=visao.creditosPrevistosV6;
  e('creditoPrevistoCentroV6').textContent=dinheiro(previstos?.creditoPrevistoCentavos||0);
  e('creditoDisponivelCentroV6').textContent=dinheiro(previstos?.disponivelParaSaqueCentavos||0);
  e('creditoCiclosCentroV6').textContent=String(previstos?.quantidadeCiclos||0);
  const livro=visao.provisoesAuditadasV6;
  const batendo=livro?.totalPrevistoCentavos===(previstos?.creditoPrevistoCentavos||0);
  e('estadoLivroProvisoesV6').textContent=
    !livro?'Conferência do livro ainda não configurada. Nenhum saldo real.' :
    'Livro de provisões imutável: '+dinheiro(livro.totalPrevistoCentavos)+
    ' previsto ('+livro.parcelas.length+' parcelas). '+
    (batendo?'Projeção e livro conferem.':'ATENÇÃO: divergência de registros!')+
    ' Liquidado: R$ 0,00. Sacável: R$ 0,00.';
  e('avisoCreditosCentroV6').textContent=previstos?.quantidadeCiclos?
   'Parcelas 1, 3 e 5 previstas na conclusão do ciclo, SEM liquidação ou direito de saque neste laboratório.':
   'Nenhum ciclo de seis vendas da sua posição foi concluído no laboratório; nenhum crédito previsto.';
  lista('historicoCreditoCentroV6',previstos?.historico||[],c=>
   'Giro '+c.cicloNumero+' · Posição #'+c.posicaoCentroId+
   ' · Três parcelas previstas de '+dinheiro(c.parcelas[0].valorPrevistoCentavos)+
   ' · Total '+dinheiro(c.valorPrevistoCentavos)+
   ' · NÃO SACÁVEL / aguardando conciliação.');
  const retorno=visao.simulacaoRetornoSaqueCentroV6;
  e('resumoRetornoCentroV6').textContent=retorno?
   'Saldo de referência FICTÍCIA liberada para novo pedido de teste: '+
   dinheiro(retorno.referenciaParaNovoPedidoFicticioCentavos)+
   ' | Reservado em simulações: '+
   dinheiro(retorno.reservadoEmPedidosDeTesteCentavos)+
   ' | Devolução confirmada fictícia: '+
   dinheiro(retorno.totalHistoricoRetornadoCentavos)+
   ' | Saldo real disponível: R$ 0,00.' :
   'Ensaio de retorno bancário não configurado.';
  e('solicitarSaqueCentroV6').disabled=!retorno||
   retorno.referenciaParaNovoPedidoFicticioCentavos<=0;
  lista('historicoRetornoCentroV6',retorno?.historico||[],r=>
   'Pedido '+r.solicitacaoId+' · '+dinheiro(r.valorSimuladoCentavos)+
   ' · '+r.status+
   (r.motivoDeFalha?' · '+r.motivoDeFalha:'')+
   (r.podeSolicitarNovamente?' · referência liberada para novo pedido fictício':'')+
   ' · Não houve movimentação financeira real.');

  const link=visao.linkIndicacao;
  e('enderecoLinkParticipante').value=location.origin+(link.linkEscritorio||link.link);
  e('enderecoLinkLojaParticipante').value=location.origin+link.linkLoja;
  e('apelidoLinkParticipante').value=link.apelido==='meu-loop'?'':link.apelido;
  e('copiarLinkParticipante').disabled=!link.ativo;
  e('copiarLinkLojaParticipante').disabled=!link.ativo;
  e('statusLinkIndicacaoParticipante').textContent=link.ativo?
   'Link ATIVO para divulgação. Bonificações somente após CPF e aceite expresso dos termos.':
   'Link INATIVO: faça uma compra confirmada de qualquer valor na loja. Não precisa ter posição no LOOP.';
  const bonus=visao.bonusIndicacoes;
  e('bonusSaldoParticipante').textContent=dinheiro(bonus.totalSimuladoCentavos);
  e('bonusQuantidadeParticipante').textContent=String(bonus.quantidade);
  e('bonusPercentualParticipante').textContent=bonus.porcentagemAplicavelHoje+'%';
  e('bonusCampanhaStatusParticipante').textContent=
   !bonus.bonificacoesHabilitadas?
    'Bonificações bloqueadas: confirme CPF e regras depois da primeira compra. Nenhum crédito é gerado antes do aceite.':
   bonus.porcentagemCampanhaHoje>10?
    (bonus.ativoNoLoopAgora?
     'Você tem posição própria no LOOP e pode participar da campanha de '+
      bonus.porcentagemCampanhaHoje+'% nas próximas posições geradas pelos seus indicados.':
     'Campanha atual: '+bonus.porcentagemCampanhaHoje+
      '%. Como você ainda não tem posição própria no LOOP, permanece recebendo 10%. Para participar da campanha, faça uma compra qualificada pelo mínimo vigente de '+
      dinheiro(bonus.valorMinimoPosicaoHojeCentavos)+'.'):
    'Comissão básica vigente: 10%. Seu link é liberado pela primeira compra de qualquer valor; o bônus superior a 10% exige uma posição própria no LOOP.';
  e('bonusMinimoParticipante').textContent=dinheiro(bonus.minimoSaqueCentavos);
  e('bonusSaqueStatusParticipante').textContent=!bonus.bonificacoesHabilitadas?
   'Saques bloqueados até a segunda ativação: CPF e aceite dos termos. Não há saques reais neste teste.':bonus.atingiuMinimoSaque?
   'Mínimo de R$ 25 alcançado. Taxa de 3% por saque simulado. Saque real ainda indisponível no laboratório.':
   'Faltam '+dinheiro(bonus.faltaParaMinimoCentavos)+' para alcançar o mínimo de saque.';
  lista('bonusHistoricoParticipante',bonus.registros,p=>
   'Posição #'+p.posicaoId+' · '+p.percentual+'% de '+
   dinheiro(p.valorBaseCentavos)+' = '+dinheiro(p.valorCentavos)+' · Caixa reserva');
  const extrato=visao.saquesSimulados;
   if(extrato){
    e('bonusDisponivelSaqueParticipante').textContent=dinheiro(extrato.bonusDisponivelSimuladoCentavos);
    e('bonusReservadoSaqueParticipante').textContent=dinheiro(extrato.bonusSolicitadoSimuladoCentavos);
    e('enviarSaqueTesteParticipante').disabled=!extrato.podeSolicitarBonus;
    lista('historicoSaqueTesteParticipante',extrato.historico,r=>
     'Solicitação '+r.solicitacaoId+' · Bruto '+dinheiro(r.valorSolicitadoCentavos)+
     ' · Taxa 3% '+dinheiro(r.taxaSaqueCentavos)+
     ' · Líquido fictício '+dinheiro(r.valorLiquidoCentavos)+
     ' · Revisão até '+new Date(r.prazoMaximoAnaliseEm).toLocaleString('pt-BR',{
       timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',
       hour:'2-digit',minute:'2-digit'})+
     ' (24 horas corridas, incluindo sábados e domingos)'+
     (r.prazoUltrapassadoNoTeste?' · PRAZO DE ANÁLISE ULTRAPASSADO':'')+
     ' · NÃO transferido');
   }
   const vagaDesistente=visao.posicoes.find(p=>p.local==='VAGA_6'&&p.statusAdesao!=='PENDENTE');
   e('secaoDesistenciaVaga6Participante').hidden=!vagaDesistente;
   e('posicaoDesistenciaVaga6Participante').value=vagaDesistente?String(vagaDesistente.posicaoId):'';
   e('ativasParticipante').textContent=visao.posicoes.length+' / '+visao.limitePosicoesAtivas;
  e('vagasParticipante').textContent=visao.vagasLivres;
  e('indicacoesParticipante').textContent=visao.indicacoes.comprasConfirmadasFicticias;
  e('pendentesParticipante').textContent=visao.indicacoes.cadastrosPendentes;
  lista('posicoesParticipante',visao.posicoes,p=>'Posição '+p.posicaoId+' — '+
   p.local.replace('_',' ')+' — '+(p.statusAdesao==='PENDENTE'?'aguardando ativação':'ativada'));
  if(visao.mapaCores)mostrarMapa(visao.mapaCores);
  const temAzul=visao.posicoes.some(p=>p.statusAdesao==='PENDENTE');
  const cpfTermosConfirmados=visao.adesao?.cpfConfirmadoNoTeste===true;
  const mostrarAtivacao=link.ativo&&(!cpfTermosConfirmados||temAzul);
  e('secaoAtivacaoParticipante').hidden=!mostrarAtivacao;
  e('atalhoAtivarParticipante').hidden=!mostrarAtivacao;
  const aviso=e('alertaAzulParticipante');
  aviso.hidden=!temAzul;
  if(temAzul){
   const quantidade=visao.posicoes.filter(p=>p.statusAdesao==='PENDENTE').length;
   aviso.textContent='Você tem '+quantidade+
    ' posição(ões) azul(is) nas filas A/B. Confirme CPF fictício e termos antes da entrada na vaga 6: sem aceite nesse momento, a posição vira dourada e passa ao LOOP.';
  }
  mostrarHistorico(visao.historicoLoja);
  lista('pedidosParticipante',visao.compras,p=>'Pedido fictício '+p.pedidoId+
   ' — '+p.produtoId+' — '+(p.valorCentavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+
   ' (verificador interno de teste)');
  form.hidden=true;sair.hidden=false;conteudo.hidden=false;
  msg.textContent='Visão individual carregada. Nenhuma operação real executada.';
  // A loja pode retornar com #pedidos ou #filas ANTES do conteudo
  // assíncrono ficar visivel. Rolar apenas uma vez após carregar a sessão.
  if(!destinoInicialTratado){
   destinoInicialTratado=true;
   const destinos=['tituloHistoricoLojaParticipante','tituloMapaParticipante',
    'secaoAtivacaoParticipante'];
   const alvo=location.hash.slice(1);
   if(destinos.includes(alvo)){
    const elemento=e(alvo);
    if(elemento && !elemento.hidden){
     requestAnimationFrame(()=>elemento.scrollIntoView({block:'start'}));
    }
   }
  }
 }
 async function atualizar(){
  const atual=++versao;
  try{
   const visao=await chamada('minha-conta');
   if(atual===versao){
    if(new URLSearchParams(location.search).get('destino')==='loja'){
     location.replace('/loja');
     return;
    }
    mostrar(visao);
   }
  }catch(erro){
   if(atual!==versao)return;
   if(erro.status===401)encerrarTela();
   msg.textContent=erro.message;
  }
 }
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();
  if(e('botaoEntrarParticipante').disabled)return;
  const botao=e('botaoEntrarParticipante');botao.disabled=true;
  const senha=e('senhaParticipante').value;
  e('senhaParticipante').value='';
  try{
   await chamada('entrar',{nome:e('nomeParticipante').value,senha});
   await atualizar();
  }catch(erro){encerrarTela();msg.textContent=erro.message;}
  finally{botao.disabled=false;}
 });
 e('formSaqueCentroV6').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const botao=e('solicitarSaqueCentroV6');
  if(botao.disabled)return;
  const valor=e('valorSaqueCentroV6').value;
  if(!/^\d+(?:\.\d{1,2})?$/.test(valor)){
    e('mensagemSaqueCentroV6').textContent='Digite um valor válido com até dois centavos.';
    return;
  }
  const centavos=Math.round(Number(valor)*100);
  if(!Number.isSafeInteger(centavos)||centavos<1){
    e('mensagemSaqueCentroV6').textContent='Valor inválido.';
    return;
  }
  botao.disabled=true;
  try{
   const registro=await chamada('saque-centro-v6-demo',{
    solicitacaoId:'saque-centro-'+crypto.randomUUID(),
    valorCentavos:centavos
   });
   e('valorSaqueCentroV6').value='';
   await atualizar();
   e('mensagemSaqueCentroV6').textContent='Pedido '+registro.solicitacaoId+
    ' apenas FICTÍCIO. Não existe transferência para banco neste laboratório.';
  }catch(err){e('mensagemSaqueCentroV6').textContent=err.message;}
  finally{botao.disabled=false;}
 });
 e('formSaqueTesteParticipante').addEventListener('submit',async ev=>{
   ev.preventDefault();
   const botao=e('enviarSaqueTesteParticipante');
   if(botao.disabled)return;
   const valor=e('valorSaqueTesteParticipante').value;
   if(!/^\d+(?:\.\d{1,2})?$/.test(valor)){
    e('avisoSaqueTesteParticipante').textContent='Informe reais e até dois centavos.';return;
   }
   const centavos=Math.round(Number(valor)*100);
   if(!Number.isSafeInteger(centavos)||centavos<2500){
    e('avisoSaqueTesteParticipante').textContent='Mínimo de R$ 25,00 por solicitação.';return;
   }
   botao.disabled=true;
   try{
    const resultado=await chamada('saques-simulados',{
     solicitacaoId:'saque-'+crypto.randomUUID(),tipo:'BONUS',valorSolicitadoCentavos:centavos
    });
    e('valorSaqueTesteParticipante').value='';
    await atualizar();
    e('avisoSaqueTesteParticipante').textContent='Solicitação apenas fictícia: taxa '+
     dinheiro(resultado.taxaSaqueCentavos)+' e líquido '+
     dinheiro(resultado.valorLiquidoCentavos)+'. Nenhum dinheiro transferido.';
   }catch(erro){e('avisoSaqueTesteParticipante').textContent=erro.message;}
   finally{botao.disabled=false;}
  });
  e('formDesistenciaVaga6Participante').addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(!e('aceiteDesistenciaVaga6Participante').checked)return;
   const botao=e('registrarDesistenciaVaga6Participante');
   if(botao.disabled)return;
   botao.disabled=true;
   try{
    const posicaoId=Number(e('posicaoDesistenciaVaga6Participante').value);
    await chamada('desistir-vaga-6',{posicaoId,aceiteExpresso:true});
    await atualizar();
    e('statusDesistenciaVaga6Participante').textContent='Desistência fictícia registrada. A posição agora pertence operacionalmente ao LOOP e é dourada.';
   }catch(erro){e('statusDesistenciaVaga6Participante').textContent=erro.message;}
   finally{botao.disabled=false;}
  });
  e('formAtivacaoParticipante').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const botao=e('confirmarAtivacaoParticipante');
  if(botao.disabled)return;
  const aviso=e('estadoAtivacaoParticipante');
  const valor=e('cpfFicticioParticipante').value.trim();
  if(!/^\d{11}$/.test(valor)){
   aviso.textContent='Informe onze dígitos fictícios de teste.';return;
  }
  botao.disabled=true;
  try{
   const resultado=await chamada('ativar-posicoes',{
    cpfFicticio:valor,
    aceitaTermos:e('aceiteTermosParticipante').checked,
    versaoTermos:'LOOP-DEMO-V1'
   });
   e('cpfFicticioParticipante').value='';
   e('aceiteTermosParticipante').checked=false;
   await atualizar();
   aviso.textContent='CPF e regras confirmados no teste. '+resultado.ativadas+' posição(ões) ativada(s).';
  }catch(erro){
   aviso.textContent=erro.message;
   e('cpfFicticioParticipante').value='';
  }finally{botao.disabled=false;}
 });
  sair.addEventListener('click',async()=>{
  encerrarTela();
  try{await chamada('sair',{});msg.textContent='Sessão fictícia encerrada.';}
  catch(erro){msg.textContent=erro.message;}
 });
 for(const [id,modo] of [
  ['filtroResumoMapaParticipante','resumo'],
  ['filtroMinhasMapaParticipante','minhas'],
  ['filtroTodasMapaParticipante','todas']
 ]){
  e(id).addEventListener('click',()=>{
   filtroMapa=modo;
   if(mapaAtual)mostrarMapa(mapaAtual);
   else atualizarControlesMapa();
  });
 }
 atualizarControlesMapa();
 e('copiarLinkParticipante').addEventListener('click',async()=>{
  if(e('copiarLinkParticipante').disabled)return;
  try{
   await navigator.clipboard.writeText(e('enderecoLinkParticipante').value);
   e('avisoLinkParticipante').textContent='Link do Escritório LOOP copiado para divulgação.';
  }catch{
   e('enderecoLinkParticipante').focus();e('enderecoLinkParticipante').select();
   e('avisoLinkParticipante').textContent='Selecione e copie o endereço acima.';
  }
 });
 e('copiarLinkLojaParticipante').addEventListener('click',async()=>{
  if(e('copiarLinkLojaParticipante').disabled)return;
  try{
   await navigator.clipboard.writeText(e('enderecoLinkLojaParticipante').value);
   e('avisoLinkParticipante').textContent='Link da AKITEMM copiado para divulgação.';
  }catch{
   e('enderecoLinkLojaParticipante').focus();e('enderecoLinkLojaParticipante').select();
   e('avisoLinkParticipante').textContent='Selecione e copie o endereço da Loja acima.';
  }
 });
 e('formApelidoLinkParticipante').addEventListener('submit',async ev=>{
  ev.preventDefault();const botao=e('salvarApelidoLinkParticipante');
  botao.disabled=true;
  try{
   await chamada('meu-link',{apelido:e('apelidoLinkParticipante').value});
   await atualizar();
   e('avisoLinkParticipante').textContent='Nome do link atualizado; rastreamento preservado.';
  }catch(err){e('avisoLinkParticipante').textContent=err.message;}
  finally{botao.disabled=false;}
 });
 e('atualizarParticipante').addEventListener('click',atualizar);
 atualizar();
})();
