'use strict';
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
async function main(){
 const key=process.env.ASAAS_SANDBOX_API_KEY;
 const customer=process.env.ASAAS_SANDBOX_CUSTOMER_ID;
 if(!key||!/^cus_[\w-]+$/.test(customer||''))throw Error('SANDBOX_CONFIG_MISSING');
 const db=new DatabaseSync(':memory:');
 try{
  const contas=new ContasParticipantesDemoSQLite({banco:db});
  const titularidade=new PedidosTitularidadeDemoSQLite({banco:db,contas});
  const pedidoId='lab-'+randomUUID().replace(/-/g,'').slice(0,20);
  const conta=contas.cadastrar({nome:'Comprador Laboratorio',email:pedidoId+'@example.invalid',senha:'senha-laboratorio-2026'});
  titularidade.preparar({pedidoId,contaId:conta.contaId,produtoId:'curso-lab',valorCentavos:25000});
  db.exec('CREATE TABLE admin_carrinho_loop_demo(pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
  db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES (?,25000)').run(pedidoId);
  const m=montarIntegracaoAsaasSandboxLoopLab({banco:db,contas,titularidade,apiKey:key});
  await m.cobrancas.criar({pedidoId,origem:'CARRINHO',clienteAsaasId:customer});
  const status=await m.cobrancas.conferir(pedidoId);
  if(status.status!=='RECEBIMENTO_INFORMADO_SANDBOX'){
   console.log('SANDBOX_PENDING: payment must be confirmed by authorized sandbox operator');
   return;
  }
  const a=await m.conciliador.processar(pedidoId);
  const b=await m.conciliador.processar(pedidoId);
  if(a.contaId!==conta.contaId||a.posicaoId!==b.posicaoId||!b.repetida)throw Error('INTEGRATION_MISMATCH');
  console.log('SANDBOX_LINKED_POSITION_OK');
 }finally{db.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={main};
