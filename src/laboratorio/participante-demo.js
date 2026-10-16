'use strict';
(()=>{
 const e=id=>document.getElementById(id);
 const form=e('formEntrarParticipante');
 const msg=e('estadoParticipante');
 const conteudo=e('conteudoParticipante');
 const sair=e('botaoSairParticipante');
 let versao=0;
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
  item.className='selo-posicao-demo posicao-'+p.cor.toLowerCase();
  item.textContent=rotulo+' #'+p.posicaoId;
  return item;
 }
 function mostrarMapa(mapa){
  for(const [campo,id] of [['filaA','mapaFilaAParticipante'],['filaB','mapaFilaBParticipante']]){
   const lista=e(id);lista.replaceChildren();
   for(const posicao of mapa[campo]){
    const li=document.createElement('li');
    li.append(elementoPosicao(posicao,'Posição'));
    lista.append(li);
   }
   if(!mapa[campo].length){const li=document.createElement('li');li.textContent='Fila vazia';lista.append(li);}
  }
  const tabuleiro=e('mapaTabuleiroParticipante');tabuleiro.replaceChildren();
  const todas=[{valor:mapa.tabuleiro.centro,rotulo:'Centro'},
   ...mapa.tabuleiro.vagas.map((valor,i)=>({valor,rotulo:'Vaga '+(i+1)}))];
  for(const {valor,rotulo} of todas){
   const bloco=document.createElement('div');
   bloco.className='espaco-tabuleiro-demo';
   if(valor)bloco.append(elementoPosicao(valor,rotulo));
   else bloco.textContent=rotulo+' — livre';
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
 e('atualizarParticipante').addEventListener('click',atualizar);
 atualizar();
})();
