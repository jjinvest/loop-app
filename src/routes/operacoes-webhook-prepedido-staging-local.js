'use strict';
// Console de auditoria SOMENTE local e opt-in. Sem bind no src/server.js.
// Nenhum token fixture definido aqui: operador e protecao de mutacao
// devem ser fornecidos pelo servidor ensaio que montar este router.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
function criarRouterOperacoesWebhookPrepedidoStagingLocal({
 worker,autorizarOperador,autorizarMutacao
}={}){
 if(typeof worker?.pendencias!=='function'||
    typeof worker?.resumoPendencias!=='function'||
    typeof worker?.paginarPendencias!=='function'||
    typeof worker?.recuperarTravados!=='function'||
    typeof autorizarOperador!=='function'||
    typeof autorizarMutacao!=='function')
  throw new TypeError('Worker, operador e CSRF obrigatorios');
 const r=express.Router();
 r.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Robots-Tag','noindex, nofollow');
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'OPERACAO_STAGING_NAO_HOMOLOGADA'});
  if(!localSeguro(req))
   return res.status(403).json({erro:'OPERACAO_APENAS_LOOPBACK'});
  try{
   if(await autorizarOperador(req)!==true)
    return res.status(403).json({erro:'OPERADOR_NAO_AUTORIZADO'});
   next();
  }catch(_e){return res.status(403).json({erro:'OPERADOR_NAO_AUTORIZADO'});}
 });
 r.get('/webhooks/pendencias',(req,res)=>{
  // Cursor apenas por ID de evento, sem OFFSET ou leitura do PSP.
  // Recusa parametros extras e valores repetidos/objetos.
  if(Object.keys(req.query).some(chave=>chave!=='apos')||
     (Object.hasOwn(req.query,'apos')&&typeof req.query.apos!=='string'))
   return res.status(400).json({erro:'CURSOR_PENDENCIAS_INVALIDO'});
  try{
   const pagina=worker.paginarPendencias({apos:req.query.apos??null});
   const resumo=worker.resumoPendencias();
   return res.json({...pagina,resumo,exibidos:pagina.pendencias.length,
    consultaRemotaExecutada:false,pagamentoReal:false,posicoesCriadas:0});
  }catch(_e){
   return res.status(400).json({erro:'CURSOR_PENDENCIAS_INVALIDO'});
  }
 });
 r.post('/webhooks/recuperar',async(req,res)=>{
  try{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   if(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).length!==0)
    return res.status(400).json({erro:'CAMPOS_OPERACAO_INVALIDOS'});
   if(await autorizarMutacao(req)!==true)
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   return res.json(worker.recuperarTravados({execucaoLiberada:true}));
  }catch(_e){
   return res.status(503).json({erro:'OPERACAO_RECUPERACAO_INDISPONIVEL'});
  }
 });
 return r;
}
module.exports={criarRouterOperacoesWebhookPrepedidoStagingLocal};
