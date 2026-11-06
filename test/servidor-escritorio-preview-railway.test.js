'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarGateway,criarEncerramentoPreview}=require('../scripts/servidor-escritorio-preview-railway');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');

const senha='SENHA_DE_PREVIA_FICTICIA_SEGURA_2026_123';
const operador='OPERADOR_FICTICIO_NAO_COMERCIAL_2026_1234567890';
const auth='Basic '+Buffer.from('acesso:'+senha).toString('base64');
async function preparar(t){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 const {app,equipe}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:operador,termosVersao:'LAB-preview-teste-2026',
  termosTexto:'Cadastro ficticio somente para experimentar a previa do escritorio sem dinheiro nem compras reais.'
 });
 const backend=app.listen(0,'127.0.0.1');
 await once(backend,'listening');
 const gateway=criarGateway({portaInterna:backend.address().port,
  senhaAcesso:senha,segredoOperador:operador,
  validarNickIndicador:nick=>equipe.existeNick(nick)});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(done=>gateway.close(done));
  await new Promise(done=>backend.close(done));
  db.close();
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const consultar=(p,opts={})=>fetch(base+p,{
  ...opts,headers:{Authorization:auth,...(opts.headers||{})},redirect:'manual'
 });
 return {base,consultar,db};
}
test('gateway exige acesso antes de HTML e rotas administrativas',async t=>{
 const x=await preparar(t);
 const sem=await fetch(x.base+'/escritorio');
 assert.equal(sem.status,401);
 assert.match(sem.headers.get('www-authenticate'),/Basic/);
 assert.equal((await fetch(x.base+'/staging/escritorio-unificado')).status,401);
 const errado=await fetch(x.base+'/escritorio',{
  headers:{Authorization:'Basic '+Buffer.from('acesso:incorreto').toString('base64')}
 });
 assert.equal(errado.status,401);
 const certo=await x.consultar('/escritorio');
 assert.equal(certo.status,200);
 assert.match(await certo.text(),/Escritório do Administrador/);
 const js=await x.consultar('/staging/assets/admin.js');
 assert.equal(js.status,200);
 const codigo=await js.text();
 assert.match(codigo,/PREVIA_OPERADOR/);
 assert.match(codigo,/credentials:'same-origin'/);
 assert.equal(codigo.includes(operador),false,'segredo nunca vai ao navegador');
 const cookieGate=certo.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookieGate,/^akitemm_preview_access=v1\./);
 const viaNavegador=await fetch(x.base+'/staging/escritorio-unificado',{
  headers:{Cookie:cookieGate,Authorization:'Bearer PREVIA_OPERADOR'}
 });
 assert.equal(viaNavegador.status,200,'fetch do painel com Bearer usa cookie de acesso');
 const administrativo=await x.consultar('/staging/escritorio-unificado');
 assert.equal(administrativo.status,200);
 const dados=await administrativo.json();
 assert.equal(dados.administracaoRealNaoHabilitada,true);
 assert.equal(dados.escritorioFonteUnica,true);
 const statusPSP=await x.consultar('/staging/escritorio-unificado/sandbox-pix/estado');
 assert.equal(statusPSP.status,200);
 const psp=await statusPSP.json();
 assert.equal(psp.status,'AGUARDANDO_CREDENCIAIS_SANDBOX_NA_PREVIA');
 assert.equal(psp.usaSQLiteDaLoja,true);
 assert.equal(psp.consultarPSPDisponivel,false);
 const acessoRemoto=await x.consultar('/staging/escritorio-unificado/sandbox-pix/provar-acesso-remoto');
 assert.equal(acessoRemoto.status,503);
 assert.equal((await acessoRemoto.json()).erro,'PROVA_REMOTA_SANDBOX_INDISPONIVEL');
 const backup=await x.consultar('/staging/escritorio-unificado/backup-offsite/estado');
 assert.equal(backup.status,200);
 const copia=await backup.json();
 assert.equal(copia.backupRailwayComprovado,false);
 assert.equal(copia.estado,'BACKUP_OFFSITE_NAO_HABILITADO_NESTE_SERVICO');
 assert.equal(copia.marcoZeroAprovado,false);
 assert.equal((await fetch(x.base+'/webhooks/asaas-sandbox-unificado',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:'{}'
 })).status,404);
 assert.equal((await x.consultar('/api/checkout/finalizar')).status,404);
 assert.equal((await x.consultar('/')).status,302);
 assert.equal((await x.consultar('/minha-conta')).status,200);
 const loja=await x.consultar('/loja');
 assert.equal(loja.status,302,'vitrine redireciona para rota local da vitrine');
 const alvo=loja.headers.get('location');
 assert.match(alvo,/^\/staging\//);
 assert.equal((await x.consultar(alvo)).status,200);
});
test('cadastro de ensaio cria conta no mesmo SQLite e financeiros permanecem bloqueados',async t=>{
 const x=await preparar(t);
 const criar=await x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Cliente Ficticio',nick:'Lia',
   email:'lia@example.invalid',senha:'SenhaFicticiaForte2026!',
   aceiteExplicito:true})
 });
 assert.equal(criar.status,201,await criar.text().catch(()=>'')); 
 const login=await x.consultar('/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Lia',senha:'SenhaFicticiaForte2026!'})
 });
 assert.equal(login.status,200);
 assert.match(login.headers.get('set-cookie'),/;\s*Secure/i);
 assert.match(login.headers.get('set-cookie'),/HttpOnly/i);
 const c=await login.json();
 assert.equal(c.titularId?.startsWith('titular-'),true);
 const bloqueada=await x.consultar('/staging/checkout/finalizar',{method:'POST'});
 assert.equal(bloqueada.status,503);
 assert.equal((await x.consultar('/staging/pagar',{method:'POST'})).status,503);
});
test('origem remota forjada bloqueada, sem abrir financeiro',async t=>{
 const x=await preparar(t);
 const r=await x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{Origin:'https://invasor.invalid',
   'Content-Type':'application/json'},body:'{}'
 });
 assert.equal(r.status,403);
 assert.equal((await x.consultar('/healthz')).status,200);
});
test('convite por link registra cadastro correto, rejeita fraude e nao libera comissao',async t=>{
 const x=await preparar(t);
 const cadastrar=(nick,headers={})=>x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json',...headers},
  body:JSON.stringify({nome:nick+' Exemplo',nick,
   email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaFicticiaForte2026!',aceiteExplicito:true})
 });
 assert.equal((await cadastrar('Alice')).status,201);
 assert.equal((await x.consultar('/escritorio/Ghost')).status,404);
 const refLink=await x.consultar('/escritorio/Alice');
 assert.equal(refLink.status,302);
 assert.equal(refLink.headers.get('location'),'/minha-conta');
 const cookie=refLink.headers.getSetCookie()
  .find(s=>s.startsWith('akitemm_preview_ref='));
 assert.ok(cookie,'cookie de vinculo existe');
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 assert.equal((await cadastrar('Bruna',{Cookie:cookie.split(';')[0],
  'X-Akitemm-Preview-Indicador':'Mallory'})).status,201);
 assert.equal((await cadastrar('Clara',{Cookie:
  'akitemm_preview_ref=v1.alice.1234567890123.'+'a'.repeat(64),
  'X-Akitemm-Preview-Indicador':'Alice'})).status,201);
 const login=async nick=>{
  const r=await x.consultar('/staging/contas/entrar',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:'SenhaFicticiaForte2026!'})
  });
  assert.equal(r.status,200);
  return r.headers.getSetCookie().find(s=>s.startsWith('loop_candidato_s=')).split(';')[0];
 };
 const a=await login('Alice'),b=await login('Bruna');
 const resposta=await x.consultar('/staging/minha-equipe',{headers:{Cookie:a}});
 assert.equal(resposta.status,200);
 const equipe=await resposta.json();
 assert.equal(equipe.total,1);
 assert.deepEqual(equipe.cadastros.map(p=>p.nick),['bruna']);
 assert.equal(equipe.proximaPagina,null);
 assert.equal(equipe.bonificacoesReais,0);
 assert.equal(equipe.indicacoesQualificadas,0);
 assert.equal(JSON.stringify(equipe).includes('example.invalid'),false);
 const soBruna=await x.consultar('/staging/minha-equipe',{headers:{Cookie:b}});
 assert.equal((await soBruna.json()).total,0);
 assert.equal((await x.consultar('/staging/minha-equipe')).status,401);
 assert.equal((await x.consultar('/staging/minha-equipe?pagina=NaN',
  {headers:{Cookie:a}})).status,400);
 const loja=await x.consultar('/loja/alice');
 assert.equal(loja.status,302);
 assert.equal(loja.headers.get('location'),'/loja');
 assert.deepEqual(x.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('escritorio com interface aprovada compartilha a mesma sessao e APIs',async t=>{
 const x=await preparar(t);
 const page=await x.consultar('/minha-conta');
 assert.equal(page.status,200);
 const html=await page.text();
 for(const marcador of ['id="loop03ShellIntegrado"','id="loop03SidebarIntegrado"',
  'id="abaTabuleiro"','id="conteudoPosicoes"','id="conteudoEquipe"',
  'id="conteudoFinanceiro"','id="formLogin"','id="formCadastro"',
  'id="formSolicitarRecuperacao"']){
  assert.ok(html.includes(marcador),'Faltou o contrato unico: '+marcador);
 }
 const estilo=await x.consultar('/staging/assets/loop03-aprovado.css');
 assert.equal(estilo.status,200);
 assert.match(await estilo.text(),/\.loop03-shell\{/);
 assert.equal((await x.consultar('/laboratorio/participante')).status,404,
  'Nao criar rota de laboratorio paralela nesta previa');
 const compatibilidade=await x.consultar('/staging/assets/cliente-integrado.css');
 assert.equal(compatibilidade.status,200);
 assert.match(await compatibilidade.text(),/cliente-integrado/);
});

test('healthz nao declara sucesso com backend indisponivel; readyz confere prontidao isolada',async t=>{
 let pronto=true,saudavel=true;
 const backend=http.createServer((req,res)=>{
  if(req.url==='/healthz' || req.url==='/readyz'){
   const ok=req.url==='/readyz'?pronto:saudavel;
   res.writeHead(ok?200:503,{'Content-Type':'application/json'});
   res.end(JSON.stringify({estado:ok?'OK':'FALHA',segredo:'nunca-repassar'}));
   return;
  }
  res.writeHead(404);res.end();
 });
 backend.listen(0,'127.0.0.1');
 await once(backend,'listening');
 const gateway=criarGateway({portaInterna:backend.address().port,
  senhaAcesso:senha,segredoOperador:operador});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(done=>gateway.close(done));
  if(backend.listening)await new Promise(done=>backend.close(done));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const consultar=async rota=>{
  const r=await fetch(base+rota);
  const body=await r.text();
  assert.equal(body.includes('nunca-repassar'),false,
   'gateway nao expõe corpo interno de diagnostico');
  return {codigo:r.status,body:JSON.parse(body)};
 };
 assert.equal((await consultar('/healthz')).codigo,200);
 assert.equal((await consultar('/readyz')).codigo,200);
 pronto=false;
 assert.equal((await consultar('/healthz')).codigo,200,
  'liveness separada de problemas de integridade no banco');
 const falhaReadiness=await consultar('/readyz');
 assert.equal(falhaReadiness.codigo,503);
 assert.equal(falhaReadiness.body.marcoZeroLiberado,false);
 assert.equal(falhaReadiness.body.financeiroReal,false);
 saudavel=false;
 assert.equal((await consultar('/healthz')).codigo,503);
 pronto=true;
 saudavel=true;
 await new Promise(done=>backend.close(done));
 assert.equal((await consultar('/healthz')).codigo,503,
  'gateway nunca pode declarar saudavel um backend encerrado');
 assert.equal((await consultar('/readyz')).codigo,503);
});

test('readiness publica usa auditoria SQLite interna sem abrir acesso administrativo',async t=>{
 const x=await preparar(t);
 const r=await fetch(x.base+'/readyz');
 assert.equal(r.status,200);
 const status=await r.json();
 assert.equal(status.estado,'BANCO_DE_ENSAIO_APTO');
 assert.equal(status.financeiroReal,false);
 assert.equal(status.marcoZeroLiberado,false);
 assert.equal((await fetch(x.base+'/staging/escritorio-unificado')).status,401);
});

test('encerramento seguro preserva operacoes ativas antes de fechar SQLite',async t=>{
 let liberarHttp,liberarPsp,liberarBackup;
 let avisarHttp;
 const entrouHttp=new Promise(resolve=>{avisarHttp=resolve;});
 const retidoHttp=new Promise(resolve=>{liberarHttp=resolve;});
 const retidoPsp=new Promise(resolve=>{liberarPsp=resolve;});
 const retidoBackup=new Promise(resolve=>{liberarBackup=resolve;});
 let fechamentosDb=0,encerramentosPsp=0,encerramentosBackup=0;
 const interno=http.createServer((_req,res)=>res.end('interno'));
 interno.listen(0,'127.0.0.1');
 await once(interno,'listening');
 const gateway=http.createServer((_req,res)=>{
  avisarHttp();
  void retidoHttp.then(()=>res.end('resposta-drenada'));
 });
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  if(gateway.listening)await new Promise(done=>gateway.close(done));
  if(interno.listening)await new Promise(done=>interno.close(done));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const requisicao=fetch(base+'/trabalho-em-andamento');
 await entrouHttp;
 const encerrar=criarEncerramentoPreview({
  gateway,interno,banco:{close(){fechamentosDb++;}},
  agendador:{encerrar(){encerramentosPsp++;return retidoPsp;}},
  backupOffsite:{encerrar(){encerramentosBackup++;return retidoBackup;}}
 });
 const a=encerrar(),b=encerrar();
 assert.strictEqual(a,b,'concorrentes compartilham o MESMO encerramento');
 assert.equal(gateway.listening,false,'gateway para de aceitar novos clientes');
 assert.equal(encerramentosPsp,1);
 assert.equal(fechamentosDb,0);
 liberarPsp();
 await new Promise(setImmediate);
 assert.equal(encerramentosBackup,1);
 assert.equal(fechamentosDb,0,'backup ainda protege o mesmo SQLite');
 liberarBackup();
 await new Promise(setImmediate);
 assert.equal(fechamentosDb,0,'requisicao HTTP ativa ainda precisa drenar');
 liberarHttp();
 const resposta=await requisicao;
 assert.equal(resposta.status,200);
 assert.equal(await resposta.text(),'resposta-drenada');
 await Promise.all([a,b]);
 assert.equal(interno.listening,false);
 assert.equal(fechamentosDb,1);
 assert.equal(encerramentosPsp,1);
 assert.equal(encerramentosBackup,1);
 await encerrar();
 assert.equal(fechamentosDb,1,'repeticao nao fecha o banco duas vezes');
});

test('encerramento da previa exige gateway, backend e banco',()=>{
 assert.throws(()=>criarEncerramentoPreview({}),/ENCERRAMENTO_PREVIA_INVALIDO/);
});
