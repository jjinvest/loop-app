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
 function encerrarTela(){
  ++versao;conteudo.hidden=true;form.hidden=false;sair.hidden=true;
  e('senhaParticipante').value='';
  e('cpfFicticioParticipante').value='';
  e('aceiteTermosParticipante').checked=false;
  e('secaoAtivacaoParticipante').hidden=true;
  e('estadoAtivacaoParticipante').textContent='';
  e('posicoesParticipante').replaceChildren();
  e('pedidosParticipante').replaceChildren();
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
    numero.textContent='Posição LOOP nº '+pedido.posicaoId;
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
  e('conviteParticipante').textContent='Meu código de convite fictício: '+visao.conta.codigoConvite;
  e('ativasParticipante').textContent=visao.posicoes.length+' / '+visao.limitePosicoesAtivas;
  e('vagasParticipante').textContent=visao.vagasLivres;
  e('indicacoesParticipante').textContent=visao.indicacoes.comprasConfirmadasFicticias;
  e('pendentesParticipante').textContent=visao.indicacoes.cadastrosPendentes;
  lista('posicoesParticipante',visao.posicoes,p=>'Posição '+p.posicaoId+' — '+
   p.local.replace('_',' ')+' — '+(p.statusAdesao==='PENDENTE'?'aguardando ativação':'ativada'));
  if(visao.mapaCores)mostrarMapa(visao.mapaCores);
  const temAzul=visao.posicoes.some(p=>p.statusAdesao==='PENDENTE');
  e('secaoAtivacaoParticipante').hidden=!temAzul;
  e('atalhoAtivarParticipante').hidden=!temAzul;
  const aviso=e('alertaAzulParticipante');
  aviso.hidden=!temAzul;
  if(temAzul){
   const quantidade=visao.posicoes.filter(p=>p.statusAdesao==='PENDENTE').length;
   aviso.textContent='Você tem '+quantidade+
    ' posição(ões) azul(is) na fila. Informe o CPF fictício e aceite os termos na seção de ativação antes da entrada no tabuleiro.';
  }
  mostrarHistorico(visao.historicoLoja);
  lista('pedidosParticipante',visao.compras,p=>'Pedido fictício '+p.pedidoId+
   ' — '+p.produtoId+' — '+(p.valorCentavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+
   ' (verificador interno de teste)');
  form.hidden=true;sair.hidden=false;conteudo.hidden=false;
  msg.textContent='Visão individual carregada. Nenhuma operação real executada.';
 }
 async function atualizar(){
  const atual=++versao;
  try{
   const visao=await chamada('minha-conta');
   if(atual===versao)mostrar(visao);
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
   aviso.textContent=resultado.ativadas+' posições ativadas nesta simulação.';
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
 e('atualizarParticipante').addEventListener('click',atualizar);
 atualizar();
})();
