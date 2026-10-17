'use strict';

// Bloqueia operacoes de prototipo por padrao.
// Nenhuma rota HTTP representa comprovante de pagamento ou indicacao valida.
// O modo de testes requer flag explicita, ambiente nao produtivo e conexao
// direta local, sem confiar em cabecalhos X-Forwarded-For enviados por clientes.
function clienteLocal(req) {
  const ip = req.socket && req.socket.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function simulacaoLocalLiberada(req) {
  return process.env.LOOP_MODO_SIMULACAO === '1'
    && process.env.NODE_ENV !== 'production'
    && clienteLocal(req);
}

function bloquearMutacoesSimuladas(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (!simulacaoLocalLiberada(req)) {
    return res.status(403).json({
      erro: 'OPERACAO_SIMULADA_DESABILITADA',
      mensagem: 'Operacoes simuladas exigem ambiente local de testes. Compras reais nao estao disponiveis.'
    });
  }
  next();
}

module.exports = { bloquearMutacoesSimuladas, simulacaoLocalLiberada };
