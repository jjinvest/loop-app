'use strict';
// Somente laboratório; credencial do operador mantida apenas em memória.
const $=id=>document.getElementById(id),elem=(tag,value)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=value;return x;};
let auth=null,chave=null,paginaMissoes=0,paginaAlertas=0,paginaProdutos=0,edicaoProduto=null,chaveProduto=null,sinalizacaoAtual=null;
const dizer=x=>$('estado').textContent=x;
async function api(path,{method='GET',body,idempotencia}={}){
 const r=await fetch('/staging/escritorio-unificado'+path,{
  method,cache:'no-store',credentials:'omit',
  headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'application/json'}:{}),
   ...(idempotencia?{'Idempotency-Key':idempotencia}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const out=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(out.erro||'SERVICO_INDISPONIVEL');
 return out;
}
function linha(rotulo,valor){const a=elem('div');a.className='indicador';a.append(elem('strong',String(valor)),elem('span',rotulo));return a;}

function limparProduto(){
 edicaoProduto=null;chaveProduto=null;$('formProduto').reset();
 $('produtoIdAdmin').readOnly=false;$('produtoTipoAdmin').disabled=false;
 $('tituloFormularioProduto').textContent='Cadastrar produto fictício';
 $('salvarProdutoAdmin').textContent='Salvar produto';
}
function preencherProduto(item){
 edicaoProduto={id:item.produto.id,revisao:item.revisao};
 $('produtoIdAdmin').value=item.produto.id;$('produtoIdAdmin').readOnly=true;
 $('produtoTipoAdmin').value=item.produto.tipo;$('produtoTipoAdmin').disabled=true;
 $('produtoEstadoAdmin').value=item.produto.estado;
 $('produtoNomeAdmin').value=item.produto.nome;
 $('produtoDescricaoAdmin').value=item.produto.descricao;
 $('produtoPrecoAdmin').value=item.produto.precoCentavos===null?'':String(
  (item.produto.precoCentavos/100).toFixed(2)
 );
 $('tituloFormularioProduto').textContent='Editar produto · revisão '+item.revisao;
 $('salvarProdutoAdmin').textContent='Atualizar catálogo do laboratório';
 $('formProduto').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderizarProdutos(r){
 const area=$('listaProdutosAdmin');area.replaceChildren();
 if(!r.registros.length)area.append(elem('p','Nenhum produto nesta página.'));
 for(const item of r.registros){
  const card=elem('article');card.className='produto-admin-item';
  const info=elem('div');info.append(elem('strong',item.produto.nome),
   elem('small',item.produto.id+' · '+item.produto.tipo+' · '+item.produto.estado+
    ' · '+(item.produto.precoCentavos===null?'Sem preço':
     new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(
      item.produto.precoCentavos/100))+' · revisão '+item.revisao));
  const editar=elem('button','Editar');editar.type='button';
  editar.addEventListener('click',()=>preencherProduto(item));
  const cor=elem('button','Cor na loja');cor.type='button';
  cor.addEventListener('click',()=>editarCor(item.produto.id).catch(e=>{
   $('resultadoSinalizacaoAdmin').textContent='Sinalização indisponível: '+e.message;
  }));
  const botoes=elem('div');botoes.append(editar,cor);
  card.append(info,botoes);area.append(card);
 }
 $('produtosAnterior').disabled=paginaProdutos===0;
 $('produtosProximo').disabled=!r.haMais;
}
async function atualizarProdutos(){renderizarProdutos(await api('/produtos?pagina='+paginaProdutos));}
let ultimaLeituraCor=0;
async function editarCor(id){
 const chamada=++ultimaLeituraCor;
 const controles=[...$('formSinalizacaoAdmin').querySelectorAll('input,select,button')];
 for(const el of controles)el.disabled=true;
 $('resultadoSinalizacaoAdmin').textContent='Carregando classificação do produto...';
 try{
  const r=await api('/sinalizacao/'+encodeURIComponent(id));
  if(chamada!==ultimaLeituraCor)return;
  sinalizacaoAtual=r;
  $('sinalizacaoProdutoId').value=id;
  $('produtoSimulado').value=id;
  $('sinalizacaoClasse').value=r.classificacao;
  $('sinalizacaoMinimo').value=String(r.quantidadeMinimaLoop);
  $('tituloSinalizacaoAdmin').scrollIntoView({behavior:'smooth',block:'start'});
  $('resultadoSinalizacaoAdmin').textContent='Configuração visual carregada; revisão '+r.revisao+'.';
 }finally{
  if(chamada===ultimaLeituraCor)for(const el of controles)el.disabled=false;
 }
}



function atualizarDepartamentos(departamentos){
 const area=$('quadroDepartamentos');area.replaceChildren();
 const ativo=$('filtrarDepartamento').value;
 for(const d of departamentos){
  const button=elem('button');button.type='button';button.className='departamento-card';
  button.setAttribute('aria-pressed',String(ativo===d.codigo));
  button.append(elem('strong',d.nome),
   elem('span',d.missoesPendentes+' missão(ões) em aberto'),
   elem('small',d.quantidadeDadosLaboratorio===null?
    'Operações comerciais não conectadas':
    d.quantidadeDadosLaboratorio+' · '+d.descricao));
  button.addEventListener('click',()=>{
   const atual=$('filtrarDepartamento').value;
   $('filtrarDepartamento').value=atual===d.codigo?'':d.codigo;
   $('departamento').value=d.codigo;paginaMissoes=0;
   atualizar().catch(e=>dizer(e.message));
  });
  area.append(button);
 }
}
function atualizarAlertas(painel){
 const area=$('alertasOperacionais');area.replaceChildren();
 $('resumoAlertas').textContent='Página '+(painel.pagina+1)+
  ' · '+painel.pedidosExaminados+' pedidos examinados';
 $('alertasAnterior').disabled=paginaAlertas===0;
 $('alertasProximo').disabled=!painel.haMais;
 if(!painel.alertas.length)area.append(elem('p','Nenhuma revisão identificada nesta página.'));
 for(const a of painel.alertas){
  const item=elem('article');item.className='alerta-operacional';
  item.append(elem('strong',a.motivo.replaceAll('_',' ')),
   elem('p','Pedido '+a.prepedidoId+' · '+a.estadoOperacional));
  const botao=elem('button','Abrir missão de revisão');botao.type='button';
  botao.addEventListener('click',async()=>{
   botao.disabled=true;
   try{
    const m=await api('/alertas/'+encodeURIComponent(a.prepedidoId)+'/abrir-missao',
     {method:'POST',body:{}});
    $('filtrarDepartamento').value='PEDIDOS';paginaMissoes=0;
    await atualizar();
    dizer(m.repetida?'Missão de revisão já estava registrada.':
     'Missão de revisão registrada, sem alterar pagamento.');
   }catch(e){dizer('Revisão não aberta: '+e.message);}
   finally{botao.disabled=false;}
  });
  item.append(botao);area.append(item);
 }
}

async function atualizar(){
 const q=new URLSearchParams({pagina:String(paginaMissoes)});
 if($('filtrarDepartamento').value)q.set('departamento',$('filtrarDepartamento').value);
 if($('filtrarSituacao').value)q.set('situacao',$('filtrarSituacao').value);
 const [e,m,d,alertas,produtos]=await Promise.all([
  api(''),api('/missoes?'+q.toString()),api('/departamentos'),
  api('/alertas?pagina='+paginaAlertas),api('/produtos?pagina='+paginaProdutos)
 ]);
 $('indicadores').replaceChildren(
  linha('Contas',e.contasCandidatas),
  linha('Pré-pedidos',e.resumo.prepedidosStaging),
  linha('PSP conciliados',e.resumo.recebimentosPSPConciliados),
  linha('Posições fictícias',e.posicoesPendentesFicticias),
  linha('Missões no filtro',m.total)
 );
 atualizarDepartamentos(d.departamentos);
 atualizarAlertas(alertas);
 renderizarProdutos(produtos);
 $('resumoMissoes').textContent='Página '+(m.pagina+1)+' · '+m.total+' missão(ões) neste filtro.';
 $('missoesAnterior').disabled=paginaMissoes===0;
 $('missoesProximo').disabled=!m.haMais;
 const pedidos=$('pedidos'),escolha=$('pedido'),original=escolha.value;
 pedidos.replaceChildren();escolha.replaceChildren(new Option('Sem pedido',''));
 for(const p of e.pedidos){
  pedidos.append(elem('p',(p.nick||'Cliente')+' · '+p.prepedidoId+
   ' · '+(p.estadoOperacional||'Pré-pedido de laboratório')));
  escolha.append(new Option((p.nick||'Cliente')+' · '+p.prepedidoId,p.prepedidoId));
 }
 if(e.pedidos.length===0)pedidos.append(elem('p','Nenhum pré-pedido.'));
 if([...escolha.options].some(x=>x.value===original))escolha.value=original;
 const lista=$('listaMissoes');lista.replaceChildren();
 if(m.missoes.length===0)lista.append(elem('p','Nenhuma missão registrada.'));
 for(const item of m.missoes){
  const card=elem('article');card.className='pedido';
  card.append(elem('h3',item.titulo),elem('p',item.departamento+' · '+item.prioridade+' · '+item.situacao),elem('p',item.descricao));
  if(item.prepedidoId)card.append(elem('p','Pedido: '+item.prepedidoId));
  const proximas=item.situacao==='ABERTA'?['EM_ANDAMENTO','CANCELADA']:
   item.situacao==='EM_ANDAMENTO'?['CONCLUIDA','CANCELADA']:[];
  if(proximas.length){
   const form=elem('form'),situacao=elem('select'),nota=elem('textarea'),msg=elem('textarea');
   nota.required=true;nota.minLength=8;nota.maxLength=400;nota.placeholder='Nota da ação realizada';
   msg.maxLength=320;msg.value=item.mensagemCliente||'';msg.placeholder='Comunicado ao cliente';msg.disabled=!item.prepedidoId;
   for(const status of proximas)situacao.append(new Option(status.replaceAll('_',' '),status));
   const botao=elem('button','Registrar andamento');botao.type='submit';
   form.append(situacao,nota,msg,botao);
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();botao.disabled=true;
    try{
     await api('/missoes/'+encodeURIComponent(item.id),{method:'PATCH',
      body:{revisaoEsperada:item.revisao,situacao:situacao.value,nota:nota.value,mensagemCliente:msg.value}});
     await atualizar();dizer('Andamento salvo no histórico da missão.');
    }catch(err){dizer('Falha: '+err.message);}finally{botao.disabled=false;}
   });
   card.append(form);
  }
  const historico=elem('button','Ver histórico');historico.type='button';
  historico.addEventListener('click',async()=>{
   try{
    const h=await api('/missoes/'+encodeURIComponent(item.id)+'/historico');
    const ol=elem('ol');
    for(const row of h.historico)ol.append(elem('li',row.acao+' · '+row.nota));
    historico.replaceWith(ol);
   }catch(err){dizer('Falha: '+err.message);}
  });
  card.append(historico);lista.append(card);
 }
 dizer('Escritório atualizado a partir do mesmo SQLite dos clientes.');
}
$('formAcesso').addEventListener('submit',async e=>{
 e.preventDefault();auth=$('token').value;$('token').value='';
 try{await atualizar();$('acesso').hidden=true;$('administracao').hidden=false;}
 catch(err){auth=null;dizer('Acesso não autorizado: '+err.message);}
});
$('sair').addEventListener('click',()=>{
 auth=null;$('acesso').hidden=false;$('administracao').hidden=true;
 $('listaMissoes').replaceChildren();dizer('Acesso encerrado.');
});
$('atualizar').addEventListener('click',()=>atualizar().catch(e=>dizer(e.message)));

$('recarregarProdutos').addEventListener('click',()=>atualizarProdutos().catch(e=>dizer(e.message)));
$('sinalizacaoClasse').addEventListener('change',()=>{
 if($('sinalizacaoClasse').value==='CINZA')$('sinalizacaoMinimo').value='1';
});
$('formSinalizacaoAdmin').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;botao.disabled=true;
 try{
  if(!sinalizacaoAtual||sinalizacaoAtual.produtoId!==$('sinalizacaoProdutoId').value)
   throw Error('SELECIONE_PRODUTO');
  const data={
   classificacao:$('sinalizacaoClasse').value,
   quantidadeMinimaLoop:Number($('sinalizacaoMinimo').value),
   revisaoEsperada:sinalizacaoAtual.revisao
  };
  sinalizacaoAtual=await api('/sinalizacao/'+encodeURIComponent(sinalizacaoAtual.produtoId),{
   method:'PATCH',body:data
  });
  $('resultadoSinalizacaoAdmin').textContent='Cor salva no catálogo compartilhado. Atualize a vitrine para conferir.';
 }catch(err){$('resultadoSinalizacaoAdmin').textContent='Não foi possível salvar a cor: '+err.message;}
 finally{botao.disabled=false;}
});

$('formSimularQualificacao').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=e.submitter;button.disabled=true;
 try{
  const dados=await api('/simular-qualificacao',{method:'POST',body:{
   itens:[{produtoId:$('produtoSimulado').value,
    quantidade:Number($('quantidadeSimulada').value)}]
  }});
  const moeda=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  $('resultadoSimulacao').textContent=dados.mensagem+
   ' Valor verde considerado: '+moeda(dados.valorVerdeConsideradoCentavos)+
   '. Faltam: '+moeda(dados.faltamCentavos)+
   '. Posições criadas: '+dados.posicoesCriadas+'.';
 }catch(err){$('resultadoSimulacao').textContent='Simulação não realizada: '+err.message;}
 finally{button.disabled=false;}
});
$('cancelarEdicaoProduto').addEventListener('click',limparProduto);
$('produtosAnterior').addEventListener('click',()=>{
 paginaProdutos=Math.max(0,paginaProdutos-1);atualizarProdutos().catch(e=>dizer(e.message));
});
$('produtosProximo').addEventListener('click',()=>{
 paginaProdutos++;atualizarProdutos().catch(e=>dizer(e.message));
});
$('formProduto').addEventListener('input',()=>{chaveProduto=null;});
$('formProduto').addEventListener('submit',async event=>{
 event.preventDefault();
 const botao=event.submitter;botao.disabled=true;
 const preco=Number($('produtoPrecoAdmin').value);
 const centavos=Math.round(preco*100);
 if(!Number.isFinite(preco)||centavos<=0||Math.abs(preco*100-centavos)>0.000001){
  $('resultadoProdutoAdmin').textContent='Preço inválido. Use duas casas decimais.';
  botao.disabled=false;return;
 }
 try{
  const id=$('produtoIdAdmin').value,nome=$('produtoNomeAdmin').value;
  const descricao=$('produtoDescricaoAdmin').value,estado=$('produtoEstadoAdmin').value;
  if(edicaoProduto){
   await api('/produtos/'+encodeURIComponent(edicaoProduto.id),{
    method:'PATCH',body:{revisaoEsperada:edicaoProduto.revisao,
     alteracoes:{nome,descricao,estado,precoCentavos:centavos}}
   });
  }else{
   if(!chaveProduto)chaveProduto='produto-ui-'+crypto.randomUUID();
   const tipo=$('produtoTipoAdmin').value;
   await api('/produtos',{method:'POST',idempotencia:chaveProduto,
    body:{produto:{id,nome,descricao,tipo,estado,precoCentavos:centavos,
     entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
     fotos:[],detalhes:[],videoApresentacaoUrl:null}}});
  }
  limparProduto();await atualizar();
  $('resultadoProdutoAdmin').textContent='Produto salvo no mesmo catálogo das novas cotações de teste.';
 }catch(e){$('resultadoProdutoAdmin').textContent='Produto não salvo: '+e.message;}
 finally{botao.disabled=false;}
});

for(const id of ['filtrarDepartamento','filtrarSituacao']){
 $(id).addEventListener('change',()=>{
  paginaMissoes=0;atualizar().catch(e=>dizer(e.message));
 });
}
$('missoesAnterior').addEventListener('click',()=>{
 paginaMissoes=Math.max(0,paginaMissoes-1);atualizar().catch(e=>dizer(e.message));
});
$('missoesProximo').addEventListener('click',()=>{
 paginaMissoes++;atualizar().catch(e=>dizer(e.message));
});
$('alertasAnterior').addEventListener('click',()=>{
 paginaAlertas=Math.max(0,paginaAlertas-1);atualizar().catch(e=>dizer(e.message));
});
$('alertasProximo').addEventListener('click',()=>{
 paginaAlertas++;atualizar().catch(e=>dizer(e.message));
});
$('criarMissao').addEventListener('input',()=>{chave=null;});
$('criarMissao').addEventListener('submit',async e=>{
 e.preventDefault();if(!chave)chave='ui-'+crypto.randomUUID();
 const botao=e.submitter;botao.disabled=true;
 try{
  await api('/missoes',{method:'POST',idempotencia:chave,body:{
   departamento:$('departamento').value,prioridade:$('prioridade').value,
   titulo:$('titulo').value,descricao:$('descricao').value,
   prepedidoId:$('pedido').value||null,mensagemCliente:$('mensagem').value
  }});
  chave=null;$('criarMissao').reset();await atualizar();
  dizer('Missão criada e auditada, aguardando trabalho humano.');
 }catch(err){dizer('Missão não registrada: '+err.message);}
 finally{botao.disabled=false;}
});
$('reconsultar').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{await api('/reconsultar-psp',{method:'POST',body:{eventoId:$('eventoId').value}});
  await atualizar();dizer('Reconsulta Sandbox concluída. Confira o estado no painel.');
 }catch(err){dizer('Reconsulta bloqueada: '+err.message);}finally{b.disabled=false;}
});
$('prepararEntrega').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{await api('/preparar-entrega',{method:'POST',body:{prepedidoId:$('prepedidoId').value}});
  await atualizar();dizer('Entrega de teste registrada; não houve entrega comercial.');
 }catch(err){dizer('Operação bloqueada: '+err.message);}finally{b.disabled=false;}
});
