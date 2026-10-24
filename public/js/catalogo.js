'use strict';

function precoCatalogo(precoCentavos) {
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) {
    return 'Preço a definir';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(precoCentavos / 100);
}

function criarCardProduto(produto) {
  const card = document.createElement('article');
  card.className = 'produto-card';

  const imagem = document.createElement('div');
  imagem.className = 'produto-imagem';
  if (produto.fotos && produto.fotos.length) {
    const foto = document.createElement('img');
    foto.src = produto.fotos[0];
    foto.alt = 'Foto de ' + produto.nome;
    foto.loading = 'lazy';
    imagem.appendChild(foto);
  } else {
    imagem.textContent = produto.tipo === 'PDF' ? '📄 Capa do curso' : '📷 Foto do produto';
  }

  const tipo = document.createElement('span');
  tipo.className = 'produto-tipo';
  tipo.textContent = produto.tipo === 'PDF' ? 'Curso em PDF' : 'Produto físico';

  const titulo = document.createElement('h3');
  titulo.textContent = produto.nome;

  const descricao = document.createElement('p');
  descricao.textContent = produto.descricao;

  const preco = document.createElement('strong');
  preco.className = 'produto-preco';
  preco.textContent = precoCatalogo(produto.precoCentavos);

  const detalhes = document.createElement('a');
  detalhes.className = 'produto-link';
  detalhes.href = '/produto.html?id=' + encodeURIComponent(produto.id);
  detalhes.textContent = 'Ver informações';

  card.append(imagem, tipo, titulo, descricao, preco, detalhes);
  return card;
}

async function carregarCatalogo() {
  const destino = document.getElementById('catalogoProdutos');
  if (!destino) return;

  try {
    const resposta = await fetch('/catalogo');
    if (!resposta.ok) throw new Error('Vitrine indisponivel');
    const dados = await resposta.json();
    const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
    destino.replaceChildren();
    if (produtos.length === 0) {
      const mensagem = document.createElement('p');
      mensagem.textContent = 'Estamos preparando os produtos do LOOP.';
      destino.appendChild(mensagem);
      return;
    }
    produtos.forEach(produto => destino.appendChild(criarCardProduto(produto)));
  } catch {
    destino.textContent = 'Não foi possível carregar a vitrine agora.';
  }
}

if (document.getElementById('catalogoProdutos')) carregarCatalogo();
