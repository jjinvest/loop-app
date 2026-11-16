'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const c='SENHA_CLIENTE_TESTE_1234567890',a='SENHA_ADMIN_TESTE_1234567890',sec='SEGREDO_OPERADOR_TESTE_SAIDA_SESSAO_2026_123';
const basic=(u,p)=>'Basic '+Buffer.from(u+':'+p).toString('base64');
test('cliente continua cliente, operador nao reaparece apos sair',async t=>{
 const backend=http.createServer((_req,res)=>res.end('OK'));
 backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const gw=criarGateway({portaInterna:backend.address().port,senhaAcesso:c,senhaAdmin:a,segredoOperador:sec});
 gw.listen(0,'127.0.0.1');await once(gw,'listening');
 t.after(async()=>{await new Promise(r=>gw.close(r));await new Promise(r=>backend.close(r));});
 const base='http://127.0.0.1:'+gw.address().port;
 const o=await fetch(base+'/escritorio',{headers:{Authorization:basic('operador',a)}});
 assert.equal(o.status,200);
 const cookieAdmin=o.headers.get('set-cookie')?.split(';')[0];
 const x=await fetch(base+'/minha-conta',{headers:{Authorization:basic('acesso',c)}});
 const cookieCliente=x.headers.get('set-cookie')?.split(';')[0];
 const cookie=cookieAdmin+'; '+cookieCliente;
 assert.deepEqual(await (await fetch(base+'/api/operador/estado',{headers:{Cookie:cookie}})).json(),{operador:true});
 assert.equal((await fetch(base+'/staging/operador/sair',{method:'POST',
  headers:{Cookie:cookie,Origin:'https://atacante.invalid'}})).status,403);
 const saida=await fetch(base+'/staging/operador/sair',{method:'POST',
  headers:{Cookie:cookie,'Sec-Fetch-Site':'same-origin'}});
 assert.equal(saida.status,200);
 assert.match(saida.headers.get('set-cookie'),/Max-Age=0/);
 assert.deepEqual(await saida.json(),{operador:false});
 assert.deepEqual(await (await fetch(base+'/api/operador/estado',{headers:{Cookie:cookie}})).json(),{operador:false});
 assert.equal((await fetch(base+'/staging/escritorio-unificado/motor/estado',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(base+'/minha-conta',{headers:{Cookie:cookieCliente}})).status,200);
});
test('ambos logins pessoais encerram modo operador e botoes recebem acabamento',()=>{
 const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const candidate=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 assert.match(candidate,/terminarModoOperador/);
 assert.match(candidate,/\/staging\/operador\/sair/);
 assert.match(real,/terminarModoOperador/);
 assert.match(real,/\/api\/operador\/sair/);
 assert.match(ler('src/candidato/operador-em-tela.js'),/loop:operador-saiu/);
 const css=ler('src/shared/acabamento-visual-loop.js');
 assert.match(css,/button:not\(:disabled\):active/);
 assert.match(css,/akitemmOperadorMais/);
 assert.match(css,/loopOperadorMais/);
});
