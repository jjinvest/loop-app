'use strict';
// Prova ESTRUTURAL e CONTINUADA do mesmo SQLite, em processos diferentes.
// NÃO testa 1M logins, pagamentos, posições reais, 1M simultâneos ou PSP.
// Banco exclusivo, efêmero, SEM dados pessoais e SEM qualquer transação real.
// Não é execução do serviço público nem trabalha em volumes do Railway.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');

const MARCOS=[100000,250000,500000,750000,1000000];
const LOTE=5000;
const BASE_MS=1700000000000;
const DOC='Prova isolada de durabilidade e cadastros sintéticos, sem compras, '+
 'posições financeiras, CPF, PSP, bônus, saque, dinheiro ou clientes reais.';
const CONFIG={
 chaveEmail:Buffer.alloc(32,17),chaveCifra:Buffer.alloc(32,33),
 chaveCodigo:Buffer.alloc(32,55),enviarEmail:async()=>true,
 termos:{versao:'LOOP-CARGA-CONTINUA-2026',texto:DOC},
 privacidade:{versao:'LOOP-CARGA-PRIV-2026',texto:DOC}
};
function letras(i){
 let x=i,s='';
 do{s=String.fromCharCode(97+x%26)+s;x=Math.floor(x/26);}
 while(x);
 return 'u'+s;
}
function pessoa(i){
 return 'titular-'+i.toString(16).padStart(8,'0')+
 '-0000-4000-8000-000000000000';
}
function pathSeguro(arquivo){
 const prefix=path.join(os.tmpdir(),'loop-continuidade-');
 const p=path.resolve(arquivo||'');
 if(process.env.NODE_ENV==='production'||!p.startsWith(prefix)||
    path.basename(p)!=='simulacao.sqlite')
  throw Error('CARGA_ISOLADA_APENAS_EM_ARQUIVO_TEMPORARIO');
 return p;
}
function abrir(arquivo){
 const db=new DatabaseSync(pathSeguro(arquivo));
 db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;'+
  'PRAGMA busy_timeout=2000;PRAGMA synchronous=FULL');
 const contas=new IdentidadeClienteLoopReal({...CONFIG,banco:db});
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 db.exec([
  'CREATE TABLE IF NOT EXISTS loop_ensaio_continuo_progresso(',
  'id INTEGER PRIMARY KEY CHECK(id=1),',
  'indicador TEXT NOT NULL,carregados INTEGER NOT NULL CHECK(carregados>=0),',
  'lotes INTEGER NOT NULL CHECK(lotes>=0));'
 ].join(' '));
 return {db,contas,motor};
}
async function inicio(x){
 let progresso=x.db.prepare(
  'SELECT * FROM loop_ensaio_continuo_progresso WHERE id=1'
 ).get();
 if(progresso)return progresso;
 const docs=x.contas.documentos();
 const seed=await x.contas.cadastrar({
  nome:'Indicador sintético',nick:'OrigemCarga',
  email:'origemcarga@example.invalid',
  senha:'SenhaCargaContinua2026!',aceiteTermos:true,
  aceitePrivacidade:true,versaoTermos:docs.termos.versao,
  hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 x.db.prepare([
  'INSERT INTO loop_ensaio_continuo_progresso',
  '(id,indicador,carregados,lotes) VALUES(1,?,0,0)'
 ].join(' ')).run(seed.titularId);
 progresso=x.db.prepare(
  'SELECT * FROM loop_ensaio_continuo_progresso WHERE id=1'
 ).get();
 return progresso;
}
function prepararInsercoes(db){
 return {
  conta:db.prepare([
   'INSERT INTO loop_real_contas',
   '(id,nick,email_hmac,nome_iv,nome_ct,nome_tag,',
   'email_iv,email_ct,email_tag,senha_salt,senha_hash,',
   'termos_versao,termos_hash,priv_versao,priv_hash,criado_em)',
   'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ].join(' ')),
  vinculo:db.prepare([
   'INSERT INTO loop_real_vinculos_indicacao',
   '(indicado_id,indicador_id,registrado_em) VALUES(?,?,?)'
  ].join(' ')),
  checkpoint:db.prepare([
   'UPDATE loop_ensaio_continuo_progresso',
   'SET carregados=?,lotes=lotes+1 WHERE id=1 AND carregados=?'
  ].join(' '))
 };
}
function inserirUm({conta,vinculo},i,indicador){
 const id=pessoa(i);
 conta.run(id,letras(i),i.toString(16).padStart(64,'0'),
  'x','x','x','x','x','x','x','x',
  'T','hash','P','hash',BASE_MS+i);
 vinculo.run(id,indicador,BASE_MS+Math.floor(i/10));
}
function check(x,indice){
 const db=x.db,estado=db.prepare(
  'SELECT * FROM loop_ensaio_continuo_progresso WHERE id=1'
 ).get();
 assert.equal(estado.carregados,indice);
 const qt=db.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao'
 ).get().n;
 assert.equal(qt,indice,'nunca perder nem duplicar vínculo após COMMIT');
 if(indice>0){
  const ultimo=db.prepare([
   'SELECT indicado_id FROM loop_real_vinculos_indicacao',
   'WHERE indicador_id=? ORDER BY registrado_em,indicado_id',
   'LIMIT 1 OFFSET ?'
  ].join(' ')).get(estado.indicador,indice-1);
  assert.equal(ultimo.indicado_id,pessoa(indice-1));
 }
 const estadoMotor=x.motor.verificar();
 assert.equal(estadoMotor.compras,0);
 assert.equal(estadoMotor.eventos,0);
 assert.equal(estadoMotor.giros,0);
 return estado;
}
function percentile(a,p){
 const b=a.slice().sort((x,y)=>x-y);
 return b[Math.max(0,Math.ceil(b.length*p)-1)]||0;
}
function consultaPaginada(x,indice,estado){
 if(!indice)return 0;
 const inicio=performance.now();
 const pagina=x.contas.listarIndicados(estado.indicador,{
  offset:indice-50,limite:50
 });
 const ms=performance.now()-inicio;
 assert.equal(pagina.indicados.length,50);
 assert.equal(pagina.indicados[0].nick,letras(indice-50));
 assert.equal(pagina.indicados[49].nick,letras(indice-1));
 assert.equal(pagina.indicados[49].numeroCadastro,indice);
 assert.equal(pagina.total,indice);
 assert.equal(pagina.financeiroReal,false);
 return ms;
}
async function etapa(arquivo,alvo){
 assert.ok(MARCOS.includes(alvo));
 const x=abrir(arquivo),db=x.db;
 try{
  let p=await inicio(x);
  assert.ok(p.carregados<=alvo,'proibido regredir ou apagar etapas');
  check(x,p.carregados);
  const sql=prepararInsercoes(db),tempos=[],consultas=[];
  let pontos=0;
  const inicioMs=performance.now(),inicial=p.carregados;
  const plano=db.prepare([
   'EXPLAIN QUERY PLAN SELECT indicado_id',
   'FROM loop_real_vinculos_indicacao WHERE indicador_id=?',
   'ORDER BY registrado_em,indicado_id LIMIT 50 OFFSET ?'
  ].join(' ')).all(p.indicador,Math.max(0,p.carregados-50))
   .map(r=>r.detail).join('; ');
  assert.match(plano,/idx_loop_real_vinculos_ordem/);
  while(p.carregados<alvo){
   const from=p.carregados,to=Math.min(from+LOTE,alvo);
   const tic=performance.now();
   db.exec('BEGIN IMMEDIATE');
   try{
    for(let i=from;i<to;i++)inserirUm(sql,i,p.indicador);
    assert.equal(sql.checkpoint.run(to,from).changes,1);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   tempos.push(performance.now()-tic);
   pontos++;
   p={...p,carregados:to,lotes:p.lotes+1};
   // Durante o crescimento: leitura real via módulo do cliente, sem parar
   // escrita por toda a fase nem depender de um lote isolado descartável.
   consultas.push(consultaPaginada(x,to,p));
   if(to%100000===0){
    check(x,to);
    console.log('CARGA_CONTINUA_CHECKPOINT='+JSON.stringify({
     registros:to,lotes:p.lotes,filaCadastro:'B',
     compraReal:false,financeiroReal:false,msUltimaPagina:Math.round(consultas.at(-1))
    }));
   }
  }
  check(x,alvo);
  const deep=consultaPaginada(x,alvo,p);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const ms=performance.now()-inicioMs,stat=fs.statSync(arquivo);
  const relatorio={
   acumulados:alvo,acrescentados:alvo-inicial,
   lotesNoTotal:p.lotes,transacoesNestaEtapa:pontos,
   processoReiniciado:true,estadoAnteriorPreservado:true,
   segundosNestaEtapa:Math.round(ms/100)/10,
   insercoesPorSegundo:Math.round((alvo-inicial)*1000/Math.max(1,ms)),
   gravacaoP95Ms:Math.round(percentile(tempos,.95)),
   paginaP95Ms:Math.round(percentile(consultas,.95)),
   paginaFinalMs:Math.round(deep),bytesArquivo:stat.size,
   integridade:'OK',duplicacoes:0,
   compras:0,giros:0,pagamentosReais:0
  };
  console.log('CARGA_CONTINUA_ETAPA='+JSON.stringify(relatorio));
  return relatorio;
 }finally{db.close();}
}
function crash(arquivo){
 const x=abrir(arquivo),db=x.db;
 const p=check(x,100000),sql=prepararInsercoes(db);
 db.exec('BEGIN IMMEDIATE');
 for(let i=p.carregados;i<p.carregados+100;i++)
  inserirUm(sql,i,p.indicador);
 // QUEDA ABRUPTA ANTES DO COMMIT: deliberadamente sem fechamento seguro.
 console.log('CARGA_CONTINUA_FALHA_SIMULADA_ANTES_COMMIT=100');
 process.exit(79);
}
async function verificarFinal(arquivo){
 const x=abrir(arquivo),db=x.db;
 try{
  const p=check(x,1000000);
  assert.equal(consultaPaginada(x,1000000,p)>=0,true);
  // Provar que UMA inscrição real pelo caminho de autenticação funciona
  // mesmo depois dos 1 milhão de linhas sintéticas (não criar 1M logins).
  const docs=x.contas.documentos(),inicioMs=performance.now();
  const full=await x.contas.cadastrar({
   nome:'Inscricao real de teste',nick:'CadastroFinal',
   email:'finalcarga@example.invalid',senha:'SenhaCargaContinua2026!',
   indicadorNick:'OrigemCarga',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  assert.equal(full.contaCriada,true);
  assert.equal(full.vinculoCadastro,true);
  const ms=performance.now()-inicioMs;
  const final=x.contas.listarIndicados(p.indicador,{
   offset:1000000,limite:50
  });
  assert.equal(final.total,1000001);
  assert.equal(final.indicados.length,1);
  assert.equal(final.indicados[0].nick,'cadastrofinal');
  assert.equal(final.indicados[0].numeroCadastro,1000001);
  assert.equal(x.motor.verificar().compras,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('CARGA_CONTINUA_RESULTADO_FINAL='+JSON.stringify({
   contasSinteticas:1000000,vinculosSinteticos:1000000,
   cadastrosReaisDeTeste:2, // indicador inicial + cadastro final, não 1M
   vinculosTotais:1000001,autenticacaoCompletaApos1M:true,
   msCadastroCompletoApos1M:Math.round(ms),
   integridade:'OK',posicoesPagas:0,giros:0,dinheiroReal:false,
   simultaneidadeDeUmMilhaoNaoTestada:true
  }));
 }finally{x.db.close();}
}
function filho(arquivo,modo,numero){
 const r=spawnSync(process.execPath,[__filename,modo,arquivo,
  ...(numero===undefined?[]:[String(numero)])],{
  stdio:'inherit',timeout:25*60*1000,
  env:{...process.env,NODE_ENV:'test',LOOP_CARGA_ISOLADA:'SIM'}
 });
 if(r.error||r.status!==0)throw Error('CARGA_CONTINUA_FALHA_'+
  modo+'_'+numero+'_'+String(r.error?.message||r.status));
}
async function principal(){
 const modo=process.argv[2];
 if(modo==='etapa'||modo==='crash'||modo==='verificar'){
  if(process.env.LOOP_CARGA_ISOLADA!=='SIM')
   throw Error('CARGA_CONTINUA_SEM_AMBIENTE_ISOLADO');
  const arquivo=pathSeguro(process.argv[3]);
  if(modo==='etapa')await etapa(arquivo,Number(process.argv[4]));
  if(modo==='crash')crash(arquivo);
  if(modo==='verificar')await verificarFinal(arquivo);
  return;
 }
 if(modo!==undefined)throw Error('CARGA_CONTINUA_ARGUMENTO_INVALIDO');
 if(process.env.NODE_ENV==='production')
  throw Error('CARGA_CONTINUA_PROIBIDA_EM_PRODUCAO');
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-continuidade-'));
 const arquivo=path.join(pasta,'simulacao.sqlite');
 const inicio=performance.now();
 try{
  filho(arquivo,'etapa',100000);
  const a=spawnSync(process.execPath,[__filename,'crash',arquivo],{
   stdio:'inherit',timeout:60000,
   env:{...process.env,NODE_ENV:'test',LOOP_CARGA_ISOLADA:'SIM'}
  });
  assert.equal(a.status,79,'a queda antes do commit deve ser observada');
  console.log('CARGA_CONTINUA_RECUPERACAO_APOS_QUEDA=INICIADA');
  for(const marco of MARCOS.slice(1))filho(arquivo,'etapa',marco);
  filho(arquivo,'verificar');
  console.log('CARGA_CONTINUA_PROVA_COMPLETA='+JSON.stringify({
   meta:1000000,primeiroMarco:100000,
   mesmoBancoDuranteTodosOsMarcos:true,processosReiniciados:true,
   crashAntesCommitRevertido:true,integridade:'OK',
   duracaoTotalSegundos:Math.round((performance.now()-inicio)/1000),
   dadosPessoaisReais:false,psp:false,producao:false,
   limite:'nao prova 1 milhao de posicoes nem 1 milhao de logins'
  }));
 }finally{fs.rmSync(pasta,{recursive:true,force:true});}
}
principal().catch(e=>{
 console.error('CARGA_CONTINUA_ERRO='+String(e?.message||e));
 process.exitCode=1;
});
