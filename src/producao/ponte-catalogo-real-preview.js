'use strict';
// Ponte autenticada: vitrine e painel aprovados continuam os MESMOS.
// Produtos/fotos ficam no volume REAL separado, nunca no SQLite de ensaio.
const express=require('express');
const {tokenCatalogo}=require('./catalogo-mercadorias-real');
const ID='[a-z0-9-]{3,80}',POS='(?:10|[1-9])';
function instalarPonteCatalogoReal({app,autorizarOperador,env=process.env}={}){
 if(env.LOOP_PREVIEW_CATALOGO_REAL!=='SIM')return {ativo:false};
 const url=env.LOOP_PREVIEW_URL_TABULEIRO_REAL;
 if(typeof url!=='string'||
  !/^http:\/\/[a-z0-9-]+\.railway\.internal(?::[0-9]{2,5})?\/internal\/loop\/tabuleiro$/.test(url)||
  typeof autorizarOperador!=='function')
  throw Error('CATALOGO_REAL_DESTINO_INTERNO_INVALIDO');
 const token=tokenCatalogo(env.LOOP_PREVIEW_TOKEN_TABULEIRO_REAL);
 const base=url.replace('/internal/loop/tabuleiro','');
 const bodyFoto=express.raw({
  type:['image/jpeg','image/png','image/webp'],limit:'3mb',inflate:false
 });
 async function chamar(req,res,destino,{binario=false}={}){
  try{
   const headers={'x-loop-catalogo-token':token};
   let body;
   if(req.method==='POST'||req.method==='PUT'||req.method==='PATCH'){
    if(binario){
     if(!Buffer.isBuffer(req.body))return res.status(415).json({erro:'FOTO_BINARIA_OBRIGATORIA'});
     body=req.body;headers['content-type']=req.get('content-type');
     headers['x-foto-versao-esperada']=req.get('x-foto-versao-esperada')||'';
    }else{
     headers['content-type']='application/json';
     body=JSON.stringify(req.body);
    }
   }
   const r=await fetch(base+'/internal/catalogo'+destino,{
    method:req.method,headers,body,cache:'no-store',
    signal:AbortSignal.timeout(6000)
   });
   const tipo=r.headers.get('content-type')||'application/json';
   if(!tipo.startsWith('application/json')&&
     !['image/png','image/jpeg','image/webp'].includes(tipo))
    return res.status(503).json({erro:'CATALOGO_REAL_RESPOSTA_INVALIDA'});
   res.status(r.status).set('Cache-Control','private, no-store')
    .type(tipo.split(';')[0]);
   return res.send(Buffer.from(await r.arrayBuffer()));
  }catch{
   return res.status(503).json({erro:'CATALOGO_COMERCIAL_REAL_INDISPONIVEL'});
  }
 }
 function encaminharAdmin(req,res){
  const sub=req.path;
  if(sub==='/')return chamar(req,res,'/produtos'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''));
  if(sub==='/produtos'||sub==='')return chamar(req,res,'/produtos'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''));
  if(sub==='/loja/config')return chamar(req,res,'/loja/config');
  const path=sub.replace(/^\//,'');
  const item=path.match(new RegExp('^('+ID+')(?:/(.*))?$'));
  if(!item)return res.status(404).json({erro:'ROTA_CATALOGO_REAL_NAO_EXISTE'});
  const id=item[1],rest=item[2]||'';
  if(rest===''){
   if(['GET','PATCH'].includes(req.method))
    return chamar(req,res,'/produtos/'+id);
  }
  if(rest==='fotos'&&req.method==='GET')
   return chamar(req,res,'/produtos/'+id+'/fotos');
  if(new RegExp('^fotos/'+POS+'$').test(rest)&&req.method==='POST')
   return chamar(req,res,'/produtos/'+id+'/'+rest,{binario:true});
  if(rest==='video'&&req.method==='GET')
   return res.json({produtoId:id,arquivoAnexado:false,versao:0,origem:'CATALOGO_REAL'});
  if(rest==='pdf'&&req.method==='GET')
   return res.json({produtoId:id,arquivoAnexado:false,versao:0,origem:'CATALOGO_REAL'});
  if(rest==='custos')return res.status(503).json({
   erro:'CUSTOS_COMERCIAIS_AINDA_NAO_HOMOLOGADOS'
  });
  return res.status(503).json({erro:'RECURSO_COMERCIAL_AINDA_NAO_HOMOLOGADO'});
 }
 // O operador continua autenticado no gateway e no backend. Rejeitar
 // qualquer tentativa de usar a API como passagem genérica (SSRF).
 app.use('/staging/escritorio-unificado/produtos',autorizarOperador,bodyFoto,
  (req,res)=>{
   const sub=req.path;
   if(sub==='/'||sub===''){
    if(!['GET','POST'].includes(req.method))return res.sendStatus(405);
    return chamar(req,res,'/produtos'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''));
   }
   const match=sub.match(new RegExp('^/('+ID+')(?:/(.*))?$'));
   if(!match)return res.status(404).json({erro:'PRODUTO_INVALIDO'});
   const [_,id,rest='']=match;
   if(!rest&&['GET','PATCH'].includes(req.method))
    return chamar(req,res,'/produtos/'+id);
   if(rest==='fotos'&&req.method==='GET')
    return chamar(req,res,'/produtos/'+id+'/fotos');
   if(new RegExp('^fotos/'+POS+'$').test(rest)&&req.method==='POST')
    return chamar(req,res,'/produtos/'+id+'/'+rest,{binario:true});
   if(rest==='video'&&req.method==='GET')
    return res.json({produtoId:id,arquivoAnexado:false,versao:0});
   if(rest==='pdf'&&req.method==='GET')
    return res.json({produtoId:id,arquivoAnexado:false,versao:0});
   return res.status(503).json({erro:'RECURSO_COMERCIAL_AINDA_NAO_HOMOLOGADO'});
  });
 app.get('/staging/vitrine/loja/catalogo',(_req,res)=>
  chamar({method:'GET'},res,'/vitrine'));
 app.get(new RegExp('^/staging/vitrine/loja/produtos/('+ID+')/foto/('+POS+')$'),
  (req,res)=>chamar({method:'GET'},res,'/foto/'+req.params[0]+'/'+req.params[1]));
 // Um produto real NUNCA entra no checkout de laboratório por coincidência
 // de ID. Não apagar pedidos anteriores, somente bloquear a rota neste modo.
 app.post('/staging/vitrine/loja/pedidos',(_req,res)=>
  res.status(503).json({erro:'CHECKOUT_REAL_AGUARDANDO_HOMOLOGACAO'}));
 return {ativo:true,origem:'CATALOGO_COMERCIAL_SQLITE_REAL',checkoutReal:false};
}
module.exports={instalarPonteCatalogoReal};
