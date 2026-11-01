'use strict';
// Contratos de inicializacao publica: rotas de simulacao nunca ganham direitos reais.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {bloquearMutacoesSimuladas}=require('../src/middleware/proteger-simulacao');
function verificar(env={}){
 const e={...process.env,NODE_ENV:'production',...env};
 delete e.LOOP_CLIENTES_LAB;
 delete e.LOOP_MODO_SIMULACAO;
 Object.assign(e,env);
 return spawnSync(process.execPath,['-e',"require('./src/server')"],{
  cwd:path.join(__dirname,'..'),env:e,encoding:'utf8',timeout:10000
 });
}
test('servidor publico recusa flag de clientes laboratorio antes de abrir banco',()=>{
 const r=verificar({LOOP_CLIENTES_LAB:'SIM',LOOP_CLIENTES_LAB_SQLITE:'/arquivo-inexistente.sqlite'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/LOOP_LABORATORIO_INCOMPATIVEL_COM_PRODUCAO/);
 assert.doesNotMatch(r.stderr,/SQLITE_CANTOPEN|ENOENT/);
});
test('servidor publico recusa flag de simulacao da catraca',()=>{
 const r=verificar({LOOP_MODO_SIMULACAO:'1'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/LOOP_LABORATORIO_INCOMPATIVEL_COM_PRODUCAO/);
});
test('inicializacao sem modos simulados continua possivel, sem ativar vendas reais',()=>{
 const r=verificar();
 assert.equal(r.status,0,r.stderr.slice(0,400));
});
test('endpoints de escrita continuam proibidos mesmo em processo de producao',()=>{
 const anterior={...process.env};
 process.env.NODE_ENV='production';process.env.LOOP_MODO_SIMULACAO='1';
 let status=null,next=false;
 try{
  const req={method:'POST',socket:{remoteAddress:'127.0.0.1'}};
  const res={status(n){status=n;return this;},json(obj){
   assert.equal(obj.erro,'OPERACAO_SIMULADA_DESABILITADA');
   return this;
  }};
  bloquearMutacoesSimuladas(req,res,()=>{next=true;});
  assert.equal(status,403);assert.equal(next,false);
 }finally{
  if(anterior.NODE_ENV===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=anterior.NODE_ENV;
  if(anterior.LOOP_MODO_SIMULACAO===undefined)delete process.env.LOOP_MODO_SIMULACAO;
  else process.env.LOOP_MODO_SIMULACAO=anterior.LOOP_MODO_SIMULACAO;
 }
});
