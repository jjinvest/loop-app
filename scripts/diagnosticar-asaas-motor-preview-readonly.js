'use strict';
// Sonda externa SOMENTE GET da cadeia: gateway HTTPS -> monitor de PSP
// -> mesma instancia do motor. Nunca aciona cobrança, conciliação ou giro.
const {assinaturaMotor}=require('./provar-persistencia-reinicio-preview-railway');
const ORIGEM='https://akitemm-escritorio-preview-homologacao.up.railway.app';
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const DOMINIOS_PUBLICOS_PERMITIDOS=new Set([DOMINIO,'akitemmloop.com.br']);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const rotas=new Set(['/readyz',
 '/staging/escritorio-unificado/monitor-psp',
 '/staging/escritorio-unificado/motor/estado']);
function validarConfig(env){
 if(env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    (env.RAILWAY_PUBLIC_DOMAIN&&
     !DOMINIOS_PUBLICOS_PERMITIDOS.has(env.RAILWAY_PUBLIC_DOMAIN))||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24||
    typeof env.LOOP_PREVIEW_SENHA_ADMIN!=='string'||
    env.LOOP_PREVIEW_SENHA_ADMIN.length<24||
    env.LOOP_PREVIEW_SENHA_ADMIN===env.LOOP_PREVIEW_SENHA_ACESSO)
  erro('SONDA_CONFIGURACAO_NAO_AUTORIZADA');
}
function validarMonitor(m){
 const campos=['pendentes','processando','exigeRevisao','total',
  'vinculosMotorAusentes','reversoesMotorPendentes',
  'quarentenaAguardandoVinculo','quarentenaDivergente'];
 if(m?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    m.somenteLaboratorio!==true||
    m.consultaPSPExecutadaNestaLeitura!==false||
    m.pagamentosReais!==0||m.saquesReais!==0||
    m.posicoesReais!==0||
    !m.resumo||!m.recuperacaoPSP)
  erro('SONDA_MONITOR_FONTE_INVALIDA');
 for(const campo of campos){
  const n=m.resumo[campo];
  if(!Number.isSafeInteger(n)||n<0)
   erro('SONDA_CONTADORES_INVALIDOS');
 }
 if(m.resumo.total!==m.resumo.pendentes+
   m.resumo.processando+m.resumo.exigeRevisao)
  erro('SONDA_CONTADORES_INCONSISTENTES');
 if(m.resumo.quarentenaDivergente>m.resumo.quarentenaAguardandoVinculo)
  erro('SONDA_QUARENTENA_INCONSISTENTE');
 const recuperacao={};
 for(const campo of ['processando','retomaveis','segundaFalha']){
  const n=m.recuperacaoPSP[campo];
  if(!Number.isSafeInteger(n)||n<0)
   erro('SONDA_RECUPERACAO_INVALIDA');
  recuperacao[campo]=n;
 }
 // Não devolver fila com IDs ou dados do PSP.
 const resumo=Object.fromEntries(campos.map(k=>[k,m.resumo[k]]));
 return {resumo,recuperacao};
}
async function diagnosticarCadeia({
 env=process.env,fetchImpl=globalThis.fetch
}={}){
 validarConfig(env);
 if(typeof fetchImpl!=='function')erro('SONDA_HTTP_NAO_DISPONIVEL');
 const credencial=(operador)=>'Basic '+Buffer.from(
  (operador?'operador:'+env.LOOP_PREVIEW_SENHA_ADMIN:
   'acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO)).toString('base64');
 async function consultar(rota){
  if(!rotas.has(rota))erro('SONDA_ROTA_NAO_AUTORIZADA');
  const admin=rota!=='/readyz';
  let resposta;
  try{
   resposta=await fetchImpl(ORIGEM+rota,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{Authorization:credencial(admin),Accept:'application/json',
     'Cache-Control':'no-store'},
    signal:AbortSignal.timeout(12000)
   });
  }catch(_e){erro('SONDA_REDE_NAO_COMPROVADA');}
  if(resposta.status!==200)erro(admin?'SONDA_ADMIN_HTTP_'+resposta.status:
   'SONDA_READY_HTTP_'+resposta.status);
  try{return await resposta.json();}
  catch(_e){erro('SONDA_JSON_INVALIDO');}
 }
 const [ready,monitor,motor]=await Promise.all([
  consultar('/readyz'),
  consultar('/staging/escritorio-unificado/monitor-psp'),
  consultar('/staging/escritorio-unificado/motor/estado')
 ]);
 if(ready.estado!=='BANCO_DE_ENSAIO_APTO'||
    ready.marcoZeroLiberado!==false||ready.financeiroReal!==false)
  erro('SONDA_PRONTIDAO_INVALIDA');
 const {resumo,recuperacao}=validarMonitor(monitor);
 const estadoMotor=assinaturaMotor(motor);
 const bloqueios=resumo.pendentes+resumo.processando+
  resumo.exigeRevisao+resumo.vinculosMotorAusentes+
  resumo.reversoesMotorPendentes+
  resumo.quarentenaAguardandoVinculo+recuperacao.segundaFalha;
 return {
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  leituraSomenteGet:true,
  gatewayReadiness:true,
  motorPersistente:true,
  posicoesMotor:estadoMotor.posicoes,
  filaA:estadoMotor.filaA,
  filaB:estadoMotor.filaB,
  ocupadas:estadoMotor.ocupadas,
  girouNoEnsaio:estadoMotor.giros>0,
  pendentesPSP:resumo.pendentes,
  processandoPSP:resumo.processando,
  exigemRevisaoPSP:resumo.exigeRevisao,
  pedidosSemVinculoMotor:resumo.vinculosMotorAusentes,
  reversoesMotorPendentes:resumo.reversoesMotorPendentes,
  quarentenaAguardandoVinculo:resumo.quarentenaAguardandoVinculo,
  quarentenaDivergente:resumo.quarentenaDivergente,
  retornadasDeInterrupcao:recuperacao.retomaveis,
  reincidenciasInterrupcao:recuperacao.segundaFalha,
  estado:bloqueios>0?'PENDENCIAS_OPERACIONAIS_REVISAR':'SEM_PENDENCIAS_OBSERVADAS',
  // GET não aciona Asaas nem comprova novas entregas do webhook.
  webhookRecebidoNestaSonda:false,
  transacoesReais:false,creditosReais:0,saquesReais:0
 };
}
if(require.main===module)diagnosticarCadeia().then(res=>
 process.stdout.write('LOOP_CADEIA_ASAAS_MOTOR_READONLY='+JSON.stringify(res)+'\n')
).catch(e=>{
 const codigo=String(e.codigo||'SONDA_INCONCLUSIVA')
  .replace(/[^A-Z0-9_]/g,'').slice(0,90);
 process.stderr.write('LOOP_CADEIA_ASAAS_MOTOR_READONLY='+codigo+'\n');
 process.exitCode=1;
});
module.exports={diagnosticarCadeia,validarMonitor,validarConfig};
