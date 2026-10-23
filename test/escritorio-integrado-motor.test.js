'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {criarCenarioEscritorioMotor, extrairVisaoDoMotor}=
  require('../src/laboratorio/cenario-escritorio-motor');
const {criarVisaoEscritorioDemo}=require('../src/domain/visao-escritorio-demo');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='token-de-laboratorio-escritorio-motor-1234567891234567';

async function laboratorio(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-escritorio-motor-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const repo=new RepositorioCatalogoSQLite({caminho:path.join(dir,'catalogo.sqlite')});
  t.after(()=>repo.fechar());
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const srv=app.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve())));
  return {base:'http://127.0.0.1:'+srv.address().port,repo};
}

test('cenario usa o motor existente e preserva ordem de posicoes apos um giro ficticio',()=>{
  const sim=criarCenarioEscritorioMotor();
  const estado=sim.estado();
  assert.equal(estado.catraca.giros,1);
  assert.equal(estado.tabuleiro.centro.participanteId,'conta-demo-a');
  assert.equal(estado.tabuleiro.centro.id,2);
  assert.deepEqual(estado.tabuleiro.vagas.map(p=>p?.id),[3,4,5,6,7,8]);
  assert.equal(estado.filas.A.quantidade,3);
  assert.equal(estado.filas.B.quantidade,2);
  assert.equal(sim.tabuleiro.ciclosConcluidos[0].centro.id,1);
  assert.equal(estado.tabuleiro.vendasNoCiclo,0);
});

test('projecao le posicoes, historico e indicacoes do motor sem alterar seu estado',()=>{
  const sim=criarCenarioEscritorioMotor();
  const antes=sim.exportarSnapshot();
  const a=extrairVisaoDoMotor({simulador:sim,titularId:'conta-demo-a'});
  const b=extrairVisaoDoMotor({simulador:sim,titularId:'conta-demo-b'});
  const c=extrairVisaoDoMotor({simulador:sim,titularId:'conta-demo-c'});
  const d=extrairVisaoDoMotor({simulador:sim,titularId:'conta-demo-d'});
  assert.deepEqual([a.posicoesAtivas,b.posicoesAtivas,c.posicoesAtivas,d.posicoesAtivas],[3,4,3,2]);
  assert.deepEqual([a.vagasDisponiveis,b.vagasDisponiveis,c.vagasDisponiveis,d.vagasDisponiveis],[7,6,7,8]);
  assert.deepEqual([a.posicoesConcluidas,b.posicoesConcluidas,c.posicoesConcluidas,d.posicoesConcluidas],[1,0,0,0]);
  assert.deepEqual(a.historico,[{id:'posicao-motor-1',situacao:'CONCLUIDA'}]);
  assert.deepEqual(a.ativas.map(p=>p.id),['posicao-motor-8','posicao-motor-9','posicao-motor-2']);
  assert.ok(b.ativas.some(p=>p.local.startsWith('VAGA_')));
  assert.ok(b.ativas.some(p=>p.local==='FILA' && p.fila==='A'));
  assert.ok(c.ativas.some(p=>p.local==='FILA' && p.fila==='A'));
  assert.ok(d.ativas.every(p=>p.local==='FILA' && p.fila==='B'));
  assert.equal(b.indicacoes.quantidade,1);
  assert.equal(c.indicacoes.quantidade,1);
  assert.equal(a.indicacoes.quantidade,0);
  assert.equal(a.tabuleiro.giros,1);
  assert.equal(a.saqueHabilitado,false);
  assert.equal(a.compraHabilitada,false);
  assert.equal(a.possuiCpfReal,false);
  assert.deepEqual(sim.exportarSnapshot(),antes);
  assert.equal(extrairVisaoDoMotor({simulador:sim,titularId:'inexistente'}),null);
});

test('rotas preservam o exemplo estatico e protegem o novo modo motor com token',async t=>{
  const {base,repo}=await laboratorio(t);
  const auth={Authorization:'Bearer '+TOKEN};
  const url='/api/admin/escritorio-demo/motor/conta-demo-a';
  assert.equal((await fetch(base+url)).status,401);
  assert.equal((await fetch(base+url,{headers:{Authorization:'Bearer errado'}})).status,401);
  assert.equal((await fetch(base+url,{headers:{...auth,Origin:'https://site-externo.invalid'}})).status,403);
  const response=await fetch(base+url,{headers:auth});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const visao=await response.json();
  assert.equal(visao.origem,'MOTOR_EXISTENTE_EM_CENARIO_FICTICIO');
  assert.equal(visao.posicoesAtivas,3);
  assert.equal(visao.vagasDisponiveis,7);
  assert.equal(visao.posicoesConcluidas,1);
  assert.equal(visao.tabuleiro.giros,1);
  assert.equal(visao.valores.status,'NAO_EXISTEM_SALDOS_NEM_CREDITOS_REAIS');
  // "possuiCpfReal:false" e um marcador de seguranca, NAO dado pessoal.
  assert.equal(visao.possuiCpfReal,false);
  for(const chave of ['cpf','endereco','saldoCentavos','contaBancaria']) {
    assert.equal(Object.hasOwn(visao,chave),false);
    assert.equal(Object.hasOwn(visao.titular,chave),false);
  }
  const antigo=await (await fetch(base+'/api/admin/escritorio-demo/conta-demo-a',{headers:auth})).json();
  assert.equal(antigo.posicoesAtivas,5);
  assert.equal(antigo.vagasDisponiveis,5);
  assert.equal(antigo.origem,undefined);
  const repetida=await (await fetch(base+url,{headers:auth})).json();
  assert.deepEqual(repetida,visao);
  assert.equal((await fetch(base+'/api/admin/escritorio-demo/motor/inexistente',{headers:auth})).status,404);
  assert.equal((await fetch(base+url,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:'{}'})).status,404);
  assert.equal(repo.listar().length,0);
});

test('interface informa que cenario motor e alternativo, sem modificar simulador publico',async t=>{
  const {base}=await laboratorio(t);
  const html=await (await fetch(base+'/admin/escritorio-demo')).text();
  assert.match(html,/id="origemEscritorioDemo"/);
  assert.match(html,/value="estatico"/);
  assert.match(html,/value="motor"/);
  assert.match(html,/id="indicacoesMotorDemo"/);
  assert.match(html,/id="etapaMotorDemo"/);
  const js=await (await fetch(base+'/admin/escritorio-demo.js')).text();
  assert.match(js,/origem\.value==='motor'/);
  assert.match(js,/CONTAGEM_SIMULADA_PELO_MOTOR|ind icacoesMotorDemo|indicacoesMotorDemo/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
  const publicApp=require('../src/server');
  const srv=publicApp.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise(resolve=>srv.close(resolve)));
  assert.equal((await fetch('http://127.0.0.1:'+srv.address().port+'/api/admin/escritorio-demo/motor/conta-demo-a')).status,404);
});

test('recusa dados duplicados da simulacao em vez de exibir vagas falsas',()=>{
  const sim=criarCenarioEscritorioMotor();
  const clone={...sim,estado:()=>({
    ...sim.estado(),
    filas:{...sim.estado().filas,
      B:{...sim.estado().filas.B,pessoas:[
        ...sim.estado().filas.B.pessoas,
        sim.estado().tabuleiro.centro
      ]}
    }
  })};
  assert.throws(()=>extrairVisaoDoMotor({simulador:clone,titularId:'conta-demo-a'}),/duplicada/);
  // A projeção estática antiga ainda pode ser usada isoladamente.
  assert.equal(criarVisaoEscritorioDemo({titularId:'conta-demo-a'}).posicoesAtivas,5);
});
