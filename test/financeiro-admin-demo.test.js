'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {criarVisaoFinanceiraAdminDemo,MODOS,COFRES,EXEMPLOS}=
  require('../src/domain/financeiro-admin-demo');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const TOKEN='financeiro-admin-teste-12345678901234567890123';
async function servidorDeTeste(t){
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-financeiro-admin-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'catalogo.sqlite')});
  t.after(()=>repo.fechar());
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const srv=app.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve())));
  return {base:'http://127.0.0.1:'+srv.address().port,repo};
}
function valor(d,id){
  return d.caixas.find(c=>c.id===id)?.entradasAcumuladasCentavos;
}

test('ciclo ficticio de 6 eventos preserva 3 parcelas ao centro e 3 laterais',()=>{
  const a=criarVisaoFinanceiraAdminDemo();
  assert.equal(a.modo,'FINANCEIRO_ADMINISTRATIVO_APENAS_DEMONSTRACAO');
  assert.equal(a.totalVendasCentavos,360000);
  assert.equal(a.totalFornecedorCentavos,180000);
  assert.equal(a.totalLoopCentavos,150000);
  assert.equal(a.totalSobraBrutaCentavos,30000);
  assert.equal(a.caixas.length,4);
  assert.equal(valor(a,COFRES.CENTRO),75000);
  assert.equal(valor(a,COFRES.ESQUERDA),50000);
  assert.equal(valor(a,COFRES.DIREITA),25000);
  assert.equal(valor(a,COFRES.COMERCIAL),30000);
  assert.equal(valor(a,COFRES.DISTRIBUIDOR),undefined);
  assert.deepEqual(a.vendas.map(v=>v.destinoCiclo),
    [COFRES.CENTRO,COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.CENTRO,COFRES.ESQUERDA]);
  assert.equal(a.historico.length,18);
  assert.deepEqual(a.historico.map(e=>e.sequencia),Array.from({length:18},(_,i)=>i+1));
  assert.deepEqual(a.historico.filter(e=>e.cofreId==='DISTRIBUIDOR_EXTERNO_SIMULADO').map(e=>e.valorCentavos),
    [30000,30000,30000,30000,30000,30000]);
  assert.equal(a.movimentacaoBancariaReal,false);
  assert.equal(a.splitBancarioReal,false);
  assert.equal(a.saquesReaisHabilitados,false);
  assert.ok(a.caixas.every(c=>c.saldoRealConhecido===false));
});

test('sem split demonstra quinto caixa reservado, preservando historico do fornecedor',()=>{
  const s=criarVisaoFinanceiraAdminDemo({modo:MODOS.RESERVA});
  assert.equal(s.caixas.length,5);
  assert.equal(valor(s,COFRES.DISTRIBUIDOR),180000);
  assert.equal(valor(s,COFRES.COMERCIAL),30000);
  assert.equal(valor(s,COFRES.CENTRO),75000);
  assert.equal(s.historico.filter(x=>x.tipo==='FORNECEDOR_RESERVADO').length,6);
  assert.equal(s.caixas.reduce((t,c)=>t+c.entradasAcumuladasCentavos,0),360000);
  assert.equal(s.totalFornecedorCentavos+s.totalLoopCentavos+s.totalSobraBrutaCentavos,s.totalVendasCentavos);
  assert.equal(s.vendas.length,6);
});

test('entrada invalida, repeticao e receita insuficiente sao recusadas sem criar saldo falso',()=>{
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({modo:'BANCO_REAL'}),/Modo/);
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({vendas:EXEMPLOS.slice(0,4)}),/seis eventos/);
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({vendas:[...EXEMPLOS.slice(0,5),EXEMPLOS[0]]}),/duplicada/);
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({vendas:[
    {...EXEMPLOS[0],precoCentavos:-1},...EXEMPLOS.slice(1)
  ]}),/invalida/);
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({vendas:[
    {...EXEMPLOS[0],parcelaLoopCentavos:9000},...EXEMPLOS.slice(1)
  ]}),/R\$250/);
  assert.throws(()=>criarVisaoFinanceiraAdminDemo({vendas:[
    {...EXEMPLOS[0],precoCentavos:10000},...EXEMPLOS.slice(1)
  ]}),/nao cobre obrigacoes/);
  assert.deepEqual(criarVisaoFinanceiraAdminDemo(),criarVisaoFinanceiraAdminDemo());
});

test('endpoint financeiro exige token e origem local e nao disponibiliza escrita',async t=>{
  const {base,repo}=await servidorDeTeste(t);
  const endpoint='/api/admin/financeiro-demo?modo=split';
  const headers={Authorization:'Bearer '+TOKEN};
  assert.equal((await fetch(base+endpoint)).status,401);
  assert.equal((await fetch(base+endpoint,{headers:{Authorization:'Bearer incorreto'}})).status,401);
  assert.equal((await fetch(base+endpoint,{headers:{...headers,Origin:'https://externo.invalid'}})).status,403);
  assert.equal((await fetch(base+'/api/admin/financeiro-demo?modo=qualquer',{headers})).status,400);
  assert.equal((await fetch(base+'/api/admin/financeiro-demo',{headers})).status,400);
  const resposta=await fetch(base+endpoint,{headers});
  assert.equal(resposta.status,200);
  assert.equal(resposta.headers.get('cache-control'),'no-store');
  const split=await resposta.json();
  assert.equal(split.caixas.length,4);
  assert.equal(split.totalSobraBrutaCentavos,30000);
  const reserva=await (await fetch(base+'/api/admin/financeiro-demo?modo=reserva',{headers})).json();
  assert.equal(reserva.caixas.length,5);
  assert.equal(valor(reserva,COFRES.DISTRIBUIDOR),180000);
  assert.equal((await fetch(base+endpoint,{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'
  })).status,404);
  assert.equal(repo.listar().length,0);
});

test('somente servidor administrativo local serve a tela e script',async t=>{
  const {base}=await servidorDeTeste(t);
  const page=await fetch(base+'/admin/financeiro-demo');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  const html=await page.text();
  assert.match(html,/Escritório Administrativo/);
  assert.match(html,/id="cofresLoopFinanceiroDemo"/);
  assert.match(html,/id="cofresLojaFinanceiroDemo"/);
  assert.match(html,/id="historicoFinanceiroDemo"/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
  const jsRes=await fetch(base+'/admin/financeiro-demo.js');
  assert.equal(jsRes.status,200);
  const js=await jsRes.text();
  assert.match(js,/textContent/);
  assert.match(js,/replaceChildren/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
  const css=await fetch(base+'/admin/financeiro-demo.css');
  assert.equal(css.status,200);
  const nav=await (await fetch(base+'/admin')).text();
  assert.match(nav,/href="\/admin\/financeiro-demo"/);
  const appPublico=require('../src/server');
  const publico=appPublico.listen(0,'127.0.0.1');
  await once(publico,'listening');
  t.after(()=>new Promise(resolve=>publico.close(resolve)));
  const url='http://127.0.0.1:'+publico.address().port;
  assert.equal((await fetch(url+'/admin/financeiro-demo')).status,404);
  assert.equal((await fetch(url+'/api/admin/financeiro-demo?modo=split')).status,404);
});
