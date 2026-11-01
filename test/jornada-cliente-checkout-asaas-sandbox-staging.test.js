'use strict';
// E2E por HTTP da MESMA CONTA do laboratorio ate a cobranca SANDBOX
// e visao Meus Pedidos, sem checkout publico nem credencial Asaas real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {criarAppCheckoutStagingLocal,provisionarContaEnsaio}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {vincularPrepedidoExistente,enviarSandbox}=
 require('../scripts/preparar-e-enviar-webhook-asaas-sandbox-staging');
const {reconsultarEvento,inspecionarEvento}=
 require('../scripts/conferir-webhook-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const SENHA='TesteJornadaConectadaSandbox2026Valida!';
const TOKEN='TokenWebhookUnicoJornadaConectada2026__';
const CLIENTE='cus_HomologacaoJornadaStaging00001';
const PAY='pay_HomologacaoJornadaStaging00001';
test('cliente prepara pedido -> operador associa Sandbox -> Meus Pedidos mostra estado reconsultado',async t=>{
 const pasta=mkdtempSync(path.join(tmpdir(),'loop-compra-asaas-cliente-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'homologacao.sqlite');
 await provisionarContaEnsaio({arquivo,nomeLogin:'comprador-teste-alpha',
  senha:SENHA,autorizado:true});
 await provisionarContaEnsaio({arquivo,nomeLogin:'comprador-teste-beta',
  senha:SENHA,autorizado:true});
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const {app}=criarAppCheckoutStagingLocal({banco});
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(async()=>{await new Promise(done=>servidor.close(done));banco.close();});
 const raiz='http://127.0.0.1:'+servidor.address().port+'/staging';
 async function http(rota,{method='GET',cookie,csrf,body,key}={}){
  const r=await fetch(raiz+rota,{method,headers:{
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(cookie?{Cookie:cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 }
 async function login(nomeLogin){
  const r=await http('/entrar',{method:'POST',body:{nomeLogin,senha:SENHA}});
  assert.equal(r.status,200,JSON.stringify(r.data));
  return {id:r.data.titularId,cookie:r.cookie.split(';')[0],csrf:r.data.csrf};
 }
 const a=await login('comprador-teste-alpha');
 const b=await login('comprador-teste-beta');
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const quote=await http('/cotacao',{method:'POST',body:entrada});
 assert.equal(quote.status,200);
 assert.equal(quote.data.totalCentavos,25000);
 const draft=await http('/rascunhos',{method:'POST',cookie:a.cookie,csrf:a.csrf,
  key:'comprador-asaas-staging-vinculo-01',body:entrada});
 assert.equal(draft.status,201,JSON.stringify(draft.data));
 const prepared=await http('/prepedidos',{method:'POST',cookie:a.cookie,csrf:a.csrf,
  body:{rascunhoId:draft.data.intencao.pedidoId}});
 assert.equal(prepared.status,201,JSON.stringify(prepared.data));
 const prepedidoId=prepared.data.prepedido.prepedidoId;
 assert.equal((await http('/prepedidos/'+prepedidoId+'/sandbox',{cookie:a.cookie})).data.estado,
  'SEM_COBRANCA_SANDBOX');
 assert.equal((await http('/meus-pedidos',{cookie:b.cookie})).data.pedidos.length,0);
 assert.equal((await http('/meus-pedidos')).status,401);
 const minhaListaInicial=await http('/meus-pedidos',{cookie:a.cookie});
 assert.equal(minhaListaInicial.status,200);
 assert.equal(minhaListaInicial.data.pedidos.length,1);
 assert.equal(minhaListaInicial.data.pedidos[0].statusHomologacao,'SEM_COBRANCA_SANDBOX');
 assert.equal(minhaListaInicial.data.pedidos[0].compraReal,false);
 assert.equal(minhaListaInicial.data.consultaPSPRealizadaNestaLeitura,false);
 assert.equal((await http('/prepedidos/'+prepedidoId+'/sandbox',{cookie:b.cookie})).status,404);
 const opts={arquivo,titularId:a.id,prepedidoId,clienteAsaasId:CLIENTE};
 await assert.rejects(vincularPrepedidoExistente(opts),{codigo:'VINCULO_SANDBOX_NAO_AUTORIZADO'});
 await assert.rejects(vincularPrepedidoExistente({...opts,titularId:b.id,
  execucaoLiberada:true}),{codigo:'PREPEDIDO_DO_TITULAR_NAO_ENCONTRADO'});
 const vinculo=await vincularPrepedidoExistente({...opts,execucaoLiberada:true});
 assert.equal(vinculo.estado,'PREPARADA');
 assert.equal(vinculo.valorCentavos,25000);
 assert.equal(vinculo.posicoesCriadas,0);
 assert.equal((await vincularPrepedidoExistente({...opts,execucaoLiberada:true})).repetido,true);
 let criado=0,consultado=0;
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({pedidoId,clienteAsaasId,valorCentavos}){
   criado++;
   assert.equal(pedidoId,prepedidoId);
   assert.equal(clienteAsaasId,CLIENTE);
   assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAY,valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(paymentId){
   consultado++;
   assert.equal(paymentId,PAY);
   return {pagamentoId:PAY,status:'RECEIVED',billingType:'PIX',
    externalReference:'LOOPLAB-'+prepedidoId,
    clienteAsaasId:CLIENTE,valorCentavos:25000};
  }
 };
 const sent=await enviarSandbox({arquivo,titularId:a.id,prepedidoId,
  provedor,execucaoLiberada:true});
 assert.equal(sent.estado,'PENDENTE_SANDBOX');
 assert.equal(criado,1);
 assert.equal((await enviarSandbox({arquivo,titularId:a.id,prepedidoId,
  provedor,execucaoLiberada:true})).repetido,true);
 assert.equal(criado,1);
 const statusPendente=await http('/prepedidos/'+prepedidoId+'/sandbox',{cookie:a.cookie});
 assert.equal(statusPendente.status,200);
 assert.equal(statusPendente.data.estado,'PENDENTE_SANDBOX');
 assert.equal(statusPendente.data.posicoesCriadas,0);
 assert.equal(statusPendente.data.consultaRemotaExecutada,false);
 const minhaListaPendente=await http('/meus-pedidos',{cookie:a.cookie});
 assert.equal(minhaListaPendente.data.pedidos[0].statusHomologacao,'PENDENTE_SANDBOX');
 assert.equal(minhaListaPendente.data.pedidos[0].statusInformadoPeloPSP,null);
 assert.equal(consultado,0);
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const eventoId='evt_JornadaAsaasCheckoutStaging001';
 inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(
  JSON.stringify({id:eventoId,event:'PAYMENT_RECEIVED',payment:{id:PAY}})
 )});
 assert.equal(inspecionarEvento({arquivo,eventoId}).recebidoLocalmente,true);
 const conferido=await reconsultarEvento({arquivo,eventoId,
  tokenWebhook:TOKEN,provedor,execucaoLiberada:true});
 assert.equal(conferido.estadoReconsulta,'CONCLUIDO');
 assert.equal(conferido.ultimaSituacaoSandbox,'RECEIVED');
 assert.equal(conferido.entregaPeloAsaasComprovada,false);
 assert.equal(conferido.pagamentoReal,false);
 assert.equal(conferido.posicoesCriadas,0);
 assert.equal(criado,1);
 assert.equal(consultado,1);
 const final=await http('/prepedidos/'+prepedidoId+'/sandbox',{cookie:a.cookie});
 assert.equal(final.status,200);
 assert.equal(final.data.estado,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(final.data.cobrancaSandbox.ultimaConsultaSandbox.statusAsaas,'RECEIVED');
 assert.equal(final.data.posicoesCriadas,0);
 assert.equal(final.data.pagamentoReal,false);
 assert.equal(final.data.consultaRemotaExecutada,false);
 const meusPedidos=await http('/meus-pedidos',{cookie:a.cookie});
 assert.equal(meusPedidos.status,200);
 assert.equal(meusPedidos.data.pedidos[0].statusHomologacao,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(meusPedidos.data.pedidos[0].statusInformadoPeloPSP,'RECEIVED');
 assert.equal(meusPedidos.data.pedidos[0].posicoesCriadas,0);
 assert.equal(meusPedidos.data.pedidos[0].compraReal,false);
 assert.equal(meusPedidos.data.consultaPSPRealizadaNestaLeitura,false);
 assert.equal(consultado,1,'abrir Meus Pedidos nao faz GET no PSP');
 assert.equal((await http('/prepedidos/'+prepedidoId+'/sandbox',{cookie:b.cookie})).status,404);
 const lista=await http('/prepedidos',{cookie:a.cookie});
 assert.equal(lista.data.prepedidos.length,1);
 assert.equal(lista.data.prepedidos[0].prepedidoId,prepedidoId);
 assert.equal((await http('/prepedidos',{cookie:b.cookie})).data.prepedidos.length,0);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 // Nova conexao e novo processo HTTP logico leem o estado do pagamento:
 // o usuario nao perde o acompanhamento apos reiniciar o servico.
 const reaberto=new DatabaseSync(arquivo);
 reaberto.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 const segundaApp=criarAppCheckoutStagingLocal({banco:reaberto});
 const outroServidor=segundaApp.app.listen(0,'127.0.0.1');
 await once(outroServidor,'listening');
 t.after(async()=>{await new Promise(done=>outroServidor.close(done));
  reaberto.close();});
 const origemReaberta='http://127.0.0.1:'+outroServidor.address().port;
 const novamente=await fetch(origemReaberta+'/staging/meus-pedidos',{
  headers:{Cookie:a.cookie}
 });
 assert.equal(novamente.status,200);
 const estadoReaberto=await novamente.json();
 assert.equal(estadoReaberto.pedidos.length,1);
 assert.equal(estadoReaberto.pedidos[0].prepedidoId,prepedidoId);
 assert.equal(estadoReaberto.pedidos[0].statusHomologacao,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(estadoReaberto.pedidos[0].statusInformadoPeloPSP,'RECEIVED');
 assert.equal(consultado,1,'leitura apos reinicio nao deve reconsultar PSP');
 const publico=require('../src/server');
 const serverPublico=publico.listen(0,'127.0.0.1');
 await once(serverPublico,'listening');
 t.after(()=>new Promise(done=>serverPublico.close(done)));
 const origemPublica='http://127.0.0.1:'+serverPublico.address().port;
 assert.equal((await fetch(origemPublica+'/api/checkout/finalizar',{method:'POST'})).status,503);
 assert.equal((await fetch(origemPublica+'/staging/prepedidos')).status,404);
});
