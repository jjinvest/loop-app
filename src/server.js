const express = require('express');
const path = require('path');
const { bloquearMutacoesSimuladas } = require('./middleware/proteger-simulacao');

const healthRouter = require('./routes/health');
const catracaRouter = require('./routes/catraca');
const filasRouter = require('./routes/filas');
const participantsRouter = require('./routes/participants');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/health', healthRouter);
app.use('/catraca', bloquearMutacoesSimuladas, catracaRouter);
app.use('/filas', bloquearMutacoesSimuladas, filasRouter);
app.use('/participants', participantsRouter);

// Serve a interface web existente do LOOP.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.json({
    app: 'LOOP',
    status: 'online'
  });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOOP rodando na porta ${PORT}`);
  });
}

module.exports = app;
