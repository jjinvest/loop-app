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
 })).status,201,'maiúsculas e minúsculas distinguem titulares');
 assert.equal((await enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form('Alice','outra2@example.invalid')
 })).status,409,'grafia exata continua exclusiva');
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
 // Primeiro erro arma CAPTCHA. A senha correta SEM a prova não entra
 // na segunda tentativa; uma prova válida e de uso único permite login.
 const semCaptcha=await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'Alice',senha:'SenhaFicticiaDemonstracao2026!'}
 });
 assert.equal(semCaptcha.status,403);
 assert.equal(semCaptcha.body.erro,'CAPTCHA_LOGIN_OBRIGATORIO');
 const challenge=await enviar(base,'/staging/contas/captcha-login');
 assert.equal(challenge.status,200);
 const svg=Buffer.from(challenge.body.captchaImagem.split(',')[1],'base64').toString();
 const codigo=[...svg.matchAll(/<text[^>]*>([A-Z0-9])</g)].map(x=>x[1]).join('');
 assert.equal(codigo.length,6);
 const la=await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'Alice',senha:'SenhaFicticiaDemonstracao2026!',
   captchaId:challenge.body.captchaId,captchaResposta:codigo}
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
  '/loja/Alice','/escritorio/Alice'
 ]);
 assert.equal(linkB.body.linkLoja,'/loja/Bia');
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

 assert.equal(me.body.nick,'Alice');
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
 assert.equal(office.body.contasCandidatas,3,'Alice, Bia e ALICE sao contas distintas');
 assert.equal(office.body.resumo.prepedidosStaging,1);
 assert.equal(office.body.pedidos[0].nick,'Alice');
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
  method:'POST',data:{nick:'Lia',senha:'SenhaFicticiaDemonstracao2026!'}
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

test('cadastro com CPF e indicacao guarda identificacao sem plaintext, com rollback de duplicado',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const impl=criarAppLojaEscritorioCandidato({
  ...config(db,randomBytes(32),randomBytes(32)),
  chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32)
 });
 const {server,base}=await iniciar(impl.app);
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const senha='SenhaAbc123!';
 const hash=require('node:crypto').createHash('sha256').update(termosTexto).digest('hex');
 const cadastrar=(nick,email,cpf)=>enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:{nome:nick+' Sobrenome',nick,cpf,email,telefone:'21999998888',
   senha,confirmarSenha:senha,aceiteExplicito:true,
   termosVersaoAceita:termosVersao,termosHashAceito:hash}
 });
 const invalido=await cadastrar('Testa','testa@example.invalid','12345678900');
 assert.equal(invalido.status,400,JSON.stringify(invalido.body));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata').get().n,0);
 const criado=await cadastrar('Olivia','olivia@example.invalid','529.982.247-25');
 assert.equal(criado.status,201,JSON.stringify(criado.body));
 const custodia=impl.cpf.consultar({titularId:criado.body.titularId});
 assert.equal(custodia.cpfFinal,'25');
 assert.equal(custodia.identidadeExternaVerificada,false);
 const duplicado=await cadastrar('Outra','outra@example.invalid','529.982.247-25');
 assert.equal(duplicado.status,409,JSON.stringify(duplicado.body));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata').get().n,1);
 assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM akitemm_candidato_titularidade_unificada').all()),/52998224725|529\\.982\\.247-25/);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('nick reservado VILELA nao aceita imitacoes, e variantes distintas sao independentes',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const impl=criarAppLojaEscritorioCandidato({...config(db,randomBytes(32),randomBytes(32))});
 const {server,base}=await iniciar(impl.app);
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const senha='SenhaFicticiaDemonstracao2026!';
 const form=(nick,i)=>({nome:'Pessoa Teste',nick,email:'var'+i+'@example.invalid',
  senha,aceiteExplicito:true});
 const tentar=(nick,i)=>enviar(base,'/staging/contas/cadastrar',{
  method:'POST',data:form(nick,i)});
 for(const [i,nick] of ['Vilela','vilela','VILELA','ViLeLa','Vilela8','V1L3L4','V8lela'].entries()){
  const r=await tentar(nick,i);
  assert.equal(r.status,400,nick+' '+JSON.stringify(r.body));
  assert.equal(r.body.erro,'NICK_RESERVADO');
 }
 const nicks=['José','JOSÉ','josé','Jose','Jose1','Jose 2'];
 for(const [i,nick] of nicks.entries()){
  const r=await tentar(nick,i+10);
  assert.equal(r.status,201,nick+' '+JSON.stringify(r.body));
 }
 assert.equal((await tentar('José',60)).status,409);
 assert.equal((await tentar('José Silva',61)).status,400,
  '10 caracteres novos continuam proibidos');
 const login=await enviar(base,'/staging/contas/entrar',{
  method:'POST',data:{nick:'JOSÉ',senha}});
 assert.equal(login.status,200,JSON.stringify(login.body));
 assert.equal(login.body.nick,'JOSÉ');
 const link=await enviar(base,'/staging/vitrine/meus-links',{
  cookie:login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))?.[1]});
 assert.equal(link.status,200,JSON.stringify(link.body));
 assert.equal(link.body.linkLoja,'/loja/JOS%C3%89');
});

test('migracao de NOCASE para nick exato preserva titular legado de 12 caracteres e sessao',async()=>{
 const {ContaUnicaCandidataSQLite}=require('../src/domain/conta-unica-candidata-sqlite');
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const chaveEmail=randomBytes(32),chaveCifra=randomBytes(32);
 const mk=()=>new ContaUnicaCandidataSQLite({banco:db,chaveEmail,chaveCifra});
 const contas=mk(),senha='SenhaFicticiaDemonstracao2026!';
 const criada=await contas.cadastrar({nome:'Titular Antigo',
  nick:'Alessandr',email:'legacy@example.invalid',senha,
  termosVersao,termosTexto,aceiteExplicito:true});
 const login=await contas.entrar({nick:'Alessandr',senha});
 // Simula restauracao de uma versao anterior com coluna UNIQUE NOCASE
 // e titular longo, preservando todos os campos criptografados/sessoes.
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
 try{
  db.exec('DROP TRIGGER IF EXISTS conta_candidata_nick_mesmas_letras');
  db.prepare('UPDATE akitemm_conta_unica_candidata SET nick=? WHERE id=?')
   .run('Alessandrita',criada.titularId);
  const sql=db.prepare(
   "SELECT sql FROM sqlite_schema WHERE type='table' AND name='akitemm_conta_unica_candidata'"
  ).get().sql;
  db.exec(sql.replace('akitemm_conta_unica_candidata(',
   'akitemm_conta_legado_teste(').replace(
   'nick TEXT NOT NULL UNIQUE COLLATE BINARY',
   'nick TEXT NOT NULL UNIQUE COLLATE NOCASE'));
  const campos=db.prepare(
   'PRAGMA table_info(akitemm_conta_unica_candidata)'
  ).all().map(x=>'"'+x.name+'"').join(',');
  db.exec('INSERT INTO akitemm_conta_legado_teste('+campos+') SELECT '+
   campos+' FROM akitemm_conta_unica_candidata');
  db.exec('DROP TABLE akitemm_conta_unica_candidata');
  db.exec('ALTER TABLE akitemm_conta_legado_teste RENAME TO akitemm_conta_unica_candidata');
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 finally{db.exec('PRAGMA foreign_keys=ON');}
 // A previa persistida tem dependencias externas, ausentes na base vazia.
 // Elas precisam continuar funcionando apos a migracao nao destrutiva.
 db.exec([
  'CREATE TRIGGER checagem_externa_conta AFTER UPDATE ON',
  'akitemm_sessoes_candidatas BEGIN SELECT id',
  'FROM akitemm_conta_unica_candidata LIMIT 1; END;'
 ].join(' '));
 db.exec('CREATE VIEW visao_externa_conta AS SELECT id,nick '+
  'FROM akitemm_conta_unica_candidata');
 const novo=mk();
 const atual=novo.perfil(criada.titularId);
 assert.equal(atual.nick,'Alessandrita','mantem 12 caracteres legados');
 assert.equal(atual.titularId,criada.titularId);
 assert.equal((await novo.entrar({nick:'Alessandrita',senha})).titularId,criada.titularId);
 const sessao=novo.banco.prepare(
  'SELECT titular_id FROM akitemm_sessoes_candidatas WHERE token_hash=?'
 ).get(require('node:crypto').createHash('sha256').update(login.token).digest('hex'));
 assert.equal(sessao.titular_id,criada.titularId,'sessao antiga preservada');
 const distinta=await novo.cadastrar({nome:'Outra Pessoa',nick:'alessandr',
  email:'outro@example.invalid',senha,termosVersao,termosTexto,aceiteExplicito:true});
 assert.notEqual(distinta.titularId,criada.titularId);
 await assert.rejects(novo.cadastrar({nome:'Pelo Novo',nick:'Alessandrita',
  email:'terceiro@example.invalid',senha,termosVersao,termosTexto,aceiteExplicito:true}),
  /NICK_INVALIDO/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('SELECT nick FROM visao_externa_conta WHERE id=?').get(
  criada.titularId).nick,'Alessandrita');
 const gatilho=db.prepare(
  "SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='checagem_externa_conta'"
 ).get();
 assert.equal(gatilho.n,1,'trigger externa restaurada integralmente');
 db.close();
});
