'use strict';
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
async function main(){
 const key=process.env.ASAAS_SANDBOX_API_KEY;
 if(typeof key!=='string'||!key.startsWith('$aact_hmlg_'))throw Error('SANDBOX_KEY_MISSING');
 const ref='AKITEMM-LOOP-LAB-'+randomUUID().replace(/-/g,'');
 const res=await fetch('https://api-sandbox.asaas.com/v3/customers',{
  method:'POST',redirect:'error',
  headers:{access_token:key,Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify({name:'Comprador Teste LOOP',cpfCnpj:'24971563792',
   externalReference:ref,notificationDisabled:true}),
  signal:AbortSignal.timeout(10000)
 });
 if(!res.ok)throw Error('SANDBOX_CUSTOMER_HTTP_'+res.status);
 const data=await res.json();
 if(!/^cus_[A-Za-z0-9_-]+$/.test(data.id||'')||data.externalReference!==ref)
  throw Error('SANDBOX_CUSTOMER_INVALID');
 const customer=data.id;
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
   const pagamento=m.cobrancas.consultar(pedidoId).pagamentoId;
   if(!/^pay_[A-Za-z0-9_-]{5,90}$/.test(pagamento||''))throw Error('SANDBOX_PAYMENT_INVALID');
   const confirm=await fetch('https://api-sandbox.asaas.com/v3/sandbox/payment/'+pagamento+'/confirm',{
    method:'POST',redirect:'error',headers:{access_token:key,Accept:'application/json'},
    signal:AbortSignal.timeout(10000)
   });
   if(!confirm.ok)throw Error('SANDBOX_CONFIRM_HTTP_'+confirm.status);
   const atualizado=await m.cobrancas.conferir(pedidoId);
   if(atualizado.status!=='RECEBIMENTO_INFORMADO_SANDBOX')throw Error('SANDBOX_NOT_RECEIVED');
  }
  const a=await m.conciliador.processar(pedidoId);
  const b=await m.conciliador.processar(pedidoId);
  if(a.contaId!==conta.contaId||a.posicaoId!==b.posicaoId||!b.repetida)throw Error('INTEGRATION_MISMATCH');
  console.log('SANDBOX_LINKED_POSITION_OK');
 }finally{db.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={main};
