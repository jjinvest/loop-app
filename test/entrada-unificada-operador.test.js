'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
test('mesma caixa de nick e senha autentica operador isolado do cliente',async t=>{
 const gateway=criarGateway({portaInterna:12345,
  senhaAcesso:'SENHA_ACESSO_TESTE_123456789012345',
  senhaAdmin:'SENHA_OPERADOR_TESTE_123456789012345',
  segredoOperador:'SEGREDO_ISOLADO_OPERADOR_TESTE_123456789012345',
  permitirOrigemHttpLoopback:true});
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>new Promise(resolve=>gateway.close(resolve)));
 const origin='http://127.0.0.1:'+gateway.address().port;
 const entrar=(nick,senha,origem=origin)=>fetch(origin+'/api/operador/entrar',{
  method:'POST',headers:{Origin:origem,'Content-Type':'application/json'},
  body:JSON.stringify({nick,senha})
 });
 assert.equal((await entrar('operador','errada')).status,401);
 assert.equal((await entrar('operador','SENHA_OPERADOR_TESTE_123456789012345','https://externo.invalid')).status,403);
 const r=await entrar('operador','SENHA_OPERADOR_TESTE_123456789012345');
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{operador:true});
 const cookie=r.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookie,/^akitemm_preview_admin_v2=v2\./);
 const estado=await fetch(origin+'/api/operador/estado',{headers:{Cookie:cookie}});
 assert.deepEqual(await estado.json(),{operador:true});
 const logout=await fetch(origin+'/api/operador/sair',{method:'POST',
  headers:{Cookie:cookie,Origin:origin}});
 assert.equal(logout.status,200);
 assert.deepEqual(await (await fetch(origin+'/api/operador/estado',
  {headers:{Cookie:cookie}})).json(),{operador:false});
 assert.equal((await fetch(origin+'/api/operador/entrar')).status,405);
});
test('dois logins aceitam operador e exibem interface sem fingir conta de cliente',()=>{
 const ler=p=>readFileSync(path.join(__dirname,'..',p),'utf8');
 const real=ler('src/producao/interface-aprovada-contas.js');
 const candidato=ler('src/candidato/checkout-candidato-ui.js');
 for(const fonte of [real,candidato]){
  assert.match(fonte,/api\/operador\/entrar/);
  assert.match(fonte,/toLowerCase\(\)==='operador'/);
  assert.match(fonte,/location\.assign\('\/staging\/cliente\?modo=operador'\)/);
 }
 assert.match(candidato,/abrirModoOperadorNaTela/);
 assert.match(candidato,/modoOperadorSemCliente/);
 assert.match(candidato,/Nao abrir APIs de dados pessoais/);
 assert.match(ler('src/candidato/operador-em-tela.js'),/relogioTabuleiroIntegrado/);
});
