'use strict';

// Auditoria de acesso sem credenciais nem identificadores pessoais.
// Relatorio reservado ao admin do laboratorio local.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterAuditoriaParticipanteDemo({segredo,auditoria}={}){
 if(!auditoria||typeof auditoria.consultar!=='function'){
  throw new TypeError('Auditoria local de acessos obrigatoria');
 }
 const router=express.Router();
 router.use(criarAutorizacao({segredo}));
 router.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  next();
 });
 router.get('/auditoria-acessos-participante-demo',(req,res,next)=>{
  try{
   const campos=Object.keys(req.query);
   if(campos.some(x=>x!=='limite')||campos.length>1){
    return res.status(400).json({erro:'CONSULTA_AUDITORIA_INVALIDA'});
   }
   const limite=req.query.limite===undefined?50:Number(req.query.limite);
   if(!Number.isSafeInteger(limite)||limite<1||limite>100){
    return res.status(400).json({erro:'LIMITE_AUDITORIA_INVALIDO'});
   }
   return res.json(auditoria.consultar({limite}));
  }catch(erro){return next(erro);}
 });
 return router;
}
module.exports={criarRouterAuditoriaParticipanteDemo};
