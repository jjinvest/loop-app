'use strict';

// Registra pedidos COMERCIAIS FICTICIOS com fotografia imutavel do produto,
// seu fornecedor e sua fatura PSP de TESTE no instante da criacao.
// Nao e checkout; nao envia mercadorias nem altera filas, catraca ou bancos.
const {MODOS}=require('./financeiro-admin-demo');
const {VINCULOS}=require('./vinculos-pedidos-pagamentos-demo-sqlite');

const IDENTIFICADOR=/^[a-z0-9][a-z0-9-]{2,79}$/;
function erro(codigo,mensagem){
  const e=new Error(mensagem);
  e.codigo=codigo;
  return e;
}
function validarId(id,campo){
  if(typeof id!=='string'||!IDENTIFICADOR.test(id)){
    throw erro('INVALIDO',campo+' invalido');
  }
}
function exposicao(row){
  if(!row)return null;
  return {
    pedidoId:row.pedido_id,
    produtoId:row.produto_id,
    nomeProduto:row.nome_produto,
    tipoProduto:row.tipo_produto,
    revisaoProduto:row.revisao_produto,
    fornecedorId:row.fornecedor_id,
    sku:row.sku,
    revisaoFornecedor:row.revisao_fornecedor,
    pagamentoId:row.pagamento_id,
    modoFornecedor:row.modo_fornecedor,
    precoBrutoCentavos:row.preco_bruto_centavos,
    custoFornecedorExemploCentavos:row.custo_fornecedor_exemplo_centavos,
    parcelaLoopExemploCentavos:row.parcela_loop_exemplo_centavos,
    sobraComercialBrutaExemploCentavos:row.sobra_bruta_exemplo_centavos,
    criadoEm:row.criado_em
  };
}
class PedidosComerciaisDemoSQLite{
  constructor({repositorioCatalogo,vinculosFornecedor,recebimentos}={}){
    const db=repositorioCatalogo?.banco;
    if(!db||typeof db.prepare!=='function'||
       vinculosFornecedor?.banco!==db||
       recebimentos?.banco!==db){
      throw new TypeError('Catalogo, fornecedores e PSP da mesma base de laboratorio sao obrigatorios');
    }
    this.banco=db;
    this.catalogo=repositorioCatalogo;
    this.vinculosFornecedor=vinculosFornecedor;
    this.recebimentos=recebimentos;
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_pedidos_comerciais_demo (
        pedido_id TEXT PRIMARY KEY NOT NULL,
        produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
        nome_produto TEXT NOT NULL,
        tipo_produto TEXT NOT NULL CHECK(tipo_produto='FISICO'),
        revisao_produto INTEGER NOT NULL,
        fornecedor_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        revisao_fornecedor INTEGER NOT NULL,
        pagamento_id TEXT NOT NULL UNIQUE REFERENCES admin_receb_demo_pagamentos(pagamento_id) ON DELETE RESTRICT,
        modo_fornecedor TEXT NOT NULL,
        preco_bruto_centavos INTEGER NOT NULL CHECK(preco_bruto_centavos>0),
        custo_fornecedor_exemplo_centavos INTEGER NOT NULL CHECK(custo_fornecedor_exemplo_centavos>0),
        parcela_loop_exemplo_centavos INTEGER NOT NULL CHECK(parcela_loop_exemplo_centavos>0),
        sobra_bruta_exemplo_centavos INTEGER NOT NULL CHECK(sobra_bruta_exemplo_centavos>=0),
        criado_em TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_pedidos_comerciais_produto_demo
        ON admin_pedidos_comerciais_demo(produto_id);
      CREATE TRIGGER IF NOT EXISTS admin_pedidos_comerciais_demo_no_update
        BEFORE UPDATE ON admin_pedidos_comerciais_demo
        BEGIN SELECT RAISE(ABORT,'pedido comercial de laboratorio imutavel'); END;
      CREATE TRIGGER IF NOT EXISTS admin_pedidos_comerciais_demo_no_delete
        BEFORE DELETE ON admin_pedidos_comerciais_demo
        BEGIN SELECT RAISE(ABORT,'pedido comercial de laboratorio imutavel'); END;
    `);
  }
  buscar(pedidoId){
    validarId(pedidoId,'pedidoId');
    const row=this.banco.prepare(
      'SELECT * FROM admin_pedidos_comerciais_demo WHERE pedido_id=?'
    ).get(pedidoId);
    if(!row)return null;
    return this.comStatus(exposicao(row));
  }
  comStatus(registro){
    const p=this.recebimentos.listar().pagamentos.find(x=>x.pagamentoId===registro.pagamentoId);
    if(!p)throw new Error('Pagamento de referencia nao encontrado na simulacao');
    return {...registro,
      situacaoPagamentoFicticio:p.situacao,
      eventosPagamentoFicticio:p.eventosRegistrados,
      recebimentoReal:false,
      despachoAoFornecedorReal:false,
      posicaoCriada:false,
      catracaMovimentada:false,
      snapshotImutavel:true
    };
  }
  listar(){
    return {
      modo:'PEDIDOS_COMERCIAIS_FICTICIOS',
      checkoutReal:false,clienteReal:false,cobrancaReal:false,
      posicoesGeradas:false,catracaMovimentada:false,
      pedidos:this.banco.prepare(
        'SELECT * FROM admin_pedidos_comerciais_demo ORDER BY criado_em,pedido_id'
      ).all().map(row=>this.comStatus(exposicao(row)))
    };
  }
  // Cotacao READ-ONLY para precos VARIAVEIS de produtos fisicos.
  // Sem fatura PSP criada, sem custo definitivo do distribuidor e
  // sem inventar como a parcela LOOP sera financiada em cada preco.
  cotacoesPrecosVariaveis(){
    const produtos=this.catalogo.listar().filter(p=>
      p.tipo==='FISICO'&&p.estado==='PUBLICADO'&&
      Number.isSafeInteger(p.precoCentavos)&&p.precoCentavos>0
    ).map(p=>{
      const f=this.vinculosFornecedor.consultar({produtoId:p.id});
      if(!f?.ativo)return null;
      return {
        produtoId:p.id,nomeProduto:p.nome,precoCatalogoCentavos:p.precoCentavos,
        fornecedorId:f.fornecedorId,sku:f.sku,
        custoFornecedorReal:null,
        valorParcelaLOOPDefinido:false,
        faturaPSPRealCriada:false,
        cobrancaReal:false
      };
    }).filter(Boolean);
    return {
      modo:'PRE_COTACAO_FISICA_SEM_PAGAMENTO',
      precosLivresDoCatalogo:true,
      fornecedorDeveSerCotadoExternamente:true,
      splitNaoCalculado:true,
      pedidosReaisCriados:false,
      produtos
    };
  }
  opcoes(){
    const usados=new Set(this.banco.prepare(
      'SELECT pagamento_id AS id FROM admin_pedidos_comerciais_demo'
    ).all().map(row=>row.id));
    for(const v of VINCULOS)usados.add(v.pagamentoId);
    const pagamentos=this.recebimentos.listar().pagamentos
      .filter(p=>!usados.has(p.pagamentoId)&&p.situacao==='AGUARDANDO_FICTICIO')
      .map(p=>({pagamentoId:p.pagamentoId,
        valorCentavos:p.valorCentavos,
        modoFornecedor:p.modo,
        fornecedorCentavos:p.fornecedorCentavos,
        parcelaLoopCentavos:p.parcelaLoopCentavos,
        sobraBrutaCentavos:p.sobraBrutaCentavos}));
    const produtos=this.catalogo.listar()
      .filter(p=>p.tipo==='FISICO'&&p.estado==='PUBLICADO'&&
        Number.isSafeInteger(p.precoCentavos)&&p.precoCentavos>0)
      .map(p=>{
        const vinculo=this.vinculosFornecedor.consultar({produtoId:p.id});
        if(!vinculo?.ativo)return null;
        return {produtoId:p.id,nome:p.nome,precoCentavos:p.precoCentavos,
          fornecedorId:vinculo.fornecedorId,sku:vinculo.sku};
      }).filter(Boolean);
    return {modo:'OPCOES_COMERCIAIS_FICTICIAS',
      somenteProdutosFisicosPublicados:true,
      semCheckout:true,semPagamentoReal:true,
      pagamentos,produtos};
  }
  registrar({pedidoId,produtoId,pagamentoId}={}){
    validarId(pedidoId,'pedidoId');
    validarId(produtoId,'produtoId');
    validarId(pagamentoId,'pagamentoId');
    this.banco.exec('BEGIN IMMEDIATE');
    try{
      const existente=this.banco.prepare(
        'SELECT * FROM admin_pedidos_comerciais_demo WHERE pedido_id=?'
      ).get(pedidoId);
      if(existente){
        if(existente.produto_id!==produtoId||existente.pagamento_id!==pagamentoId){
          throw erro('CONFLITO','ID de pedido ja utilizado com outras referencias');
        }
        this.banco.exec('COMMIT');
        return {repetido:true,pedido:this.comStatus(exposicao(existente))};
      }
      const pagamento=this.recebimentos.buscar(pagamentoId);
      if(!pagamento)throw erro('NAO_ENCONTRADO','Fatura ficticia desconhecida');
      const situacao=this.recebimentos.listar().pagamentos.find(p=>p.pagamentoId===pagamentoId);
      if(situacao?.situacao!=='AGUARDANDO_FICTICIO'){
        throw erro('CONFLITO','Fatura ficticia ja confirmada ou estornada');
      }
      if(VINCULOS.some(v=>v.pagamentoId===pagamentoId)||
         this.banco.prepare('SELECT 1 FROM admin_pedidos_comerciais_demo WHERE pagamento_id=?').get(pagamentoId)){
        throw erro('CONFLITO','Fatura ficticia ja vinculada a outro pedido');
      }
      const prod=this.catalogo.buscarRegistro(produtoId);
      if(!prod)throw erro('NAO_ENCONTRADO','Produto nao existe no catalogo');
      const item=prod.produto;
      if(item.tipo!=='FISICO'||item.estado!=='PUBLICADO'||
         !Number.isSafeInteger(item.precoCentavos)||item.precoCentavos<1){
        throw erro('INVALIDO','Apenas produto fisico publicado e com preco de teste');
      }
      const fornecedor=this.vinculosFornecedor.consultar({produtoId});
      if(!fornecedor?.ativo)throw erro('INVALIDO','Produto fisico sem fornecedor ativo de laboratorio');
      if(item.precoCentavos!==pagamento.valorCentavos){
        throw erro('INVALIDO','Preco do catalogo difere do valor da fatura ficticia');
      }
      if(pagamento.modo!==MODOS.SPLIT&&pagamento.modo!==MODOS.RESERVA){
        throw erro('INVALIDO','Modo de fornecedor ficticio desconhecido');
      }
      // A fatura fornece EXCLUSIVAMENTE uma divisao hipotetica (nao e cotacao real).
      if(pagamento.valorCentavos!==pagamento.fornecedorCentavos+
          pagamento.parcelaLoopCentavos+pagamento.sobraBrutaCentavos){
        throw erro('INVALIDO','Fatura ficticia nao esta conciliada');
      }
      const agora=new Date().toISOString();
      this.banco.prepare(`
        INSERT INTO admin_pedidos_comerciais_demo
          (pedido_id,produto_id,nome_produto,tipo_produto,revisao_produto,
           fornecedor_id,sku,revisao_fornecedor,pagamento_id,modo_fornecedor,
           preco_bruto_centavos,custo_fornecedor_exemplo_centavos,
           parcela_loop_exemplo_centavos,sobra_bruta_exemplo_centavos,criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(pedidoId,produtoId,item.nome,item.tipo,prod.revisao,
        fornecedor.fornecedorId,fornecedor.sku,fornecedor.revisao,
        pagamentoId,pagamento.modo,
        item.precoCentavos,pagamento.fornecedorCentavos,
        pagamento.parcelaLoopCentavos,pagamento.sobraBrutaCentavos,agora);
      this.banco.exec('COMMIT');
      return {repetido:false,pedido:this.buscar(pedidoId)};
    }catch(e){
      this.banco.exec('ROLLBACK');
      throw e;
    }
  }
}
module.exports={PedidosComerciaisDemoSQLite};
