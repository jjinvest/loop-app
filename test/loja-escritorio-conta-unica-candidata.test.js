'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-candidato-'+('Z'.repeat(48));
const termosVersao='LAB-precheckout-nov26';
const termosTexto='Estes termos são exclusivamente de laboratório; não configuram compra, pagamento, posição ou promessa de lucro.';
function config(banco,keyA,keyB){
 return {banco,chaveEmail:keyA,chaveCifra:keyB,
  repositorioCatalogo:catalogoFicticioCheckout(),
  segredoOperador:ADMIN,termosVersao,termosTexto};
}
async function iniciar(app){
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,base:'http://127.0.0.1:'+server.address().port};
}
async function enviar(base,url,{method='GET',cookie,csrf,data,extra={}}={}){
 const r=await fetch(base+url,{method,headers:{
  ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
  ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
  ...(data?{'Content-Type':'application/json'}:{}),...extra
 },...(data?{body:JSON.stringify(data)}:{})});
 const c=r.headers.get('set-cookie');
 const payload=await r.json();
 return {status:r.status,body:payload,cookie:c};
}
test('conta única prepara checkout e Escritório com o MESMO titular, sem Pix',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-unificado-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const dbFile=path.join(dir,'prova.sqlite');
 const keyA=randomBytes(32),keyB=randomBytes(32);
 const db=new DatabaseSync(dbFile);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const keysCpf={chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32)};
 const impl=criarAppLojaEscritorioCandidato({
  ...config(db,keyA,keyB),...keysCpf
 });
 const {server,base}=await iniciar(impl.app);
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const form=(nick,email)=>({nome:nick+' Exemplo',nick,
  email,senha:'SenhaFicticiaDemonstracao2026!',aceiteExplicito:true});
 const alice=await enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form('Alice','alice@example.invalid')
 });
 assert.equal(alice.status,201,JSON.stringify(alice.body));
 assert.equal(alice.body.emailVerificado,false);
 assert.equal(alice.body.pagamentoPermitido,false);
 const bob=await enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form('Bia','bia@example.invalid')
 });
 assert.equal(bob.status,201);
 assert.notEqual(alice.body.titularId,bob.body.titularId);
 assert.equal((await enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form('ALICE','outra@example.invalid')
 })).status,409,'nick insensível a maiúsculas');
 assert.equal((await enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form('Carol','alice@example.invalid')
 })).status,409,'email nao duplica');
 const raw=JSON.stringify(db.prepare(
  'SELECT * FROM akitemm_conta_unica_candidata'
 ).all());
 assert.equal(raw.includes('alice@example.invalid'),false,'email cifrado');
 assert.equal(raw.includes('Alice Exemplo'),false,'nome cifrado');
 assert.equal(raw.includes('SenhaFicticiaDemonstracao2026!'),false);
 assert.equal((await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'Alice',senha:'errada'}
 })).status,401);
 const la=await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'ALICE',senha:'SenhaFicticiaDemonstracao2026!'}
 });
 const lb=await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'Bia',senha:'SenhaFicticiaDemonstracao2026!'}
 });
 assert.equal(la.status,200);assert.equal(lb.status,200);
 assert.match(la.cookie,/HttpOnly/);assert.match(la.cookie,/SameSite=Strict/);
 const cookieA=la.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const cookieB=lb.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const csrfA=la.body.csrf;
 assert.equal((await enviar(base,'/staging/contas/me')).status,401);
 const me=await enviar(base,'/staging/contas/me',{cookie:cookieA});
 assert.equal(me.status,200);
 const semSessao=await enviar(base,'/staging/vitrine/meus-links');
 assert.equal(semSessao.status,401);
 const linkA=await enviar(base,'/staging/vitrine/meus-links',{cookie:cookieA});
 const linkB=await enviar(base,'/staging/vitrine/meus-links',{cookie:cookieB});
 assert.equal(linkA.status,200);assert.equal(linkB.status,200);
 assert.deepEqual([linkA.body.linkLoja,linkA.body.linkEscritorio],[
  '/loja/alice','/escritorio/alice'
 ]);
 assert.equal(linkB.body.linkLoja,'/loja/bia');
 assert.equal(linkA.body.ativo,true);
 assert.equal(linkA.body.apenasEnsaio,true);
 assert.equal(linkA.body.semComissaoReal,true);
 assert.equal((await enviar(base,'/staging/contas/identidade',{
  method:'POST',cookie:cookieA,data:{
   cpf:'529.982.247-25',aceiteExplicito:true
  }
 })).status,403,'CSRF obrigatorio para CPF');
 const cpfCadastrado=await enviar(base,'/staging/contas/identidade',{
  method:'POST',cookie:cookieA,csrf:csrfA,
  data:{cpf:'529.982.247-25',aceiteExplicito:true}
 });
 assert.equal(cpfCadastrado.status,201,JSON.stringify(cpfCadastrado.body));
 assert.equal(cpfCadastrado.body.identidadeExternaVerificada,false);
 assert.equal(cpfCadastrado.body.permitidoCriarPosicoes,false);
 assert.equal((await enviar(base,'/staging/contas/identidade',{
  method:'POST',cookie:cookieA,csrf:csrfA,
  data:{cpf:'529.982.247-25',aceiteExplicito:true}
 })).status,200);
 assert.equal((await enviar(base,'/staging/contas/identidade',{
  method:'POST',cookie:cookieB,csrf:lb.body.csrf,
  data:{cpf:'529.982.247-25',aceiteExplicito:true}
 })).status,409);
 const cpfA=await enviar(base,'/staging/contas/identidade',{cookie:cookieA});
 const cpfB=await enviar(base,'/staging/contas/identidade',{cookie:cookieB});
 assert.equal(cpfA.body.registrado,true);
 assert.equal(cpfB.body.registrado,false);
 assert.equal(cpfA.body.cpfFinal,'25');
 assert.equal(JSON.stringify(cpfA.body).includes('52998224725'),false);

 assert.equal(me.body.nick,'alice');
 assert.equal(me.body.emailVerificado,false);
 assert.equal((await enviar(base,'/staging/checkout/finalizar',{
  method:'POST',cookie:cookieA
 })).status,503);
 const itens={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const quote=await enviar(base,'/staging/cotacao',{method:'POST',data:itens});
 assert.equal(quote.status,200);
 assert.equal(quote.body.totalCentavos,25000);
 const noCsrf=await enviar(base,'/staging/rascunhos',{
  method:'POST',cookie:cookieA,data:itens,
  extra:{'Idempotency-Key':'unificado-cotacao-2026-001'}
 });
 assert.equal(noCsrf.status,403);
 const draft=await enviar(base,'/staging/rascunhos',{
  method:'POST',cookie:cookieA,csrf:csrfA,data:itens,
  extra:{'Idempotency-Key':'unificado-cotacao-2026-001'}
 });
 assert.equal(draft.status,201,JSON.stringify(draft.body));
 const replay=await enviar(base,'/staging/rascunhos',{
  method:'POST',cookie:cookieA,csrf:csrfA,data:itens,
  extra:{'Idempotency-Key':'unificado-cotacao-2026-001'}
 });
 assert.equal(replay.status,200);
 assert.equal(replay.body.intencao.pedidoId,draft.body.intencao.pedidoId);
 const pid=draft.body.intencao.pedidoId;
 const po=await enviar(base,'/staging/prepedidos',{
  method:'POST',cookie:cookieA,csrf:csrfA,data:{rascunhoId:pid}
 });
 assert.equal(po.status,201,JSON.stringify(po.body));
 assert.equal(po.body.prepedido.totalCentavos,25000);
 assert.equal((await enviar(base,'/staging/prepedidos',{
  method:'POST',cookie:cookieA,csrf:csrfA,data:{rascunhoId:pid}
 })).status,200);
 const a=await enviar(base,'/staging/meus-pedidos',{cookie:cookieA});
 const b=await enviar(base,'/staging/meus-pedidos',{cookie:cookieB});
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(a.body.pedidos.length,1);
 assert.equal(b.body.pedidos.length,0);
 assert.equal(a.body.pedidos[0].prepedidoId,po.body.prepedido.prepedidoId);
 assert.equal(a.body.pedidos[0].compraReal,false);
 assert.equal((await enviar(base,'/staging/escritorio-unificado')).status,401);
 const office=await enviar(base,'/staging/escritorio-unificado',{
  extra:{Authorization:'Bearer '+ADMIN}
 });
 assert.equal(office.status,200,JSON.stringify(office.body));
 assert.equal(office.body.escritorioFonteUnica,true);
 assert.equal(office.body.contasCandidatas,2);
 assert.equal(office.body.resumo.prepedidosStaging,1);
 assert.equal(office.body.pedidos[0].nick,'alice');
 assert.equal(office.body.pedidos[0].cpfDeclaradoNoEnsaio,true);
 assert.equal(office.body.pedidos[0].identidadeExternaVerificada,false);
 assert.equal(office.body.pedidos[0].titularId,alice.body.titularId);
 assert.equal(office.body.pedidos[0].pagamentoReal,false);
 assert.equal(office.body.resumo.posicoesReais,0);
 assert.equal((await enviar(base,'/staging/contas/sair',{
  method:'POST',cookie:cookieA
 })).status,403);
 assert.equal((await enviar(base,'/staging/contas/sair',{
  method:'POST',cookie:cookieA,csrf:csrfA
 })).status,200);
 assert.equal((await enviar(base,'/staging/meus-pedidos',{cookie:cookieA})).status,401);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('conta candidata persiste no SQLite e não é montada em producao',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-restart-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'app.sqlite');
 const keyA=randomBytes(32),keyB=randomBytes(32);
 let db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 const app1=criarAppLojaEscritorioCandidato(config(db,keyA,keyB));
 const one=await iniciar(app1.app);
 const newAccount=await enviar(one.base,'/staging/contas/cadastrar',{
  method:'POST',data:{nome:'Lia Exemplo',nick:'Lia',
   email:'lia@example.invalid',senha:'SenhaFicticiaDemonstracao2026!',
   aceiteExplicito:true}
 });
 assert.equal(newAccount.status,201);
 await new Promise(done=>one.server.close(done));db.close();
 db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const app2=criarAppLojaEscritorioCandidato(config(db,keyA,keyB));
 const two=await iniciar(app2.app);
 t.after(()=>new Promise(done=>two.server.close(done)));
 const login=await enviar(two.base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'LIA',senha:'SenhaFicticiaDemonstracao2026!'}
 });
 assert.equal(login.status,200);
 assert.equal(login.body.titularId,newAccount.body.titularId);
 assert.equal((await enviar(two.base,'/staging/escritorio-unificado',{
  extra:{Authorization:'Bearer '+ADMIN}
 })).body.contasCandidatas,1);
 const publico=require('../src/server');
 const srv=publico.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(done=>srv.close(done)));
 const res=await fetch('http://127.0.0.1:'+srv.address().port+'/staging/contas/cadastrar',{
  method:'POST'
 });
 assert.equal(res.status,404);
});
