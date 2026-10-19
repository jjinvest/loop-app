'use strict';
(()=>{
 const e=id=>document.getElementById(id);
 const form=e('formEntrarParticipante');
 const msg=e('estadoParticipante');
 const conteudo=e('conteudoParticipante');
 const sair=e('botaoSairParticipante');
 let versao=0;
 let mapaAtual=null;
 let cpfConfirmadoAtual=false;
 let convitesValidadosFilaA=[];
 let destinoInicialTratado=false;
 function encerrarTela(){
  window.Loop03Shell?.encerrar();
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
  instanteUltimoEventoValido=null;
  intervaloRelogioMinutos=null;
  renderizarRelogioCiclo();
  destinoInicialTratado=false;
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
  item.dataset.posicaoId=String(p.posicaoId);
  item.textContent=rotulo==='Número'?String(p.posicaoId):
   rotulo+' #'+p.posicaoId+(p.minha?' · Minha':'');
  item.setAttribute('aria-label',rotulo+' '+p.posicaoId+
   ', '+descricao+(p.minha?', minha posição':''));
  return item;
 }
 // Mostrar fila COMPLETA nos próprios painéis, sem filtros externos.
 function indicesDaFila(posicoes){
  return posicoes.map((_,i)=>i);
 }
 function renderizarFila(posicoes,idFila,idContador,nomeFila){
  const lista=e(idFila);lista.replaceChildren();
  const minhas=posicoes.filter(p=>p.minha).length;
  e(idContador).textContent=posicoes.length+' posições · '+minhas+' minhas';
  const indices=indicesDaFila(posicoes);
  // Sem posições reais: quadro vazio, sem linhas ou identificadores fictícios.
  if(!indices.length)return;
  let anterior=-1;
  for(const i of indices){
   const ocultas=i-anterior-1;
   if(ocultas>0){
    const intervalo=document.createElement('li');
    intervalo.className='intervalo-fila-demo';
    intervalo.textContent=ocultas+' posição(ões) entre os trechos exibidos';
    lista.append(intervalo);
   }
   const p=posicoes[i],filaA=nomeFila==='Fila A';
   const linha=document.createElement('li');
   linha.className='linha-fila-demo loop03-linha-fila'+(p.minha?' linha-minha-demo':'');
   const simbolo=document.createElement('span');
   simbolo.className='ordem-fila-demo loop03-inicial-fila'+(filaA?' loop03-a':' loop03-b');
   if(p.cor==='DOURADO')simbolo.classList.add('loop03-dourada');
   if(p.cor==='AZUL'&&filaA){
    throw new Error('POSICAO_AZUL_NAO_PODE_ENTRAR_NA_FILA_A');
   }
   if(p.cor==='AZUL')simbolo.classList.add('loop03-azul');
   // Bola dourada SEM letra; letra A/B mora DENTRO da propria bola.
   simbolo.textContent=p.cor==='DOURADO'?'':filaA?'A':'B';
   simbolo.setAttribute('aria-label',(i+1)+'ª posição na '+nomeFila);
   const dados=document.createElement('div');
   dados.className='loop03-fila-identificacao';
   const referencia=elementoPosicao(p,'Posição');
   // O ID visivel pertence à posicao, sem nome ou numero de indicacoes na B.
   referencia.textContent='#'+p.posicaoId;
   referencia.setAttribute('aria-label','#'+p.posicaoId+' · '+nomeFila+
    (p.minha?' · minha posição':''));
   referencia.classList.add('loop03-numero-titular');
   // Ordem da A: [bola amarela com A branco] [#ID] [boneco amarelo] [N indicacao(oes)].
   // Na B: [bola branca com B preto] [#ID]. Nomes nunca entram na B.
   dados.append(referencia);
   if(filaA){
    const qt=convitesValidadosFilaA[i];
    const quantidade=document.createElement('span');
    quantidade.className='loop03-quantidade-convites loop03-quantidade-a-direita';
    // Só o número e o bonequinho ficam visíveis. O aria-label explica.
    quantidade.textContent=Number.isSafeInteger(qt)?String(qt):'—';
    quantidade.setAttribute('aria-label',Number.isSafeInteger(qt)?
     qt+' indicações desta posição':'Contagem não disponível');
    // SVG com stroke CSS: o bonequinho permanece amarelo em Android/iOS.
    const boneco=document.createElementNS('http://www.w3.org/2000/svg','svg');
    boneco.setAttribute('class','loop03-bonequinho-indicacoes');
    boneco.setAttribute('viewBox','0 0 24 24');
    boneco.setAttribute('fill','none');
    boneco.setAttribute('stroke','currentColor');
    boneco.setAttribute('stroke-width','2.2');
    boneco.setAttribute('stroke-linecap','round');
    boneco.setAttribute('stroke-linejoin','round');
    boneco.setAttribute('aria-hidden','true');
    for(const [tag,attrs] of [['circle',{cx:'12',cy:'8',r:'4'}],
      ['path',{d:'M4 21v-2a8 8 0 0 1 16 0v2'}]]){
     const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
     for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
     boneco.append(node);
    }
    dados.append(boneco,quantidade);
   }
   // O participante visualiza os proprios dados; outros: numero somente.
   linha.append(simbolo,dados);lista.append(linha);
   anterior=i;
  }
  if(posicoes.length-anterior-1>0){
   const intervalo=document.createElement('li');
   intervalo.className='intervalo-fila-demo';
   intervalo.textContent=(posicoes.length-anterior-1)+' posição(ões) após as exibidas';
   lista.append(intervalo);
  }
 }
 // Tempo entre eventos: avança visualmente apenas com data real do motor.
 // Não fabrica eventos, vendas, pagamentos ou giros.
 let instanteUltimoEventoValido=null;
 let intervaloRelogioMinutos=null;
 function atualizarRelogioCiclo(mapa){
  const relogio=e('loop03RelogioCiclo');
  if(!relogio)return;
  const carimbo=mapa?.ultimoEventoValidoEm??null;
  const ts=typeof carimbo==='string'&&/T/.test(carimbo)?Date.parse(carimbo):
   typeof carimbo==='number'&&Number.isFinite(carimbo)?carimbo:NaN;
  instanteUltimoEventoValido=Number.isFinite(ts)&&ts>0&&ts<=Date.now()?ts:null;
  intervaloRelogioMinutos=Number.isSafeInteger(mapa?.intervaloReferenciaMinutos)&&mapa.intervaloReferenciaMinutos>=1?
   mapa.intervaloReferenciaMinutos:null;
  renderizarRelogioCiclo();
 }
 function renderizarRelogioCiclo(){
  const relogio=e('loop03RelogioCiclo');
  if(!relogio)return;
  const meta=e('loop03IntervaloMeta');
  const pad=n=>String(n).padStart(2,'0');
  const formatar=segundos=>pad(Math.floor(segundos/3600))+':'+
   pad(Math.floor(segundos/60)%60)+':'+pad(segundos%60);
  const tempoReferencia=intervaloRelogioMinutos===null?null:intervaloRelogioMinutos*60;
  if(meta)meta.textContent='Referência administrativa: '+
    (tempoReferencia===null?'não configurada':formatar(tempoReferencia));
  if(instanteUltimoEventoValido===null){
   relogio.textContent='--:--:--';
   relogio.setAttribute('aria-label','Aguardando evento válido do motor'+(intervaloRelogioMinutos===null?'':'; referência de '+intervaloRelogioMinutos+' minutos configurada pelo administrador'));
   return;
  }
  const segundos=Math.max(0,Math.floor((Date.now()-instanteUltimoEventoValido)/1000));
  relogio.textContent=formatar(segundos);
  if(meta&&tempoReferencia!==null&&segundos>=tempoReferencia)
   meta.textContent+=' · intervalo alcançado (sem giro automático)';
  relogio.setAttribute('aria-label','Tempo desde último evento válido: '+relogio.textContent+(intervaloRelogioMinutos===null?'; intervalo administrativo não configurado':'; intervalo de referência do administrador: '+intervaloRelogioMinutos+' minutos; não movimenta a catraca'));
  relogio.title=intervaloRelogioMinutos===null?'Sem intervalo administrativo configurado':'Referência: '+intervaloRelogioMinutos+' min · A catraca avança somente mediante eventos e liberação.';
 }
 window.setInterval(renderizarRelogioCiclo,1000);

 function mostrarMapa(mapa,nomeTitular){
  mapaAtual=mapa;
  atualizarRelogioCiclo(mapa);
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
   // Os indices 1..6 designam VAGAS fixas; o #ID que gira e separado.
   if(classe.startsWith('vaga-'))bloco.dataset.vagaNumero=classe.slice(5);
   const titulo=document.createElement('strong');
   titulo.className='titulo-espaco-tabuleiro-demo';
   titulo.textContent=rotulo;
   bloco.append(titulo);
   if(valor&&classe.startsWith('vaga-')){
    // Numero FIXO da vaga deve ficar legivel mesmo com um ocupante.
    // O ID pessoal abaixo continua movendo-se com o motor.
    const indice=document.createElement('span');
    indice.className='loop03-indice-vaga-visivel';
    indice.textContent=classe.slice(5);
    indice.setAttribute('aria-hidden','true');
    bloco.append(indice);
   }
   if(valor?.cor==='DOURADO'){
    // A marca visual, SEM QUALQUER TEXTO pessoal, aciona o estilo dourado.
    // Nao exibir identificador pessoal da posicao assumida pelo LOOP.
    const dourada=document.createElement('span');
    dourada.className='selo-posicao-demo posicao-dourado loop03-dourada-sem-identidade';
    dourada.hidden=true;dourada.setAttribute('aria-hidden','true');
    bloco.append(dourada);
   }else if(valor){
    const identificacao=document.createElement('span');
    identificacao.className='loop03-ocupante-identidade';
    const numero=elementoPosicao(valor,'Número');
    numero.textContent='#'+valor.posicaoId;
    identificacao.append(numero);
    // O nome pessoal so aparece para o titular autenticado. Nomes de
    // terceiros NAO sao fornecidos pelo snapshot publico do motor.
    if(valor.minha&&typeof nomeTitular==='string'&&nomeTitular.trim()){
     const nome=document.createElement('span');
     nome.className='loop03-nome-na-bola';
     nome.textContent=nomeTitular.trim();
     identificacao.append(nome);
    }
    bloco.append(identificacao);
   }
   // Visual do cliente: somente identificador; nomes de terceiros sao privados.
   else{
    const vazio=document.createElement('span');
    vazio.textContent='Livre';
    vazio.className='vazio-tabuleiro-demo';
    bloco.append(vazio);
   }
   tabuleiro.append(bloco);
  }
  window.Loop03Shell?.destacarPosicoes();
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
  convitesValidadosFilaA=Array.isArray(visao.convitesValidosFilaA)?visao.convitesValidosFilaA:[];
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
  if(visao.mapaCores)mostrarMapa(visao.mapaCores,visao.perfil?.nome||visao.conta?.nome||'');
  const temAzul=visao.posicoes.some(p=>p.statusAdesao==='PENDENTE');
  const cpfTermosConfirmados=visao.adesao?.cpfConfirmadoNoTeste===true;
  cpfConfirmadoAtual=cpfTermosConfirmados;
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
  window.Loop03Shell?.atualizar(visao);
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
  const posicaoId=window.Loop03Shell?.posicaoSelecionada?.();
  if(!Number.isSafeInteger(posicaoId)||posicaoId<1){
   aviso.textContent='Selecione uma posição pendente em Minhas Posições.';return;
  }
  const valor=e('cpfFicticioParticipante').value.trim();
  if(!cpfConfirmadoAtual&&!/^\d{11}$/.test(valor)){
   aviso.textContent='Informe onze dígitos fictícios de teste.';return;
  }
  botao.disabled=true;
  try{
   const dados=cpfConfirmadoAtual?{posicaoId}:{
    posicaoId,cpfFicticio:valor,
    aceitaTermos:e('aceiteTermosParticipante').checked,
    versaoTermos:'LOOP-DEMO-V1'
   };
   const resultado=await chamada('ativar-posicoes',dados);
   e('cpfFicticioParticipante').value='';
   e('aceiteTermosParticipante').checked=false;
   await atualizar();
   aviso.textContent='Posição #'+posicaoId+' confirmada individualmente. '+resultado.ativadas+' posição ativada no teste.';
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
 window.LoopParticipanteAtualizar=atualizar;
 // Leitura periodica do snapshot VERDADEIRO do motor, apenas com o Tabuleiro
 // aberto e a sessao visivel. Nunca cria venda, posicao, fila nem giro.
 const tabuleiroVisivel=()=>document.visibilityState==='visible'&&
  !!e('conteudoParticipante')&&!e('conteudoParticipante').hidden&&
  !!e('loop03-tabuleiro')&&!e('loop03-tabuleiro').hidden&&
  (!e('loop03FundoPerfil')||e('loop03FundoPerfil').hidden);
 window.setInterval(()=>{if(tabuleiroVisivel())atualizar();},30000);
 document.addEventListener('visibilitychange',()=>{
  if(tabuleiroVisivel())atualizar();
 });
 window.LoopParticipanteEncerrarAposSenha=()=>{
  encerrarTela();
  msg.textContent='Senha alterada. Entre novamente com sua nova senha.';
 };
 atualizar();
})();
