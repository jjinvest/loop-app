const express = require('express');
const router = express.Router();

const filaA = []; // AMARELA - prioridade
const filaB = []; // BRANCA - entrada normal

let sequencia = 0;
let contadorA = 0;

function agora() {
  return new Date().toISOString();
}

function proximoDaFila() {
  let pessoa = null;
  let origem = null;

  // Regra: 3 da A para 1 da B
  if (filaA.length > 0 && (contadorA < 3 || filaB.length === 0)) {
    pessoa = filaA.shift();
    origem = 'A';
    contadorA++;
  } else if (filaB.length > 0) {
    pessoa = filaB.shift();
    origem = 'B';
    contadorA = 0;
  } else if (filaA.length > 0) {
    pessoa = filaA.shift();
    origem = 'A';
    contadorA++;
  }

  return pessoa ? { pessoa, origem } : null;
}

router.get('/', (req, res) => {
  res.json({
    regra: '3A/1B',
    A: {
      nome: 'AMARELA',
      quantidade: filaA.length,
      pessoas: filaA
    },
    B: {
      nome: 'BRANCA',
      quantidade: filaB.length,
      pessoas: filaB
    },
    contadorA
  });
});

router.post('/entrar', (req, res) => {
  const { nome, participanteId } = req.body;

  if (!nome && !participanteId) {
    return res.status(400).json({
      erro: 'Informe nome ou participanteId'
    });
  }

  const pessoa = {
    id: participanteId || ++sequencia,
    nome: nome || `Participante ${participanteId}`,
    fila: 'B',
    entrouEm: agora()
  };

  filaB.push(pessoa);

  res.status(201).json({
    mensagem: 'Participante entrou na fila B (BRANCA)',
    pessoa
  });
});

router.post('/promover/:id', (req, res) => {
  const id = String(req.params.id);

  const indice = filaB.findIndex(p => String(p.id) === id);

  if (indice === -1) {
    return res.status(404).json({
      erro: 'Participante não encontrado na fila B'
    });
  }

  const pessoa = filaB.splice(indice, 1)[0];
  pessoa.fila = 'A';
  pessoa.promovidoEm = agora();

  filaA.push(pessoa);

  res.json({
    mensagem: 'Participante promovido para fila A (AMARELA)',
    pessoa
  });
});

router.post('/proximo', (req, res) => {
  const resultado = proximoDaFila();

  if (!resultado) {
    return res.status(404).json({
      erro: 'As filas estão vazias'
    });
  }

  res.json({
    mensagem: 'Próximo participante liberado',
    origem: resultado.origem,
    pessoa: resultado.pessoa,
    contadorA
  });
});

module.exports = router;
