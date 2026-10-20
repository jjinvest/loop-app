'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='laboratorio-cadastro-participantes-test-20261015';
const AUTH={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
function db(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-contas-participantes-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return path.join(pasta,'contas.sqlite');
}
function ambiente(caminho){
 const repo=new RepositorioCatalogoSQLite({caminho});
 return {repo,contas:new ContasParticipantesDemoSQLite({banco:repo.banco})};
}
function criar(contas,nome='Conta Ficticia A',email='conta-a@exemplo.invalid',codigoIndicador=null){
 return contas.cadastrar({nome,email,senha:'senha-ficticia-123456',codigoIndicador});
}
async function servidor(t,repo){
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
 const s=app.listen(0,'127.0.0.1');
 await once(s,'listening');
 t.after(()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())));
 return 'http://127.0.0.1:'+s.address().port;
}
async function post(base,rota,body,headers=AUTH){
 return fetch(base+'/api/admin/contas-participantes-demo/'+rota,{
  method:'POST',headers,body:JSON.stringify(body)
 });
}

test('cadastro gera codigo individual, senha com scrypt e resposta sem segredo',t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const a=criar(m.contas);
 assert.match(a.codigoConvite,/^lp-[a-f0-9]{20}$/);
 assert.equal(a.nome,'Conta Ficticia A');
 assert.equal(a.login,'conta ficticia a');
 assert.equal(a.indicadoPorId,null);
 assert.equal(a.posicoesCriadas,0);
 assert.equal(a.fila,'NAO_INTEGRADA');
 assert.equal(a.indicacaoValida,false);
 const stored=m.repo.banco.prepare('SELECT * FROM admin_contas_participantes_demo').get();
 assert.notEqual(stored.senha_hash_hex,'senha-ficticia-123456');
 assert.equal(stored.senha_hash_hex.length,128);
 assert.equal(stored.salt_hex.length,32);
 assert.equal(stored.email_normalizado,'conta-a@exemplo.invalid');
 assert.equal(JSON.stringify(m.contas.listar()).includes('senha-ficticia'),false);
 assert.equal(JSON.stringify(m.contas.listar()).includes('conta-a@exemplo'),false);
 assert.equal(JSON.stringify(a).includes('senha_hash'),false);
 assert.equal(m.contas.historico(a.contaId).eventos.length,1);
 assert.equal(m.contas.historico(a.contaId).aceiteDeTermosJuridicos,false);
});

test('login por nome ignora maiusculas e espacos; email nao e login',t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const a=criar(m.contas,'Ana Exemplo','ana@exemplo.invalid');
 const login=m.contas.autenticar({nome:' ANA   EXEMPLO ',senha:'senha-ficticia-123456'});
 assert.equal(login.conta.contaId,a.contaId);
 assert.equal(login.senhaConferidaNoTeste,true);
 assert.equal(login.sessaoDeClienteReal,false);
 assert.throws(()=>m.contas.autenticar({
  nome:'ana@exemplo.invalid',senha:'senha-ficticia-123456'
 }),e=>e.codigo==='INVALIDO'||e.codigo==='CREDENCIAIS_INVALIDAS');
 assert.throws(()=>m.contas.autenticar({
  nome:'Ana Exemplo',senha:'senha-errada-12345'
 }),e=>e.codigo==='CREDENCIAIS_INVALIDAS');
 assert.throws(()=>m.contas.autenticar({
  nome:'Outra Pessoa',senha:'senha-ficticia-123456'
 }),e=>e.codigo==='CREDENCIAIS_INVALIDAS');
});

test('convites no cadastro sao pendentes e preservam o indicador fixado',t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const raiz=criar(m.contas,'Conta Raiz','raiz@exemplo.invalid');
 const consulta=m.contas.consultarConvite(raiz.codigoConvite);
 assert.equal(consulta.indicador.contaId,raiz.contaId);
 assert.equal(consulta.indicacaoValida,false);
 const convidado=criar(m.contas,'Conta Convidada','convidada@exemplo.invalid',raiz.codigoConvite);
 assert.equal(convidado.indicadoPorId,raiz.contaId);
 const segundo=criar(m.contas,'Conta Terceira','terceira@exemplo.invalid',raiz.codigoConvite);
 assert.equal(segundo.indicadoPorId,raiz.contaId);
 const list=m.contas.listar();
 assert.equal(list.contas.find(c=>c.contaId===raiz.contaId).convitesPendentes,2);
 assert.equal(list.indicacoesValidadas,0);
 assert.equal(list.movimentacaoFilas,false);
 assert.equal(list.semCompraReal,true);
 assert.equal(list.contas.every(c=>c.posicoesCriadas===0),true);
 assert.equal(m.repo.banco.prepare(
  'SELECT COUNT(*) AS total FROM admin_contas_eventos_demo').get().total,3);
});

test('codigo invalido, duplicacao de nome ou email nao cadastram pessoas',t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 criar(m.contas);
 assert.throws(()=>criar(m.contas,'  CONTA FICTICIA A ','outra@exemplo.invalid'),
  e=>e.codigo==='CONFLITO');
 assert.throws(()=>criar(m.contas,'Outra Pessoa','CONTA-A@exemplo.invalid'),
  e=>e.codigo==='CONFLITO');
 assert.throws(()=>criar(m.contas,'Outra Pessoa','outra@exemplo.invalid','lp-00000000000000000000'),
  e=>e.codigo==='CONVITE_INVALIDO');
 assert.throws(()=>criar(m.contas,'Nome <script>','terceiro@exemplo.invalid'),
  e=>e.codigo==='INVALIDO');
 assert.throws(()=>m.contas.cadastrar({
  nome:'Conta Invalida',email:'invalido',senha:'1234567890'
 }),e=>e.codigo==='INVALIDO');
 assert.throws(()=>m.contas.cadastrar({
  nome:'Conta Invalida',email:'valido@exemplo.invalid',senha:'curta'
 }),e=>e.codigo==='INVALIDO');
 assert.equal(m.contas.listar().contas.length,1);
});

test('historico de cadastro nao permite alteracao ou apagamento',t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const a=criar(m.contas);
 assert.throws(()=>m.repo.banco.exec('DELETE FROM admin_contas_eventos_demo'),/imutavel/);
 assert.throws(()=>m.repo.banco.exec(
  "UPDATE admin_contas_eventos_demo SET tipo='ALTERADO'"
 ),/imutavel/);
 assert.equal(m.contas.historico(a.contaId).eventos[0].tipo,'CADASTRO_FICTICIO');
});

test('persistencia SQLite conserva convite e senha, sem criar posicao apos reinicio',t=>{
 const arquivo=db(t),m=ambiente(arquivo);
 const origem=criar(m.contas);
 const convidado=criar(m.contas,'Pessoa Teste B','pessoa-b@exemplo.invalid',origem.codigoConvite);
 m.repo.fechar();
 const b=ambiente(arquivo);
 try{
  const conf=b.contas.autenticar({nome:'Pessoa Teste B',senha:'senha-ficticia-123456'});
  assert.equal(conf.conta.indicadoPorId,origem.contaId);
  assert.equal(b.contas.consultarConvite(origem.codigoConvite).indicador.contaId,origem.contaId);
  assert.equal(b.contas.buscar(convidado.contaId).posicoesCriadas,0);
  assert.equal(b.contas.listar().indicacoesValidadas,0);
 }finally{b.repo.fechar();}
});

test('API de teste exige admin local e nao aceita campos de pagamento ou cpf',async t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const base=await servidor(t,m.repo);
 const rota='/api/admin/contas-participantes-demo';
 assert.equal((await fetch(base+rota)).status,401);
 assert.equal((await fetch(base+rota,{headers:{...AUTH,Origin:'https://externo.invalid'}})).status,403);
 assert.equal((await post(base,'cadastrar',{
  nome:'Conta A',email:'a@exemplo.invalid',senha:'senha-ficticia-123456',
  cpf:'00000000000'
 })).status,400);
 assert.equal((await post(base,'cadastrar',{
  nome:'Conta A',email:'a@exemplo.invalid',senha:'senha-ficticia-123456'
 },{'Content-Type':'application/json'})).status,401);
 const a=await post(base,'cadastrar',{
  nome:'Conta A',email:'a@exemplo.invalid',senha:'senha-ficticia-123456'
 });
 assert.equal(a.status,201);
 assert.equal(a.headers.get('cache-control'),'no-store');
 const criado=await a.json();
 assert.equal(criado.posicaoCriada,false);
 assert.equal(criado.indicacaoValida,false);
 const codigo=criado.conta.codigoConvite;
 const lookup=await fetch(base+rota+'/convites/'+codigo,{headers:AUTH});
 assert.equal(lookup.status,200);
 assert.equal((await lookup.json()).indicacaoValida,false);
 const b=await post(base,'cadastrar',{
  nome:'Conta B',email:'b@exemplo.invalid',
  senha:'senha-ficticia-123456',codigoIndicador:codigo
 });
 assert.equal(b.status,201);
 assert.equal((await b.json()).conta.indicadoPorId,criado.conta.contaId);
 const l=await post(base,'login-teste',{
  nome:' CONTA A ',senha:'senha-ficticia-123456'
 });
 assert.equal(l.status,200);
 assert.equal((await l.json()).sessaoDeClienteReal,false);
 assert.equal((await post(base,'login-teste',{
  nome:'Conta A',senha:'outra-senha-de-teste'
 })).status,401);
 assert.equal((await post(base,'login-teste',{
  nome:'Conta A',senha:'senha-ficticia-123456',email:'a@exemplo.invalid'
 })).status,400);
 const contas=await (await fetch(base+rota,{headers:AUTH})).json();
 assert.equal(contas.contas.length,2);
 assert.equal(contas.indicacoesValidadas,0);
 assert.equal(JSON.stringify(contas).includes('senha-ficticia'),false);
 const historico=await fetch(base+rota+'/'+criado.conta.contaId+'/historico',{headers:AUTH});
 assert.equal((await historico.json()).eventos.length,1);
});

test('tela e API existem so no laboratorio, nao no servidor publico',async t=>{
 const m=ambiente(db(t));t.after(()=>m.repo.fechar());
 const base=await servidor(t,m.repo);
 const page=await fetch(base+'/admin/cadastro-participantes-demo');
 assert.equal(page.status,200);
 const html=await page.text();
 assert.match(html,/id="formContaDemo"/);
 assert.match(html,/id="formLoginContaDemo"/);
 assert.match(html,/id="conviteContaDemo"/);
 assert.match(html,/cadastro-participantes-demo.js/);
 assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
 const js=await (await fetch(base+'/admin/cadastro-participantes-demo.js')).text();
 assert.match(js,/URLSearchParams/);
 assert.match(js,/textContent/);
 assert.match(js,/encodeURIComponent/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
 assert.equal((await fetch(base+'/admin/cadastro-participantes-demo.css')).status,200);
 assert.match((await (await fetch(base+'/admin')).text()),/cadastro-participantes-demo/);
 const app=require('../src/server');
 const publico=app.listen(0,'127.0.0.1');
 await once(publico,'listening');
 t.after(()=>new Promise(resolve=>publico.close(resolve)));
 const pub='http://127.0.0.1:'+publico.address().port;
 assert.equal((await fetch(pub+'/api/admin/contas-participantes-demo')).status,404);
 assert.equal((await fetch(pub+'/admin/cadastro-participantes-demo')).status,404);
 assert.equal((await fetch(pub+'/admin/cadastro-participantes-demo.js')).status,404);
});


test('nick único preserva maiúsculas e nove dígitos, persiste mesmo após reiniciar',t=>{
 const filename=db(t),m=ambiente(filename);
 const {caminhoLinkCurto}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
 const nova=m.contas.cadastrar({nome:'Conta Com Nick',apelido:'Vilela123456',
  email:'nickname@exemplo.invalid',telefone:'(24) 99999-7755',
  senha:'senha-ficticia-forte-2026'});
 assert.equal(nova.apelido,'Vilela123456');
 assert.equal(caminhoLinkCurto(nova.apelido,'loja'),'/loja/Vilela123456');
 assert.equal(caminhoLinkCurto(nova.apelido,'escritorio'),'/escritorio/Vilela123456');
 assert.throws(()=>m.contas.cadastrar({nome:'Nome Duplicado Nick',apelido:'vILELA123456',
  email:'nick-duplicado@exemplo.invalid',senha:'senha-forte-exemplo-2026'}),
  e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.contas.cadastrar({nome:'Dez Numeros',apelido:'Nick1234567890',
  email:'dez-digitos@exemplo.invalid',senha:'senha-forte-exemplo-2026'}),
  e=>e.codigo==='INVALIDO');
 m.repo.fechar();
 const b=ambiente(filename);
 try{
  assert.equal(b.contas.buscar(nova.contaId).apelido,'Vilela123456');
  const reserva=b.repo.banco.prepare(
   'SELECT conta_id FROM admin_links_nicks_reservados_demo WHERE nick_chave=?'
  ).get('vilela123456');
  assert.equal(reserva.conta_id,nova.contaId);
  assert.throws(()=>b.contas.cadastrar({nome:'Nova tentativa',apelido:'VILELA123456',
   email:'nunca-reutilizar@exemplo.invalid',senha:'senha-forte-exemplo-2026'}),
   e=>e.codigo==='CONFLITO');
 }finally{b.repo.fechar();}
})
