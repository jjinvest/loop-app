'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {COFRES,MODOS}=require('../src/domain/financeiro-admin-demo');
const TOKEN='livro-financeiro-local-teste-segredo-1234567890';

function tmp(){
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-livro-fin-demo-'));
  return {pasta,arquivo:path.join(pasta,'catalogo.sqlite')};
}
function cofre(livro,id){return livro.caixas.find(c=>c.id===id);}
async function iniciarServer(t,banco){
  const app=criarAppAdminLaboratorio({repositorio:banco,segredo:TOKEN});
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:'+server.address().port;
}
const auth={Authorization:'Bearer '+TOKEN};
async function post(url,body,headers=auth){
  return fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
}

test('cinco vendas gravadas em lote atomico preservam 3 central, 1 esquerda e 1 direita',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
    const novo=r.registrarCicloFicticio({cicloId:'ciclo-teste-001'});
    assert.deepEqual(novo,{loteId:'ciclo-teste-001',repetido:false,eventos:5});
    const livro=r.consultar();
    assert.equal(livro.lotesRegistrados,1);
    assert.equal(livro.lancamentosRegistrados,10);
    assert.equal(cofre(livro,COFRES.CENTRO).entradasAcumuladasCentavos,75000);
    assert.equal(cofre(livro,COFRES.ESQUERDA).entradasAcumuladasCentavos,25000);
    assert.equal(cofre(livro,COFRES.DIREITA).entradasAcumuladasCentavos,25000);
    assert.equal(cofre(livro,COFRES.COMERCIAL).entradasAcumuladasCentavos,25000);
    assert.equal(cofre(livro,COFRES.DISTRIBUIDOR).entradasAcumuladasCentavos,0);
    assert.equal(livro.integracaoBancaria,'NAO_CONECTADA');
    assert.equal(livro.pagamentosReais,false);
    assert.equal(livro.saldosReais,false);
    assert.equal(db.listar().length,0);
  }finally{db.fechar();}
});

test('mesmo identificador e payload = idempotencia; ID repetido com modo diferente = conflito',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
    r.registrarCicloFicticio({cicloId:'ciclo-idempotente',modo:MODOS.SPLIT});
    assert.equal(r.registrarCicloFicticio({cicloId:'ciclo-idempotente',modo:MODOS.SPLIT}).repetido,true);
    assert.equal(r.consultar().lancamentosRegistrados,10);
    assert.throws(()=>r.registrarCicloFicticio({cicloId:'ciclo-idempotente',modo:MODOS.RESERVA}),/Mesmo ID/);
    assert.equal(r.consultar().lancamentosRegistrados,10);
    r.registrarCicloFicticio({cicloId:'ciclo-idempotente-2',modo:MODOS.RESERVA});
    assert.equal(r.consultar().lancamentosRegistrados,25);
    assert.equal(cofre(r.consultar(),COFRES.DISTRIBUIDOR).saldoProjetadoCentavos,150000);
  }finally{db.fechar();}
});

test('saidas retornos e ajustes ficticios nao apagam passado e saldo pode ficar negativo no exemplo',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
    r.registrarCicloFicticio({cicloId:'ciclo-com-movimentos'});
    r.registrarMovimentoFicticio({
      eventoId:'retirada-admin-teste',cofreId:COFRES.ESQUERDA,
      natureza:'SAIDA',valorCentavos:20000,referencia:'retirada simulada do administrador'
    });
    r.registrarMovimentoFicticio({
      eventoId:'retorno-admin-teste',cofreId:COFRES.ESQUERDA,
      natureza:'RETORNO',valorCentavos:3500,referencia:'retorno ficticio de investimento'
    });
    r.registrarAjusteFicticio({
      eventoId:'ajuste-comprovacao',cofreId:COFRES.ESQUERDA,
      natureza:'ENTRADA',valorCentavos:2000,referencia:'retificacao contabil de exemplo'
    });
    const l=r.consultar();
    assert.equal(l.lotesRegistrados,4);
    assert.equal(l.lancamentosRegistrados,13);
    assert.equal(cofre(l,COFRES.ESQUERDA).entradasAcumuladasCentavos,12000);
    assert.equal(cofre(l,COFRES.ESQUERDA).saidasAcumuladasCentavos,20000);
    assert.equal(cofre(l,COFRES.ESQUERDA).retornosAcumuladosCentavos,3500);
    assert.equal(cofre(l,COFRES.ESQUERDA).saldoProjetadoCentavos,10500);
    assert.equal(l.historicoRecente[0].tipo,'AJUSTE_FICTICIO');
    assert.equal(l.historicoRecente.at(-1).referencia,'venda-financeira-ficticia-1');
    assert.equal(r.registrarMovimentoFicticio({
      eventoId:'retorno-admin-teste',cofreId:COFRES.ESQUERDA,
      natureza:'RETORNO',valorCentavos:3500,referencia:'retorno ficticio de investimento'
    }).repetido,true);
    assert.equal(r.consultar().lancamentosRegistrados,13);
  }finally{db.fechar();}
});

test('historico e imutavel, operacao invalida ou id duplicado nao deixa lancamentos parciais',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
    assert.throws(()=>r.registrarMovimentoFicticio({
      eventoId:'evento-errado',cofreId:COFRES.CENTRO,natureza:'SAIDA',
      valorCentavos:0,referencia:'teste'
    }),/invalido/);
    assert.throws(()=>r.registrarLote({loteId:'lote-invalido',eventos:[
      {eventoId:'evento-um',tipo:'VENDA_FICTICIA',referencia:'venda',descricao:'teste',
       lancamentos:[{cofreId:COFRES.CENTRO,natureza:'ENTRADA',valorCentavos:10}]},
      {eventoId:'evento-dois',tipo:'VENDA_FICTICIA',referencia:'venda',descricao:'teste',
       lancamentos:[{cofreId:'INVENTADO',natureza:'ENTRADA',valorCentavos:20}]}
    ]}),/invalido/);
    assert.equal(r.consultar().lancamentosRegistrados,0);
    const base={loteId:'lote-base',
      eventos:[{eventoId:'evento-conhecido',tipo:'AJUSTE_FICTICIO',referencia:'teste',
       descricao:'teste de ajuste',
       lancamentos:[{cofreId:COFRES.CENTRO,natureza:'ENTRADA',valorCentavos:10}]}]};
    r.registrarLote(base);
    assert.throws(()=>r.registrarLote({
      loteId:'lote-novo',eventos:base.eventos
    }),/ja registrado/);
    assert.equal(r.consultar().lancamentosRegistrados,1);
    assert.throws(()=>db.banco.exec('DELETE FROM admin_fin_demo_lancamentos'),/imutavel/);
    assert.throws(()=>db.banco.exec("UPDATE admin_fin_demo_eventos SET tipo='REMOVIDO'"),/imutavel/);
    assert.throws(()=>db.banco.exec('DELETE FROM admin_fin_demo_lotes'),/imutavel/);
    assert.equal(r.consultar().lancamentosRegistrados,1);
  }finally{db.fechar();}
});

test('lancamentos de laboratorio sobrevivem a reiniciar SQLite sem mudar esquema do catalogo',()=>{
  const {pasta,arquivo}=tmp();
  try{
    let db=new RepositorioCatalogoSQLite({caminho:arquivo});
    try{
      const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
      r.registrarCicloFicticio({cicloId:'ciclo-persistente-001',modo:MODOS.RESERVA});
      r.registrarMovimentoFicticio({
        eventoId:'retirada-fornecedor-simulada',cofreId:COFRES.DISTRIBUIDOR,
        natureza:'SAIDA',valorCentavos:30000,referencia:'pagamento ficticio fornecedor'
      });
    }finally{db.fechar();}
    db=new RepositorioCatalogoSQLite({caminho:arquivo});
    try{
      const r=new RazaoFinanceiroDemoSQLite({banco:db.banco});
      const l=r.consultar();
      assert.equal(l.lancamentosRegistrados,16);
      assert.equal(l.lotesRegistrados,2);
      assert.equal(cofre(l,COFRES.DISTRIBUIDOR).saldoProjetadoCentavos,120000);
      assert.equal(db.listar().length,0);
      assert.equal(db.banco.prepare('PRAGMA user_version').get().user_version,3);
    }finally{db.fechar();}
  }finally{fs.rmSync(pasta,{recursive:true,force:true});}
});

test('rotas do livro exigem token e servidor local e nao recebem campos financeiros imprevistos',async t=>{
  const {pasta,arquivo}=tmp();
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const db=new RepositorioCatalogoSQLite({caminho:arquivo});
  t.after(()=>db.fechar());
  const base=await iniciarServer(t,db);
  const endpoint=base+'/api/admin/livro-financeiro-demo';
  assert.equal((await fetch(endpoint)).status,401);
  assert.equal((await fetch(endpoint,{headers:{Authorization:'Bearer incorreto'}})).status,401);
  assert.equal((await fetch(endpoint,{headers:{...auth,Origin:'https://externo.invalid'}})).status,403);
  assert.equal((await post(endpoint+'/ciclos',{cicloId:'ciclo-api-001',modo:'split'},{})).status,401);
  assert.equal((await post(endpoint+'/ciclos',{cicloId:'ciclo-api-001',modo:'split',saldo:99999})).status,400);
  const primeiro=await post(endpoint+'/ciclos',{cicloId:'ciclo-api-001',modo:'split'});
  assert.equal(primeiro.status,200);
  assert.equal((await primeiro.json()).resultado.repetido,false);
  const repetido=await post(endpoint+'/ciclos',{cicloId:'ciclo-api-001',modo:'split'});
  assert.equal((await repetido.json()).resultado.repetido,true);
  assert.equal((await post(endpoint+'/ciclos',{cicloId:'ciclo-api-001',modo:'reserva'})).status,409);
  const novo=await post(endpoint+'/movimentos',{
    eventoId:'saida-teste-api',cofreId:COFRES.COMERCIAL,natureza:'SAIDA',
    valorCentavos:20000,referencia:'retirada teste'
  });
  assert.equal(novo.status,200);
  const ajuste=await post(endpoint+'/ajustes',{
    eventoId:'ajuste-teste-api',cofreId:COFRES.COMERCIAL,natureza:'RETORNO',
    valorCentavos:1000,referencia:'correcao teste'
  });
  assert.equal(ajuste.status,200);
  assert.equal((await post(endpoint+'/movimentos',{
    eventoId:'saida-dados-invalidos',cofreId:COFRES.COMERCIAL,natureza:'SAIDA',
    valorCentavos:20000,referencia:'teste',origemPix:'banco real'
  })).status,400);
  const resposta=await fetch(endpoint,{headers:auth});
  assert.equal(resposta.status,200);
  assert.equal(resposta.headers.get('cache-control'),'no-store');
  const livro=await resposta.json();
  assert.equal(livro.lancamentosRegistrados,12);
  assert.equal(cofre(livro,COFRES.COMERCIAL).saldoProjetadoCentavos,6000);
  assert.equal(db.listar().length,0);
});

test('endpoints do livro nao existem na aplicacao publica; painel usa texto seguro',async t=>{
  const {pasta,arquivo}=tmp();
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const db=new RepositorioCatalogoSQLite({caminho:arquivo});
  t.after(()=>db.fechar());
  const base=await iniciarServer(t,db);
  const html=await (await fetch(base+'/admin/financeiro-demo')).text();
  assert.match(html,/id="formCicloPersistenteDemo"/);
  assert.match(html,/id="formMovimentoPersistenteDemo"/);
  assert.match(html,/id="historicoLivroPersistenteDemo"/);
  const js=await (await fetch(base+'/admin/financeiro-demo.js')).text();
  assert.match(js,/carregarLivro/);
  assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
  const publico=require('../src/server');
  const srv=publico.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise(resolve=>srv.close(resolve)));
  const url='http://127.0.0.1:'+srv.address().port;
  assert.equal((await fetch(url+'/api/admin/livro-financeiro-demo')).status,404);
  assert.equal((await post(url+'/api/admin/livro-financeiro-demo/ciclos',{cicloId:'ciclo-x1',modo:'split'})).status,404);
  assert.equal((await fetch(url+'/admin/financeiro-demo')).status,404);
});
