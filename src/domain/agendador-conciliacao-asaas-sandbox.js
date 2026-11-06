'use strict';
// Integração do PSP de HOMOLOGAÇÃO no mesmo processo que possui o SQLite.
// A inbox é durável: se houver reinício, os avisos novos seguem pendentes.
// O agendador somente consulta o provedor e reconcilia o motor de ensaio;
// NUNCA cria cobrança, valor sacável ou habilita operação comercial.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function criarAgendadorConciliacaoSandbox({
 executar,intervaloMs=30000,limite=20,
 agendar=setInterval,cancelar=clearInterval,onErro=()=>{}
}={}){
 if(process.env.NODE_ENV==='production')
  falha('AGENDADOR_SANDBOX_PROIBIDO_PRODUCAO');
 if(typeof executar!=='function'||typeof agendar!=='function'||
    typeof cancelar!=='function'||typeof onErro!=='function'||
    !Number.isSafeInteger(intervaloMs)||intervaloMs<15000||
    intervaloMs>3600000||!Number.isSafeInteger(limite)||limite<1||limite>20)
  falha('AGENDADOR_SANDBOX_CONFIG_INVALIDA');
 let timer=null,emExecucao=null,encerrado=false,encerramento=null;
 let rodadas=0,falhas=0,ultimaConclusao=null;
 function estado(){
  return {habilitado:timer!==null&&!encerrado,
   emExecucao:emExecucao!==null,rodadas,falhas,
   ultimaConclusao,limitePorRodada:limite,
   intervaloMs,pagamentosReais:false,saquesReais:false};
 }
 async function executarUmaVez(){
  if(encerrado)return {estado:'ENCERRADO'};
  // Mesmo que dois ticks ou chamadas manuais cheguem juntos, este
  // processo nunca abre duas reconsultas automáticas simultâneas.
  if(emExecucao!==null)return {estado:'EM_ANDAMENTO'};
  const operacao=Promise.resolve().then(()=>executar(limite));
  emExecucao=operacao;
  try{
   const resultado=await operacao;
   rodadas++;
   ultimaConclusao='CONCLUIDA';
   return {estado:'CONCLUIDA',consultados:resultado.consultados??0,
    pendentesRestantes:resultado.pendentesRestantes??null,
    pagamentosReais:false,saquesReais:false};
  }catch(_e){
   falhas++;
   ultimaConclusao='EXIGE_VERIFICACAO';
   // Não serializar stack, credenciais, identificadores ou retorno PSP.
   try{onErro('CONCILIACAO_SANDBOX_NAO_CONCLUIDA');}catch(_ignorar){}
   return {estado:'EXIGE_VERIFICACAO',
    pagamentosReais:false,saquesReais:false};
  }finally{
   if(emExecucao===operacao)emExecucao=null;
  }
 }
 function iniciar(){
  if(encerrado)falha('AGENDADOR_SANDBOX_ENCERRADO');
  if(timer!==null)return estado();
  timer=agendar(()=>{void executarUmaVez();},intervaloMs);
  if(typeof timer?.unref==='function')timer.unref();
  // Reconcilia avisos duráveis eventualmente anteriores a reinícios.
  void executarUmaVez();
  return estado();
 }
 function encerrar(){
  // Duas chamadas simultaneas de encerramento devem esperar a MESMA
  // operacao ativa antes de qualquer chamador fechar o SQLite.
  if(encerramento!==null)return encerramento;
  encerrado=true;
  if(timer!==null){cancelar(timer);timer=null;}
  const operacaoAtiva=emExecucao;
  encerramento=(async()=>{
   if(operacaoAtiva!==null){
    try{await operacaoAtiva;}catch(_ignorar){}
   }
  })();
  return encerramento;
 }
 return {iniciar,executarUmaVez,encerrar,estado};
}
module.exports={criarAgendadorConciliacaoSandbox};
