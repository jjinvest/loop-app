'use strict';
// Fluxo real de classes, transporte do PSP estritamente FICTICIO no teste.
// Nenhuma chave Asaas ou requisição de rede externa; nenhuma posição LOOP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {AsaasSandboxLojaV6,ASAAS_SANDBOX_BASE}=require('../src/domain/asaas-sandbox-loja-v6');
const TITULAR='titular-teste-0001',OUTRO='titular-teste-0002';
const CLIENTE='cus_StagingTeste00001';
function produto(id,valor=25000){
 return {id,nome:'PDF somente teste '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Nao ofertado ao publico',precoCentavos:valor,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],detalhes:[],
  videoApresentacaoUrl:null};
}
async function cenario(t){
 const dir=mkdtempSync(path.join(tmpdir(),'loop-ponte-staging-'));
 const arquivo=path.join(dir,'ensaios.sqlite');
 let banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const catalogo=new RepositorioCatalogoMemoria({produtos:[produto('curso-staging-250')]});
 let rascunhos=new IntencoesCheckoutSQLite({banco});
 let prepedidos=new PrePedidosCheckoutStagingSQLite({banco});
 let ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 t.after(()=>{banco.close();rmSync(dir,{force:true,recursive:true});});
 async function gerar(titularId=TITULAR,chave='chave-homologacao-rascunho-0001'){
  const entrada={itens:[{produtoId:'curso-staging-250',quantidade:1}]};
  const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
  const r=rascunhos.criar({titularId,chaveIdempotencia:chave,entrada,cotacao}).intencao;
  const p=await prepedidos.preparar({titularId,rascunhoId:r.pedidoId,
   repositorioCatalogo:catalogo});
  return p.prepedido.prepedidoId;
 }
 const chamadas=[];
 const remoto={status:'PENDING',valor:250,billingType:'PIX',
  cliente:CLIENTE,referencia:null,id:'pay_StagingTeste000001',
  falharPost:false,adulterarCriacao:false};
 const fetchImpl=async(url,options)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/payments'));
  assert.equal(options.redirect,'error');
  assert.equal(options.headers.access_token,'CHAVE_FICTICIA_APENAS_TESTE_123');
  chamadas.push({url,method:options.method});
  if(options.method==='POST'){
   const corpo=JSON.parse(options.body);
   assert.equal(corpo.billingType,'PIX');
   assert.equal(corpo.customer,CLIENTE);
   assert.equal(corpo.value,250);
   remoto.referencia=corpo.externalReference;
   if(remoto.falharPost)throw Error('timeout simulado apos potencial emissao');
   return {ok:true,json:async()=>({
    id:remoto.id,status:'PENDING',value:remoto.adulterarCriacao?249.99:250,
    customer:CLIENTE,billingType:'PIX',externalReference:corpo.externalReference
   })};
  }
  assert.equal(url,ASAAS_SANDBOX_BASE+'/payments/'+remoto.id);
  return {ok:true,json:async()=>({
   id:remoto.id,status:remoto.status,value:remoto.valor,
   customer:remoto.cliente,billingType:remoto.billingType,
   externalReference:remoto.referencia
  })};
 };
 const provedor=new AsaasSandboxLojaV6({
  apiKey:'CHAVE_FICTICIA_APENAS_TESTE_123',fetchImpl
 });
 function reabrir(){
  banco.close();banco=new DatabaseSync(arquivo);
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  rascunhos=new IntencoesCheckoutSQLite({banco});
  prepedidos=new PrePedidosCheckoutStagingSQLite({banco});
  ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 }
 return {gerar,provedor,remoto,chamadas,reabrir,
  get banco(){return banco;},get ponte(){return ponte;}};
}
test('prepedido R$250 chega a Asaas Sandbox falso uma vez; 16 replays nao fazem segunda POST',async t=>{
 const s=await cenario(t),id=await s.gerar();
 const a=s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 assert.equal(a.repetido,false);assert.equal(a.registro.estado,'PREPARADA');
 assert.equal(a.registro.valorCentavos,25000);
 assert.equal(a.registro.pagamentoIniciado,undefined);
 assert.equal(a.registro.posicoesCriadas,0);
 const replay=s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 assert.equal(replay.repetido,true);
 const enviar=()=>s.ponte.enviarUmaVez({titularId:TITULAR,prepedidoId:id,
  provedor:s.provedor,execucaoLiberada:true});
 const respostas=await Promise.all(Array.from({length:16},enviar));
 assert.equal(respostas.filter(x=>!x.repetido).length,1);
 assert.equal(respostas.filter(x=>x.repetido).length,15);
 assert.equal(s.chamadas.filter(x=>x.method==='POST').length,1);
 assert.equal(s.remoto.referencia,'LOOPLAB-'+id);
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).estado,'PENDENTE_SANDBOX');
 s.reabrir();
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).pagamentoSandboxId,
  s.remoto.id);
 const depois=await enviar();
 assert.equal(depois.repetido,true);
 assert.equal(s.chamadas.filter(x=>x.method==='POST').length,1);
 s.remoto.status='RECEIVED';
 const recebido=await s.ponte.conferir({titularId:TITULAR,prepedidoId:id,provedor:s.provedor});
 assert.equal(recebido.estado,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(recebido.ultimaConsultaSandbox.statusAsaas,'RECEIVED');
 assert.equal(recebido.pagamentoReal,false);
 assert.equal(recebido.valorRecebidoRealCentavos,0);
 assert.equal(recebido.posicoesCriadas,0);
 assert.equal(recebido.pedidoComercialCriado,false);
 assert.equal(recebido.catracaMovimentada,false);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('timeout apos POST torna criacao indeterminada; reinicio nao dispara reenvio',async t=>{
 const s=await cenario(t),id=await s.gerar();
 s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 s.remoto.falharPost=true;
 await assert.rejects(s.ponte.enviarUmaVez({titularId:TITULAR,
  prepedidoId:id,provedor:s.provedor,execucaoLiberada:true}),
  {codigo:'ASAAS_SANDBOX_REDE_INCONCLUSIVA'});
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).estado,'CRIACAO_INDETERMINADA');
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).revisaoManualObrigatoria,true);
 s.reabrir();s.remoto.falharPost=false;
 const repetida=await s.ponte.enviarUmaVez({titularId:TITULAR,
  prepedidoId:id,provedor:s.provedor,execucaoLiberada:true});
 assert.equal(repetida.repetido,true);
 assert.equal(s.chamadas.filter(x=>x.method==='POST').length,1);
 await assert.rejects(s.ponte.conferir({titularId:TITULAR,prepedidoId:id,
  provedor:s.provedor}),{codigo:'CRIACAO_INDETERMINADA_VERIFICAR_REFERENCIA_ASAAS'});
 assert.equal(s.chamadas.filter(x=>x.method==='GET').length,0);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('titular errado, cliente diferente e liberacao omitida impedem o PSP',async t=>{
 const s=await cenario(t),id=await s.gerar();
 assert.throws(()=>s.ponte.preparar({titularId:OUTRO,prepedidoId:id,
  clienteAsaasId:CLIENTE}),{codigo:'PREPEDIDO_NAO_ENCONTRADO'});
 s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 assert.throws(()=>s.ponte.preparar({titularId:TITULAR,prepedidoId:id,
  clienteAsaasId:'cus_ClienteDivergente'}),{codigo:'CONFLITO_VINCULO_SANDBOX'});
 assert.equal(s.ponte.consultar({titularId:OUTRO,prepedidoId:id}),null);
 await assert.rejects(s.ponte.enviarUmaVez({
  titularId:TITULAR,prepedidoId:id,provedor:s.provedor
 }),{codigo:'ENVIO_SANDBOX_NAO_AUTORIZADO'});
 assert.equal(s.chamadas.length,0);
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).estado,'PREPARADA');
});
test('resposta divergente nao confirma e nao repete POST; reconsulta valida campos externos',async t=>{
 const s=await cenario(t),id=await s.gerar();
 s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 s.remoto.adulterarCriacao=true;
 await assert.rejects(s.ponte.enviarUmaVez({titularId:TITULAR,prepedidoId:id,
  provedor:s.provedor,execucaoLiberada:true}),{codigo:'ASAAS_SANDBOX_COBRANCA_DIVERGENTE'});
 assert.equal(s.ponte.consultar({titularId:TITULAR,prepedidoId:id}).estado,'CRIACAO_INDETERMINADA');
 const replay=await s.ponte.enviarUmaVez({titularId:TITULAR,prepedidoId:id,
  provedor:s.provedor,execucaoLiberada:true});
 assert.equal(replay.repetido,true);
 assert.equal(s.chamadas.filter(x=>x.method==='POST').length,1);
});
test('status manual nao equivale a Pix, status recebido exige ultima consulta RECEIVED e estorno prevalece',async t=>{
 const s=await cenario(t),id=await s.gerar();
 s.ponte.preparar({titularId:TITULAR,prepedidoId:id,clienteAsaasId:CLIENTE});
 await s.ponte.enviarUmaVez({titularId:TITULAR,prepedidoId:id,
  provedor:s.provedor,execucaoLiberada:true});
 s.remoto.status='RECEIVED_IN_CASH';
 const manual=await s.ponte.conferir({titularId:TITULAR,prepedidoId:id,provedor:s.provedor});
 assert.equal(manual.estado,'EXIGE_REVISAO');
 assert.equal(manual.revisaoManualObrigatoria,true);
 s.remoto.status='RECEIVED';
 const recebido=await s.ponte.conferir({titularId:TITULAR,prepedidoId:id,provedor:s.provedor});
 assert.equal(recebido.estado,'RECEBIMENTO_INFORMADO_SANDBOX');
 s.remoto.status='PENDING';
 const antigo=await s.ponte.conferir({titularId:TITULAR,prepedidoId:id,provedor:s.provedor});
 assert.equal(antigo.estado,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(antigo.ultimaConsultaSandbox.statusAsaas,'PENDING');
 assert.equal(antigo.revisaoManualObrigatoria,true);
 s.remoto.status='REFUNDED';
 const estorno=await s.ponte.conferir({titularId:TITULAR,prepedidoId:id,provedor:s.provedor});
 assert.equal(estorno.estado,'REVERSAO_INFORMADA_SANDBOX');
 s.remoto.status='RECEIVED';
 assert.equal((await s.ponte.conferir({
  titularId:TITULAR,prepedidoId:id,provedor:s.provedor
 })).estado,'REVERSAO_INFORMADA_SANDBOX');
 const n=s.banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_asaas_consultas_staging').get().n;
 assert.equal(n,5);
 assert.throws(()=>s.banco.prepare(
  'UPDATE akitemm_prepedido_asaas_consultas_staging SET status_asaas=?').run('RECEIVED'),
 /consulta imutavel/);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('pontes locais nao sao montadas no servidor publico e producao sempre bloqueia construtor',async t=>{
 const s=await cenario(t),id=await s.gerar();
 const pub=require('../src/server');
 const srv=pub.listen(0,'127.0.0.1');
 const {once}=require('node:events');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 assert.equal((await fetch(base+'/api/checkout/prepedidos/'+id+'/asaas',{method:'POST'})).status,503);
 assert.equal((await fetch(base+'/health/ready')).status,503);
 const run=spawnSync(process.execPath,['-e',[
  "process.env.NODE_ENV='production';",
  "const {PontePrepedidoAsaasSandboxStaging}=require('./src/domain/ponte-prepedido-asaas-sandbox-staging');",
  "try{new PontePrepedidoAsaasSandboxStaging();process.exit(1)}",
  "catch(e){if(e.codigo!=='PONTE_SANDBOX_PROIBIDA_EM_PRODUCAO')process.exit(2)}"
 ].join('')],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 assert.equal(s.chamadas.length,0);
});
