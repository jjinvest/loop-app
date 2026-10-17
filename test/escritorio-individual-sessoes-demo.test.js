'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {SessoesParticipanteDemo,DURACAO,MAX_FALHAS}=require('../src/domain/sessoes-participante-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const TOKEN='admin-local-escritorio-individual-demo-2026';
function ambiente(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-escritorio-individual-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'catalogo.sqlite')});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const eventos=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>eventos.get(id)
 });
 return {repo,contas,ponte,eventos,visao:new EscritorioIndividualDemo({ponte,contas})};
}
function cadastrar(m,nome,email,codigoIndicador){
 return m.contas.cadastrar({
  nome,email,senha:'senha-inventada-muito-segura',
  ...(codigoIndicador?{codigoIndicador}:{})
 });
}
async function confirmar(m,pedidoId,contaId,valorCentavos=25000){
 m.eventos.set(pedidoId,{
  pedidoId,contaId,produtoId:'curso-pdf-exemplo',valorCentavos,
  status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-15T17:00:00.000Z'
 });
 return m.ponte.processar({pedidoId});
}
async function abrirServidor(t,repo){
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 return 'http://127.0.0.1:'+srv.address().port;
}
async function entrar(base,nome,senha='senha-inventada-muito-segura'){
 return fetch(base+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:JSON.stringify({nome,senha})
 });
}
test('projecao individual inclui apenas compras e posicoes da propria conta',async t=>{
 const m=ambiente(t);
 const a=cadastrar(m,'Conta Demo Alfa','alfa@exemplo.invalid');
 const b=cadastrar(m,'Conta Demo Beta','beta@exemplo.invalid');
 await confirmar(m,'pedido-alfa',a.contaId);
 await confirmar(m,'pedido-beta',b.contaId,25000);
 const visA=m.visao.consultar(a.contaId);
 const visB=m.visao.consultar(b.contaId);
 assert.equal(visA.conta.nome,'Conta Demo Alfa');
 assert.equal(visB.conta.nome,'Conta Demo Beta');
 assert.equal(visA.compras.length,1);
 assert.equal(visB.compras.length,1);
 assert.equal(visA.compras[0].pedidoId,'pedido-alfa');
 assert.equal(visB.compras[0].pedidoId,'pedido-beta');
 assert.equal(visA.posicoes.length,1);
 assert.equal(visB.posicoes.length,1);
 assert.equal(visA.posicoes[0].local,'FILA_B');
 assert.equal(visA.vagasLivres,5);
 assert.equal(visA.indicacoes.cadastrosPorConvite,0);
 assert.equal(JSON.stringify(visA).includes('pedido-beta'),false);
 assert.equal(JSON.stringify(visA).includes('Conta Demo Beta'),false);
 assert.equal(JSON.stringify(visA).includes(b.contaId),false);
 assert.equal(JSON.stringify(visB).includes('pedido-alfa'),false);
 assert.equal(JSON.stringify(visB).includes(a.contaId),false);
 assert.equal(JSON.stringify(visA).includes('senha'),false);
 assert.equal(JSON.stringify(visA).includes('exemplo.invalid'),false);
});
test('convites no escritorio individual distinguem cadastro pendente e compra confirmada',async t=>{
 const m=ambiente(t);
 const raiz=cadastrar(m,'Raiz Ficticia','raiz@exemplo.invalid');
 const p=cadastrar(m,'Pendente Demo','pend@exemplo.invalid',raiz.codigoConvite);
 const v=cadastrar(m,'Confirmada Demo','confirmada@exemplo.invalid',raiz.codigoConvite);
 await confirmar(m,'pedido-raiz',raiz.contaId);
 let r=m.visao.consultar(raiz.contaId);
 assert.deepEqual(r.indicacoes,{
  cadastrosPorConvite:2,cadastrosPendentes:2,
  comprasConfirmadasFicticias:0,aplicadasNaFilaA:0
 });
 await confirmar(m,'pedido-convidada',v.contaId);
 r=m.visao.consultar(raiz.contaId);
 assert.equal(r.indicacoes.cadastrosPendentes,1);
 assert.equal(r.indicacoes.comprasConfirmadasFicticias,1);
 assert.equal(r.indicacoes.aplicadasNaFilaA,1);
 assert.equal(r.posicoes[0].local,'FILA_A');
 assert.equal(m.visao.consultar(p.contaId).posicoes.length,0);
 assert.equal(m.visao.consultar(p.contaId).vagasLivres,6);
 assert.equal(JSON.stringify(r).includes(p.nome),false);
 assert.equal(JSON.stringify(r).includes(v.nome),false);
 assert.equal(JSON.stringify(r).includes(v.contaId),false);
});
test('limite das vagas e integridade entre posicao e pedido valem na projecao',async t=>{
 const m=ambiente(t);
 const a=cadastrar(m,'Conta Sem Venda','semvenda@exemplo.invalid');
 const zero=m.visao.consultar(a.contaId);
 assert.equal(zero.posicoes.length,0);
 assert.equal(zero.vagasLivres,6);
 assert.equal(m.visao.consultar('11111111-1111-1111-1111-111111111111'),null);
 await confirmar(m,'pedido-um',a.contaId);
 const snap=m.repo.banco.prepare('SELECT snapshot_json FROM admin_ponte_estado_demo WHERE id=1').get();
 const alterado=JSON.parse(snap.snapshot_json);
 alterado.filas.filaB[0].id=9876;
 alterado.filas.sequencia=9876;
 m.repo.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1')
  .run(JSON.stringify(alterado));
 assert.throws(()=>m.visao.consultar(a.contaId),/Integridade|divergente/);
});
test('sessoes em memoria expiram, nao aceitam tokens fabricados e podem ser revogadas',t=>{
 const m=ambiente(t);
 const a=cadastrar(m,'Sessao Demo','sessao@exemplo.invalid');
 let horario=1730000000000;
 const sess=new SessoesParticipanteDemo({contas:m.contas,agoraMs:()=>horario});
 const entrada=sess.entrar({nome:a.nome,senha:'senha-inventada-muito-segura',origem:'127.0.0.1'});
 assert.equal(entrada.duracaoSegundos,1200);
 assert.match(entrada.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(sess.identificar(entrada.token),a.contaId);
 assert.equal(sess.identificar('token-fabricado'),null);
 assert.equal(sess.identificar(''),null);
 assert.equal(JSON.stringify([...sess.sessoes.keys()]).includes(entrada.token),false);
 horario+=DURACAO-1;
 assert.equal(sess.identificar(entrada.token),a.contaId);
 horario+=1;
 assert.equal(sess.identificar(entrada.token),null);
 const novo=sess.entrar({nome:a.nome,senha:'senha-inventada-muito-segura'});
 sess.sair(novo.token);
 assert.equal(sess.identificar(novo.token),null);
});
test('limite de erros de login funciona e resposta nao distingue usuario desconhecido',t=>{
 const m=ambiente(t);
 cadastrar(m,'Pessoa Correta','correta@exemplo.invalid');
 let horario=1730000000000;
 const sess=new SessoesParticipanteDemo({contas:m.contas,agoraMs:()=>horario});
 for(let i=0;i<MAX_FALHAS;i++){
  assert.throws(()=>sess.entrar({
   nome:i%2?'Pessoa Correta':'Pessoa Inexistente',
   senha:'senha-inventada-errada',origem:'127.0.0.1'
  }),e=>e.codigo==='LOGIN_DE_TESTE_INVALIDO');
 }
 assert.throws(()=>sess.entrar({
  nome:'Pessoa Correta',senha:'senha-inventada-muito-segura',origem:'127.0.0.1'
 }),e=>e.codigo==='LIMITE_LOGIN_DE_TESTE');
 horario+=15*60*1000+1;
 const ok=sess.entrar({
  nome:'Pessoa Correta',senha:'senha-inventada-muito-segura',origem:'127.0.0.1'
 });
 assert.ok(ok.token);
});
test('API individual so devolve dados do titular de sua sessao, sem chave admin',async t=>{
 const m=ambiente(t);
 const a=cadastrar(m,'Cliente Individual Alfa','a@exemplo.invalid');
 const b=cadastrar(m,'Cliente Individual Beta','b@exemplo.invalid');
 await confirmar(m,'pedido-pessoal-alfa',a.contaId);
 await confirmar(m,'pedido-pessoal-beta',b.contaId);
 const base=await abrirServidor(t,m.repo);
 const minha=base+'/api/laboratorio/participante/minha-conta';
 assert.equal((await fetch(minha)).status,401);
 const login=await entrar(base,a.nome);
 assert.equal(login.status,200);
 assert.equal(login.headers.get('cache-control'),'no-store');
 const cookieBruto=login.headers.get('set-cookie');
 assert.match(cookieBruto,/HttpOnly/);
 assert.match(cookieBruto,/SameSite=Strict/);
 assert.match(cookieBruto,/Path=\/api\/laboratorio\/participante/);
 assert.match(cookieBruto,/Max-Age=1200/);
 const cookie=cookieBruto.split(';')[0];
 const get=await fetch(minha,{headers:{Cookie:cookie}});
 assert.equal(get.status,200);
 assert.equal(get.headers.get('referrer-policy'),'no-referrer');
 const conteudo=await get.json();
 assert.equal(conteudo.conta.nome,a.nome);
 assert.equal(conteudo.compras[0].pedidoId,'pedido-pessoal-alfa');
 assert.equal(conteudo.semOutrosTitulares,true);
 assert.equal(JSON.stringify(conteudo).includes('pedido-pessoal-beta'),false);
 assert.equal(JSON.stringify(conteudo).includes(b.contaId),false);
 assert.equal(JSON.stringify(conteudo).includes(b.nome),false);
 const spoof=await fetch(minha+'?contaId='+b.contaId,{headers:{Cookie:cookie}});
 assert.equal((await spoof.json()).conta.nome,a.nome);
 assert.equal((await fetch(minha,{headers:{Cookie:cookie+'; '+cookie}})).status,401);
 assert.equal((await fetch(minha,{headers:{Cookie:cookie,Origin:'https://example.org'}})).status,403);
 const logout=await fetch(base+'/api/laboratorio/participante/sair',{
  method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:'{}'
 });
 assert.equal(logout.status,200);
 assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await fetch(minha,{headers:{Cookie:cookie}})).status,401);
});
test('login individual rejeita campos extras e pedido de autenticacao por email',async t=>{
 const m=ambiente(t);
 const a=cadastrar(m,'Cliente Login Demo','cliente@exemplo.invalid');
 const base=await abrirServidor(t,m.repo);
 assert.equal((await entrar(base,'cliente@exemplo.invalid')).status,401);
 assert.equal((await entrar(base,a.nome,'senha-incorreta-de-teste')).status,401);
 const url=base+'/api/laboratorio/participante/entrar';
  assert.equal((await fetch(url,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:a.nome,senha:'senha-inventada-muito-segura'})
 })).status,403);
 assert.equal((await fetch(url,{
  method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:JSON.stringify({nome:a.nome,senha:'senha-inventada-muito-segura',contaId:a.contaId})
 })).status,400);
 assert.equal((await fetch(url,{
  method:'POST',headers:{'Content-Type':'text/plain','X-LOOP-LAB':'participante'},body:'nada'
 })).status,415);
 assert.equal((await fetch(url,{
  method:'POST',headers:{Origin:'https://externo.invalid','Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:JSON.stringify({nome:a.nome,senha:'senha-inventada-muito-segura'})
 })).status,403);
});
test('interface individual so existe no laboratorio; servidor publico e diferente',async t=>{
 const m=ambiente(t);
 const base=await abrirServidor(t,m.repo);
 const page=await fetch(base+'/laboratorio/participante');
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(page.headers.get('cache-control'),/no-store/);
 const html=await page.text();
 assert.match(html,/id="formEntrarParticipante"/);
 assert.match(html,/id="conteudoParticipante"/);
 assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
 const js=await (await fetch(base+'/laboratorio/participante.js')).text();
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 assert.equal((await fetch(base+'/laboratorio/participante.css')).status,200);
 const app=require('../src/server');
 const s=app.listen(0,'127.0.0.1');await once(s,'listening');
 t.after(()=>new Promise(resolve=>s.close(resolve)));
 const pub='http://127.0.0.1:'+s.address().port;
 assert.equal((await fetch(pub+'/laboratorio/participante')).status,404);
 assert.equal((await fetch(pub+'/api/laboratorio/participante/minha-conta')).status,404);
 assert.equal((await fetch(pub+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
  body:'{}'
 })).status,404);
});
