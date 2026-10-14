'use strict';

// Laboratorio de logistica: pedidos ficticios, sem CPF, endereco, cartao,
// preco, compra real, webhook, estorno financeiro ou movimentacao de filas.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const ESTADOS = Object.freeze([
  'AGUARDANDO_CONFIRMACAO', 'CONFIRMADO_SIMULADO',
  'ENVIADO_FORNECEDOR', 'EM_SEPARACAO', 'EM_TRANSPORTE',
  'ENTREGUE', 'OCORRENCIA', 'CANCELAMENTO_SOLICITADO', 'CANCELADO',
  'DEVOLUCAO_SOLICITADA', 'DEVOLVIDO'
]);

const TRANSICOES = Object.freeze({
  CONFIRMAR_PAGAMENTO_SIMULADO: {
    de: ['AGUARDANDO_CONFIRMACAO'], para: 'CONFIRMADO_SIMULADO'
  },
  REPASSAR_PEDIDO_SIMULADO: {
    de: ['CONFIRMADO_SIMULADO'], para: 'ENVIADO_FORNECEDOR'
  },
  INICIAR_SEPARACAO: { de: ['ENVIADO_FORNECEDOR'], para: 'EM_SEPARACAO' },
  REGISTRAR_TRANSPORTE: { de: ['EM_SEPARACAO'], para: 'EM_TRANSPORTE' },
  REGISTRAR_ENTREGA: { de: ['EM_TRANSPORTE'], para: 'ENTREGUE' },
  REGISTRAR_OCORRENCIA: {
    de: ['ENVIADO_FORNECEDOR', 'EM_SEPARACAO', 'EM_TRANSPORTE'],
    para: 'OCORRENCIA'
  },
  RETOMAR_TRANSPORTE: { de: ['OCORRENCIA'], para: 'EM_TRANSPORTE' },
  SOLICITAR_CANCELAMENTO: {
    de: [
      'AGUARDANDO_CONFIRMACAO', 'CONFIRMADO_SIMULADO',
      'ENVIADO_FORNECEDOR', 'EM_SEPARACAO',
      'EM_TRANSPORTE', 'OCORRENCIA'
    ],
    para: 'CANCELAMENTO_SOLICITADO'
  },
  REGISTRAR_CANCELAMENTO: {
    de: ['CANCELAMENTO_SOLICITADO'], para: 'CANCELADO'
  },
  SOLICITAR_DEVOLUCAO: { de: ['ENTREGUE'], para: 'DEVOLUCAO_SOLICITADA' },
  CONFIRMAR_DEVOLUCAO: { de: ['DEVOLUCAO_SOLICITADA'], para: 'DEVOLVIDO' }
});

const REEMBOLSO = Object.freeze(['NAO_SOLICITADO', 'SOLICITADO_SIMULADO', 'REGISTRADO_SIMULADO']);

function idValido(valor, campo) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(valor)) {
    throw new Error(campo + ' invalido');
  }
  return valor;
}
function revisaoValida(revisao) {
  if (!Number.isSafeInteger(revisao) || revisao < 1) {
    throw new Error('revisaoEsperada invalida');
  }
  return revisao;
}
function gerarPedido(row) {
  if (!row) return null;
  return {
    pedidoId:row.pedido_id,
    produtoId:row.produto_id,
    fornecedorId:row.fornecedor_id,
    sku:row.sku,
    status:row.status,
    reembolso:row.reembolso,
    revisao:row.revisao,
    criadoEm:row.criado_em,
    atualizadoEm:row.atualizado_em
  };
}

class PedidosLogisticosSimuladosSQLite {
  constructor({ caminho } = {}) {
    if (typeof caminho !== 'string' || !caminho.trim()) {
      throw new Error('Caminho explicito de banco logistico obrigatorio');
    }
    this.banco = new DatabaseSync(caminho);
    try {
      this.banco.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const versao = this.banco.prepare('PRAGMA user_version').get().user_version;
      if (versao !== 0 && versao !== 1) throw new Error('Versao logistica nao suportada');
      this.banco.exec(`
        CREATE TABLE IF NOT EXISTS pedidos_logistica_simulados (
          pedido_id TEXT PRIMARY KEY NOT NULL,
          produto_id TEXT NOT NULL,
          fornecedor_id TEXT NOT NULL,
          sku TEXT NOT NULL,
          status TEXT NOT NULL,
          reembolso TEXT NOT NULL,
          revisao INTEGER NOT NULL CHECK (revisao >= 1),
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pedidos_logistica_eventos (
          evento_id TEXT PRIMARY KEY NOT NULL,
          pedido_id TEXT NOT NULL REFERENCES pedidos_logistica_simulados(pedido_id),
          revisao INTEGER NOT NULL CHECK (revisao >= 1),
          tipo TEXT NOT NULL,
          status_antes TEXT,
          status_depois TEXT NOT NULL,
          reembolso_antes TEXT,
          reembolso_depois TEXT NOT NULL,
          ocorrido_em TEXT NOT NULL,
          UNIQUE (pedido_id,revisao)
        );
        CREATE INDEX IF NOT EXISTS idx_logistica_eventos_pedido
          ON pedidos_logistica_eventos(pedido_id,revisao);
        CREATE TRIGGER IF NOT EXISTS logistica_eventos_sem_update
          BEFORE UPDATE ON pedidos_logistica_eventos
          BEGIN SELECT RAISE(ABORT,'historico logistica imutavel'); END;
        CREATE TRIGGER IF NOT EXISTS logistica_eventos_sem_delete
          BEFORE DELETE ON pedidos_logistica_eventos
          BEGIN SELECT RAISE(ABORT,'historico logistica imutavel'); END;
      `);
      if (versao === 0) this.banco.exec('PRAGMA user_version=1;');
      this.banco.exec('PRAGMA foreign_keys=ON;');
      if (caminho !== ':memory:') fs.chmodSync(caminho, 0o600);
    } catch(erro) {
      this.banco.close();
      throw erro;
    }
  }

  buscar(pedidoId) {
    idValido(pedidoId, 'pedidoId');
    return gerarPedido(this.banco.prepare(
      'SELECT * FROM pedidos_logistica_simulados WHERE pedido_id = ?'
    ).get(pedidoId));
  }

  listar() {
    return this.banco.prepare(
      'SELECT * FROM pedidos_logistica_simulados ORDER BY criado_em, pedido_id'
    ).all().map(gerarPedido);
  }

  historico(pedidoId) {
    idValido(pedidoId,'pedidoId');
    return this.banco.prepare(
      'SELECT evento_id, revisao, tipo, status_antes, status_depois, reembolso_antes, reembolso_depois, ocorrido_em FROM pedidos_logistica_eventos WHERE pedido_id = ? ORDER BY revisao'
    ).all(pedidoId).map(e => ({
      eventoId:e.evento_id, revisao:e.revisao, tipo:e.tipo,
      statusAntes:e.status_antes, statusDepois:e.status_depois,
      reembolsoAntes:e.reembolso_antes, reembolsoDepois:e.reembolso_depois,
      ocorridoEm:e.ocorrido_em
    }));
  }

  cadastrar({ pedidoId, produtoId, fornecedorId, sku } = {}) {
    idValido(pedidoId,'pedidoId');
    idValido(produtoId,'produtoId');
    idValido(fornecedorId,'fornecedorId');
    idValido(sku,'sku');
    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const existe = this.buscar(pedidoId);
      if(existe) {
        if(existe.produtoId !== produtoId || existe.fornecedorId !== fornecedorId || existe.sku !== sku) {
          throw new Error('Pedido ja associado a outra mercadoria');
        }
        this.banco.exec('COMMIT;');
        return { pedido:existe, repetido:true };
      }
      const agora = new Date().toISOString();
      this.banco.prepare(
        'INSERT INTO pedidos_logistica_simulados VALUES(?,?,?,?,?,?,?,?,?)'
      ).run(pedidoId,produtoId,fornecedorId,sku,'AGUARDANDO_CONFIRMACAO',
        'NAO_SOLICITADO',1,agora,agora);
      this.banco.prepare(
        'INSERT INTO pedidos_logistica_eventos VALUES(?,?,?,?,?,?,?,?,?)'
      ).run('CRIADO_'+pedidoId,pedidoId,1,'PEDIDO_CRIADO',null,
        'AGUARDANDO_CONFIRMACAO',null,'NAO_SOLICITADO',agora);
      this.banco.exec('COMMIT;');
      return { pedido:this.buscar(pedidoId), repetido:false };
    } catch(erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }

  registrar({ pedidoId, eventoId, tipo, revisaoEsperada } = {}) {
    idValido(pedidoId,'pedidoId');
    idValido(eventoId,'eventoId');
    revisaoValida(revisaoEsperada);
    if (!Object.hasOwn(TRANSICOES,tipo) &&
        !['SOLICITAR_REEMBOLSO_SIMULADO','REGISTRAR_REEMBOLSO_SIMULADO'].includes(tipo)) {
      throw new Error('Tipo de evento logistico nao permitido');
    }
    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const repetido = this.banco.prepare(
        'SELECT pedido_id, tipo FROM pedidos_logistica_eventos WHERE evento_id = ?'
      ).get(eventoId);
      if(repetido) {
        if(repetido.pedido_id !== pedidoId || repetido.tipo !== tipo) {
          throw new Error('eventoId ja utilizado em operacao diferente');
        }
        const pedido = this.buscar(pedidoId);
        this.banco.exec('COMMIT;');
        return {pedido, repetido:true};
      }

      const pedido=this.buscar(pedidoId);
      if(!pedido) throw new Error('Pedido simulado nao encontrado');
      if(pedido.revisao !== revisaoEsperada) {
        throw new Error('Conflito de revisao do pedido simulado');
      }
      let novoStatus=pedido.status, novoReembolso=pedido.reembolso;
      const transicao=TRANSICOES[tipo];
      if(transicao) {
        if(!transicao.de.includes(pedido.status)) {
          throw new Error('Transicao de pedido nao permitida');
        }
        novoStatus=transicao.para;
      } else if(tipo === 'SOLICITAR_REEMBOLSO_SIMULADO') {
        // Registro informativo; nao movimenta saldo nem define valor.
        if(!['CANCELAMENTO_SOLICITADO','CANCELADO','OCORRENCIA',
              'DEVOLUCAO_SOLICITADA','DEVOLVIDO'].includes(pedido.status) ||
           pedido.reembolso !== 'NAO_SOLICITADO') {
          throw new Error('Solicitacao de reembolso nao permitida');
        }
        novoReembolso='SOLICITADO_SIMULADO';
      } else {
        if(!['CANCELADO','DEVOLVIDO'].includes(pedido.status) ||
           pedido.reembolso !== 'SOLICITADO_SIMULADO') {
          throw new Error('Registro de reembolso nao permitido');
        }
        novoReembolso='REGISTRADO_SIMULADO';
      }

      const agora=new Date().toISOString();
      const revisaoNova=pedido.revisao+1;
      this.banco.prepare(
        'UPDATE pedidos_logistica_simulados SET status=?, reembolso=?, revisao=?, atualizado_em=? WHERE pedido_id=?'
      ).run(novoStatus,novoReembolso,revisaoNova,agora,pedidoId);
      this.banco.prepare(
        'INSERT INTO pedidos_logistica_eventos VALUES(?,?,?,?,?,?,?,?,?)'
      ).run(eventoId,pedidoId,revisaoNova,tipo,pedido.status,
        novoStatus,pedido.reembolso,novoReembolso,agora);
      this.banco.exec('COMMIT;');
      return {pedido:this.buscar(pedidoId), repetido:false};
    }catch(erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }

  fechar() { this.banco.close(); }
}

module.exports={PedidosLogisticosSimuladosSQLite,ESTADOS,TRANSICOES,REEMBOLSO};
