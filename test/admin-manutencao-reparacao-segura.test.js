'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const token='OperadorManutencaoSeguro_'+('Q'.repeat(46));
async function preparar(t,{sandbox=false}={}){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 const c=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:token,termosVersao:'LAB-manutencao-2026',
  termosTexto:'Ensaio interno de manutenção segura, sem pagar, vender, sacar ou gerar crédito real.',
  ...(sandbox?{webhookHomologacaoToken:'ManutencaoWebhook_'+('P'.repeat(46)),
   operacoesSandboxAutorizadas:true,
   provedorReconsultaSandbox:{
    ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
    async consultarCobranca(){throw Error('NAO_CONSULTAR_PSP_NO_GET')}
   }}:{})
 });
 const server=c.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{
  await new Promise(ok=>server.close(ok));
  banco.close();
 });
 const url='http://127.0.0.1:'+server.address().port;
 const obter=async({autorizacao='Bearer '+token,method='GET',
  route='/staging/escritorio-unificado/manutencao/diagnostico'}={})=>{
  const r=await fetch(url+route,{method,headers:{
   Authorization:autorizacao,'Cache-Control':'no-store'
  }});
  const tipo=r.headers.get('content-type')||'';
  return {status:r.status,body:tipo.includes('application/json')?await r.json():null,
   headers:r.headers};
 };
 return {obter,banco,url};
}
test('diagnostico no painel exige operador, nao escreve nem libera financeiro',async t=>{
 const {obter,banco}=await preparar(t);
 const antes=banco.prepare('SELECT total_changes() AS n').get().n;
 assert.equal((await obter({autorizacao:''})).status,401);
 assert.equal((await obter({autorizacao:'Bearer senha-visitante'})).status,401);
 assert.equal((await obter({method:'POST'})).status,401);
 // Rota de escrita inexistente permanece bloqueada antes de chegar ao banco.
 const r=await obter();
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.body.consultaSomenteLeitura,true);
 assert.equal(r.body.pspReconsultadoNestaLeitura,false);
 assert.equal(r.body.escritasExecutadas,0);
 assert.equal(r.body.financeiroReal,false);
 assert.equal(r.body.integridade.sqliteOk,true);
 assert.equal(r.body.integridade.fksInconsistentes,0);
 assert.equal(r.body.integridade.titularesInconsistentes,0);
 assert.equal(r.body.integridade.pspInconsistentes,0);
 assert.equal(r.body.integridade.motorSnapshotValidado,false);
 assert.equal(r.body.integridade.motorAindaNaoIniciado,true);
 assert.equal(r.body.acoesPermitidas.editarRegistroFinanceiroDiretamente,false);
 assert.equal(r.body.acoesPermitidas.liberarPagamentosReais,false);
 assert.equal(r.body.acoesPermitidas.conciliarSandbox,false);
 assert.equal(r.body.estado,'MOTOR_AGUARDANDO_PRIMEIRO_USO');
 assert.equal(r.body.pendenciasConciliaveis,null);
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,antes);
});
test('sob carga concorrente de 144 leituras admin, SQLite e motor seguem imutaveis',async t=>{
 const {obter,banco}=await preparar(t,{sandbox:true});
 const initial=banco.prepare('SELECT total_changes() AS n').get().n;
 for(let lote=0;lote<9;lote++){
  const xs=await Promise.all(Array.from({length:16},
   ()=>obter()));
  assert.equal(xs.length,16);
  for(const r of xs){
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.estado,'MOTOR_AGUARDANDO_PRIMEIRO_USO');
   assert.equal(r.body.pendenciasConciliaveis,0);
   assert.equal(r.body.webhooksEmQuarentena,0);
   assert.equal(r.body.financeiroReal,false);
   assert.equal(r.body.integridade.sqliteOk,true);
   assert.equal(r.body.integridade.motorAindaNaoIniciado,true);
  }
 }
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,
  initial,'144 GET nao podem mutar posicoes ou financeiro');
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('mesmo painel traz diagnostico e acao protegida que reaproveita conciliacao',()=>{
 const html=readFileSync(path.resolve(__dirname,
  '../src/candidato/escritorio-admin-candidato-ui.html'),'utf8');
 const js=readFileSync(path.resolve(__dirname,
  '../src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
 for(const id of ['manutencaoDiagnosticar','manutencaoEstado',
  'manutencaoMetricas','manutencaoConfirmarSandbox',
  'manutencaoRepararSandbox','manutencaoCriarMissao'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/api\('\/manutencao\/diagnostico'\)/);
 assert.match(js,/reconciliarPendentesPsp'\)\.click\(\)/);
 assert.match(js,/manutencaoConfirmarSandbox'\)\.checked/);
 assert.match(js,/diagnosticoManutencao\?\.acoesPermitidas/);
 assert.match(js,/\$\('departamento'\)\.value='SEGURANCA'/);
 assert.match(html,/reparação segura/i);
 assert.doesNotMatch(js,/fetch\([^\n]*\/api\/pagamentos\/criar/);
});
