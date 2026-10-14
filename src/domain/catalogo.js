'use strict';

// Catalogo demonstrativo, somente leitura. Nenhum item representa mercadoria
// em estoque, preco ofertado ou compra habilitada.
const TIPOS = Object.freeze(['FISICO', 'PDF']);
const ESTADOS = Object.freeze(['RASCUNHO', 'PUBLICADO', 'DEMONSTRACAO']);
const TIPOS_ENTREGA = Object.freeze({ FISICO: 'TRANSPORTADORA', PDF: 'DOWNLOAD_APOS_CONFIRMACAO' });

function validarProduto(produto) {
  if (!produto || typeof produto !== 'object' || Array.isArray(produto)) {
    throw new Error('Produto invalido');
  }
  if (typeof produto.id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(produto.id)) {
    throw new Error('Identificador de produto invalido');
  }
  if (typeof produto.nome !== 'string' || !produto.nome.trim() || produto.nome.length > 150) {
    throw new Error('Nome do produto invalido');
  }
  if (!TIPOS.includes(produto.tipo) || !ESTADOS.includes(produto.estado)) {
    throw new Error('Tipo ou estado do produto invalido');
  }
  if (typeof produto.descricao !== 'string' || !produto.descricao.trim() || produto.descricao.length > 2000) {
    throw new Error('Descricao do produto invalida');
  }
  if (produto.entrega !== TIPOS_ENTREGA[produto.tipo]) {
    throw new Error('Tipo de entrega nao corresponde ao produto');
  }
  const preco = produto.precoCentavos;
  if (produto.estado === 'PUBLICADO' && (!Number.isSafeInteger(preco) || preco <= 0)) {
    throw new Error('Produto publicado precisa de preco positivo em centavos');
  }
  if (preco !== null && (!Number.isSafeInteger(preco) || preco <= 0)) {
    throw new Error('Preco invalido');
  }
  if (!Array.isArray(produto.fotos) || produto.fotos.length > 10 ||
      produto.fotos.some(foto => typeof foto !== 'string' || !/^\/imagens\/catalogo\/[a-z0-9-_]+\.(?:jpg|jpeg|png|webp)$/.test(foto))) {
    throw new Error('Fotos devem usar caminhos locais seguros');
  }
  if (produto.videoApresentacaoUrl !== null) {
    if (typeof produto.videoApresentacaoUrl !== 'string') throw new Error('Video invalido');
    let url;
    try { url = new URL(produto.videoApresentacaoUrl); }
    catch { throw new Error('Video invalido'); }
    if (url.protocol !== 'https:' ||
      !['www.youtube.com','youtube.com','youtu.be','vimeo.com','www.vimeo.com'].includes(url.hostname)) {
      throw new Error('Somente links HTTPS de plataformas de video aprovadas');
    }
  }
  if (!Array.isArray(produto.detalhes) || produto.detalhes.length > 12 ||
      produto.detalhes.some(v => typeof v !== 'string' || !v.trim() || v.length > 180)) {
    throw new Error('Detalhes do produto invalidos');
  }
  return {
    id: produto.id,
    nome: produto.nome.trim(),
    tipo: produto.tipo,
    estado: produto.estado,
    descricao: produto.descricao.trim(),
    precoCentavos: preco,
    entrega: produto.entrega,
    fotos: [...produto.fotos],
    videoApresentacaoUrl: produto.videoApresentacaoUrl,
    detalhes: [...produto.detalhes],
    compraDisponivel: false // Nenhum checkout existe nesta etapa
  };
}

const MODELOS = [
  {
    id: 'modelo-curso-pdf',
    nome: 'Curso em PDF — modelo demonstrativo',
    tipo: 'PDF',
    estado: 'DEMONSTRACAO',
    descricao: 'Exemplo da futura vitrine de cursos digitais do LOOP. Nenhum curso real esta sendo vendido aqui.',
    precoCentavos: null,
    entrega: 'DOWNLOAD_APOS_CONFIRMACAO',
    fotos: [],
    videoApresentacaoUrl: null,
    detalhes: ['Arquivo PDF para baixar apos a compra confirmada', 'Sem hospedagem de videoaulas', 'Descricao, capa e preco serao cadastrados pelo administrador']
  },
  {
    id: 'modelo-produto-fisico',
    nome: 'Produto fisico — modelo demonstrativo',
    tipo: 'FISICO',
    estado: 'DEMONSTRACAO',
    descricao: 'Modelo de pagina para mercadorias com fotos, caracteristicas, preco, entrega e video opcional de apresentacao.',
    precoCentavos: null,
    entrega: 'TRANSPORTADORA',
    fotos: [],
    videoApresentacaoUrl: null,
    detalhes: ['Galeria de fotografias do produto', 'Caracteristicas e descricao detalhada', 'Entrega no endereco do cliente apos compra confirmada']
  }
].map(validarProduto);

function listarCatalogo() {
  return MODELOS.map(p => ({ ...p, fotos: [...p.fotos], detalhes: [...p.detalhes] }));
}
function buscarProduto(id) {
  return listarCatalogo().find(p => p.id === id) || null;
}

module.exports = { TIPOS, ESTADOS, TIPOS_ENTREGA, validarProduto, listarCatalogo, buscarProduto };
