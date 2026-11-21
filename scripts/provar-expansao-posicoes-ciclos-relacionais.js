'use strict';
// Ensaio estrutural do espelho relacional, NAO do motor completo do LOOP.
// 1M POSICOES SINTETICAS INDEXADAS; 100K ciclos + 600K eventos.
// Testa persistencia, paginação e imutabilidade, nunca compra ou giro reais.
const {DatabaseSync}=require('node:sqlite');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {ProjecaoFilasRelacionalSQLite}=
 require('../src/producao/projecao-filas-relacional-sqlite');
const {HistoricoCiclosRelacionalSQLite}=
 require('../src/producao/historico-ciclos-relacional-sqlite');
const LOTE_POSICOES=5000,LOTE_CICLOS=1000;
const ALVOS_POSICOES=[100000,250000,500000,750000,1000000];
const ALVOS_CICLOS=[10000,50000,100000];
function arquivoSeguro(arquivo){
 const p=path.resolve(arquivo||''),prefix=path.join(os.tmpdir(),'loop-estrutura-crescente-');
 if(process.env.NODE_ENV==='production'||!p.startsWith(prefix)||
    path.basename(p)!=='estrutura.sqlite')
  throw Error('ENSAIO_ESTRUTURAL_APENAS_EM_TEMPORARIO');
 return p;
}
function abrir(file){
 const db=new DatabaseSync(arquivoSeguro(file));
 db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;'+
  'PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000');
 return db;
}
function checkpoint(db){
 return db.prepare('SELECT * FROM loop_ensaio_projecao_milhao WHERE id=1').get();
}
function iniciar(file){
 const db=abrir(file);
 try{
  const p=new ProjecaoFilasRelacionalSQLite({banco:db});
  db.exec('CREATE TABLE IF NOT EXISTS loop_ensaio_projecao_milhao('+
   'id INTEGER PRIMARY KEY CHECK(id=1),'+
   'posicoes INTEGER NOT NULL CHECK(posicoes>=0),'+
   'ciclos INTEGER NOT NULL CHECK(ciclos>=0));');
  db.prepare('INSERT OR IGNORE INTO loop_ensaio_projecao_milhao'+
   '(id,posicoes,ciclos) VALUES(1,0,0)').run();
  db.exec('BEGIN IMMEDIATE');
  try{
   p.historico.inicializarEmTransacao({
    sim:{tabuleiro:{ciclosConcluidos:[]}}
   });
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  console.log('PROJECAO_ESTRUTURAL_INICIADA=SQLITE_REAL_ESQUEMA_ISOLADO');
 }finally{db.close();}
}
function temposP95(xs){
 const a=xs.slice().sort((a,b)=>a-b);
 return Math.round(a[Math.max(0,Math.ceil(a.length*.95)-1)]||0);
}
function posicao(i){
 const grupo=Math.floor(i/4),resto=i%4;
 const fila=resto===3?'B':'A';
 const ordem=fila==='A'?grupo*3+resto+1:grupo+1;
 return {id:i+1,fila,ordem,
  participante:'titular-sintetico-'+Math.floor(i/10)};
}
function escreverPosicoes(file,alvo){
 assert.ok(ALVOS_POSICOES.includes(alvo));
 const db=abrir(file),tic=performance.now(),latencias=[],consultas=[];
 try{
  let x=checkpoint(db);
  assert.ok(x.ciclos===0&&x.posicoes<=alvo);
  const ins=db.prepare([
   'INSERT INTO loop_real_filas_projecao_posicoes(',
   'posicao_id,participante_id,empresa,fila,local,ordem,',
   'status_adesao,indicacoes_vinculadas) VALUES(?,?,0,?,?,?,NULL,0)'
  ].join(' '));
  const upd=db.prepare(
   'UPDATE loop_ensaio_projecao_milhao SET posicoes=? WHERE id=1 AND posicoes=?'
  );
  const q=db.prepare([
   'SELECT posicao_id,ordem FROM loop_real_filas_projecao_posicoes',
   'WHERE local=? AND ordem>? ORDER BY ordem LIMIT 30'
  ].join(' '));
  let lotes=0;
  while(x.posicoes<alvo){
   const de=x.posicoes,ate=Math.min(de+LOTE_POSICOES,alvo);
   const inicio=performance.now();db.exec('BEGIN IMMEDIATE');
   try{
    for(let i=de;i<ate;i++){
     const p=posicao(i);
     ins.run(p.id,p.participante,p.fila,p.fila,p.ordem);
    }
    assert.equal(upd.run(ate,de).changes,1);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   latencias.push(performance.now()-inicio);
   x.posicoes=ate;lotes++;
   const leitura=performance.now();
   const totalA=Math.floor(ate/4)*3+Math.min(ate%4,3);
   const itens=q.all('A',Math.max(0,totalA-30));
   assert.equal(itens.length,Math.min(30,totalA));
   consultas.push(performance.now()-leitura);
   if(ate%100000===0)console.log('PROJECAO_POSICOES_MARCO='+
    JSON.stringify({acumuladas:ate,ultimaOrdemA:totalA,
     consultaUltimoLoteMs:Math.round(consultas.at(-1))}));
  }
  const contagem=db.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_filas_projecao_posicoes'
  ).get().n;
  assert.equal(contagem,alvo);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('PROJECAO_POSICOES_ETAPA='+JSON.stringify({
   acumuladas:alvo,lotesAdicionais:lotes,
   segundos:Math.round((performance.now()-tic)/1000),
   loteP95Ms:temposP95(latencias),paginaP95Ms:temposP95(consultas),
   somenteEspelho:true,motorNaoSimulado:true,financeiroReal:false
  }));
 }finally{db.close();}
}
function ciclo(i){
 const n=i+1,centro={id:n,participanteId:'historico-'+n};
 return {ciclo:n,centro,concluidoEm:'2030-01-01T00:00:00Z',
  vendas:Array.from({length:6},(_,j)=>({
   vendaId:'e:ciclo-'+n+'-etapa-'+(j+1),
   ciclo:n,ordem:j+1,posicaoCentroId:n,
   destinoPrevisto:j%2?'EMPRESA':'CLIENTE'
  }))};
}
function lerCiclos(db){
 return db.prepare(
  'SELECT dados_json FROM loop_real_ciclos_historico ORDER BY ciclo'
 ).all().map(x=>JSON.parse(x.dados_json));
}
function escreverCiclos(file,alvo){
 assert.ok(ALVOS_CICLOS.includes(alvo));
 const db=abrir(file),tic=performance.now(),latencias=[];
 try{
  const x=checkpoint(db),historico=HistoricoCiclosRelacionalSQLite
   .referenciaExistente(db);
  assert.equal(x.posicoes,1000000);
  assert.ok(x.ciclos<=alvo&&historico);
  const sim={tabuleiro:{ciclosConcluidos:lerCiclos(db)}};
  assert.equal(sim.tabuleiro.ciclosConcluidos.length,x.ciclos);
  while(sim.tabuleiro.ciclosConcluidos.length<alvo){
   const de=sim.tabuleiro.ciclosConcluidos.length;
   const ate=Math.min(de+LOTE_CICLOS,alvo);
   for(let i=de;i<ate;i++)sim.tabuleiro.ciclosConcluidos.push(ciclo(i));
   const inicio=performance.now();db.exec('BEGIN IMMEDIATE');
   try{
    const y=historico.sincronizarEmTransacao({sim});
    assert.equal(y.totalCiclos,ate);
    assert.equal(db.prepare([
     'UPDATE loop_ensaio_projecao_milhao',
     'SET ciclos=? WHERE id=1 AND ciclos=?'
    ].join(' ')).run(ate,de).changes,1);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   latencias.push(performance.now()-inicio);
   if(ate%10000===0)console.log('PROJECAO_CICLOS_MARCO='+
    JSON.stringify({acumulados:ate,eventos:ate*6}));
  }
  const r=historico.conferir({sim});
  assert.equal(r.totalCiclos,alvo);
  assert.equal(r.totalEventos,alvo*6);
  const pagina=historico.consultarPagina({inicio:alvo-49,limite:50});
  assert.equal(pagina.ciclos.length,50);
  assert.equal(pagina.ciclos.at(-1).ciclo,alvo);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PROJECAO_CICLOS_ETAPA='+JSON.stringify({
   acumulados:alvo,eventos:alvo*6,
   segundos:Math.round((performance.now()-tic)/1000),
   loteP95Ms:temposP95(latencias),integridade:'OK',
   somenteArquivoRelacional:true,motorNaoSimulado:true,
   financeiroReal:false
  }));
 }finally{db.close();}
}
function crash(file){
 const db=abrir(file);
 const x=checkpoint(db);
 assert.equal(x.posicoes,100000);
 db.exec('BEGIN IMMEDIATE');
 const ins=db.prepare([
  'INSERT INTO loop_real_filas_projecao_posicoes(',
  'posicao_id,participante_id,empresa,fila,local,ordem,',
  'status_adesao,indicacoes_vinculadas) VALUES(?,?,0,?,?,?,NULL,0)'
 ].join(' '));
 for(let i=100000;i<100200;i++){
  const p=posicao(i);
  ins.run(p.id,p.participante,p.fila,p.fila,p.ordem);
 }
 console.log('PROJECAO_CRASH_ANTES_COMMIT=200_POSICOES');
 process.exit(79);
}
function final(file){
 const db=abrir(file);
 try{
  const x=checkpoint(db);
  assert.equal(x.posicoes,1000000);
  assert.equal(x.ciclos,100000);
  const p=Object.create(ProjecaoFilasRelacionalSQLite.prototype);
  p.db=db;
  const primeira=p.consultarFila({fila:'A',aposOrdem:749970,limite:30});
  assert.equal(primeira.itens.length,30);
  assert.equal(primeira.itens[0].ordem,749971);
  assert.equal(primeira.itens.at(-1).ordem,750000);
  assert.equal(primeira.proximaOrdem,null);
  const b=p.consultarFila({fila:'B',aposOrdem:249970,limite:30});
  assert.equal(b.itens.at(-1).ordem,250000);
  assert.equal(b.proximaOrdem,null);
  const h=HistoricoCiclosRelacionalSQLite.referenciaExistente(db);
  const sim={tabuleiro:{ciclosConcluidos:lerCiclos(db)}};
  assert.equal(h.conferir({sim}).totalEventos,600000);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const tamanho=fs.statSync(file).size;
  console.log('EXPANSAO_RELACIONAL_RESULTADO_FINAL='+JSON.stringify({
   posicoesSinteticasIndexadas:1000000,
   simulacaoDeAtivosDoMotor:false,
   distribuicaoIndiceA:750000,distribuicaoIndiceB:250000,
   ciclosHistoricosSinteticos:100000,eventosHistoricosSinteticos:600000,
   processosReabertos:true,quedaAntesCommitRecuperada:true,
   integridade:'OK',bytesArquivo:tamanho,
   pspsUsados:0,comprasCriadas:0,girosCriados:0,
   limite:'nao_comprova_1_milhao_de_posicoes_ativas_no_motor'
  }));
 }finally{db.close();}
}
function filho(file,modo,alvo){
 const r=spawnSync(process.execPath,[__filename,modo,file,
  ...(alvo===undefined?[]:[String(alvo)])],{
  stdio:'inherit',timeout:25*60*1000,
  env:{...process.env,NODE_ENV:'test',LOOP_EXPANSAO_ISOLADA:'SIM'}
 });
 if(r.error||r.status!==0)throw Error('EXPANSAO_FILHO_FALHOU_'+
  modo+'_'+alvo+'_'+String(r.error?.message||r.status));
}
function main(){
 const modo=process.argv[2];
 if(modo){
  if(process.env.LOOP_EXPANSAO_ISOLADA!=='SIM')
   throw Error('EXPANSAO_SEM_ISOLAMENTO');
  const file=arquivoSeguro(process.argv[3]);
  if(modo==='init')return iniciar(file);
  if(modo==='posicoes')return escreverPosicoes(file,Number(process.argv[4]));
  if(modo==='ciclos')return escreverCiclos(file,Number(process.argv[4]));
  if(modo==='crash')return crash(file);
  if(modo==='final')return final(file);
  throw Error('EXPANSAO_ARGUMENTO_INVALIDO');
 }
 if(process.env.NODE_ENV==='production')throw Error('EXPANSAO_PRODUCAO_PROIBIDA');
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-estrutura-crescente-'));
 const file=path.join(pasta,'estrutura.sqlite');
 try{
  filho(file,'init');filho(file,'posicoes',100000);
  const r=spawnSync(process.execPath,[__filename,'crash',file],{
   stdio:'inherit',timeout:60000,
   env:{...process.env,NODE_ENV:'test',LOOP_EXPANSAO_ISOLADA:'SIM'}
  });
  assert.equal(r.status,79);
  for(const alvo of ALVOS_POSICOES.slice(1))filho(file,'posicoes',alvo);
  for(const alvo of ALVOS_CICLOS)filho(file,'ciclos',alvo);
  filho(file,'final');
  console.log('EXPANSAO_RELACIONAL_CARGA_CONTINUA=COMPROVADA');
 }finally{fs.rmSync(pasta,{recursive:true,force:true});}
}
try{main();}catch(e){
 console.error('EXPANSAO_RELACIONAL_ERRO='+String(e?.stack||e));
 process.exitCode=1;
}
