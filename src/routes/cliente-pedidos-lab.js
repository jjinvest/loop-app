'use strict';
const express=require('express');
const {randomBytes,createHash}=require('node:crypto');
function criarRouterClientePedidosLab({contas,pedidos}={}){
 if(!contas||!pedidos||contas.banco!==pedidos.banco||
    typeof contas.autenticar!=='function'||typeof pedidos.listarPorTitular!=='function')
  throw new TypeError('Dependencias de laboratorio invalidas');
 const router=express.Router(),sessoes=new Map();
 router.use((_q,res,next)=>{res.set('Cache-Control','no-store');next();});
 const chave=t=>createHash('sha256').update(t).digest('hex');
 function sessao(req,res,next){
  const token=req.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const registro=token&&sessoes.get(chave(token));
  if(!registro||registro.expira<=Date.now())return res.status(401).json({erro:'LOGIN_NECESSARIO'});
  req.contaId=registro.contaId;req.token=token;next();
 }
 router.post('/entrar',(req,res)=>{
  if(!req.is('application/json'))return res.sendStatus(415);
  const {nome,senha}=req.body||{};
  if(typeof nome!=='string'||typeof senha!=='string')return res.sendStatus(400);
  try{
   const resultado=contas.autenticar({nome,senha});
   const token=randomBytes(32).toString('hex');
   sessoes.set(chave(token),{contaId:resultado.conta.contaId,expira:Date.now()+1800000});
   return res.json({token,expiraEmSegundos:1800,conta:{nome:resultado.conta.nome,apelido:resultado.conta.apelido},laboratorio:true});
  }catch(e){return res.status(401).json({erro:'CREDENCIAIS_INVALIDAS'});}
 });
 router.get('/meus-pedidos',sessao,(req,res)=>{
  try{return res.json({pedidos:pedidos.listarPorTitular(req.contaId),laboratorio:true});}
  catch(e){return res.status(500).json({erro:'CONSULTA_INDISPONIVEL'});}
 });
 router.post('/sair',sessao,(req,res)=>{sessoes.delete(chave(req.token));res.sendStatus(204);});
 return router;
}
module.exports={criarRouterClientePedidosLab};
