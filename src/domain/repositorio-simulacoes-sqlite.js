'use strict';

// Camada de persistencia EXCLUSIVA do simulador. Nao utilizar para vendas reais,
// pagamentos ou dados pessoais. Requer Node.js 22+ (node:sqlite).
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { SimuladorLoop } = require('./simulador-loop');

function validarId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    throw new Error('Identificador de simulacao invalido');
  }
}

class RepositorioSimulacoesSQLite {
  constructor({ caminho } = {}) {
    if (typeof caminho !== 'string' || !caminho.trim()) {
      throw new Error('Informe um caminho explicito para o banco de simulacao');
    }
    this.banco = new DatabaseSync(caminho);
    try {
      this.banco.exec('PRAGMA busy_timeout=5000;');
      this.banco.exec('PRAGMA journal_mode=WAL;');
      this.banco.exec('PRAGMA synchronous=FULL;');

      const versao = this.banco.prepare('PRAGMA user_version').get().user_version;
      if (versao !== 0 && versao !== 1) {
        throw new Error('Versao do esquema SQLite nao suportada');
      }
      this.banco.exec(`
        CREATE TABLE IF NOT EXISTS simulacoes_loop (
          id TEXT PRIMARY KEY NOT NULL,
          revisao INTEGER NOT NULL CHECK (revisao >= 1),
          estado_json TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );
      `);
      if (versao === 0) this.banco.exec('PRAGMA user_version=1;');
      // Bancos em arquivos locais nao devem ficar acessiveis a outros usuarios.
      if (caminho !== ':memory:') fs.chmodSync(caminho, 0o600);
    } catch (erro) {
      this.banco.close();
      throw erro;
    }
  }

  salvar({ id, simulador, revisaoEsperada } = {}) {
    validarId(id);
    if (!(simulador instanceof SimuladorLoop)) {
      throw new Error('Apenas estados do SimuladorLoop podem ser gravados');
    }
    if (!Number.isSafeInteger(revisaoEsperada) || revisaoEsperada < 0) {
      throw new Error('Informe revisaoEsperada (0 para um estado novo)');
    }
    const estado = JSON.stringify(simulador.exportarSnapshot());
    const atualizadoEm = new Date().toISOString();

    // BEGIN IMMEDIATE serializa as gravacoes; revisaoEsperada impede
    // sobrescrever sem aviso alteracoes salvas por outra instancia.
    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const anterior = this.banco.prepare(
        'SELECT revisao FROM simulacoes_loop WHERE id = ?'
      ).get(id);
      const revisaoAtual = anterior ? anterior.revisao : 0;
      if (revisaoAtual !== revisaoEsperada) {
        throw new Error('Conflito de revisao: recarregue o estado antes de salvar');
      }
      const revisaoNova = revisaoAtual + 1;
      if (anterior) {
        this.banco.prepare(
          'UPDATE simulacoes_loop SET revisao = ?, estado_json = ?, atualizado_em = ? WHERE id = ?'
        ).run(revisaoNova, estado, atualizadoEm, id);
      } else {
        this.banco.prepare(
          'INSERT INTO simulacoes_loop (id, revisao, estado_json, atualizado_em) VALUES (?, ?, ?, ?)'
        ).run(id, revisaoNova, estado, atualizadoEm);
      }
      this.banco.exec('COMMIT;');
      return { id, revisao: revisaoNova, atualizadoEm };
    } catch (erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }

  recuperar({ id } = {}) {
    validarId(id);
    const linha = this.banco.prepare(
      'SELECT revisao, estado_json, atualizado_em FROM simulacoes_loop WHERE id = ?'
    ).get(id);
    if (!linha) return null;

    let snapshot;
    try {
      snapshot = JSON.parse(linha.estado_json);
    } catch {
      throw new Error('Estado persistido corrompido: JSON invalido');
    }
    // Valida formato, integridade e versao antes de aceitar o estado.
    const simulador = SimuladorLoop.restaurarSnapshot(snapshot);
    return {
      id,
      revisao: linha.revisao,
      atualizadoEm: linha.atualizado_em,
      simulador
    };
  }

  fechar() {
    this.banco.close();
  }
}

module.exports = { RepositorioSimulacoesSQLite };
