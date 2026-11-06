'use strict';
// Exercício isolado no container temporário de pre-deploy: apenas GET no S3
// privado de homologação e restauracao em diretório efêmero 0700.
// NÃO toca no volume ativo e NÃO altera dados comerciais ou segredos.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHmac,createHash,hkdfSync}=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Readable,Transform}=require('node:stream');
const {DatabaseSync}=require('node:sqlite');
const {validarConfig,assinarObjetoS3Lab}=
 require('../src/domain/s3-url-assinada-backup-lab');
const {restaurarBackupCriptografado}=
 require('./backup-criptografado-checkout-staging');
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const BASE='https://'+DOMINIO;
const maxBytes=64*1024*1024;
function fail(code){const error=new Error(code);error.codigo=code;throw error;}
function escapar(s){
 return encodeURIComponent(s).replace(/[!'()*]/g,
  c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
}
const h=(key,value,encoding)=>createHmac('sha256',key).update(value).digest(encoding);
const sha=s=>createHash('sha256').update(s).digest('hex');
function assinarLista({config,prefix,data=new Date()}={}){
 const {host,accessKeyId,secretAccessKey,region}=validarConfig(config);
 if(typeof prefix!=='string'||!/^staging\/\d{4}-\d{2}-\d{2}\/$/.test(prefix)||
    !(data instanceof Date)||Number.isNaN(data.getTime()))
  fail('DR_LISTA_CONFIG_INVALIDA');
 const stamp=data.toISOString().replace(/[-:]|\.\d{3}/g,'');
 const date=stamp.slice(0,8),scope=date+'/'+region+'/s3/aws4_request';
 const params={
  'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
  'X-Amz-Credential':accessKeyId+'/'+scope,
  'X-Amz-Date':stamp,'X-Amz-Expires':'120','X-Amz-SignedHeaders':'host',
  'list-type':'2','max-keys':'1000',prefix
 };
 const query=Object.entries(params).map(([k,v])=>
  escapar(k)+'='+escapar(v)).sort().join('&');
 const canonical=['GET','/',query,'host:'+host+'\n','host',
  'UNSIGNED-PAYLOAD'].join('\n');
 const toSign=['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n');
 const signing=h(h(h(h('AWS4'+secretAccessKey,date),region),'s3'),'aws4_request');
 return 'https://'+host+'/?'+query+'&X-Amz-Signature='+h(signing,toSign,'hex');
}
function ultimoObjeto(xml,prefix,agora=new Date()){
 if(typeof xml!=='string'||xml.length>800000||
    !xml.includes('<ListBucketResult')||
    /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml))
  fail('DR_LISTAGEM_INDETERMINADA');
 const candidates=[];
 for(const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
  const k=/<Key>([^<]+)<\/Key>/.exec(m[1])?.[1],
   t=/<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1],
   date=Date.parse(t||'');
  if(k?.startsWith(prefix)&&
     /^staging\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.loopbak$/.test(k)&&
     Number.isFinite(date)&&date<=agora.getTime()+60000)
   candidates.push({key:k,when:date});
 }
 if(!candidates.length)fail('DR_BACKUP_NAO_ENCONTRADO');
 candidates.sort((a,b)=>b.when-a.when);
 return candidates[0];
}
function validateEnv(env){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_OFFSITE_DR_TESTE!=='SIM'||
    env.LOOP_PREVIEW_BACKUP_OFFSITE_AUTO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!==DOMINIO)
  fail('DR_ISOLADO_NAO_AUTORIZADO');
 if(typeof env.LOOP_PREVIEW_SEGREDO_RAIZ!=='string'||
    env.LOOP_PREVIEW_SEGREDO_RAIZ.length<32||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  fail('DR_SEGREDOS_NAO_CONFIGURADOS');
 return validarConfig({
  endpoint:env.LOOP_BACKUP_S3_ENDPOINT,bucket:env.LOOP_BACKUP_S3_BUCKET,
  accessKeyId:env.LOOP_BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey:env.LOOP_BACKUP_S3_SECRET_ACCESS_KEY,
  region:env.LOOP_BACKUP_S3_REGION||'auto'
 });
}
async function medirRestauracaoOffsite({env=process.env,
 fetchImpl=globalThis.fetch,agora=()=>new Date(),
 restaurar=restaurarBackupCriptografado,criarDb=file=>new DatabaseSync(file,{readOnly:true})
}={}){
 const cfg=validateEnv(env);
 if(typeof fetchImpl!=='function'||typeof agora!=='function'||
    typeof restaurar!=='function'||typeof criarDb!=='function')
  fail('DR_COMPONENTES_INVALIDOS');
 const inicio=Date.now(),t=agora();
 if(!(t instanceof Date)||Number.isNaN(t.getTime()))fail('DR_RELOGIO_INVALIDO');
 const prefix='staging/'+t.toISOString().slice(0,10)+'/';
 const config={endpoint:env.LOOP_BACKUP_S3_ENDPOINT,
  bucket:env.LOOP_BACKUP_S3_BUCKET,
  accessKeyId:env.LOOP_BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey:env.LOOP_BACKUP_S3_SECRET_ACCESS_KEY,
  region:env.LOOP_BACKUP_S3_REGION||'auto'};
 const senha=Buffer.from(hkdfSync('sha256',
  Buffer.from(env.LOOP_PREVIEW_SEGREDO_RAIZ,'utf8'),
  Buffer.from('AKITEMM_PREVIA_NAO_COMERCIAL_2026'),
  Buffer.from('backup-s3-gcm'),32)).toString('hex');
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 let remoto;
 try{remoto=await fetchImpl(BASE+'/staging/escritorio-unificado/motor/estado',{
  method:'GET',headers:{Authorization:auth,Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(9000)
 });}catch{fail('DR_MOTOR_REMOTO_INDISPONIVEL');}
 if(remoto.status!==200)fail('DR_MOTOR_REMOTO_HTTP_'+remoto.status);
 let motor;
 try{motor=await remoto.json();}catch{fail('DR_MOTOR_REMOTO_INVALIDO');}
 if(motor?.laboratorio!==true||motor.dinheiroReal!==false||
    motor.posicoesReais!==0||motor.posicoesAtivasDoTitular!==0||
    !Array.isArray(motor.filaA)||!Array.isArray(motor.filaB))
  // Consulta do operador devolve posicoesAtivasDoTitular=0 por não ter titular.
  fail('DR_MOTOR_REMOTO_NAO_VALIDADO');
 const posicoesAtuais=[...motor.filaA,...motor.filaB,
  motor.tabuleiro?.centro,...(motor.tabuleiro?.vagas||[])].filter(Boolean).length;
 if(posicoesAtuais<1)fail('DR_SEM_POSICAO_NA_FONTE');
 let lista;
 try{lista=await fetchImpl(assinarLista({config,prefix,data:t}),{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)
 });}catch{fail('DR_LISTAGEM_S3_INDISPONIVEL');}
 if(lista.status!==200)fail('DR_LISTAGEM_S3_HTTP_'+lista.status);
 let xml;
 try{xml=await lista.text();}catch{fail('DR_LISTAGEM_S3_INVALIDA');}
 const escolhido=ultimoObjeto(xml,prefix,t);
 const idadeMin=Math.max(0,Math.ceil((t.getTime()-escolhido.when)/60000));
 if(idadeMin>180)fail('DR_BACKUP_ULTRAPASSOU_180_MINUTOS');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-dr-isolado-'));
 fs.chmodSync(tmp,0o700);
 const cipher=path.join(tmp,'remoto.loopbak'),
  restored=path.join(tmp,'restaurado.sqlite');
 try{
  const get=assinarObjetoS3Lab({config,key:escolhido.key,method:'GET',
   data:t,duracaoSegundos:300});
  let rsp;
  try{rsp=await fetchImpl(get,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(45000)});}
  catch{fail('DR_DOWNLOAD_INDISPONIVEL');}
  if(rsp.status!==200||!rsp.body)fail('DR_DOWNLOAD_NAO_COMPROVADO');
  const tamanho=rsp.headers?.get?.('content-length');
  if(tamanho!==null&&tamanho!==undefined&&
     (!/^\d+$/.test(tamanho)||Number(tamanho)>maxBytes))
   fail('DR_OBJETO_FORA_DO_LIMITE');
  let bytes=0;
  const limitar=new Transform({transform(chunk,_enc,cb){
   bytes+=chunk.length;
   if(bytes>maxBytes)return cb(new Error('overflow'));
   cb(null,chunk);
  }});
  try{await pipeline(Readable.fromWeb(rsp.body),limitar,
   fs.createWriteStream(cipher,{flags:'wx',mode:0o600}));}
  catch{fail('DR_DOWNLOAD_INCOMPLETO');}
  if(bytes<64)fail('DR_BACKUP_MUITO_PEQUENO');
  const resultado=await restaurar({
   origem:cipher,destino:restored,senha,autorizado:true
  });
  if(resultado.integridadeSQLite!=='ok'||
     resultado.destinoNaoSobrescrito!==true||
     resultado.identidadeCandidataAuditada!==true)
   fail('DR_RESTAURACAO_NAO_COMPROVADA');
  const db=criarDb(restored);
  let posicoesRecuperadas;
  try{
   posicoesRecuperadas=db.prepare(
    'SELECT COUNT(DISTINCT numero_posicao) AS n FROM akitemm_motor_ensaio_lotes_pedido'
   ).get().n;
   if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||
      db.prepare('PRAGMA foreign_key_check').all().length)
    fail('DR_RESTAURADO_DIVERGENTE');
  }finally{db.close();}
  if(posicoesRecuperadas!==posicoesAtuais)
   fail('DR_POSICOES_RECUPERADAS_DIVERGENTES');
  const rtoSec=Math.ceil((Date.now()-inicio)/1000);
  return {prova:'RESTAURO_OFFSITE_ISOLADO_PREDEPLOY',
   copiaNoS3Comprovada:true,restauracaoSQLiteIsolada:true,
   posicoesOrigem:posicoesAtuais,posicoesRestauradas:posicoesRecuperadas,
   idadeCopiaMin:idadeMin,tempoTesteRecuperacaoSeg:rtoSec,
   sessoesRestauradasValidas:0,escritasNaOrigem:0,
   recuperacaoEmOutraRegiaoComprovada:false,
   rpoGarantido:false,rtoGarantido:false,
   dinheiroReal:false,marcoZeroAprovado:false};
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
if(require.main===module)medirRestauracaoOffsite().then(r=>{
 process.stdout.write('LOOP_DR_OFFSITE='+JSON.stringify(r)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_DR_OFFSITE='+String(e.codigo||'INCONCLUSIVO')
  .replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');process.exitCode=1;
});
module.exports={assinarLista,ultimoObjeto,validateEnv,medirRestauracaoOffsite};