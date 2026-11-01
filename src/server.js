'use strict';
// Nunca permitir inicializar laboratorio ou modo de simulacao num servidor publico.
// As rotas comerciais reais ainda nao foram homologadas para uso em producao.
if(process.env.NODE_ENV==='production'&&
  (process.env.LOOP_CLIENTES_LAB==='SIM'||process.env.LOOP_MODO_SIMULACAO==='1')){
  throw new Error('LOOP_LABORATORIO_INCOMPATIVEL_COM_PRODUCAO');
}

const express = require('express');
const path = require('path');
const { bloquearMutacoesSimuladas } = require('./middleware/proteger-simulacao');

const healthRouter = require('./routes/health');
const catracaRouter = require('./routes/catraca');
const filasRouter = require('./routes/filas');
const participantsRouter = require('./routes/participants');
const { criarRouterCatalogo } = require('./routes/catalogo');
const { RepositorioCatalogoMemoria } = require('./domain/repositorio-catalogo-memoria');
const { listarCatalogo } = require('./domain/catalogo');
const { criarRouterCheckoutPublico } = require('./routes/checkout-publico');

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
// Mesmo catalogo para vitrine e cotacao, sem habilitar pedidos reais.
const repositorioCatalogoPublico=new RepositorioCatalogoMemoria({
  produtos:listarCatalogo()
});
app.use('/catalogo',criarRouterCatalogo({repositorio:repositorioCatalogoPublico}));
app.use('/api/checkout',criarRouterCheckoutPublico({repositorio:repositorioCatalogoPublico}));
// Liveness /health permanece independente. Readiness comercial nunca
// devolve OK sem evidencias homologadas; nao existe override por env.
app.get('/health/ready',(_req,res)=>res.status(503)
 .set('Cache-Control','no-store')
 .set('Retry-After','86400')
 .json({estado:'NAO_PRONTO_PARA_VENDAS',checkoutPublico:false,
  pagamentosReais:false,marcoZeroLiberado:false,
  bloqueios:['CHECKOUT_PUBLICO','ASAAS_REMOTO','BANCO_E_SAQUES',
   'PRODUCAO_E_SEGURANCA','ESCRITORIO_VISUAL','JURIDICO']}));

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
