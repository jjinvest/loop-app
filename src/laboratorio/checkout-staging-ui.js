'use strict';
// Interface de HOMOLOGACAO LOCAL. Nao existe pagamento, cadastro, CPF ou
// posicao verdadeira. Nunca inserir valores da API via innerHTML.
const API='/staging';
const produtoId='curso-homologacao-250';
const $=id=>document.getElementById(id);
let csrf=null,aprovada=false,aba='conteudoPreparar';
const moeda=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const dizer=msg=>{$('mensagem').textContent=msg;};
async function requisitar(rota,{method='GET',body,chave,mutacao=false}={}){
 const resposta=await fetch(API+rota,{method,credentials:'same-origin',
  cache:'no-store',headers:{
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(mutacao?{'X-Checkout-Csrf':csrf}:{}),
   ...(chave?{'Idempotency-Key':chave}:{})
  },...(body?{body:JSON.stringify(body)}:{})
 });
 const dados=await resposta.json().catch(()=>({}));
 if(!resposta.ok){
  if(resposta.status===401)mostrarSessao(false);
  const erro=new Error(dados.erro||'SOLICITACAO_INDISPONIVEL');
  erro.status=resposta.status;throw erro;
 }
 return dados;
}
function mostrarSessao(ativa){
 $('painelLogin').hidden=ativa;
 $('painelConta').hidden=!ativa;
 if(!ativa){csrf=null;aprovada=false;$('prepararPedido').disabled=true;
  $('senha').value='';}
}
function mostrarAba(alvo){
 aba=alvo;
 for(const [id,painel] of [['abaPreparar','conteudoPreparar'],['abaMeusPedidos','conteudoMeusPedidos']]){
  const ativo=painel===alvo,botao=$(id);
  botao.setAttribute('aria-selected',String(ativo));
  botao.tabIndex=ativo?0:-1;
  $(painel).hidden=!ativo;
 }
 if(alvo==='conteudoMeusPedidos')atualizarPedidos();
}
function exibirPedidos(pedidos){
 const area=$('listaPedidos');area.replaceChildren();
 if(!Array.isArray(pedidos)||pedidos.length===0){
  const p=document.createElement('p');p.textContent='Nenhum pré-pedido nesta conta de teste.';
  area.append(p);return;
 }
 const estados={
  SEM_COBRANCA_SANDBOX:'Pré-pedido preparado, sem cobrança',
  PREPARADA:'Preparado para homologação, sem Pix',
  CRIACAO_INDETERMINADA:'Cobrança indeterminada: revisão necessária',
  PENDENTE_SANDBOX:'Cobrança de teste pendente no Sandbox',
  RECEBIMENTO_INFORMADO_SANDBOX:'Recebimento informado pelo Sandbox (não é pagamento real)',
  REVERSAO_INFORMADA_SANDBOX:'Reversão de teste: revisão necessária',
  EXIGE_REVISAO:'Revisão de homologação necessária'
 };
 for(const pedido of pedidos){
  const artigo=document.createElement('article');artigo.className='pedido';
  const titulo=document.createElement('h3');titulo.textContent='Pedido '+pedido.prepedidoId;
  const resumo=document.createElement('p');
  resumo.textContent=(pedido.itens||[]).map(i=>i.nome+' × '+i.quantidade).join(', ')+
   ' · '+moeda(pedido.totalCentavos);
  const data=document.createElement('p');data.className='subtexto';
  data.textContent='Registrado em '+new Date(pedido.criadoEm).toLocaleString('pt-BR');
  const status=document.createElement('p');status.className='estado';
  status.textContent=estados[pedido.statusHomologacao]||'Status em verificação (laboratório)';
  artigo.append(titulo,resumo,data,status);
  if(pedido.conferenciaPSPConcluida===true){
   const selo=document.createElement('p');selo.className='subtexto';
   selo.textContent='Pagamento fictício conferido por consulta independente ao Asaas Sandbox.';
   artigo.append(selo);
  }else if(pedido.situacaoOperacional==='WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA'){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Aviso do Asaas recebido. A confirmação por consulta independente ainda está pendente.';
   artigo.append(aviso);
  }
  if(pedido.revisaoManualObrigatoria){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Revisão manual obrigatória. Nenhum benefício será liberado.';
   artigo.append(aviso);
  }
  if(pedido.posicaoPendenteLaboratorio){
   const posicao=document.createElement('p');posicao.className='aviso';
   posicao.textContent='1 posição pendente fictícia de homologação · nenhuma posição real criada.';
   artigo.append(posicao);
  }
  area.append(artigo);
 }
}
async function atualizarPedidos(){
 try{
  const dados=await requisitar('/meus-pedidos');
  exibirPedidos(dados.pedidos);
  dizer('Histórico atualizado. Nenhuma compra ou pagamento real.');
 }catch(e){dizer('Não foi possível consultar os pedidos: '+e.message);}
}
async function entrar(e){
 e.preventDefault();
 const botao=$('formLogin').querySelector('button');
 botao.disabled=true;dizer('Validando conta de homologação...');
 try{
  const dados=await requisitar('/entrar',{method:'POST',
   body:{nomeLogin:$('login').value,senha:$('senha').value}});
  csrf=dados.csrf;mostrarSessao(true);$('senha').value='';
  dizer('Sessão local iniciada. Nenhuma cobrança habilitada.');
  mostrarAba('conteudoPreparar');
 }catch(err){dizer('Não foi possível entrar: '+err.message);}
 finally{botao.disabled=false;}
}
async function cotar(){
 aprovada=false;$('prepararPedido').disabled=true;
 try{
  const res=await requisitar('/cotacao',{method:'POST',
   body:{itens:[{produtoId,quantidade:1}]}});
  if(res.totalCentavos!==25000||res.compraDisponivel!==false)
   throw Error('COTACAO_INCOMPATIVEL');
  $('cotacao').textContent='Total da cotação fictícia: '+moeda(res.totalCentavos);
  aprovada=true;$('prepararPedido').disabled=false;
  dizer('Cotação conferida; ainda não há pedido ou pagamento.');
 }catch(e){dizer('Cotação indisponível: '+e.message);}
}
async function preparar(){
 if(!csrf||!aprovada)return;
 const botao=$('prepararPedido');botao.disabled=true;aprovada=false;
 try{
  const r=await requisitar('/rascunhos',{method:'POST',
   body:{itens:[{produtoId,quantidade:1}]},
   chave:'ui-hom-'+crypto.randomUUID(),mutacao:true});
  const p=await requisitar('/prepedidos',{method:'POST',
   body:{rascunhoId:r.intencao.pedidoId},mutacao:true});
  if(!p.prepedido||p.prepedido.totalCentavos!==25000)
   throw Error('PREPEDIDO_INCONSISTENTE');
  dizer('Pré-pedido salvo. Sem Pix, cobrança real ou posição criada.');
  mostrarAba('conteudoMeusPedidos');
 }catch(e){dizer('Não foi possível preparar o pré-pedido: '+e.message);}
}
async function sair(){
 try{await requisitar('/sair',{method:'POST',mutacao:true});}
 catch(e){dizer('Falha ao encerrar: '+e.message);return;}
 mostrarSessao(false);$('listaPedidos').replaceChildren();
 dizer('Sessão de homologação encerrada.');
}
async function restaurarSessao(){
 try{
  const s=await requisitar('/sessao');csrf=s.csrf;
  mostrarSessao(true);
  dizer('Sessão de laboratório restaurada.');
  mostrarAba('conteudoMeusPedidos');
 }catch(e){mostrarSessao(false);dizer('Entre com uma conta de teste provisionada pelo operador.');}
}
$('formLogin').addEventListener('submit',entrar);
$('calcularCotacao').addEventListener('click',cotar);
$('prepararPedido').addEventListener('click',preparar);
$('atualizarPedidos').addEventListener('click',atualizarPedidos);
$('sair').addEventListener('click',sair);
for(const [btn,section] of [['abaPreparar','conteudoPreparar'],['abaMeusPedidos','conteudoMeusPedidos']]){
 $(btn).addEventListener('click',()=>mostrarAba(section));
}
restaurarSessao();
