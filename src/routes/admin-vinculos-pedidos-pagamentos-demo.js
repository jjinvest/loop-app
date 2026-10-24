'use strict';
// Consultas da ponte de vendas falsas; sem API de vincular pedidos externos,
// alterar obrigacoes, liberar fornecedor ou gerar posicoes reais.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterVinculosPedidosPagamentosDemo({segredo,vinculos}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/pedidos-pagamentos-demo',(_req,res)=>{
    if(!vinculos)return res.status(501).json({erro:'VINCULOS_DEMO_INDISPONIVEIS'});
    res.json(vinculos.listar());
  });
  router.get('/pedidos-pagamentos-demo/:id/historico',(req,res)=>{
    if(!vinculos)return res.status(501).json({erro:'VINCULOS_DEMO_INDISPONIVEIS'});
    const dados=vinculos.historico(req.params.id);
    if(!dados)return res.status(404).json({erro:'VINCULO_DEMO_NAO_ENCONTRADO'});
    res.json({modo:'HISTORICO_DE_PEDIDO_PAGAMENTO_FICTICIO',...dados});
  });
  return router;
}
module.exports={criarRouterVinculosPedidosPagamentosDemo};
