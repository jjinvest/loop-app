'use strict';
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
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
 let estado='PENDING',posts=0,gets=0,clienteRemoto='cus_SandboxMontagem1';
 const fetchImpl=async(url,opts)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/payments'));
  if(opts.method==='POST'){posts++;assert.equal(JSON.parse(opts.body).value,250);}
  else gets++;
  return {ok:true,json:async()=>({id:'pay_SandboxMontagem1',billingType:'PIX',value:250,
   externalReference:'LOOPLAB-'+PEDIDO,status:estado,customer:clienteRemoto})};
 };
 const m=montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,
  agora:()=> '2026-10-26T09:10:00.000Z',
  apiKey:'CHAVE_FICTICIA_APENAS_TESTES_123',fetchImpl});
 await m.cobrancas.criar({pedidoId:PEDIDO,origem:'CARRINHO',clienteAsaasId:'cus_SandboxMontagem1'});
 await assert.rejects(m.conciliador.processar(PEDIDO));
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 estado='RECEIVED';
 clienteRemoto='cus_ClienteDiferente';
 await assert.rejects(m.conciliador.processar(PEDIDO),e=>e.codigo==='DADOS_PAGAMENTO_SANDBOX_DIVERGENTES');
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 clienteRemoto='cus_SandboxMontagem1';
 const [a,b]=await Promise.all([m.conciliador.processar(PEDIDO),m.conciliador.processar(PEDIDO)]);
 assert.equal(a.criada,true);
 assert.equal(b.repetida,true);
 assert.equal(a.posicaoId,b.posicaoId);
 assert.equal(a.contaId,titular.contaId);
 assert.equal(posts,1);
 assert.equal(gets,4);
 assert.equal(a.confirmacaoIndividualObrigatoria,true);
 assert.equal(a.cpfConfirmadoAutomaticamente,false);
 estado='REFUNDED';
 await assert.rejects(m.conciliador.processar(PEDIDO));
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 estado='RECEIVED';
 await assert.rejects(m.conciliador.processar(PEDIDO));
 assert.equal(posts,1);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
});

test('montagem recusa provedor falso ou ambiente de producao',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const banco=repo.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const titularidade=new PedidosTitularidadeDemoSQLite({banco,contas});
 assert.throws(()=>montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,
  provedor:{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',criarCobrancaPix:()=>{},consultarCobranca:()=>{}}}),
  /Somente provedor Asaas Sandbox/);
});

test('reabertura SQLite preserva posicao unica e titular no replay Asaas',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-asaas-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const caminho=path.join(pasta,'loop.sqlite');
 const pedidoId='pedido-reinicio-asaas';
 let posts=0,gets=0,estado='PENDING';
 const fetchImpl=async(url,opts)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/payments'));
  if(opts.method==='POST')posts++;else gets++;
  return {ok:true,json:async()=>({
   id:'pay_ReinicioSandbox01',billingType:'PIX',value:250,
   externalReference:'LOOPLAB-'+pedidoId,status:estado
  })};
 };
 const abrir=()=>{
  const repo=new RepositorioCatalogoSQLite({caminho});
  const banco=repo.banco;
  const contas=new ContasParticipantesDemoSQLite({banco});
  const titularidade=new PedidosTitularidadeDemoSQLite({banco,contas});
  const m=montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,
   apiKey:'CHAVE_FICTICIA_APENAS_TESTES_123',fetchImpl});
  return {repo,banco,contas,titularidade,m};
 };
 let s=abrir();
 s.banco.exec('CREATE TABLE admin_carrinho_loop_demo(pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 s.banco.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run(pedidoId,25000);
 const titular=s.contas.cadastrar({nome:'Titular Reinicio',email:'titular-reinicio@exemplo.invalid',senha:'senha-ficticia-2026'});
 s.titularidade.preparar({pedidoId,contaId:titular.contaId,produtoId:'curso-reinicio',valorCentavos:25000});
 await s.m.cobrancas.criar({pedidoId,origem:'CARRINHO',clienteAsaasId:'cus_ReinicioSandbox01'});
 await assert.rejects(s.m.conciliador.processar(pedidoId));
 estado='RECEIVED';
 const primeira=await s.m.conciliador.processar(pedidoId);
 assert.equal(primeira.criada,true);
 assert.equal(primeira.contaId,titular.contaId);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 s.repo.fechar();
 s=abrir();
 const repetida=await s.m.conciliador.processar(pedidoId);
 assert.equal(repetida.repetida,true);
 assert.equal(repetida.posicaoId,primeira.posicaoId);
 assert.equal(repetida.contaId,titular.contaId);
 assert.equal(repetida.confirmacaoIndividualObrigatoria,true);
 assert.equal(repetida.cpfConfirmadoAutomaticamente,false);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(posts,1);
 assert.ok(gets>=3);
 s.repo.fechar();
});
