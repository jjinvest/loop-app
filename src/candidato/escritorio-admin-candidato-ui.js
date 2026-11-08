'use strict';
// Somente laboratório; credencial do operador mantida apenas em memória.
const $=id=>document.getElementById(id),elem=(tag,value)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=value;return x;};
let auth=null,chave=null,paginaMissoes=0,paginaAlertas=0,paginaProdutos=0,edicaoProduto=null,chaveProduto=null,sinalizacaoAtual=null;
let departamentoAberto=null,paginaOperacional=0,sequenciaOperacional=0;
let paginaPesquisaAdmin=0,pesquisaAtualAdmin=null,sequenciaPesquisaAdmin=0;
const dizer=x=>$('estado').textContent=x;
let cursoresPosicoes=[null],indicePosicoes=0,proximoCursorPosicoes=null;
async function carregarHistoricoPosicoes(){
 const cursor=cursoresPosicoes[indicePosicoes];
 const p=await api('/posicoes-historico'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
 cursoresPosicoes[indicePosicoes]=p.cursorAtual;
 const area=$('historicoPosicoes');area.replaceChildren();
 $('resumoHistoricoPosicoes').textContent='Página '+(indicePosicoes+1)+' · '+p.itens.length+' registro(s). '+p.motivo;
 for(const item of p.itens){
  const row=elem('div');row.className='produto-admin-item';
  row.append(elem('strong',item.estado),elem('small','Pedido '+item.prepedidoId+' · Titular '+item.titularId));
  area.append(row);
 }
 proximoCursorPosicoes=p.proximoCursor;
 $('historicoPosicoesAnterior').disabled=indicePosicoes===0;
 $('historicoPosicoesProximo').disabled=!p.haMais;
}
async function navegarHistoricoPosicoes(destino){
 const botoes=['historicoPosicoesAnterior','historicoPosicoesProximo','historicoPosicoesAtualizar'];
 botoes.forEach(id=>$(id).disabled=true);
 const anterior={indice:indicePosicoes,cursores:[...cursoresPosicoes]};
 try{
  if(destino==='atualizar'){cursoresPosicoes=[null];indicePosicoes=0;}
  else if(destino==='proximo'&&proximoCursorPosicoes){
   cursoresPosicoes[++indicePosicoes]=proximoCursorPosicoes;
  }else if(destino==='anterior')indicePosicoes=Math.max(0,indicePosicoes-1);
  await carregarHistoricoPosicoes();
 }catch(e){
  indicePosicoes=anterior.indice;cursoresPosicoes=anterior.cursores;
  proximoCursorPosicoes=null;
  $('historicoPosicoes').replaceChildren();
  $('resumoHistoricoPosicoes').textContent='Histórico indisponível: '+e.message;
 }finally{
  $('historicoPosicoesAtualizar').disabled=false;
  $('historicoPosicoesAnterior').disabled=indicePosicoes===0;
  $('historicoPosicoesProximo').disabled=!proximoCursorPosicoes;
 }
}
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


async function executarPesquisaAdmin(){
 const busca=pesquisaAtualAdmin;if(!busca)return;
 const seq=++sequenciaPesquisaAdmin,estado=$('pesquisaEstadoAdmin'),area=$('pesquisaResultadosAdmin'),botao=$('pesquisaExecutarAdmin');
 botao.disabled=true;estado.textContent='Pesquisando no SQLite...';area.replaceChildren();
 $('pesquisaAnteriorAdmin').disabled=true;$('pesquisaProximoAdmin').disabled=true;
 try{
  const q=new URLSearchParams({tipo:busca.tipo,termo:busca.termo,pagina:String(paginaPesquisaAdmin)});
  const r=await api('/pesquisa?'+q.toString());
  if(seq!==sequenciaPesquisaAdmin||!auth)return;
  estado.textContent='Página '+(r.pagina+1)+' · '+r.total+' resultado(s) em '+busca.tipo+'.';
  if(!r.resultados.length)area.append(elem('p','Nenhum registro encontrado.'));
  for(const item of r.resultados){
   const card=elem('article');card.className='produto-admin-item';
   const info=elem('div');info.append(elem('strong',item.titulo),elem('small',item.detalhe));
   if(busca.tipo==='clientes'){card.append(info);area.append(card);continue;}
   const acao=elem('button',busca.tipo==='pedidos'?'Conferir pré-adesão':busca.tipo==='produtos'?'Editar no catálogo':'Ver histórico');
   acao.type='button';
   acao.addEventListener('click',async()=>{
    acao.disabled=true;
    try{
     if(busca.tipo==='pedidos'){
      $('preAdesaoId').value=item.id;
      mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(item.id)));
      $('formPreAdesao').scrollIntoView({behavior:'smooth',block:'center'});
     }else if(busca.tipo==='produtos'){
      preencherProduto(await api('/produtos/'+encodeURIComponent(item.id)));
     }else{
      const historico=await api('/missoes/'+encodeURIComponent(item.id)+'/historico');
      const lista=elem('ol');
      for(const x of historico.historico)lista.append(elem('li',x.acao+' · '+x.nota));
      card.append(lista);acao.remove();
     }
    }catch(e){estado.textContent='Consulta do registro falhou: '+e.message;}
    finally{acao.disabled=false;}
   });
   card.append(info,acao);area.append(card);
  }
  $('pesquisaAnteriorAdmin').disabled=paginaPesquisaAdmin===0;
  $('pesquisaProximoAdmin').disabled=!r.haMais;
 }catch(e){if(seq===sequenciaPesquisaAdmin)estado.textContent='Pesquisa indisponível: '+e.message;}
 finally{if(seq===sequenciaPesquisaAdmin)botao.disabled=false;}
}
$('formPesquisaAdmin').addEventListener('submit',e=>{
 e.preventDefault();pesquisaAtualAdmin={tipo:$('pesquisaTipoAdmin').value,termo:$('pesquisaTermoAdmin').value.trim()};
 paginaPesquisaAdmin=0;executarPesquisaAdmin();
});
$('pesquisaLimparAdmin').addEventListener('click',()=>{
 ++sequenciaPesquisaAdmin;pesquisaAtualAdmin=null;paginaPesquisaAdmin=0;
 $('formPesquisaAdmin').reset();$('pesquisaResultadosAdmin').replaceChildren();
 $('pesquisaEstadoAdmin').textContent='Pesquisa limpa.';
 $('pesquisaExecutarAdmin').disabled=false;$('pesquisaAnteriorAdmin').disabled=true;$('pesquisaProximoAdmin').disabled=true;
});
$('pesquisaAnteriorAdmin').addEventListener('click',()=>{
 if(paginaPesquisaAdmin>0){paginaPesquisaAdmin--;executarPesquisaAdmin();}
});
$('pesquisaProximoAdmin').addEventListener('click',()=>{
 if(pesquisaAtualAdmin){paginaPesquisaAdmin++;executarPesquisaAdmin();}
});

function renderizarPreviaFilas(p){
 const root=$('resumoPreviaFilas');root.replaceChildren();
 const area=$('posicoesPreviaFilas');area.replaceChildren();
 if(p.leituraLimitada===true){
  root.append(elem('p',p.motivo));return;
 }
 const resumo=elem('div');resumo.className='indicadores';
 resumo.append(linha('Fictícias históricas',p.totalHistorico||0),
  linha('Hipótese B sem ativação',p.pendentesConferidas||0),
  linha('Em revisão PSP',p.pendentesExigemRevisao||0),
  linha('Acima do teto de simulação',p.pendentesAcimaCapacidade||0),
  linha('Sem fotografia histórica',p.pendentesSemFotografia||0),
  linha('Oferta histórica não qualificada',p.pendentesSemOfertaQualificada||0));
 root.append(resumo,elem('p',p.motivo));
 for(const item of p.hipoteseFilaB||[]){
  const row=elem('div');row.className='produto-admin-item';
  row.append(elem('strong',item.estado),
   elem('small','Pedido '+item.prepedidoId+' · Titular '+item.titularId+
    ' · Pré-adesão fictícia: '+(item.preAdesaoFicticiaRegistrada?'registrada':'não registrada')));
  area.append(row);
 }
}


let custosProdutoAtual=null;
const moedaInterna=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const camposCustos=[
 ['custoFornecedorAdmin','custoFornecedorCentavos'],
 ['custoFreteAdmin','freteCustoCentavos'],
 ['custoPspAdmin','tarifaPspEstimadaCentavos'],
 ['custoTributosAdmin','reservaTributariaEstimadaCentavos']
];
function lerCentavosCampo(id){
 const raw=$(id).value.trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const [i,c='']=raw.split('.');
 const v=Number(i)*100+Number(c.padEnd(2,'0'));
 return Number.isSafeInteger(v)&&v<=100000000?v:null;
}
function atualizarCalculoInterno(){
 const out=$('resumoMargemProdutoAdmin');
 if(!custosProdutoAtual){out.textContent='Selecione um produto salvo.';return;}
 const unitario=lerCentavosCampo('produtoPrecoAdmin');
 const custos=camposCustos.map(([campo])=>lerCentavosCampo(campo));
 if(unitario===null||custos.some(v=>v===null)){
  out.textContent='Preencha preço e custos válidos para conferir a margem.';return;
 }
 const loop=custosProdutoAtual.referenciaLoopCentavos;
 if(loop===null){
  out.textContent='LOOP dependente da composição do carrinho ou evento especial.'+
   ' Margem por unidade indefinida, não creditar saldo.';return;
 }
 const despesas=custos.reduce((a,v)=>a+v,0),margem=unitario-despesas-loop;
 out.textContent='Venda '+moedaInterna(unitario)+' − LOOP '+moedaInterna(loop)+
  ' − custo/taxas/provisões '+moedaInterna(despesas)+' = margem estimada '+
  moedaInterna(margem)+(margem<0?' · ATENÇÃO: margem negativa.':'')+
  ' (nenhum repasse executado)';
}
function limparCustosProduto(){
 custosProdutoAtual=null;$('formCustosProdutoAdmin').reset();
 $('custoProdutoIdAdmin').value='';$('salvarCustoProdutoAdmin').disabled=true;
 $('custosProdutoSelecionadoAdmin').textContent='Selecione um produto no catálogo.';
 $('statusCustosProdutoAdmin').textContent='';atualizarCalculoInterno();
}
async function abrirCustosProduto(id){
 $('salvarCustoProdutoAdmin').disabled=true;custosProdutoAtual=null;
 $('custosProdutoSelecionadoAdmin').textContent='Consultando custos internos...';
 try{
  const x=await api('/produtos/'+encodeURIComponent(id)+'/custos');
  if($('produtoIdAdmin').value!==id)return;
  custosProdutoAtual=x;$('custoProdutoIdAdmin').value=id;
  for(const [campo,chave] of camposCustos)
   $(campo).value=x[chave]===null?(chave==='custoFornecedorCentavos'?'':'0'):
    (x[chave]/100).toFixed(2);
  $('custosProdutoSelecionadoAdmin').textContent='Produto '+id+' · '+x.classificacao+
   ' · LOOP por unidade: '+(x.referenciaLoopCentavos===null?'definido por carrinho':
    moedaInterna(x.referenciaLoopCentavos))+' · revisão '+x.revisao;
  $('salvarCustoProdutoAdmin').disabled=false;atualizarCalculoInterno();
 }catch(e){$('custosProdutoSelecionadoAdmin').textContent='Erro: '+e.message;}
}
$('formCustosProdutoAdmin').addEventListener('input',atualizarCalculoInterno);
$('produtoPrecoAdmin').addEventListener('input',atualizarCalculoInterno);
$('formCustosProdutoAdmin').addEventListener('submit',async e=>{
 e.preventDefault();const botao=e.submitter;
 if(!custosProdutoAtual||botao.disabled)return;
 botao.disabled=true;const out=$('statusCustosProdutoAdmin');
 try{
  const dados={revisaoEsperada:custosProdutoAtual.revisao};
  for(const [campo,chave] of camposCustos){
   dados[chave]=lerCentavosCampo(campo);
   if(dados[chave]===null)throw Error('Informe custos válidos em reais.');
  }
  const x=await api('/produtos/'+encodeURIComponent(custosProdutoAtual.produtoId)+
   '/custos',{method:'PUT',body:dados});
  custosProdutoAtual=x;atualizarCalculoInterno();
  out.textContent='Custos registrados no SQLite. '+
   (x.margemComercialEstimadaCentavos===null?'Margem depende do carrinho.':
    'Margem estimada: '+moedaInterna(x.margemComercialEstimadaCentavos))+
   ' · sem transferência bancária.';
 }catch(e){out.textContent='Custos não gravados: '+e.message+
  ' (reabra o produto em caso de revisão concorrente).';}
 finally{botao.disabled=false;}
});
function limparProduto(){
 edicaoProduto=null;chaveProduto=null;$('formProduto').reset();
 $('produtoIdAdmin').readOnly=false;$('produtoTipoAdmin').disabled=false;
 $('tituloFormularioProduto').textContent='Cadastrar produto fictício';
 limparCustosProduto();
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
 abrirCustosProduto(item.produto.id).catch(e=>
  $('statusCustosProdutoAdmin').textContent='Erro ao consultar custos: '+e.message);
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
let configLojaAtual=null;
function atualizarNumeracaoBanners(){
 for(const [indice,bloco] of [...$('configBannersAdmin').children].entries()){
  const legenda=bloco.querySelector('legend');
  if(legenda)legenda.textContent='Banner '+(indice+1);
 }
}
function criarBannerConfig(dados={}){
 const painel=$('configBannersAdmin');
 if(painel.children.length>=8){
  $('configResultadoAdmin').textContent='Limite de 8 banners por configuração.';
  return;
 }
 const bloco=document.createElement('fieldset');
 bloco.className='config-banner-item';
 const legenda=elem('legend','Banner');bloco.append(legenda);
 const campos=[
  ['titulo','Título',90,true,false],
  ['descricao','Descrição',250,false,true],
  ['produtoId','ID de produto publicado (opcional)',80,false,false],
  ['imagemCaminho','Caminho local da imagem (opcional)',250,false,false]
 ];
 for(const [nome,rotulo,maximo,obrigatorio,multilinha] of campos){
  const label=document.createElement('label');
  label.textContent=rotulo;
  const input=document.createElement(multilinha?'textarea':'input');
  input.name=nome;input.maxLength=maximo;
  if(obrigatorio){input.required=true;input.minLength=3;}
  if(multilinha)input.rows=2;
  input.value=dados[nome]||'';
  if(nome==='produtoId')input.pattern='[a-z0-9-]{3,80}';
  if(nome==='imagemCaminho')
   input.placeholder='/imagens/catalogo/arquivo.webp';
  label.append(input);bloco.append(label);
 }
 const botoes=document.createElement('div');botoes.className='linha';
 const subir=elem('button','Subir');subir.type='button';
 subir.addEventListener('click',()=>{
  if(bloco.previousElementSibling)painel.insertBefore(bloco,bloco.previousElementSibling);
  atualizarNumeracaoBanners();
 });
 const descer=elem('button','Descer');descer.type='button';
 descer.addEventListener('click',()=>{
  if(bloco.nextElementSibling)painel.insertBefore(bloco.nextElementSibling,bloco);
  atualizarNumeracaoBanners();
 });
 const remover=elem('button','Remover');remover.type='button';
 remover.addEventListener('click',()=>{
  bloco.remove();atualizarNumeracaoBanners();
 });
 botoes.append(subir,descer,remover);bloco.append(botoes);
 painel.append(bloco);atualizarNumeracaoBanners();
}
function preencherConfigLojaAdmin(dados){
 configLojaAtual=dados;
 const config=dados.config;
 const textos={
  configSuporteAdmin:'suporte',configContatoAdmin:'contato',
  configSobreAdmin:'sobre',configPrivacidadeAdmin:'privacidade',
  configTrocasAdmin:'trocas'
 };
 for(const [id,chave] of Object.entries(textos))
  $(id).value=config.informacoes[chave]||'';
 const redes={
  configInstagramAdmin:'instagram',configYoutubeAdmin:'youtube',
  configFacebookAdmin:'facebook',configWhatsappAdmin:'whatsapp'
 };
 for(const [id,chave] of Object.entries(redes))
  $(id).value=config.redes[chave]||'';
 $('configBannersAdmin').replaceChildren();
 for(const banner of config.banners)criarBannerConfig(banner);
}
async function carregarConfigLojaAdmin(){
 const dados=await api('/loja/config');
 preencherConfigLojaAdmin(dados);
 $('configResultadoAdmin').textContent='Configuração do SQLite carregada · revisão '+
  dados.revisao+'. Editar aqui altera a loja após recarregar a vitrine.';
}
function colherConfigLojaAdmin(){
 if(!configLojaAtual)throw Error('CONFIG_NAO_CARREGADA');
 const textos={
  configSuporteAdmin:'suporte',configContatoAdmin:'contato',
  configSobreAdmin:'sobre',configPrivacidadeAdmin:'privacidade',
  configTrocasAdmin:'trocas'
 };
 const redes={
  configInstagramAdmin:'instagram',configYoutubeAdmin:'youtube',
  configFacebookAdmin:'facebook',configWhatsappAdmin:'whatsapp'
 };
 const config=structuredClone(configLojaAtual.config);
 for(const [id,chave] of Object.entries(textos))config.informacoes[chave]=$(id).value;
 for(const [id,chave] of Object.entries(redes))config.redes[chave]=$(id).value;
 config.banners=[...$('configBannersAdmin').children].map(bloco=>{
  const get=nome=>bloco.querySelector('[name="'+nome+'"]').value.trim();
  return {titulo:get('titulo'),descricao:get('descricao'),
   produtoId:get('produtoId'),imagemCaminho:get('imagemCaminho')};
 });
 return {revisaoEsperada:configLojaAtual.revisao,config};
}
$('configLojaPainelAdmin').addEventListener('toggle',()=>{
 if($('configLojaPainelAdmin').open&&!configLojaAtual)
  carregarConfigLojaAdmin().catch(e=>
   $('configResultadoAdmin').textContent='Configuração indisponível: '+e.message);
});
$('configAtualizarAdmin').addEventListener('click',()=>
 carregarConfigLojaAdmin().catch(e=>
  $('configResultadoAdmin').textContent='Configuração indisponível: '+e.message));
$('configAdicionarBannerAdmin').addEventListener('click',()=>criarBannerConfig());
$('formConfigLojaAdmin').addEventListener('submit',async e=>{
 e.preventDefault();
 const btn=$('configSalvarAdmin');btn.disabled=true;
 try{
  const body=colherConfigLojaAdmin();
  const atualizado=await api('/loja/config',{method:'PUT',body});
  preencherConfigLojaAdmin(atualizado);
  $('configResultadoAdmin').textContent=
   'Vitrine e atendimento salvos na mesma base SQLite · revisão '+
   atualizado.revisao+'. Abra a AKITEMM ou atualize a loja para conferir. '+
   'Nenhuma compra ou benefício financeiro criado.';
 }catch(e){
  $('configResultadoAdmin').textContent=e.message==='CONFIG_CONFLITO_REVISAO'?
   'Outro operador salvou uma revisão mais recente. Atualize a configuração antes de tentar novamente.':
   'Configuração não salva: '+e.message;
 }finally{btn.disabled=false;}
});

let novidadeEmEdicao=null;
function limparEdicaoNovidade(){
 novidadeEmEdicao=null;
 $('formNovidadesAdmin').reset();
 $('novidadeIdAdmin').value='';
 $('novidadeImagemStatusAdmin').textContent='Nenhuma imagem escolhida.';
 $('novidadeRemoverImagemAdmin').disabled=true;
}
function preencherEdicaoNovidade(n){
 novidadeEmEdicao=n;
 $('novidadeIdAdmin').value=String(n.id);
 $('novidadeTituloAdmin').value=n.titulo;
 $('novidadeTextoAdmin').value=n.texto;
 $('novidadeProdutoAdmin').value=n.produtoId||'';
 $('novidadeOrdemAdmin').value=String(n.ordem);
 $('novidadeEstadoAdmin').value=n.estado;
 $('novidadeImagemAdmin').value='';
 $('novidadeImagemStatusAdmin').textContent=n.temImagem?
  'Imagem atual: '+(n.larguraImagemPx&&n.alturaImagemPx?
   n.larguraImagemPx+' × '+n.alturaImagemPx+' pixels. ':'')+
   (n.qualidadeImagem==='BOA_RESOLUCAO'?'Boa resolução.':
    'Recomenda-se foto maior para maior nitidez.')+
   ' Selecione outra para substituir.':
  'Sem imagem. Prefira 1.200 pixels ou mais no lado maior.';
 $('novidadeRemoverImagemAdmin').disabled=!n.temImagem;
 $('formNovidadesAdmin').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function carregarNovidadesAdmin(){
 const r=await api('/novidades');
 const area=$('listaNovidadesAdmin');area.replaceChildren();
 if(!r.itens.length)area.append(elem('p','Nenhuma novidade criada. Use o formulário abaixo.'));
 for(const n of r.itens){
  const linha=elem('div');linha.className='produto-admin-item';
  const desc=elem('span',(n.titulo||'[Publicação por imagem]')+
   ' · '+n.estado+' · Ordem '+n.ordem+
   ' · '+(n.temImagem?'Imagem '+(n.larguraImagemPx||'?')+' × '+
    (n.alturaImagemPx||'?')+' pixels':'Sem imagem')+
   ' · Revisão '+n.revisao);
  const botao=elem('button','Editar');botao.type='button';
  botao.addEventListener('click',()=>preencherEdicaoNovidade(n));
  linha.append(desc,botao);area.append(linha);
 }
}
async function enviarImagemNovidade(id,revisao,arquivo){
 if(!['image/png','image/jpeg','image/webp'].includes(arquivo.type)||
    arquivo.size>4*1024*1024||arquivo.size<12)
  throw Error('IMAGEM_FORMATO_OU_TAMANHO_INVALIDO');
 const r=await fetch('/staging/escritorio-unificado/novidades/'+id+'/imagem',{
  method:'PUT',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+auth,'Content-Type':arquivo.type,
   'X-Novidade-Revisao':String(revisao)},body:arquivo
 });
 const obj=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(obj.erro||'FALHA_IMAGEM');
 return obj;
}
$('novidadesAtualizarAdmin').addEventListener('click',()=>carregarNovidadesAdmin().catch(e=>
 $('novidadeResultadoAdmin').textContent='Consulta indisponível: '+e.message));
$('novidadeNovaAdmin').addEventListener('click',limparEdicaoNovidade);
$('novidadeImagemAdmin').addEventListener('change',async()=>{
 const campo=$('novidadeImagemStatusAdmin');
 const arquivo=$('novidadeImagemAdmin').files[0];
 if(!arquivo){campo.textContent='Nenhuma imagem escolhida.';return;}
 if(!['image/png','image/jpeg','image/webp'].includes(arquivo.type)||
    arquivo.size>4*1024*1024||arquivo.size<12){
  campo.textContent='Arquivo inválido: PNG, JPEG ou WebP de até 4 MB.';return;
 }
 campo.textContent='Analisando a resolução da imagem…';
 let figura;
 try{
  figura=await createImageBitmap(arquivo);
  if($('novidadeImagemAdmin').files[0]!==arquivo)return;
  const w=figura.width,h=figura.height;
  const boa=Math.max(w,h)>=1080&&Math.min(w,h)>=675;
  campo.textContent=arquivo.name+' · '+w+' × '+h+' pixels · '+
   Math.round(arquivo.size/1024)+' KB. '+
   (boa?'Boa resolução para a vitrine.':
    'Resolução abaixo do recomendado: prefira pelo menos 1.200 px no lado maior, sem ampliar artificialmente.');
 }catch{
  if($('novidadeImagemAdmin').files[0]===arquivo)
   campo.textContent='Não foi possível ler os pixels. Escolha uma foto válida.';
 }finally{figura?.close();}
});
$('novidadeRemoverImagemAdmin').addEventListener('click',async e=>{
 const btn=e.currentTarget;btn.disabled=true;
 try{
  if(!novidadeEmEdicao?.temImagem)throw Error('SEM_IMAGEM');
  const r=await fetch('/staging/escritorio-unificado/novidades/'+novidadeEmEdicao.id+'/imagem',{
   method:'DELETE',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+auth,
    'X-Novidade-Revisao':String(novidadeEmEdicao.revisao)}
  });
  const dados=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(dados.erro||'FALHA_REMOVER_IMAGEM');
  novidadeEmEdicao=dados;
  preencherEdicaoNovidade(dados);await carregarNovidadesAdmin();
  $('novidadeResultadoAdmin').textContent='Imagem removida; publicação permanece conforme sua situação.';
 }catch(err){$('novidadeResultadoAdmin').textContent='Não removida: '+err.message;}
 finally{btn.disabled=false;}
});
$('formNovidadesAdmin').addEventListener('submit',async e=>{
 e.preventDefault();const btn=e.submitter;btn.disabled=true;
 const campo=$('novidadeResultadoAdmin');
 try{
  const arquivo=$('novidadeImagemAdmin').files[0];
  const estado=$('novidadeEstadoAdmin').value;
  const valores={
   titulo:$('novidadeTituloAdmin').value,
   texto:$('novidadeTextoAdmin').value,
   produtoId:$('novidadeProdutoAdmin').value||null,
   ordem:Number($('novidadeOrdemAdmin').value)
  };
  if(!valores.titulo.trim()&&!valores.texto.trim()&&!arquivo&&!novidadeEmEdicao?.temImagem)
   throw Error('INFORME_TEXTO_OU_IMAGEM');
  let r;
  if(novidadeEmEdicao){
   const estadoTemporario=arquivo?'RASCUNHO':estado;
   r=await api('/novidades/'+novidadeEmEdicao.id,{
    method:'PATCH',body:{revisaoEsperada:novidadeEmEdicao.revisao,
     alteracoes:{...valores,estado:estadoTemporario}}
   });
  }else{
   r=await api('/novidades',{method:'POST',body:{...valores,estado:'RASCUNHO'}});
  }
  if(arquivo)r=await enviarImagemNovidade(r.id,r.revisao,arquivo);
  if(r.estado!==estado)r=await api('/novidades/'+r.id,{
   method:'PATCH',body:{revisaoEsperada:r.revisao,alteracoes:{estado}}
  });
  preencherEdicaoNovidade(r);await carregarNovidadesAdmin();
  campo.textContent='Novidade salva: '+r.estado+
   '. '+(r.qualidadeImagem==='ABAIXO_DO_RECOMENDADO'?
    'Atenção: a foto está abaixo da resolução recomendada; substitua por uma maior. ':'')+
   'Exibição no botão Novidades atualiza após recarregar a loja. Nenhum brinde automático foi criado.';
 }catch(err){campo.textContent='Novidade não salva por completo: '+err.message+
  '. Atualize a lista antes de reenviar para evitar versões conflitantes.';}
 finally{btn.disabled=false;}
});

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
  $('sinalizacaoPosicoesRoxo').value=String(r.posicoesPorUnidadeRoxo||0);
  $('sinalizacaoPosicoesRoxo').disabled=r.classificacao!=='ROXO';
  $('tituloSinalizacaoAdmin').scrollIntoView({behavior:'smooth',block:'start'});
  $('resultadoSinalizacaoAdmin').textContent='Configuração visual carregada; revisão '+r.revisao+'.';
 }finally{
  if(chamada===ultimaLeituraCor)for(const el of controles)el.disabled=false;
 }
}




// Um departamento = uma projeção operacional do SQLite + ações já existentes.
// Nenhum quadro paralelo e nenhum cliente/saque fictício.
const destinosOperacionais=Object.freeze({
 BUSCAR_CLIENTES:['tituloPesquisaAdmin','Buscar clientes'],
 BUSCAR_PEDIDOS:['tituloPesquisaAdmin','Buscar pedidos'],
 CRIAR_MISSAO:['criarMissao','Registrar ação operacional'],
 CONFERIR_PSP:['tituloPixUnificado','Conferir PSP de ensaio'],
 EDITAR_PRODUTOS:['tituloProdutosAdmin','Editar catálogo'],
 PREPARAR_ENTREGA:['prepararEntrega','Preparar entrega de ensaio'],
 VER_POSICOES:['previaFilaTitulo','Consultar posições e filas'],
 VER_CATRACA:['motorEnsaioTitulo','Abrir controle da catraca'],
 CRIAR_DOURADA:['painelCriacaoDouradaAdmin','Criar 1 bola dourada'],
 VER_AGENDA:['formAgendaMotor','Configurar horários da catraca'],
 CONFERIR_COBERTURA:['tituloAuditoriaCobertura','Auditar cobertura financeira'],
 VER_FLUXO_FINANCEIRO:['painelFluxoFinanceiroAdmin','Ver catraca financeira e cofres'],
 CONFERIR_BACKUP:['conferirBackupOffsite','Auditar backup'],
 VER_MISSOES:['resumoMissoes','Consultar missões']
});
function navegarParaControle(id){
 const destino=$(id);
 if(!destino)throw Error('CONTROLE_NAO_ENCONTRADO');
 destino.scrollIntoView({behavior:'smooth',block:'center'});
 if(destino.matches('input,select,button,textarea'))destino.focus({preventScroll:true});
}
async function carregarDepartamentoOperacional({rolar=false}={}){
 if(!departamentoAberto)return;
 const codigo=departamentoAberto,seq=++sequenciaOperacional;
 const panel=$('painelDepartamentoOperacional'),estado=$('departamentoOperacionalEstado');
 panel.hidden=false;
 estado.textContent='Consultando dados operacionais no SQLite...';
 $('departamentoOperacionalRegistros').replaceChildren();
 $('departamentoOperacionalAcoes').replaceChildren();
 $('departamentoOperacionalMetricas').replaceChildren();
 $('departamentoOperacionalAnterior').disabled=true;
 $('departamentoOperacionalProximo').disabled=true;
 $('departamentoOperacionalAtualizar').disabled=true;
 try{
  const dados=await api('/departamentos/'+encodeURIComponent(codigo)+
   '/operacao?pagina='+paginaOperacional);
  if(seq!==sequenciaOperacional||!auth||departamentoAberto!==codigo)return;
  $('departamentoOperacionalTitulo').textContent=dados.nome+' · operação';
  const situacao=dados.estado==='BLOQUEADO_COMERCIAL'?
   'Operação comercial não habilitada. ':'Operação de laboratório conectada. ';
  estado.textContent=situacao+dados.descricao+' '+dados.mensagem+
   ' Página '+(dados.pagina+1)+' · '+dados.total+' registro(s).';
  const metricas=$('departamentoOperacionalMetricas');
  for(const metrica of dados.metricas)metricas.append(linha(metrica.rotulo,metrica.valor));
  const acoes=$('departamentoOperacionalAcoes');
  for(const acao of dados.acoes){
   const destino=destinosOperacionais[acao];
   if(!destino)continue;
   const botao=elem('button',destino[1]);botao.type='button';
   botao.addEventListener('click',()=>{
    try{
     if(acao==='CRIAR_MISSAO')$('departamento').value=codigo;
     if(acao==='BUSCAR_CLIENTES')$('pesquisaTipoAdmin').value='clientes';
     if(acao==='BUSCAR_PEDIDOS')$('pesquisaTipoAdmin').value='pedidos';
     navegarParaControle(destino[0]);
    }catch(e){estado.textContent='Controle indisponível: '+e.message;}
   });
   acoes.append(botao);
  }
  const registros=$('departamentoOperacionalRegistros');
  if(!dados.registros.length)registros.append(elem('p',
   dados.estado==='BLOQUEADO_COMERCIAL'?'Nenhuma operação financeira comercial permitida.':
    'Ainda não existem registros nesta área. Os controles disponíveis estão acima.'));
  for(const item of dados.registros){
   const card=elem('article');card.className='produto-admin-item';
   const info=elem('div');info.append(elem('strong',item.titulo),elem('small',item.detalhe));
   card.append(info);
   if(item.produtoId||item.prepedidoId){
    const acao=elem('button',item.produtoId?'Editar produto':
     codigo==='ENTREGAS'?'Abrir preparação de entrega':'Conferir pedido');
    acao.type='button';
    acao.addEventListener('click',async()=>{
     acao.disabled=true;
     try{
      if(item.produtoId){
       preencherProduto(await api('/produtos/'+encodeURIComponent(item.produtoId)));
      }else if(codigo==='ENTREGAS'){
       $('prepedidoId').value=item.prepedidoId;
       navegarParaControle('prepararEntrega');
      }else{
       $('preAdesaoId').value=item.prepedidoId;
       mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(item.prepedidoId)));
       navegarParaControle('formPreAdesao');
      }
     }catch(e){estado.textContent='Não foi possível abrir o registro: '+e.message;}
     finally{acao.disabled=false;}
    });
    card.append(acao);
   }
   registros.append(card);
  }
  $('departamentoOperacionalAnterior').disabled=paginaOperacional===0;
  $('departamentoOperacionalProximo').disabled=!dados.haMais;
  if(rolar)panel.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){
  if(seq===sequenciaOperacional){
   estado.textContent='Departamento temporariamente indisponível: '+e.message;
  }
 }finally{
  if(seq===sequenciaOperacional)$('departamentoOperacionalAtualizar').disabled=false;
 }
}
$('departamentoOperacionalAtualizar').addEventListener('click',()=>carregarDepartamentoOperacional());
$('departamentoOperacionalAnterior').addEventListener('click',()=>{
 if(paginaOperacional>0){paginaOperacional--;carregarDepartamentoOperacional();}
});
$('departamentoOperacionalProximo').addEventListener('click',()=>{
 if(departamentoAberto){paginaOperacional++;carregarDepartamentoOperacional();}
});

function atualizarDepartamentos(departamentos){
 const area=$('quadroDepartamentos');area.replaceChildren();
 const ativo=$('filtrarDepartamento').value;
 for(const d of departamentos){
  const button=elem('button');button.type='button';button.className='departamento-card';
  button.setAttribute('aria-pressed',String(ativo===d.codigo));
  button.append(elem('strong',d.nome),
   elem('span',d.missoesPendentes+' missão(ões) em aberto'),
   elem('small',d.codigo==='COFRES'||d.codigo==='SAQUES'?
    'Financeiro comercial bloqueado · consultar pendências':
    (d.quantidadeDadosLaboratorio===null?'Abrir operações conectadas ao motor de ensaio':
     d.quantidadeDadosLaboratorio+' · '+d.descricao)));
  button.addEventListener('click',async()=>{
   departamentoAberto=d.codigo;paginaOperacional=0;
   $('filtrarDepartamento').value=d.codigo;
   $('departamento').value=d.codigo;paginaMissoes=0;
   button.setAttribute('aria-pressed','true');
   try{
    await atualizar();
    await carregarDepartamentoOperacional({rolar:true});
    dizer('Departamento '+d.nome+' aberto com dados operacionais e ações próprias.');
   }catch(e){dizer('Não foi possível abrir o departamento: '+e.message);}
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

async function carregarPreviaFilas(){
 try{return await api('/projecao-filas');}
 catch(e){
  // O teto permanece fechado no backend, sem derrubar os outros departamentos
  // nem transformar uma leitura indisponivel em zero posicoes.
  if(e.message!=='MAXIMO_ANALISE_SEGURA_EXCEDIDO')throw e;
  return {leituraLimitada:true,
   motivo:'Prévia global indisponível acima de 1.000 registros. Consulte o histórico paginado abaixo; ele não representa ordem de fila.'};
 }
}
async function atualizar(){
 const q=new URLSearchParams({pagina:String(paginaMissoes)});
 if($('filtrarDepartamento').value)q.set('departamento',$('filtrarDepartamento').value);
 if($('filtrarSituacao').value)q.set('situacao',$('filtrarSituacao').value);
 const [e,m,d,alertas,produtos,previa]=await Promise.all([
  api(''),api('/missoes?'+q.toString()),api('/departamentos'),
  api('/alertas?pagina='+paginaAlertas),api('/produtos?pagina='+paginaProdutos),
  carregarPreviaFilas(),carregarHistoricoPosicoes()
 ]);
 $('indicadores').replaceChildren(
  linha('Contas',e.contasCandidatas),
  linha('Pré-pedidos',e.resumo.prepedidosStaging),
  linha('PSP conciliados',e.resumo.recebimentosPSPConciliados),
  linha('PSP sem posição — revisar',e.vinculosMotorAusentes),
  linha('Estornos sem suspensão — revisar',e.reversoesMotorPendentes),
  linha('Reconsultas PSP em andamento',e.recuperacaoPSP?.processando??0),
  linha('Interrupções PSP em recuperação',e.recuperacaoPSP?.retomaveis??0),
  linha('Reincidências — revisão humana',e.recuperacaoPSP?.segundaFalha??0),
  linha('Posições fictícias',e.posicoesPendentesFicticias),
  linha('Missões no filtro',m.total)
 );
 atualizarDepartamentos(d.departamentos);
 atualizarAlertas(alertas);
 renderizarProdutos(produtos);
 carregarNovidadesAdmin().catch(e=>{$('novidadeResultadoAdmin').textContent='Novidades indisponíveis: '+e.message;});
 renderizarPreviaFilas(previa);
 $('resumoMissoes').textContent='Página '+(m.pagina+1)+' · '+m.total+' missão(ões) neste filtro.';
 $('missoesAnterior').disabled=paginaMissoes===0;
 $('missoesProximo').disabled=!m.haMais;
 const pedidos=$('pedidos'),escolha=$('pedido'),original=escolha.value;
 pedidos.replaceChildren();escolha.replaceChildren(new Option('Sem pedido',''));
 for(const p of e.pedidos){
  const card=elem('article');card.className='produto-admin-item';
  card.append(elem('p',(p.nick||'Cliente')+' · '+p.prepedidoId+
   ' · '+(p.estadoOperacional||'Pré-pedido de laboratório')));
  const btn=elem('button','Conferir pré-adesão');btn.type='button';
  btn.addEventListener('click',async()=>{
   $('preAdesaoId').value=p.prepedidoId;
   $('formPreAdesao').scrollIntoView({behavior:'smooth',block:'center'});
   btn.disabled=true;
   try{mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(p.prepedidoId)));}
   catch(e){$('preAdesaoStatus').textContent='Revisão pendente: '+e.message;}
   finally{btn.disabled=false;}
  });
  card.append(btn);pedidos.append(card);
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
 cursoresPosicoes=[null];indicePosicoes=0;proximoCursorPosicoes=null;
 $('historicoPosicoes').replaceChildren();$('resumoHistoricoPosicoes').textContent='';
 $('listaMissoes').replaceChildren();
  ++sequenciaPesquisaAdmin;pesquisaAtualAdmin=null;paginaPesquisaAdmin=0;
  $('pesquisaResultadosAdmin').replaceChildren();$('formPesquisaAdmin').reset();
  $('pesquisaEstadoAdmin').textContent='Acesso encerrado.';
  $('pesquisaAnteriorAdmin').disabled=true;$('pesquisaProximoAdmin').disabled=true;
  $('pesquisaExecutarAdmin').disabled=false;
  ++sequenciaOperacional;departamentoAberto=null;paginaOperacional=0;
  $('painelDepartamentoOperacional').hidden=true;
  $('departamentoOperacionalRegistros').replaceChildren();
  $('departamentoOperacionalAcoes').replaceChildren();
  $('departamentoOperacionalMetricas').replaceChildren();
  dizer('Acesso encerrado.');
});
async function conferirCoberturaAkitemm({offset=0}={}){
 const botao=$('consultarCoberturaAkitemm');
 botao.disabled=true;
 const resumo=$('resumoCoberturaAkitemm'),lista=$('listaCoberturaAkitemm');
 lista.replaceChildren();
 try{
  const r=await api('/auditoria-cobertura?limite=50&offset='+offset);
  resumo.textContent='CONTADORES DESTA PÁGINA · Página '+
   (Math.floor(r.paginacao.offset/r.paginacao.limite)+1)+
   ' · Pedidos examinados: '+r.resumo.pedidosNaAmostra+
   ' / '+r.resumo.pedidosTotal+
   ' · Cobertura bruta insuficiente: '+r.resumo.brutoInsuficiente+
   ' · Produtos individuais sem cobertura: '+r.resumo.segmentosInsuficientes+
   ' · Sem custo externo comprovado: '+r.resumo.semComprovacaoDeCustos+
   ' · Lotes sem PSP vigente: '+r.resumo.lotesSemPSPConferido+
   ' · Posições no motor: '+r.resumo.posicoesNoMotorEnsaio+
   ' · Aceites individuais históricos: '+r.resumo.aceitesHistoricosIndividuais+
   ' · Aceites com PSP revertido ou não vigente: '+r.resumo.aceitesSemPSPVigente+
   ' · Fontes financeiras de ensaio ausentes: '+r.livrosFinanceirosLab.fontesAusentes.length+
   ' · Exposição condicional dos lotes (cenário máximo): '+
    new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
     .format(r.resumo.valorCondicionalDosLotesCentavos/100)+
   '. Banco, custos e reservas reais NÃO CONCILIADOS. Marco Zero financeiro: NÃO APROVADO.';
  if(r.amostraParcial)lista.append(elem('p',
   'A auditoria desta página não representa todos os pedidos. Consulte as demais páginas.'));
  const invalidos=r.pedidos.filter(p=>p.alertas.length>0);
  if(!invalidos.length)lista.append(elem('p',
   'Nenhum alerta nesta página; custos e banco continuam pendentes.'));
  for(const p of invalidos.slice(0,20)){
   const card=elem('article');card.className='alerta-operacional';
   card.append(elem('strong','Pedido '+p.prepedidoId),
    elem('p','Posições: '+(p.posicoesPlanejadas??'sem plano')+
     ' · Referência: '+(p.referenciaCentavos===null?'sem dados':
     new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.referenciaCentavos/100))+
     ' · '+p.estado),
    elem('small',p.alertas.join(' · ')));
   lista.append(card);
  }
  const pag=r.paginacao;
  const navegacao=elem('div');navegacao.className='linha';
  const anterior=elem('button','Página anterior');anterior.type='button';
  anterior.disabled=pag.paginaAnteriorOffset===null;
  const proximo=elem('button','Próxima página');proximo.type='button';
  proximo.disabled=pag.proximaPaginaOffset===null;
  anterior.addEventListener('click',()=>conferirCoberturaAkitemm({
   offset:pag.paginaAnteriorOffset
  }));
  proximo.addEventListener('click',()=>conferirCoberturaAkitemm({
   offset:pag.proximaPaginaOffset
  }));
  navegacao.append(anterior,elem('small',
   'Exibindo '+(pag.quantidadeNaPagina?
    (pag.offset+1)+'–'+(pag.offset+pag.quantidadeNaPagina):'0')+
   ' de '+pag.totalDePedidos+' pedidos'),proximo);
  lista.append(navegacao);
 }catch(e){resumo.textContent='Auditoria indisponível: '+e.message;}
 finally{botao.disabled=false;}
}
async function conferirBackupOffsite(){
 const el=$('estadoBackupOffsite'),botao=$('conferirBackupOffsite');
 botao.disabled=true;
 try{
  const r=await api('/backup-offsite/estado');
  if(r.backupRailwayComprovado===true&&
     r.backupAtualEmDia===true&&
     r.ultimaConfirmacao?.integridadeCifradaSha256){
   el.textContent='Cópia criptografada enviada, relida e restaurada em isolamento: '+
    new Date(r.ultimaConfirmacao.quando).toLocaleString('pt-BR')+
    '. Banco original preservado. Restauração em outra região ainda não comprovada.';
  }else if(r.backupRailwayComprovado===true){
   el.textContent='Existe cópia externa verificada anteriormente, mas o '+
    'backup atual exige verificação (falha recente ou última cópia antiga). '+
    'Última confirmação: '+
    (r.ultimaConfirmacao?.quando?
     new Date(r.ultimaConfirmacao.quando).toLocaleString('pt-BR'):'indisponível')+
    '. Sem garantia de recuperação comercial.';
  }else{
   el.textContent='Backup externo ainda não comprovado neste serviço. '+
    (r.estado==='BACKUP_OFFSITE_NAO_HABILITADO_NESTE_SERVICO'?
     'A rotina automática não está habilitada.' :
     'Último estado: '+r.ultimoEstado+'.')+
    ' Sem garantia de recuperação comercial.';
  }
 }catch(e){el.textContent='Conferência do backup indisponível: '+e.message;}
 finally{botao.disabled=false;}
}
$('conferirBackupOffsite').addEventListener('click',conferirBackupOffsite);
$('consultarCoberturaAkitemm').addEventListener('click',conferirCoberturaAkitemm);
$('atualizar').addEventListener('click',()=>atualizar().catch(e=>dizer(e.message)));
$('recarregarPreviaFilas').addEventListener('click',()=>atualizar().catch(e=>dizer(e.message)));
for(const [id,destino] of [['historicoPosicoesAtualizar','atualizar'],['historicoPosicoesAnterior','anterior'],['historicoPosicoesProximo','proximo']]){
 $(id).addEventListener('click',()=>navegarHistoricoPosicoes(destino));
}

function mostrarPreAdesao(dados){
 const x=$('preAdesaoStatus');
 const resumo=dados.motivos?.length?
  'Bloqueios: '+dados.motivos.join(', '):
  'Requisitos de ensaio conferidos, sem ativação real';
 x.textContent='Estado: '+dados.estado+' · '+resumo+
  '. CPF verificado externamente: não. Posições reais criadas: 0.';
}
$('conferirPreAdesao').addEventListener('click',async e=>{
 const btn=e.currentTarget;btn.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  mostrarPreAdesao(await api('/pre-adesao/'+encodeURIComponent(id)));
 }catch(err){$('preAdesaoStatus').textContent='Consulta bloqueada: '+err.message;}
 finally{btn.disabled=false;}
});
$('conferirGateAtivacao').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  const d=await api('/diagnostico-ativacao/'+encodeURIComponent(id));
  $('resultadoGateAtivacao').textContent='Estado: '+d.estado+
   '. Pendências: '+d.bloqueios.join(', ')+'.';
 }catch(err){$('resultadoGateAtivacao').textContent='Consulta indisponível: '+err.message;}
 finally{botao.disabled=false;}
});
$('criarMissaoGateAtivacao').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  const id=$('preAdesaoId').value;
  if(!/^hom-[a-f0-9-]{36}$/.test(id))throw Error('PREPEDIDO_INVALIDO');
  const gate=await api('/diagnostico-ativacao/'+encodeURIComponent(id));
  if(gate.permitidoAtivar!==false)throw Error('GATE_INCOMPATIVEL');
  const r=await api('/missoes',{method:'POST',
   idempotencia:'regularizacao-ativacao-'+id,
   body:{
    departamento:'SEGURANCA',prioridade:'ALTA',
    titulo:'Regularizar requisitos de ativação',
    descricao:'Conferir identidade externa, pagamento comercial, titularidade, limite de 10 posições ativas, limite de 2 no tabuleiro, conciliação e autorização operacional. Consultar diagnóstico atualizado antes de concluir.',
    prepedidoId:id,mensagemCliente:null
   }});
  $('resultadoGateAtivacao').textContent=r.repetida?
   'Missão de regularização já registrada no departamento Segurança.':
   'Missão de regularização criada no departamento Segurança.';
  paginaMissoes=0;$('filtrarDepartamento').value='SEGURANCA';
  await atualizar();
 }catch(err){$('resultadoGateAtivacao').textContent='Missão não criada: '+err.message;}
 finally{botao.disabled=false;}
});
$('formPreAdesao').addEventListener('submit',async e=>{
 e.preventDefault();
 const btn=e.submitter;btn.disabled=true;
 try{
  const r=await api('/preparar-pre-adesao',{
   method:'POST',body:{prepedidoId:$('preAdesaoId').value}
  });
  mostrarPreAdesao(r);
  await atualizar();
 }catch(err){$('preAdesaoStatus').textContent='Registro bloqueado: '+err.message;}
 finally{btn.disabled=false;}
});


$('recarregarProdutos').addEventListener('click',()=>atualizarProdutos().catch(e=>dizer(e.message)));
$('sinalizacaoClasse').addEventListener('change',()=>{
 const classe=$('sinalizacaoClasse').value;
 if(classe!=='VERDE')$('sinalizacaoMinimo').value='1';
 $('sinalizacaoPosicoesRoxo').disabled=classe!=='ROXO';
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
  if(data.classificacao==='ROXO')
   data.posicoesPorUnidadeRoxo=Number($('sinalizacaoPosicoesRoxo').value);
  sinalizacaoAtual=await api('/sinalizacao/'+encodeURIComponent(sinalizacaoAtual.produtoId),{
   method:'PATCH',body:data
  });
  $('sinalizacaoPosicoesRoxo').value=String(sinalizacaoAtual.posicoesPorUnidadeRoxo||0);
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
  preencherProduto(await api('/produtos/'+encodeURIComponent(id)));
  $('resultadoProdutoAdmin').textContent='Produto salvo; confira e salve os custos internos abaixo.';
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
$('reconciliarPendentesPsp').addEventListener('click',async()=>{
 const botao=$('reconciliarPendentesPsp'),status=$('resultadoConciliacaoPsp');
 botao.disabled=true;
 status.textContent='Conferindo os avisos novos no Sandbox e vinculando ao mesmo motor de ensaio...';
 try{
  const r=await api('/reconciliar-pendentes-sandbox',{
   method:'POST',body:{limite:20}
  });
  status.textContent='Conciliação do lote: '+r.consultados+' avisos conferidos, '+
   r.lotesPendentesCriados+' lotes de posições pendentes, '+
   r.lotesSuspensos+' lotes suspensos por reversão, '+
   r.pendentesRestantes+' avisos aguardando, '+
   r.vinculosMotorAusentes+' eventos de pagamento sandbox sem vínculo no motor, '+
   r.reversoesMotorPendentes+' reversões PSP aguardando suspensão do motor, '+
   r.revisaoNecessaria+' casos desta rodada exigindo revisão, '+
   (r.interrupcoesDetectadas??0)+' interrupções antigas detectadas, '+
   (r.retomadasComProvaPSP??0)+' retomadas com PSP reconsultado, '+
   (r.interrupcoesReinterrompidas??0)+' interrupções repetidas bloqueadas. '+
   'Nenhum saque ou pagamento real liberado.';
  await atualizar();
  await atualizarMotorContaEnsaio();
 }catch(e){
  status.textContent='Conciliação bloqueada: '+e.message;
 }finally{
  await conferirPixUnificado();
 }
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

// Uma ação unitária, escrita no mesmo motor; mesma chave para repetição
// em caso de falha de rede, impedindo duplicação após reenvio.
$('formCriarDouradaAdmin').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=$('criarDouradaManualEnsaio'),estado=$('statusCriarDouradaAdmin');
 if(botao.disabled)return;
 botao.disabled=true;
 estado.textContent='Registrando uma dourada no motor e no SQLite...';
 try{
  if(!$('criarDouradaCiencia').checked)
   throw Error('Confirme que a criação é apenas de ensaio.');
  if(!chaveDouradaPendente)
   chaveDouradaPendente='dourada-'+crypto.randomUUID();
  const result=await api('/motor/douradas/criar',{method:'POST',body:{
   eventoId:chaveDouradaPendente,aceiteEnsaio:true
  }});
  chaveDouradaPendente=null;
  $('criarDouradaCiencia').checked=false;
  estado.textContent=(result.repetido?'Dourada já registrada':'Bola dourada criada')+
   ' · posição #'+result.posicaoId+' · entrada na fila B.'+
   ' Reserva não descontada; valor real recebido: R$ 0.'+
   ' Centro dourado: 6 eventos para o cofre das douradas.';
  try{await atualizarMotorContaEnsaio();}
  catch{estado.textContent+=' Atualize o motor para conferir a posição.';}
 }catch(err){
  estado.textContent='Criação não confirmada: '+err.message+
   '. A próxima tentativa mantém a mesma solicitação para evitar duplicação.';
 }finally{botao.disabled=false;}
});
function atualizarListaDouradasAdmin(r){
 const alvo=$('douradasAtivasAdmin');alvo.replaceChildren();
 const registros=[...r.filaA,...r.filaB,r.tabuleiro.centro,...r.tabuleiro.vagas]
  .filter(p=>p?.dourada);
 if(registros.length===0){
  alvo.append(elem('p','Nenhuma bola dourada ativa neste momento.'));return;
 }
 const usadas=new Set();
 for(const p of registros){
  if(usadas.has(p.numero))continue;usadas.add(p.numero);
  const linha=elem('div');linha.className='produto-admin-item';
  const descricao=elem('span','ID interno #'+p.numero+' · '+
   ([p.numeroVisual&&'#'+p.numeroVisual,p.nomeVisual].filter(Boolean).join(' · ')||'sem texto'));
  const botao=elem('button','Editar');botao.type='button';
  botao.addEventListener('click',()=>{
   $('douradaIdInternoAdmin').value=String(p.numero);
   $('douradaNumeroVisualAdmin').value=p.numeroVisual||'';
   $('douradaNomeVisualAdmin').value=p.nomeVisual||'';
   $('statusVisualDouradaAdmin').textContent='Editando apenas o visual da dourada.';
  });
  linha.append(descricao,botao);alvo.append(linha);
 }
}
$('formVisualDouradaAdmin').addEventListener('submit',async e=>{
 e.preventDefault();const botao=e.submitter||$('formVisualDouradaAdmin').querySelector('button[type=submit]');
 botao.disabled=true;
 try{
  const posicaoId=Number($('douradaIdInternoAdmin').value);
  if(!Number.isSafeInteger(posicaoId)||posicaoId<1)throw Error('ID_INVALIDO');
  const r=await api('/motor/douradas/visual',{method:'POST',body:{
   posicaoId,
   nomeVisual:$('douradaNomeVisualAdmin').value,
   numeroVisual:$('douradaNumeroVisualAdmin').value
  }});
  $('statusVisualDouradaAdmin').textContent='Dourada atualizada. '+(
   r.nomeVisual||r.numeroVisual?'Rótulo visual salvo.':'Sem texto, padrão original.');
  await atualizarMotorContaEnsaio();
 }catch(e){$('statusVisualDouradaAdmin').textContent='Não salvo: '+e.message;}
 finally{botao.disabled=false;}
});
$('limparVisualDouradaAdmin').addEventListener('click',()=>{
 $('douradaNomeVisualAdmin').value='';
 $('douradaNumeroVisualAdmin').value='';
 $('formVisualDouradaAdmin').requestSubmit();
});
let agendaHojeLocal=null;
let chaveDouradaPendente=null;
async function atualizarFluxoFinanceiroAdmin(){
 const status=$('fluxoFinanceiroEstado');
 status.textContent='Conferindo luzes, obrigações e custos no mesmo SQLite...';
 try{
  const d=await api('/financeiro/fluxo');
  const dinheiro=n=>n===null?'Não conciliado':
   new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  const metricas=$('fluxoFinanceiroMetricas');metricas.replaceChildren();
  metricas.append(linha('Luzes financeiras acumuladas',d.luzesFinanceirasRegistradas),
   linha('Luzes do ciclo atual',d.luzesNoCiclo+'/6'),
   linha('Roxas / pretas do ciclo',d.roxasNoCiclo+' / '+d.pretasNoCiclo),
   linha('Giros físicos concluídos',d.girosFisicosConcluidos),
   linha('Pedidos com custos congelados',d.pedidosFotografados),
   linha('Retornos Celcoin fictícios persistidos',d.celcoinHistoricoSimulado?.eventosMockPersistidos??0),
   linha('Pix real liberado','R$ 0,00 (bloqueado)'));
  const cofres=$('fluxoFinanceiroCofres');cofres.replaceChildren();
  const titulos={LOOP_CENTRO:'Centro / participantes',
   LOOP_ESQUERDA:'Investimento / esquerda',
   LOOP_DIREITA:'Reserva / direita',LOOP_DOURADAS:'Douradas / empresa'};
  for(const c of d.cofres)cofres.append(linha(titulos[c.cofre]||c.cofre,
   dinheiro(c.valorPrevistoNaoSacavelCentavos)+' previsto · '+c.eventos+' luz(es)'));
  $('fluxoFinanceiroBancos').textContent=d.bancosPlanejados.map(x=>
   x.instituicaoSugerida+' ('+x.caixa+') — NÃO conectado').join(' | ');
  const pedidos=$('fluxoFinanceiroPedidos');pedidos.replaceChildren();
  if(!d.pedidos.length)pedidos.textContent='Nenhum pré-pedido com fotografia de custos.';
  for(const p of d.pedidos){
   const item=elem('p');
   const rota=d.roteamentoBancarioPlanejado?.find(x=>x.prepedidoId===p.prepedidoId);
   const celcoin=d.ensaiosCelcoin?.find(x=>x.prepedidoId===p.prepedidoId);
   const inter=rota?.receptores?.find(x=>x.destino==='LOOP_INTER');
   const loja=rota?.receptores?.find(x=>x.destino==='LOJA_MERCADO_PAGO');
   item.textContent=p.prepedidoId+' · bruto cotado '+dinheiro(p.totalBrutoCotadoCentavos)+
    ' · LOOP previsto '+dinheiro(p.referenciaLoopPrevistaCentavos)+
    ' · fornecedor previsto '+dinheiro(p.custoFornecedorPrevistoCentavos)+
    ' · fornecedor pago: R$ 0,00 (sem comprovação)'+
    ' · margem estimada '+dinheiro(p.margemComercialEstimadaCentavos)+
    (p.margemNegativa?' · ALERTA: margem negativa':'')+
    (!p.custosCompletos?' · CADASTRAR CUSTOS PARA PRÓXIMOS PEDIDOS':'')+
    (rota?' · Plano bancário NÃO EXECUTADO: Inter '+dinheiro(inter?.montantePrevistoCentavos??null)+
     ' / Mercado Pago '+dinheiro(loja?.montantePrevistoCentavos??null)+
     ' / 3º banco: recebe somente cofres laterais após eventos e conciliação.'+
     (rota.alerta!=='PLANO_CONTABIL_CONSISTENTE'?
      ' · ATENÇÃO: '+rota.alerta:''):'')+
    (celcoin?' · CELCOIN EM ENSAIO: sem credenciais, saldo ou Pix. '+
     'Fornecedor '+dinheiro(celcoin.ordens.find(x=>x.destino==='FORNECEDOR')?.valorPrevistoCentavos??null)+
     ' · margem para Mercado Pago '+dinheiro(celcoin.valorMargemParaMercadoPagoPrevistoCentavos??null)+
     ' · terceiro banco: contas esquerda/direita ainda não abertas.':'');
   pedidos.append(item);
  }
  const luzes=$('fluxoFinanceiroLuzes');luzes.replaceChildren();
  if(!d.luzes.length)luzes.textContent='Ainda não há evento luminoso registrado.';
  for(const l of d.luzes){
   const item=elem('p');
   item.textContent='Ciclo '+l.ciclo+' · luz '+l.ordem+' ('+
    (l.papelVisual==='PARTICIPANTE'?'roxa':'preta')+') · '+
    (titulos[l.cofreDestino]||l.cofreDestino)+' · '+dinheiro(l.referenciaCentavos)+
    ' previsto · não sacável · '+l.prepedidoId;
   luzes.append(item);
  }
  status.textContent='Luzes e giros reconciliados na mesma base de ensaio. '+
   'A luz registra a previsão; o giro move a pessoa. '+
   'Nenhum banco, fornecedor ou participante recebeu transferência real.';
  return d;
 }catch(e){status.textContent='Fluxo não disponível: '+e.message;return null;}
}
$('atualizarFluxoFinanceiroAdmin').addEventListener('click',()=>atualizarFluxoFinanceiroAdmin());
async function atualizarMotorContaEnsaio(){
 const r=await api('/motor/estado');
 atualizarListaDouradasAdmin(r);
 const area=$('motorEnsaioResumo');area.replaceChildren();
 area.append(linha('Fila A de ensaio',r.filaA.length),
  linha('Fila B de ensaio',r.filaB.length),
  linha('Ocupantes no tabuleiro',Number(Boolean(r.tabuleiro.centro))+
   r.tabuleiro.vagas.filter(Boolean).length),
  linha('Eventos de ensaio no ciclo',r.tabuleiro.eventosNoCiclo+'/6'),
  linha('Luzes roxas contabilizadas',r.agenda.luzesRoxasAcesas+'/3'),
  linha('Luzes pretas contabilizadas',r.agenda.luzesPretasAcesas+'/3'),
  linha('Compras confirmadas aguardando luz',r.agenda.aguardandoContabilizacao),
  linha('Giros de ensaio',r.catraca.giros),
  linha('Douradas manuais criadas',r.douradasManuaisCriadas||0),
  linha('Catraca',r.catraca.estado),
  linha('Modo da catraca',r.agenda.modoExecucao||'MANUAL'),
  linha('Meta de centros por turno',r.agenda.metaLotes?.quantidade||'Sem meta'),
  linha('Liberados no turno',r.agenda.metaLotes?.realizadosNoDia||0),
  linha('Autorizados pelo horário até agora',
   r.agenda.metaLotes?.ciclosAutorizadosAteAgora||0));
 $('agendaMotorEstado').textContent='Horário '+r.agenda.abertura+'–'+
  r.agenda.fechamentoAplicado+' ('+r.agenda.fuso+') · '+
  'Modo '+(r.agenda.modoExecucao||'MANUAL')+' · '+
  (r.agenda.modoExecucao==='AGENDADA'?
   (r.agenda.dentroDoHorario?'dentro do horário':'fora do horário'):
   r.agenda.modoExecucao==='NATURAL'?'sem limite de horário':
   r.agenda.modoExecucao==='STOP'?'movimento bloqueado pelo STOP':
   'somente comandos manuais')+
  (r.agenda.pausaManual?' · PAUSA MANUAL':'')+
  ' · '+r.agenda.aguardandoContabilizacao+
  ' compra(s) Sandbox confirmada(s) aguardando contabilização. '+
  'As vendas e as filas continuam mesmo com a catraca pausada.';
 $('agendaMotorInicio').value=r.agenda.abertura;
 $('agendaMotorFim').value=r.agenda.fechamento;
 $('agendaMotorIntervalo').value=String(r.agenda.intervaloMinutos);
 $('agendaMotorExcecaoData').value=r.agenda.excecaoData||'';
 $('agendaMotorExcecaoFim').value=r.agenda.excecaoFechamento||'';
 $('agendaMotorModo').value=r.agenda.modoExecucao||'MANUAL';
 $('agendaMotorMetaQuantidade').value=String(
  r.agenda.metaLotes?.quantidade||0);
 $('agendaMotorMetaDia').value=r.agenda.metaLotes?.dataAlvo||'';
 agendaHojeLocal=r.agenda.dia;
 await atualizarFluxoFinanceiroAdmin();
 return r;
}
async function operacaoMotorContaEnsaio(rota,body,mensagem){
 const alvo=$('motorEnsaioStatus');
 alvo.textContent='Conferindo operação de ensaio...';
 try{
  const r=await api('/motor/'+rota,{method:'POST',body});
  await atualizarMotorContaEnsaio();
  alvo.textContent=mensagem+' · '+(r.motivo||(
   r.posicaoId?'#'+r.posicaoId:'Motor atualizado'))+
   ' · Nenhuma movimentação financeira real.';
 }catch(e){
  alvo.textContent='Operação não executada: '+e.message;
 }
}
$('agendaMotorHoje21').addEventListener('click',()=>{
 if(!agendaHojeLocal){
  $('agendaMotorEstado').textContent='Atualize o motor antes de escolher o dia.';
  return;
 }
 $('agendaMotorExcecaoData').value=agendaHojeLocal;
 if(!$('agendaMotorExcecaoFim').value)
  $('agendaMotorExcecaoFim').value=$('agendaMotorFim').value||'18:00';
 $('agendaMotorEstado').textContent='Data de hoje selecionada. Escolha livremente o horário de encerramento, inclusive 00:00, e salve.';
});
$('formAgendaMotor').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;if(botao)botao.disabled=true;
 const data=$('agendaMotorExcecaoData').value||null;
 const hora=$('agendaMotorExcecaoFim').value||null;
 const estado=$('agendaMotorEstado');
 estado.textContent='Salvando horário e intervalo no SQLite...';
 try{
  if(Boolean(data)!==Boolean(hora))
   throw Error('A exceção precisa ter data e horário.');
  const r=await api('/motor/agenda',{method:'POST',body:{
   ativo:$('agendaMotorModo').value==='AGENDADA',
   modoExecucao:$('agendaMotorModo').value,
   metaQuantidade:Number($('agendaMotorMetaQuantidade').value),
   metaDataAlvo:$('agendaMotorMetaDia').value||null,
   abertura:$('agendaMotorInicio').value,
   fechamento:$('agendaMotorFim').value,
   intervaloMinutos:Number($('agendaMotorIntervalo').value),
   excecaoData:data,excecaoFechamento:hora
  }});
  if(!r.configurada)throw Error('AGENDA_NAO_GRAVADA');
  await atualizarMotorContaEnsaio();
  estado.textContent='Agenda salva no SQLite. Primeira luz somente no próximo intervalo válido; nenhuma compra ou transferência criada.';
 }catch(err){
  estado.textContent='Agenda não alterada: '+err.message;
 }finally{if(botao)botao.disabled=false;}
});
$('formLiberarLoteMotor').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;if(botao)botao.disabled=true;
 const estado=$('motorLoteResultado');
 const quantidade=Number($('motorLoteQuantidade').value);
 estado.textContent='Conferindo compras PSP e posições antes de liberar o lote...';
 try{
  if(!Number.isSafeInteger(quantidade)||quantidade<1)
   throw Error('Informe um número positivo de pessoas.');
  const r=await api('/motor/liberar-lote',{
   method:'POST',body:{quantidade}
  });
  estado.textContent='Solicitados '+r.solicitados+
   ' ciclos; '+r.liberados+' concluídos, '+r.restantes+
   ' aguardando. '+r.eventosUsados+' compras conciliadas contabilizadas. '+
   'Motivo: '+r.motivo+'. Nenhum valor real transferido.';
  await atualizarMotorContaEnsaio();
 }catch(err){estado.textContent='Lote não liberado: '+err.message;}
 finally{if(botao)botao.disabled=false;}
});
$('motorEnsaioAtualizar').addEventListener('click',()=>{
 atualizarMotorContaEnsaio().then(()=>
  $('motorEnsaioStatus').textContent='Leitura do motor no SQLite concluída.')
  .catch(e=>$('motorEnsaioStatus').textContent='Consulta indisponível: '+e.message);
});
$('formMotorEnsaioPedido').addEventListener('submit',async e=>{
 e.preventDefault();
 const botao=e.submitter;botao.disabled=true;
 try{
  await operacaoMotorContaEnsaio('vincular-pedido',{
   prepedidoId:$('motorEnsaioPrepedido').value,
   aceiteEnsaio:$('motorEnsaioCiencia').checked
  },'Pedido vinculado ao motor de ensaio');
 }finally{botao.disabled=false;}
});
$('motorEnsaioRegistrarEvento').addEventListener('click',async e=>{
 const botao=e.currentTarget;botao.disabled=true;
 try{
  await operacaoMotorContaEnsaio('evento',{
   prepedidoId:$('motorEnsaioPrepedido').value
  },'Evento de ensaio conferido');
 }finally{botao.disabled=false;}
});
$('motorEnsaioPreparar').addEventListener('click',()=>operacaoMotorContaEnsaio(
 'preparar',{},'Tabuleiro de ensaio preparado'));
for(const [id,acao] of [['motorEnsaioAbrir','ABRIR'],
 ['motorEnsaioPausar','PAUSAR'],['motorEnsaioGirar','GIRAR']]){
 $(id).addEventListener('click',()=>operacaoMotorContaEnsaio(
  'catraca',{acao},'Catraca de ensaio: '+acao));
}

async function conferirPixUnificado(){
 const estado=$('estadoPixUnificado'),enviar=$('pixUnificadoEnviar');
 enviar.disabled=true;
 try{
  const r=await api('/sandbox-pix/estado');
  if(r.status==='INTEGRADO_SANDBOX_NO_MESMO_SQLITE'&&
     r.usaSQLiteDaLoja&&r.webhookIngressAtivo&&r.consultarPSPDisponivel){
   estado.textContent='Banco e motor de homologação configurados. Conferindo acesso externo do Asaas Sandbox sem criar Pix...';
   try{
    const prova=await api('/sandbox-pix/provar-acesso-remoto');
    if(prova.pspRemotoVerificado!==true)throw Error('PROVA_REMOTA_INCONCLUSIVA');
    estado.textContent='Asaas Sandbox: acesso remoto por GET comprovado, integrado ao MESMO banco da loja e motor. '+
     'Entrega externa do webhook ainda precisa ser comprovada. '+
     (r.conciliacaoAutomaticaConfigurada?'Conciliação periódica configurada. ':'Conciliação automática não habilitada. ')+
     'Nenhum saque real habilitado.';
    enviar.disabled=false;
    $('reconciliarPendentesPsp').disabled=false;
   }catch(e){
    $('reconciliarPendentesPsp').disabled=true;
    estado.textContent='Ligação interna configurada, mas acesso REMOTO ao Asaas Sandbox ainda NÃO comprovado: '+
     e.message+'. Pix de ensaio bloqueado nesta tela.';
   }
  }else{
   $('reconciliarPendentesPsp').disabled=true;
   estado.textContent='Ainda não ativado nesta prévia: faltam credenciais específicas do Asaas Sandbox. Banco e volume já estão disponíveis.';
  }
 }catch(e){estado.textContent='Não foi possível conferir: '+e.message;}
}
$('consultarPixUnificado').addEventListener('click',conferirPixUnificado);
$('formPixUnificado').addEventListener('submit',async ev=>{
 ev.preventDefault();
 const botao=$('pixUnificadoEnviar'),estado=$('estadoPixUnificado');
 if(botao.disabled||!$('pixUnificadoCiencia').checked)return;
 botao.disabled=true;
 try{
  const r=await api('/sandbox-pix/preparar',{method:'POST',body:{
   prepedidoId:$('pixUnificadoPedido').value.trim(),
   clienteAsaasId:$('pixUnificadoCliente').value.trim(),
   aceiteEnsaio:true
  }});
  estado.textContent='Pix SANDBOX '+(r.repetido?'já registrado':'preparado')+
   ' para o pré-pedido '+r.prepedidoId+'. Aguardar webhook e reconsulta do PSP. Nenhuma posição comercial criada.';
  await atualizar();
 }catch(e){estado.textContent='Cobrança não preparada: '+e.message;}
 finally{await conferirPixUnificado();}
});
