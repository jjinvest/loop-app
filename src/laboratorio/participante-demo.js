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
 function mostrar(visao){
  e('nomeLogadoParticipante').textContent=visao.conta.nome+' — meu resumo';
  e('conviteParticipante').textContent='Meu código de convite fictício: '+visao.conta.codigoConvite;
  e('ativasParticipante').textContent=visao.posicoes.length+' / '+visao.limitePosicoesAtivas;
  e('vagasParticipante').textContent=visao.vagasLivres;
  e('indicacoesParticipante').textContent=visao.indicacoes.comprasConfirmadasFicticias;
  e('pendentesParticipante').textContent=visao.indicacoes.cadastrosPendentes;
  lista('posicoesParticipante',visao.posicoes,p=>'Posição '+p.posicaoId+' — '+p.local.replace('_',' '));
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
