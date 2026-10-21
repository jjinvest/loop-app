'use strict';

// Chave mantida somente em memoria. Sem localStorage, cookies ou log.
let chaveTemporaria = '';
let registroEditando = null;
let revisaoFornecedor = 0;
let fornecedorAtivo = false;
let revisaoElegibilidadeAkitemm=1;
let abaAtualAdmin = 'inicio';
const ABAS_ADMIN={
  inicio:{secao:'areaVisaoAdmin',botao:'abaAdminInicio'},
  produtos:{secao:'areaPainel',botao:'abaAdminProdutos'},
  importacao:{secao:'areaImportacao',botao:'abaAdminImportacao'},
  pedidos:{secao:'areaPedidosDemo',botao:'abaAdminPedidos'},
  vitrine:{secao:'areaVitrineAkitemm',botao:'abaAdminVitrineAkitemm'}
};
function mostrarAbaAdmin(aba){
 if(!Object.hasOwn(ABAS_ADMIN,aba)||!chaveTemporaria)return;
 abaAtualAdmin=aba;
 for(const [nome,config] of Object.entries(ABAS_ADMIN)){
  $(config.secao).hidden=nome!==aba;
  $(config.botao).setAttribute('aria-selected',nome===aba?'true':'false');
  $(config.botao).tabIndex=nome===aba?0:-1;
 }
}


const $ = id => document.getElementById(id);
const mensagem = texto => { $('mensagemAdmin').textContent = texto; };

let produtosPainelAdmin=[];
const formatarReais=centavos=>new Intl.NumberFormat('pt-BR',{
 style:'currency',currency:'BRL'
}).format(centavos/100);
async function atualizarDiagnosticoAdmin(){
 if(!chaveTemporaria)return;
 $('mensagemDiagnosticoAdmin').textContent='Consultando dados internos do LOOP...';
 const [concil,ambiente]=await Promise.allSettled([
  requisitar('/circuit-break-v6-demo/ponte/conciliacao'),
  requisitar('/akitemm/sandbox/status')
 ]);
 $('resumoProdutosAdmin').textContent=String(produtosPainelAdmin.length);
 $('resumoPublicadosAdmin').textContent=String(
  produtosPainelAdmin.filter(x=>x.estado==='PUBLICADO').length
 );
 if(concil.status==='fulfilled'){
  const x=concil.value;
  $('resumoCofresAdmin').textContent=x.quantidadeDivergencias?
   x.quantidadeDivergencias+' divergência(s)':
   x.fase==='INATIVO'?'Não configurado':'Sem divergências fictícias';
 }else $('resumoCofresAdmin').textContent='Indisponível';
 $('resumoPixAdmin').textContent=ambiente.status==='fulfilled'?
  (ambiente.value.sandbox?'Sandbox habilitado':'Sandbox desligado'):'Indisponível';
 $('mensagemDiagnosticoAdmin').textContent=
  'Painel de laboratório: valores informados não representam saldo bancário, '+
  'movimentação de dinheiro ou autorização de saque.';
}
function atualizarCalculadoraAdmin(){
 const destino=$('resultadoCalcAdmin');
 const preco=$('precoProduto').value;
 const custo=$('custoUnitarioCalcAdmin').value;
 const quantidade=Number($('quantidadeCalcAdmin').value);
 if(preco===''||custo===''){
  destino.textContent='Informe o preço escolhido, o custo unitário e a quantidade para conferir o pedido.';
  return;
 }
 try{
  if(!Number.isSafeInteger(quantidade)||quantidade<1||quantidade>100)
   throw new TypeError('Quantidade deve ser um número inteiro entre 1 e 100');
  const precoUnitario=precoCentavos(preco);
  const custoNumero=Number(custo);
  if(!Number.isFinite(custoNumero)||custoNumero<0||
     !Number.isSafeInteger(Math.round(custoNumero*100))||
     Math.abs(custoNumero*100-Math.round(custoNumero*100))>0.00001)
   throw new TypeError('Custo inválido: use reais e até duas casas decimais');
  const custoUnitario=Math.round(custoNumero*100);
  const valorVendaCentavos=precoUnitario*quantidade;
  const custoProdutosCentavos=custoUnitario*quantidade;
  if(!Number.isSafeInteger(valorVendaCentavos)||!Number.isSafeInteger(custoProdutosCentavos))
   throw new TypeError('Valor fora do limite');
  const r=window.PonteFinanceiraAkitemmLoopV6.calcularPonteAkitemmLoop({
   valorVendaCentavos,custoProdutosCentavos
  });
  let frase='Pedido simulado: '+formatarReais(r.vendaCentavos)+
   ' | Produto: '+formatarReais(r.custoProdutosCentavos)+'. ';
  if(r.situacao==='COBERTURA_CALCULADA_SEM_TRANSFERENCIA'){
   frase+='LOOP: '+formatarReais(r.loopSeparavelCentavos)+
    ' | Restante do proprietário: '+formatarReais(r.restanteProprietarioCentavos)+
    '. É uma estimativa, não separação real de dinheiro.';
  }else if(r.situacao==='VENDA_SOMENTE_AKITEMM'){
   frase+='Esta venda isolada não atinge R$ 250; não qualifica posição. '+
    'Restante após produto: '+formatarReais(r.restanteProprietarioCentavos)+'.';
  }else if(r.situacao==='SEM_COBERTURA_PARA_LOOP'){
   frase+='Este preço não cobre simultaneamente produto e os R$ 250 do LOOP. '+
    'Faltam '+formatarReais(r.insuficienciaCentavos)+'.';
  }else{
   frase+='O custo do produto ultrapassa a venda em '+
    formatarReais(r.insuficienciaCentavos)+'.';
  }
  destino.textContent=frase;
 }catch(e){destino.textContent=e.message||'Confira os valores';}
}


function linhas(texto) {
  return texto.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}

function precoCentavos(valor) {
  if (!valor.trim()) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0 ||
      !Number.isSafeInteger(Math.round(numero * 100)) ||
      Math.abs(numero * 100 - Math.round(numero * 100)) > 0.00001) {
    throw new Error('Informe um preço válido, com até duas casas decimais.');
  }
  return Math.round(numero * 100);
}

async function requisitar(caminho, options = {}) {
  if (!chaveTemporaria) throw new Error('Informe a chave do laboratório.');
  const resposta = await fetch('/api/admin' + caminho, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + chaveTemporaria,
      ...(options.body ? { 'Content-Type':'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (dados.erro === 'FORNECEDOR_SKU_JA_UTILIZADO') {
      throw new Error('Este SKU já está vinculado a outro produto. Confira fornecedor e código.');
    }
    if (dados.erro === 'CONFLITO_FORNECEDOR') {
      throw new Error('O fornecedor foi alterado em outra tela. Abra o produto novamente.');
    }
    if (resposta.status === 409) throw new Error('Este produto foi alterado em outra tela. Recarregue antes de salvar.');
    if (resposta.status === 401 || resposta.status === 403) throw new Error('Chave incorreta ou acesso local não permitido.');
    throw new Error(dados.mensagem || dados.erro || 'Não foi possível concluir a operação.');
  }
  return dados;
}

function limparHistorico() {
  const lista = $('historicoProduto');
  if (lista) lista.replaceChildren();
}

async function carregarHistorico(id) {
  const lista = $('historicoProduto');
  if (!lista) return;
  lista.replaceChildren();
  const dados = await requisitar('/produtos/' + encodeURIComponent(id) + '/historico');
  for (const evento of dados.eventos) {
    const li = document.createElement('li');
    const campos = evento.campos.length ? evento.campos.join(', ') : 'registro importado';
    li.textContent = 'Revisão ' + evento.revisao + ' — ' +
      evento.tipo + ' — ' + evento.ocorridoEm + ' — ' + campos;
    lista.appendChild(li);
  }
}

function editarFormulario(registro) {
  limparHistorico();
  $('areaFornecedor').hidden = true;
  $('historicoFornecedor').replaceChildren();
  revisaoFornecedor = 0;
  fornecedorAtivo = false;
  const p = registro?.produto;
  registroEditando = registro ? {id:p.id, revisao:registro.revisao} : null;
  $('tituloFormulario').textContent = p ? 'Editar produto: ' + p.id : 'Novo produto';
  $('formProduto').reset();
  $('quantidadeCalcAdmin').value='1';
  $('custoUnitarioCalcAdmin').value='';
  $('idProduto').disabled = Boolean(p);
  $('idProduto').value = p?.id || '';
  $('nomeProduto').value = p?.nome || '';
  $('tipoProduto').value = p?.tipo || 'FISICO';
  $('estadoProduto').value = p?.estado || 'RASCUNHO';
  $('precoProduto').value = p?.precoCentavos ? (p.precoCentavos / 100).toFixed(2) : '';
  $('descricaoProduto').value = p?.descricao || '';
  $('fotosProduto').value = p?.fotos?.join('\n') || '';
  $('videoProduto').value = p?.videoApresentacaoUrl || '';
  $('detalhesProduto').value = p?.detalhes?.join('\n') || '';
  atualizarCalculadoraAdmin();
  $('akitemmSalvarElegibilidade').disabled=!p;
  $('akitemmStatusElegibilidade').textContent=p?'Consultando autorização do LOOP…':'Salve o produto antes de autorizar.';
  if(p)carregarElegibilidadeAkitemm(p.id).catch(e=>{
   $('akitemmStatusElegibilidade').textContent=e.message;
  });
}

function montarProduto() {
  const tipo = $('tipoProduto').value;
  return {
    id: $('idProduto').value.trim(),
    nome: $('nomeProduto').value.trim(),
    tipo,
    estado: $('estadoProduto').value,
    descricao: $('descricaoProduto').value.trim(),
    precoCentavos: precoCentavos($('precoProduto').value),
    entrega: tipo === 'PDF' ? 'DOWNLOAD_APOS_CONFIRMACAO' : 'FORNECEDOR_INTEGRADO',
    fotos: linhas($('fotosProduto').value),
    videoApresentacaoUrl: $('videoProduto').value.trim() || null,
    detalhes: linhas($('detalhesProduto').value)
  };
}

async function abrirProduto(id) {
  try {
    const dado = await requisitar('/produtos/' + encodeURIComponent(id));
    editarFormulario(dado);
    await carregarHistorico(id);
    if (dado.produto.tipo === 'FISICO') await carregarFornecedor(id);
    mensagem('Editando ' + id + ' — revisão ' + dado.revisao + '.');
  } catch (erro) { mensagem(erro.message); }
}

async function atualizarProdutos() {
  const dados = await requisitar('/produtos');
  produtosPainelAdmin=dados.produtos;
  const lista = $('listaAdmin');
  lista.replaceChildren();
  if (!dados.produtos.length) {
    const aviso = document.createElement('p');
    aviso.className = 'ajuda';
    aviso.textContent = 'Nenhum produto cadastrado neste banco local.';
    lista.appendChild(aviso);
  }
  for (const p of dados.produtos) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = p.nome + ' — ' + p.estado;
    botao.addEventListener('click', () => abrirProduto(p.id));
    lista.appendChild(botao);
  }
}

async function conectar() {
  const texto = $('adminToken').value;
  if (texto.length < 32) {
    mensagem('Informe a chave local de pelo menos 32 caracteres.');
    return;
  }
  chaveTemporaria = texto;
  $('adminToken').value = '';
  try {
    await atualizarProdutos();
    $('navAdminCentral').hidden=false;
    mostrarAbaAdmin('inicio');
    await atualizarDiagnosticoAdmin();
    editarFormulario(null);
    try { await carregarPedidosDemo(); }
    catch(erro) { mensagemPedidoDemo(erro.message); }
    try { await carregarDistribuidoresDemo(); }
    catch (erro) { $('statusImportacao').textContent = erro.message; }
    mensagem('Painel de teste aberto. Compras continuam desativadas.');
  } catch (erro) {
    chaveTemporaria = '';
    $('navAdminCentral').hidden = true;
    $('areaVisaoAdmin').hidden = true;
    $('areaPainel').hidden = true;
    $('areaImportacao').hidden = true;
    $('areaPedidosDemo').hidden = true;
    $('areaVitrineAkitemm').hidden = true;
    limparPedidosDemo();
    limparPreviaImportacao();
    mensagem(erro.message);
  }
}

async function salvar(evento) {
  evento.preventDefault();
  try {
    const produto = montarProduto();
    let resultado;
    if (registroEditando) {
      const { id, ...alteracoes } = produto;
      resultado = await requisitar('/produtos/' + encodeURIComponent(registroEditando.id), {
        method:'PATCH',
        body:JSON.stringify({revisaoEsperada:registroEditando.revisao,alteracoes})
      });
    } else {
      resultado = await requisitar('/produtos', {
        method:'POST',body:JSON.stringify(produto)
      });
    }
    await atualizarProdutos();
    await atualizarDiagnosticoAdmin();
    await abrirProduto(resultado.id);
    mensagem('Produto salvo com sucesso na revisão ' + resultado.revisao + '.');
  } catch (erro) { mensagem(erro.message); }
}

async function carregarFornecedor(produtoId) {
  const rota = '/produtos/' + encodeURIComponent(produtoId) + '/fornecedor';
  const [registro, eventos] = await Promise.all([
    requisitar(rota),
    requisitar(rota + '/historico')
  ]);
  const vinculo = registro.vinculo;
  revisaoFornecedor = vinculo?.revisao || 0;
  fornecedorAtivo = Boolean(vinculo?.ativo);
  $('codigoFornecedor').value = fornecedorAtivo ? vinculo.fornecedorId : '';
  $('codigoSKU').value = fornecedorAtivo ? vinculo.sku : '';
  $('statusFornecedor').textContent = fornecedorAtivo
    ? 'Fornecedor associado: ' + vinculo.fornecedorId +
      ' / SKU ' + vinculo.sku + ' (revisão ' + revisaoFornecedor + ')'
    : 'Sem fornecedor ativo (revisão ' + revisaoFornecedor + ').';
  $('desativarFornecedor').disabled = !fornecedorAtivo;
  const historico = $('historicoFornecedor');
  historico.replaceChildren();
  for (const evento of eventos.eventos) {
    const linha = document.createElement('li');
    const anterior = evento.antes
      ? evento.antes.fornecedorId + ' / ' + evento.antes.sku : 'nenhum';
    const posterior = evento.depois
      ? evento.depois.fornecedorId + ' / ' + evento.depois.sku : 'nenhum';
    linha.textContent = 'Revisão ' + evento.revisao + ' — ' + evento.acao +
      ' — ' + anterior + ' → ' + posterior;
    historico.appendChild(linha);
  }
  $('areaFornecedor').hidden = false;
}

async function salvarFornecedor(evento) {
  evento.preventDefault();
  if (!registroEditando || $('tipoProduto').value !== 'FISICO') return;
  const botao = $('salvarFornecedor');
  botao.disabled = true;
  try {
    const id = registroEditando.id;
    const rota = '/produtos/' + encodeURIComponent(id) + '/fornecedor';
    await requisitar(rota, {
      method:'PUT',
      body:JSON.stringify({
        fornecedorId:$('codigoFornecedor').value.trim(),
        sku:$('codigoSKU').value.trim(),
        revisaoEsperada:revisaoFornecedor
      })
    });
    await carregarFornecedor(id);
    mensagem('Vínculo do fornecedor salvo. Produto LOOP preservado.');
  } catch (erro) {
    mensagem(erro.message);
  } finally {
    botao.disabled = false;
  }
}

async function desativarFornecedor() {
  if (!registroEditando || !fornecedorAtivo) return;
  const botao=$('desativarFornecedor');
  botao.disabled=true;
  try {
    const id=registroEditando.id;
    await requisitar('/produtos/' + encodeURIComponent(id) + '/fornecedor/desativar', {
      method:'POST',
      body:JSON.stringify({revisaoEsperada:revisaoFornecedor})
    });
    await carregarFornecedor(id);
    mensagem('Fornecedor desativado. O produto continua cadastrado.');
  } catch (erro) {
    mensagem(erro.message);
  } finally {
    botao.disabled = !fornecedorAtivo;
  }
}


async function carregarElegibilidadeAkitemm(id){
 const x=await requisitar('/carrinho-loop-demo/elegibilidade');
 const p=x.produtos.find(x=>x.produtoId===id);
 if(!p)throw Error('Produto sem configuração disponível');
 revisaoElegibilidadeAkitemm=p.revisaoElegibilidade;
 $('akitemmElegivelLoop').checked=p.elegivelLoop;
 $('akitemmSalvarElegibilidade').disabled=false;
 $('akitemmStatusElegibilidade').textContent='Atual: '+(p.elegivelLoop?'Autoriza LOOP (borda verde)':'Compra comum (borda neutra)')+'. Revisão '+p.revisaoElegibilidade+'.';
}
async function salvarElegibilidadeAkitemm(){
 if(!registroEditando)return;
 const id=registroEditando.id;
 try{
  await requisitar('/carrinho-loop-demo/elegibilidade',{
   method:'POST',body:JSON.stringify({produtoId:id,
    elegivelLoop:$('akitemmElegivelLoop').checked,revisaoEsperada:revisaoElegibilidadeAkitemm})
  });
  await carregarElegibilidadeAkitemm(id);
  mensagem('Autorização LOOP atualizada SOMENTE para pedidos futuros.');
 }catch(e){$('akitemmStatusElegibilidade').textContent=e.message;}
}
const camposAkitemm={sobre:'akitemmTextoSobre',privacidade:'akitemmTextoPrivacidade',
 trocas:'akitemmTextoTrocas',contato:'akitemmTextoContato',suporte:'akitemmTextoSuporte'};
async function carregarVitrineAkitemm(){
 const d=await requisitar('/akitemm-config-demo');const c=d.config;
 $('akitemmBannerLinhas').value=c.banners.map(b=>
  [b.titulo,b.descricao,b.imagemCaminho,b.produtoId].join(' | ')).join('\n');
 $('akitemmOfertaIds').value=c.ofertas.join('\n');
 for(const [nome,id] of Object.entries({
  instagram:'akitemmLinkInstagram',youtube:'akitemmLinkYoutube',
  facebook:'akitemmLinkFacebook',whatsapp:'akitemmLinkWhatsapp'
 }))$(id).value=c.redes[nome]||'';
 for(const [nome,id] of Object.entries(camposAkitemm))$(id).value=c.informacoes[nome]||'';
 $('akitemmStatusVitrine').textContent='Configuração da vitrine carregada do SQLite.';
}
async function salvarVitrineAkitemm(ev){
 ev.preventDefault();
 try{
  const linhas=linhasAkitemm($('akitemmBannerLinhas').value);
  if(linhas.length>8)throw Error('No máximo 8 banners.');
  const banners=linhas.map(l=>{
   const parts=l.split('|').map(v=>v.trim());
   if(parts.length!==4)throw Error('Cada banner exige: título | descrição | imagem | ID do produto (campos finais vazios permitidos).');
   return {titulo:parts[0],descricao:parts[1],imagemCaminho:parts[2],produtoId:parts[3]};
  });
  const c={banners,ofertas:linhasAkitemm($('akitemmOfertaIds').value),
   redes:{
    instagram:$('akitemmLinkInstagram').value.trim(),
    youtube:$('akitemmLinkYoutube').value.trim(),
    facebook:$('akitemmLinkFacebook').value.trim(),
    whatsapp:$('akitemmLinkWhatsapp').value.trim()
   },informacoes:Object.fromEntries(Object.entries(camposAkitemm).map(([k,id])=>[k,$(id).value.trim()]))};
  await requisitar('/akitemm-config-demo',{method:'POST',body:JSON.stringify(c)});
  $('akitemmStatusVitrine').textContent='Vitrine salva e pronta para aparecer no próximo carregamento da loja.';
 }catch(e){$('akitemmStatusVitrine').textContent=e.message;}
}
function linhasAkitemm(texto){return texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);}

$('formFornecedor').addEventListener('submit', salvarFornecedor);
$('desativarFornecedor').addEventListener('click', desativarFornecedor);

for(const botao of document.querySelectorAll('[data-aba-admin]')){
 botao.addEventListener('click',()=>mostrarAbaAdmin(botao.dataset.abaAdmin));
 botao.addEventListener('keydown',evento=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(evento.key))return;
  evento.preventDefault();
  const nomes=Object.keys(ABAS_ADMIN);
  const i=nomes.indexOf(botao.dataset.abaAdmin);
  const proximo=evento.key==='Home'?0:evento.key==='End'?nomes.length-1:
   (i+(evento.key==='ArrowRight'?1:-1)+nomes.length)%nomes.length;
  mostrarAbaAdmin(nomes[proximo]);
  $(ABAS_ADMIN[nomes[proximo]].botao).focus();
 });
}
$('conectarAdmin').addEventListener('click', conectar);
$('sairAdmin').addEventListener('click', () => {
  chaveTemporaria = '';
  registroEditando = null;
  $('adminToken').value = '';
  $('navAdminCentral').hidden = true;
  $('areaVisaoAdmin').hidden = true;
  $('areaPainel').hidden = true;
  $('areaImportacao').hidden = true;
  $('areaPedidosDemo').hidden = true;
  $('areaVitrineAkitemm').hidden = true;
  limparPedidosDemo();
  limparPreviaImportacao();
  $('areaFornecedor').hidden = true;
  $('historicoFornecedor').replaceChildren();
  mensagem('Chave removida da memória desta página.');
});
$('novoProduto').addEventListener('click', () => { mostrarAbaAdmin('produtos'); editarFormulario(null); mensagem('Novo produto em rascunho.'); });
$('cancelarEdicao').addEventListener('click', () => editarFormulario(null));
$('atualizarLista').addEventListener('click', async () => {
  try { await atualizarProdutos(); mensagem('Lista atualizada.'); }
  catch (erro) { mensagem(erro.message); }
});
$('formProduto').addEventListener('submit', salvar);
$('akitemmSalvarElegibilidade').addEventListener('click',salvarElegibilidadeAkitemm);

async function atualizarAvaliacoesAdmin(){
 const r=await requisitar('/akitemm-avaliacoes-demo');
 const destino=$('akitemmListaModeracao');destino.replaceChildren();
 if(!r.pendentes.length){
  const aviso=document.createElement('p');aviso.textContent='Nenhuma avaliação pendente.';
  aviso.className='ajuda';destino.append(aviso);return;
 }
 for(const av of r.pendentes){
  const box=document.createElement('article');box.className='historico-admin';
  const titulo=document.createElement('strong');
  titulo.textContent='Avaliação #'+av.id+' · produto '+av.produtoId+' · '+av.nota+' estrela(s)';
  const texto=document.createElement('p');texto.textContent=av.comentario;
  const label=document.createElement('label');label.textContent='Imagem autorizada opcional (caminho local):';
  const input=document.createElement('input');input.placeholder='/imagens/catalogo/depoimento.webp';input.maxLength=180;
  label.append(input);
  const aprovar=document.createElement('button');aprovar.type='button';aprovar.textContent='Aprovar';
  const rejeitar=document.createElement('button');rejeitar.type='button';rejeitar.textContent='Rejeitar';
  for(const [botao,status] of [[aprovar,'APROVADA'],[rejeitar,'REJEITADA']]){
   botao.addEventListener('click',async()=>{
    try{
     await requisitar('/akitemm-avaliacoes-demo/moderar',{
      method:'POST',body:JSON.stringify({id:av.id,status,imagemCaminho:input.value.trim()||null})
     });
     $('akitemmStatusModeracao').textContent='Avaliação #'+av.id+' analisada.';
     await atualizarAvaliacoesAdmin();
    }catch(e){$('akitemmStatusModeracao').textContent=e.message;}
   });
  }
  box.append(titulo,texto,label,aprovar,rejeitar);destino.append(box);
 }
}
$('akitemmRegistrarEntregaDemo').addEventListener('click',async()=>{
 try{
  const pedidoId=$('akitemmIdPedidoEntrega').value.trim();
  const r=await requisitar('/akitemm-avaliacoes-demo/entregas',{
   method:'POST',body:JSON.stringify({pedidoId})
  });
  $('akitemmStatusModeracao').textContent=r.repetido?
   'Entrega fictícia já registrada.':'Entrega fictícia registrada. Não é entrega real.';
 }catch(e){$('akitemmStatusModeracao').textContent=e.message;}
});
$('akitemmAtualizarAvaliacoes').addEventListener('click',()=>atualizarAvaliacoesAdmin().catch(e=>{
 $('akitemmStatusModeracao').textContent=e.message;
}));

$('akitemmConfigAdminForm').addEventListener('submit',salvarVitrineAkitemm);
$('akitemmRecarregarVitrine').addEventListener('click',()=>carregarVitrineAkitemm().catch(e=>{$('akitemmStatusVitrine').textContent=e.message;}));
$('abaAdminVitrineAkitemm').addEventListener('click',()=>carregarVitrineAkitemm().catch(e=>{$('akitemmStatusVitrine').textContent=e.message;}));
$('atualizarDiagnosticoAdmin').addEventListener('click',()=>{
 atualizarDiagnosticoAdmin().catch(e=>{
  $('mensagemDiagnosticoAdmin').textContent=e.message;
 });
});
for(const id of ['precoProduto','quantidadeCalcAdmin','custoUnitarioCalcAdmin']){
 $(id).addEventListener('input',atualizarCalculadoraAdmin);
}

