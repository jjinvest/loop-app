'use strict';
// Agendador da identidade REAL: primeira cópia offsite comprovada ANTES de
// aceitar o primeiro cadastro. Erros futuros suspendem readiness e exigem
// intervenção; nunca encobrir falha com sucesso antigo.
// Sem credenciais, PII, URL S3, IDs ou outros segredos no relatório.
const DIA=24*60*60*1000,FRESCOR=26*60*60*1000;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function criarAgendadorBackupIdentidadeReal({
 executar,intervaloMs=DIA,exigirProvaChaves=false,
 agendar=setInterval,cancelar=clearInterval,agora=()=>Date.now()
}={}){
 if(typeof executar!=='function'||typeof agendar!=='function'||
    typeof cancelar!=='function'||typeof agora!=='function'||
    !Number.isSafeInteger(intervaloMs)||intervaloMs<3600000||
    intervaloMs>7*DIA)falha('AGENDADOR_IDENTIDADE_REAL_INVALIDO');
 let timer=null,rodando=null,terminado=false,ultimoOk=null;
 let falhas=0,copias=0,ultimoEstado='AINDA_NAO_INICIADO';
 let ultimaProvaChaves=false;
 function estado(){
  const now=agora();
  const idade=ultimoOk===null?NaN:now-ultimoOk;
  return {backupAtualEmDia:ultimoEstado==='CONFIRMADO'&&
   Number.isFinite(idade)&&idade>=0&&idade<=FRESCOR,
   ultimaTentativaFalhou:ultimoEstado==='FALHOU',
   ultimoEstado,contagemCopiasVerificadas:copias,
   contagemFalhas:falhas,emExecucao:rodando!==null,
   emOperacao:timer!==null&&!terminado,
   recuperacaoMultirregionalProvada:false,
   chavesDeLeituraVerificadas:ultimoEstado==='CONFIRMADO'&&
    ultimaProvaChaves,
   backupFinanceiroConfirmado:false};
 }
 async function executarUmaVez(){
  if(terminado)falha('AGENDADOR_IDENTIDADE_REAL_ENCERRADO');
  if(rodando)return rodando;
  rodando=(async()=>{
   try{
    const prova=await executar();
    if(prova?.estado!=='OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO'||
       prova.copiaExternaConfirmada!==true||
       prova.restauracaoIsoladaConfirmada!==true||
       (exigirProvaChaves&&prova.chavesDeLeituraVerificadas!==true))
     falha('OFFSITE_IDENTIDADE_NAO_COMPROVADO');
    const ms=agora();
    if(!Number.isSafeInteger(ms)||ms<=0)
     falha('RELOGIO_IDENTIDADE_INVALIDO');
    copias++;ultimoOk=ms;ultimoEstado='CONFIRMADO';
    ultimaProvaChaves=prova.chavesDeLeituraVerificadas===true;
    return {estado:'OFFSITE_REAL_IDENTIDADE_CONFIRMADO',
     copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
     caixaRealLiberado:false};
   }catch{
    falhas++;ultimoEstado='FALHOU';ultimaProvaChaves=false;
    return {estado:'OFFSITE_IDENTIDADE_REQUER_VERIFICACAO',
     copiaExternaConfirmada:false,restauracaoIsoladaConfirmada:false,
     caixaRealLiberado:false};
   }finally{rodando=null;}
  })();
  return rodando;
 }
 async function iniciar(){
  if(terminado)falha('AGENDADOR_IDENTIDADE_REAL_ENCERRADO');
  const prova=await executarUmaVez();
  // Sem primeiro backup verificado NÃO aceitar cadastro real na aplicação.
  if(prova.copiaExternaConfirmada!==true)
   falha('BACKUP_OFFSITE_REAL_AINDA_NAO_PROVADO');
  if(timer===null){
   timer=agendar(()=>{void executarUmaVez();},intervaloMs);
   if(typeof timer?.unref==='function')timer.unref();
  }
  return estado();
 }
 async function encerrar(){
  terminado=true;
  if(timer!==null){cancelar(timer);timer=null;}
  if(rodando)await rodando;
 }
 return {iniciar,executarUmaVez,estado,encerrar};
}
module.exports={criarAgendadorBackupIdentidadeReal};
