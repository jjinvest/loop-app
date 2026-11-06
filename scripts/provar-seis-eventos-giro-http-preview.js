'use strict';
// Seis PIX previamente confirmados no Asaas Sandbox; girar somente o
// MOTOR DE ENSAIO pela API autenticada do operador. Nenhuma cobranca nova.
async function provar({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_GIRO_E2E_EXECUTAR!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app'||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  throw Error('GIRO_SANDBOX_NAO_AUTORIZADO');
 const base='https://akitemm-escritorio-preview-homologacao.up.railway.app';
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 async function http(rota,body){
  const method=body===undefined?'GET':'POST';
  let r;try{r=await fetchImpl(base+rota,{method,redirect:'error',
   headers:{Authorization:auth,Accept:'application/json',
    ...(method==='POST'?{'Content-Type':'application/json'}:{})},
   ...(method==='POST'?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(13000)})}
  catch{throw Error('GIRO_SANDBOX_REDE_INDETERMINADA');}
  if(!r.ok)throw Error('GIRO_SANDBOX_HTTP_'+r.status);
  return r.json();
 }
 const state='/staging/escritorio-unificado/motor/estado';
 const cat='/staging/escritorio-unificado/motor/catraca';
 const event='/staging/escritorio-unificado/motor/evento';
 const [resumo,antes]=await Promise.all([
  http('/staging/escritorio-unificado'),http(state)
 ]);
 if(resumo.semDinheiroReal!==true||antes.laboratorio!==true||
    antes.dinheiroReal!==false||antes.tabuleiro?.eventosNoCiclo!==0||
    antes.catraca?.estado!=='PAUSADA')
  throw Error('GIRO_SANDBOX_CICLO_PREEXISTENTE_OU_INSEGURO');
 const aptos=(resumo.pedidos||[]).filter(p=>
  p.conferenciaPSPConcluida===true&&p.exigeRevisaoManual===false&&
  p.ultimoStatusPSP==='RECEIVED'&&p.posicoesMotorEnsaio>0);
 if(new Set(aptos.map(p=>p.prepedidoId)).size<6)
  throw Error('GIRO_SANDBOX_SEIS_COMPRAS_NAO_COMPROVADAS');
 const ids=[...new Set(aptos.map(p=>p.prepedidoId))].slice(0,6);
 let abriu=false,girou=false;
 try{
  const montagem=await http('/staging/escritorio-unificado/motor/preparar',{});
  if(montagem.preparado!==true||montagem.ocupadas!==7)
   throw Error('GIRO_SANDBOX_TABULEIRO_INCOMPLETO');
  const inicial=await http(state);
  if(!inicial.tabuleiro.centro||!inicial.tabuleiro.vagas.every(Boolean))
   throw Error('GIRO_SANDBOX_SETES_POSICOES_AUSENTES');
  const bloqueio=await http(cat,{acao:'GIRAR'});
  if(bloqueio.girou!==false||bloqueio.motivo!=='CATRACA_PAUSADA')
   throw Error('GIRO_SANDBOX_SEM_TRAVA');
  for(let i=0;i<6;i++){
   const r=await http(event,{prepedidoId:ids[i]});
   if(r.repetido!==false||r.eventosNoCiclo!==i+1||
      r.prontoParaGiro!==(i===5))
    throw Error('GIRO_SANDBOX_EVENTO_INVALIDO_'+(i+1));
   if(i===0){
    const repetido=await http(event,{prepedidoId:ids[i]});
    if(repetido.repetido!==true||repetido.eventosNoCiclo!==1)
     throw Error('GIRO_SANDBOX_DUPLICACAO_EVENTO');
   }
   if(i===4){
    await http(cat,{acao:'ABRIR'});abriu=true;
    const cedo=await http(cat,{acao:'GIRAR'});
    if(cedo.girou!==false||cedo.motivo!=='CICLO_INCOMPLETO')
     throw Error('GIRO_SANDBOX_GIRO_COM_CINCO_EVENTOS');
    await http(cat,{acao:'PAUSAR'});abriu=false;
   }
  }
  const travado=await http(cat,{acao:'GIRAR'});
  if(travado.girou!==false||travado.motivo!=='CATRACA_PAUSADA')
   throw Error('GIRO_SANDBOX_GIRO_SEM_LIBERACAO');
  await http(cat,{acao:'ABRIR'});abriu=true;
  const r=await http(cat,{acao:'GIRAR'});
  if(r.girou!==true)throw Error('GIRO_SANDBOX_GIRO_NAO_REALIZADO');
  girou=true;
  await http(cat,{acao:'PAUSAR'});abriu=false;
  const final=await http(state);
  if(final.catraca.giros!==antes.catraca.giros+1||
     final.tabuleiro.ciclosConcluidos!==antes.tabuleiro.ciclosConcluidos+1||
     final.tabuleiro.eventosNoCiclo!==0||
     final.tabuleiro.centro?.numero!==inicial.tabuleiro.vagas[0].numero||
     final.catraca.estado!=='PAUSADA'||
     final.dinheiroReal!==false||final.saldoRealCentavos!==null)
   throw Error('GIRO_SANDBOX_ESTADO_FINAL_DIVERGENTE');
  return {seisComprasPSPSandbox:true,eventosDistintos:6,
   duplicacaoBloqueada:true,cincoEventosNaoGiram:true,
   pausaRespeitada:true,girosEfetuados:1,
   centroAtualizado:true,catracaPausada:true,
   saldoRealCentavos:0,saquesReais:0};
 }finally{
  if(abriu){try{await http(cat,{acao:'PAUSAR'})}
   catch{process.stderr.write('GIRO_SANDBOX=PAUSA_REQUER_REVISAO\n');}}
  if(!girou)process.stderr.write('GIRO_SANDBOX=PROVA_INCOMPLETA_SEM_GIRO\n');
 }
}
if(require.main===module)provar().then(x=>{
 process.stdout.write('LOOP_SEIS_EVENTOS_GIRO_HTTPS='+JSON.stringify(x)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_SEIS_EVENTOS_GIRO_HTTPS='+String(e.message)
  .replace(/[^A-Z0-9_]/g,'').slice(0,95)+'\n');process.exitCode=1;
});
module.exports={provar};