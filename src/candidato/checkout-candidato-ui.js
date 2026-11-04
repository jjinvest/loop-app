'use strict';
// Interface de HOMOLOGACAO LOCAL. Nao existe pagamento, cadastro, CPF ou
// posicao verdadeira. Nunca inserir valores da API via innerHTML.
const API='/staging';
let cotacaoEscolhida=null;
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
 if(!ativa){$('painelVerificarEmail').hidden=true;$('painelIdentidadeTeste').hidden=true;
   $('cpfTeste').value='';$('aceiteCpfTeste').checked=false;}
 $('painelLogin').hidden=ativa;
 $('painelCadastro').hidden=ativa;
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
  const previa=await requisitar('/minha-previa-filas');
  const resumo=$('minhaPreviaFilas');resumo.replaceChildren();
  const info=document.createElement('p');
  info.textContent='Posições fictícias anteriores: '+(previa.meusPendentesHistoricos||0)+
   ' · Hipótese na Fila B: '+(previa.meusSimuladosNaFilaB||0)+
   ' · Posições reais: 0. '+previa.motivo;
  resumo.append(info);
  const pre=await requisitar('/minhas-pre-adesoes');
  const historico=$('minhasPreAdesoes');historico.replaceChildren();
  if(!pre.registros.length){
   const aviso=document.createElement('p');
   aviso.textContent='Nenhuma pré-adesão fictícia registrada.';
   historico.append(aviso);
  }
  for(const registro of pre.registros){
   const artigo=document.createElement('article');artigo.className='pedido';
   const nome=document.createElement('strong'),descricao=document.createElement('p');
   nome.textContent=registro.prepedidoId;
   descricao.textContent='Pré-adesão de laboratório: '+registro.estado+
    '. Posições reais: 0. '+(registro.motivos.length?
     'Exige revisão: '+registro.motivos.join(', '):'Nenhuma revisão de ensaio pendente.');
   artigo.append(nome,descricao);historico.append(artigo);
  }

  const recados=await requisitar('/meus-comunicados');
  const area=$('comunicadosCliente');area.replaceChildren();
  if(!recados.comunicados.length){
   const vazio=document.createElement('p');
   vazio.textContent='Nenhum comunicado recebido.';area.append(vazio);
  }
  for(const c of recados.comunicados){
   const item=document.createElement('article');item.className='pedido';
   const id=document.createElement('strong');id.textContent=c.prepedidoId;
   const mensagem=document.createElement('p');mensagem.textContent=c.mensagem;
   item.append(id,mensagem);area.append(item);
  }
  dizer('Pedidos e comunicados atualizados. Nenhuma compra ou pagamento real.');
 }catch(e){dizer('Não foi possível consultar os pedidos: '+e.message);}
}
async function atualizarIdentidadeTeste(){
 const area=$('painelIdentidadeTeste'),form=$('formCpfTeste');
 try{
  const [termos,identidade]=await Promise.all([
   requisitar('/contas/termos-identidade'),
   requisitar('/contas/identidade')
  ]);
  if(!termos.disponivel||!termos.termosTexto||!termos.termosVersao)
   throw Error('TERMOS_NAO_CONFIGURADOS');
  area.hidden=false;
  $('termosCpfTexto').textContent='Versão '+termos.termosVersao+': '+termos.termosTexto;
  form.hidden=identidade.registrado===true;
  $('situacaoCpfTeste').textContent=identidade.registrado?
   'CPF fictício registrado (final '+identidade.cpfFinal+'). Aceite armazenado.':
   'Identificação fictícia ainda não registrada.';
  if(identidade.registrado){$('cpfTeste').value='';$('aceiteCpfTeste').checked=false;}
 }catch(e){
  if(e.status===404){area.hidden=true;return;}
  area.hidden=false;form.hidden=true;
  $('situacaoCpfTeste').textContent='Identificação indisponível: '+e.message;
 }
}
async function registrarIdentidadeTeste(ev){
 ev.preventDefault();
 const botao=ev.submitter;botao.disabled=true;
 try{
  if(!$('aceiteCpfTeste').checked)throw Error('ACEITE_TERMOS_OBRIGATORIO');
  await requisitar('/contas/identidade',{
   method:'POST',body:{cpf:$('cpfTeste').value,
    aceiteExplicito:$('aceiteCpfTeste').checked},mutacao:true
  });
  $('cpfTeste').value='';$('aceiteCpfTeste').checked=false;
  await atualizarIdentidadeTeste();
  dizer('Identificação de ensaio vinculada à sua conta.');
 }catch(e){
  $('cpfTeste').value='';
  $('situacaoCpfTeste').textContent='Identificação não registrada: '+e.message;
 }finally{botao.disabled=false;}
}

async function atualizarVerificacaoEmail(){
 const res=await requisitar('/contas/me');
 $('painelVerificarEmail').hidden=res.confirmacaoEmailDisponivel!==true||
  res.emailVerificado===true;
}
async function solicitarCodigoEmail(){
 try{
  const r=await requisitar('/contas/email/enviar',{
   method:'POST',body:{},mutacao:true
  });
  if(r.envioDeclaradoPeloProvedor!==true)
   throw Error('ENVIO_NAO_CONFIRMADO');
  dizer('Código enviado pelo provedor de laboratório; confirme-o nesta conta.');
 }catch(e){dizer('Não foi possível enviar o código: '+e.message);}
}
async function confirmarCodigoEmail(e){
 e.preventDefault();
 const botao=$('formConfirmarEmail').querySelector('button');
 botao.disabled=true;
 try{
  const r=await requisitar('/contas/email/confirmar',{
   method:'POST',body:{codigo:$('codigoEmail').value},mutacao:true
  });
  if(r.emailVerificado!==true)throw Error('CODIGO_NAO_CONFIRMADO');
  $('codigoEmail').value='';
  await atualizarVerificacaoEmail();
  dizer('E-mail de laboratório confirmado. CPF e identidade externa continuam pendentes.');
 }catch(e){dizer('Falha ao conferir código: '+e.message);}
 finally{botao.disabled=false;}
}
async function entrar(e){
 e.preventDefault();
 const botao=$('formLogin').querySelector('button');
 botao.disabled=true;dizer('Validando conta de homologação...');
 try{
  const dados=await requisitar('/contas/entrar',{method:'POST',
   body:{nick:$('login').value,senha:$('senha').value}});
  csrf=dados.csrf;mostrarSessao(true);$('senha').value='';
  await atualizarVerificacaoEmail();
  await atualizarIdentidadeTeste();
  await carregarCatalogo();
  dizer('Sessão local iniciada. Nenhuma cobrança habilitada.');
  mostrarAba('conteudoPreparar');
 }catch(err){dizer('Não foi possível entrar: '+err.message);}
 finally{botao.disabled=false;}
}

function invalidarCotacao(){
 aprovada=false;cotacaoEscolhida=null;
 $('prepararPedido').disabled=true;
 $('cotacao').textContent='Cotação ainda não solicitada.';
}
async function carregarCatalogo(){
 invalidarCotacao();
 const dados=await requisitar('/catalogo');
 const select=$('produtoDoCatalogo'),antes=select.value;
 select.replaceChildren();
 for(const p of dados.produtos){
  const x=document.createElement('option');x.value=p.id;
  x.textContent=p.nome+' · '+moeda(p.precoCentavos)+' ('+
   (p.tipo==='PDF'?'Curso PDF':'Produto físico')+')';
  select.append(x);
 }
 if([...select.options].some(x=>x.value===antes))select.value=antes;
 else if([...select.options].some(x=>x.value==='curso-homologacao-250'))
  select.value='curso-homologacao-250';
 $('calcularCotacao').disabled=dados.produtos.length===0;
 if(!dados.produtos.length)$('cotacao').textContent='Nenhum produto publicado no laboratório.';
 return dados;
}
function entradaSelecionada(){
 const produtoId=$('produtoDoCatalogo').value,quantidade=Number($('quantidadeDoCatalogo').value);
 if(!/^[a-z0-9-]{3,80}$/.test(produtoId)||
    !Number.isSafeInteger(quantidade)||quantidade<1||quantidade>50)
  throw Error('PRODUTO_OU_QUANTIDADE_INVALIDA');
 return {itens:[{produtoId,quantidade}]};
}

async function cotar(){
 invalidarCotacao();
 try{
  const entrada=entradaSelecionada();
  const res=await requisitar('/cotacao',{method:'POST',body:entrada});
  if(!Number.isSafeInteger(res.totalCentavos)||res.totalCentavos<=0||
     res.compraDisponivel!==false)
   throw Error('COTACAO_INCOMPATIVEL');
  cotacaoEscolhida={entrada,totalCentavos:res.totalCentavos};
  $('cotacao').textContent='Total da cotação fictícia: '+moeda(res.totalCentavos);
  aprovada=true;$('prepararPedido').disabled=false;
  dizer('Cotação conferida; ainda não há pedido ou pagamento.');
 }catch(e){dizer('Cotação indisponível: '+e.message);}
}
async function preparar(){
 if(!csrf||!aprovada||!cotacaoEscolhida)return;
 const botao=$('prepararPedido'),salva=cotacaoEscolhida;
 botao.disabled=true;aprovada=false;cotacaoEscolhida=null;
 try{
  const nova=await requisitar('/cotacao',{method:'POST',body:salva.entrada});
  if(nova.totalCentavos!==salva.totalCentavos)
   throw Error('CATALOGO_ALTERADO_REFAZER_COTACAO');
  const r=await requisitar('/rascunhos',{method:'POST',
   body:salva.entrada,
   chave:'ui-hom-'+crypto.randomUUID(),mutacao:true});
  const p=await requisitar('/prepedidos',{method:'POST',
   body:{rascunhoId:r.intencao.pedidoId},mutacao:true});
  if(!p.prepedido||p.prepedido.totalCentavos!==salva.totalCentavos)
   throw Error('PREPEDIDO_INCONSISTENTE');
  dizer('Pré-pedido salvo. Sem Pix, cobrança real ou posição criada.');
  mostrarAba('conteudoMeusPedidos');
 }catch(e){dizer('Não foi possível preparar o pré-pedido: '+e.message);}
}
async function sair(){
 try{await requisitar('/contas/sair',{method:'POST',mutacao:true});}
 catch(e){dizer('Falha ao encerrar: '+e.message);return;}
 mostrarSessao(false);$('listaPedidos').replaceChildren();$('comunicadosCliente').replaceChildren();$('minhaPreviaFilas').replaceChildren();$('minhasPreAdesoes').replaceChildren();
 dizer('Sessão de homologação encerrada.');
}
async function restaurarSessao(){
 try{
  const s=await requisitar('/contas/me');csrf=s.csrf;
  mostrarSessao(true);
  await atualizarVerificacaoEmail();
  await atualizarIdentidadeTeste();
  await carregarCatalogo();
  dizer('Sessão de laboratório restaurada.');
  mostrarAba('conteudoMeusPedidos');
 }catch(e){mostrarSessao(false);dizer('Entre com seu nick de teste ou crie uma conta fictícia.');}
}
async function cadastrar(e){
 e.preventDefault();
 const botao=$('formCadastro').querySelector('button');
 botao.disabled=true;
 try{
  const nick=$('cadastroNick').value;
  const r=await requisitar('/contas/cadastrar',{method:'POST',
   body:{
    nome:$('cadastroNome').value,
    nick,email:$('cadastroEmail').value,senha:$('cadastroSenha').value,
    aceiteExplicito:$('cadastroTermos').checked
   }
  });
  if(r.contaCriada!==true||r.pagamentoPermitido!==false)
   throw Error('CADASTRO_INCOMPATIVEL');
  $('login').value=nick;
  $('cadastroSenha').value='';
  dizer('Conta fictícia criada. Entre com seu nick e senha para acompanhar pedidos.');
 }catch(e){dizer('Não foi possível cadastrar: '+e.message);}
 finally{botao.disabled=false;}
}
$('formCadastro').addEventListener('submit',cadastrar);
$('solicitarCodigoEmail').addEventListener('click',solicitarCodigoEmail);
$('formConfirmarEmail').addEventListener('submit',confirmarCodigoEmail);
$('formLogin').addEventListener('submit',entrar);
$('formCpfTeste').addEventListener('submit',registrarIdentidadeTeste);
$('calcularCotacao').addEventListener('click',cotar);
$('produtoDoCatalogo').addEventListener('change',invalidarCotacao);
$('quantidadeDoCatalogo').addEventListener('input',invalidarCotacao);
$('atualizarCatalogo').addEventListener('click',async()=>{
 try{await carregarCatalogo();dizer('Catálogo de laboratório atualizado.');}
 catch(e){dizer('Catálogo indisponível: '+e.message);}
});
$('prepararPedido').addEventListener('click',preparar);
$('atualizarPedidos').addEventListener('click',atualizarPedidos);
$('sair').addEventListener('click',sair);
for(const [btn,section] of [['abaPreparar','conteudoPreparar'],['abaMeusPedidos','conteudoMeusPedidos']]){
 $(btn).addEventListener('click',()=>mostrarAba(section));
}
restaurarSessao();
