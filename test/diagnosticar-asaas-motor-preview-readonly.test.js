'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {diagnosticarCadeia,validarMonitor,validarConfig}=
 require('../scripts/diagnosticar-asaas-motor-preview-readonly');
const env={
 LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SENHA_ACESSO:'SenhaDeVisitanteEnsaioReservada2026',
 LOOP_PREVIEW_SENHA_ADMIN:'SenhaDeAdministradorDiferente2026'
};
const monitor=(alteracoes={})=>({
 ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
 somenteLaboratorio:true,consultaPSPExecutadaNestaLeitura:false,
 pagamentosReais:0,saquesReais:0,posicoesReais:0,
 resumo:{pendentes:0,processando:0,exigeRevisao:0,
  total:0,vinculosMotorAusentes:0,reversoesMotorPendentes:0,
  quarentenaAguardandoVinculo:0,quarentenaDivergente:0},
 recuperacaoPSP:{processando:0,retomaveis:0,segundaFalha:0},
 fila:[{eventoId:'NAO_PUBLICAR'}],...alteracoes
});
const estado=()=>({
 laboratorio:true,autorizacaoComercial:false,dinheiroReal:false,
 posicoesReais:0,origem:'MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA',
 filaA:[],filaB:[{numero:7,status:'ATIVA_ENSAIO'}],
 tabuleiro:{centro:null,vagas:[null,null,null,null,null,null],
  ciclosConcluidos:0,eventosNoCiclo:0},
 catraca:{giros:0}
});
test('rejeita ambiente incorreto, segredos ausentes e senhas compartilhadas',()=>{
 assert.doesNotThrow(()=>validarConfig(env));
 for(const delta of [{LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'evil.invalid'},
  {LOOP_PREVIEW_SENHA_ADMIN:'curta'},
  {LOOP_PREVIEW_SENHA_ADMIN:env.LOOP_PREVIEW_SENHA_ACESSO},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'}])
  assert.throws(()=>validarConfig({...env,...delta}),
   /SONDA_CONFIGURACAO_NAO_AUTORIZADA/);
});
test('nega totais contraditorios e campos de origem financeira falsos',()=>{
 assert.doesNotThrow(()=>validarMonitor(monitor()));
 assert.throws(()=>validarMonitor(monitor({
  resumo:{...monitor().resumo,pendentes:2,total:0}
 })),/SONDA_CONTADORES_INCONSISTENTES/);
 assert.throws(()=>validarMonitor(monitor({
  pagamentosReais:1
 })),/SONDA_MONITOR_FONTE_INVALIDA/);
 assert.throws(()=>validarMonitor(monitor({
  recuperacaoPSP:{processando:0,retomaveis:-1,segundaFalha:0}
 })),/SONDA_RECUPERACAO_INVALIDA/);
});
test('sonda usa somente 3 GET e privilegio admin separado; nao vaza eventos',async()=>{
 const chamadas=[];
 const mock=async(url,opt)=>{
  chamadas.push({url,method:opt.method,authorization:
   Buffer.from(opt.headers.Authorization.slice(6),'base64').toString()});
  const body=url.endsWith('/readyz')?
   {estado:'BANCO_DE_ENSAIO_APTO',marcoZeroLiberado:false,financeiroReal:false}:
   url.endsWith('/monitor-psp')?monitor():estado();
  return {status:200,json:async()=>body};
 };
 const x=await diagnosticarCadeia({env,fetchImpl:mock});
 assert.equal(x.estado,'SEM_PENDENCIAS_OBSERVADAS');
 assert.equal(x.posicoesMotor,1);
 assert.equal(x.webhookRecebidoNestaSonda,false);
 assert.equal(x.transacoesReais,false);
 assert.equal(JSON.stringify(x).includes('NAO_PUBLICAR'),false);
 assert.equal(chamadas.length,3);
 assert.ok(chamadas.every(x=>x.method==='GET'));
 assert.equal(chamadas[0].authorization,
  'acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO);
 for(const x of chamadas.slice(1))
  assert.equal(x.authorization,'operador:'+env.LOOP_PREVIEW_SENHA_ADMIN);
});
test('pendencia de vinculo nunca e declarada como conciliada',async()=>{
 const mock=async(url)=>({status:200,json:async()=>url.endsWith('/readyz')?
  {estado:'BANCO_DE_ENSAIO_APTO',marcoZeroLiberado:false,financeiroReal:false}:
  url.endsWith('/monitor-psp')?monitor({
   resumo:{...monitor().resumo,vinculosMotorAusentes:2}
  }):estado()});
 const x=await diagnosticarCadeia({env,fetchImpl:mock});
 assert.equal(x.estado,'PENDENCIAS_OPERACIONAIS_REVISAR');
 assert.equal(x.pedidosSemVinculoMotor,2);
});
test('monitor 401 e JSON inconsistente bloqueiam prova sem expor credencial',async()=>{
 const erro401=async()=>({status:401,json:async()=>({})});
 await assert.rejects(diagnosticarCadeia({env,fetchImpl:erro401}),
  /SONDA_(?:ADMIN|READY)_HTTP_401/);
 const invalido=async(url)=>({status:200,json:async()=>url.endsWith('/readyz')?
  {estado:'BANCO_DE_ENSAIO_APTO',marcoZeroLiberado:false,financeiroReal:false}:
  url.endsWith('/monitor-psp')?monitor({posicoesReais:9}):estado()});
 await assert.rejects(diagnosticarCadeia({env,fetchImpl:invalido}),
  /SONDA_MONITOR_FONTE_INVALIDA/);
});

test('webhook antecipado nao desaparece de relatorio sem pendencias',async()=>{
 const remote=async url=>({status:200,json:async()=>url.endsWith('/readyz')?
  {estado:'BANCO_DE_ENSAIO_APTO',marcoZeroLiberado:false,financeiroReal:false}:
  url.endsWith('/monitor-psp')?monitor({
   resumo:{...monitor().resumo,quarentenaAguardandoVinculo:1}
  }):estado()});
 const x=await diagnosticarCadeia({env,fetchImpl:remote});
 assert.equal(x.estado,'PENDENCIAS_OPERACIONAIS_REVISAR');
 assert.equal(x.quarentenaAguardandoVinculo,1);
 assert.equal(x.quarentenaDivergente,0);
 const inconsistente=monitor({resumo:{...monitor().resumo,
  quarentenaAguardandoVinculo:1,quarentenaDivergente:2}});
 assert.throws(()=>validarMonitor(inconsistente),
  /SONDA_QUARENTENA_INCONSISTENTE/);
});
