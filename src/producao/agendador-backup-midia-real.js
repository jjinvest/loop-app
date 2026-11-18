'use strict';
// Custódia independente do catálogo real AKITEMM. Não libera checkout.
const DIA=86400000,FRESCOR=26*3600000;
function falha(c){const e=Error(c);e.codigo=c;throw e;}
function criarAgendadorBackupMidiaReal({
 executar,intervaloMs=DIA,agendar=setInterval,cancelar=clearInterval,
 agora=()=>Date.now()
}={}){
 if(typeof executar!=='function'||typeof agendar!=='function'||
    typeof cancelar!=='function'||typeof agora!=='function'||
    !Number.isSafeInteger(intervaloMs)||intervaloMs<3600000||
    intervaloMs>7*DIA)falha('AGENDADOR_MIDIA_CONFIG_INVALIDA');
 let timer=null,rodando=null,terminado=false,ultimoOk=null,copias=0,falhas=0;
 let estadoAtual='AINDA_NAO_COMPROVADO',ultimaProva=null;
 const estado=()=>{
  const t=agora(),idade=ultimoOk===null?NaN:t-ultimoOk;
  return Object.freeze({
   backupAtualEmDia:estadoAtual==='CONFIRMADO'&&
    Number.isFinite(idade)&&idade>=0&&idade<=FRESCOR,
   estado:estadoAtual,copiasVerificadas:copias,falhas,
   emExecucao:rodando!==null,
   produtosMidia:ultimaProva?.produtosMidia||0,
   fotosAtuais:ultimaProva?.fotosAtuais||0,
   pdfAtuais:ultimaProva?.pdfAtuais||0,
   checkoutReal:false
  });
 };
 async function executarUmaVez(){
  if(terminado)falha('AGENDADOR_MIDIA_ENCERRADO');
  if(rodando)return rodando;
  rodando=(async()=>{
   try{
    const r=await executar();
    if(r?.estado!=='OFFSITE_MIDIA_CIFRADA_BAIXADA_RESTAURADA'||
       r.copiaExternaConfirmada!==true||
       r.restauracaoIsoladaConfirmada!==true||
       r.integridadeSQLite!=='ok')
     falha('AGENDADOR_MIDIA_BACKUP_INCOMPLETO');
    const t=agora();
    if(!Number.isSafeInteger(t)||t<=0)falha('AGENDADOR_MIDIA_RELOGIO_INVALIDO');
    ultimoOk=t;copias++;estadoAtual='CONFIRMADO';ultimaProva=r;
    return {estado:'OFFSITE_MIDIA_CONFIRMADO',restauracaoComprovada:true,
     checkoutReal:false};
   }catch{
    falhas++;estadoAtual='FALHOU';ultimaProva=null;
    return {estado:'OFFSITE_MIDIA_NAO_COMPROVADO',
     restauracaoComprovada:false,checkoutReal:false};
   }finally{rodando=null;}
  })();
  return rodando;
 }
 async function iniciar(){
  if(terminado)falha('AGENDADOR_MIDIA_ENCERRADO');
  const prova=await executarUmaVez();
  if(prova.restauracaoComprovada!==true)
   falha('AGENDADOR_MIDIA_PRIMEIRA_COPIA_NAO_COMPROVADA');
  if(!timer){
   timer=agendar(()=>{void executarUmaVez();},intervaloMs);
   timer?.unref?.();
  }
  return estado();
 }
 async function encerrar(){
  terminado=true;
  if(timer){cancelar(timer);timer=null;}
  if(rodando)await rodando;
 }
 return {iniciar,executarUmaVez,estado,encerrar};
}
module.exports={criarAgendadorBackupMidiaReal};
