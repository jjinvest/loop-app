'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
  TIPOS,projetarRazaoCofresDemo,criarAdaptadorReservasFicticio,
  conciliarComAdaptadorFicticio,criarConciliacaoAdministrativaDemo
}=require('../src/domain/conciliacao-cofres-demo');
const {COFRES,MODOS}=require('../src/domain/financeiro-admin-demo');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const TOKEN='chave-conciliacao-laboratorio-1234567890123456789';
function saldo(razao,id){return razao.cofres.find(c=>c.id===id);}
async function servidor(t){
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-conciliacao-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const db=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'base.sqlite')});
  t.after(()=>db.fechar());
  const app=criarAppAdminLaboratorio({repositorio:db,segredo:TOKEN});
  const s=app.listen(0,'127.0.0.1');
  await once(s,'listening');
  t.after(()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())));
  return {url:'http://127.0.0.1:'+s.address().port,db};
}

test('razao projeta distribuicao do ciclo mas nao inventa saldo ou transferencia real',()=>{
  const p=projetarRazaoCofresDemo();
  assert.equal(p.modo,'RAZAO_CONTABIL_APENAS_FICTICIO');
  assert.equal(p.historico.length,10);
  assert.equal(p.cofres.length,4);
  assert.equal(saldo(p,COFRES.ESQUERDA).entradasAcumuladasCentavos,25000);
  assert.equal(saldo(p,COFRES.CENTRO).entradasAcumuladasCentavos,75000);
  assert.equal(saldo(p,COFRES.DIREITA).saldoProjetadoCentavos,25000);
  assert.equal(saldo(p,COFRES.COMERCIAL).saldoProjetadoCentavos,25000);
  assert.ok(p.cofres.every(c=>c.saidasAcumuladasCentavos===0&&
    c.retornosAcumuladosCentavos===0&&c.saldoRealConhecido===false));
  assert.equal(p.movimentacaoBancariaReal,false);
  assert.equal(p.autenticacaoBancariaConfigurada,false);
  assert.deepEqual(p,projetarRazaoCofresDemo());
  assert.equal(saldo(p,COFRES.DISTRIBUIDOR),undefined);
});

test('movimentos ficticios registram entrada saida retorno, sem restringir controle admin',()=>{
  const p=projetarRazaoCofresDemo({comMovimentos:true});
  assert.equal(p.historico.length,16);
  assert.equal(saldo(p,COFRES.CENTRO).saldoProjetadoCentavos,65000);
  assert.equal(saldo(p,COFRES.CENTRO).saidasAcumuladasCentavos,10000);
  assert.equal(saldo(p,COFRES.ESQUERDA).saldoProjetadoCentavos,65000);
  assert.equal(saldo(p,COFRES.ESQUERDA).saidasAcumuladasCentavos,8000);
  assert.equal(saldo(p,COFRES.ESQUERDA).retornosAcumuladosCentavos,3000);
  assert.equal(saldo(p,COFRES.DIREITA).saldoProjetadoCentavos,24000);
  assert.equal(saldo(p,COFRES.COMERCIAL).saldoProjetadoCentavos,5000);
  assert.equal(p.historico.filter(x=>x.tipo===TIPOS.SAIDA).length,4);
  assert.equal(p.historico.filter(x=>x.tipo===TIPOS.RETORNO).length,2);
  assert.ok(p.historico.every(x=>x.simulado===true));

  const reserva=projetarRazaoCofresDemo({modo:MODOS.RESERVA,comMovimentos:true});
  assert.equal(reserva.cofres.length,5);
  assert.equal(reserva.historico.length,22);
  assert.equal(saldo(reserva,COFRES.DISTRIBUIDOR).entradasAcumuladasCentavos,150000);
  assert.equal(saldo(reserva,COFRES.DISTRIBUIDOR).saidasAcumuladasCentavos,30000);
  assert.equal(saldo(reserva,COFRES.DISTRIBUIDOR).saldoProjetadoCentavos,120000);
  assert.equal(saldo(reserva,COFRES.COMERCIAL).saldoProjetadoCentavos,5000);
});

test('eventos financeiros repetidos, cofres estranhos e valores errados sao rejeitados',()=>{
  const entrada={id:'mov-001',cofreId:COFRES.CENTRO,tipo:TIPOS.SAIDA,
    valorCentavos:150,referencia:'movimento ficticio'};
  assert.throws(()=>projetarRazaoCofresDemo({movimentos:[entrada,entrada]}),/invalido ou repetido/);
  assert.throws(()=>projetarRazaoCofresDemo({movimentos:[{...entrada,cofreId:'NOVO_COFRE'}]}),/invalido/);
  assert.throws(()=>projetarRazaoCofresDemo({movimentos:[{...entrada,valorCentavos:2.5}]}),/invalido/);
  assert.throws(()=>projetarRazaoCofresDemo({movimentos:[{...entrada,tipo:'TRANSFIRA_AGORA'}]}),/invalido/);
  // O administrador pode simular saidas validas do fornecedor reservado:
  // este simulador NAO cria uma trava financeira real.
  const saidaFornecedor=projetarRazaoCofresDemo({modo:MODOS.RESERVA,movimentos:[{
    ...entrada,valorCentavos:10000,cofreId:COFRES.DISTRIBUIDOR
  }]});
  assert.equal(saldo(saidaFornecedor,COFRES.DISTRIBUIDOR).saldoProjetadoCentavos,140000);
});

test('adaptador de teste compara valores, encontra diferencas e detecta dados ausentes',async()=>{
  const razao=projetarRazaoCofresDemo({comMovimentos:true});
  const valores=Object.fromEntries(razao.cofres.map(c=>[c.id,c.saldoProjetadoCentavos]));
  const certo=await conciliarComAdaptadorFicticio({razao,adaptador:criarAdaptadorReservasFicticio(valores)});
  assert.equal(certo.todasConferidasNoTeste,true);
  assert.ok(certo.linhas.every(l=>l.status==='CONFERIDO_NO_TESTE'));
  valores[COFRES.CENTRO]+=1000;
  const dif=await conciliarComAdaptadorFicticio({razao,adaptador:criarAdaptadorReservasFicticio(valores)});
  assert.equal(dif.todasConferidasNoTeste,false);
  assert.equal(dif.linhas.find(l=>l.cofreId===COFRES.CENTRO).diferencaCentavos,1000);
  assert.equal(dif.linhas.filter(l=>l.status==='DIVERGENCIA_FICTICIA').length,1);
  delete valores[COFRES.ESQUERDA];
  const falta=await conciliarComAdaptadorFicticio({razao,adaptador:criarAdaptadorReservasFicticio(valores)});
  assert.equal(falta.linhas.find(l=>l.cofreId===COFRES.ESQUERDA).status,'SEM_DADO_FICTICIO');
  assert.equal(falta.movimentacaoBancariaReal,false);
  assert.equal(falta.nenhumPagamentoExecutado,true);

  await assert.rejects(()=>conciliarComAdaptadorFicticio({
    razao,adaptador:{consultarSaldos:async()=>[
      {cofreId:COFRES.CENTRO,saldoCentavos:0},
      {cofreId:COFRES.CENTRO,saldoCentavos:1}
    ]}
  }),/malformado/);
  assert.throws(()=>criarAdaptadorReservasFicticio({[COFRES.CENTRO]:-1}),/invalida/);
  assert.throws(()=>criarAdaptadorReservasFicticio({BANCO_REAL:123}),/invalida/);
});

test('dois lados sao assumidamente simulados mesmo quando ambos coincidem',async()=>{
  const sem=await criarConciliacaoAdministrativaDemo();
  assert.equal(sem.integracaoBancaria,'NAO_CONECTADA');
  assert.equal(sem.conciliacao.provedor,'PROVEDOR_RESERVAS_FICTICIO');
  assert.equal(sem.conciliacao.todasConferidasNoTeste,true);
  const c=await criarConciliacaoAdministrativaDemo({divergenciaFicticia:true,comMovimentos:true});
  assert.equal(c.conciliacao.todasConferidasNoTeste,false);
  assert.equal(c.conciliacao.linhas.find(x=>x.cofreId===COFRES.CENTRO).diferencaCentavos,1000);
});

test('API de conciliacao e somente do administrador local, sem mutacao ou publicacao',async t=>{
  const {url,db}=await servidor(t);
  const suffix='/api/admin/conciliacao-cofres-demo?modo=split&fluxo=com-movimentos&extrato=divergente';
  const headers={Authorization:'Bearer '+TOKEN};
  assert.equal((await fetch(url+suffix)).status,401);
  assert.equal((await fetch(url+suffix,{headers:{Authorization:'Bearer errado'}})).status,401);
  assert.equal((await fetch(url+suffix,{headers:{...headers,Origin:'https://externo.invalid'}})).status,403);
  assert.equal((await fetch(url+'/api/admin/conciliacao-cofres-demo?modo=split&fluxo=errado&extrato=conferido',{headers})).status,400);
  const ok=await fetch(url+suffix,{headers});
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get('cache-control'),'no-store');
  const body=await ok.json();
  assert.equal(body.razao.cofres.length,4);
  assert.equal(body.conciliacao.todasConferidasNoTeste,false);
  assert.equal(body.razao.historico.length,16);
  assert.equal(body.razao.movimentacaoBancariaReal,false);
  assert.equal(body.conciliacao.movimentacaoBancariaReal,false);
  assert.equal(body.razao.cofres.find(c=>c.id===COFRES.CENTRO).saldoProjetadoCentavos,65000);
  assert.equal((await fetch(url+suffix,{method:'POST',headers:{
    ...headers,'Content-Type':'application/json'},body:'{}'
  })).status,404);
  assert.equal(db.listar().length,0);
  const page=await (await fetch(url+'/admin/financeiro-demo')).text();
  assert.match(page,/id="linhasConciliacaoDemo"/);
  assert.match(page,/id="historicoConciliacaoDemo"/);
  const js=await (await fetch(url+'/admin/financeiro-demo.js')).text();
  assert.match(js,/carregarConciliacao/);
  assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);

  const appPublico=require('../src/server');
  const pub=appPublico.listen(0,'127.0.0.1');
  await once(pub,'listening');
  t.after(()=>new Promise(resolve=>pub.close(resolve)));
  const base='http://127.0.0.1:'+pub.address().port;
  assert.equal((await fetch(base+suffix)).status,404);
});
