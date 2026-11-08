'use strict';
// Plano Celcoin SEM credenciais, SEM HTTP e SEM qualquer ordem Pix.
// O proprio livro financeiro do motor fornece a fotografia historica.
const {createHash}=require('node:crypto');
const {planejarRecebimentoTresBancos}=require('./plano-roteamento-tres-bancos-lab');
const MAX=100000000000;
function falha(code){const e=new Error(code);e.codigo=code;throw e;}
const int=v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX;
const SANDBOX='https://sandbox.openfinance.celcoin.dev';
const API='POST /baas/v2/pix/payment'; // BaaS Pix Cash-out: API, nao chamada.
function planoCelcoinPorFotografiaLab({fotografia}={}){
 const p=planejarRecebimentoTresBancos({fotografia});
 const pendencias=[];
 const falta=(cond,nome)=>{if(cond)pendencias.push(nome);};
 falta(p.alerta!=='PLANO_CONTABIL_CONSISTENTE',p.alerta);
 falta(!/^hom-[a-f0-9-]{36}$/.test(p.prepedidoId||''),'PEDIDO_NAO_VINCULADO');
 // Assinatura do plano e independente do motor, mas a foto que o gera e
 // preservada no mesmo SQLite. Idempotencia por pedido/destino.
 const id=destino=>'celcoin-lab-'+createHash('sha256')
  .update([p.prepedidoId,destino,p.valorBrutoCotadoCentavos].join('|'))
  .digest('hex').slice(0,32);
 const pedir=(destino,valor,tipo)=>({
  clientCodePrevisto:id(destino),destino,valorPrevistoCentavos:valor,
  tipo,temDadosBancarios:false,
  status:'NAO_ENVIADO',comprovanteReal:false
 });
 const ordens=pendencias.length?[]:[
  pedir('LOOP_INTER',p.loopReservarCentavos,'TRANSFERENCIA_BANCO_EXTERNO'),
  pedir('FORNECEDOR',p.fornecedorAPagarPrevistoCentavos,'PAGAMENTO_FORNECEDOR'),
  pedir('LOJA_MERCADO_PAGO',p.margemParaMercadoPagoPrevistaCentavos,
   'TRANSFERENCIA_LUCRO_LOJA')
 ].filter(x=>int(x.valorPrevistoCentavos)&&x.valorPrevistoCentavos>0);
 const retencoes=[
  {tipo:'FRETE',centavos:p.freteReservarPrevistoCentavos},
  {tipo:'TRIBUTOS',centavos:p.tributosReservarPrevistoCentavos}
 ];
 const todas=[...ordens.map(x=>x.valorPrevistoCentavos),
  ...retencoes.map(x=>x.centavos)];
 if(!pendencias.length&&(!todas.every(int)||
    todas.reduce((a,v)=>a+v,0)!==p.valorLiquidoPrevistoCentavos))
  falha('CELCOIN_PLANO_NAO_FECHA_COM_LIQUIDO');
 // O terceiro banco nao recebe um percentual arbitrario da compra.
 // Seus movimentos serao autorizados por luzes do motor reconciliadas.
 return {provedorProposto:'CELCOIN',ambiente:'SANDBOX_SEM_CREDENCIAIS',
  prepedidoId:p.prepedidoId,modelo:'DROPSHIPPING_COM_CONTABILIDADE_LOOP',
  valorBrutoCotadoCentavos:p.valorBrutoCotadoCentavos,
  valorLiquidoPrevistoCentavos:p.valorLiquidoPrevistoCentavos,
  valorCentroPrevistoCentavos:p.loopReservarCentavos,
  valorMargemParaMercadoPagoPrevistoCentavos:
   p.margemParaMercadoPagoPrevistaCentavos,
  ordens,retencoes,
  terceiroBanco:{subcontas:['CAIXA_ESQUERDA','CAIXA_DIREITA'],
   conectado:false,transferenciaPorLuzConferida:false,
   valorTransferivelCentavos:0},
  contratoApiPrevisto:{baseSandbox:SANDBOX,operacao:API,
   webhook:'pix-payment-out',
   confirmacao:'WEBHOOK_AUTENTICADO_MAIS_CONSULTA_SE_NECESSARIO',
   consultaStatus:'CONSULTA_PIX_CASH_OUT_A_HOMOLOGAR'},
  bloqueios:[...pendencias,'CREDENCIAIS_CELCOIN_AUSENTES',
   'CONTAS_BANCARIAS_NAO_CONECTADAS',
   'CONCILIACAO_LIQUIDACAO_AUSENTE',
   'KYC_E_AUTORIZACAO_PAGAMENTOS_PENDENTES'],
  reciboRealConfirmado:false,liquidacaoRealConfirmada:false,
  chamadasHttp:0,pixEnviados:0,
  saldosBancariosReaisCentavos:null,prontoParaProducao:false,
  estado:'ENSAIO_LOCAL_SEM_EXECUCAO'};
}
// Reconciliador de MOCK: exercita transicoes reais sem jamais elevar
// autenticidade ou saldo. NAO usar como webhook de producao.
function exercitarWebhooksPixMockCelcoinLab({plano,eventos=[]}={}){
 if(plano?.provedorProposto!=='CELCOIN'||!Array.isArray(plano.ordens)||
    !Array.isArray(eventos)||eventos.length>200)
  falha('CELCOIN_MOCK_INVALIDO');
 const porCodigo=new Map(plano.ordens.map(x=>[x.clientCodePrevisto,x]));
 const ultimo=new Map();
 const vistos=new Map();
 for(const ev of eventos){
  if(typeof ev!=='object'||!ev||Array.isArray(ev)||
     typeof ev.eventoId!=='string'||!/^[a-z0-9_-]{3,80}$/i.test(ev.eventoId)||
     !porCodigo.has(ev.clientCode)||!
     ['PENDING','CONFIRMED','REJECTED','REVERTED'].includes(ev.status)||
     !int(ev.valorCentavos)||ev.valorCentavos!==porCodigo.get(ev.clientCode).valorPrevistoCentavos)
   falha('CELCOIN_MOCK_EVENTO_INVALIDO');
  const assinatura=[ev.clientCode,ev.status,ev.valorCentavos].join('|');
  if(vistos.has(ev.eventoId)){
   if(vistos.get(ev.eventoId)!==assinatura)falha('CELCOIN_MOCK_CONFLITO_EVENTO');
   continue; // webhook repetido nao muda estado
  }
  const anterior=ultimo.get(ev.clientCode)||'NAO_ENVIADO';
  const valido={
   NAO_ENVIADO:['PENDING','CONFIRMED','REJECTED'],
   PENDING:['PENDING','CONFIRMED','REJECTED'],
   CONFIRMED:['CONFIRMED','REVERTED'],
   REJECTED:['REJECTED'],REVERTED:['REVERTED']
  };
  if(!valido[anterior].includes(ev.status))falha('CELCOIN_MOCK_TRANSICAO_INVALIDA');
  vistos.set(ev.eventoId,assinatura);ultimo.set(ev.clientCode,ev.status);
 }
 return {transicoesMockValidas:vistos.size,duplicatasIgnoradas:eventos.length-vistos.size,
  operacoes:plano.ordens.map(x=>({destino:x.destino,
   estadoSimulado:ultimo.get(x.clientCodePrevisto)||'NAO_ENVIADO',
   valorCentavos:x.valorPrevistoCentavos})),
  autenticidadeProvada:false,pagamentosReais:false,pixEnviados:0,
  saldosBancariosReaisCentavos:null,
  utilizavelParaLiberarSaques:false};
}
module.exports={planoCelcoinPorFotografiaLab,exercitarWebhooksPixMockCelcoinLab};
