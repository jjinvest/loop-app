'use strict';

// Chave mantida somente em memoria. Sem localStorage, cookies ou log.
let chaveTemporaria = '';
let registroEditando = null;
let revisaoFornecedor = 0;
let fornecedorAtivo = false;

const $ = id => document.getElementById(id);
const mensagem = texto => { $('mensagemAdmin').textContent = texto; };

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
    $('areaPainel').hidden = false;
    editarFormulario(null);
    mensagem('Painel de teste aberto. Compras continuam desativadas.');
  } catch (erro) {
    chaveTemporaria = '';
    $('areaPainel').hidden = true;
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

$('formFornecedor').addEventListener('submit', salvarFornecedor);
$('desativarFornecedor').addEventListener('click', desativarFornecedor);

$('conectarAdmin').addEventListener('click', conectar);
$('sairAdmin').addEventListener('click', () => {
  chaveTemporaria = '';
  registroEditando = null;
  $('adminToken').value = '';
  $('areaPainel').hidden = true;
  $('areaFornecedor').hidden = true;
  $('historicoFornecedor').replaceChildren();
  mensagem('Chave removida da memória desta página.');
});
$('novoProduto').addEventListener('click', () => { editarFormulario(null); mensagem('Novo produto em rascunho.'); });
$('cancelarEdicao').addEventListener('click', () => editarFormulario(null));
$('atualizarLista').addEventListener('click', async () => {
  try { await atualizarProdutos(); mensagem('Lista atualizada.'); }
  catch (erro) { mensagem(erro.message); }
});
$('formProduto').addEventListener('submit', salvar);
