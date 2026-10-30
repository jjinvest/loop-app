'use strict';

// Ponte de LEITURA entre PEDIDOS LOGISTICOS FICTICIOS e PSP FICTICIO.
// Nunca valida venda de verdade, cria posicao, gira catraca, envia a fornecedor
// ou movimenta recursos. O objetivo e detectar divergencias entre modulos.
// Logistica neste laboratorio continua em memoria; a ligacao e persistente.
const {MODELOS}=require('../routes/admin-pedidos-logistica-demo');

const VINCULOS=Object.freeze([
  Object.freeze({pedidoId:'pedido-demo-001',pagamentoId:'pag-split-01'}),
  Object.freeze({pedidoId:'pedido-demo-002',pagamentoId:'pag-reserva-02'})
]);
const ID=/^[a-z0-9][a-z0-9-]{2,79}$/;

function situacaoConsolidada(pedido,pagamento){
  const statusPedido=pedido.status;
  const statusPSP=pagamento.situacao;
  const pendentePedido=statusPedido==='AGUARDANDO_CONFIRMACAO';
  if(statusPSP==='AGUARDANDO_FICTICIO'){
    if(pendentePedido)return 'AMBOS_AGUARDANDO_FICTICIOS';
    if(['CANCELAMENTO_SOLICITADO','CANCELADO'].includes(statusPedido))return 'PEDIDO_CANCELADO_SEM_CONFIRMACAO_PSP';
    return 'ALERTA_LOGISTICA_SEM_CONFIRMACAO_PSP';
  }
  if(statusPSP==='ESTORNADO_FICTICIO'){
    if(pendentePedido)return 'ESTORNO_FICTICIO_LOGISTICA_PENDENTE';
    return 'ALERTA_ESTORNO_REVISAR_LOGISTICA';
  }
  if(statusPSP==='CONFIRMADO_FICTICIO'){
    if(pendentePedido)return 'PAGAMENTO_FICTICIO_CONFIRMA_LOGISTICA_PENDENTE';
    if(['CANCELAMENTO_SOLICITADO','CANCELADO','DEVOLUCAO_SOLICITADA','DEVOLVIDO'].includes(statusPedido)){
      return 'ALERTA_PEDIDO_CANCELADO_COM_PAGAMENTO_FICTICIO';
    }
    return 'ESTADOS_FICTICIOS_COMPATIVEIS';
  }
  throw new Error('Estado de pagamento ficticio desconhecido');
}

class VinculosPedidosPagamentosDemoSQLite{
  constructor({banco,recebimentos,logistica}={}){
    if(!banco||typeof banco.exec!=='function'||typeof banco.prepare!=='function'||
       !recebimentos||typeof recebimentos.buscar!=='function'||
       typeof recebimentos.listar!=='function'||recebimentos.banco!==banco||
       !logistica||typeof logistica.buscar!=='function'){
      throw new TypeError('Repositorios de pedidos e PSP de laboratorio obrigatorios');
    }
    this.banco=banco;
    this.recebimentos=recebimentos;
    this.logistica=logistica;
    banco.exec(`
      CREATE TABLE IF NOT EXISTS admin_pedidos_pagamentos_demo (
        pedido_id TEXT PRIMARY KEY NOT NULL,
        pagamento_id TEXT NOT NULL UNIQUE,
        produto_id TEXT NOT NULL,
        fornecedor_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
        criado_em TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS admin_pedidos_pagamentos_demo_no_update
        BEFORE UPDATE ON admin_pedidos_pagamentos_demo
        BEGIN SELECT RAISE(ABORT,'vinculo financeiro demo imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_pedidos_pagamentos_demo_no_delete
        BEFORE DELETE ON admin_pedidos_pagamentos_demo
        BEGIN SELECT RAISE(ABORT,'vinculo financeiro demo imutavel'); END;
    `);
    // Contrato ESTATICO de dois modelos ja existentes; IDs e valores nunca
    // sao aceitos de um cliente ou do webhook.
    const modelos=new Map(MODELOS.map(p=>[p.pedidoId,p]));
    const inserir=banco.prepare(`
      INSERT OR IGNORE INTO admin_pedidos_pagamentos_demo
       (pedido_id,pagamento_id,produto_id,fornecedor_id,sku,valor_centavos,criado_em)
      VALUES (?,?,?,?,?,?,?)`);
    for(const vinculo of VINCULOS){
      const pedido=modelos.get(vinculo.pedidoId);
      const pagamento=recebimentos.buscar(vinculo.pagamentoId);
      if(!pedido||!pagamento||!logistica.buscar(vinculo.pedidoId)){
        throw new Error('Modelo de pedido ou pagamento de laboratorio nao encontrado');
      }
      inserir.run(pedido.pedidoId,vinculo.pagamentoId,pedido.produtoId,
        pedido.fornecedorId,pedido.sku,pagamento.valorCentavos,new Date().toISOString());
    }
    const reais=this.banco.prepare(`
      SELECT pedido_id AS pedidoId,pagamento_id AS pagamentoId,
        produto_id AS produtoId,fornecedor_id AS fornecedorId,sku,
        valor_centavos AS valorCentavos
      FROM admin_pedidos_pagamentos_demo ORDER BY pedido_id`).all();
    const esperados=VINCULOS.map(v=>{
      const p=modelos.get(v.pedidoId),fat=recebimentos.buscar(v.pagamentoId);
      return {pedidoId:p.pedidoId,pagamentoId:v.pagamentoId,produtoId:p.produtoId,
        fornecedorId:p.fornecedorId,sku:p.sku,valorCentavos:fat.valorCentavos};
    }).sort((a,b)=>a.pedidoId.localeCompare(b.pedidoId));
    if(JSON.stringify(reais)!==JSON.stringify(esperados)){
      throw new Error('Vinculo persistido divergiu da amostra de pedido/pagamento');
    }
  }
  buscar(pedidoId){
    if(typeof pedidoId!=='string'||!ID.test(pedidoId))return null;
    const linha=this.banco.prepare(`
      SELECT pedido_id AS pedidoId,pagamento_id AS pagamentoId,
        produto_id AS produtoId,fornecedor_id AS fornecedorId,sku,
        valor_centavos AS valorCentavos
      FROM admin_pedidos_pagamentos_demo WHERE pedido_id=?`).get(pedidoId);
    if(!linha)return null;
    const pedido=this.logistica.buscar(linha.pedidoId);
    const pagamento=this.recebimentos.listar().pagamentos.find(p=>p.pagamentoId===linha.pagamentoId);
    if(!pedido||!pagamento||pagamento.valorCentavos!==linha.valorCentavos){
      throw new Error('Integridade da ponte de pedidos e pagamentos comprometida');
    }
    return {
      ...linha,
      etapaCicloDemo:pagamento.ordemCiclo,
      destinoCofre:pagamento.destinoCofre,
      modoFornecedor:pagamento.modo,
      precoBrutoCentavos:pagamento.valorCentavos,
      fornecedorCentavos:pagamento.fornecedorCentavos,
      parcelaLoopCentavos:pagamento.parcelaLoopCentavos,
      sobraBrutaCentavos:pagamento.sobraBrutaCentavos,
      statusLogisticoSimulado:pedido.status,
      statusPSPSimulado:pagamento.situacao,
      integridade:situacaoConsolidada(pedido,pagamento),
      revisaoLogistica:pedido.revisao,
      eventosFinanceirosRegistrados:pagamento.eventosRegistrados,
      pagamentoReal:false,despachoReal:false,posicaoCriada:false,catracaMovimentada:false
    };
  }
  listar(){
    const ids=this.banco.prepare(
      'SELECT pedido_id AS pedidoId FROM admin_pedidos_pagamentos_demo ORDER BY pedido_id'
    ).all();
    return {
      modo:'PONTE_PEDIDOS_PAGAMENTOS_APENAS_DEMONSTRATIVA',
      somenteConsulta:true,
      integracaoRealPSP:false,
      pedidosReais:false,
      lojasCobrando:false,
      nenhumaAcaoAutomatica:true,
      logisticaEmMemoriaNaoPersistente:true,
      pedidos:ids.map(x=>this.buscar(x.pedidoId))
    };
  }
  historico(pedidoId){
    const atual=this.buscar(pedidoId);
    if(!atual)return null;
    return {
      pedidoId, pagamentoId:atual.pagamentoId, integridade:atual.integridade,
      eventosLogistica:this.logistica.historico(pedidoId),
      eventosFinanceiros:this.recebimentos.historico(atual.pagamentoId),
      dadosReais:false
    };
  }
}
module.exports={VinculosPedidosPagamentosDemoSQLite,VINCULOS,situacaoConsolidada};
