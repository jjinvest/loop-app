'use strict';

// Repositorio substituivel: hoje em memoria, futuramente SQLite/PostgreSQL.
// Nao armazena fotos ou arquivos PDF; registra apenas seus caminhos autorizados.
const { validarProduto } = require('./catalogo');

function copia(p) {
  return {
    ...p,
    fotos: [...p.fotos],
    detalhes: [...p.detalhes]
  };
}

class RepositorioCatalogoMemoria {
  constructor({ produtos = [] } = {}) {
    this.registros = new Map();
    for (const produto of produtos) this.salvar(produto);
  }

  listar() {
    return [...this.registros.values()].map(copia);
  }

  buscar(id) {
    const produto = this.registros.get(id);
    return produto ? copia(produto) : null;
  }

  salvar(produto) {
    const validado = validarProduto(produto);
    this.registros.set(validado.id, copia(validado));
    return copia(validado);
  }

  atualizar(id, alteracoes = {}) {
    const original = this.registros.get(id);
    if (!original) return null;
    const modificado = validarProduto({ ...original, ...alteracoes, id });
    this.registros.set(id, copia(modificado));
    return copia(modificado);
  }
}

module.exports = { RepositorioCatalogoMemoria };
