'use strict';

// WEBHOOK FICTICIO SOMENTE LOCAL E DESATIVADO POR PADRAO.
// Nao usar com PSP real: protocolos reais exigem adaptadores proprios,
// validacao de autenticidade do provedor, reconsulta e conciliacao bancaria.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {verificarMensagemDemo,validarSegredoDemo,TAMANHO_MAXIMO}=
  require('../domain/verificador-webhook-psp-demo');

function criarRouterWebhookPSPDemoLocal({segredo,obterRecebimentos,agoraSegundos}={}){
  validarSegredoDemo(segredo);
  if(typeof obterRecebimentos!=='function'){
    throw new Error('Repositorio PSP de laboratorio obrigatorio');
  }
  const router=express.Router();
  router.post('/webhook-psp-demo',
    (req,res,next)=>{
      if(!localSeguro(req)||process.env.NODE_ENV==='production'){
        return res.status(403).json({erro:'WEBHOOK_DEMO_SOMENTE_LOCAL'});
      }
      res.set('Cache-Control','no-store');
      if(!req.is('application/json')){
        return res.status(415).json({erro:'WEBHOOK_DEMO_EXIGE_JSON'});
      }
      next();
    },
    express.raw({type:'application/json',limit:TAMANHO_MAXIMO,inflate:false}),
    (req,res)=>{
      try{
        const evento=verificarMensagemDemo({
          segredo,
          timestamp:req.get('x-loop-demo-timestamp'),
          assinatura:req.get('x-loop-demo-signature'),
          corpoBruto:req.body,
          ...(agoraSegundos?{agoraSegundos:agoraSegundos()}: {})
        });
        const recebimentos=obterRecebimentos();
        if(!recebimentos)return res.status(503).json({erro:'SIMULADOR_PSP_INDISPONIVEL'});
        // O valor confirmado deve pertencer ao registro FIXO da venda ficticia
        // e nao pode ser determinado arbitrariamente pelo emissor.
        const fatura=recebimentos.buscar(evento.pagamentoId);
        if(!fatura)return res.status(404).json({erro:'PAGAMENTO_FICTICIO_NAO_ENCONTRADO'});
        if(evento.valorCentavos!==fatura.valorCentavos){
          return res.status(409).json({erro:'VALOR_DO_PAGAMENTO_FICTICIO_DIVERGENTE'});
        }
        const resultado=recebimentos.registrarEvento({
          pagamentoId:evento.pagamentoId,eventoId:evento.eventoId,tipo:evento.tipo
        });
        return res.json({
          modo:'WEBHOOK_APENAS_FICTICIO_LOCAL',
          registrado:!resultado.repetido,
          repetido:resultado.repetido,
          pagamentoId:evento.pagamentoId,
          movimentacaoBancariaReal:false,
          catracaMovimentada:false
        });
      }catch(e){
        if(['CORPO_INVALIDO'].includes(e.codigo))return res.status(400).json({erro:'EVENTO_DEMO_INVALIDO'});
        if(['ASSINATURA_INVALIDA'].includes(e.codigo))return res.status(401).json({erro:'ASSINATURA_DEMO_INVALIDA'});
        if(e.codigo==='VALIDACAO')return res.status(400).json({erro:'EVENTO_DEMO_INVALIDO'});
        if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PAGAMENTO_FICTICIO_NAO_ENCONTRADO'});
        if(['CONFLITO','TRANSICAO','CONFLITO_IDEMPOTENCIA'].includes(e.codigo)){
          return res.status(409).json({erro:'CONFLITO_DE_EVENTO_FICTICIO'});
        }
        throw e;
      }
    }
  );
  // Express raw pode rejeitar corpo muito grande ANTES do verificador.
  router.use((err,_req,res,next)=>{
    if(err?.type==='entity.too.large')return res.status(413).json({erro:'CORPO_DEMO_MUITO_GRANDE'});
    if(err?.type==='encoding.unsupported')return res.status(415).json({erro:'CODIFICACAO_DEMO_NAO_SUPORTADA'});
    next(err);
  });
  return router;
}
module.exports={criarRouterWebhookPSPDemoLocal};
