const express = require('express');
const router = express.Router();

let catraca = {
  status: 'PAUSADA',
  modo: 'MANUAL',
  liberacoes: 0,
  ultimaLiberacao: null
};

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    catraca
  });
});

router.post('/pausar', (req, res) => {
  catraca.status = 'PAUSADA';

  res.json({
    status: 'ok',
    message: 'Catraca pausada. A fila continua funcionando.',
    catraca
  });
});

router.post('/abrir', (req, res) => {
  catraca.status = 'ABERTA';

  res.json({
    status: 'ok',
    message: 'Catraca aberta para processamento.',
    catraca
  });
});

router.post('/liberar', (req, res) => {
  if (catraca.status !== 'ABERTA') {
    return res.status(409).json({
      status: 'bloqueado',
      message: 'Catraca pausada. Nenhuma liberacao foi realizada.'
    });
  }

  catraca.liberacoes += 1;
  catraca.ultimaLiberacao = new Date().toISOString();

  res.json({
    status: 'ok',
    message: 'Liberacao simulada registrada.',
    catraca
  });
});


router.post('/retomar', (req, res) => {
  estado.status = 'ATIVA';
  res.json({ status: 'ok', message: 'Catraca retomada', catraca: estado });
});

module.exports = router;
