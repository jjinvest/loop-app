'use strict';
// Contrato visual do administrador AKITEMM: sem dados falsos, sem funções LAB.
// Todos os preços em centavos no servidor; na tela, reais com vírgula.
(()=>{
 const $=id=>document.getElementById(id);
 const api='/api/admin/comercial';
 const formatar=v=>Number.isSafeInteger(v)?
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100):
  'Não cadastrado';
 const validarDinheiro=(input,permiteZero=false)=>{
  const valor=String(input||'').trim().replace(/^R\$\s*/,'');
  if(!/^(?:0|[1-9]\d{0,6})(?:[,.]\d{1,2})?$/.test(valor))
   throw Error('Digite o valor em reais, por exemplo 149,90.');
  const [inteiro,decimal='']=valor.replace(',','.').split('.');
  const centavos=Number(inteiro)*100+Number((decimal+'00').slice(0,2));
  if(!Number.isSafeInteger(centavos)||centavos>100000000||
     (!permiteZero&&centavos===0))
   throw Error('Valor fora do limite permitido.');
  return centavos;
 };
 let csrf=null,selecionado=null,ofertas=[];
 const status=msg=>{$('resultadoProdutoAdmin').textContent=msg;};
 function travar(bloqueado){
  $('salvarPrecoAdmin').disabled=bloqueado||!selecionado;
  $('salvarCustoAdmin').disabled=bloqueado||!selecionado;
  $('recarregarProdutos').disabled=bloqueado;
 }
 function limparSelecao(){
  selecionado=null;
  for(const id of ['produtoIdAdmin','distribuidorIdAdmin','skuAdmin',
   'produtoPrecoAdmin','produtoCustoAdmin'])$(id).value='';
  $('diferencaBrutaAdmin').textContent='Diferença bruta: selecione um produto.';
  travar(false);
 }
 function selecionar(oferta){
  selecionado={...oferta};
  $('produtoIdAdmin').value=oferta.produtoId;
  $('distribuidorIdAdmin').value=oferta.distribuidorId;
  $('skuAdmin').value=oferta.sku;
  $('produtoPrecoAdmin').value=(oferta.precoVendaCentavos/100).toFixed(2).replace('.',',');
  $('produtoCustoAdmin').value=Number.isSafeInteger(oferta.custoFornecedorCentavos)?
   (oferta.custoFornecedorCentavos/100).toFixed(2).replace('.',','):'';
  $('diferencaBrutaAdmin').textContent='Diferença bruta estimada: '+
   formatar(oferta.diferencaBrutaCentavos)+
   ' (antes de frete, tarifas e impostos)';
  travar(false);
  status('Produto '+oferta.produtoId+' · distribuidor '+oferta.distribuidorId+
   ' selecionado. Informe os valores e clique em Salvar.');
 }
 function exibir(lista){
  const area=$('listaProdutosAdmin');
  area.replaceChildren();
  if(lista.length===0){
   area.textContent='Nenhum produto comercial cadastrado ou conectado ainda.';
   limparSelecao();return;
  }
  for(const oferta of lista){
   const bloco=document.createElement('div');
   bloco.className='produto-admin-item';
   const info=document.createElement('div');
   const titulo=document.createElement('strong');
   titulo.textContent=oferta.produtoId+' · '+oferta.distribuidorId;
   const detalhes=document.createElement('small');
   detalhes.textContent='SKU '+oferta.sku+' | Venda '+formatar(oferta.precoVendaCentavos)+
    ' | Custo '+formatar(oferta.custoFornecedorCentavos)+
    ' | Diferença '+formatar(oferta.diferencaBrutaCentavos);
   info.append(titulo,detalhes);
   const botao=document.createElement('button');
   botao.type='button';
   botao.textContent='Editar valores';
   botao.addEventListener('click',()=>selecionar(oferta));
   bloco.append(info,botao);
   area.appendChild(bloco);
  }
 }
 async function pedir(caminho,{method='GET',body}={}){
  const resp=await fetch(api+caminho,{
   method,credentials:'same-origin',cache:'no-store',
   headers:{...(body?{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf}:{} )},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await resp.json().catch(()=>({}));
  if(resp.status===401)throw Error('Sessão administrativa necessária.');
  if(resp.status===403)throw Error('Sessão expirada ou autorização negada.');
  if(resp.status===409)throw Error('Dados alterados em outra sessão. Atualize e tente de novo.');
  if(!resp.ok)throw Error('Operação não concluída ('+(data.erro||resp.status)+').');
  return data;
 }
 async function atualizar(){
  const dados=await pedir('/produtos-valores');
  if(dados.dadosPrivados!==true||!Array.isArray(dados.ofertas))
   throw Error('Resposta de administração inválida.');
  ofertas=dados.ofertas;
  exibir(ofertas);
  if(selecionado){
   const atualizado=ofertas.find(x=>x.produtoId===selecionado.produtoId&&
    x.distribuidorId===selecionado.distribuidorId);
   if(atualizado)selecionar(atualizado);else limparSelecao();
  }
  $('estadoAdminComercial').textContent='Catálogo comercial atualizado. '+
   ofertas.length+' ofertas com preços e custos privados.';
 }
 async function salvar(tipo){
  if(!selecionado)throw Error('Selecione um produto para alterar.');
  if(!csrf)throw Error('Sessão administrativa não habilitada.');
  const anterior={...selecionado};
  const idProd=encodeURIComponent(anterior.produtoId);
  const idDist=encodeURIComponent(anterior.distribuidorId);
  let caminho,body;
  if(tipo==='preco'){
   caminho='/produtos-preco/'+idProd+'/'+idDist;
   body={
    precoVendaCentavos:validarDinheiro($('produtoPrecoAdmin').value),
    precoAnteriorCentavos:anterior.precoVendaCentavos,
    revisaoPrecoEsperada:anterior.revisaoPreco
   };
  }else{
   caminho='/produtos-valores/'+idProd+'/'+idDist;
   body={
    custoUnitCentavos:validarDinheiro($('produtoCustoAdmin').value,true),
    revisaoEsperada:anterior.revisaoCusto
   };
  }
  travar(true);
  try{
   const result=await pedir(caminho,{method:'POST',body});
   if(result.produtoId!==anterior.produtoId||
      result.distribuidorId!==anterior.distribuidorId)
    throw Error('Produto da resposta não corresponde ao selecionado.');
   await atualizar();
   status((tipo==='preco'?'Preço de venda':'Custo do fornecedor')+
    ' salvo com sucesso e histórico de revisão registrado.');
  }catch(e){
   if(e.message.includes('Dados alterados'))await atualizar();
   throw e;
  }finally{travar(false);}
 }
 $('recarregarProdutos').addEventListener('click',()=>{
  void atualizar().catch(e=>status(e.message));
 });
 $('salvarPrecoAdmin').addEventListener('click',()=>{
  void salvar('preco').catch(e=>status(e.message));
 });
 $('salvarCustoAdmin').addEventListener('click',()=>{
  void salvar('custo').catch(e=>status(e.message));
 });
 $('formEconomiaProduto').addEventListener('submit',e=>e.preventDefault());
 for(const nome of ['exportarCatalogoAdmin','exportarPedidosAdmin']){
  $(nome).addEventListener('click',e=>{
   if(!csrf){
    e.preventDefault();status('Sessão administrativa não validada.');
   }
  });
 }
 (async()=>{
  try{
   const dados=await pedir('/sessao');
   if(dados.area!=='ADMIN_COMERCIAL'||
      typeof dados.csrfToken!=='string'||
      !/^[A-Za-z0-9_-]{24,256}$/.test(dados.csrfToken))
    throw Error('Não foi possível validar a sessão do administrador.');
   csrf=dados.csrfToken;
   await atualizar();
  }catch(e){travar(true);status(e.message);}
 })();
})();