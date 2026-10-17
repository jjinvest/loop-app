'use strict';

// Nao e um webhook publico ou endpoint de cobranca: so o administrador local
// gera comandos FICTICIOS para ensaiar o contrato de um PSP futuro.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');

function criarRouterRecebimentosPSPDemo({segredo,recebimentos}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo }));
  router.use((_req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/recebimentos-psp-demo',(_req,res)=>{
    if(!recebimentos)return res.status(501).json({erro:'SIMULADOR_PSP_INDISPONIVEL'});
    res.json(recebimentos.listar());
  });
  router.get('/recebimentos-psp-demo/:id/historico',(req,res)=>{
    if(!recebimentos)return res.status(501).json({erro:'SIMULADOR_PSP_INDISPONIVEL'});
    try{
      res.json({modo:'HISTORICO_EVENTOS_PSP_APENAS_SIMULADO',
        eventos:recebimentos.historico(req.params.id)});
    }catch(e){
      if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PAGAMENTO_FICTICIO_NAO_ENCONTRADO'});
      if(e.codigo==='VALIDACAO')return res.status(400).json({erro:'ID_FICTICIO_INVALIDO'});
      throw e;
    }
  });
  router.post('/recebimentos-psp-demo/:id/eventos',(req,res)=>{
    if(!recebimentos)return res.status(501).json({erro:'SIMULADOR_PSP_INDISPONIVEL'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==2||
       Object.keys(body).some(k=>!['eventoId','tipo'].includes(k))){
      return res.status(400).json({erro:'EVENTO_PSP_FICTICIO_INVALIDO'});
    }
    try{
      res.json({modo:'OPERACAO_PSP_TOTALMENTE_FICTICIA',
        resultado:recebimentos.registrarEvento({
          pagamentoId:req.params.id,eventoId:body.eventoId,tipo:body.tipo
        }),
        pagamentosReais:false,
        novasPosicoesCriadas:false,
        catracaMovimentada:false
      });
    }catch(e){
      if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PAGAMENTO_FICTICIO_NAO_ENCONTRADO'});
      if(['CONFLITO','TRANSICAO','CONFLITO_IDEMPOTENCIA'].includes(e.codigo))return res.status(409).json({erro:'EVENTO_PSP_FICTICIO_EM_CONFLITO'});
      if(e.codigo==='VALIDACAO')return res.status(400).json({erro:'EVENTO_PSP_FICTICIO_INVALIDO'});
      throw e;
    }
  });
  return router;
}
module.exports={criarRouterRecebimentosPSPDemo};
