'use strict';
// Quatro imagens próprias do LOOP REAL: não compartilham a tabela AKITEMM,
// sessão de cliente, caixa, pedidos, catraca ou dados financeiros.
const express=require('express');
const {BannersEscritorioCandidatoSQLite,LIMITE_IMAGEM}=
 require('../domain/banners-escritorio-candidato-sqlite');
function montarBannersEscritorioReal(app,{
 banco,protegidoLoja,sessaoOperador,origem
}={}){
 if(!app||typeof banco?.prepare!=='function'||
    typeof protegidoLoja!=='function'||typeof sessaoOperador!=='function'||
    typeof origem!=='string')
  throw Error('BANNERS_LOOP_REAL_CONFIGURACAO_INVALIDA');
 const banners=new BannersEscritorioCandidatoSQLite({banco});
 const slot=req=>/^[1-9][0-9]{0,3}$/.test(req.params.slot||'')?
  Number(req.params.slot):null;
 const protegerOperador=(req,res,next)=>{
  const s=sessaoOperador(req);
  if(s?.role!=='ADMIN_COMERCIAL')
   return res.status(401).json({erro:'OPERADOR_NAO_AUTENTICADO'});
  if(req.get('origin')!==origem||!s.csrf||
     req.get('x-loop-admin-csrf')!==s.csrf)
   return res.status(403).json({erro:'CSRF_ADMIN_INVALIDO'});
  next();
 };
 const erro=(res,e)=>{
  const codigo=e?.codigo||'BANNER_LOOP_INDISPONIVEL';
  return res.status(codigo==='BANNER_CONFLITO_REVISAO'?409:
   codigo==='BANNER_SEM_IMAGEM'?404:
   codigo==='BANNER_ARQUIVO_INVALIDO'||codigo==='BANNER_REVISAO_INVALIDA'||
   codigo==='BANNER_SLOT_INVALIDO'?400:503).json({erro:codigo});
 };
 app.get('/api/loop/banners',protegidoLoja,(_req,res)=>{
  try{return res.set('Cache-Control','private, no-store').json(banners.listar());}
  catch{return res.status(503).json({erro:'BANNER_LOOP_INDISPONIVEL'});}
 });
 app.get('/api/loop/banners/:slot/imagem',protegidoLoja,(req,res)=>{
  const n=slot(req);
  if(n===null)return res.status(404).json({erro:'BANNER_SLOT_INVALIDO'});
  try{
   const foto=banners.imagem(n);
   return res.set({'Cache-Control':'private, no-store',
    'Content-Disposition':'inline','X-Content-Type-Options':'nosniff'})
    .type(foto.mime).send(foto.bytes);
  }catch(e){return erro(res,e);}
 });
 const upload=express.raw({type:['image/png','image/jpeg','image/webp'],
  limit:'4mb',inflate:false});
 app.post('/api/admin/loop/banners/adicionar',protegerOperador,(req,res)=>{
  try{return res.set('Cache-Control','no-store').json(banners.adicionar());}
  catch(e){return erro(res,e);}
 });
  app.put('/api/admin/loop/banners/:slot/imagem',
  protegerOperador,(req,res,next)=>{
   if(slot(req)===null)return res.status(404).json({erro:'BANNER_SLOT_INVALIDO'});
   if(!['image/png','image/jpeg','image/webp'].includes(req.get('content-type')?.split(';')[0]))
    return res.status(415).json({erro:'BANNER_ARQUIVO_INVALIDO'});
   if(Number(req.get('content-length')||0)>LIMITE_IMAGEM)
    return res.status(413).json({erro:'BANNER_ARQUIVO_EXCESSIVO'});
   next();
  },upload,(req,res)=>{
   try{
    if(!Buffer.isBuffer(req.body)||req.body.length>LIMITE_IMAGEM)
     return res.status(400).json({erro:'BANNER_ARQUIVO_INVALIDO'});
    const revisaoEsperada=Number(req.get('x-banner-revisao-esperada'));
    const resultado=banners.salvar({
     slot:slot(req),mime:req.get('content-type')?.split(';')[0],
     bytes:req.body,revisaoEsperada,enquadramento:'INTEIRA'
    });
    return res.set('Cache-Control','no-store').json(resultado);
   }catch(e){return erro(res,e);}
  });
 app.delete('/api/admin/loop/banners/:slot/imagem',
  protegerOperador,(req,res)=>{
   if(slot(req)===null)return res.status(404).json({erro:'BANNER_SLOT_INVALIDO'});
   try{
    const resultado=banners.remover({slot:slot(req),
     revisaoEsperada:Number(req.get('x-banner-revisao-esperada'))});
    return res.set('Cache-Control','no-store').json(resultado);
   }catch(e){return erro(res,e);}
  });
 return banners;
}
module.exports={montarBannersEscritorioReal};
