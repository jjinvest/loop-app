'use strict';

// Tela de importacao exclusivamente ficticia. Usa requisitar() com a
// chave temporaria do painel, sem guardar token ou aceitar URLs externas.
let previaImportacao = null;
let importacaoOcupada = false;

function statusDaImportacao(texto) {
  $('statusImportacao').textContent = texto;
}
function atualizarBotaoImportar() {
  $('confirmarImportacao').disabled =
    !previaImportacao || !$('aceitarImportacao').checked || importacaoOcupada;
}
function limparPreviaImportacao() {
  previaImportacao = null;
  $('aceitarImportacao').checked = false;
  $('aceitarImportacao').disabled = true;
  $('listaPreviaImportacao').replaceChildren();
  atualizarBotaoImportar();
}

async function carregarDistribuidoresDemo() {
  limparPreviaImportacao();
  const resultado = await requisitar('/importacao/fornecedores');
  const seletor = $('fornecedorImportacao');
  seletor.replaceChildren();
  const aviso = document.createElement('option');
  aviso.value = '';
  aviso.textContent = 'Selecione um distribuidor de testes';
  seletor.appendChild(aviso);
  for (const f of resultado.fornecedores) {
    if (!f.demonstrativo) continue;
    const option = document.createElement('option');
    option.value = f.id;
    option.textContent = f.nome;
    seletor.appendChild(option);
  }
  statusDaImportacao('Selecione um distribuidor fictício e confira os produtos.');
}

function desenharPreviaImportacao(previa) {
  const area = $('listaPreviaImportacao');
  area.replaceChildren();
  const titulo = document.createElement('p');
  titulo.textContent = 'Itens encontrados: ' + previa.itens.length +
    '. Estes dados ainda não foram gravados.';
  area.appendChild(titulo);
  const lista = document.createElement('ol');
  for (const item of previa.itens) {
    const linha = document.createElement('li');
    linha.textContent = item.nomeSugerido + ' — SKU ' + item.sku +
      ' — ' + (item.situacao === 'NOVO_RASCUNHO' ? 'Novo rascunho' :
      item.situacao === 'JA_CADASTRADO' ? 'Já cadastrado (sem alteração)' :
      'Vínculo pendente de revisão manual');
    lista.appendChild(linha);
  }
  area.appendChild(lista);
}

async function consultarPreviaImportacao() {
  if (importacaoOcupada) return;
  const fornecedorId = $('fornecedorImportacao').value;
  limparPreviaImportacao();
  if (!fornecedorId) {
    statusDaImportacao('Escolha um distribuidor fictício primeiro.');
    return;
  }
  importacaoOcupada = true;
  $('verPreviaImportacao').disabled = true;
  try {
    const dados = await requisitar('/importacao/previa', {
      method: 'POST',
      body: JSON.stringify({ fornecedorId })
    });
    if (dados.fornecedorId !== fornecedorId ||
        typeof dados.revisaoLote !== 'string' ||
        !/^[a-f0-9]{64}$/.test(dados.revisaoLote) ||
        !Array.isArray(dados.itens)) {
      throw new Error('Resposta de prévia inválida.');
    }
    previaImportacao = { fornecedorId, revisaoLote:dados.revisaoLote };
    desenharPreviaImportacao(dados);
    $('aceitarImportacao').disabled = dados.itens.length === 0;
    statusDaImportacao('Confira os itens e autorize apenas se estiver de acordo.');
  } catch (erro) {
    limparPreviaImportacao();
    statusDaImportacao(erro.message);
  } finally {
    importacaoOcupada = false;
    $('verPreviaImportacao').disabled = false;
    atualizarBotaoImportar();
  }
}

async function aplicarPreviaImportacao() {
  if (importacaoOcupada || !previaImportacao || !$('aceitarImportacao').checked) return;
  const plano = { ...previaImportacao };
  if ($('fornecedorImportacao').value !== plano.fornecedorId) {
    limparPreviaImportacao();
    statusDaImportacao('O fornecedor mudou. Faça outra prévia.');
    return;
  }
  importacaoOcupada = true;
  atualizarBotaoImportar();
  $('verPreviaImportacao').disabled = true;
  try {
    const resultado = await requisitar('/importacao/aplicar', {
      method: 'POST',
      body: JSON.stringify({
        fornecedorId: plano.fornecedorId,
        revisaoLote: plano.revisaoLote,
        confirmacao: 'IMPORTAR_RASCUNHOS_SIMULADOS'
      })
    });
    limparPreviaImportacao();
    let avisoLista = '';
    try { await atualizarProdutos(); }
    catch { avisoLista = ' A lista lateral não atualizou; use Atualizar lista.'; }
    statusDaImportacao('Importação de testes concluída: ' + resultado.criados +
      ' novos rascunhos, ' + resultado.ignorados + ' já cadastrados, ' +
      (resultado.pendentesVinculo || 0) + ' vínculos para revisão manual. Nenhum produto foi colocado à venda.' + avisoLista);
  } catch (erro) {
    limparPreviaImportacao();
    statusDaImportacao('Importação não realizada. Faça nova prévia. ' + erro.message);
  } finally {
    importacaoOcupada = false;
    $('verPreviaImportacao').disabled = false;
    atualizarBotaoImportar();
  }
}

$('fornecedorImportacao').addEventListener('change', () => {
  limparPreviaImportacao();
  statusDaImportacao('Fornecedor alterado. Confira novamente a prévia.');
});
$('aceitarImportacao').addEventListener('change', atualizarBotaoImportar);
$('verPreviaImportacao').addEventListener('click', consultarPreviaImportacao);
$('limparPreviaImportacao').addEventListener('click', () => {
  limparPreviaImportacao();
  statusDaImportacao('Prévia descartada. Nenhum cadastro alterado.');
});
$('confirmarImportacao').addEventListener('click', aplicarPreviaImportacao);
