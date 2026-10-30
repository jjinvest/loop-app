'use strict';
// Carga HTTP LOCAL e LIMITADA, sem clientes reais ou internet publica.
// 1536 requisicoes agregadas, 48 conexoes concorrentes no mesmo host.
// Isso NAO representa 1536 usuarios simultaneos nem SLA externo.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {performance}=require('node:perf_hooks');
const http=require('node:http');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOTAL=1536,CONCORRENCIA=48;
const percentil=(a,p)=>{
 const s=[...a].sort((x,y)=>x-y);
 return Math.round(s[Math.ceil(s.length*p)-1]*100)/100;
};
test('HTTP: 1536 leituras locais concorrencia 48; latencia, isolamento e integridade', {timeout:120000},async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:'segredo-carga-http-local-2026-autorizacao-teste-longo'});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(ok=>server.close(ok)));
 const port=server.address().port;
 const agent=new http.Agent({keepAlive:true,maxSockets:CONCORRENCIA});
 t.after(()=>agent.destroy());
 const before=repo.banco.prepare('SELECT COUNT(*) AS n FROM catalogo_produtos').get().n;
 let proximo=0,sucessos=0,fracassos=0;
 const latencias=[],status={},sizeByPath={};
 async function cliente(){
  while(proximo<TOTAL){
   const indice=proximo++;
   const caminho=indice%6===0?'/laboratorio/loja':
    indice%6===1?'/laboratorio/participante':
    '/api/laboratorio/loop03/publicacoes';
   const inicio=performance.now();
   const r=await new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port,path:caminho,agent,
     timeout:10000,headers:{Accept:'*/*'}},res=>{
      let bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length});
      res.on('end',()=>resolve({status:res.statusCode,bytes,
       noStore:res.headers['cache-control']==='no-store'}));
      res.on('error',reject);
     });
    req.on('timeout',()=>req.destroy(new Error('HTTP_TIMEOUT')));
    req.on('error',reject);
   });
   latencias.push(performance.now()-inicio);
   status[r.status]=(status[r.status]||0)+1;
   sizeByPath[caminho]=(sizeByPath[caminho]||0)+r.bytes;
   if(r.status===200&&r.bytes>0&&r.noStore)sucessos++;else fracassos++;
  }
 }
 const t0=performance.now();
 await Promise.all(Array.from({length:CONCORRENCIA},()=>cliente()));
 const duracaoMs=performance.now()-t0;
 assert.equal(sucessos,TOTAL);
 assert.equal(fracassos,0);
 assert.deepEqual(status,{'200':TOTAL});
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM catalogo_produtos').get().n,before);
 assert.equal(Object.values(repo.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 const metrica={requisicoes:TOTAL,concorrenciaMaxima:CONCORRENCIA,
  sucesso:sucessos,falhas:fracassos,latenciasMs:{
   p50:percentil(latencias,.50),p95:percentil(latencias,.95),
   p99:percentil(latencias,.99),
   max:Math.round(Math.max(...latencias)*100)/100},
  duracaoLoteMs:Math.round(duracaoMs),
  throughputObservadoReqPorSegundo:Math.round(100*TOTAL/(duracaoMs/1000))/100,
  statusPorCodigo:status,
  paginasIncluidas:Object.keys(sizeByPath),
  nenhumaEscritaDeProduto:true,umUnicoHost:true,usuariosSimultaneosComprovados:false,
  slaProducao:false};
 console.log('LOOP_CARGA_HTTP_LOCAL='+JSON.stringify(metrica));
});
