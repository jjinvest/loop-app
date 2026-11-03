'use strict';
// Adapter HTTP somente ensaio local: vincula usuario autenticado a um
// prepedido imutavel; NAO cria pagamento nem ativa vendas.
// NAO montar em src/server.js.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {consultarPedido}=require('../domain/relatorio-homologacao-checkout-staging');
function criarRouterPrePedidosCheckoutStaging({
 prePedidos,repositorioCatalogo,identificarTitular,autorizarMutacao,
 ponteAsaasSandbox=null,consultarPosicaoPendente=null
}={}){
 if(typeof prePedidos?.preparar!=='function'||
  typeof prePedidos?.consultar!=='function'||
  typeof prePedidos?.listar!=='function'||
  typeof repositorioCatalogo?.buscar!=='function'||
  typeof identificarTitular!=='function'||
  typeof autorizarMutacao!=='function')
  throw new TypeError('Prepedidos, catalogo, autenticacao e CSRF obrigatorios');
 if(consultarPosicaoPendente!==null&&typeof consultarPosicaoPendente!=='function')
  throw new TypeError('Leitura de posicao pendente invalida');
 if(ponteAsaasSandbox!==null&&typeof ponteAsaasSandbox.consultar!=='function')
  throw new TypeError('Ponte Asaas Sandbox de somente leitura invalida');
 const r=express.Router();
 r.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Robots-Tag','noindex, nofollow');
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'CHECKOUT_PUBLICO_NAO_HOMOLOGADO'});
  if(!localSeguro(req))
   return res.status(403).json({erro:'SOMENTE_TESTE_LOCAL'});
  try{
   const titularId=await identificarTitular(req);
   if(!titularId)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   req.titularPrePedido=titularId;next();
  }catch(e){next(e);}
 });
 function erro(e,res,next){
  if(e?.codigo==='CATALOGO_ALTERADO_REFAZER_COTACAO')
   return res.status(409).json({erro:e.codigo});
  if(e?.codigo==='RASCUNHO_NAO_ENCONTRADO'||
     e?.codigo==='PREPEDIDO_NAO_ENCONTRADO')
   return res.status(404).json({erro:e.codigo});
  if(e?.codigo==='RASCUNHO_NAO_ELEGIVEL'||
     e?.codigo==='RASCUNHO_INCONSISTENTE')
   return res.status(409).json({erro:e.codigo});
  if(e?.codigo==='SESSAO_AUSENTE')
   return res.status(401).json({erro:e.codigo});
  next(e);
 }
 r.post('/prepedidos',async(req,res,next)=>{
  try{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).join(',')!=='rascunhoId')
    return res.status(400).json({erro:'PARAMETROS_INVALIDOS'});
   if(await autorizarMutacao(req)!==true)
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   const resultado=await prePedidos.preparar({
    titularId:req.titularPrePedido,rascunhoId:req.body.rascunhoId,
    repositorioCatalogo
   });
   return res.status(resultado.repetido?200:201).json(resultado);
  }catch(e){erro(e,res,next);}
 });
 // Projecao agregada "Meus Pedidos" do laboratorio:
 // nunca executa GET PSP ao abrir a lista e nao expõe credenciais de cobranca.
 r.get('/meus-pedidos',(req,res,next)=>{
  try{
   const titularId=req.titularPrePedido;
   const pedidos=prePedidos.listar({titularId}).map(p=>{
    const andamento=ponteAsaasSandbox?.consultar({
     titularId,prepedidoId:p.prepedidoId
    })||null;
    // Mesma fonte SQLite auditada do Escritório, filtrada pelo titular.
    const auditoria=ponteAsaasSandbox?
     consultarPedido({banco:ponteAsaasSandbox.banco,
      titularId,prepedidoId:p.prepedidoId}):null;
    return {
     prepedidoId:p.prepedidoId,criadoEm:p.criadoEm,
     moeda:p.moeda,totalCentavos:p.totalCentavos,itens:p.itens,
     statusHomologacao:andamento?.estado??'SEM_COBRANCA_SANDBOX',
     statusInformadoPeloPSP:andamento?.ultimaConsultaSandbox?.statusAsaas??null,
     consultaPSPRealizadaNestaLeitura:false,
     conferenciaPSPConcluida:auditoria?.conferenciaPSPConcluida===true,
     situacaoOperacional:auditoria?.estadoOperacional??'SEM_COBRANCA_SANDBOX',
     posicoesFicticiasConferidas:auditoria?.posicoesPendentesFicticias??0,
     revisaoManualObrigatoria:andamento?.revisaoManualObrigatoria===true||
       auditoria?.exigeRevisaoManual===true,
     compraReal:false,comprovanteFinanceiro:false,
     posicaoPendenteLaboratorio:consultarPosicaoPendente?.({
      titularId,prepedidoId:p.prepedidoId
     })??null,
     posicoesCriadas:0,bonificacaoLiberada:false
    };
   });
   return res.json({pedidos,ambiente:'STAGING_LOCAL',
    checkoutPublico:false,consultaPSPRealizadaNestaLeitura:false});
  }catch(e){erro(e,res,next);}
 });
 r.get('/prepedidos',(req,res,next)=>{
  try{return res.json({
   prepedidos:prePedidos.listar({titularId:req.titularPrePedido}),
   semPagamentoReal:true,semCheckout:true
  });}catch(e){erro(e,res,next);}
 });
 r.get('/prepedidos/:prepedidoId',(req,res,next)=>{
  try{
   const p=prePedidos.consultar({
    titularId:req.titularPrePedido,prepedidoId:req.params.prepedidoId
   });
   return p?res.json({prepedido:p}):
    res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
  }catch(e){erro(e,res,next);}
 });
 // Projecao somente leitura de status PSP persistido. Nao confere na
 // rede nem cria Pix ao abrir Meus Pedidos. Sem expor cliente PSP ou chave.
 r.get('/prepedidos/:prepedidoId/sandbox',(req,res,next)=>{
  try{
   const titularId=req.titularPrePedido,prepedidoId=req.params.prepedidoId;
   const pedido=prePedidos.consultar({titularId,prepedidoId});
   if(!pedido)return res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
   if(!ponteAsaasSandbox)return res.status(503).json({
    erro:'PONTE_SANDBOX_STAGING_NAO_CONFIGURADA'
   });
   const consulta=ponteAsaasSandbox.consultar({titularId,prepedidoId});
   return res.json({
    prepedidoId,estado:consulta?.estado??'SEM_COBRANCA_SANDBOX',
    cobrancaSandbox:consulta,
    ambiente:'LABORATORIO_LOCAL_SOMENTE_LEITURA',
    consultaRemotaExecutada:false,comprovanteFinanceiro:false,
    pagamentoReal:false,posicoesCriadas:0
   });
  }catch(e){erro(e,res,next);}
 });
 return r;
}
module.exports={criarRouterPrePedidosCheckoutStaging};
