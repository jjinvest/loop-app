'use strict';

// Laboratorio: o verificador e injetado pelos testes. Nao existe webhook real
// nem rota HTTP. Nunca aceite "pago=true" fornecido pelo navegador.
const { SimuladorLoop } = require('./simulador-loop');

const STATUS_CONFIRMADO = 'CONFIRMADO_SIMULADO';

function identificador(x, campo) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(x)) {
    throw new Error(campo + ' invalido');
  }
  return x;
}

function validarConfirmacaoConfiavel(evento, pedidoId) {
  if (!evento || typeof evento !== 'object' || Array.isArray(evento)) {
    throw new Error('Confirmacao ausente ou invalida');
  }
  if (evento.pedidoId !== pedidoId) {
    throw new Error('Confirmacao nao corresponde ao pedido consultado');
  }
  if (evento.status !== STATUS_CONFIRMADO) {
    throw new Error('Pedido ainda nao confirmado pelo verificador simulado');
  }
  identificador(evento.participanteId, 'participanteId');
  identificador(evento.produtoId, 'produtoId');
  if (typeof evento.nome !== 'string' || !evento.nome.trim()) {
    throw new Error('Nome do participante ausente');
  }
  if (!Number.isSafeInteger(evento.valorCentavos) || evento.valorCentavos <= 0) {
    throw new Error('Valor em centavos invalido');
  }
  return {
    pedidoId,
    participanteId: evento.participanteId,
    nome: evento.nome.trim(),
    produtoId: evento.produtoId,
    valorCentavos: evento.valorCentavos
  };
}

class ProcessadorPedidosSimulados {
  constructor({ repositorio, consultarPagamentoConfiavel, tentativas = 3 } = {}) {
    if (!repositorio || typeof repositorio.recuperar !== 'function'
      || typeof repositorio.salvar !== 'function') {
      throw new TypeError('Repositorio SQLite de simulacao obrigatorio');
    }
    if (typeof consultarPagamentoConfiavel !== 'function') {
      throw new TypeError('Funcao interna para verificar pedidos e obrigatoria');
    }
    if (!Number.isSafeInteger(tentativas) || tentativas < 1 || tentativas > 10) {
      throw new Error('Numero de tentativas invalido');
    }
    this.repositorio = repositorio;
    this.consultarPagamentoConfiavel = consultarPagamentoConfiavel;
    this.tentativas = tentativas;
  }

  async processar({ simulacaoId, pedidoId } = {}) {
    identificador(simulacaoId, 'simulacaoId');
    identificador(pedidoId, 'pedidoId');

    // Somente o verificador interno define status e participante.
    // A API nao recebe nome, valor, produto ou status de um cliente.
    const confirmacao = validarConfirmacaoConfiavel(
      await this.consultarPagamentoConfiavel(pedidoId), pedidoId
    );
    const vendaId = 'pedido-' + pedidoId;

    for (let tentativa = 0; tentativa < this.tentativas; tentativa++) {
      const recuperado = this.repositorio.recuperar({ id: simulacaoId });
      const simulador = recuperado ? recuperado.simulador : new SimuladorLoop();
      const revisaoEsperada = recuperado ? recuperado.revisao : 0;
      const resultado = simulador.registrarPosicaoSimulada({
        participanteId: confirmacao.participanteId,
        nome: confirmacao.nome,
        vendaId
      });

      if (resultado.posicao.participanteId !== confirmacao.participanteId) {
        throw new Error('Pedido ja associado a outro participante');
      }
      if (resultado.repetida) {
        return {
          criado: false,
          repetido: true,
          simulacaoId,
          pedidoId,
          posicao: resultado.posicao,
          revisao: revisaoEsperada
        };
      }

      try {
        const gravacao = this.repositorio.salvar({
          id: simulacaoId,
          simulador,
          revisaoEsperada
        });
        return {
          criado: true,
          repetido: false,
          simulacaoId,
          pedidoId,
          posicao: resultado.posicao,
          revisao: gravacao.revisao
        };
      } catch (erro) {
        if (!/Conflito de revisao/.test(erro.message) || tentativa === this.tentativas - 1) {
          throw erro;
        }
        // Recarregar e tentar novamente; o mesmo pedido nao criara segunda
        // posicao se a outra instancia ja tiver confirmado a gravacao.
      }
    }
    throw new Error('Tentativas de concorrencia esgotadas');
  }
}

module.exports = { ProcessadorPedidosSimulados, STATUS_CONFIRMADO };
