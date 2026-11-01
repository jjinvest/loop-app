'use strict';
// Homologacao EXTERNA exclusivamente Sandbox, autorizada por flag explicita.
// Compra pelo HTTP local real; nenhuma transferencia, saque ou dinheiro real.
const assert=require('node:assert/strict');const fs=require('node:fs');
const os=require('node:os');const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
const {ASAAS_SANDBOX_BASE}=require('../src/domain/asaas-sandbox-loja-v6');
async function homologarHttpSandbox({ambiente=process.env,fetchImpl=globalThis.fetch}={}){
 const key=ambiente.ASAAS_SANDBOX_API_KEY,cpf=ambiente.ASAAS_SANDBOX_CPF_FICTICIO;
 if(ambiente.LOOP_ASAAS_SANDBOX_HTTP_HOMOLOGAR!=='SIM'||ambiente.NODE_ENV==='production')
  throw Error('HOMOLOGACAO_HTTP_SANDBOX_DESABILITADA');
 if(typeof key!=='string'||!key.startsWith('$aact_hmlg_')||key.length<25||/[\s\r\n]/.test(key))
  throw Error('CHAVE_EXCLUSIVAMENTE_SANDBOX_OBRIGATORIA');
 if(typeof cpf!=='string'||!/^\d{11}$/.test(cpf))throw Error('CPF_FICTICIO_AUTORIZADO_OBRIGATORIO');
 const referencia='LOOPLAB-HTTP-'+randomUUID().replace(/-/g,'');
 const tokenCallback=randomBytes(32).toString('hex');
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-http-asaas-remoto-'));
 const arquivo=path.join(pasta,'laboratorio.sqlite');
 let m=null;
 const remoto=async(caminho,{method='GET',body}={})=>{
  if(!(/^\/customers$/.test(caminho)||/^\/sandbox\/payment\/pay_[A-Za-z0-9_-]+\/confirm$/.test(caminho)))
   throw Error('OPERACAO_SANDBOX_NAO_PERMITIDA');
  const r=await fetchImpl(ASAAS_SANDBOX_BASE+caminho,{method,redirect:'error',
   headers:{access_token:key,Accept:'application/json','Content-Type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('SANDBOX_HTTP_'+r.status);
  if(caminho.endsWith('/confirm'))return null;
  return r.json();
 };
 try{
  const cliente=await remoto('/customers',{method:'POST',body:{name:'Comprador Ficticio HTTP LOOP',
   cpfCnpj:cpf,externalReference:referencia,notificationDisabled:true}});
  if(!/^cus_[A-Za-z0-9_-]+$/.test(cliente.id||'')||cliente.externalReference!==referencia)
   throw Error('CLIENTE_SANDBOX_DIVERGENTE');
  async function abrir(){
   const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
   if(!repo.buscar('pdf-http-sandbox'))repo.salvar({revisaoEsperada:0,produto:{
    id:'pdf-http-sandbox',nome:'PDF FICTICIO HTTP Sandbox',tipo:'PDF',estado:'PUBLICADO',
    descricao:'Fixture de homologacao, sem produto real',precoCentavos:25000,
    entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,detalhes:[]}});
   let integracao;
   const app=criarAppAdminLaboratorio({repositorio:repo,ambienteSandbox:{},
    webhookAsaasSandbox:{habilitado:true,token:tokenCallback},
    segredo:'administrador-homologacao-sandbox-http-2026-123456789',
    criarCobrancaSandboxTeste:({pedidoId})=>integracao.cobrancas.criar({
     pedidoId,origem:'CARRINHO',clienteAsaasId:cliente.id})});
   integracao=montarIntegracaoAsaasSandboxLoopLab({banco:repo.banco,
    contas:app.locals.contasCompartilhadasLoop,titularidade:app.locals.titularidadeCompartilhadaLoop,
    ponte:app.locals.ponteCompartilhadaLoop,apiKey:key,fetchImpl,
    caixaAvisos:app.locals.caixaAvisosAsaasSandbox});
   const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
   const base='http://127.0.0.1:'+servidor.address().port+'/api/laboratorio/participante';
   return {repo,banco:repo.banco,integracao,contas:app.locals.contasCompartilhadasLoop,
    urlCallback:'http://127.0.0.1:'+servidor.address().port+'/api/laboratorio/webhook-asaas-sandbox',
    async http(rota,{cookie,body,status=200}={}){
     const r=await fetch(base+rota,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante',...(cookie?{Cookie:cookie}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
     assert.equal(r.status,status,'HTTP_LOCAL_STATUS_DIVERGENTE');
     return {dados:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
    },async fechar(){integracao.callbacks?.parar();await new Promise(r=>servidor.close(r));repo.fechar();}};
  }
  m=await abrir();
  const senha='senha-ficticia-homologacao-http-2026';
  const conta=m.contas.cadastrar({nome:'Comprador HTTP Homologacao',email:'comprador-http@example.invalid',senha});
  let {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha}});
  const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
   body:{itens:[{produtoId:'pdf-http-sandbox',quantidade:1}]}})).dados.pedido;
  assert.equal((await m.http('/minha-conta',{cookie})).dados.posicoes.length,0);
  const cobranca=m.integracao.cobrancas.consultar(pedido.pedidoId);
  if(!/^pay_[A-Za-z0-9_-]{5,90}$/.test(cobranca.pagamentoId||''))throw Error('COBRANCA_SANDBOX_INVALIDA');
  await remoto('/sandbox/payment/'+cobranca.pagamentoId+'/confirm',{method:'POST'});
  // A entrega HTTP abaixo e simulada localmente; NAO afirmar que o Asaas
  // chamou um endpoint remoto. O worker, por sua vez, reconsulta a API real.
  const eventoId='evt_CallbackHttp'+randomUUID().replace(/-/g,'');
  const ack=await fetch(m.urlCallback,{method:'POST',headers:{'Content-Type':'application/json',
   'asaas-access-token':tokenCallback},body:JSON.stringify({id:eventoId,event:'PAYMENT_RECEIVED',
   payment:{id:cobranca.pagamentoId,billingType:'PIX',status:'RECEIVED',
    externalReference:'LOOPLAB-'+pedido.pedidoId,value:250}})});
  assert.equal(ack.status,200);assert.equal((await ack.json()).posicaoCriada,false);
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
  for(let tentativa=0;tentativa<20;tentativa++){
   await m.integracao.callbacks.processarLote();
   if(m.integracao.callbacks.consultar(eventoId)?.estado==='CONCLUIDO')break;
   await new Promise(r=>setTimeout(r,1000));
  }
  if(m.integracao.callbacks.consultar(eventoId)?.estado!=='CONCLUIDO')
   throw Error('SANDBOX_CALLBACK_NAO_CONCILIADO');
  const visao=(await m.http('/minha-conta',{cookie})).dados;
  assert.equal(visao.posicoes.length,1);assert.equal(visao.posicoes[0].statusAdesao,'PENDENTE');
  const conciliada=m.banco.prepare('SELECT posicao_id AS posicaoId,conta_id AS contaId FROM admin_ponte_compras_demo WHERE pedido_id=?').get(pedido.pedidoId);
  assert.equal(conciliada.contaId,conta.contaId);
  assert.equal(visao.posicoes[0].posicaoId,conciliada.posicaoId);
  const replay=await m.integracao.conciliador.processar(pedido.pedidoId);
  assert.equal(replay.repetida,true);assert.equal(replay.contaId,conta.contaId);
  await m.fechar();m=null;m=await abrir();
  ({cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha}}));
  await m.integracao.callbacks.processarLote();
  assert.equal(m.integracao.callbacks.consultar(eventoId).estado,'CONCLUIDO');
  const repetida=await m.integracao.conciliador.processar(pedido.pedidoId);
  assert.equal(repetida.repetida,true);assert.equal(repetida.posicaoId,conciliada.posicaoId);
  assert.equal((await m.http('/minha-conta',{cookie})).dados.posicoes.length,1);
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_carrinho_loop_demo').get().n,1);
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_sandbox_cobrancas').get().n,1);
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
  assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
  assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
  return {estado:'APROVADO_HTTP_E_ASAAS_SANDBOX_REMOTO',compraHttpLocal:true,
   cobrancasSandbox:1,valorCentavos:25000,confirmacaoNaApiSandbox:true,
   posicoes:1,statusAdesao:'PENDENTE',replaySemDuplicacao:true,
   titularidadePreservada:true,sqliteReaberto:true,integridadeSqlite:'ok',
   ativacaoAutomatica:false,saquesExecutados:0,pagamentosReais:0,
   callbackHttpLocalAutenticado:true,callbackEnviadoPeloAsaas:false,callbackRemotoTestado:false};
 }finally{if(m)await m.fechar();fs.rmSync(pasta,{recursive:true,force:true});}
}
if(require.main===module)homologarHttpSandbox().then(r=>console.log('ASAAS_HTTP_SANDBOX_RESULTADO='+JSON.stringify(r)))
 .catch(e=>{console.error('ASAAS_HTTP_SANDBOX_FALHOU='+String(e.codigo||e.message).replace(/[^A-Z0-9_]/g,''));process.exitCode=1;});
module.exports={homologarHttpSandbox};
