'use strict';
// Snapshot cifrado SQLite WAL -> bucket S3 Railway -> download -> restauracao
// isolada. Mesma origem da loja/PSP/motor. Nenhuma chave, CPF, URL ou nome
// de cliente sai em log ou retorna na API. Somente PREVIA DE HOMOLOGACAO.
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {envio}=require('../../scripts/validar-backup-offsite-checkout-staging');
const {assinarObjetoS3Lab,validarConfig}=
 require('./s3-url-assinada-backup-lab');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const DIA=24*60*60*1000;
function criarAgendadorBackupOffsiteLab({
 fonteSqlite,raizVolume='/dados-preview',senha,config,
 intervaloMs=DIA,limiteBytes=512*1024*1024,
 buscar=fetch,agendar=setInterval,cancelar=clearInterval,agora=()=>new Date(),
 uuid=randomUUID,onErro=()=>{}
}={}){
 if(process.env.NODE_ENV==='production')
  falha('BACKUP_PREVIA_PROIBIDO_PRODUCAO');
 if(typeof fonteSqlite!=='string'||typeof raizVolume!=='string'||
    !path.isAbsolute(fonteSqlite)||!path.isAbsolute(raizVolume)||
    path.relative(path.resolve(raizVolume),path.resolve(fonteSqlite)).startsWith('..')||
    !fonteSqlite.endsWith('.sqlite')||typeof senha!=='string'||
    senha.length<32||typeof buscar!=='function'||typeof agendar!=='function'||
    typeof cancelar!=='function'||typeof agora!=='function'||
    typeof uuid!=='function'||typeof onErro!=='function'||
    !Number.isSafeInteger(intervaloMs)||intervaloMs<3600000||
    intervaloMs>7*DIA||!Number.isSafeInteger(limiteBytes)||
    limiteBytes<1024*1024||limiteBytes>512*1024*1024)
  falha('BACKUP_OFFSITE_CONFIG_INVALIDA');
 const cfg=validarConfig(config);
 let timer=null,emExecucao=null,encerrado=false,rodadas=0,falhas=0;
 let ultimaConfirmacao=null,ultimoCodigo='NAO_EXECUTADO';
 function estado(){
  return {habilitado:timer!==null&&!encerrado,
   emExecucao:emExecucao!==null,
   copiasVerificadasNoProcesso:rodadas,
   falhasNoProcesso:falhas,ultimaConfirmacao,
   ultimoEstado:ultimoCodigo,periodicidadeMs:intervaloMs,
   copiaOffsiteHistoricaComprovada:rodadas>0,
   restauracaoIsoladaHistoricaComprovada:rodadas>0,
   recuperacaoRegionalIndependente:false,
   caixaRealConciliado:false,marcoZeroAprovado:false};
 }
 async function executarUmaVez(){
  if(encerrado)return {estado:'ENCERRADO'};
  if(emExecucao!==null)return {estado:'EM_ANDAMENTO'};
  const operacao=Promise.resolve().then(async()=>{
   const data=agora();
   if(!(data instanceof Date)||Number.isNaN(data.getTime()))
    falha('BACKUP_RELOGIO_INVALIDO');
   const id=uuid();
   if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))
    falha('BACKUP_ID_INVALIDO');
   const key='staging/'+data.toISOString().slice(0,10)+'/'+id+'.loopbak';
   const uploadUrl=assinarObjetoS3Lab({
    config,method:'PUT',key,data,duracaoSegundos:900
   });
   const downloadUrl=assinarObjetoS3Lab({
    config,method:'GET',key,data,duracaoSegundos:900
   });
   const host=cfg.host;
   const r=await envio({
    fonteSqlite,senha,uploadUrl,downloadUrl,host,
    fetchImpl:buscar,autorizado:true,maxBytes:limiteBytes
   });
   if(r.estado!=='COPIA_CRIPTOGRAFADA_ENVIADA_LIDA_E_RESTAURADA'||
      r.copiaOffsiteVerificada!==true||
      r.restauracaoIsoladaValidada!==true)
    falha('BACKUP_OFFSITE_NAO_COMPROVADO');
   return {sha256:r.sha256Cifrado,bytes:r.bytesRecebidos,
    quando:data.toISOString()};
  });
  emExecucao=operacao;
  try{
   const r=await operacao;
   rodadas++;ultimoCodigo='OFFSITE_CIFRADO_LIDO_E_RESTAURADO';
   ultimaConfirmacao={quando:r.quando,bytes:r.bytes,
    integridadeCifradaSha256:r.sha256};
   return {estado:'OFFSITE_CIFRADO_LIDO_E_RESTAURADO',
    copiaOffsiteComprovada:true,restauracaoIsoladaComprovada:true,
    bancoOriginalNaoModificado:true,
    dinheiroRealGerado:false};
  }catch(_e){
   falhas++;ultimoCodigo='BACKUP_REQUER_VERIFICACAO';
   try{onErro('BACKUP_OFFSITE_REQUER_VERIFICACAO');}catch{}
   return {estado:ultimoCodigo,copiaOffsiteComprovada:false,
    restauracaoIsoladaComprovada:false,dinheiroRealGerado:false};
  }finally{
   if(emExecucao===operacao)emExecucao=null;
  }
 }
 function iniciar(){
  if(encerrado)falha('AGENDADOR_BACKUP_ENCERRADO');
  if(timer!==null)return estado();
  timer=agendar(()=>{void executarUmaVez();},intervaloMs);
  if(typeof timer?.unref==='function')timer.unref();
  // Inaugura a evidência e verifica a recuperação ANTES do próximo dia.
  void executarUmaVez();
  return estado();
 }
 async function encerrar(){
  if(encerrado)return;
  encerrado=true;
  if(timer!==null){cancelar(timer);timer=null;}
  if(emExecucao!==null){
   try{await emExecucao;}catch{}
  }
 }
 return {iniciar,executarUmaVez,encerrar,estado};
}
module.exports={criarAgendadorBackupOffsiteLab};
