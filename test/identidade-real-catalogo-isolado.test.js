'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {criarServidorPreparacao}=require('../scripts/iniciar-identidade-real-preparacao');
const {tokenCatalogo}=require('../src/producao/catalogo-mercadorias-real');
test('identidade REAL continua bloqueada; catalogo tem banco separado e rota autenticada',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-preparacao-'));
 const tokenRaiz='c'.repeat(64);
 const ambiente={
  NODE_ENV:'production',LOOP_REAL_PREPARACAO_INTERNA:'SIM',
  LOOP_REAL_CADASTRO_GO:'NAO',LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_DADOS_SEPARADOS:'SIM',
  LOOP_REAL_SQLITE:path.join(pasta,'clientes.sqlite'),
  LOOP_REAL_CATALOGO_EDITAVEL:'SIM',
  LOOP_REAL_BOOTSTRAP_MOTOR_INTERNO:'NAO',
  LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN:tokenRaiz
 };
 const server=criarServidorPreparacao({ambiente,pasta});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{
  await new Promise(r=>server.close(r));
  fs.rmSync(pasta,{recursive:true,force:true});
 });
 const base='http://127.0.0.1:'+server.address().port;
 const fazer=async(rota,headers={},method='GET',body)=>{
  const r=await fetch(base+rota,{headers,method,body});
  return {status:r.status,body:await r.json()};
 };
 const auth={'x-loop-catalogo-token':tokenCatalogo(tokenRaiz)};
 assert.equal((await fazer('/healthz')).status,200);
 assert.equal((await fazer('/readyz')).status,503);
 assert.equal((await fazer('/internal/catalogo/status')).status,401);
 const status=await fazer('/internal/catalogo/status',auth);
 assert.equal(status.status,200);
 assert.equal(status.body.checkoutReal,false);
 assert.equal((await fazer('/internal/catalogo/vitrine',auth)).body.produtos.length,0);
 assert.equal((await fazer('/staging/contas/cadastrar',auth,'POST','{}')).status,503);
 assert.equal((await fazer('/internal/loop/tabuleiro')).status,401);
 assert.equal(fs.existsSync(path.join(pasta,'catalogo-produtos.sqlite')),true);
 assert.equal(fs.existsSync(path.join(pasta,'clientes.sqlite')),false,
  'produtos reais nao criam contas nem alteram o banco de identidade');
});
