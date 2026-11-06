'use strict';
// Prova EXTERNA read-only de persistencia do motor apos redeploy Railway.
// Executar ANTES e DEPOIS de reiniciar o mesmo volume (em dois predeploys);
// comparar os hashes sem revelar titulares, pedidos, CPF ou credenciais.
const {createHash}=require('node:crypto');
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const ROTAS=new Set(['/readyz','/staging/escritorio-unificado/motor/estado',
 '/staging/escritorio-unificado/monitor-psp']);
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function assertConfig(env){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!==DOMINIO||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM')
  fail('REINICIO_PREVIA_NAO_AUTORIZADA');
 if(typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  fail('REINICIO_AUTENTICACAO_INDISPONIVEL');
}
function assinaturaMotor(m){
 if(m?.laboratorio!==true||m.autorizacaoComercial!==false||
    m.dinheiroReal!==false||m.posicoesReais!==0||
    m.origem!=='MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA'||
    !Array.isArray(m.filaA)||!Array.isArray(m.filaB)||
    !Array.isArray(m.tabuleiro?.vagas)||m.tabuleiro.vagas.length!==6)
  fail('REINICIO_MOTOR_RESPOSTA_INVALIDA');
 const posicao=p=>{
  if(p===null)return null;
  if(!p||!Number.isSafeInteger(p.numero)||p.numero<1||
     typeof p.status!=='string')fail('REINICIO_POSICAO_INVALIDA');
  return {numero:p.numero,status:p.status,dourada:p.dourada===true};
 };
 const a=m.filaA.map(posicao),b=m.filaB.map(posicao);
 const centro=posicao(m.tabuleiro.centro);
 const vagas=m.tabuleiro.vagas.map(posicao);
 const todas=[...a,...b,centro,...vagas].filter(Boolean);
 if(new Set(todas.map(p=>p.numero)).size!==todas.length)
  fail('REINICIO_DUPLICIDADE_MOTOR');
 const conteudo={a,b,centro,vagas,
  ciclos:m.tabuleiro.ciclosConcluidos,
  eventos:m.tabuleiro.eventosNoCiclo,giros:m.catraca?.giros};
 const assinatura=createHash('sha256').update(JSON.stringify(conteudo)).digest('hex').slice(0,24);
 return {posicoes:todas.length,assinatura,giros:m.catraca?.giros,
  filaA:a.length,filaB:b.length,ocupadas:[centro,...vagas].filter(Boolean).length};
}
async function provarPersistenciaReinicio({
 env=process.env,fetchImpl=globalThis.fetch
}={}){
 assertConfig(env);
 if(typeof fetchImpl!=='function')fail('REINICIO_HTTP_INDISPONIVEL');
 const authorization='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 async function consultar(rota){
  if(!ROTAS.has(rota))fail('REINICIO_ROTA_NAO_AUTORIZADA');
  let resposta;
  try{resposta=await fetchImpl(BASE+rota,{method:'GET',redirect:'error',
   headers:{Authorization:authorization,Accept:'application/json','Cache-Control':'no-store'},
   signal:AbortSignal.timeout(12000)});}
  catch(_e){fail('REINICIO_REDE_INCONCLUSIVA');}
  if(resposta.status!==200)fail('REINICIO_HTTP_'+resposta.status);
  try{return await resposta.json();}catch(_e){fail('REINICIO_JSON_INVALIDO');}
 }
 const ready=await consultar('/readyz');
 if(ready.estado!=='BANCO_DE_ENSAIO_APTO'||ready.marcoZeroLiberado!==false||
    ready.financeiroReal!==false)fail('REINICIO_SQLITE_NAO_APTO');
 const motor=assinaturaMotor(await consultar('/staging/escritorio-unificado/motor/estado'));
 const psp=await consultar('/staging/escritorio-unificado/monitor-psp');
 if(psp.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    psp.somenteLaboratorio!==true||psp.consultaPSPExecutadaNestaLeitura!==false||
    psp.saquesReais!==0||psp.pagamentosReais!==0)
  fail('REINICIO_PSP_MONITOR_DIVERGENTE');
 if(motor.posicoes<1)fail('REINICIO_SEM_POSICAO_TESTE_PERSISTIDA');
 return {prova:'READ_ONLY_RESTART_CHECK',
  readyzApto:true,pspMonitorApto:true,
  posicoesMotor:motor.posicoes,assinaturaMotor:motor.assinatura,
  filaA:motor.filaA,filaB:motor.filaB,ocupadas:motor.ocupadas,
  dinheiroReal:false,saquesReais:0,
  comprovacaoReinicioCompleta:false};
}
if(require.main===module)provarPersistenciaReinicio().then(r=>
 process.stdout.write('LOOP_REINICIO_PREVIA_SNAPSHOT='+JSON.stringify(r)+'\n')
).catch(e=>{
 process.stderr.write('LOOP_REINICIO_PREVIA_SNAPSHOT='+String(e.codigo||'INCONCLUSIVO')
  .replace(/[^A-Z0-9_]/g,'').slice(0,85)+'\n');
 process.exitCode=1;
});
module.exports={provarPersistenciaReinicio,assinaturaMotor,assertConfig};