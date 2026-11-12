'use strict';
// Prova HTTPS de administracao protegida. Unico GET, sem POST,
 // sem tokens em logs e sem gravar dados da conta/PSP.
const {validarConfig}=require('./diagnosticar-asaas-motor-preview-readonly');
const ORIGEM='https://akitemm-escritorio-preview-homologacao.up.railway.app';
async function executar({env=process.env,fetchImpl=globalThis.fetch}={}){
 validarConfig(env);
 if(typeof fetchImpl!=='function')throw Error('MANUTENCAO_HTTP_INVALIDO');
 const authorization='Basic '+Buffer.from(
  'operador:'+env.LOOP_PREVIEW_SENHA_ADMIN).toString('base64');
 let r;
 try{
  r=await fetchImpl(ORIGEM+
   '/staging/escritorio-unificado/manutencao/diagnostico',{
    method:'GET',cache:'no-store',redirect:'error',
    headers:{Authorization:authorization,Accept:'application/json',
     'Cache-Control':'no-store'},signal:AbortSignal.timeout(12000)
   });
 }catch{throw Error('MANUTENCAO_HTTPS_NAO_CONFIRMADA');}
 if(r.status!==200)throw Error('MANUTENCAO_HTTP_'+r.status);
 let d;
 try{d=await r.json();}catch{throw Error('MANUTENCAO_JSON_INVALIDO');}
 const estados=new Set(['SEM_ANOMALIAS_OBSERVADAS',
  'PENDENCIAS_A_CONCILIAR','REVISAO_HUMANA',
  'BLOQUEADO_INTEGRIDADE','PSP_NAO_DISPONIVEL',
  'MOTOR_AGUARDANDO_PRIMEIRO_USO']);
 const m=d?.integridade;
 if(d?.ambiente!=='HOMOLOGACAO_SEM_FINANCEIRO_REAL'||
    !estados.has(d.estado)||d.consultaSomenteLeitura!==true||
    d.pspReconsultadoNestaLeitura!==false||
    d.escritasExecutadas!==0||d.financeiroReal!==false||
    !Array.isArray(d.divergencias)||d.divergencias.length>20||
    !m||typeof m.sqliteOk!=='boolean'||
    !Number.isSafeInteger(m.fksInconsistentes)||
    !Number.isSafeInteger(m.titularesInconsistentes)||
    !Number.isSafeInteger(m.pspInconsistentes)||
    d.acoesPermitidas?.editarRegistroFinanceiroDiretamente!==false||
    d.acoesPermitidas?.liberarPagamentosReais!==false)
  throw Error('MANUTENCAO_CONTRATO_INSEGURO');
 if(d.estado==='BLOQUEADO_INTEGRIDADE'||
    !m.sqliteOk||m.fksInconsistentes>0||
    m.titularesInconsistentes>0||m.pspInconsistentes>0)
  throw Error('MANUTENCAO_ESTRUTURAL_BLOQUEADA');
 return {
  origem:'PAINEL_ADMIN_PROTEGIDO_MESMO_SQLITE',
  leituraSomenteGet:true,estado:d.estado,
  sqliteIntegro:m.sqliteOk,
  motorPersistido:m.motorSnapshotValidado===true,
  pendenciasConciliaveis:d.pendenciasConciliaveis,
  webhooksEmQuarentena:d.webhooksEmQuarentena,
  motorCorrompido:false,pspExternoConsultadoNestaLeitura:false,
  dinheiroReal:false
 };
}
if(require.main===module)executar().then(r=>
 process.stdout.write('LOOP_MANUTENCAO_ADMIN_HTTPS='+JSON.stringify(r)+'\n')
).catch(e=>{
 const codigo=String(e.message||'MANUTENCAO_INCONCLUSIVA')
  .replace(/[^A-Z0-9_]/g,'').slice(0,90);
 process.stderr.write('LOOP_MANUTENCAO_ADMIN_HTTPS='+codigo+'\n');
 process.exitCode=1;
});
module.exports={executar};
