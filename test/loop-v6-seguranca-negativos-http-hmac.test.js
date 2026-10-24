'use strict';
// Negativos em SUPERFICIE HTTP LOCAL: HMAC invalido, origem externa, sessao
// ausente e segredo correto sem pagamento predefinido. Nenhuma acao bancaria.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {assinarMensagemDemo}=require('../src/domain/verificador-webhook-psp-demo');
const SECRET='chave-exclusiva-do-teste-de-seguranca-local-2026';
const TOKEN='credencial-de-admin-de-laboratorio-para-teste-2026';
const FIXO=1792030000;
const ROTA='/api/laboratorio/webhook-psp-demo';
function corpo(i){
 return JSON.stringify({eventoId:'evt-prova-'+i,pagamentoId:'nao-existe-'+i,
  tipo:'CONFIRMAR_FICTICIO',valorCentavos:25000,moeda:'BRL',ambiente:'laboratorio'});
}
test('rajada HTTP de assinaturas falsas nao cria recebimentos nem posicoes', {timeout:90000},async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN,
  webhookDemo:{habilitado:true,segredo:SECRET,agoraSegundos:()=>FIXO}});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async (i)=>{
  const r=await fetch(base+ROTA,{method:'POST',headers:{
   'Content-Type':'application/json',
   'x-loop-demo-timestamp':String(FIXO),
   'x-loop-demo-signature':'sha256='+('0'.repeat(64))
  },body:corpo(i)});
  const json=await r.json();
  assert.equal(r.status,401);
  assert.equal(json.erro,'ASSINATURA_DEMO_INVALIDA');
 };
 for(let j=0;j<6;j++){
  await Promise.all(Array.from({length:12},(_,i)=>request(j*12+i)));
 }
 const registro=(await (await fetch(base+'/api/admin/livro-financeiro-demo',{
  headers:{Authorization:'Bearer '+TOKEN}})).json());
 assert.equal(registro.lancamentosRegistrados,0);
 assert.equal(registro.pagamentosReais,false);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(Object.values(repo.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 console.log('LOOP_SEGURANCA_NEGATIVOS='+JSON.stringify({
  tentativasAssinaturaFalsa:72,rejeitadas:72,pagamentosFicticiosCriados:0,
  posicoesCriadas:0,transferenciaExecutada:false}));
});
test('sem sessao/acesso: painel protegido; UI local tem CSP/no-store',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const url='http://127.0.0.1:'+server.address().port;
 const admin=await fetch(url+'/api/admin/livro-financeiro-demo');
 assert.equal(admin.status,401);
 const saque=await fetch(url+'/api/laboratorio/participante/saques-simulados');
 assert.equal(saque.status,401);
 const painel=await fetch(url+'/laboratorio/participante');
 assert.equal(painel.status,200);
 assert.equal(painel.headers.get('cache-control'),'no-store');
 assert.match(painel.headers.get('content-security-policy'),/default-src 'none'/);
 assert.match(painel.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(painel.headers.get('x-powered-by'),null);
 assert.equal((await fetch(url+ROTA,{method:'POST',headers:{
  'Content-Type':'application/json'},body:corpo('desativado')})).status,404);
});
test('assinatura HMAC valida para pedido inexistente NAO autoriza pagamento',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN,
  webhookDemo:{habilitado:true,segredo:SECRET,agoraSegundos:()=>FIXO}})
  .listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const body=corpo('sem-fatura');
 const signature=assinarMensagemDemo({
  segredo:SECRET,timestamp:FIXO,corpoBruto:Buffer.from(body)});
 const result=await fetch('http://127.0.0.1:'+server.address().port+ROTA,{
  method:'POST',headers:{'Content-Type':'application/json',
   'x-loop-demo-timestamp':String(FIXO),'x-loop-demo-signature':signature
  },body});
 assert.equal(result.status,404);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
});
