'use strict';

// Simulador isolado do tabuleiro LOOP.
// Nao executa pagamentos nem valida compras; a integracao real fica para outra etapa.
const {centroDoLoop,cofreDoEvento,origemDoCentro}=require('./destino-financeiro-centro-loop');
const DESTINOS = Object.freeze([
  'PARTICIPANTE',
  'EMPRESA',
  'PARTICIPANTE',
  'EMPRESA',
  'PARTICIPANTE',
  'EMPRESA_INVESTIMENTO'
]);

class TabuleiroLoop {
  constructor({ proximoDaFila, relogio = () => new Date().toISOString() } = {}) {
    if (typeof proximoDaFila !== 'function') {
      throw new TypeError('proximoDaFila deve ser uma funcao');
    }
    this.proximoDaFila = proximoDaFila;
    this.relogio = relogio;
    this.centro = null;
    this.vagas = Array(6).fill(null);
    this.vendasDoCiclo = [];
    this.vendasProcessadas = new Set();
    this.ciclosConcluidos = [];
    this.iniciado = false;
  }

  copiarPosicao(posicao) {
    return posicao ? { ...posicao } : null;
  }

  // Todas as selecoes da fila cruzam a ENTRADA (vaga 6).
  // Durante a montagem inicial o tabuleiro e distribuido em seus lugares
  // definitivos, mas cada posicao cruza esta mesma fronteira antes de ocupar
  // qualquer vaga interna ou o centro. Nao ha conversao na fila A ou B.
  selecionar() {
    // Centro e vagas contam juntos. A terceira posicao do mesmo titular
    // permanece na fila, preservada para um giro futuro.
    const ocupadas=[this.centro,...this.vagas].filter(Boolean);
    const selecionado = this.proximoDaFila(candidata =>
      ocupadas.filter(p=>p.participanteId===candidata.participanteId).length<2);
    if (!selecionado) return null;
    if (!selecionado.pessoa || selecionado.pessoa.id === undefined) {
      throw new Error('Selecao de fila retornou posicao invalida');
    }
    const posicao=this.copiarPosicao(selecionado.pessoa);
    const entradaEm=this.relogio();
    posicao.entradaPelaVaga6Em=entradaEm;
    if(posicao.statusAdesao==='PENDENTE'){
      // O aceite nao aconteceu ANTES de cruzar a entrada na vaga 6:
      // deixa de ser azul, passa a dourada e a titularidade e do LOOP.
      posicao.statusAdesao='PRAZO_ENCERRADO';
      posicao.titularOperacional='LOOP_EMPRESA';
      posicao.empresa=true;
      posicao.prazoEncerradoEm=entradaEm;
      posicao.motivoAssuncao='SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6';
    }
    return {...posicao,origemFila:selecionado.origem};
  }

  // Preenchimento inicial, sem movimentacao de posicoes ja ocupadas.
  // Se ainda nao houver sete posicoes, pode ser chamado novamente quando
  // novas vendas simuladas entrarem nas filas.
  preencherInicial() {
    if (this.iniciado) {
      throw new Error('O tabuleiro ja iniciou o primeiro ciclo');
    }
    if (!this.centro) this.centro = this.selecionar();
    for (let i = 0; i < this.vagas.length; i++) {
      if (!this.vagas[i]) this.vagas[i] = this.selecionar();
    }
    return this.estado();
  }

  registrarVendaSimulada({ vendaId } = {}) {
    if (typeof vendaId !== 'string' || !vendaId.trim()) {
      throw new Error('vendaId obrigatorio');
    }
    if (this.vendasProcessadas.has(vendaId)) {
      return { repetida: true, estado: this.estado() };
    }
    if (!this.centro) {
      throw new Error('Nao ha participante no centro');
    }
    if (this.vendasDoCiclo.length >= DESTINOS.length) {
      throw new Error('Ciclo ja tem seis vendas: aguarde a catraca');
    }
    this.iniciado = true;
    const ordem = this.vendasDoCiclo.length + 1;
    const registro = {
      vendaId,
      ordem,
      destinoPrevisto: DESTINOS[ordem - 1],
      destinoCofre:cofreDoEvento({posicaoCentro:this.centro,ordem}),
      origemTitularCentro:origemDoCentro(this.centro),
      ciclo: this.ciclosConcluidos.length + 1,
      posicaoCentroId: this.centro.id,
      registradaEm: this.relogio(),
      ...(centroDoLoop(this.centro)?
        {destinoParticipanteDoCentro:'LOOP_DOURADAS'}:{})
    };
    this.vendasDoCiclo.push(registro);
    this.vendasProcessadas.add(vendaId);
    return {
      repetida: false,
      venda: { ...registro },
      elegivelParaGiro: this.vendasDoCiclo.length === DESTINOS.length,
      estado: this.estado()
    };
  }

  // Desistencia VOLUNTARIA somente depois de entrar na vaga 6.
  // Nao apaga posicao, nao antecipa ciclo e exige aceite expresso do titular.
  registrarDesistenciaNaVaga6Simulada({posicaoId,aceiteExpresso}={}){
    if(aceiteExpresso!==true)throw new Error('Desistencia exige aceite expresso');
    const p=this.vagas[5];
    if(!p||p.id!==posicaoId||centroDoLoop(p))
      throw new Error('Desistencia permitida apenas ao titular da vaga 6 ativa');
    if(p.statusAdesao==='PENDENTE')
      throw new Error('Posicao ainda azul nao pode usar a desistencia da vaga 6');
    p.titularOperacional='LOOP_EMPRESA';p.empresa=true;
    p.statusAdesao='DESISTENTE';p.desistenciaRegistradaEm=this.relogio();
    p.motivoAssuncao='DESISTENCIA_EXPRESSA_APOS_VAGA_6';
    return {posicaoId,assumidaPeloLoop:true,statusAdesao:p.statusAdesao,
      registradaEm:p.desistenciaRegistradaEm,movimentoDaCatraca:false};
  }

  // O sexto evento NAO permite girar enquanto a catraca esta pausada.
  // A catraca so autoriza o deslocamento fisico das posicoes;
  // nao altera quem ocupa ou a ordem preexistente do tabuleiro.
  girarSimulado({ catracaAberta = false } = {}) {
    if (!catracaAberta) {
      return { girou: false, motivo: 'CATRACA_PAUSADA', estado: this.estado() };
    }
    if (this.vendasDoCiclo.length !== DESTINOS.length) {
      return { girou: false, motivo: 'CICLO_INCOMPLETO', estado: this.estado() };
    }
    const centroAnterior = this.copiarPosicao(this.centro);
    const vagasAnteriores = this.vagas.map(p => this.copiarPosicao(p));
    const concluido = {
      ciclo: this.ciclosConcluidos.length + 1,
      centro: centroAnterior,
      vendas: this.vendasDoCiclo.map(v => ({ ...v })),
      concluidoEm: this.relogio()
    };

    // Giro fixo: Centro sai; 1 -> Centro; 2 -> 1 ... 6 -> 5.
    // Somente uma nova selecao da fila abastece a posicao 6.
    this.centro = vagasAnteriores[0];
    this.vagas = [...vagasAnteriores.slice(1),this.selecionar()];
    this.ciclosConcluidos.push(concluido);
    this.vendasDoCiclo = [];
    return {
      girou: true,
      centroConcluido: centroAnterior,
      novaPosicao6: this.copiarPosicao(this.vagas[5]),
      estado: this.estado()
    };
  }

  estado() {
    return {
      modo: 'SIMULACAO_SEM_PAGAMENTOS',
      centro: this.copiarPosicao(this.centro),
      vagas: this.vagas.map(p => this.copiarPosicao(p)),
      cicloAtual: this.ciclosConcluidos.length + 1,
      vendasNoCiclo: this.vendasDoCiclo.length,
      destinosRegistrados: this.vendasDoCiclo.map(v => v.destinoPrevisto),
      elegivelParaGiro: this.vendasDoCiclo.length === DESTINOS.length,
      ciclosConcluidos: this.ciclosConcluidos.length
    };
  }
}

module.exports = { TabuleiroLoop, DESTINOS };
