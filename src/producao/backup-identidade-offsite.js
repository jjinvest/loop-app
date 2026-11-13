'use strict';
// Envio cifrado para bucket S3 privado EXCLUSIVO da identidade real.
// Não compartilhar bucket, credenciais ou chaves com o laboratório.
// Uma prova positiva exige PUT, GET, hash idêntico e restore isolado.
// Não habilita transações reais nem substitui backup conjunto comercial.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {createHmac,createHash,randomUUID}=require('node:crypto');
const {criarBackupIdentidadeReal,restaurarBackupIdentidadeReal}=
 require('./backup-identidade-real');
const {provarChavesRecuperacao}=require('./prova-chaves-recuperacao');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const h=(k,x,enc)=>createHmac('sha256',k).update(x).digest(enc);
const sha=s=>createHash('sha256').update(s).digest('hex');
const esc=s=>encodeURIComponent(s).replace(/[!'()*]/g,
 c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function validarConfig(config){
 const {endpoint,bucket,accessKeyId,secretAccessKey,region='auto'}=config||{};
 let base;
 try{base=new URL(endpoint);}catch{falha('OFFSITE_REAL_CONFIG_INVALIDA');}
 if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||
    base.username||base.password||base.port||
    !/^[a-z0-9.-]+$/.test(base.hostname)||
    base.hostname==='localhost'||base.hostname.endsWith('.localhost')||
    !/^[a-z0-9-]{3,63}$/.test(bucket||'')||
    bucket==='loop-backup-offsite'||
    typeof accessKeyId!=='string'||accessKeyId.length<4||
    typeof secretAccessKey!=='string'||secretAccessKey.length<16||
    !/^[a-z0-9-]{2,30}$/.test(region))
  falha('OFFSITE_REAL_CONFIG_INVALIDA');
 return {host:bucket+'.'+base.hostname,accessKeyId,secretAccessKey,region};
}
function assinarObjetoS3Real({
 config,key,method,agora=new Date(),segundos=600
}={}){
 const {host,accessKeyId,secretAccessKey,region}=validarConfig(config);
 // Provas vazias de armazenamento usam prefixo isolado e autorizam limpeza.
 // A exclusão NUNCA pode atingir objetos reais de backup de clientes.
 const backup=typeof key==='string'&&
  /^clientes\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.looprealbak$/.test(key);
 const preparacao=typeof key==='string'&&
  /^preparacao\/[0-9a-f-]{36}\.probe$/.test(key);
 if(!(backup&&['PUT','GET'].includes(method)||
      preparacao&&['PUT','GET','DELETE'].includes(method))||
    !(agora instanceof Date)||!Number.isFinite(agora.getTime())||
    !Number.isSafeInteger(segundos)||segundos<30||segundos>900)
  falha('OFFSITE_REAL_CHAVE_INVALIDA');
 const stamp=agora.toISOString().replace(/[-:]|\.\d{3}/g,'');
 const day=stamp.slice(0,8);
 const scope=day+'/'+region+'/s3/aws4_request';
 const uri='/'+key.split('/').map(esc).join('/');
 const params={
  'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
  'X-Amz-Credential':accessKeyId+'/'+scope,
  'X-Amz-Date':stamp,'X-Amz-Expires':String(segundos),
  'X-Amz-SignedHeaders':'host'
 };
 const query=Object.entries(params).map(([k,v])=>esc(k)+'='+esc(v)).sort().join('&');
 const canonical=[method,uri,query,'host:'+host+'\n','host',
  'UNSIGNED-PAYLOAD'].join('\n');
 const toSign=['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n');
 const signing=h(h(h(h('AWS4'+secretAccessKey,day),region),'s3'),'aws4_request');
 return 'https://'+host+uri+'?'+query+'&X-Amz-Signature='+
  h(signing,toSign,'hex');
}
async function fileHash(nome){
 const digest=createHash('sha256');
 for await(const block of fs.createReadStream(nome))digest.update(block);
 return digest.digest('hex');
}
async function enviarBackupOffsiteIdentidade({
 fonteSqlite,chaveBackup,config,buscar=fetch,agora=()=>new Date(),
 id=randomUUID,maxBytes=512*1024*1024,
 exigirProvaChaves=false,chavesRecuperacao=null
}={}){
 if(typeof fonteSqlite!=='string'||typeof buscar!=='function'||
    typeof agora!=='function'||typeof id!=='function'||
    !Buffer.isBuffer(chaveBackup)||chaveBackup.length!==32||
    !Number.isSafeInteger(maxBytes)||maxBytes<1024*1024||
    maxBytes>512*1024*1024)
  falha('OFFSITE_REAL_NAO_CONFIGURADO');
 validarConfig(config);
 const data=agora(),uuid=id();
 if(!(data instanceof Date)||Number.isNaN(data.getTime())||
    typeof uuid!=='string'||!/^[0-9a-f-]{36}$/.test(uuid))
  falha('OFFSITE_REAL_IDENTIFICACAO_INVALIDA');
 const key='clientes/'+data.toISOString().slice(0,10)+'/'+uuid+'.looprealbak';
 const urlPut=assinarObjetoS3Real({config,key,method:'PUT',agora:data});
 const urlGet=assinarObjetoS3Real({config,key,method:'GET',agora:data});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-offsite-'));
 fs.chmodSync(tmp,0o700);
 const backup=path.join(tmp,'copia.looprealbak');
 const baixado=path.join(tmp,'baixado.looprealbak');
 const restaurado=path.join(tmp,'recuperado.sqlite');
 try{
  const local=await criarBackupIdentidadeReal({
   origem:fonteSqlite,destino:backup,chaveBackup,autorizado:true
  });
  const tamanho=fs.statSync(backup).size;
  if(tamanho>maxBytes)falha('OFFSITE_REAL_CAPACIDADE_EXCEDIDA');
  let res;
  try{
   res=await buscar(urlPut,{
    method:'PUT',redirect:'error',duplex:'half',
    headers:{'Content-Type':'application/octet-stream',
     'Content-Length':String(tamanho),'If-None-Match':'*'},
    body:fs.createReadStream(backup),signal:AbortSignal.timeout(120000)
   });
  }catch{falha('OFFSITE_REAL_UPLOAD_INDETERMINADO');}
  if(!res||![200,201,204].includes(res.status))
   falha('OFFSITE_REAL_UPLOAD_NAO_COMPROVADO');
  try{
   res=await buscar(urlGet,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(120000)
   });
  }catch{falha('OFFSITE_REAL_DOWNLOAD_FALHOU');}
  if(!res||res.status!==200||!res.body)
   falha('OFFSITE_REAL_DOWNLOAD_FALHOU');
  const cabe=res.headers?.get?.('content-length');
  if(cabe!==null&&cabe!==undefined&&(!/^\d+$/.test(cabe)||
     Number(cabe)>maxBytes))falha('OFFSITE_REAL_DOWNLOAD_ACIMA_DO_LIMITE');
  let recebidos=0;
  const limitar=new Transform({
   transform(chunk,_enc,callback){
    recebidos+=chunk.length;
    callback(recebidos>maxBytes?
     Object.assign(new Error('OFFSITE_REAL_DOWNLOAD_ACIMA_DO_LIMITE'),{
      codigo:'OFFSITE_REAL_DOWNLOAD_ACIMA_DO_LIMITE'
     }):null,chunk);
   }
  });
  try{
   await pipeline(Readable.fromWeb(res.body),limitar,
    fs.createWriteStream(baixado,{flags:'wx',mode:0o600}));
  }catch{falha('OFFSITE_REAL_DOWNLOAD_INCOMPLETO');}
  if(recebidos!==tamanho||
     await fileHash(baixado)!==local.sha256Cifrado)
   falha('OFFSITE_REAL_INTEGRIDADE_DIVERGENTE');
  const prova=await restaurarBackupIdentidadeReal({
   origem:baixado,destino:restaurado,chaveBackup,autorizado:true
  });
  if(prova.integridadeSQLite!=='ok'||[
    'contas','pedidos','linhasCustos','remessas','cotacoes',
    'recuperacaoComercialIncluida','administracaoIncluida'
   ].some(k=>prova[k]!==local[k]))
   falha('OFFSITE_REAL_RESTAURACAO_DIVERGENTE');
  const chaves=exigirProvaChaves?
   provarChavesRecuperacao({arquivo:restaurado,chaves:chavesRecuperacao}):null;
  if(chaves&&(
     chaves.contasLidas!==local.contas||
     chaves.pedidosLidos!==local.pedidos||
     chaves.remessasLidas!==local.remessas||
     chaves.cotacoesLidas!==local.cotacoes))
   falha('OFFSITE_REAL_LEITURA_DIVERGENTE');
  return {estado:'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO',
   manifestoIndependente:{
    chaveObjeto:key,sha256Cifrado:local.sha256Cifrado,bytes:recebidos,
    contas:prova.contas,pedidos:local.pedidos,
    linhasCustos:local.linhasCustos,remessas:local.remessas,
    cotacoes:local.cotacoes,
    administracaoIncluida:local.administracaoIncluida,
    recuperacaoComercialIncluida:local.recuperacaoComercialIncluida
   },
   sha256Cifrado:local.sha256Cifrado,bytes:recebidos,contas:prova.contas,
   semPIIEmRelatorio:true,integridadeSQLite:'ok',
   copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
   sessaoAntigaNaoRessuscita:true,
   recuperacaoComercialIncluida:local.recuperacaoComercialIncluida,
   pedidos:local.pedidos,linhasCustos:local.linhasCustos,
   remessas:local.remessas,cotacoes:local.cotacoes,
   chavesDeLeituraVerificadas:chaves?.chavesDeLeituraVerificadas===true,
   auditoriaHmacVerificada:chaves?.trilhaAdminVerificada===true,
   custodiaExternaIndependenteComprovada:false,
   conciliacaoPspBancoComprovada:false,
   recuperacaoOutraRegiaoComprovada:false,backupFinanceiro:false,
   rpoRtoContratualmenteGarantidos:false,checkoutRealHabilitado:false};
 }catch(e){
  // Falhar com código controlado, jamais revelar URL assinada ou segredos.
  if(e.codigo)throw e;
  falha('OFFSITE_REAL_INCONCLUSIVO');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={validarConfig,assinarObjetoS3Real,enviarBackupOffsiteIdentidade};
