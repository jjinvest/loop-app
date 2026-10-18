'use strict';

// Motor de simulação. Nenhuma rota deste módulo confirma ou realiza pagamentos.
// Uma posição é identificada por id próprio; uma pessoa pode ter várias posições.
class MotorFilas {
  constructor({ relogio = () => new Date().toISOString() } = {}) {
    this.relogio = relogio;
    this.filaA = [];
    this.filaB = [];
    this.sequencia = 0;
    this.contadorA = 0;
    this.evento = 0;
    this.indicacoes = new Map();
    this.indicacoesProcessadas = new Set();
    this.vendasRegistradas = new Map();
    this.participantesConhecidos = new Set();
  }

  copiar(posicao) {
    return { ...posicao };
  }

  informacoesParticipante(participanteId) {
    return this.indicacoes.get(String(participanteId)) || { quantidade: 0, ultimoConviteEm: null, ordemUltimoConvite: Infinity };
  }

  registrarPosicao({ nome, participanteId, vendaId, adesaoPendente = false } = {}) {
    if(typeof adesaoPendente!=='boolean')throw new TypeError('adesaoPendente invalida');
    if ((!nome || !String(nome).trim()) && (participanteId === undefined || participanteId === null || String(participanteId).trim() === '')) {
      throw new Error('Informe nome ou participanteId');
    }
    if (vendaId !== undefined && (typeof vendaId !== 'string' || !vendaId.trim())) {
      throw new Error('vendaId deve ser um texto nao vazio');
    }
    if (vendaId && this.vendasRegistradas.has(vendaId)) {
      return { posicao: this.copiar(this.vendasRegistradas.get(vendaId)), repetida: true };
    }

    const id = ++this.sequencia;
    const chaveParticipante = participanteId === undefined || participanteId === null
      ? 'simulado-' + id
      : String(participanteId).trim();
    const posicao = {
      id,
      participanteId: chaveParticipante,
      nome: nome ? String(nome).trim() : 'Participante ' + chaveParticipante,
      fila: 'B',
      entrouEm: this.relogio(),
      ...(adesaoPendente?{statusAdesao:'PENDENTE'}:{})
    };
    this.filaB.push(posicao);
    this.participantesConhecidos.add(chaveParticipante);
    if (vendaId) this.vendasRegistradas.set(vendaId, posicao);
    return { posicao: this.copiar(posicao), repetida: false };
  }

  ordenarFilaA() {
    this.filaA.sort((a, b) => {
      const na = this.informacoesParticipante(a.participanteId);
      const nb = this.informacoesParticipante(b.participanteId);
      const qa = a.indicacoesVinculadas ?? na.quantidade;
      const qb = b.indicacoesVinculadas ?? nb.quantidade;
      return (qb - qa)
        || String(a.ultimoConvitePosicaoEm ?? na.ultimoConviteEm).localeCompare(
          String(b.ultimoConvitePosicaoEm ?? nb.ultimoConviteEm))
        || ((a.ordemUltimoConvitePosicao ?? na.ordemUltimoConvite) -
            (b.ordemUltimoConvitePosicao ?? nb.ordemUltimoConvite))
        || (a.id - b.id);
    });
  }

  registrarIndicacaoValidada({ indicadorId, eventoId, convidouEm, posicaoAlvoId } = {}) {
    const chave = String(indicadorId ?? '').trim();
    if (chave==='LOOP_EMPRESA') {
      throw new Error('Bola dourada do LOOP nao participa de indicacoes');
    }
    if (!chave || !this.participantesConhecidos.has(chave)) {
      throw new Error('Indicador desconhecido');
    }
    if (typeof eventoId !== 'string' || !eventoId.trim()) {
      throw new Error('eventoId e obrigatorio para impedir indicacao duplicada');
    }
    if (this.indicacoesProcessadas.has(eventoId)) {
      return { repetida: true, promovidas: [], quantidade: this.informacoesParticipante(chave).quantidade };
    }

    // Escolha individual: uma indicacao so pode promover a posicao escolhida.
    // Chamadas antigas sem posicaoAlvoId seguem o comportamento legado.
    const porPosicao = posicaoAlvoId !== undefined;
    let alvo = null;
    if (porPosicao) {
      if(!Number.isSafeInteger(posicaoAlvoId) || posicaoAlvoId < 1)
        throw new Error('POSICAO_ALVO_INVALIDA');
      alvo = [...this.filaA,...this.filaB].find(p => p.id === posicaoAlvoId);
      if(!alvo || alvo.participanteId !== chave || alvo.empresa === true)
        throw new Error('POSICAO_ALVO_NAO_PERTENCE_A_CONTA');
      if(alvo.statusAdesao === 'PENDENTE')
        throw new Error('POSICAO_ALVO_PENDENTE');
    }
    // Em empate no total de indicacoes, ganha quem fez PRIMEIRO o ultimo
    // convite desse total (ex.: o 3o convite, se ambos tiverem tres).
    // Horario deve ter origem confiavel, jamais arbitrado pelo navegador.
    const marca = convidouEm === undefined ? this.relogio() : convidouEm;
    if (typeof marca !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(marca)
        || Number.isNaN(Date.parse(marca))) {
      throw new Error('Horario do convite invalido');
    }
    const horario = new Date(marca).toISOString();
    const anterior = this.informacoesParticipante(chave);
    const ordemEvento = ++this.evento;
    // Um evento antigo pode ser validado depois de outro mais recente.
    // O ultimo convite cronologico e a maior data/hora entre os validos.
    const conviteMaisRecente = !anterior.ultimoConviteEm || horario > anterior.ultimoConviteEm;
    const novo = {
      quantidade: anterior.quantidade + 1,
      ultimoConviteEm: conviteMaisRecente ? horario : anterior.ultimoConviteEm,
      ordemUltimoConvite: conviteMaisRecente ? ordemEvento : anterior.ordemUltimoConvite
    };
    this.indicacoes.set(chave, novo);
    this.indicacoesProcessadas.add(eventoId);

    const promovidas = this.filaB.filter(p =>
      p.participanteId === chave && (!porPosicao || p.id === posicaoAlvoId));
    this.filaB = this.filaB.filter(p => !promovidas.includes(p));
    if (porPosicao) {
      alvo.indicacoesVinculadas = (alvo.indicacoesVinculadas || 0) + 1;
      if (!alvo.ultimoConvitePosicaoEm || horario > alvo.ultimoConvitePosicaoEm) {
        alvo.ultimoConvitePosicaoEm = horario;
        alvo.ordemUltimoConvitePosicao = ordemEvento;
      }
    }
    for (const p of promovidas) {
      p.fila = 'A';
      p.promovidoEm = this.relogio();
      this.filaA.push(p);
    }
    this.ordenarFilaA();
    return { repetida: false, promovidas: promovidas.map(p => this.copiar(p)), quantidade: novo.quantidade };
  }

  // Compatibilidade com a rota de testes /filas/promover/:id.
  promoverPosicaoSimulada(id) {
    const posicao = this.filaB.find(p => String(p.id) === String(id));
    if (!posicao) return null;
    return this.registrarIndicacaoValidada({
      indicadorId: posicao.participanteId,
      eventoId: 'simulacao-promocao-' + (++this.evento)
    });
  }

  proximoDaFila() {
    let posicao;
    let origem;
    if (this.filaA.length && (this.contadorA < 3 || !this.filaB.length)) {
      posicao = this.filaA.shift();
      origem = 'A';
      this.contadorA += 1;
    } else if (this.filaB.length) {
      posicao = this.filaB.shift();
      origem = 'B';
      this.contadorA = 0;
    } else if (this.filaA.length) {
      posicao = this.filaA.shift();
      origem = 'A';
      this.contadorA += 1;
    } else {
      return null;
    }
    return { pessoa: this.copiar(posicao), origem };
  }

  resumo() {
    return {
      regra: '3A/1B',
      modo: 'SIMULACAO_SEM_PAGAMENTOS',
      A: { nome: 'AMARELA', quantidade: this.filaA.length, pessoas: this.filaA.map(p => this.copiar(p)) },
      B: { nome: 'BRANCA', quantidade: this.filaB.length, pessoas: this.filaB.map(p => this.copiar(p)) },
      contadorA: this.contadorA
    };
  }
}

module.exports = { MotorFilas };
