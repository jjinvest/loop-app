'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterAdminAkitemmConfigDemo({segredo,config}={}){
 if(!config)throw TypeError('Configuracao AKITEMM obrigatoria');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.get('/akitemm-config-demo',(_req,res)=>res.json({config:config.consultar(),laboratorio:true}));
 r.post('/akitemm-config-demo',(req,res,next)=>{
  try{
   const cfg=config.salvar(req.body);
   return res.json({config:cfg,laboratorio:true});
  }catch(e){
   if(/^(CONFIG_LOJA_INVALIDA|BANNER_INVALIDO|REDE_SOCIAL_INVALIDA|TEXTO_LOJA_INVALIDO|OFERTAS_INVALIDAS)$/.test(e.message))
    return res.status(400).json({erro:e.message});
   return next(e);
  }
 });
 return r;
}
module.exports={criarRouterAdminAkitemmConfigDemo};
