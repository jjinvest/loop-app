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
 let csrf=null,selecionado=null,ofertas=[],produtos=[],manutencao=null;
 let regrasCores=[],classificacaoDisponivel=false;
 const status=msg=>{$('resultadoProdutoAdmin').textContent=msg;};
 function travar(bloqueado){
  const seguro=manutencao?.suspensa===true;
  $('salvarPrecoAdmin').disabled=bloqueado||seguro||!selecionado;
  $('salvarCustoAdmin').disabled=bloqueado||seguro||!selecionado;
  $('recarregarProdutos').disabled=bloqueado;
  $('salvarNovoProduto').disabled=bloqueado||seguro||!csrf;
  $('salvarNovaOferta').disabled=bloqueado||seguro||!csrf;
  $('salvarCorAdmin').disabled=bloqueado||seguro||!csrf||!classificacaoDisponivel||!$('corProdutoAdmin').value;
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
  if(resp.status===423)throw Error('Operações comerciais pausadas para manutenção.');
  if(!resp.ok)throw Error('Operação não concluída ('+(data.erro||resp.status)+').');
  return data;
 }
 function exibirProdutosCadastrados(lista){
  const destino=$('listaProdutosCadastrados');
  destino.replaceChildren();
  const escolha=$('ofertaProdutoId');
  const antes=escolha.value;
  escolha.replaceChildren();
  if(lista.length===0){
   destino.textContent='Nenhum produto comercial cadastrado.';
   return;
  }
  for(const p of lista){
   const item=document.createElement('p');
   item.textContent=p.produtoId+' · '+p.titulo+
    ' · '+p.quantidadeDistribuidores+' distribuidores'+
    (p.ativo?' · ativo':' · rascunho');
   destino.appendChild(item);
   const option=document.createElement('option');
   option.value=p.produtoId;
   option.textContent=p.titulo+' ('+p.produtoId+')';
   escolha.appendChild(option);
  }
  if(lista.some(x=>x.produtoId===antes))escolha.value=antes;
 }
 function mostrarCorSelecionada(){
  const r=regrasCores.find(x=>x.produtoId===$('corProdutoAdmin').value);
  if(!r)return;
  $('corTipoAdmin').value=r.cor;
  $('corMinimoAdmin').value=String(r.minimo);
  $('corRoxoAdmin').value=String(r.roxasPorUnidade);
  $('estadoCorAdmin').textContent='Regra atual: '+r.cor+' · revisão '+r.revisao+
   (r.regraExplicita?'':' · sem classificação configurada');
 }
 async function carregarCores(){
  try{
   const d=await pedir('/classificacoes');
   if(!Array.isArray(d.produtos)||d.ativacaoFinanceira!==false)
    throw Error('Classificação indisponível.');
   regrasCores=d.produtos;classificacaoDisponivel=true;
   const sel=$('corProdutoAdmin'),anterior=sel.value;
   sel.replaceChildren();
   for(const r of regrasCores){
    const opt=document.createElement('option');
    opt.value=r.produtoId;opt.textContent=r.titulo+' ('+r.produtoId+')';
    sel.appendChild(opt);
   }
   if(regrasCores.some(x=>x.produtoId===anterior))sel.value=anterior;
   if(regrasCores.length)mostrarCorSelecionada();
   else $('estadoCorAdmin').textContent='Cadastre um produto antes de definir a cor.';
  }catch{
   classificacaoDisponivel=false;
   $('estadoCorAdmin').textContent='Classificação não habilitada neste ambiente.';
  }finally{travar(false);}
 }
 $('corProdutoAdmin').addEventListener('change',mostrarCorSelecionada);
 $('salvarCorAdmin').addEventListener('click',()=>{
  const produtoId=$('corProdutoAdmin').value;
  const anterior=regrasCores.find(x=>x.produtoId===produtoId);
  if(!anterior||!csrf)return;
  const body={cor:$('corTipoAdmin').value,
   minimo:Number($('corMinimoAdmin').value),
   roxasPorUnidade:Number($('corRoxoAdmin').value),
   revisaoEsperada:anterior.revisao};
  if(!Number.isSafeInteger(body.minimo)||body.minimo<1||body.minimo>50||
     !Number.isSafeInteger(body.roxasPorUnidade)||
     body.roxasPorUnidade<0||body.roxasPorUnidade>10){
   $('estadoCorAdmin').textContent='Confira as quantidades permitidas.';return;
  }
  $('salvarCorAdmin').disabled=true;
  void (async()=>{
   const result=await pedir('/classificacoes/'+encodeURIComponent(produtoId),{
    method:'POST',body
   });
   if(result.produtoId!==produtoId||result.revisao!==anterior.revisao+1)
    throw Error('Confirmação da classificação inválida.');
   await carregarCores();await consultarAuditoria();
   $('estadoCorAdmin').textContent='Regra salva e auditada. Compras antigas preservadas.';
  })().catch(async e=>{
   $('estadoCorAdmin').textContent=e.message;
   if(e.message.includes('Dados alterados'))await carregarCores();
  }).finally(()=>travar(false));
 });
 async function atualizar(){
  const dados=await pedir('/produtos-valores');
  if(dados.dadosPrivados!==true||!Array.isArray(dados.ofertas))
   throw Error('Resposta de administração inválida.');
  ofertas=dados.ofertas;
  exibir(ofertas);
  const catalogo=await pedir('/produtos-cadastrados');
  if(!Array.isArray(catalogo.produtos)||
     catalogo.nenhumProdutoPublicadoPorEstaRota!==true)
   throw Error('Resposta do catálogo administrativo inválida.');
  produtos=catalogo.produtos;
  exibirProdutosCadastrados(produtos);
  await carregarCores();
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
   await consultarAuditoria();
   status((tipo==='preco'?'Preço de venda':'Custo do fornecedor')+
    ' salvo com sucesso e histórico de revisão registrado.');
  }catch(e){
   if(e.message.includes('Dados alterados'))await atualizar();
   throw e;
  }finally{travar(false);}
 }
 $('formNovoProduto').addEventListener('submit',e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const botao=$('salvarNovoProduto');
  botao.disabled=true;
  void (async()=>{
   const produtoId=$('novoProdutoId').value.trim();
   const titulo=$('novoProdutoTitulo').value.trim();
   const descricao=$('novoProdutoDescricao').value.trim();
   const criado=await pedir('/produtos-cadastrar',{
    method:'POST',body:{produtoId,titulo,descricao}
   });
   if(criado.produtoId!==produtoId||criado.ativo!==false)
    throw Error('Não foi possível confirmar o cadastro de rascunho.');
   form.reset();
   await atualizar();
   $('ofertaProdutoId').value=produtoId;
   $('resultadoCadastroAdmin').textContent=
    'Produto '+produtoId+' cadastrado como rascunho. Adicione o distribuidor.';
  })().catch(err=>{
   $('resultadoCadastroAdmin').textContent=err.message;
  }).finally(()=>{botao.disabled=!csrf;});
 });
 $('formNovaOferta').addEventListener('submit',e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const botao=$('salvarNovaOferta');
  botao.disabled=true;
  void (async()=>{
   const novo={
    produtoId:$('ofertaProdutoId').value,
    distribuidorId:$('ofertaDistribuidorId').value.trim(),
    sku:$('ofertaSku').value.trim(),
    precoUnitCentavos:validarDinheiro($('ofertaPreco').value),
    prioridade:Number($('ofertaPrioridade').value)
   };
   if(!Number.isSafeInteger(novo.prioridade)||
      novo.prioridade<1||novo.prioridade>9999)
    throw Error('Prioridade inválida.');
   const salvo=await pedir('/ofertas-cadastrar',{method:'POST',body:novo});
   if(salvo.produtoId!==novo.produtoId||salvo.ofertaAtiva!==false)
    throw Error('O distribuidor não foi registrado corretamente.');
   form.reset();$('ofertaPrioridade').value='100';
   await atualizar();
   $('resultadoCadastroAdmin').textContent=
    'Distribuidor vinculado como rascunho. Venda ainda bloqueada.';
  })().catch(err=>{
   $('resultadoCadastroAdmin').textContent=err.message;
  }).finally(()=>{botao.disabled=!csrf;});
 });
 async function consultarAuditoria(){
  const r=await pedir('/auditoria');
  if(r.auditoriaIntegra!==true||r.somenteLeitura!==true||
     !Array.isArray(r.eventos))throw Error('Auditoria indisponível.');
  const div=$('listaAuditoriaAdmin');
  div.replaceChildren();
  $('estadoAuditoriaAdmin').textContent='Histórico verificado: '+
   r.totalHistorico+' operações registradas.';
  for(const evento of r.eventos){
   const item=document.createElement('p');
   const data=new Date(evento.ocorridoEm);
   item.textContent='#'+evento.eventoId+' · '+
    (Number.isFinite(data.getTime())?data.toLocaleString('pt-BR'):'Data indisponível')+
    ' · '+evento.acao+' · '+evento.entidade;
   div.appendChild(item);
  }
 }
 async function atualizarManutencao(){
  try{
   const d=await pedir('/manutencao');
   if(typeof d.suspensa!=='boolean'||
      !Number.isSafeInteger(d.revisao))throw Error('Estado inválido');
   manutencao=d;
   $('estadoManutencaoAdmin').textContent=d.suspensa?
    'Novas operações suspensas. Contas e entregas já pagas continuam.':
    'Operações comerciais sem suspensão administrativa.';
   $('suspenderComercialAdmin').disabled=d.suspensa||!csrf;
   $('retomarComercialAdmin').disabled=!d.suspensa||!csrf;
   travar(false);
  }catch(e){
   manutencao=null;
   $('estadoManutencaoAdmin').textContent=
    'Controle de manutenção indisponível: '+e.message;
   $('suspenderComercialAdmin').disabled=true;
   $('retomarComercialAdmin').disabled=true;
  }
 }
 async function alterarManutencao(suspensa){
  if(!manutencao||!csrf)throw Error('Controle indisponível.');
  const motivo=$('motivoManutencaoAdmin').value;
  $('suspenderComercialAdmin').disabled=true;
  $('retomarComercialAdmin').disabled=true;
  try{
   const mudou=await pedir('/manutencao',{method:'POST',body:{
    suspensa,revisaoEsperada:manutencao.revisao,motivo
   }});
   if(mudou.suspensa!==suspensa)throw Error('Confirmação inválida');
   await atualizarManutencao();
   await consultarAuditoria();
  }catch(e){await atualizarManutencao();throw e;}
 }
 $('suspenderComercialAdmin').addEventListener('click',()=>{
  void alterarManutencao(true).catch(e=>{
   $('estadoManutencaoAdmin').textContent=e.message;
  });
 });
 $('retomarComercialAdmin').addEventListener('click',()=>{
  void alterarManutencao(false).catch(e=>{
   $('estadoManutencaoAdmin').textContent=e.message;
  });
 });
 $('atualizarManutencaoAdmin').addEventListener('click',()=>{
  void atualizarManutencao();
 });
 $('recarregarAuditoriaAdmin').addEventListener('click',()=>{
  void consultarAuditoria().catch(e=>{
   $('estadoAuditoriaAdmin').textContent=e.message;
  });
 });
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

 let politicaCatraca=null,catracaOcupada=false;
 let integracaoDisponivel=false,integracaoOcupada=false;
 async function requisitarIntegracao(body){
  const escrita=body!==undefined;
  const r=await fetch('/api/admin/loop/integracao',{
   method:escrita?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:escrita?{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf}:{},
   ...(escrita?{body:JSON.stringify(body)}:{})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.erro||'INTEGRACAO_LOOP_INDISPONIVEL');
  return d;
 }
 function botoesIntegracao(){
  const ativo=!!csrf&&integracaoDisponivel&&!integracaoOcupada;
  $('sincronizarComprasLoop').disabled=!ativo;
  $('prepararTabuleiroLoop').disabled=!ativo;
 }
 async function atualizarIntegracaoLoop(){
  try{
   const d=await requisitarIntegracao();
   if(d.status!=='INTEGRACAO_INTERNA_ENSAIO'||
      !Number.isSafeInteger(d.enfileiradas)||d.financeiroReal!==false)
    throw Error('Resposta de integração inválida.');
   integracaoDisponivel=true;
   $('integracaoQualificadaEstado').textContent=
    'Confirmadas: '+d.confirmadas+
    ' · Compras encaminhadas ao LOOP: '+d.enfileiradas+
    ' · Posições douradas/roxas e mistas: '+d.posicoesEspeciaisEnfileiradas+
    ' · Verdes aguardando posição: '+d.aguardandoPromocao+
    ' · Luzes: '+d.eventosNoCiclo+'/6'+
    ' · Eventos aguardando ciclo: '+d.esperandoSeisEventos+
    ' · Cinzas sem posição: '+d.naoQualificadas+
    ' · Regras especiais pendentes: '+d.regrasEspeciaisPendentes+
    ' · Estornos: '+d.estornadas+
    ' · Ligação interna de ensaio (sem dinheiro real).';
  }catch(e){
   integracaoDisponivel=false;
   $('integracaoQualificadaEstado').textContent=
    'Integração não liberada: '+e.message;
  }finally{botoesIntegracao();}
 }
 async function executarIntegracaoLoop(acao){
  if(integracaoOcupada||!csrf||!integracaoDisponivel)
   throw Error('Ação administrativa indisponível.');
  integracaoOcupada=true;botoesIntegracao();
  try{
   const d=await requisitarIntegracao({acao});
   if(d.financeiroReal!==false)throw Error('Resposta insegura da integração.');
   await atualizarIntegracaoLoop();
   await atualizarMotorAdministrativo();
   await atualizarCatracaAdmin();
   $('integracaoQualificadaEstado').textContent=
    'Sincronizado: '+(d.novasPosicoes||0)+' posição(ões), '+
    (d.novosEventos||0)+' luz(es) nova(s). '+
    'Filas: '+d.filaA+'/'+d.filaB+
    ' · Eventos: '+d.eventosNoCiclo+'/6. Sem dinheiro real.';
  }finally{integracaoOcupada=false;botoesIntegracao();}
 }
 for(const [id,acao] of [
  ['sincronizarComprasLoop','SINCRONIZAR'],
  ['prepararTabuleiroLoop','PREPARAR_TABULEIRO']
 ]){
  $(id).addEventListener('click',()=>{
   void executarIntegracaoLoop(acao).catch(e=>{
    $('integracaoQualificadaEstado').textContent=e.message;
   });
  });
 }
 $('atualizarIntegracaoLoop').addEventListener('click',()=>void atualizarIntegracaoLoop());

 async function apiCatraca(body){
  const escrita=body!==undefined;
  const res=await fetch('/api/admin/loop/controle',{
   method:escrita?'POST':'GET',cache:'no-store',credentials:'same-origin',
   headers:escrita?{'Content-Type':'application/json','X-Loop-Admin-Csrf':csrf}:{},
   ...(escrita?{body:JSON.stringify(body)}:{})
  });
  const dados=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(dados.erro||'CATRACA_INDISPONIVEL');
  return dados;
 }
 function botoesCatraca(){
  const ativo=!!csrf&&!!politicaCatraca&&
   politicaCatraca.politicaOperacionalConfiguravel===true&&!catracaOcupada;
  for(const id of ['modoCatracaAdmin','limiteCatracaAdmin','inicioCatracaAdmin',
   'fimCatracaAdmin','motivoCatracaAdmin','salvarCatracaAdmin'])
   $(id).disabled=!ativo;
  $('pausarCatracaAdmin').disabled=!ativo||politicaCatraca.modo==='PAUSADA';
  $('liberarCatracaAdmin').disabled=!ativo||politicaCatraca.modo==='MANUAL';
  $('girarCatracaAdmin').disabled=!ativo||
   politicaCatraca.habilitadoSomenteEnsaio!==true||!politicaCatraca.podeGirar;
 }
 async function atualizarCatracaAdmin(){
  try{
   const d=await apiCatraca();
   if(!Number.isSafeInteger(d.revisao)||
      !['PAUSADA','MANUAL','AUTOMATICA'].includes(d.modo)||
      d.financeiroReal!==false)throw Error('Estado administrativo inválido.');
   politicaCatraca=d;
   $('modoCatracaAdmin').value=d.modo;
   $('inicioCatracaAdmin').value=d.janelaInicio;
   $('fimCatracaAdmin').value=d.janelaFim;
   $('limiteCatracaAdmin').value=d.limiteDiario===null?'':String(d.limiteDiario);
   $('estadoCatracaAdmin').textContent='Modo: '+d.modo+
    ' · Horário: '+d.horaLocal+' · Giros hoje: '+d.girosHoje+
    (d.limiteDiario===null?' (livre)':' / '+d.limiteDiario)+
    ' · Eventos: '+d.eventosNoCiclo+'/6 · Filas: '+d.filaA+'/'+d.filaB+
    (d.habilitadoSomenteEnsaio?' · Motor conectado em ensaio':
     ' · Comandos aguardando homologação produtiva');
  }catch(e){
   politicaCatraca=null;
   $('estadoCatracaAdmin').textContent='Controle indisponível: '+e.message;
  }finally{botoesCatraca();}
 }
 function configurarCatraca(modo){
  if(!politicaCatraca)throw Error('Atualize a catraca.');
  const raw=$('limiteCatracaAdmin').value.trim();
  if(raw!==''&&(!/^[1-9]\d*$/.test(raw)||Number(raw)>1000000))
   throw Error('Limite diário inválido.');
  return {acao:'CONFIGURAR',modo,janelaInicio:$('inicioCatracaAdmin').value,
   janelaFim:$('fimCatracaAdmin').value,
   limiteDiario:raw===''?null:Number(raw),
   revisaoEsperada:politicaCatraca.revisao,
   motivo:$('motivoCatracaAdmin').value.trim()||'AJUSTE_OPERACIONAL'};
 }
 async function alterarCatraca(body){
  if(!csrf||catracaOcupada)throw Error('Comando indisponível.');
  catracaOcupada=true;botoesCatraca();
  try{
   const resultado=await apiCatraca(body);
   await atualizarCatracaAdmin();await atualizarMotorAdministrativo();
   $('estadoCatracaAdmin').textContent=body.acao==='GIRAR'?
    (resultado.girou?'Giro efetuado no mesmo motor.':
     'Giro não efetuado: '+resultado.motivo):
    (politicaCatraca?.habilitadoSomenteEnsaio?
     'Política salva e aplicada ao motor de ensaio.':
     'Política administrativa salva. Giro produtivo ainda bloqueado.');
  }finally{catracaOcupada=false;botoesCatraca();}
 }
 for(const [id,acao] of [
  ['salvarCatracaAdmin',()=>configurarCatraca($('modoCatracaAdmin').value)],
  ['pausarCatracaAdmin',()=>configurarCatraca('PAUSADA')],
  ['liberarCatracaAdmin',()=>configurarCatraca('MANUAL')],
  ['girarCatracaAdmin',()=>({acao:'GIRAR'})]
 ]){
  $(id).addEventListener('click',()=>{
   try{void alterarCatraca(acao()).catch(e=>{
    $('estadoCatracaAdmin').textContent=e.message;
   });}catch(e){$('estadoCatracaAdmin').textContent=e.message;}
  });
 }
 $('atualizarCatracaAdmin').addEventListener('click',()=>void atualizarCatracaAdmin());
 async function atualizarMotorAdministrativo(){
  const area=$('loopAdminEstado');
  try{
   const r=await fetch('/api/admin/loop/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('Sem leitura do motor.');
   const m=await r.json();
   if(m.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||
      m.financeiroReal!==false)throw Error('Estado inválido.');
   area.textContent='Fila A: '+m.filaA+' · Fila B: '+m.filaB+
    ' · Eventos: '+m.tabuleiro.eventosNoCiclo+'/6'+
    ' · Giros: '+m.catraca.giros+
    ' · Pedidos comerciais pendentes: '+
    (m.eventosComerciais?.aguardandoConciliacao??0)+
    ' · Operação financeira não habilitada.';
  }catch{
   area.textContent='Motor interno indisponível. Sem giro financeiro liberado.';
  }
 }
 $('atualizarLoopAdmin').addEventListener('click',()=>void atualizarMotorAdministrativo());
 (async()=>{
  try{
   const dados=await pedir('/sessao');
   if(dados.area!=='ADMIN_COMERCIAL'||
      typeof dados.csrfToken!=='string'||
      !/^[A-Za-z0-9_-]{24,256}$/.test(dados.csrfToken))
    throw Error('Não foi possível validar a sessão do administrador.');
   csrf=dados.csrfToken;
   await atualizar();
   await atualizarManutencao();
   await consultarAuditoria();
   await atualizarMotorAdministrativo();
   await atualizarCatracaAdmin();
   await atualizarIntegracaoLoop();
  }catch(e){travar(true);status(e.message);}
 })();
})();