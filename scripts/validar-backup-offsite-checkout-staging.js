'use strict';
// Preparacao segura de backup offsite sob URLs assinadas de objeto.
// Nao cria bucket nem cobra serviços; nunca registra URLs ou segredos.
// Envia apenas snapshot AES-256-GCM cifrado e rebaixa para SQLite isolado.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {criarBackupCriptografado,restaurarBackupCriptografado}=
 require('./backup-criptografado-checkout-staging');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarUrl(raw,hostname){
 if(typeof raw!=='string'||raw.length<15||raw.length>4096||
    typeof hostname!=='string'||hostname.length>253||
    !/^[a-z0-9.-]+$/.test(hostname))falha('DESTINO_OFFSITE_INVALIDO');
 let u;
 try{u=new URL(raw);}catch{falha('DESTINO_OFFSITE_INVALIDO');}
 if(u.protocol!=='https:'||u.hostname!==hostname||u.port||
    u.username||u.password||u.hash||u.pathname==='/'||
    /^\/\//.test(u.pathname)||
    !/^[a-z0-9.-]+$/.test(u.hostname)||
    u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
    /^([0-9]+\.){3}[0-9]+$/.test(u.hostname))
  falha('DESTINO_OFFSITE_INVALIDO');
 return u.toString();
}
async function envio({fonteSqlite,senha,uploadUrl,downloadUrl,host,
 fetchImpl=fetch,autorizado=false,maxBytes=256*1024*1024}={}){
 if(process.env.NODE_ENV==='production'||autorizado!==true)
  falha('OFFSITE_STAGING_NAO_AUTORIZADO');
 if(typeof fonteSqlite!=='string'||!path.isAbsolute(fonteSqlite)||
    !fonteSqlite.endsWith('.sqlite')||!fs.existsSync(fonteSqlite))
  falha('ORIGEM_INVALIDA');
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(maxBytes)||
    maxBytes<1024*1024||maxBytes>512*1024*1024)
  falha('PARAMETROS_INVALIDOS');
 const put=validarUrl(uploadUrl,host),get=validarUrl(downloadUrl,host);
 // Evita conferir um objeto diferente do enviado; URLs assinadas podem
 // diferir na query, mas precisam apontar ao MESMO recurso.
 const recurso=u=>{const x=new URL(u);return x.origin+x.pathname;};
 if(recurso(put)!==recurso(get))falha('OBJETO_OFFSITE_DIVERGENTE');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-offsite-'));
 fs.chmodSync(dir,0o700);
 const cifrado=path.join(dir,'origem.loopbak');
 const remoto=path.join(dir,'recuperado.loopbak');
 const restaurado=path.join(dir,'isolado.sqlite');
 let enviados=0,recebidos=0,envioStream=null;
 try{
  const bkp=await criarBackupCriptografado({
   origem:fonteSqlite,destino:cifrado,senha,autorizado:true
  });
  if(bkp.tamanhoBytes>maxBytes)falha('BACKUP_ACIMA_LIMITE');
  // Sem retry para upload indeterminado. Nunca expor o signed URL.
  let resposta;
  try{
   envioStream=fs.createReadStream(cifrado);
   // O provedor pode negar o PUT sem consumir o body. Sempre fechar
   // o descritor antes de descartar o arquivo temporario.
   envioStream.on('error',()=>{});
   resposta=await fetchImpl(put,{method:'PUT',redirect:'error',
    headers:{'Content-Type':'application/octet-stream',
     'Content-Length':String(bkp.tamanhoBytes),
     // A URL assinada deve permitir escrita condicional S3. Nunca
     // substituir uma fotografia antiga por uma nova tentativa.
     'If-None-Match':'*'},
    body:envioStream,duplex:'half',
    signal:AbortSignal.timeout(120000)});
  }catch{falha('ENVIO_INDETERMINADO_NAO_REENVIAR');}
  if(resposta?.status===412)falha('BACKUP_OFFSITE_OBJETO_JA_EXISTE');
  // Sob corrida (409), nao fazer retry sobre o mesmo nome.
  if(resposta?.status===409)falha('BACKUP_OFFSITE_CONCORRENCIA');
  if(!resposta||resposta.status<200||resposta.status>=300)
   falha('ENVIO_OFFSITE_NAO_CONFIRMADO');
  enviados=bkp.tamanhoBytes;
  let download;
  try{
   download=await fetchImpl(get,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(120000)});
  }catch{falha('LEITURA_OFFSITE_INDISPONIVEL');}
  if(!download||download.status!==200||!download.body)
   falha('OBJETO_OFFSITE_NAO_RECUPERADO');
  const header=download.headers?.get?.('content-length');
  if(header!==null&&header!==undefined&&
     (!/^\d+$/.test(header)||Number(header)>maxBytes))
   falha('OBJETO_OFFSITE_EXCEDE_LIMITE');
  const hash=createHash('sha256');
  const limitar=new Transform({
   transform(chunk,_encoding,callback){
    recebidos+=chunk.length;
    if(recebidos>maxBytes)
     return callback(falha('OBJETO_OFFSITE_EXCEDE_LIMITE'));
    hash.update(chunk);callback(null,chunk);
   }
  });
  try{
   await pipeline(Readable.fromWeb(download.body),limitar,
    fs.createWriteStream(remoto,{flags:'wx',mode:0o600}));
  }catch(e){if(e?.codigo)throw e;falha('DOWNLOAD_OFFSITE_INTERROMPIDO');}
  if(recebidos!==enviados||hash.digest('hex')!==bkp.sha256)
   falha('BACKUP_OFFSITE_INTEGRO_NAO_COMPROVADO');
  const restored=await restaurarBackupCriptografado({
   origem:remoto,destino:restaurado,senha,autorizado:true
  });
  if(restored.integridadeSQLite!=='ok')falha('RESTAURACAO_SEM_INTEGRIDADE');
  return {
   estado:'COPIA_CRIPTOGRAFADA_ENVIADA_LIDA_E_RESTAURADA',
   bytesEnviados:enviados,bytesRecebidos:recebidos,
   sha256Cifrado:bkp.sha256,
   copiaOffsiteVerificada:true,
   restauracaoIsoladaValidada:true,
   restauracaoEmOutroProvedor:false,
   recuperacaoRegionalIndependente:false,
   prazoRecuperacaoGarantido:false,
   bancoOriginalNaoModificado:true,
   posicoesReaisCriadas:0,pagamentosReais:0,saquesReais:0
  };
 }finally{
  if(envioStream&&!envioStream.closed){
   await new Promise(resolve=>{
    envioStream.once('close',resolve);
    envioStream.destroy();
   });
  }
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
if(require.main===module){
 envio({
  fonteSqlite:process.env.LOOP_BACKUP_STAGING_ORIGEM,
  senha:process.env.LOOP_BACKUP_STAGING_SEGREDO,
  uploadUrl:process.env.LOOP_BACKUP_OFFSITE_UPLOAD_URL,
  downloadUrl:process.env.LOOP_BACKUP_OFFSITE_DOWNLOAD_URL,
  host:process.env.LOOP_BACKUP_OFFSITE_HOST,
  autorizado:process.env.LOOP_BACKUP_OFFSITE_AUTORIZADO==='SIM'
 }).then(x=>process.stdout.write('LOOP_BACKUP_OFFSITE='+
    JSON.stringify(x)+'\n'),
  e=>{process.stderr.write('LOOP_BACKUP_OFFSITE_BLOQUEADO='+
    (e.codigo||'FALHA_OPERACIONAL')+'\n');process.exitCode=1;});
}
module.exports={envio};
