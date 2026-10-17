'use strict';

function criarElemento(tag, texto, classe) {
  const el = document.createElement(tag);
  if (texto !== undefined) el.textContent = texto;
  if (classe) el.className = classe;
  return el;
}

function dinheiro(precoCentavos) {
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) return 'Preço a definir';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(precoCentavos / 100);
}

function mostrarFoto(principal, caminho, nome) {
  principal.replaceChildren();
  const foto = document.createElement('img');
  foto.src = caminho;
  foto.alt = 'Foto de ' + nome;
  foto.loading = 'lazy';
  principal.appendChild(foto);
}

function preencherProduto(produto) {
  document.getElementById('produtoTipo').textContent =
    produto.tipo === 'PDF' ? 'Curso digital em PDF' : 'Produto físico';
  document.getElementById('tituloProduto').textContent = produto.nome;
  document.getElementById('produtoDescricao').textContent = produto.descricao;
  document.getElementById('produtoPreco').textContent = dinheiro(produto.precoCentavos);
  document.getElementById('produtoEntrega').textContent = produto.tipo === 'PDF'
    ? 'Entrega digital: download do PDF após confirmação do pagamento, quando as vendas forem habilitadas.'
    : 'Entrega física: o parceiro fornecedor cuidará do envio e a loja acompanhará o pedido, após a integração ser autorizada.';

  const lista = document.getElementById('produtoCaracteristicas');
  lista.replaceChildren();
  (produto.detalhes || []).forEach(detalhe =>
    lista.appendChild(criarElemento('li', detalhe))
  );

  const principal = document.getElementById('produtoFotoPrincipal');
  const miniaturas = document.getElementById('produtoMiniaturas');
  principal.replaceChildren();
  miniaturas.replaceChildren();
  if (Array.isArray(produto.fotos) && produto.fotos.length) {
    mostrarFoto(principal, produto.fotos[0], produto.nome);
    produto.fotos.forEach((caminho, i) => {
      const botao = criarElemento('button', 'Foto ' + (i + 1), 'produto-miniatura');
      botao.type = 'button';
      botao.addEventListener('click', () => mostrarFoto(principal, caminho, produto.nome));
      miniaturas.appendChild(botao);
    });
  } else {
    principal.appendChild(criarElemento('span',
      produto.tipo === 'PDF' ? '📄 Capa do curso' : '📷 Fotos do produto',
      'produto-sem-foto'));
  }

  const video = document.getElementById('produtoVideo');
  video.replaceChildren();
  if (produto.videoApresentacaoUrl) {
    const link = criarElemento('a', '▶ Assistir à apresentação do produto');
    link.href = produto.videoApresentacaoUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    video.appendChild(link);
  }
  document.getElementById('produtoDetalhes').hidden = false;
}

async function carregarDetalhe() {
  const status = document.getElementById('produtoStatus');
  if (!status) return;
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id || !/^[a-z0-9-]{3,80}$/.test(id)) {
    status.textContent = 'Produto não encontrado.';
    return;
  }
  try {
    const resposta = await fetch('/catalogo/' + encodeURIComponent(id));
    if (!resposta.ok) throw new Error('Produto indisponivel');
    const dados = await resposta.json();
    preencherProduto(dados.produto);
    status.textContent = '';
  } catch {
    status.textContent = 'Não foi possível carregar as informações do produto.';
  }
}
carregarDetalhe();
