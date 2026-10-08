const express = require('express');

const app = express();
const participantsRouter = require('./routes/participants');
const healthRouter = require('./routes/health');
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/health', healthRouter);
app.use('/participants', participantsRouter);

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
