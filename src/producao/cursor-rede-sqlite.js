'use strict';
// Cursor opaco e autenticado do titular. Não é ticket de acesso.
const {createHmac,timingSafeEqual}=require('node:crypto');
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function erro(){const e=new Error('REDE_CURSOR_INVALIDO');e.codigo='REDE_CURSOR_INVALIDO';throw e;}
function chaveOk(chave){return Buffer.isBuffer(chave)&&chave.length===32;}
function assinatura(chave,parte){return createHmac('sha256',chave)
 .update('LOOP_REDE_PAGINA_V1\0').update(parte).digest('hex');}
function gerarCursorRede({chave,titularId,registradoEm,indicadoId,numeroCadastro}={}){
 if(!chaveOk(chave)||!TITULAR.test(titularId||'')||
    !TITULAR.test(indicadoId||'')||
    !Number.isSafeInteger(registradoEm)||registradoEm<=0||
    !Number.isSafeInteger(numeroCadastro)||numeroCadastro<=0)erro();
 const p=Buffer.from(JSON.stringify([1,titularId,registradoEm,
  indicadoId,numeroCadastro])).toString('base64url');
 return p+'.'+assinatura(chave,p);
}
function lerCursorRede({chave,titularId,cursor}={}){
 if(!chaveOk(chave)||!TITULAR.test(titularId||'')||
    typeof cursor!=='string'||cursor.length>512||
    !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(cursor))erro();
 const [parte,mac]=cursor.split('.');
 const esperado=assinatura(chave,parte);
 if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(esperado,'hex')))
  erro();
 let p;
 try{p=JSON.parse(Buffer.from(parte,'base64url').toString('utf8'));}
 catch{erro();}
 if(!Array.isArray(p)||p.length!==5||p[0]!==1||
    p[1]!==titularId||!Number.isSafeInteger(p[2])||p[2]<=0||
    !TITULAR.test(p[3]||'')||!Number.isSafeInteger(p[4])||p[4]<=0)
  erro();
 return {registradoEm:p[2],indicadoId:p[3],numeroCadastro:p[4]};
}
module.exports={gerarCursorRede,lerCursorRede};
