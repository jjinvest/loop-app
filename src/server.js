const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    app: 'Loop',
    status: 'online',
    message: 'Servidor Loop funcionando!'
  });
});

app.listen(PORT, () => {
  console.log(`Loop rodando na porta ${PORT}`);
});
