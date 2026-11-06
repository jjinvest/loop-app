'use strict';
// Presigner S3 SigV4 mínimo para o bucket PRIVADO Railway da homologação.
// Nenhuma credencial é transmitida ao navegador, URL assinada nunca é logada.
// Assina apenas host (como AWS GetObject/PutObject com payload unsigned).
const {createHmac,createHash}=require('node:crypto');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const h=(key,value,encoding)=>createHmac('sha256',key).update(value).digest(encoding);
const hash=x=>createHash('sha256').update(x).digest('hex');
function escapeAws(s){
 return encodeURIComponent(s).replace(/[!'()*]/g,
  c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
}
function validarConfig(config){
 const {endpoint,bucket,accessKeyId,secretAccessKey,region='auto'}=config||{};
 let base;
 try{base=new URL(endpoint);}catch{falha('S3_ENDPOINT_INVALIDO');}
 if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||
    base.username||base.password||base.port||
    !/^[a-z0-9.-]+$/.test(base.hostname)||
    base.hostname==='localhost'||base.hostname.endsWith('.localhost')||
    !/^[a-z0-9-]{3,63}$/.test(bucket||'')||bucket.includes('..')||
    typeof accessKeyId!=='string'||accessKeyId.length<4||
    typeof secretAccessKey!=='string'||secretAccessKey.length<16||
    typeof region!=='string'||!/^[a-z0-9-]{2,30}$/.test(region))
  falha('S3_CONFIG_INCOMPLETA');
 return {host:bucket+'.'+base.hostname,bucket,accessKeyId,secretAccessKey,region};
}
function assinarObjetoS3Lab({config,key,method,data=new Date(),duracaoSegundos=300}={}){
 const {host,accessKeyId,secretAccessKey,region}=validarConfig(config);
 if(!['PUT','GET'].includes(method)||typeof key!=='string'||
    !/^staging\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.loopbak$/.test(key)||
    !Number.isSafeInteger(duracaoSegundos)||duracaoSegundos<30||
    duracaoSegundos>900||!(data instanceof Date)||
    Number.isNaN(data.getTime()))
  falha('S3_ASSINATURA_DADOS_INVALIDOS');
 const stamp=data.toISOString().replace(/[-:]|\.\d{3}/g,'');
 const date=stamp.slice(0,8),scope=date+'/'+region+'/s3/aws4_request';
 const canonicalUri='/'+key.split('/').map(escapeAws).join('/');
 const params={
  'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
  'X-Amz-Credential':accessKeyId+'/'+scope,
  'X-Amz-Date':stamp,
  'X-Amz-Expires':String(duracaoSegundos),
  'X-Amz-SignedHeaders':'host'
 };
 const query=Object.entries(params).map(([k,v])=>
  escapeAws(k)+'='+escapeAws(v)).sort().join('&');
 const canonical=[method,canonicalUri,query,'host:'+host+'\n','host',
  'UNSIGNED-PAYLOAD'].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',stamp,scope,hash(canonical)].join('\n');
 const signing=h(h(h(h('AWS4'+secretAccessKey,date),region),'s3'),'aws4_request');
 const signature=h(signing,stringToSign,'hex');
 return 'https://'+host+canonicalUri+'?'+query+'&X-Amz-Signature='+signature;
}
module.exports={assinarObjetoS3Lab,validarConfig};
