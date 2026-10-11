const express = require('express');
const router = express.Router();

const filaA = [];
const filaB = [];

router.get('/', (req, res) => {
  res.json({ status: 'ok', filaA, filaB });
});

router.post('/entrar', (req, res) => {
  const { nome, fila = 'B' } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'Nome obrigatório' });
  }

  const participante = {
    nome,
    fila: fila === 'A' ? 'A' : 'B'
  };

  if (participante.fila === 'A') filaA.push(participante);
  else filaB.push(participante);

  res.json({
    status: 'ok',
    mensagem: `Participante entrou na fila ${participante.fila}`,
    participante
  });
});

module.exports = router;
