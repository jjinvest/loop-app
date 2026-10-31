const express = require('express');
const path = require('path');
const { bloquearMutacoesSimuladas } = require('./middleware/proteger-simulacao');

const healthRouter = require('./routes/health');
const catracaRouter = require('./routes/catraca');
const filasRouter = require('./routes/filas');
const participantsRouter = require('./routes/participants');
const catalogoRouter = require('./routes/catalogo');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.set('X-Frame-Options','DENY');
  next();
});
app.use(express.json({limit:'32kb'}));

app.use('/health', healthRouter);
app.use('/catraca', bloquearMutacoesSimuladas, catracaRouter);
app.use('/filas', bloquearMutacoesSimuladas, filasRouter);
app.use('/participants', participantsRouter);
app.use('/catalogo', catalogoRouter);

// Laboratorio de clientes: opt-in e apenas requisicoes locais.
if(process.env.LOOP_CLIENTES_LAB==='SIM'){
  const {DatabaseSync}=require('node:sqlite');
  const {ContasParticipantesDemoSQLite}=require('./domain/contas-participantes-demo-sqlite');
  const {PedidosTitularidadeDemoSQLite}=require('./domain/pedidos-titularidade-demo-sqlite');
  const {criarRouterClientePedidosLab}=require('./routes/cliente-pedidos-lab');
  const arquivo=process.env.LOOP_CLIENTES_LAB_SQLITE;
  if(!arquivo)throw new Error('LOOP_CLIENTES_LAB_SQLITE obrigatorio');
  const banco=new DatabaseSync(arquivo);
  const contas=new ContasParticipantesDemoSQLite({banco});
  const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
  const router=criarRouterClientePedidosLab({contas,pedidos});
  app.use('/api/cliente-lab',(req,res,next)=>{
    const endereco=req.socket.remoteAddress;
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(endereco))
      return res.sendStatus(403);
    next();
  },router);
}

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
