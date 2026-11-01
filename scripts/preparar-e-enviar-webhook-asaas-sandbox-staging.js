'use strict';
// Homologacao REMOTA futura via tunel HTTPS: preparar SQLite sem rede e,
// somente sob autorizacao explicita separada, enviar UMA cobranca SANDBOX.
// Nao monta checkout publico, nao cria posicao, bonus, saque ou saldo real.
const {openSync,closeSync,existsSync,realpathSync}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR_ENSAIO=/^titular-(?:hom-)?[a-f0-9-]{36}$/;
const CLIENTE=/^cus_[A-Za-z0-9_-]{5,90}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function validarAmbiente(){
 if(process.env.NODE_ENV==='production')throw falha('HOMOLOGACAO_VETADA_EM_PRODUCAO');
}
function validarArquivo(arquivo){
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||
    !/\.sqlite$/.test(arquivo)||arquivo.includes('\0'))
  throw falha('CAMINHO_SQLITE_STAGING_INVALIDO');
 try{realpathSync(path.dirname(arquivo));}
 catch{throw falha('PASTA_SQLITE_STAGING_INEXISTENTE');}
}
function criarCatalogoFicticio(){
 return new RepositorioCatalogoMemoria({produtos:[{
  id:'pdf-homologacao-webhook-250',nome:'PDF Ficticio de Homologacao',
  tipo:'PDF',estado:'PUBLICADO',
  descricao:'Somente ensaio no Sandbox. Nenhuma venda real.',
  precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],detalhes:[],videoApresentacaoUrl:null
 }]});
}
async function preparar({arquivo,clienteAsaasId,execucaoLiberada=false}={}){
 validarAmbiente();
 if(execucaoLiberada!==true)throw falha('PREPARACAO_NAO_AUTORIZADA');
 validarArquivo(arquivo);
 if(typeof clienteAsaasId!=='string'||!CLIENTE.test(clienteAsaasId))
  throw falha('CLIENTE_ASAAS_SANDBOX_TESTE_OBRIGATORIO');
 // Sempre usar arquivo NOVO: nunca alterar banco existente de clientes.
 if(existsSync(arquivo))throw falha('BASE_STAGING_JA_EXISTE');
 let descritor;
 try{descritor=openSync(arquivo,'wx',0o600);}
 catch{throw falha('BASE_STAGING_JA_EXISTE_OU_SEM_ACESSO');}
 closeSync(descritor);
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  const intencoes=new IntencoesCheckoutSQLite({banco});
  const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const titularId='titular-hom-'+randomUUID();
  const catalogo=criarCatalogoFicticio();
  const entrada={itens:[{produtoId:'pdf-homologacao-webhook-250',quantidade:1}]};
  const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
  if(cotacao.totalCentavos!==25000||cotacao.pagamentoReal!==false)
   throw falha('COTACAO_SANDBOX_INCONSISTENTE');
  const rascunho=intencoes.criar({titularId,
   chaveIdempotencia:'hmlg-webhook-'+randomUUID(),entrada,cotacao});
  const result=await prePedidos.preparar({titularId,
   rascunhoId:rascunho.intencao.pedidoId,repositorioCatalogo:catalogo});
  const prepedidoId=result.prepedido.prepedidoId;
  const reserva=ponte.preparar({titularId,prepedidoId,clienteAsaasId});
  if(reserva.registro.estado!=='PREPARADA')throw falha('RESERVA_SANDBOX_INCONSISTENTE');
  return {estado:'PREPARADA_SEM_COBRANCA',prepedidoId,titularId,
   valorCentavos:25000,ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   codigoPagamentoCriado:false,checkoutPublico:false,
   pagamentosReais:0,posicoesCriadas:0};
 }finally{banco.close();}
}
// Conecta um PREPEDIDO EXISTENTE da sessao de comprador ficticio a
// um cliente da API Asaas Sandbox. Sem rede: operador responsavel pela
// identidade de teste deve fazer esse vinculo de maneira consciente.
async function vincularPrepedidoExistente({
 arquivo,titularId,prepedidoId,clienteAsaasId,execucaoLiberada=false
}={}){
 validarAmbiente();
 if(execucaoLiberada!==true)throw falha('VINCULO_SANDBOX_NAO_AUTORIZADO');
 validarArquivo(arquivo);
 if(!existsSync(arquivo)||!PREPEDIDO.test(prepedidoId||'')||
    !TITULAR_ENSAIO.test(titularId||'')||
    typeof clienteAsaasId!=='string'||!CLIENTE.test(clienteAsaasId))
  throw falha('VINCULO_PREPEDIDO_SANDBOX_INVALIDO');
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  const temConta=banco.prepare([
   "SELECT 1 AS ok FROM sqlite_master WHERE type='table'",
   "AND name='akitemm_checkout_staging_contas'"
  ].join(' ')).get();
  if(!temConta)throw falha('CONTA_CLIENTE_STAGING_INEXISTENTE');
  const titular=banco.prepare(
   'SELECT id FROM akitemm_checkout_staging_contas WHERE id=?'
  ).get(titularId);
  if(!titular)throw falha('CONTA_CLIENTE_STAGING_INEXISTENTE');
  new IntencoesCheckoutSQLite({banco});
  const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
  const pedido=prePedidos.consultar({titularId,prepedidoId});
  if(!pedido)throw falha('PREPEDIDO_DO_TITULAR_NAO_ENCONTRADO');
  if(pedido.totalCentavos!==25000||
     pedido.estado!=='AGUARDANDO_HOMOLOGACAO_EXTERNA')
   throw falha('PREPEDIDO_INELEGIVEL_PARA_HOMOLOGACAO');
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const resultado=ponte.preparar({titularId,prepedidoId,clienteAsaasId});
  return {estado:resultado.registro.estado,
   prepedidoId,valorCentavos:resultado.registro.valorCentavos,
   repetido:resultado.repetido,
   somenteSandbox:true,pagamentoReal:false,checkoutPublico:false,
   posicoesCriadas:0};
 }finally{banco.close();}
}
async function enviarSandbox({
 arquivo,titularId,prepedidoId,execucaoLiberada=false,
 apiKey,provedor=null
}={}){
 validarAmbiente();
 if(execucaoLiberada!==true)throw falha('ENVIO_SANDBOX_NAO_AUTORIZADO');
 validarArquivo(arquivo);
 if(!existsSync(arquivo)||!PREPEDIDO.test(prepedidoId||''))
  throw falha('PREPEDIDO_SANDBOX_INEXISTENTE');
 if(typeof titularId!=='string'||!TITULAR_ENSAIO.test(titularId))
  throw falha('TITULAR_HOMOLOGACAO_INVALIDO');
 // Injeção de provedor somente para testes locais. CLI não injeta.
 if(provedor===null){
  if(typeof apiKey!=='string'||!apiKey.startsWith('$aact_hmlg_')||
     apiKey.length<25||/[\s\r\n]/.test(apiKey))
   throw falha('CHAVE_SANDBOX_OBRIGATORIA');
  provedor=new AsaasSandboxLojaV6({apiKey});
 }
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const r=await ponte.enviarUmaVez({titularId,prepedidoId,provedor,execucaoLiberada:true});
  // Jamais imprimir QR, credencial, cliente ou ID PSP.
  return {prepedidoId,estado:r.registro.estado,repetido:r.repetido,
   novaCobrancaSomenteSandbox:!r.repetido,pagamentoReal:false,
   posicoesCriadas:0,reconsultaPendente:true};
 }finally{banco.close();}
}
if(require.main===module){
 const acao=process.env.LOOP_HOMOLOGACAO_ACAO;
 const arquivo=process.env.LOOP_HOMOLOGACAO_SQLITE;
 const comum={arquivo};
 let trabalho;
 if(acao==='PREPARAR'){
  trabalho=preparar({...comum,
   clienteAsaasId:process.env.ASAAS_SANDBOX_CLIENTE_TESTE_ID,
   execucaoLiberada:process.env.LOOP_HOMOLOGACAO_PREPARAR==='SIM'});
 }else if(acao==='VINCULAR_PREPEDIDO'){
  trabalho=vincularPrepedidoExistente({...comum,
   titularId:process.env.LOOP_HOMOLOGACAO_TITULAR_ID,
   prepedidoId:process.env.LOOP_HOMOLOGACAO_PREPEDIDO_ID,
   clienteAsaasId:process.env.ASAAS_SANDBOX_CLIENTE_TESTE_ID,
   execucaoLiberada:process.env.LOOP_HOMOLOGACAO_VINCULAR==='SIM'});
 }else if(acao==='ENVIAR_SANDBOX'){
  trabalho=enviarSandbox({...comum,
   titularId:process.env.LOOP_HOMOLOGACAO_TITULAR_ID,
   prepedidoId:process.env.LOOP_HOMOLOGACAO_PREPEDIDO_ID,
   apiKey:process.env.ASAAS_SANDBOX_API_KEY,
   execucaoLiberada:process.env.LOOP_HOMOLOGACAO_ENVIAR_SANDBOX==='SIM'});
 }else{trabalho=Promise.reject(falha('ACAO_HOMOLOGACAO_INVALIDA'));}
 trabalho.then(resultado=>{
  process.stdout.write('HOMOLOGACAO_SANDBOX='+JSON.stringify(resultado)+'\n');
 },erro=>{
  process.stderr.write('HOMOLOGACAO_BLOQUEADA='+String(erro.codigo||'FALHA_INTERNA')+'\n');
  process.exitCode=1;
 });
}
module.exports={preparar,enviarSandbox,vincularPrepedidoExistente};
