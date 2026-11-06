'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {provarPersistenciaReinicio,assinaturaMotor}=require('../scripts/provar-persistencia-reinicio-preview-railway');
const env={NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FICTICIA_TAMANHO_CORRETO_123456'};
const motor={origem:'MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA',
 laboratorio:true,autorizacaoComercial:false,dinheiroReal:false,posicoesReais:0,
 filaA:[],filaB:[{numero:1,status:'PENDENTE',dourada:false}],
 tabuleiro:{centro:null,vagas:[null,null,null,null,null,null],
  ciclosConcluidos:0,eventosNoCiclo:0},
 catraca:{giros:0}};
const fake=async(url,opts)=>{
 assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
 assert.match(opts.headers.Authorization,/^Basic /);
 let v;
 if(url.endsWith('/readyz'))v={estado:'BANCO_DE_ENSAIO_APTO',financeiroReal:false,marcoZeroLiberado:false};
 else if(url.endsWith('/motor/estado'))v=motor;
 else if(url.endsWith('/monitor-psp'))v={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  somenteLaboratorio:true,consultaPSPExecutadaNestaLeitura:false,
  saquesReais:0,pagamentosReais:0};
 else throw Error('rota inesperada');
 return {status:200,json:async()=>v};
};
test('prova read-only observa SQLite, PSP e assinatura sem dados pessoais',async()=>{
 const r=await provarPersistenciaReinicio({env,fetchImpl:fake});
 assert.equal(r.readyzApto,true);assert.equal(r.posicoesMotor,1);
 assert.match(r.assinaturaMotor,/^[0-9a-f]{24}$/);
 assert.equal(r.comprovacaoReinicioCompleta,false);
 assert.equal(r.dinheiroReal,false);
 assert.equal(JSON.stringify(r).includes(env.LOOP_PREVIEW_SENHA_ACESSO),false);
});
test('assinatura e deterministica e muda se posicao desaparecer',()=>{
 const a=assinaturaMotor(motor);
 assert.equal(a.assinatura,assinaturaMotor(structuredClone(motor)).assinatura);
 const menor=structuredClone(motor);menor.filaB=[];
 assert.notEqual(a.assinatura,assinaturaMotor(menor).assinatura);
});
test('falha fechada sem segredo, no dominio errado e na producao',async()=>{
 for(const change of [
  {NODE_ENV:'production'},{LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'site-invalido.example'},
  {LOOP_PREVIEW_SENHA_ACESSO:'curta'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'}]){
  let chamadas=0;
  await assert.rejects(provarPersistenciaReinicio({
   env:{...env,...change},fetchImpl:async()=>{chamadas++;return{};}
  }),/REINICIO_/);
  assert.equal(chamadas,0);
 }
});
test('um 503 em qualquer endpoint impede sucesso',async()=>{
 await assert.rejects(provarPersistenciaReinicio({
  env,fetchImpl:async()=>({status:503})
 }),{codigo:'REINICIO_HTTP_503'});
});
test('sem posicao de teste anterior nao declara persistencia',async()=>{
 const limpo=structuredClone(motor);limpo.filaB=[];
 await assert.rejects(provarPersistenciaReinicio({env,
  fetchImpl:async(url,opts)=>url.endsWith('/motor/estado')?
   {status:200,json:async()=>limpo}:fake(url,opts)
 }),{codigo:'REINICIO_SEM_POSICAO_TESTE_PERSISTIDA'});
});
