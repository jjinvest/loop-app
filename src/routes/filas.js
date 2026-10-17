const express = require('express');
const { MotorFilas } = require('../domain/motor-filas');

const router = express.Router();
const motor = new MotorFilas();

// Rotas de prototipo: nao representam confirmacao real de pagamento.
// Em producao, somente eventos de venda e indicacao autenticados podem acionar o motor.
function proximoDaFila() {
  return motor.proximoDaFila();
}

router.get('/', (req, res) => {
  // Nunca enviar nomes ou identificadores pessoais a uma interface publica.
  // A UI existente so necessita dos totais das filas.
  const { regra, modo, A, B } = motor.resumo();
  res.json({
    regra, modo,
    A: { nome: A.nome, quantidade: A.quantidade },
    B: { nome: B.nome, quantidade: B.quantidade }
  });
});

router.post('/entrar', (req, res) => {
  try {
    const { posicao, repetida } = motor.registrarPosicao(req.body || {});
    res.status(repetida ? 200 : 201).json({
      mensagem: repetida ? 'Venda simulada ja registrada' : 'Posicao criada na fila B (BRANCA)',
      pessoa: posicao,
      repetida
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

router.post('/promover/:id', (req, res) => {
  const resultado = motor.promoverPosicaoSimulada(req.params.id);
  if (!resultado) {
    return res.status(404).json({ erro: 'Posicao nao encontrada na fila B' });
  }

  const pessoa = resultado.promovidas.find(p => String(p.id) === String(req.params.id));
  res.json({
    mensagem: 'Posicoes do participante promovidas para fila A (AMARELA) - SIMULACAO',
    pessoa,
    quantidadePromovidas: resultado.promovidas.length,
    indicacoesValidasSimuladas: resultado.quantidade
  });
});

router.post('/proximo', (req, res) => {
  const resultado = proximoDaFila();
  if (!resultado) return res.status(404).json({ erro: 'As filas estao vazias' });
  res.json({
    mensagem: 'Proxima posicao selecionada em simulacao',
    origem: resultado.origem,
    pessoa: resultado.pessoa,
    contadorA: motor.contadorA
  });
});

module.exports = router;
module.exports.proximoDaFila = proximoDaFila;
