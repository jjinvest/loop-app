'use strict';
// Audita somente GET da homologacao. Nunca cria cobrancas ou eventos.
async function diagnosticar({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app'||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24||
    env.NODE_ENV==='production')
  throw Error('DIAGNOSTICO_GIRO_AMBIENTE_NAO_AUTORIZADO');
 const base='https://akitemm-escritorio-preview-homologacao.up.railway.app';
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 async function get(path){
  const r=await fetchImpl(base+path,{method:'GET',redirect:'error',
   headers:{Authorization:auth,Accept:'application/json'},
   signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('DIAGNOSTICO_GIRO_HTTP_'+r.status);
  return r.json();
 }
 const [rel,motor]=await Promise.all([
  get('/staging/escritorio-unificado'),
  get('/staging/escritorio-unificado/motor/estado')
 ]);
 if(rel.semDinheiroReal!==true||motor.dinheiroReal!==false||
    motor.laboratorio!==true||motor.tabuleiro?.vagas?.length!==6)
  throw Error('DIAGNOSTICO_GIRO_ESTADO_NAO_HOMOLOGADO');
 const aptos=(rel.pedidos||[]).filter(p=>
  p.conferenciaPSPConcluida===true&&
  p.exigeRevisaoManual===false&&
  p.ultimoStatusPSP==='RECEIVED'&&
  Number.isSafeInteger(p.posicoesMotorEnsaio)&&p.posicoesMotorEnsaio>0
 );
 const exclusivos=new Set(aptos.map(p=>p.prepedidoId));
 return {semEscrita:true,pedidosNaAmostra:(rel.pedidos||[]).length,
  totalPedidos:rel.resumo?.prepedidosStaging??null,
  recebimentosPSPConciliados:rel.resumo?.recebimentosPSPConciliados??null,
  candidatosDistintosNaAmostra:exclusivos.size,
  seisComprovadosNaAmostra:exclusivos.size>=6,
  statusDaAmostra:(rel.pedidos||[]).map(p=>({
   pspReconsultado:p.conferenciaPSPConcluida===true,
   pspRecebido:p.ultimoStatusPSP==='RECEIVED',
   revisao:p.exigeRevisaoManual===true,
   posicoesAptas:p.posicoesFicticiasAptasAgora??null,
   posicoesNoMotor:p.posicoesMotorEnsaio??null,
   status:p.estadoOperacional
  })),
  eventosNoCiclo:motor.tabuleiro.eventosNoCiclo,
  girosDoMotor:motor.catraca.giros,
  tabuleiroOcupado:[motor.tabuleiro.centro,...motor.tabuleiro.vagas]
   .filter(Boolean).length,
  giroReal:0,creditosReais:0};
}
if(require.main===module)diagnosticar().then(x=>{
 process.stdout.write('LOOP_DIAGNOSTICO_GIRO='+JSON.stringify(x)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_DIAGNOSTICO_GIRO='+String(e.message)
  .replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');process.exitCode=1;
});
module.exports={diagnosticar};