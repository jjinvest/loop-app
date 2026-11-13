'use strict';
// Prova S3 real antes de ativar qualquer cadastro. Sem PII, banco, chaves de
// cliente, checkout ou valores comerciais. A limpeza jamais apaga backups.
const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const {assinarObjetoS3Real,validarConfig}=
 require('./backup-identidade-offsite');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
async function provarStoragePreparacaoReal({
 config,buscar=fetch,agora=()=>new Date(),id=randomUUID
}={}){
 validarConfig(config);
 if(typeof buscar!=='function'||typeof agora!=='function'||
    typeof id!=='function')falha('PROVA_STORAGE_PARAMETROS_INVALIDOS');
 const data=agora(),uuid=id();
 if(!(data instanceof Date)||!Number.isFinite(data.getTime())||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid))
  falha('PROVA_STORAGE_IDENTIFICADOR_INVALIDO');
 const chave='preparacao/'+uuid+'.probe';
 const url=method=>assinarObjetoS3Real({config,key:chave,method,agora:data,segundos:120});
 const dados=randomBytes(48);
 let criado=false,resultado=null;
 const rapido=()=>AbortSignal.timeout(15000);
 try{
  let r;
  try{
   r=await buscar(url('PUT'),{
    method:'PUT',redirect:'error',signal:rapido(),
    headers:{'If-None-Match':'*','Content-Type':'application/octet-stream'},
    body:dados
   });
  }catch{falha('PROVA_STORAGE_PUT_INDETERMINADO');}
  if(!r||![200,201,204].includes(r.status))
   falha('PROVA_STORAGE_PUT_NAO_COMPROVADO');
  criado=true;
  try{
   r=await buscar(url('GET'),{method:'GET',redirect:'error',signal:rapido()});
  }catch{falha('PROVA_STORAGE_GET_INDISPONIVEL');}
  if(!r||r.status!==200||!r.body)
   falha('PROVA_STORAGE_GET_INDISPONIVEL');
  const partes=[];let recebidos=0;
  try{
   for await(const p of r.body){
    recebidos+=p.length;
    if(recebidos>64)falha('PROVA_STORAGE_DOWNLOAD_INDEVIDO');
    partes.push(Buffer.from(p));
   }
  }catch(e){
   if(e?.codigo)throw e;
   falha('PROVA_STORAGE_GET_INCOMPLETO');
  }
  const origem=Buffer.concat(partes);
  if(origem.length!==dados.length||!timingSafeEqual(origem,dados))
   falha('PROVA_STORAGE_INTEGRIDADE_DIVERGENTE');
  resultado={estado:'STORAGE_REAL_PUT_GET_INTEGRIDADE_OK',
   comprovanteSemDadosPessoais:true,cadastroReal:false,
   checkoutReal:false,financeiroReal:false};
 }finally{
  if(criado){
   let limpeza;
   try{
    limpeza=await buscar(url('DELETE'),{
     method:'DELETE',redirect:'error',signal:rapido()
    });
   }catch{falha('PROVA_STORAGE_LIMPEZA_INDETERMINADA');}
   if(!limpeza||![200,202,204].includes(limpeza.status))
    falha('PROVA_STORAGE_LIMPEZA_NAO_COMPROVADA');
  }
 }
 return {...resultado,limpezaComprovada:true};
}
module.exports={provarStoragePreparacaoReal};
