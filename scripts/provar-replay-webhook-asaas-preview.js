'use strict';
// Teste EXTERNO de replay controlado, não é retransmissão pelo Asaas.
// Usa cobrança PIX que o PSP Sandbox já confirmou, mas não cria outra.
// Exercita HTTPS público de webhook com token separado da API Key; valida
// deduplicação do mesmo event.id e idempotência por prepedido no motor.
const {randomBytes,createHash}=require('node:crypto');
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const PREVIA='https://'+DOMINIO;
const PSP='https://api-sandbox.asaas.com/v3';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarAmbiente(env){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    env.LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!==DOMINIO)
  falha('REPLAY_SANDBOX_NAO_AUTORIZADO');
 const k=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY,
  t=env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN,
  p=env.LOOP_PREVIEW_SENHA_ACESSO;
 if(typeof k!=='string'||!k.startsWith('$aact_hmlg_')||
    k.length<25||/\s/.test(k)||
    typeof t!=='string'||t.length<32||t.length>255||
    /\s/.test(t)||t===k||
    typeof p!=='string'||p.length<24)
  falha('REPLAY_SANDBOX_CREDENCIAIS_INVALIDAS');
}
function resumoMotor(m){
 if(!m||m.laboratorio!==true||m.dinheiroReal!==false||
    m.autorizacaoComercial!==false||m.posicoesReais!==0||
    !Array.isArray(m.filaA)||!Array.isArray(m.filaB)||
    !Array.isArray(m.tabuleiro?.vagas)||m.tabuleiro.vagas.length!==6)
  falha('REPLAY_MOTOR_RESPOSTA_INVALIDA');
 const pos=[...m.filaA,...m.filaB,m.tabuleiro.centro,
  ...m.tabuleiro.vagas].filter(Boolean);
 if(pos.length!==1||!Number.isSafeInteger(pos[0].numero)||pos[0].numero<1||
    new Set(pos.map(p=>p.numero)).size!==pos.length)
  falha('REPLAY_ESTADO_BASE_NAO_ISOLADO');
 const snapshot={filaA:m.filaA,filaB:m.filaB,tabuleiro:m.tabuleiro,
  catraca:m.catraca,ordemAlimentacao:m.ordemAlimentacao};
 return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
function selecionarCobranca(dados){
 const pagamentos=Array.isArray(dados?.data)?dados.data:null;
 if(!pagamentos||pagamentos.length>100||dados?.hasMore===true)
  falha('REPLAY_LISTA_PSP_INCONCLUSIVA');
 const candidatos=pagamentos.filter(p=>
  typeof p?.id==='string'&&/^[A-Za-z0-9_-]{5,90}$/.test(p.id)&&
  typeof p?.externalReference==='string'&&
  /^LOOPLAB-hom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.externalReference)&&
  p.billingType==='PIX'&&p.status==='RECEIVED'&&p.value===250);
 if(candidatos.length!==1)falha('REPLAY_COBRANCA_UNICA_NAO_COMPROVADA');
 return {id:candidatos[0].id,ref:candidatos[0].externalReference};
}
async function provarReplayWebhook({
 env=process.env,fetchImpl=globalThis.fetch,
 idFactory=()=>randomBytes(16).toString('hex')
}={}){
 validarAmbiente(env);
 if(typeof fetchImpl!=='function'||typeof idFactory!=='function')
  falha('REPLAY_DEPENDENCIAS_INVALIDAS');
 const basic='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 const pspKey=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY;
 const webhookToken=env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN;
 async function req(host,rota,method='GET',body=null,extra={}){
  const headers={Accept:'application/json',...extra,
   ...(body!==null?{'Content-Type':'application/json'}:{})};
  let resposta;
  try{resposta=await fetchImpl(host+rota,{method,redirect:'error',
   headers, ...(body!==null?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(10000)});}
  catch(_e){falha('REPLAY_HTTP_REDE_INCONCLUSIVA');}
  if(resposta.status!==200)falha('REPLAY_HTTP_'+resposta.status);
  try{return await resposta.json();}
  catch(_e){falha('REPLAY_JSON_INVALIDO');}
 }
 const motor=async()=>req(PREVIA,'/staging/escritorio-unificado/motor/estado',
  'GET',null,{Authorization:basic});
 const antes=resumoMotor(await motor());
 const lista=await req(PSP,'/payments?limit=100','GET',null,{
  access_token:pspKey,'User-Agent':'LoopV6-Sandbox/1.0'
 });
 const p=selecionarCobranca(lista);
 const id1=idFactory(),id2=idFactory();
 if(!/^[a-f0-9]{32}$/.test(id1)||!/^[a-f0-9]{32}$/.test(id2)||id1===id2)
  falha('REPLAY_IDS_DE_ENSAIO_INVALIDOS');
 const postar=async id=>req(PREVIA,'/webhooks/asaas-sandbox-unificado',
  'POST',{id:'evt_loopreplay_'+id,event:'PAYMENT_RECEIVED',payment:{
   id:p.id,externalReference:p.ref,billingType:'PIX',status:'RECEIVED',value:250
  }},{'asaas-access-token':webhookToken});
 // Evento 1: entrega inicial mais três redeliveries com MESMO event.id.
 const inicial=await postar(id1);
 if(inicial.eventoRegistrado!==true||inicial.repetido!==false||
    inicial.posicoesCriadas!==0||inicial.financasReais!==false)
  falha('REPLAY_PRIMEIRO_EVENTO_INDETERMINADO');
 const repetidos=await Promise.all([postar(id1),postar(id1),postar(id1)]);
 if(repetidos.some(r=>r.repetido!==true||r.eventoRegistrado!==false||
    r.posicoesCriadas!==0||r.financasReais!==false))
  falha('REPLAY_MESMO_EVENTO_DUPLICOU');
 // Evento 2: id DIFERENTE, MESMA cobrança já quitada e mesmo pedido.
 // Um segundo evento legítimo também jamais pode abrir outra posição.
 const outro=await postar(id2);
 if(outro.eventoRegistrado!==true||outro.repetido!==false||
    outro.posicoesCriadas!==0||outro.financasReais!==false)
  falha('REPLAY_OUTRO_EVENTO_INDETERMINADO');
 const outroRepetido=await postar(id2);
 if(outroRepetido.eventoRegistrado!==false||outroRepetido.repetido!==true)
  falha('REPLAY_OUTRO_EVENTO_DUPLICADO');
 const reconciliado=await req(PREVIA,
  '/staging/escritorio-unificado/reconciliar-pendentes-sandbox',
  'POST',{limite:20},{Authorization:basic});
 if(reconciliado.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    reconciliado.errosDeProcessamento!==0||
    reconciliado.pendentesRestantes!==0||
    reconciliado.saquesReais!==0||reconciliado.posicoesComerciais!==0)
  falha('REPLAY_CONCILIACAO_NAO_COMPROVADA');
 const depois=resumoMotor(await motor());
 if(depois!==antes)falha('REPLAY_MOTOR_MUTOU_OU_DUPLICOU');
 const monitor=await req(PREVIA,
  '/staging/escritorio-unificado/monitor-psp','GET',null,
  {Authorization:basic});
 if(monitor.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    monitor.saquesReais!==0||monitor.pagamentosReais!==0||
    monitor.posicoesReais!==0||monitor.consultaPSPExecutadaNestaLeitura!==false)
  falha('REPLAY_MONITOR_NAO_CONFIRMADO');
 return Object.freeze({
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  tipo:'REPLAY_HTTP_CONTROLADO_NAO_REENTREGA_REAL_PSP',
  entregasHTTP:6,eventosDistintos:2,
  repeticoesMesmoId:4,repeticoesConfirmadas:4,
  posicoesAntes:1,posicoesDepois:1,estadoMotorIdêntico:true,
  conciliacaoPSPConcluida:true,semNovaCobranca:true,
  saquesReais:0,posicoesComerciais:0,marcoZeroAprovado:false
 });
}
if(require.main===module)provarReplayWebhook().then(r=>
 process.stdout.write('LOOP_REPLAY_WEBHOOK_HTTPS='+JSON.stringify(r)+'\n')
).catch(e=>{
 process.stderr.write('LOOP_REPLAY_WEBHOOK_HTTPS='+
  String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'').slice(0,85)+'\n');
 process.exitCode=1;
});
module.exports={validarAmbiente,resumoMotor,selecionarCobranca,provarReplayWebhook};