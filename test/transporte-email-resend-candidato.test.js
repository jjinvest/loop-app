'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {criarTransporteEmailVerificacaoResend}=
 require('../src/adapters/email-verificacao-resend');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const API_KEY='re_'+('ficticia'.repeat(6));
const remetente='no-reply@akitemm.example';
const destino='cliente@example.invalid';
const codigo='12345678';
const expiraEm=Date.now()+15*60*1000;
const fixture={para:destino,codigo,expiraEm};
test('transporte Resend envia somente código por HTTPS com chave fora do corpo',async()=>{
 const chamadas=[];
 const enviar=criarTransporteEmailVerificacaoResend({
  apiKey:API_KEY,remetente,
  fetchImpl:async(url,options)=>{
   chamadas.push({url,options});
   return new Response(JSON.stringify({id:'email_id_1-12345'}),{
    status:200,headers:{'Content-Type':'application/json'}
   });
  }
 });
 assert.equal(await enviar(fixture),true);
 assert.equal(chamadas.length,1);
 const x=chamadas[0];
 assert.equal(x.url,'https://api.resend.com/emails');
 assert.equal(x.options.method,'POST');
 assert.equal(x.options.redirect,'error');
 assert.equal(x.options.headers.Authorization,'Bearer '+API_KEY);
 const body=JSON.parse(x.options.body);
 assert.equal(body.from,remetente);
 assert.deepEqual(body.to,[destino]);
 assert.match(body.text,/12345678/);
 assert.match(body.text,/15 minutos/);
 assert.equal(JSON.stringify(body).includes(API_KEY),false);
 assert.equal(JSON.stringify(body).includes('CPF'),false);
 assert.equal(body.html,undefined);
});
test('falha API, resposta inválida e timeout nunca autorizam verificação',async()=>{
 for(const fetchImpl of [
  async()=>new Response(JSON.stringify({message:'Bad request'}),{status:400}),
  async()=>new Response(JSON.stringify({message:'Internal error'}),{status:500}),
  async()=>new Response('{}',{status:200}),
  async()=>{throw Error('timeout private key re_secret_not_logged');}
 ]){
  const enviar=criarTransporteEmailVerificacaoResend({
   apiKey:API_KEY,remetente,fetchImpl
  });
  await assert.rejects(enviar(fixture),e=>e.codigo?.startsWith('EMAIL_'));
 }
 assert.throws(()=>criarTransporteEmailVerificacaoResend({
  apiKey:'invalid',remetente
 }),/EMAIL_PROVEDOR_CHAVE_INVALIDA/);
 assert.throws(()=>criarTransporteEmailVerificacaoResend({
  apiKey:API_KEY,remetente:'bad\nheader@example.com'
 }),/EMAIL_REMETENTE_NAO_CONFIGURADO/);
 await assert.rejects(criarTransporteEmailVerificacaoResend({
  apiKey:API_KEY,remetente,
  fetchImpl:async()=>new Response('{}',{status:200})
 })({...fixture,codigo:'1234'}),/EMAIL_MENSAGEM_INVALIDA/);
});
test('conta candidata usa transportador HTTP injetado, sem ligar pagamento real',async()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const messages=[];
 const app=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveProvaEmail:randomBytes(32),
  transporteResend:{
   apiKey:API_KEY,remetente,
   fetchImpl:async(url,opts)=>{
    messages.push({url,body:JSON.parse(opts.body)});
    return new Response(JSON.stringify({id:'email-prova-87654321'}),{
     status:200
    });
   }
  },
  segredoOperador:'segredo-email-operador-'+('X'.repeat(45)),
  termosVersao:'LAB-confirmacao-2026',
  termosTexto:'Termos de ensaio sem pagamentos reais, saques, distribuição de posições ou benefícios.'
 });
 const conta=await app.contas.cadastrar({
  nome:'Ana Exemplo',nick:'Ana',email:destino,
  senha:'SenhaExclusivaDeLaboratorio2026!',aceiteExplicito:true,
  termosVersao:'LAB-confirmacao-2026',
  termosTexto:'Termos de ensaio sem pagamentos reais, saques, distribuição de posições ou benefícios.'
 });
 assert.equal(app.provasEmail.verificado({titularId:conta.titularId}),false);
 const r=await app.provasEmail.solicitar({
  titularId:conta.titularId,autorizado:true
 });
 assert.equal(r.envioDeclaradoPeloProvedor,true);
 assert.equal(messages.length,1);
 assert.equal(messages[0].body.to[0],destino);
 assert.equal(app.provasEmail.verificado({titularId:conta.titularId}),false);
 assert.equal(app.contas.perfil(conta.titularId).emailVerificado,false);
 assert.equal(app.integridade.auditar().totalInconsistencias,0);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 banco.close();
});
