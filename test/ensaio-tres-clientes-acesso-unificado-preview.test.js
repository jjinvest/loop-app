'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');

const senhaVisita='VISITANTE_LAB_PILOTO_TRES_2026_FORTE';
const senhaAdmin='ADMIN_LAB_PILOTO_TRES_2026_INDEPENDENTE';
const segredoOperador='SEGREDO_DE_OPERADOR_PILOTO_TRES_'+('R'.repeat(40));
const auth='Basic '+Buffer.from('acesso:'+senhaVisita).toString('base64');
const senhaConta='ContaFicticiaPiloto2026!';

test('ensaio de tres titulares: lojas, escritorios, links e admin isolados',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 const {app,equipe}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador,termosVersao:'LAB-piloto-tres-2026',
  termosTexto:'Ensaio fictício de três contas para verificar isolamento, sem direitos ou operações financeiras reais.'
 });
 const backend=app.listen(0,'127.0.0.1');
 await once(backend,'listening');
 const gateway=criarGateway({portaInterna:backend.address().port,
  senhaAcesso:senhaVisita,senhaAdmin,segredoOperador,
  validarNickIndicador:nick=>equipe.existeNick(nick)});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(done=>gateway.close(done));
  await new Promise(done=>backend.close(done));
  banco.close();
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const chamar=(rota,{metodo='GET',dados,headers={}}={})=>fetch(base+rota,{
  method:metodo,redirect:'manual',headers:{Authorization:auth,...headers,
   ...(dados?{'Content-Type':'application/json'}:{})},
  ...(dados?{body:JSON.stringify(dados)}:{})
 });
 const cadastrar=async(nick,ref='')=>{
  const resp=await chamar('/staging/contas/cadastrar',{metodo:'POST',
   headers:ref?{Cookie:ref}:{},
   dados:{nome:nick+' de Ensaio',nick,email:nick.toLowerCase()+'@example.invalid',
    senha:senhaConta,aceiteExplicito:true}});
  assert.equal(resp.status,201,'cadastro isolado para '+nick);
  return resp.json();
 };
 const ana=await cadastrar('Ana');
 const obterRef=async rota=>{
  const resposta=await chamar(rota);
  assert.equal(resposta.status,302);
  const cookie=resposta.headers.getSetCookie()
   .find(s=>s.startsWith('akitemm_preview_ref='));
  assert.ok(cookie,'referencia autenticada presente em '+rota);
  return cookie.split(';')[0];
 };
 const referenciaEscritorio=await obterRef('/escritorio/Ana');
 const bia=await cadastrar('Bia',referenciaEscritorio);
 const referenciaLoja=await obterRef('/loja/Ana');
 const ceci=await cadastrar('Ceci',referenciaLoja);
 assert.equal(new Set([ana.titularId,bia.titularId,ceci.titularId]).size,3);
 const entrar=async nick=>{
  const r=await chamar('/staging/contas/entrar',{metodo:'POST',
   dados:{nick,senha:senhaConta}});
  assert.equal(r.status,200,'login sem novo cadastro para '+nick);
  const s=await r.json();
  const cookie=r.headers.getSetCookie().find(x=>x.startsWith(COOKIE+'='));
  assert.ok(cookie,'sessao do titular '+nick);
  return {cookie:cookie.split(';')[0],csrf:s.csrf,id:s.titularId};
 };
 const usuarios={ana:await entrar('Ana'),bia:await entrar('Bia'),
  ceci:await entrar('Ceci')};
 const ids={ana:ana.titularId,bia:bia.titularId,ceci:ceci.titularId};
 for(const [nick,u] of Object.entries(usuarios)){
  assert.equal(u.id,ids[nick]);
  const headers={Cookie:u.cookie};
  const office=await chamar('/staging/contas/me',{headers});
  assert.equal(office.status,200);
  const identidade=await office.json();
  assert.equal(identidade.titularId,ids[nick]);
  assert.equal(identidade.nick,nick);
  const loja=await chamar('/staging/vitrine/minha-conta',{headers});
  assert.equal(loja.status,200);
  assert.equal((await loja.json()).conta.nick,nick);
  const atalho=await chamar('/loja',{headers});
  assert.equal(atalho.status,302);
  assert.equal(atalho.headers.get('location'),'/staging/loja');
  assert.equal((await chamar('/staging/loja',{headers})).status,200);
  assert.equal((await chamar('/staging/escritorio-unificado',{headers})).status,401,
   'titular nao herda permissao de administrador');
 }
 const consultarEquipe=async u=>{
  const r=await chamar('/staging/minha-equipe',{headers:{Cookie:u.cookie}});
  assert.equal(r.status,200);return r.json();
 };
 const equipeAna=await consultarEquipe(usuarios.ana);
 assert.equal(equipeAna.total,2,'dois links do mesmo indicador unificam equipe');
 assert.deepEqual(equipeAna.cadastros.map(p=>p.nick).sort(),['bia','ceci']);
 assert.equal((await consultarEquipe(usuarios.bia)).total,0);
 assert.equal((await consultarEquipe(usuarios.ceci)).total,0);
 // Um pedido ficticio de Ana nao pode aparecer em "Meus Pedidos" de Bia
 // ou Ceci, nem ser consultado por URL usando uma sessao de outra pessoa.
 const itens={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await chamar('/staging/cotacao',{metodo:'POST',dados:itens});
 assert.equal(cotacao.status,200);
 assert.equal((await cotacao.json()).totalCentavos,25000);
 const acessoAna={Cookie:usuarios.ana.cookie,
  'X-Checkout-Csrf':usuarios.ana.csrf};
 const rascunho=await chamar('/staging/rascunhos',{metodo:'POST',
  headers:{...acessoAna,'Idempotency-Key':'piloto-tres-titulares-2026-01'},
  dados:itens});
 assert.equal(rascunho.status,201);
 const pedidoId=(await rascunho.json()).intencao.pedidoId;
 const prepedido=await chamar('/staging/prepedidos',{metodo:'POST',
  headers:acessoAna,dados:{rascunhoId:pedidoId}});
 assert.equal(prepedido.status,201);
 const idPrepedido=(await prepedido.json()).prepedido.prepedidoId;
 for(const [nick,u] of Object.entries(usuarios)){
  const r=await chamar('/staging/meus-pedidos',{headers:{Cookie:u.cookie}});
  assert.equal(r.status,200);
  const pedidos=(await r.json()).pedidos;
  assert.equal(pedidos.length,nick==='ana'?1:0,
   'historico de compras nao atravessa fronteira de titular '+nick);
  if(nick==='ana')assert.equal(pedidos[0].prepedidoId,idPrepedido);
  else{
   const entrega=await chamar('/staging/prepedidos/'+idPrepedido+'/entrega',
    {headers:{Cookie:u.cookie}});
   assert.equal(entrega.status,404,
    'consulta por ID do pedido de Ana nao permite acesso cruzado a '+nick);
   const diagnostico=await chamar(
    '/staging/meu-diagnostico-ativacao/'+idPrepedido,
    {headers:{Cookie:u.cookie}});
   assert.equal(diagnostico.status,404,
    'diagnostico de Ana nao pode vazar para '+nick);
  }
 }
 assert.equal((await chamar('/staging/meus-pedidos')).status,401);
 const duploCookie=await chamar('/staging/contas/me',{
  headers:{Cookie:usuarios.ana.cookie+'; '+usuarios.bia.cookie}});
 assert.equal(duploCookie.status,401,
  'dois cookies de contas distintas nunca elegem titular arbitrario');
 assert.equal((await chamar('/staging/minha-equipe')).status,401);
 assert.equal((await chamar('/staging/loja')).status,302,
  'sem sessao, nao abre o carrinho de outra conta');
 assert.equal((await chamar('/staging/escritorio-unificado')).status,401);
 for(const u of Object.values(usuarios)){
  const resp=await chamar('/staging/checkout/finalizar',{metodo:'POST',
   headers:{Cookie:u.cookie}});
  assert.equal(resp.status,503,'nenhuma compra financeira real habilitada');
 }
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
