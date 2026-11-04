'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {DiagnosticoAtivacaoCandidato,BLOQUEIOS_FINAIS}=
 require('../src/domain/diagnostico-ativacao-candidato');
const ID='hom-11111111-1111-1111-1111-111111111111';
const TIT='titular-11111111-1111-1111-1111-111111111111';
const criar=estado=>{
 const banco=new DatabaseSync(':memory:');
 const preAdesao={db:banco,avaliar:()=>estado};
 return {banco,preAdesao,diag:new DiagnosticoAtivacaoCandidato({banco,preAdesao})};
};
test('gate de ativacao nunca habilita motor mesmo com pre-adesao completa',()=>{
 const {banco,diag}=criar({
  prepedidoId:ID,titularId:TIT,ensaioRegistrado:true,estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',
  motivos:[],cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true
 });
 try{
  const r=diag.avaliar({prepedidoId:ID,titularId:TIT});
  assert.equal(r.estado,'BLOQUEADA_PARA_ATIVACAO_DEFINITIVA');
  assert.equal(r.resumo.preAdesaoDeEnsaioSemRevisao,true);
  assert.equal(r.resumo.cpfFicticioDeclarado,true);
  assert.equal(r.resumo.identidadeExternaRealConfirmada,false);
  assert.equal(r.resumo.pagamentoComercialConfirmado,false);
  assert.equal(r.resumo.limitePorTitular,10);
  assert.equal(r.resumo.limiteTabuleiroPorTitular,2);
  assert.equal(r.permitidoAtivar,false);
  assert.equal(r.permitidoMoverFila,false);
  assert.equal(r.permitidoGirar,false);
  assert.equal(r.permitidoPagar,false);
  assert.deepEqual(r.bloqueios,BLOQUEIOS_FINAIS);
  assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{banco.close();}
});
test('gate identifica pre-adesao ausente e pagamento revertido sem habilitar ativacao',()=>{
 const x=criar({prepedidoId:ID,titularId:TIT,ensaioRegistrado:false,
  estado:'BLOQUEADA_PARA_ENSAIO',
  motivos:['RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE',
   'CPF_E_TERMOS_DE_ENSAIO_AUSENTES'],
  cpfDeclaradoNoEnsaio:false,fotografiaHistoricaConferida:true});
 try{
  const r=x.diag.avaliar({prepedidoId:ID});
  assert.ok(r.bloqueios.includes('PRE_ADESAO_AINDA_NAO_PERSISTIDA'));
  assert.ok(r.bloqueios.includes('RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE'));
  assert.equal(r.resumo.pspSandboxSemRevisao,false);
  assert.equal(r.permitidoAtivar,false);
  x.preAdesao.avaliar=()=>({prepedidoId:ID,titularId:TIT,ensaioRegistrado:true,
   estado:'ENSAIO_HISTORICO_EM_REVISAO',
   motivos:['RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE'],
   cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true});
  const rev=x.diag.avaliar({prepedidoId:ID});
  assert.ok(rev.bloqueios.includes('PRE_ADESAO_HISTORICA_EXIGE_REVISAO'));
  assert.equal(rev.resumo.preAdesaoDeEnsaioSemRevisao,false);
 }finally{x.banco.close();}
});
test('gate nao aceita identidade, pedido ou provider arbitrar ios',()=>{
 const x=criar(null);
 try{
  assert.equal(x.diag.avaliar({prepedidoId:ID,titularId:TIT}),null);
  assert.throws(()=>x.diag.avaliar({prepedidoId:'invalido'}),/IDENTIFICACAO_PEDIDO_INVALIDA/);
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID,titularId:'outro'}),/IDENTIFICACAO_PEDIDO_INVALIDA/);
  assert.throws(()=>new DiagnosticoAtivacaoCandidato({
   banco:x.banco,preAdesao:x.preAdesao,provedorIdentidade:{
    ambiente:'REAL',consultarStatus:()=>({validada:true})
   }
  }),/PROVEDOR_IDENTIDADE_NAO_HOMOLOGADO/);
 }finally{x.banco.close();}
});
test('gate rejeita uso em producao',()=>{
 const x=criar(null),old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID}),/DIAGNOSTICO_NAO_HOMOLOGADO/);
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
  x.banco.close();
 }
});

test('diagnostico recusa fonte de pedido/titular divergente ou motivos invalidos',()=>{
 const estado={prepedidoId:ID,titularId:TIT,ensaioRegistrado:true,
  estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',motivos:[],
  cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true};
 const x=criar(estado);
 try{
  x.preAdesao.avaliar=()=>({...estado,prepedidoId:'hom-22222222-2222-2222-2222-222222222222'});
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
  x.preAdesao.avaliar=()=>({...estado,titularId:'titular-22222222-2222-2222-2222-222222222222'});
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID,titularId:TIT}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
  x.preAdesao.avaliar=()=>({...estado,motivos:'PAGAMENTO_RECEBIDO'});
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID,titularId:TIT}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
  x.preAdesao.avaliar=()=>({...estado,motivos:['']});
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID,titularId:TIT}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
  assert.equal(x.banco.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{x.banco.close();}
});
test('retorno positivo de provedor KYC Sandbox nao abre nenhum gate definitivo',()=>{
 const estado={prepedidoId:ID,titularId:TIT,ensaioRegistrado:true,
  estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',motivos:[],
  cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true};
 const x=criar(estado);
 try{
  const outro=new DiagnosticoAtivacaoCandidato({
   banco:x.banco,preAdesao:x.preAdesao,provedorIdentidade:{
    ambiente:'VERIFICACAO_IDENTIDADE_SANDBOX',
    consultarStatus:()=>({identidadeConfirmada:true,aprovada:true})
   }
  });
  const r=outro.avaliar({prepedidoId:ID,titularId:TIT});
  assert.equal(r.resumo.provedorKycTesteConfigurado,true);
  assert.equal(r.resumo.identidadeExternaRealConfirmada,false);
  assert.equal(r.resumo.pagamentoComercialConfirmado,false);
  assert.equal(r.permitidoAtivar,false);
  assert.equal(r.permitidoPagar,false);
  assert.ok(r.bloqueios.includes('IDENTIDADE_EXTERNA_NAO_HOMOLOGADA'));
 }finally{x.banco.close();}
});

test('email da conta e conferido no mesmo SQLite, sem alterar os gates externos',()=>{
 const estado={prepedidoId:ID,titularId:TIT,ensaioRegistrado:true,
  estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',motivos:[],
  cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true};
 const x=criar(estado),perfil={titularId:TIT,emailVerificado:false};
 try{
  const contas={banco:x.banco,perfil:()=>perfil};
  const gate=new DiagnosticoAtivacaoCandidato({
   banco:x.banco,preAdesao:x.preAdesao,contas
  });
  const antes=gate.avaliar({prepedidoId:ID,titularId:TIT});
  assert.equal(antes.resumo.emailDaContaConferidoNoSQLite,true);
  assert.equal(antes.resumo.emailDaContaVerificadoNoEnsaio,false);
  assert.ok(antes.bloqueios.includes('EMAIL_DA_CONTA_NAO_VERIFICADO'));
  perfil.emailVerificado=true;
  const depois=gate.avaliar({prepedidoId:ID,titularId:TIT});
  assert.equal(depois.resumo.emailDaContaVerificadoNoEnsaio,true);
  assert.ok(!depois.bloqueios.includes('EMAIL_DA_CONTA_NAO_VERIFICADO'));
  assert.ok(depois.bloqueios.includes('IDENTIDADE_EXTERNA_NAO_HOMOLOGADA'));
  assert.ok(depois.bloqueios.includes('PAGAMENTO_COMERCIAL_NAO_CONCILIADO'));
  for(const chave of ['permitidoAtivar','permitidoMoverFila','permitidoGirar','permitidoPagar'])
   assert.equal(depois[chave],false);
  perfil.titularId='titular-22222222-2222-2222-2222-222222222222';
  assert.throws(()=>gate.avaliar({prepedidoId:ID,titularId:TIT}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
  assert.throws(()=>new DiagnosticoAtivacaoCandidato({
   banco:x.banco,preAdesao:x.preAdesao,
   contas:{banco:{},perfil:()=>perfil}
  }),/FONTES_DIAGNOSTICO_INCOMPATIVEIS/);
 }finally{x.banco.close();}
});
test('admin nao pode usar dados sem titular valido no diagnostico',()=>{
 const x=criar({prepedidoId:ID,ensaioRegistrado:true,
  estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',motivos:[]});
 try{
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID}),
   /FONTE_DIAGNOSTICO_INCONSISTENTE/);
 }finally{x.banco.close();}
});
test('HTTP cliente e admin mostram mesma prova de email e nao liberam ativacao',async t=>{
 const {once}=require('node:events');
 const {randomBytes}=require('node:crypto');
 const {criarAppLojaEscritorioCandidato}=
  require('../src/candidato/servidor-loja-escritorio-candidato');
 const {catalogoFicticioCheckout}=
  require('../src/laboratorio/servidor-checkout-staging-local');
 const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const admin='operador-email-gate-'+('X'.repeat(44));
 let codigoCapturado;
 const app=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveProvaEmail:randomBytes(32),
  enviarEmailDeVerificacao:async ({codigo})=>{
   codigoCapturado=codigo;return true;
  },
  segredoOperador:admin,termosVersao:'LAB-email-gate-2026',
  termosTexto:'Termos de ensaio sem pagamentos reais, posicoes, saques ou ganhos.'
 });
 const sv=app.app.listen(0,'127.0.0.1');await once(sv,'listening');
 t.after(async()=>{await new Promise(ok=>sv.close(ok));banco.close();});
 const base='http://127.0.0.1:'+sv.address().port;
 async function req(p,{method='GET',cookie,csrf,adminToken,key,body}={}){
  const r=await fetch(base+p,{method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(adminToken?{Authorization:'Bearer '+adminToken}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,json:await r.json().catch(()=>({})),setCookie:r.headers.get('set-cookie')};
 }
 const nick='Ema',senha='SenhaExclusivaDeLaboratorio2026!';
 const reg=await req('/staging/contas/cadastrar',{method:'POST',
  body:{nome:'Ema Conta Teste',nick,email:'ema@example.invalid',senha,
   aceiteExplicito:true}});
 assert.equal(reg.status,201,JSON.stringify(reg.json));
 const login=await req('/staging/contas/entrar',{method:'POST',body:{nick,senha}});
 assert.equal(login.status,200);
 const cookie=login.setCookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const csrf=login.json.csrf, auth={cookie,csrf};
 const draft=await req('/staging/rascunhos',{method:'POST',...auth,
  key:'email-gate-draft-0001',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}});
 assert.equal(draft.status,201,JSON.stringify(draft.json));
 const pedido=await req('/staging/prepedidos',{method:'POST',...auth,
  body:{rascunhoId:draft.json.intencao.pedidoId}});
 assert.equal(pedido.status,201,JSON.stringify(pedido.json));
 const id=pedido.json.prepedido.prepedidoId;
 const cliente='/staging/meu-diagnostico-ativacao/'+id;
 const operador='/staging/escritorio-unificado/diagnostico-ativacao/'+id;
 assert.equal((await req(cliente)).status,401);
 assert.equal((await req(operador)).status,401);
 const antes=await req(cliente,{cookie});
 const antesAdmin=await req(operador,{adminToken:admin});
 assert.equal(antes.status,200);assert.equal(antesAdmin.status,200);
 assert.deepEqual(antes.json.bloqueios,antesAdmin.json.bloqueios);
 assert.ok(antes.json.bloqueios.includes('EMAIL_DA_CONTA_NAO_VERIFICADO'));
 assert.equal(antes.json.resumo.emailDaContaVerificadoNoEnsaio,false);
 const enviar=await req('/staging/contas/email/enviar',{method:'POST',...auth,body:{}});
 assert.equal(enviar.status,200,JSON.stringify(enviar.json));
 assert.match(codigoCapturado,/^[0-9]{8}$/);
 const confirmar=await req('/staging/contas/email/confirmar',{
  method:'POST',...auth,body:{codigo:codigoCapturado}});
 assert.equal(confirmar.status,200,JSON.stringify(confirmar.json));
 assert.equal(confirmar.json.emailVerificado,true);
 const depois=await req(cliente,{cookie}),finalAdmin=await req(operador,{adminToken:admin});
 assert.equal(depois.status,200);assert.equal(finalAdmin.status,200);
 assert.deepEqual(depois.json.bloqueios,finalAdmin.json.bloqueios);
 assert.equal(depois.json.resumo.emailDaContaVerificadoNoEnsaio,true);
 assert.ok(!depois.json.bloqueios.includes('EMAIL_DA_CONTA_NAO_VERIFICADO'));
 assert.equal(depois.json.permitidoAtivar,false);
 assert.equal(depois.json.permitidoPagar,false);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
