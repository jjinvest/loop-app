'use strict';

// Chave mantida somente em memoria. Sem localStorage, cookies ou log.
let chaveTemporaria = '';
let registroEditando = null;

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
    if (resposta.status === 409) throw new Error('Este produto foi alterado em outra tela. Recarregue antes de salvar.');
    if (resposta.status === 401 || resposta.status === 403) throw new Error('Chave incorreta ou acesso local não permitido.');
    throw new Error(dados.mensagem || dados.erro || 'Não foi possível concluir a operação.');
  }
  return dados;
}

function editarFormulario(registro) {
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

$('conectarAdmin').addEventListener('click', conectar);
$('sairAdmin').addEventListener('click', () => {
  chaveTemporaria = '';
  registroEditando = null;
  $('adminToken').value = '';
  $('areaPainel').hidden = true;
  mensagem('Chave removida da memória desta página.');
});
$('novoProduto').addEventListener('click', () => { editarFormulario(null); mensagem('Novo produto em rascunho.'); });
$('cancelarEdicao').addEventListener('click', () => editarFormulario(null));
$('atualizarLista').addEventListener('click', async () => {
  try { await atualizarProdutos(); mensagem('Lista atualizada.'); }
  catch (erro) { mensagem(erro.message); }
});
$('formProduto').addEventListener('submit', salvar);
