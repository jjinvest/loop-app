'use strict';

// Parceiros completamente ficticios. Nenhuma rede, credencial, CPF,
// pagamento ou produto real entra no laboratorio.
const { RegistroFornecedores, CONTRATO_FORNECEDOR } = require('../integracoes/registro-fornecedores');

const DEMONSTRATIVOS = Object.freeze([
  Object.freeze({
    id: 'parceiro-demo-casa',
    nome: 'Distribuidor ficticio — Casa',
    itens: Object.freeze([
      Object.freeze({ sku: 'CASA_001', nome: 'Organizador demonstrativo', descricao: 'Modelo ficticio para organizar objetos.' }),
      Object.freeze({ sku: 'CASA_002', nome: 'Luminaria demonstrativa', descricao: 'Produto de amostra sem disponibilidade real.' }),
      Object.freeze({ sku: 'CASA_003', nome: 'Garrafa demonstrativa', descricao: 'Exemplo de cadastro para teste da vitrine.' })
    ])
  }),
  Object.freeze({
    id: 'parceiro-demo-escritorio',
    nome: 'Distribuidor ficticio — Escritorio',
    itens: Object.freeze([
      Object.freeze({ sku: 'ESC_001', nome: 'Caderno demonstrativo', descricao: 'Modelo de papelaria criado somente para testes.' }),
      Object.freeze({ sku: 'ESC_002', nome: 'Suporte de mesa demonstrativo', descricao: 'Exemplo ficticio de produto de escritorio.' })
    ])
  })
]);

function criarFornecedoresDemonstrativos() {
  const registro = new RegistroFornecedores();
  for (const parceiro of DEMONSTRATIVOS) {
    const itens = parceiro.itens.map(item => ({ ...item }));
    registro.registrar({
      fornecedorId: parceiro.id,
      adaptador: {
        versaoContrato: CONTRATO_FORNECEDOR,
        listarProdutos: async () => itens.map(item => ({ ...item })),
        consultarEstoque: async () => ({ quantidade: 0 }),
        consultarStatus: async () => ({ status: 'PENDENTE' })
      }
    });
  }
  return {
    registro,
    fornecedores: DEMONSTRATIVOS.map(parceiro => ({
      id: parceiro.id,
      nome: parceiro.nome,
      demonstrativo: true
    }))
  };
}

module.exports = { criarFornecedoresDemonstrativos };
