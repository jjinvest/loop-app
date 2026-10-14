'use strict';

// Contrato versionado para futuras APIs de dropshipping.
// Este registro so consulta dados internos/simulados; nao transmite pedidos
// nem enderecos, nao tem credenciais e nao faz chamadas HTTP.
// Adaptadores podem implementar listarProdutos() como capacidade OPCIONAL;
// os metodos de estoque/status do contrato v1 permanecem inalterados.
const CONTRATO_FORNECEDOR = 1;

function codigo(x, campo) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(x)) {
    throw new Error(campo + ' invalido');
  }
  return x;
}

class RegistroFornecedores {
  constructor() {
    this.adaptadores = new Map();
  }

  registrar({ fornecedorId, adaptador } = {}) {
    codigo(fornecedorId,'fornecedorId');
    if (!adaptador || adaptador.versaoContrato !== CONTRATO_FORNECEDOR ||
        typeof adaptador.consultarEstoque !== 'function' ||
        typeof adaptador.consultarStatus !== 'function') {
      throw new Error('Adaptador nao atende ao contrato v1');
    }
    if (this.adaptadores.has(fornecedorId)) {
      throw new Error('Fornecedor ja cadastrado; use substituir de forma explicita');
    }
    this.adaptadores.set(fornecedorId, adaptador);
  }

  substituir({ fornecedorId, adaptador } = {}) {
    codigo(fornecedorId,'fornecedorId');
    if (!this.adaptadores.has(fornecedorId)) throw new Error('Fornecedor nao encontrado');
    if (!adaptador || adaptador.versaoContrato !== CONTRATO_FORNECEDOR ||
        typeof adaptador.consultarEstoque !== 'function' ||
        typeof adaptador.consultarStatus !== 'function') {
      throw new Error('Adaptador nao atende ao contrato v1');
    }
    this.adaptadores.set(fornecedorId, adaptador);
  }

  obter(fornecedorId) {
    codigo(fornecedorId,'fornecedorId');
    const adapter = this.adaptadores.get(fornecedorId);
    if (!adapter) throw new Error('Fornecedor nao cadastrado');
    return adapter;
  }

  async consultarEstoque({ fornecedorId, sku } = {}) {
    codigo(sku,'sku');
    const resposta = await this.obter(fornecedorId).consultarEstoque({ sku });
    if (!resposta || typeof resposta !== 'object' ||
        !Number.isSafeInteger(resposta.quantidade) || resposta.quantidade < 0) {
      throw new Error('Fornecedor retornou estoque invalido');
    }
    return {
      fornecedorId,
      sku,
      quantidade: resposta.quantidade,
      disponivel: resposta.quantidade > 0
    };
  }

  async consultarStatus({ fornecedorId, pedidoParceiroId } = {}) {
    codigo(pedidoParceiroId,'pedidoParceiroId');
    const resposta = await this.obter(fornecedorId).consultarStatus({ pedidoParceiroId });
    const permitidos = ['PENDENTE','EM_SEPARACAO','EM_TRANSPORTE','ENTREGUE','FALHA'];
    if (!resposta || !permitidos.includes(resposta.status)) {
      throw new Error('Fornecedor retornou status invalido');
    }
    return { fornecedorId, pedidoParceiroId, status: resposta.status };
  }
}

module.exports = { RegistroFornecedores, CONTRATO_FORNECEDOR };
