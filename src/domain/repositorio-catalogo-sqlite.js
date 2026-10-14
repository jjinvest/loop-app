'use strict';

// Armazenamento LOCAL de laboratorio para o catalogo.
// Nao e painel administrativo, nem mecanismo de venda real.
// Node.js 22+; usar arquivo exclusivo, separado do SQLite dos ciclos.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { validarProduto } = require('./catalogo');

function validarCaminho(caminho) {
  if (typeof caminho !== 'string' || !caminho.trim()) {
    throw new Error('Caminho explicito do banco do catalogo e obrigatorio');
  }
}
function validarRevisao(revisao) {
  if (!Number.isSafeInteger(revisao) || revisao < 0) {
    throw new Error('revisaoEsperada deve ser inteiro nao negativo');
  }
}
function verificarId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(id)) {
    throw new Error('Identificador de produto invalido');
  }
}
function extrairProduto(linha) {
  if (!linha) return null;
  let dados;
  try {
    dados = JSON.parse(linha.dados_json);
  } catch {
    throw new Error('Catalogo persistido corrompido: JSON invalido');
  }
  const produto = validarProduto(dados);
  if (produto.id !== linha.id) {
    throw new Error('Catalogo persistido corrompido: ID divergente');
  }
  return {
    produto,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizado_em
  };
}

class RepositorioCatalogoSQLite {
  constructor({ caminho } = {}) {
    validarCaminho(caminho);
    this.banco = new DatabaseSync(caminho);
    try {
      this.banco.exec('PRAGMA busy_timeout=5000;');
      this.banco.exec('PRAGMA foreign_keys=ON;');
      this.banco.exec('PRAGMA journal_mode=WAL;');
      this.banco.exec('PRAGMA synchronous=FULL;');

      const versao = this.banco.prepare('PRAGMA user_version').get().user_version;
      if (versao !== 0 && versao !== 1 && versao !== 2 && versao !== 3) {
        throw new Error('Versao do catalogo SQLite nao suportada');
      }

      this.banco.exec(`
        CREATE TABLE IF NOT EXISTS catalogo_produtos (
          id TEXT PRIMARY KEY NOT NULL,
          revisao INTEGER NOT NULL CHECK (revisao >= 1),
          dados_json TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );
      `);
      // Migracao transacional v1 -> v2. A base antiga nao contem as
      // revisoes anteriores: registrar apenas o estado encontrado na migracao.
      if (versao < 2) {
        this.banco.exec('BEGIN IMMEDIATE;');
        try {
          this.banco.exec(`
            CREATE TABLE IF NOT EXISTS catalogo_historico (
              sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
              produto_id TEXT NOT NULL,
              revisao INTEGER NOT NULL CHECK (revisao >= 1),
              tipo TEXT NOT NULL CHECK (tipo IN ('CRIADO','ATUALIZADO','IMPORTADO_V1')),
              campos_json TEXT NOT NULL,
              antes_json TEXT NOT NULL,
              depois_json TEXT NOT NULL,
              ocorrido_em TEXT NOT NULL,
              UNIQUE (produto_id, revisao)
            );
            CREATE INDEX IF NOT EXISTS idx_catalogo_historico_produto
              ON catalogo_historico (produto_id, revisao);
          `);
          if (versao === 1) {
            const antigos = this.banco.prepare(
              'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos'
            ).all();
            const inserir = this.banco.prepare(
              'INSERT INTO catalogo_historico (produto_id, revisao, tipo, campos_json, antes_json, depois_json, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            for (const linha of antigos) {
              const registro = extrairProduto(linha);
              inserir.run(
                linha.id, linha.revisao, 'IMPORTADO_V1',
                JSON.stringify([]), JSON.stringify({}),
                JSON.stringify(registro.produto), linha.atualizado_em
              );
            }
          }
          this.banco.exec('PRAGMA user_version=2;');
          this.banco.exec('COMMIT;');
        } catch (erro) {
          this.banco.exec('ROLLBACK;');
          throw erro;
        }
      }
      this.banco.exec(`
        CREATE TRIGGER IF NOT EXISTS catalogo_historico_bloqueia_update
          BEFORE UPDATE ON catalogo_historico
          BEGIN SELECT RAISE(ABORT, 'historico imutavel'); END;
        CREATE TRIGGER IF NOT EXISTS catalogo_historico_bloqueia_delete
          BEFORE DELETE ON catalogo_historico
          BEGIN SELECT RAISE(ABORT, 'historico imutavel'); END;
      `);
      // Migracao v2 -> v3: vinculo externo independente do cadastro
      // publico. Trocar distribuidor nao modifica o produto LOOP.
      if (versao < 3) {
        this.banco.exec('BEGIN IMMEDIATE;');
        try {
          this.banco.exec(`
            CREATE TABLE catalogo_vinculos_fornecedor (
              produto_id TEXT PRIMARY KEY NOT NULL
                REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
              fornecedor_id TEXT,
              sku TEXT,
              revisao INTEGER NOT NULL CHECK (revisao >= 1),
              atualizado_em TEXT NOT NULL,
              CHECK ((fornecedor_id IS NULL AND sku IS NULL)
                  OR (fornecedor_id IS NOT NULL AND sku IS NOT NULL))
            );
            CREATE UNIQUE INDEX idx_catalogo_vinculos_parceiro_sku
              ON catalogo_vinculos_fornecedor (fornecedor_id, sku)
              WHERE fornecedor_id IS NOT NULL;
            CREATE TABLE catalogo_vinculos_historico (
              sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
              produto_id TEXT NOT NULL,
              revisao INTEGER NOT NULL CHECK (revisao >= 1),
              acao TEXT NOT NULL CHECK
                (acao IN ('VINCULADO','SUBSTITUIDO','DESATIVADO')),
              antes_fornecedor TEXT,
              antes_sku TEXT,
              depois_fornecedor TEXT,
              depois_sku TEXT,
              ocorrido_em TEXT NOT NULL,
              UNIQUE (produto_id, revisao),
              FOREIGN KEY(produto_id) REFERENCES catalogo_produtos(id)
                ON DELETE RESTRICT
            );
            CREATE INDEX idx_catalogo_vinculos_historico_produto
              ON catalogo_vinculos_historico (produto_id, revisao);
            CREATE TRIGGER catalogo_vinculos_historico_bloqueia_update
              BEFORE UPDATE ON catalogo_vinculos_historico
              BEGIN SELECT RAISE(ABORT, 'historico vinculos imutavel'); END;
            CREATE TRIGGER catalogo_vinculos_historico_bloqueia_delete
              BEFORE DELETE ON catalogo_vinculos_historico
              BEGIN SELECT RAISE(ABORT, 'historico vinculos imutavel'); END;
            PRAGMA user_version=3;
          `);
          this.banco.exec('COMMIT;');
        } catch (erro) {
          this.banco.exec('ROLLBACK;');
          throw erro;
        }
      }
      if (caminho !== ':memory:') fs.chmodSync(caminho, 0o600);
    } catch (erro) {
      this.banco.close();
      throw erro;
    }
  }

  listar() {
    const linhas = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos ORDER BY id'
    ).all();
    return linhas.map(linha => extrairProduto(linha).produto);
  }

  buscar(id) {
    verificarId(id);
    const linha = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos WHERE id = ?'
    ).get(id);
    return extrairProduto(linha)?.produto || null;
  }

  buscarRegistro(id) {
    verificarId(id);
    const linha = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos WHERE id = ?'
    ).get(id);
    return extrairProduto(linha);
  }

  // O gravador interno exige revisao atual. Rascunhos nao sao publicados
  // automaticamente; a API publica filtra os estados.
  salvar({ produto, revisaoEsperada } = {}) {
    const validado = validarProduto(produto);
    validarRevisao(revisaoEsperada);
    const atualizadoEm = new Date().toISOString();

    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const anterior = this.banco.prepare(
        'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos WHERE id = ?'
      ).get(validado.id);
      const revisaoAtual = anterior ? anterior.revisao : 0;
      if (revisaoAtual !== revisaoEsperada) {
        throw new Error('Conflito de revisao do catalogo: recarregue o produto');
      }
      const novaRevisao = revisaoAtual + 1;
      if (anterior) {
        this.banco.prepare(
          'UPDATE catalogo_produtos SET revisao = ?, dados_json = ?, atualizado_em = ? WHERE id = ?'
        ).run(novaRevisao, JSON.stringify(validado), atualizadoEm, validado.id);
      } else {
        this.banco.prepare(
          'INSERT INTO catalogo_produtos (id, revisao, dados_json, atualizado_em) VALUES (?, ?, ?, ?)'
        ).run(validado.id, novaRevisao, JSON.stringify(validado), atualizadoEm);
      }
      // Produto e trilha de alteracoes entram na MESMA transacao.
      // Falha no historico desfez tambem a mudanca do produto.
      const antigo = anterior ? extrairProduto(anterior).produto : null;
      const campos = Object.keys(validado).filter(chave =>
        !antigo || JSON.stringify(antigo[chave]) !== JSON.stringify(validado[chave])
      );
      const antes = {}, depois = {};
      for (const chave of campos) {
        if (antigo) antes[chave] = antigo[chave];
        depois[chave] = validado[chave];
      }
      this.banco.prepare(
        'INSERT INTO catalogo_historico (produto_id, revisao, tipo, campos_json, antes_json, depois_json, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        validado.id, novaRevisao, antigo ? 'ATUALIZADO' : 'CRIADO',
        JSON.stringify(campos), JSON.stringify(antes),
        JSON.stringify(depois), atualizadoEm
      );
      this.banco.exec('COMMIT;');
      return { id: validado.id, revisao: novaRevisao, atualizadoEm };
    } catch (erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }

  // Altera somente os campos declarados e preserva o identificador.
  atualizar({ id, alteracoes, revisaoEsperada } = {}) {
    verificarId(id);
    validarRevisao(revisaoEsperada);
    if (!alteracoes || typeof alteracoes !== 'object' || Array.isArray(alteracoes)) {
      throw new Error('Informe as alteracoes do produto');
    }
    const registro = this.buscarRegistro(id);
    if (!registro) return null;
    if (registro.revisao !== revisaoEsperada) {
      throw new Error('Conflito de revisao do catalogo: recarregue o produto');
    }
    return this.salvar({
      produto: { ...registro.produto, ...alteracoes, id },
      revisaoEsperada
    });
  }

  historico(id) {
    verificarId(id);
    const linhas = this.banco.prepare(
      'SELECT revisao, tipo, campos_json, antes_json, depois_json, ocorrido_em FROM catalogo_historico WHERE produto_id = ? ORDER BY revisao ASC'
    ).all(id);
    return linhas.map(linha => ({
      revisao: linha.revisao,
      tipo: linha.tipo,
      campos: JSON.parse(linha.campos_json),
      antes: JSON.parse(linha.antes_json),
      depois: JSON.parse(linha.depois_json),
      ocorridoEm: linha.ocorrido_em
    }));
  }

  fechar() {
    this.banco.close();
  }
}

module.exports = { RepositorioCatalogoSQLite };
