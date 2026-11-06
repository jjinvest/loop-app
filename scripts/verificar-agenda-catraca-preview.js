'use strict';
// Verifica a tela real e o mesmo SQLite da agenda por HTTPS somente GET.
// Nunca grava config, cria Pix, contabiliza evento ou efetua giro.
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
function err(c){const e=new Error(c);e.codigo=c;throw e;}
async function verificar({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app'||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  err('AGENDA_HTTP_AMBIENTE_NAO_AUTORIZADO');
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 async function get(rota,txt=false){
  let res;
  try{res=await fetchImpl(BASE+rota,{
   method:'GET',redirect:'error',
   headers:{Authorization:auth,Accept:txt?'text/javascript':'application/json'},
   signal:AbortSignal.timeout(10000)
  });}catch{err('AGENDA_HTTP_REDE_INCONCLUSIVA');}
  if(res.status!==200)err('AGENDA_HTTP_'+res.status);
  try{return txt?await res.text():await res.json();}
  catch{err('AGENDA_HTTP_RESPOSTA_INVALIDA');}
 }
 const [r,a,jsAdmin,jsCliente]=await Promise.all([
  get('/staging/escritorio-unificado/motor/estado'),
  get('/staging/escritorio-unificado/motor/agenda'),
  get('/staging/assets/admin.js',true),
  get('/staging/assets/cliente.js',true)
 ]);
 if(!r.laboratorio||r.dinheiroReal!==false||
    a.fuso!=='America/Sao_Paulo'||
    a.abertura!=='09:00'||a.fechamento!=='18:00'||
    a.intervaloMinutos!==10||a.ativo!==false||
    a.modoExecucao!=='MANUAL'||
    a.metaLotes?.quantidade!==0||
    a.metaLotes?.ativa!==false||
    a.comprasNaoInventadas!==true||
    JSON.stringify(r.agenda)!==JSON.stringify(a)||
    !jsAdmin.includes('agendaMotorMetaQuantidade')||
    !jsAdmin.includes('agendaMotorMetaDia')||
    !jsAdmin.includes('agendaMotorModo')||
    !jsAdmin.includes('formLiberarLoteMotor')||
    !jsAdmin.includes('/motor/agenda')||
    !jsCliente.includes('aguardandoContabilizacao')||
    !jsCliente.includes('modoExecucao')||
    !jsCliente.includes('setInterval'))
  err('AGENDA_HTTP_TELA_OU_SQLITE_DIVERGENTE');
 return {
  horarioPadrao:'09:00-18:00',
  fuso:'America/Sao_Paulo',intervaloMinutos:10,
  excecaoHorarioLivre:true,pausaManualDisponivel:true,
  metaLivreDeCentrosPorHorario:true,
  metaInicialDesativada:true,
  modoInicialSeguro:'MANUAL',
  vendasContinuamDurantePausa:true,
  telaAdminELuzesClienteConectadas:true,
  ativacaoInicialSegura:true,
  operacoesPOST:0,novasCompras:0,novosGiros:0,
  dinheiroReal:false
 };
}
if(require.main===module)verificar().then(r=>{
 process.stdout.write('LOOP_AGENDA_CATRACA_HTTP='+JSON.stringify(r)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_AGENDA_CATRACA_HTTP='+
  String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'').slice(0,95)+'\n');
 process.exitCode=1;
});
module.exports={verificar};