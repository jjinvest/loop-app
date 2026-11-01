'use strict';
// Servidor HTTP REAL local; transporte Asaas explicitamente SIMULADO.
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../../src/laboratorio/servidor-catalogo');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
const {ASAAS_SANDBOX_BASE}=require('../../src/domain/asaas-sandbox-loja-v6');
async function abrirLaboratorio(caminho,{agora,habilitarConviteLoopCheckout=false,webhookAsaasSandbox}={}){
 const repo=new RepositorioCatalogoSQLite({caminho});
 const banco=repo.banco;
 banco.exec(`CREATE TABLE IF NOT EXISTS lab_psp_http_fixture(
  id TEXT PRIMARY KEY,pedido TEXT UNIQUE NOT NULL,valor REAL NOT NULL,
  cliente TEXT NOT NULL,status TEXT NOT NULL)`);
 for(const [id,valor] of [['curso-lab-250',25000],['curso-lab-100',10000],['curso-lab-500',50000]]){
  if(!repo.buscar(id))repo.salvar({revisaoEsperada:0,produto:{id,nome:'Produto ficticio '+id,
   descricao:'Somente laboratorio',tipo:'PDF',estado:'PUBLICADO',precoCentavos:valor,
   entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,detalhes:[]}});
 }
 let integracao;
 const app=criarAppAdminLaboratorio({repositorio:repo,ambienteSandbox:{},habilitarConviteLoopCheckout,
  webhookAsaasSandbox,
  segredo:'administrador-local-ficticio-2026-123456789',
  criarCobrancaSandboxTeste:async({pedidoId})=>integracao.cobrancas.criar({
   pedidoId,origem:'CARRINHO',clienteAsaasId:'cus_FixtureHTTP'}),
 });
 const fetchImpl=async(url,opts)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/payments'));
  let row;
  if(opts.method==='POST'){
   const d=JSON.parse(opts.body);
   const id='pay_Fixture'+(banco.prepare('SELECT COUNT(*) n FROM lab_psp_http_fixture').get().n+1);
   banco.prepare('INSERT INTO lab_psp_http_fixture VALUES(?,?,?,?,?)')
    .run(id,d.externalReference,d.value,d.customer,'PENDING');
   row=banco.prepare('SELECT * FROM lab_psp_http_fixture WHERE id=?').get(id);
  }else row=banco.prepare('SELECT * FROM lab_psp_http_fixture WHERE id=?').get(url.split('/').at(-1));
  assert.ok(row,'Consulta deve corresponder a uma cobranca da fixture independente');
  return {ok:true,json:async()=>({id:row.id,externalReference:row.pedido,
   value:row.valor,customer:row.cliente,status:row.status,billingType:'PIX'})};
 };
 integracao=montarIntegracaoAsaasSandboxLoopLab({banco,
  contas:app.locals.contasCompartilhadasLoop,titularidade:app.locals.titularidadeCompartilhadaLoop,
  ponte:app.locals.ponteCompartilhadaLoop,apiKey:'CHAVE_FICTICIA_APENAS_TESTES_123',fetchImpl,
  caixaAvisos:app.locals.caixaAvisosAsaasSandbox,
  ...(agora?{agora}:{})});
 app.locals.integracaoAsaasCompartilhada=integracao;
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 const base='http://127.0.0.1:'+servidor.address().port;
 async function http(rota,{cookie,body,status=200}={}){
  const r=await fetch(base+'/api/laboratorio/participante'+rota,{
   method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',
    'X-LOOP-LAB':'participante',...(cookie?{Cookie:cookie}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 return {repo,banco,app,integracao,http,base,
  contas:app.locals.contasCompartilhadasLoop,ponte:app.locals.ponteCompartilhadaLoop,
  confirmar:pedidoId=>banco.prepare("UPDATE lab_psp_http_fixture SET status='RECEIVED' WHERE pedido=?")
   .run('LOOPLAB-'+pedidoId),
  fechar:async()=>{integracao.callbacks?.parar();await new Promise(r=>servidor.close(r));repo.fechar();}};
}
module.exports={abrirLaboratorio};
