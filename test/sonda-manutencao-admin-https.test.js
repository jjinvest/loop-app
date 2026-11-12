'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {executar}=require('../scripts/provar-manutencao-admin-readonly-https');
const env={
 LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SENHA_ACESSO:'AcessoFicticioLab'+('A'.repeat(44)),
 LOOP_PREVIEW_SENHA_ADMIN:'AdminFicticioLab'+('B'.repeat(44))
};
const ok=()=>({
 ambiente:'HOMOLOGACAO_SEM_FINANCEIRO_REAL',
 consultaSomenteLeitura:true,pspReconsultadoNestaLeitura:false,
 escritasExecutadas:0,financeiroReal:false,
 estado:'SEM_ANOMALIAS_OBSERVADAS',divergencias:[],
 integridade:{sqliteOk:true,fksInconsistentes:0,
  titularesInconsistentes:0,pspInconsistentes:0,
  motorSnapshotValidado:true,motorAindaNaoIniciado:false},
 pendenciasConciliaveis:0,webhooksEmQuarentena:0,
 acoesPermitidas:{editarRegistroFinanceiroDiretamente:false,
  liberarPagamentosReais:false}
});
test('GET HTTPS do operador retorna somente indicadores seguros',async()=>{
 const chamadas=[];
 const fake=async(url,opts)=>{
  chamadas.push({url,method:opts.method,headers:opts.headers});
  return {status:200,json:async()=>ok()};
 };
 const out=await executar({env,fetchImpl:fake});
 assert.equal(chamadas.length,1);
 assert.equal(chamadas[0].method,'GET');
 assert.ok(chamadas[0].url.includes('/manutencao/diagnostico'));
 assert.equal(Buffer.from(chamadas[0].headers.Authorization.slice(6),'base64')
  .toString(),'operador:'+env.LOOP_PREVIEW_SENHA_ADMIN);
 assert.equal(out.sqliteIntegro,true);
 assert.equal(out.pendenciasConciliaveis,0);
 assert.equal(out.dinheiroReal,false);
 assert.equal(JSON.stringify(out).includes(env.LOOP_PREVIEW_SENHA_ADMIN),false);
});
test('sem operador ou contrato inconsistente nao declara manutencao aprovada',async()=>{
 await assert.rejects(executar({env,fetchImpl:async()=>({status:401})}),
  /MANUTENCAO_HTTP_401/);
 await assert.rejects(executar({env,fetchImpl:async()=>({
  status:200,json:async()=>({...ok(),financeiroReal:true})
 })}),/MANUTENCAO_CONTRATO_INSEGURO/);
 await assert.rejects(executar({env,fetchImpl:async()=>({
  status:200,json:async()=>({...ok(),estado:'BLOQUEADO_INTEGRIDADE',
   divergencias:['MOTOR_INTEGRIDADE']})
 })}),/MANUTENCAO_ESTRUTURAL_BLOQUEADA/);
});
