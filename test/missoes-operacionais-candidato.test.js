'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-missao-'+('M'.repeat(48));
async function http(base,p,{method='GET',token,cookie,csrf,data,key}={}){
 const r=await fetch(base+p,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
  ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
  ...(key?{'Idempotency-Key':key}:{}),
  ...(data?{'Content-Type':'application/json'}:{})
 },...(data?{body:JSON.stringify(data)}:{})});
 return {status:r.status,json:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')};
}
test('loja, cliente e admin compartilham SQLite com missões auditadas e sigilo entre titulares',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const app=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:ADMIN,
  termosVersao:'LAB-missoes2026',termosTexto:'Termos de ensaio sem dinheiro, posições, bônus ou saques reais.'
 });
 const server=app.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const pessoa=async nick=>{
  const form={nome:'Cliente '+nick,nick,email:nick+'@example.invalid',
   senha:'SenhaFicticiaDemonstracao2026!',aceiteExplicito:true};
  const cadastro=await http(base,'/staging/contas/cadastrar',{method:'POST',data:form});
  assert.equal(cadastro.status,201,JSON.stringify(cadastro.json));
  const login=await http(base,'/staging/contas/entrar',{method:'POST',
   data:{nick,senha:form.senha}});
  assert.equal(login.status,200);
  return {cookie:login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],csrf:login.json.csrf};
 };
 const ana=await pessoa('Ana'),bia=await pessoa('Bia');
 const rascunho=await http(base,'/staging/rascunhos',{method:'POST',
  cookie:ana.cookie,csrf:ana.csrf,key:'missao-draft-checkout-001',
  data:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}});
 assert.equal(rascunho.status,201,JSON.stringify(rascunho.json));
 const pre=await http(base,'/staging/prepedidos',{method:'POST',cookie:ana.cookie,
  csrf:ana.csrf,data:{rascunhoId:rascunho.json.intencao.pedidoId}});
 assert.equal(pre.status,201,JSON.stringify(pre.json));
 const id=pre.json.prepedido.prepedidoId,rota='/staging/escritorio-unificado/missoes';
 const mensagem='Seu pedido segue em conferência, sem qualquer pagamento real.';
 const dados={departamento:'PEDIDOS',prioridade:'ALTA',titulo:'Conferir pedido',
  descricao:'Verificar integridade do pré-pedido e comunicar o status de ensaio.',
  prepedidoId:id,mensagemCliente:mensagem};
 assert.equal((await http(base,rota)).status,401);
 assert.equal((await http(base,rota,{method:'POST',data:dados,key:'missao-cliente-001'})).status,401);
 assert.equal((await http(base,rota,{method:'POST',token:ADMIN,data:dados})).status,400);
 const criacao=await http(base,rota,{method:'POST',token:ADMIN,data:dados,key:'missao-cliente-001'});
 assert.equal(criacao.status,201,JSON.stringify(criacao.json));
 const repetida=await http(base,rota,{method:'POST',token:ADMIN,data:dados,key:'missao-cliente-001'});
 assert.equal(repetida.status,200);
 assert.equal(repetida.json.id,criacao.json.id);
 assert.equal((await http(base,rota,{method:'POST',token:ADMIN,
  data:{...dados,titulo:'Alteração divergente'},key:'missao-cliente-001'})).status,409);
 const lA=await http(base,'/staging/meus-comunicados',{cookie:ana.cookie});
 const lB=await http(base,'/staging/meus-comunicados',{cookie:bia.cookie});
 assert.equal(lA.status,200);assert.equal(lB.status,200);
 assert.equal(lA.json.comunicados.length,1);
 assert.equal(lA.json.comunicados[0].mensagem,mensagem);
 assert.equal(lB.json.comunicados.length,0);
 const item=rota+'/'+criacao.json.id;
 const iniciou=await http(base,item,{method:'PATCH',token:ADMIN,
  data:{revisaoEsperada:1,situacao:'EM_ANDAMENTO',nota:'Operador iniciou revisão dos dados'}});
 assert.equal(iniciou.status,200,JSON.stringify(iniciou.json));
 assert.equal(iniciou.json.revisao,2);
 assert.equal((await http(base,item,{method:'PATCH',token:ADMIN,
  data:{revisaoEsperada:1,situacao:'CONCLUIDA',nota:'Tentativa com revisão antiga'}})).status,409);
 const concluiu=await http(base,item,{method:'PATCH',token:ADMIN,
  data:{revisaoEsperada:2,situacao:'CONCLUIDA',nota:'Revisão de homologação concluída'}});
 assert.equal(concluiu.status,200);
 assert.equal((await http(base,item+'/historico',{token:ADMIN})).json.historico.length,3);
 assert.equal((await http(base,'/staging/checkout/finalizar',{method:'POST'})).status,503);
 assert.equal((await http(base,'/staging/escritorio-admin')).status,200);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('missões não iniciam em produção',()=>{
 const {MissoesOperacionaisCandidatoSQLite}=require('../src/domain/missoes-operacionais-candidato-sqlite');
 const antigo=process.env.NODE_ENV,db=new DatabaseSync(':memory:');
 process.env.NODE_ENV='production';
 try{assert.throws(()=>new MissoesOperacionaisCandidatoSQLite({banco:db}),/ADMIN_NAO_HOMOLOGADO/);}
 finally{db.close();if(antigo===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=antigo;}
});
test('legenda da loja usa as três classes existentes e não modifica elegibilidade',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const ui=fs.readFileSync(path.join(__dirname,'../src/laboratorio/loja-cliente-demo.html'),'utf8');
 for(const s of ['akitemm-cor-cinza','akitemm-cor-verde','akitemm-cor-evento',
  'Compra comum (sem LOOP)','Qualifica para o LOOP','Evento especial']){
  assert.ok(ui.includes(s),s);
 }
 assert.ok(!ui.includes('onclick="'));
});
