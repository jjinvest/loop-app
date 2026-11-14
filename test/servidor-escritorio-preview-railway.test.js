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
const senhaAdmin='SenhaAdministrativaFicticiaExclusiva2026';
const authAdmin='Basic '+Buffer.from('operador:'+senhaAdmin).toString('base64');
async function preparar(t,{permitirOrigemHttpLoopback=false}={}){
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
  senhaAcesso:senha,senhaAdmin,segredoOperador:operador,
  validarNickIndicador:nick=>equipe.existeNick(nick),
  permitirOrigemHttpLoopback});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(done=>gateway.close(done));
  await new Promise(done=>backend.close(done));
  db.close();
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const consultar=(p,opts={})=>{
  const rotaAdmin=p==='/escritorio'||p==='/staging/escritorio-admin'||
   p.startsWith('/staging/escritorio-unificado')||
   p.startsWith('/staging/assets/admin.');
  return fetch(base+p,{
   ...opts,headers:{Authorization:rotaAdmin?authAdmin:auth,
    ...(opts.headers||{})},redirect:'manual'
  });
 };
 return {base,consultar,db};
}
test('gateway nao aceita administrador ausente nem senha do visitante',()=>{
 const args={portaInterna:43210,senhaAcesso:senha,segredoOperador:operador};
 for(const adminInvalido of [undefined,null,'curta',senha]){
  assert.throws(()=>criarGateway({...args,senhaAdmin:adminInvalido}),
   e=>e.codigo==='GATEWAY_PREVIA_INVALIDO');
 }
 const autorizado=criarGateway({...args,senhaAdmin});
 assert.equal(typeof autorizado.listen,'function');
 autorizado.close();
});
test('senha de visitante e cookie nao abrem variantes das rotas de admin',async t=>{
 const x=await preparar(t);
 const cliente=await x.consultar('/minha-conta');
 const cookieCliente=cliente.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookieCliente,/^akitemm_preview_access=v1\./);
 for(const rota of [
  '/escritorio/','/ESCRITORIO','/staging/escritorio-admin/',
  '/staging/escritorio-unificado/',
  '/STAGING/ESCRITORIO-UNIFICADO',
  '/staging/escritorio-unificado%2f',
  '/staging/assets/admin.js/','/STAGING/ASSETS/ADMIN.CSS'
 ]){
  const resposta=await fetch(x.base+rota,{
   headers:{Authorization:auth,Cookie:cookieCliente}});
  assert.equal(resposta.status,401,rota+' deve exigir operador');
 }
});
test('mesma identidade da loja entra no Escritorio LOOP sem novo cadastro',async t=>{
 const x=await preparar(t);
 const pagina=await x.consultar('/minha-conta');
 const html=await pagina.text();
 assert.match(html,/<title>LOOP 3\.0 · Escritório Virtual/);
 assert.match(html,/<h1>Escritório Virtual LOOP<\/h1>/);
 assert.match(html,/<h2 id="tituloCadastro">Criar conta<\/h2>/);
 assert.doesNotMatch(html,/SEM VENDAS REAIS|DEMONSTRAÇÃO · SEM PAGAMENTOS REAIS/,
  'avisos visuais removidos, sem liberar pagamento real');
 assert.match(html,/id="loop03ImagemFotoTopo"/);
 assert.match(html,/id="arquivoFotoPerfil"/);
 assert.doesNotMatch(html,/Criar conta de homologação|Nome fictício|E-mail fictício|Senha de teste/);
 assert.match(html,/id="cadastroTelefone"/);
 assert.match(html,/id="cadastroConfirmarSenha"/);
 assert.match(html,/<label for="cadastroIndicador">Indicado por<\/label>\s*<input id="cadastroIndicador"[^>]*readonly[^>]*>/,
  'nick do indicador sempre visivel, somente leitura e antes de Nome');
 assert.ok(html.indexOf('id="cadastroIndicador"')<html.indexOf('id="cadastroNome"'));
 assert.match(html,/id="irParaLoja"/);
 assert.match(html,/<p class="explicacao">Acompanhe sua conta, pedidos e posições\.<\/p>/);
 assert.doesNotMatch(html,/Neste ambiente, as operações são de teste e não movimentam dinheiro/);
 assert.match(html,/<section class="painel" id="painelLogin" aria-labelledby="tituloLogin">/);
 assert.match(html,/<section class="painel" id="painelCadastro" aria-labelledby="tituloCadastro" hidden>/);
 assert.match(html,/src="\/staging\/assets\/catraca-visor.js" defer/);
 assert.match(html,/src="\/staging\/assets\/tabuleiro-visual.js" defer/);
 const visor=await x.consultar('/staging/assets/catraca-visor.js');
 assert.equal(visor.status,200);
 assert.match(await visor.text(),/LoopVisorCatraca/);
 const visual=await x.consultar('/staging/assets/tabuleiro-visual.js');
 assert.equal(visual.status,200);
 const anonOperacional=await x.consultar('/staging/motor/estado-operacional');
 assert.equal(anonOperacional.status,401,'motor real nunca e leitura anonima');
 assert.match(await visual.text(),/LoopTabuleiroVisual/);
 const anonimo=await fetch(x.base+'/staging/assets/tabuleiro-visual.js');
 assert.equal(anonimo.status,200,'scripts da tela de cadastro sao publicos; APIs continuam privadas');
 const js=await x.consultar('/staging/assets/cliente.js');
 assert.match(await js.text(),/let telaAcesso='login'/);
 const criar=await x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Marta de Ensaio',nick:'Marta',
   email:'marta@example.invalid',senha:'TesteUnificado2026!',
   aceiteExplicito:true})
 });
 assert.equal(criar.status,201);
 const entrada=await x.consultar('/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Marta',senha:'TesteUnificado2026!'})
 });
 assert.equal(entrada.status,200);
 const cookie=entrada.headers.getSetCookie().find(s=>s.startsWith('loop_candidato_s='));
 assert.ok(cookie);
 const headers={Cookie:cookie.split(';')[0]};
 const loja=await x.consultar('/loja',{headers});
 assert.equal(loja.status,302,'atalho de loja preserva o escopo protegido da sessao');
 assert.equal(loja.headers.get('location'),'/staging/loja');
 assert.equal((await x.consultar('/staging/loja',{headers})).status,200,
  'loja abre ao seguir o atalho com mesma sessao de titular existente');
 const perfilLoja=await x.consultar('/staging/vitrine/minha-conta',{headers});
 assert.equal(perfilLoja.status,200);
 assert.equal((await perfilLoja.json()).conta.nick,'Marta');
 const perfilEscritorio=await x.consultar('/staging/contas/me',{headers});
 assert.equal(perfilEscritorio.status,200);
 assert.equal((await perfilEscritorio.json()).nick,'Marta');
 const fonteReal=await x.consultar('/staging/motor/estado-operacional',{headers});
 const estadoReal=await fonteReal.json();
 if(process.env.LOOP_PREVIEW_URL_TABULEIRO_REAL){
  // Com a fonte real configurada, a prova E2E deve comprovar ligacao real;
  // uma resposta 503 nao pode ser mascarada como teste aprovado.
  assert.equal(fonteReal.status,200,'ligacao HTTP ao motor real deve funcionar');
  assert.equal(estadoReal.origem,'MOTOR_REAL_SQLITE_DA_IDENTIDADE');
  assert.equal(estadoReal.operacional,true);
  assert.equal(estadoReal.fonteValidada,'ESTADO_E_LIVRO_NO_MESMO_SQLITE_REAL');
  assert.equal(estadoReal.financeiroReal,false);
  assert.equal(Array.isArray(estadoReal.tabuleiro.vagas),true);
  assert.equal(estadoReal.tabuleiro.vagas.length,6);
 }else{
  assert.equal(fonteReal.status,503,'sem serviço real não inventar tabuleiro');
  assert.equal(estadoReal.erro,'MOTOR_REAL_NAO_CONECTADO');
 }
 const rotaFoto='/staging/contas/foto-perfil';
 assert.equal((await x.consultar(rotaFoto)).status,401,'foto requer sessao');
 assert.equal((await x.consultar(rotaFoto,{headers})).status,404);
 const png=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGO8syXgPwMDAwMTAxQAACy0AuM2p9QGAAAAAElFTkSuQmCC','base64');
 assert.equal((await x.consultar(rotaFoto,{method:'POST',headers:{
  ...headers,'Content-Type':'image/png'},body:png})).status,403,'CSRF obrigatorio');
 const perfilCreds=await (await x.consultar('/staging/contas/me',{headers})).json();
 const upload=await x.consultar(rotaFoto,{method:'POST',headers:{
  ...headers,'Content-Type':'image/png','X-Checkout-Csrf':perfilCreds.csrf},body:png});
 assert.equal(upload.status,201,'foto propria salva');
 const fotoObtida=await x.consultar(rotaFoto,{headers});
 assert.equal(fotoObtida.status,200);
 assert.equal(fotoObtida.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await fotoObtida.arrayBuffer()),png);
 assert.equal((await x.consultar(rotaFoto)).status,401,'foto privada nao vaza');
 assert.equal((await x.consultar('/staging/vitrine/minha-conta')).status,401,
  'navegador sem sessao nao herda identidade de outro titular');
 const atalho=await x.consultar('/loja?origem=escritorio');
 assert.equal(atalho.status,302);
 assert.equal(atalho.headers.get('location'),'/staging/loja?origem=escritorio',
  'atalho comercial deve atravessar Path=/staging sem perder o cookie');
 assert.equal((await x.consultar('/staging/loja')).status,200,
  'visitante pode consultar produtos sem login');
 assert.equal((await x.consultar('/staging/loja',{headers})).status,200,
  'apos o redirecionamento o navegador envia a sessao do titular');
});
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
 const cliente=await x.consultar('/minha-conta');
 assert.equal(cliente.status,200);
 const cookieCliente=cliente.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookieCliente,/^akitemm_preview_access=v1\./);
 const negado=await fetch(x.base+'/staging/escritorio-unificado',{
  headers:{Cookie:cookieCliente,Authorization:auth}
 });
 assert.equal(negado.status,401,
  'credencial e cookie do cliente nao podem abrir APIs administrativas');
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
 assert.match(cookieGate,/^akitemm_preview_admin_v2=v2\./);
 const viaNavegador=await fetch(x.base+'/staging/escritorio-unificado',{
  headers:{Cookie:cookieGate,Authorization:'Bearer PREVIA_OPERADOR'}
 });
 assert.equal(viaNavegador.status,200,
  'painel aceita somente sessao isolada do operador');
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
 assert.equal(alvo,'/staging/loja');
 assert.equal((await x.consultar(alvo)).status,200,
  'visitante navega na loja sem criar conta');
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
test('origem HTTP local exige opt-in de teste e preserva bloqueio externo',async t=>{
 const padrao=await preparar(t);
 const pedido={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
 assert.equal((await padrao.consultar('/staging/contas/cadastrar',{
  ...pedido,headers:{...pedido.headers,Origin:padrao.base}
 })).status,403,'HTTPS segue obrigatorio por padrao');
 const local=await preparar(t,{permitirOrigemHttpLoopback:true});
 assert.equal((await local.consultar('/staging/contas/cadastrar',{
  ...pedido,headers:{...pedido.headers,Origin:local.base}
 })).status,400,'HTTP em loopback chega ao backend com JSON invalido');
 assert.equal((await local.consultar('/staging/contas/cadastrar',{
  ...pedido,headers:{...pedido.headers,Origin:'https://invasor.invalid'}
 })).status,403,'origem externa segue bloqueada');
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
 assert.equal(refLink.headers.get('location'),'/minha-conta?cadastro=1');
 const cookie=refLink.headers.getSetCookie()
  .find(s=>s.startsWith('akitemm_preview_ref='));
 assert.ok(cookie,'cookie de vinculo existe');
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 const indicador=await x.consultar('/staging/indicacao/atual',
  {headers:{Cookie:cookie.split(';')[0]}});
 assert.equal(indicador.status,200);
 assert.deepEqual(await indicador.json(),{nick:'Alice'});
 assert.deepEqual(await (await x.consultar('/staging/indicacao/atual')).json(),
  {nick:null},'sem link o campo fica em branco');
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
 assert.deepEqual(equipe.cadastros.map(p=>p.nick),['Bruna']);
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

test('nick de 12 letras abre link de loja e registra indicacao no mesmo SQLite',async t=>{
 const x=await preparar(t),nick='Alessandrita';
 const cadastrar=(n,headers={})=>x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json',...headers},
  body:JSON.stringify({nome:n+' Cliente',nick:n,
   email:n.toLowerCase()+'@example.invalid',
   senha:'SenhaFicticiaForte2026!',aceiteExplicito:true})
 });
 assert.equal(nick.length,12);
 assert.equal((await cadastrar(nick)).status,201);
 assert.equal((await cadastrar('Alessandritas')).status,400,
  '13 letras devem ser rejeitadas, sem link orfao');
 const link=await x.consultar('/loja/'+nick);
 assert.equal(link.status,302);
 assert.equal(link.headers.get('location'),'/loja');
 const cookie=link.headers.getSetCookie()
  .find(c=>c.startsWith('akitemm_preview_ref=')).split(';')[0];
 assert.ok(cookie);
 assert.equal((await cadastrar('Marcia',{Cookie:cookie})).status,201);
 const login=await x.consultar('/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick,senha:'SenhaFicticiaForte2026!'})
 });
 assert.equal(login.status,200);
 const sessao=login.headers.getSetCookie().find(c=>c.startsWith('loop_candidato_s=')).split(';')[0];
 const equipe=await x.consultar('/staging/minha-equipe',{headers:{Cookie:sessao}});
 assert.equal((await equipe.json()).total,1);
 const tela=await x.consultar('/minha-conta');
 assert.match(await tela.text(),/maxlength="12" pattern="\[A-Za-z\]\{1,12\}"/);
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
  senhaAcesso:senha,senhaAdmin,segredoOperador:operador});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(done=>gateway.close(done));
  if(backend.listening)await new Promise(done=>backend.close(done));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const consultar=async rota=>{
  const r=await fetch(base+rota,{
   headers:rota==='/readyz'?{Authorization:auth}:{}
  });
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

test('readiness protegida usa auditoria SQLite interna sem abrir acesso administrativo',async t=>{
 const x=await preparar(t);
 assert.equal((await fetch(x.base+'/readyz')).status,401,
  'auditoria profunda nao deve aceitar acesso anonimo');
 const r=await x.consultar('/readyz');
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

test('porta invalida falha antes de tentar montar SQLite ou abrir listener',async()=>{
 const {iniciar}=require('../scripts/servidor-escritorio-preview-railway');
 await assert.rejects(()=>iniciar({env:{
  NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
  LOOP_PREVIEW_SENHA_ACESSO:senha,
  LOOP_PREVIEW_SENHA_ADMIN:senhaAdmin,
  LOOP_PREVIEW_SEGREDO_RAIZ:'SEGREDO_RAIZ_FICTICIO_DE_TESTE_'+('R'.repeat(64)),
  PORT:'porta-invalida'
 }}),{codigo:'PORTA_PREVIA_INVALIDA'});
});

test('readiness rejeita snapshot do motor adulterado mesmo com SQLite e FKs ok',async t=>{
 const x=await preparar(t);
 const antes=await x.consultar('/readyz');
 assert.equal(antes.status,200);
 x.db.prepare([
  'INSERT INTO akitemm_motor_conta_ensaio_estado',
  '(id,revisao,snapshot,atualizado_em) VALUES(1,1,?,?)'
 ].join(' ')).run('{"formato":"FALSO","versao":1}',Date.now());
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.db.prepare('PRAGMA foreign_key_check').all(),[]);
 const depois=await x.consultar('/readyz');
 assert.equal(depois.status,503);
 assert.equal((await depois.json()).marcoZeroLiberado,false);
});

test('readiness rejeita lote orfao sem violacao explicita de foreign key',async t=>{
 const x=await preparar(t);
 x.db.prepare([
  'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
  '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
 ].join(' ')).run('hom-00000000-0000-4000-8000-000000000000',
  1,'titular-00000000-0000-4000-8000-000000000000',99999);
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await x.consultar('/readyz')).status,503);
});

test('cadastro completo: telefone cifrado, senha confirmada e nick com grafia exata',async t=>{
 const x=await preparar(t);
 const termos=await (await x.consultar('/staging/contas/termos-cadastro')).json();
 const senhaCliente='SenhaAbc123!';
 const body={nome:'Pessoa de Exemplo',nick:'JoAo',email:'joao@example.invalid',
  telefone:'21999998888',senha:senhaCliente,confirmarSenha:senhaCliente,
  aceiteExplicito:true,termosVersaoAceita:termos.termosVersao,
  termosHashAceito:termos.termosHash};
 const post=b=>x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(b)
 });
 const divergente=await post({...body,confirmarSenha:'outraSenha2026'});
 assert.equal(divergente.status,400,'senha divergente jamais grava cadastro');
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata').get().n,0);
 const invalido=await post({...body,telefone:'123'});
 assert.equal(invalido.status,400,'telefone invalido nao pode gravar cadastro');
 const criado=await post(body);
 assert.equal(criado.status,201);
 const created=await criado.json();
 assert.equal(created.nick,'JoAo');
 const row=x.db.prepare('SELECT nick,telefone_iv,telefone_cifra,telefone_tag FROM akitemm_conta_unica_candidata WHERE id=?').get(created.titularId);
 assert.equal(row.nick,'JoAo');
 assert.match(row.telefone_cifra,/^[a-f0-9]+$/);
 assert.equal(JSON.stringify(row).includes(body.telefone),false);
 const login=nick=>x.consultar('/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick,senha:senhaCliente})
 });
 assert.equal((await login('joao')).status,401);
 assert.equal((await login('JOAO')).status,401);
 const certo=await login('JoAo');
 assert.equal(certo.status,200);
 assert.equal((await certo.json()).nick,'JoAo');
 const cookie=certo.headers.getSetCookie().find(s=>s.startsWith('loop_candidato_s=')).split(';')[0];
 const loja=await x.consultar('/staging/loja',{headers:{Cookie:cookie}});
 assert.equal(loja.status,200,'mesma credencial autenticada abre a loja');
 const publico=await x.consultar('/loja');
 assert.equal(publico.status,302);
 assert.equal(publico.headers.get('location'),'/staging/loja');
});

test('nick legado: apenas grafia muda com senha e CSRF, mesma conta e login exato',async t=>{
 const x=await preparar(t);
 const novo=await x.consultar('/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Usuario Antigo',nick:'exemplo',
   email:'nick-legado@example.invalid',senha:'SenhaDoCliente123!',
   aceiteExplicito:true})
 });
 assert.equal(novo.status,201);
 const criado=await novo.json(),id=criado.titularId;
 x.db.prepare('UPDATE akitemm_conta_unica_candidata SET nick_grafia_confirmada=0 WHERE id=?').run(id);
 const login=nick=>x.consultar('/staging/contas/entrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nick,senha:'SenhaDoCliente123!'})
 });
 const antes=await login('exemplo');
 assert.equal(antes.status,200);
 const sessao=await antes.json();
 const cookie=antes.headers.getSetCookie().find(v=>v.startsWith('loop_candidato_s=')).split(';')[0];
 const mudar=(novoNick,senhaAtual,csrf=sessao.csrf)=>x.consultar('/staging/contas/nick/grafia',{
  method:'POST',headers:{'Content-Type':'application/json',
   Cookie:cookie,'X-Checkout-Csrf':csrf},
  body:JSON.stringify({novoNick,senhaAtual})
 });
 assert.equal((await mudar('ExempLo','senhaErrada')).status,401);
 assert.equal((await mudar('OutraPessoa','SenhaDoCliente123!')).status,400);
 assert.equal((await mudar('ExempLo','SenhaDoCliente123!','0'.repeat(64))).status,403);
 const correto=await mudar('ExempLo','SenhaDoCliente123!');
 assert.equal(correto.status,200);
 assert.equal((await correto.json()).nick,'ExempLo');
 const perfil=await x.consultar('/staging/contas/me',{headers:{Cookie:cookie}});
 assert.equal((await perfil.json()).nickGrafiaConfirmada,true);
 const dados=x.db.prepare('SELECT nick,nick_grafia_confirmada FROM akitemm_conta_unica_candidata WHERE id=?').get(id);
 assert.equal(dados.nick,'ExempLo');assert.equal(dados.nick_grafia_confirmada,1);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata').get().n,1);
 assert.equal((await login('exemplo')).status,401);
 assert.equal((await login('EXEMPLO')).status,401);
 assert.equal((await login('ExempLo')).status,200);
});

test('Escritorio e Tabuleiro: AKITEMM ampliada; posicao escolhida apenas em Minhas Posicoes',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,
  '../src/candidato/checkout-candidato-ui.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,
  '../src/candidato/checkout-candidato-ui.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../src/candidato/escritorio-cliente-integrado.css'),'utf8');
 assert.doesNotMatch(html,/Loja e Escritório no mesmo acesso|Escolha uma posição/);
 assert.match(html,/<div class="barra-conta"><a href="\/staging\/loja" class="primario loop03-loja-prata"/);
 assert.match(html,/<strong id="loop03NumeroIntegrado">—<\/strong><span id="loop03StatusPosicao"><\/span>/);
 assert.doesNotMatch(html,/id="seletorPosicoesResumo"/);
 assert.match(css,/\.barra-conta a\.loop03-loja-prata\{[\s\S]*?width:100%;flex:1 1 100%/);
 assert.match(js,/\$\('loop03IrPosicoesIntegrado'\)\.addEventListener\('click',\(\)=>mostrarAba\('conteudoPosicoes'\)\)/);
 assert.match(js,/\$\('tabuleiroVerPosicoesIntegrado'\)\.addEventListener\('click',\(\)=>mostrarAba\('conteudoPosicoes'\)\)/);
 assert.match(js,/const quantidade= somentePosicoesPeloQuadrado\?ativas\.length:10/);
 assert.match(js,/posicaoSelecionadaMotor=posicao\.numero;[\s\S]*?atualizarIndicadorSelecionadoResumo\(\);/);
 assert.doesNotMatch(js,/abrirPopupResumo|fecharPopupResumo/);
});
