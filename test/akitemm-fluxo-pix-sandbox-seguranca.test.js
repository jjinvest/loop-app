'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AsaasSandboxLojaV6,ASAAS_SANDBOX_BASE}=
 require('../src/domain/asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=
 require('../src/domain/cobrancas-akitemm-asaas-sandbox-v6');
const {CaixaAvisosAsaasSandboxSQLite}=
 require('../src/domain/caixa-avisos-asaas-sandbox-sqlite');
const TOKEN='asaas-token-SANDBOX-apenas-fixture-nao-real-2026';
const CODIGO='LOOPLAB-';
function contexto(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec("CREATE TABLE admin_pdf_demo_pedidos (pedido_id TEXT PRIMARY KEY,preco_centavos INTEGER);");
 db.exec("CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER);");
 db.prepare('INSERT INTO admin_pdf_demo_pedidos VALUES(?,?)').run('pdf-teste-secure',3990);
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('carrinho-teste-secure',25000);
 const remoto=new Map(),chamadas=[];
 let proximaFalha=null;
 let sobrescrita=null;
 const fetchImpl=async(url,opt)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/'));
  assert.equal(opt.redirect,'error');
  assert.ok(opt.headers.access_token.startsWith('CHAVE_FICTICIA'));
  chamadas.push({metodo:opt.method,caminho:url.slice(ASAAS_SANDBOX_BASE.length)});
  if(proximaFalha){const f=proximaFalha;proximaFalha=null;throw f;}
  if(opt.method==='POST'&&url.endsWith('/payments')){
   const body=JSON.parse(opt.body);
   assert.equal(body.billingType,'PIX');
   assert.equal(body.description,'AKITEMM - cobranca EXCLUSIVAMENTE SANDBOX');
   assert.match(body.externalReference,/^LOOPLAB-[a-z0-9-]+$/);
   const id='pay_'+body.externalReference.slice(CODIGO.length).replace(/-/g,'_');
   const p={id,billingType:'PIX',value:body.value,
    externalReference:body.externalReference,status:'PENDING'};
   remoto.set(id,p);
   return {ok:true,json:async()=>({...p})};
  }
  const match=url.match(/\/payments\/([A-Za-z0-9_-]+)(\/pixQrCode)?$/);
  if(opt.method==='GET'&&match?.[2]){
   return {ok:true,json:async()=>({payload:'00020126580014BR.GOV.BCB.PIX6304A14B'})};
  }
  if(opt.method==='GET'&&match){
   const p=remoto.get(match[1]);
   return {ok:!!p,status:p?200:404,json:async()=>({...p,...(sobrescrita||{})})};
  }
  throw Error('Caminho nao esperado: '+url);
 };
 const provedor=new AsaasSandboxLojaV6({
  apiKey:'CHAVE_FICTICIA_SANDBOX_2026_NAO_REAL',
  fetchImpl
 });
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({
  banco:db,provedor,agora:()=> '2026-10-22T19:00:00.000Z'
 });
 const avisos=new CaixaAvisosAsaasSandboxSQLite({banco:db,authToken:TOKEN});
 return {db,servico,provedor,avisos,remoto,chamadas,
  falharProxima:(erro)=>{proximaFalha=erro;},
  sobrescrever:(campos)=>{sobrescrita=campos;}};
}
async function criar(ctx,origem='CARRINHO'){
 return ctx.servico.criar({
  pedidoId:origem==='CARRINHO'?'carrinho-teste-secure':'pdf-teste-secure',
  origem,clienteAsaasId:'cus_ApenasTeste01234'
 });
}
function zerados(resultado){
 for(const campo of ['dinheiroRealRecebidoCentavos','valorTransferidoParaLoopCentavos',
   'creditoFilaCriado','saqueRealDisponivelCentavos'])assert.equal(resultado[campo],0,campo);
 assert.equal(resultado.pixRealExecutado,false);
}
test('Pix laboratório: dois pedidos congelados geram duas cobranças, nunca dinheiro ou posição',async t=>{
 const c=contexto(t);
 const a=await criar(c,'PDF'),b=await criar(c,'CARRINHO');
 assert.equal(a.valorCentavos,3990);
 assert.equal(b.valorCentavos,25000);
 assert.equal(a.status,'PENDENTE_SANDBOX');
 assert.equal(b.status,'PENDENTE_SANDBOX');
 zerados(a);zerados(b);
 assert.equal((await criar(c,'PDF')).repetida,true);
 assert.equal((await criar(c,'CARRINHO')).repetida,true);
 assert.equal(c.chamadas.filter(x=>x.metodo==='POST').length,2);
 assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'admin_ponte_compras_demo'").get().n,0);
});
test('Pix laboratório: CONFIRMED ainda é pendência; RECEIVED não cria saldo real',async t=>{
 const c=contexto(t);const pedido=await criar(c);
 const p=c.remoto.get(pedido.pagamentoId);
 p.status='CONFIRMED';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'PENDENTE_SANDBOX');
 p.status='RECEIVED';
 const informado=await c.servico.conferir(pedido.pedidoId);
 assert.equal(informado.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 zerados(informado);
 assert.equal(c.servico.historico(pedido.pedidoId).conferencias.length,2);
});
test('Pix laboratório: resposta PENDING atrasada não regride recebimento; estorno prevalece',async t=>{
 const c=contexto(t);const pedido=await criar(c);
 const p=c.remoto.get(pedido.pagamentoId);
 p.status='RECEIVED';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 p.status='PENDING';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 p.status='MISTERIOSO';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 p.status='REFUNDED';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'REVERSAO_INFORMADA_SANDBOX');
 p.status='RECEIVED';
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'REVERSAO_INFORMADA_SANDBOX');
 zerados(c.servico.consultar(pedido.pedidoId));
 assert.equal(c.servico.historico(pedido.pedidoId).conferencias.length,5);
});
test('Pix laboratório: webhook autenticado repetido não autoriza pagamento nem modifica pedido',async t=>{
 const c=contexto(t);const pedido=await criar(c);
 const evento={id:'evt_LOOP_PIX_SANDBOX_0001',event:'PAYMENT_RECEIVED',
  payment:{id:pedido.pagamentoId,billingType:'PIX',status:'RECEIVED',
   value:250,externalReference:CODIGO+pedido.pedidoId}};
 const corpoBruto=Buffer.from(JSON.stringify(evento));
 assert.throws(()=>c.avisos.registrar({
  cabecalhoToken:'token-invalido',corpoBruto
 }),{codigo:'TOKEN_WEBHOOK_INVALIDO'});
 const a=c.avisos.registrar({cabecalhoToken:TOKEN,corpoBruto});
 const b=c.avisos.registrar({cabecalhoToken:TOKEN,corpoBruto});
 assert.equal(a.registrado,true);assert.equal(b.repetido,true);
 assert.equal(c.avisos.listar().length,1);
 assert.equal(c.servico.consultar(pedido.pedidoId).status,'PENDENTE_SANDBOX');
 assert.equal(c.servico.historico(pedido.pedidoId).conferencias.length,0);
 assert.equal(a.autorizacaoDePosicao,false);
 assert.equal(a.autorizacaoDeSaque,false);
 zerados(c.servico.consultar(pedido.pedidoId));
});
test('Pix laboratório: preço, referencia e modalidade divergentes bloqueiam reconsulta',async t=>{
 const c=contexto(t);const pedido=await criar(c);
 for(const alterado of [
  {value:249.99},
  {externalReference:'LOOPLAB-outra-compra'},
  {billingType:'BOLETO'}
 ]){
  c.sobrescrever(alterado);
  await assert.rejects(()=>c.servico.conferir(pedido.pedidoId),
   {codigo:'DADOS_PAGAMENTO_SANDBOX_DIVERGENTES'});
  assert.equal(c.servico.consultar(pedido.pedidoId).status,'PENDENTE_SANDBOX');
  assert.equal(c.servico.historico(pedido.pedidoId).conferencias.length,0);
 }
 c.sobrescrever(null);
 assert.equal((await c.servico.conferir(pedido.pedidoId)).status,'PENDENTE_SANDBOX');
});
test('Pix laboratório: timeout na criação reserva pedido e impede segunda cobrança',async t=>{
 const c=contexto(t);
 c.falharProxima(Error('desconexao de laboratorio'));
 await assert.rejects(()=>criar(c,'PDF'),{codigo:'ASAAS_SANDBOX_REDE_INCONCLUSIVA'});
 const r=await criar(c,'PDF');
 assert.equal(r.repetida,true);
 assert.equal(r.status,'CRIACAO_INDETERMINADA_SANDBOX');
 assert.equal(c.chamadas.filter(x=>x.metodo==='POST').length,1);
 await assert.rejects(()=>c.servico.conferir(r.pedidoId),
  {codigo:'CRIACAO_INDETERMINADA_VERIFICAR_ASAAS'});
 zerados(r);
});
test('Pix laboratório: duas tentativas concorrentes de um pedido geram uma única POST',async t=>{
 const c=contexto(t);
 const resultados=await Promise.all([criar(c),criar(c),criar(c)]);
 assert.equal(c.chamadas.filter(x=>x.metodo==='POST').length,1);
 assert.equal(resultados.filter(x=>x.repetida===false).length,1);
 assert.equal(resultados.filter(x=>x.repetida===true).length,2);
 assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM akitemm_sandbox_cobrancas').get().n,1);
 assert.ok(resultados.every(x=>x.creditoFilaCriado===0));
});
test('Pix laboratório: compra inexistente ou cliente trocado não altera cobrança',async t=>{
 const c=contexto(t);
 await assert.rejects(()=>c.servico.criar({
  pedidoId:'nao-existe-000',origem:'CARRINHO',clienteAsaasId:'cus_ClienteTeste001'
 }),{codigo:'PEDIDO_AKITEMM_INEXISTENTE'});
 const pedido=await criar(c);
 await assert.rejects(()=>c.servico.criar({
  pedidoId:pedido.pedidoId,origem:'CARRINHO',clienteAsaasId:'cus_OutraPessoa000'
 }),{codigo:'CONFLITO_COBRANCA'});
 assert.equal(c.chamadas.filter(x=>x.metodo==='POST').length,1);
 zerados(c.servico.consultar(pedido.pedidoId));
});
test('Pix laboratório: QR Code de teste fica fora do checkout e não prova recebimento',async t=>{
 const c=contexto(t);const r=await criar(c);
 const pix=await c.provedor.obterPix(r.pagamentoId);
 assert.equal(pix.ambiente,'ASAAS_SANDBOX_EXCLUSIVO');
 assert.match(pix.aviso,/NAO ENVIAR DINHEIRO REAL/);
 assert.equal(c.servico.consultar(r.pedidoId).status,'PENDENTE_SANDBOX');
 zerados(c.servico.consultar(r.pedidoId));
});
