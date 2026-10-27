'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
const {ASAAS_SANDBOX_BASE}=require('../src/domain/asaas-sandbox-loja-v6');
const PEDIDO='carrinho-montagem-lab';
test('montagem: API Sandbox -> cobranca -> titular -> ponte -> uma posicao SQLite, replay idempotente',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const banco=repo.banco;
 banco.exec('CREATE TABLE IF NOT EXISTS admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 banco.prepare('INSERT INTO admin_carrinho_loop_demo(pedido_id,total_centavos) VALUES(?,?)').run(PEDIDO,25000);
 const contas=new ContasParticipantesDemoSQLite({banco});
 const titular=contas.cadastrar({nome:'Comprador Integracao',email:'comprador-integracao@exemplo.invalid',senha:'senha-ficticia-2026'});
 const titularidade=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=> '2026-10-26T09:00:00.000Z'});
 titularidade.preparar({pedidoId:PEDIDO,contaId:titular.contaId,produtoId:'curso-identificado',valorCentavos:25000});
 let estado='PENDING',posts=0,gets=0;
 const fetchImpl=async(url,opts)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/payments'));
  if(opts.method==='POST'){posts++;assert.equal(JSON.parse(opts.body).value,250);}
  else gets++;
  return {ok:true,json:async()=>({id:'pay_SandboxMontagem1',billingType:'PIX',value:250,
   externalReference:'LOOPLAB-'+PEDIDO,status:estado})};
 };
 const m=montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,
  apiKey:'CHAVE_FICTICIA_APENAS_TESTES_123',fetchImpl});
 await m.cobrancas.criar({pedidoId:PEDIDO,origem:'CARRINHO',clienteAsaasId:'cus_SandboxMontagem1'});
 await assert.rejects(m.conciliador.processar(PEDIDO));
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 estado='RECEIVED';
 const a=await m.conciliador.processar(PEDIDO);
 const b=await m.conciliador.processar(PEDIDO);
 assert.equal(a.criada,true);
 assert.equal(b.repetida,true);
 assert.equal(a.posicaoId,b.posicaoId);
 assert.equal(a.contaId,titular.contaId);
 assert.equal(posts,1);
 assert.equal(gets,3);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
});
