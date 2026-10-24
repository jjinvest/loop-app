'use strict';
// AKITEMM: R2 privado via API S3. Nunca expor chaves no navegador, SQL ou logs.
// Ativação EXPLÍCITA apenas com variáveis do servidor. A ausência delas
// mantém 100% do fluxo de laboratório SQLite inalterado.
const {createHash,createHmac,randomUUID}=require('node:crypto');
const h=(k,x)=>createHmac('sha256',k).update(x).digest();
const hash=b=>createHash('sha256').update(b).digest('hex');
function configuracaoR2(env=process.env){
 const keys=['AKITEMM_R2_ACCOUNT_ID','AKITEMM_R2_ACCESS_KEY_ID',
  'AKITEMM_R2_SECRET_ACCESS_KEY','AKITEMM_R2_BUCKET'];
 if(keys.every(k=>!env[k]))return null;
 if(keys.some(k=>!env[k]))throw new Error('AKITEMM_R2_CONFIG_INCOMPLETA');
 const accountId=env.AKITEMM_R2_ACCOUNT_ID;
 const accessKeyId=env.AKITEMM_R2_ACCESS_KEY_ID;
 const secretAccessKey=env.AKITEMM_R2_SECRET_ACCESS_KEY;
 const bucket=env.AKITEMM_R2_BUCKET;
 if(!/^[a-f0-9]{32}$/.test(accountId)||
    !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId)||
    typeof secretAccessKey!=='string'||secretAccessKey.length<16||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
  throw new Error('AKITEMM_R2_CONFIG_INVALIDA');
 return {accountId,accessKeyId,secretAccessKey,bucket};
}
function criarR2Privado({config,fetchFn=fetch,agora=()=>new Date()}={}){
 if(!config)throw new TypeError('Configuracao R2 ausente');
 const conf=configuracaoR2({
  AKITEMM_R2_ACCOUNT_ID:config.accountId,AKITEMM_R2_ACCESS_KEY_ID:config.accessKeyId,
  AKITEMM_R2_SECRET_ACCESS_KEY:config.secretAccessKey,AKITEMM_R2_BUCKET:config.bucket
 });
 const host=conf.accountId+'.r2.cloudflarestorage.com';
 const novaChave=tipo=>{
  if(!['FOTO','VIDEO'].includes(tipo))throw new TypeError('TIPO_R2_INVALIDO');
  const ext=tipo==='FOTO'?'bin':'mp4';
  return 'akitemm/avaliacoes/'+randomUUID()+'/'+randomUUID()+'.'+ext;
 };
 async function requisitar({metodo,chave,dados=null,mime=null}){
  if(!/^[a-zA-Z0-9_./-]{15,220}$/.test(chave)||
    !chave.startsWith('akitemm/avaliacoes/')||chave.includes('..'))
   throw new TypeError('CHAVE_R2_INVALIDA');
  if(!['PUT','GET','DELETE'].includes(metodo))throw new TypeError('METODO_R2_INVALIDO');
  if(metodo==='PUT'&&(!Buffer.isBuffer(dados)||!mime||dados.length>26*1024*1024))
   throw new TypeError('DADOS_R2_INVALIDOS');
  const uri='/'+conf.bucket+'/'+chave;
  const date=agora().toISOString().replace(/[:-]|\.\d{3}/g,'');
  const dataCurta=date.slice(0,8);
  const body=metodo==='PUT'?dados:Buffer.alloc(0);
  const payloadHash=hash(body);
  const headers={
   host,
   'x-amz-content-sha256':payloadHash,
   'x-amz-date':date
  };
  if(metodo==='PUT')headers['content-type']=mime;
  const signedHeaders=Object.keys(headers).sort().join(';');
  const canonicalHeaders=Object.entries(headers).sort(([a],[b])=>a.localeCompare(b))
   .map(([k,v])=>k+':'+v+'\n').join('');
  const canonical=[metodo,uri,'',canonicalHeaders,signedHeaders,payloadHash].join('\n');
  const scope=dataCurta+'/auto/s3/aws4_request';
  const stringSign=['AWS4-HMAC-SHA256',date,scope,hash(canonical)].join('\n');
  const secret=h(h(h(h('AWS4'+conf.secretAccessKey,dataCurta),'auto'),'s3'),'aws4_request');
  const assinatura=h(secret,stringSign).toString('hex');
  const authorization='AWS4-HMAC-SHA256 Credential='+conf.accessKeyId+'/'+scope+
   ', SignedHeaders='+signedHeaders+', Signature='+assinatura;
  const url='https://'+host+uri;
  let resposta;
  try{
   resposta=await fetchFn(url,{
    method:metodo,headers:{...headers,Authorization:authorization},
    ...(metodo==='PUT'?{body}:{}) ,
    redirect:'error',signal:AbortSignal.timeout(25000)
   });
  }catch{throw new Error('AKITEMM_R2_INDISPONIVEL');}
  if(!resposta.ok)throw new Error('AKITEMM_R2_INDISPONIVEL');
  return resposta;
 }
 return {
  configurado:true,
  novaChave,
  async enviar(chave,dados,mime){
   await requisitar({metodo:'PUT',chave,dados,mime});
   return {chave,bytes:dados.length};
  },
  async obter(chave){
   const r=await requisitar({metodo:'GET',chave});
   const len=Number(r.headers.get('content-length')||0);
   if(len>26*1024*1024)throw new Error('AKITEMM_R2_ARQUIVO_GRANDE');
   const dados=Buffer.from(await r.arrayBuffer());
   if(dados.length>26*1024*1024)throw new Error('AKITEMM_R2_ARQUIVO_GRANDE');
   return dados;
  },
  async apagar(chave){await requisitar({metodo:'DELETE',chave});}
 };
}
module.exports={configuracaoR2,criarR2Privado};
