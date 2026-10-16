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
  e('posicoesParticipante').replaceChildren();
  e('pedidosParticipante').replaceChildren();
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
 sair.addEventListener('click',async()=>{
  encerrarTela();
  try{await chamada('sair',{});msg.textContent='Sessão fictícia encerrada.';}
  catch(erro){msg.textContent=erro.message;}
 });
 e('atualizarParticipante').addEventListener('click',atualizar);
 atualizar();
})();
