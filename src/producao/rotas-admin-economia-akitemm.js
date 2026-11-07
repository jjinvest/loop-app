'use strict';
// API privada da área PRODUTOS do administrador aprovado.
// NÃO montar nas rotas /api/contas dos clientes, nem em LAB.
// "autorizarAdministrador" e "validarCsrfAdmin" devem ser fornecidos pelo
// gateway de administração definitivo; sem os dois, a API não é criada.
const express=require('express');
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function criarRouterAdminEconomiaAkitemm({
 controle,autorizarAdministrador,validarCsrfAdmin,origemHttps
}={}){
 if(!controle||typeof controle.listarOfertas!=='function'||
    typeof controle.definirCusto!=='function'||
    typeof controle.csvContador!=='function'||
    typeof autorizarAdministrador!=='function'||
    typeof validarCsrfAdmin!=='function')
  erro('ADMIN_REAL_SEM_AUTORIZACAO');
 let origem;
 try{
  const url=new URL(origemHttps);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
   erro('ORIGEM_ADMIN_REAL_INVALIDA');
  origem=url.origin;
 }catch{erro('ORIGEM_ADMIN_REAL_INVALIDA');}
 const router=express.Router();
 router.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',"default-src 'none'");
  next();
 });
 router.use(autorizarAdministrador);
 router.get('/produtos-valores',(_req,res)=>{
  try{return res.json({
   ofertas:controle.listarOfertas({limite:500}),
   dadosPrivados:true,
   finalidade:'GESTAO_E_CONTABILIDADE',
   impostosCalculados:false,profitLiquidoCalculado:false
  });}catch{return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});}
 });
 router.post('/produtos-valores/:produtoId/:distribuidorId',
  express.json({limit:'4kb',strict:true}),
  (req,res,next)=>{
   if(req.get('origin')!==origem)
    return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   next();
  },validarCsrfAdmin,(req,res)=>{
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!=='custoUnitCentavos,revisaoEsperada')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    return res.json(controle.definirCusto({
     produtoId:req.params.produtoId,
     distribuidorId:req.params.distribuidorId,
     custoUnitCentavos:b.custoUnitCentavos,
     revisaoEsperada:b.revisaoEsperada
    }));
   }catch(e){
    if(e.codigo==='REVISAO_CUSTO_EM_CONFLITO')
     return res.status(409).json({erro:e.codigo});
    if(['CUSTO_FORNECEDOR_INVALIDO','OFERTA_NAO_EXISTE'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});
   }
  });
 router.get('/contador/catalogo.csv',(_req,res)=>{
  try{
   const csv=controle.csvContador({limite:500});
   return res.set({
    'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':'attachment; filename="akitemm-produtos-para-contador.csv"'
   }).send('\uFEFF'+csv);
  }catch{return res.status(503).json({erro:'CSV_INDISPONIVEL'});}
 });
 return router;
}
module.exports={criarRouterAdminEconomiaAkitemm};
