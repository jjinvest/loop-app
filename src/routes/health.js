const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    app: 'Loop',
    status: 'online',
    message: 'Servidor Loop funcionando!'
  });
});

module.exports = router;
