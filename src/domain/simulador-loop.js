'use strict';

const { MotorFilas } = require('./motor-filas');
const { TabuleiroLoop } = require('./tabuleiro-loop');

// Orquestracao SOMENTE de teste. Fila e catraca sao componentes separados.
// O ambiente real precisara de autenticacao, pagamentos confirmados e banco.
class SimuladorLoop {
  constructor({ relogio = () => new Date().toISOString() } = {}) {
    this.filas = new MotorFilas({ relogio });
    this.tabuleiro = new TabuleiroLoop({
      proximoDaFila: (elegivel) => this.filas.proximoDaFila(elegivel),
      relogio
    });
    this.catracaAberta = false;
    this.giros = 0;
  }

  registrarPosicaoSimulada(dados) {
    return this.filas.registrarPosicao(dados);
  }

  registrarIndicacaoSimulada(dados) {
    // Uma posicao ja no tabuleiro pode receber indicacao sem voltar a fila.
    const alvoId=dados?.posicaoAlvoId;
    const posicaoNoTabuleiro=[this.tabuleiro.centro,...this.tabuleiro.vagas]
      .find(p=>p?.id===alvoId);
    const resultado=this.filas.registrarIndicacaoValidada({
      ...dados,...(posicaoNoTabuleiro?{posicaoNoTabuleiro}:{})
    });
    const promovidas=this.filas.liberarEscalonadas(this.tabuleiro);
    return {...resultado,promovidas:[...resultado.promovidas,...promovidas]};
  }

  prepararTabuleiro() {
    const resultado=this.tabuleiro.preencherInicial();
    this.filas.liberarEscalonadas(this.tabuleiro);
    return resultado;
  }

  registrarVendaNoCicloSimulada({ vendaId } = {}) {
    return this.tabuleiro.registrarVendaSimulada({ vendaId });
  }

  registrarDesistenciaNaVaga6Simulada(dados){
    return this.tabuleiro.registrarDesistenciaNaVaga6Simulada(dados);
  }

  pausarCatraca() {
    this.catracaAberta = false;
    return this.estado();
  }

  abrirCatraca() {
    this.catracaAberta = true;
    return this.estado();
  }

  tentarGiro() {
    const resultado = this.tabuleiro.girarSimulado({
      catracaAberta: this.catracaAberta
    });
    if (resultado.girou){this.giros += 1;
      this.filas.liberarEscalonadas(this.tabuleiro);
    }
    return resultado;
  }

  exportarSnapshot() {
    const { exportarSnapshot } = require('./estado-simulacao');
    return exportarSnapshot(this);
  }

  static restaurarSnapshot(snapshot, opcoes = {}) {
    const { restaurarSnapshot } = require('./estado-simulacao');
    return restaurarSnapshot(snapshot, () => new SimuladorLoop(opcoes));
  }

  estado() {
    return {
      modo: 'SIMULACAO_SEM_PAGAMENTOS',
      filas: this.filas.resumo(),
      tabuleiro: this.tabuleiro.estado(),
      catraca: {
        status: this.catracaAberta ? 'ABERTA' : 'PAUSADA',
        giros: this.giros
      }
    };
  }
}

module.exports = { SimuladorLoop };
