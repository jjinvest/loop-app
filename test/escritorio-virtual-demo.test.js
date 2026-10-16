'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {criarVisaoEscritorioDemo,LIMITE_POSICOES_ATIVAS,TITULARES_FICTICIOS}=require('../src/domain/visao-escritorio-demo');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const TOKEN='token-de-laboratorio-escritorio-12345678901234567890';
async function laboratorio(t) {
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-escritorio-teste-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'catalogo.sqlite')});
  t.after(()=>repo.fechar());
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const servidor=app.listen(0,'127.0.0.1');
  await once(servidor,'listening');
  t.after(()=>new Promise((resolve,reject)=>servidor.close(e=>e?reject(e):resolve())));
  return {base:'http://127.0.0.1:'+servidor.address().port};
}
async function pedir(base,resource,headers={}){
  return fetch(base+resource,{headers});
}

test('cada conta ficticia mantem contagem separada de posicoes e historico',()=>{
  assert.equal(LIMITE_POSICOES_ATIVAS,6);
  assert.equal(TITULARES_FICTICIOS.length,4);
  const a=criarVisaoEscritorioDemo({titularId:'conta-demo-a'});
  const b=criarVisaoEscritorioDemo({titularId:'conta-demo-b'});
  const c=criarVisaoEscritorioDemo({titularId:'conta-demo-c'});
  const d=criarVisaoEscritorioDemo({titularId:'conta-demo-d'});
  assert.deepEqual([a.posicoesAtivas,b.posicoesAtivas,c.posicoesAtivas,d.posicoesAtivas],[5,4,1,0]);
  assert.deepEqual([a.vagasDisponiveis,b.vagasDisponiveis,c.vagasDisponiveis,d.vagasDisponiveis],[1,2,5,6]);
  assert.deepEqual([a.posicoesConcluidas,b.posicoesConcluidas,c.posicoesConcluidas,d.posicoesConcluidas],[1,1,0,1]);
  assert.equal(a.historico.length,1);
  assert.equal(a.ativas.length,5);
  assert.equal(a.compraHabilitada,false);
  assert.equal(a.saqueHabilitado,false);
  assert.equal(a.possuiCpfReal,false);
  assert.deepEqual(a.indicacoes,{status:'NAO_CONECTADO_NESTA_ETAPA'});
});

test('uma posicao concluida libera vaga sem apagar historico de titular',()=>{
  const posicoes=[
    ...Array.from({length:4},(_,i)=>({id:'ativa-'+i,titularId:'demo',situacao:'ATIVA',local:'FILA',fila:'B'})),
    {id:'concluida-1',titularId:'demo',situacao:'CONCLUIDA'},
    {id:'concluida-2',titularId:'demo',situacao:'CONCLUIDA'}
  ];
  const s=criarVisaoEscritorioDemo({titularId:'demo',titulares:[{id:'demo',nome:'Titular ficticio'}],posicoes});
  assert.equal(s.posicoesAtivas,4);
  assert.equal(s.vagasDisponiveis,2);
  assert.equal(s.posicoesConcluidas,2);
  assert.equal(s.ativas.length+s.historico.length,6);
});

test('rejeita setima posicao ativa, duplicatas e situacoes incorretas',()=>{
  const titulares=[{id:'ficticio',nome:'Ficticio'}];
  const posicao=(id)=>({id,titularId:'ficticio',situacao:'ATIVA',local:'FILA',fila:'B'});
  assert.throws(()=>criarVisaoEscritorioDemo({titularId:'ficticio',titulares,posicoes:Array.from({length:7},(_,i)=>posicao(String(i)))}),/Limite de seis/);
  assert.throws(()=>criarVisaoEscritorioDemo({titularId:'ficticio',titulares,posicoes:[posicao('1'),posicao('1')]}),/duplicada/);
  assert.throws(()=>criarVisaoEscritorioDemo({titularId:'ficticio',titulares,posicoes:[{...posicao('1'),situacao:'CREDITO_REAL'}]}),/Situacao/);
  assert.throws(()=>criarVisaoEscritorioDemo({titularId:'ficticio',titulares,posicoes:[{...posicao('1'),fila:'Z'}]}),/Local/);
  assert.equal(criarVisaoEscritorioDemo({titularId:'desconhecido'}),null);
});

test('api so mostra contas ficticias com token local e Cache-Control no-store',async t=>{
  const {base}=await laboratorio(t);
  const auth={Authorization:'Bearer '+TOKEN};
  assert.equal((await pedir(base,'/api/admin/escritorio-demo')).status,401);
  assert.equal((await pedir(base,'/api/admin/escritorio-demo', {authorization:'Bearer invalido'})).status,401);
  assert.equal((await pedir(base,'/api/admin/escritorio-demo', {...auth, origin:'https://exemplo.invalid'})).status,403);
  const req=await pedir(base,'/api/admin/escritorio-demo',auth);
  assert.equal(req.status,200);
  assert.equal(req.headers.get('cache-control'),'no-store');
  const data=await req.json();
  assert.equal(data.modo,'ESCRITORIO_APENAS_DEMONSTRACAO');
  assert.equal(data.titulares.length,4);
  assert.equal(data.semClientesReais,true);
  assert.equal(data.semPagamentosReais,true);
  assert.equal(JSON.stringify(data).includes('123.456'),false);
  const detalhes=await pedir(base,'/api/admin/escritorio-demo/conta-demo-b',auth);
  assert.equal(detalhes.status,200);
  const visao=await detalhes.json();
  assert.equal(visao.posicoesAtivas,4);
  assert.equal(visao.vagasDisponiveis,2);
  assert.equal(visao.posicoesConcluidas,1);
  assert.equal(visao.valores.status,'NAO_EXISTEM_SALDOS_NEM_CREDITOS_REAIS');
  assert.equal((await pedir(base,'/api/admin/escritorio-demo/inexistente',auth)).status,404);
  assert.equal((await fetch(base+'/api/admin/escritorio-demo/conta-demo-b',{
    method:'POST',headers:{...auth,'Content-Type':'application/json'},body:'{}'
  })).status,404);
});

test('pagina so local, scripts externos, sem operacao de dinheiro nem cpf',async t=>{
  const {base}=await laboratorio(t);
  const page=await pedir(base,'/admin/escritorio-demo');
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/Escritório Virtual — laboratório/);
  assert.match(html,/id="totalAtivasDemo"/);
  assert.match(html,/id="vagasDisponiveisDemo"/);
  assert.match(html,/id="listaConcluidasDemo"/);
  assert.match(html,/\/admin\/escritorio-demo\.js/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  const js=await pedir(base,'/admin/escritorio-demo.js');
  assert.equal(js.status,200);
  const texto=await js.text();
  assert.match(texto,/textContent/);
  assert.match(texto,/replaceChildren/);
  assert.match(texto,/Authorization/);
  assert.doesNotMatch(texto,/localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(texto,/token-de-laboratorio-escritorio-123/);
  const css=await pedir(base,'/admin/escritorio-demo.css');
  assert.equal(css.status,200);
  assert.match(await css.text(),/escritorio-resumo/);
  const publicApp=require('../src/server');
  const publico=publicApp.listen(0,'127.0.0.1');
  await once(publico,'listening');
  t.after(()=>new Promise(resolve=>publico.close(resolve)));
  const normal='http://127.0.0.1:'+publico.address().port;
  assert.equal((await pedir(normal,'/admin/escritorio-demo')).status,404);
  assert.equal((await pedir(normal,'/api/admin/escritorio-demo')).status,404);
});
