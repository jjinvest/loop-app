'use strict';
// Verificação exclusiva do storage dedicado, adequada ao predeploy sem volume.
const {provarStoragePreparacaoReal}=
 require('../src/producao/prova-storage-preparacao-real');
async function executar(env=process.env){
 if(env.NODE_ENV!=='production'||
    env.LOOP_REAL_PREPARACAO_INTERNA!=='SIM'||
    env.LOOP_REAL_CADASTRO_GO!=='NAO'||
    env.LOOP_REAL_APROVACAO_DOCUMENTOS!=='NAO'||
    env.LOOP_REAL_DADOS_SEPARADOS!=='SIM')
  throw Error('STORAGE_PREPARACAO_REQUER_OPERACAO_FECHADA');
 const res=await provarStoragePreparacaoReal({config:{
  endpoint:env.LOOP_REAL_S3_ENDPOINT,
  bucket:env.LOOP_REAL_S3_BUCKET,
  region:env.LOOP_REAL_S3_REGION,
  accessKeyId:env.LOOP_REAL_S3_ACCESS_KEY_ID,
  secretAccessKey:env.LOOP_REAL_S3_SECRET_ACCESS_KEY
 }});
 if(res.limpezaComprovada!==true)
  throw Error('STORAGE_PREPARACAO_NAO_COMPROVADA');
 return res;
}
if(require.main===module)executar().then(()=>{
 console.log('LOOP_STORAGE_REAL=PUT_GET_HASH_E_LIMPEZA_COMPROVADOS');
}).catch(e=>{
 console.error('LOOP_STORAGE_REAL=FALHA_'+
  (/^[A-Z_]+$/.test(e?.codigo||'')?e.codigo:'NAO_COMPROVADA'));
 process.exitCode=1;
});
module.exports={executar};
