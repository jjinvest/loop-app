'use strict';

// PLANEJAMENTO LOCAL: custo de fornecedor INFORMADO pelo administrador,
// estudo de margem e pre-pedido com preco variavel. NAO e cotacao
// contratual, PSP, split, logistica, venda nem posicao de fila.
const RESERVA_REFERENCIAL_LOOP=10000;
const ID=/^[a-z0-9][a-z0-9-]{2,70}$/;
const PRODUTO=/^[a-z0-9-]{3,80}$/;
function falha(codigo,mensagem){const e=new Error(mensagem);e.codigo=codigo;return e;}
function validar(id,re,campo){
 if(typeof id!=='string'||!re.test(id))throw falha('INVALIDO',campo+' invalido');
}
function centavos(v,campo){
 if(!Number.isSafeInteger(v)||v<=0||v>1_000_000_000)throw falha('INVALIDO',campo+' deve ser valor positivo em centavos');
}
function snapshot(r){
 if(!r)return null;
 return {
  pedidoId:r.pedido_id,pagamentoIntentoTesteId:r.pagamento_intento_teste_id,
  produtoId:r.produto_id,nomeProduto:r.nome_produto,
  revisaoProduto:r.revisao_produto,
  fornecedorId:r.fornecedor_id,sku:r.sku,
  revisaoVinculoFornecedor:r.revisao_vinculo_fornecedor,
  revisaoCustoTeste:r.revisao_custo_teste,
  precoCatalogoCentavos:r.preco_catalogo_centavos,
  custoFornecedorTesteCentavos:r.custo_fornecedor_teste_centavos,
  reservaReferencialLoopCentavos:r.reserva_referencial_loop_centavos,
  margemBrutaPreliminarCentavos:r.margem_bruta_preliminar_centavos,
  criadoEm:r.criado_em,
  apenasPrePedido:true,pagamentoFicticioAguardando:true,
  pagamentoRealEfetuado:false,fornecedorRealAvisado:false,
  taxaDePagamentoContabilizada:false,impostosContabilizados:false,
  reservaRealEfetuada:false,cofresMovimentados:false,
  posicaoCriada:false,catracaMovimentada:false,snapshotImutavel:true
 };
}
class PlanejamentoVendasFisicasDemoSQLite{
 constructor({repositorioCatalogo,vinculosFornecedor}={}){
  const db=repositorioCatalogo?.banco;
  if(!db||typeof db.prepare!=='function'||vinculosFornecedor?.banco!==db){
   throw new TypeError('Catalogo e fornecedores da mesma base SQLite sao obrigatorios');
  }
  this.banco=db;this.catalogo=repositorioCatalogo;this.fornecedores=vinculosFornecedor;
  db.exec(`
   CREATE TABLE IF NOT EXISTS admin_custos_fornecedor_demo (
    produto_id TEXT PRIMARY KEY NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,
    revisao_vinculo INTEGER NOT NULL CHECK(revisao_vinculo>=1),
    custo_centavos INTEGER NOT NULL CHECK(custo_centavos>0),
    revisao INTEGER NOT NULL CHECK(revisao>=1),
    atualizado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_custos_fornecedor_historico_demo (
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    revisao INTEGER NOT NULL,
    fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,
    revisao_vinculo INTEGER NOT NULL,
    custo_centavos INTEGER NOT NULL,
    registrado_em TEXT NOT NULL,
    UNIQUE(produto_id,revisao)
   );
   CREATE TRIGGER IF NOT EXISTS admin_custos_demo_hist_sem_update
    BEFORE UPDATE ON admin_custos_fornecedor_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico custo ficticio imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_custos_demo_hist_sem_delete
    BEFORE DELETE ON admin_custos_fornecedor_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico custo ficticio imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_pre_pedidos_fisicos_demo (
    pedido_id TEXT PRIMARY KEY NOT NULL,
    pagamento_intento_teste_id TEXT UNIQUE NOT NULL,
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    nome_produto TEXT NOT NULL,
    revisao_produto INTEGER NOT NULL,
    fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,
    revisao_vinculo_fornecedor INTEGER NOT NULL,
    revisao_custo_teste INTEGER NOT NULL,
    preco_catalogo_centavos INTEGER NOT NULL CHECK(preco_catalogo_centavos>0),
    custo_fornecedor_teste_centavos INTEGER NOT NULL CHECK(custo_fornecedor_teste_centavos>0),
    reserva_referencial_loop_centavos INTEGER NOT NULL CHECK(reserva_referencial_loop_centavos=10000),
    margem_bruta_preliminar_centavos INTEGER NOT NULL CHECK(margem_bruta_preliminar_centavos>0),
    criado_em TEXT NOT NULL,
    CHECK(preco_catalogo_centavos =
      custo_fornecedor_teste_centavos+reserva_referencial_loop_centavos+
      margem_bruta_preliminar_centavos)
   );
   CREATE TRIGGER IF NOT EXISTS admin_pre_pedidos_fisicos_demo_no_update
    BEFORE UPDATE ON admin_pre_pedidos_fisicos_demo
    BEGIN SELECT RAISE(ABORT,'pre pedido fisico demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pre_pedidos_fisicos_demo_no_delete
    BEFORE DELETE ON admin_pre_pedidos_fisicos_demo
    BEGIN SELECT RAISE(ABORT,'pre pedido fisico demo imutavel'); END;
  `);
 }
 custo(produtoId){
  validar(produtoId,PRODUTO,'produtoId');
  const r=this.banco.prepare('SELECT * FROM admin_custos_fornecedor_demo WHERE produto_id=?').get(produtoId);
  if(!r)return null;
  const ativo=this.fornecedores.consultar({produtoId});
  return {
   produtoId:r.produto_id,fornecedorId:r.fornecedor_id,sku:r.sku,
   revisaoVinculo:r.revisao_vinculo,custoCentavos:r.custo_centavos,
   revisao:r.revisao,atualizadoEm:r.atualizado_em,
   vinculoAindaCorresponde:!!ativo?.ativo&&ativo.fornecedorId===r.fornecedor_id&&
    ativo.sku===r.sku&&ativo.revisao===r.revisao_vinculo,
   custoRealVerificado:false,valorSomenteInformadoNoLaboratorio:true
  };
 }
 historicoCustos(produtoId){
  validar(produtoId,PRODUTO,'produtoId');
  return this.banco.prepare(`
    SELECT revisao,fornecedor_id AS fornecedorId,sku,
     revisao_vinculo AS revisaoVinculo,
     custo_centavos AS custoCentavos, registrado_em AS registradoEm
    FROM admin_custos_fornecedor_historico_demo
    WHERE produto_id=? ORDER BY revisao
  `).all(produtoId);
 }
 registrarCusto({produtoId,custoCentavos,revisaoEsperada}={}){
  validar(produtoId,PRODUTO,'produtoId');
  centavos(custoCentavos,'custoCentavos');
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0){
   throw falha('INVALIDO','revisaoEsperada invalida');
  }
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const produto=this.catalogo.buscarRegistro(produtoId);
   if(!produto)throw falha('NAO_ENCONTRADO','Produto inexistente');
   if(produto.produto.tipo!=='FISICO')throw falha('INVALIDO','Somente produto fisico possui custo externo');
   const vinculo=this.fornecedores.consultar({produtoId});
   if(!vinculo?.ativo)throw falha('INVALIDO','Produto sem fornecedor de teste ativo');
   const anterior=this.banco.prepare('SELECT * FROM admin_custos_fornecedor_demo WHERE produto_id=?').get(produtoId);
   if((anterior?.revisao||0)!==revisaoEsperada)throw falha('CONFLITO','Revisao de custo mudou');
   if(anterior&&anterior.fornecedor_id===vinculo.fornecedorId&&anterior.sku===vinculo.sku&&
      anterior.revisao_vinculo===vinculo.revisao&&anterior.custo_centavos===custoCentavos){
    this.banco.exec('COMMIT');
    return {alterado:false,custo:this.custo(produtoId)};
   }
   const revisao=revisaoEsperada+1;
   const agora=new Date().toISOString();
   if(anterior){
    this.banco.prepare(`
     UPDATE admin_custos_fornecedor_demo SET
     fornecedor_id=?,sku=?,revisao_vinculo=?,custo_centavos=?,revisao=?,atualizado_em=?
     WHERE produto_id=?
    `).run(vinculo.fornecedorId,vinculo.sku,vinculo.revisao,custoCentavos,revisao,agora,produtoId);
   }else{
    this.banco.prepare(`
     INSERT INTO admin_custos_fornecedor_demo
     (produto_id,fornecedor_id,sku,revisao_vinculo,custo_centavos,revisao,atualizado_em)
     VALUES (?,?,?,?,?,?,?)
    `).run(produtoId,vinculo.fornecedorId,vinculo.sku,vinculo.revisao,custoCentavos,revisao,agora);
   }
   this.banco.prepare(`
    INSERT INTO admin_custos_fornecedor_historico_demo
    (produto_id,revisao,fornecedor_id,sku,revisao_vinculo,custo_centavos,registrado_em)
    VALUES (?,?,?,?,?,?,?)
   `).run(produtoId,revisao,vinculo.fornecedorId,vinculo.sku,vinculo.revisao,custoCentavos,agora);
   this.banco.exec('COMMIT');
   return {alterado:true,custo:this.custo(produtoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 diagnostico(produtoId){
  validar(produtoId,PRODUTO,'produtoId');
  const registro=this.catalogo.buscarRegistro(produtoId);
  if(!registro)return null;
  const p=registro.produto;
  const v=p.tipo==='FISICO'?this.fornecedores.consultar({produtoId}):null;
  const c=p.tipo==='FISICO'?this.custo(produtoId):null;
  const preco=p.precoCentavos;
  const valido=p.tipo==='FISICO'&&p.estado==='PUBLICADO'&&
    Number.isSafeInteger(preco)&&preco>0&&v?.ativo&&c?.vinculoAindaCorresponde;
  const margem=valido?preco-c.custoCentavos-RESERVA_REFERENCIAL_LOOP:null;
  const estado=p.tipo!=='FISICO'?'NAO_FISICO':p.estado!=='PUBLICADO'?'NAO_PUBLICADO':
    !v?.ativo?'SEM_FORNECEDOR':
    !c?'SEM_CUSTO_TESTE':!c.vinculoAindaCorresponde?'CUSTO_DESATUALIZADO':
    margem<=0?'MARGEM_PRELIMINAR_INSUFICIENTE':'PRE_PEDIDO_FICTICIO_POSSIVEL';
  return {
   produtoId:p.id,nomeProduto:p.nome,estadoCatalogo:p.estado,tipo:p.tipo,
   revisaoProduto:registro.revisao,
   precoCatalogoCentavos:preco,
   fornecedorId:v?.fornecedorId||null,sku:v?.sku||null,
   revisaoVinculoFornecedor:v?.revisao??null,
   custoFornecedorTesteCentavos:c?.custoCentavos??null,
   revisaoCustoTeste:c?.revisao??0,
   custoAindaCorresponde:!!c?.vinculoAindaCorresponde,
   reservaReferencialLoopCentavos:RESERVA_REFERENCIAL_LOOP,
   margemBrutaPreliminarCentavos:margem,
   situacao:estado,
   somenteSimulacao:true,custoContratadoComFornecedor:false,
   taxaPagamentoIncluida:false,impostosIncluidos:false,
   margemLiquidaGarantida:false,repasseOuSplitReal:false,
   posicaoCriada:false
  };
 }
 listarProdutos(){
  return {
   modo:'PLANEJAMENTO_DE_PRECOS_FISICOS_FICTICIO',
   custoFornecedorNaoVerificado:true,reservaSomenteReferencial:true,
   semPSP:true,semCompraReal:true,semCatraca:true,
   produtos:this.catalogo.listar().filter(p=>p.tipo==='FISICO').map(p=>this.diagnostico(p.id))
  };
 }
 buscarPrePedido(pedidoId){
  validar(pedidoId,ID,'pedidoId');
  return snapshot(this.banco.prepare('SELECT * FROM admin_pre_pedidos_fisicos_demo WHERE pedido_id=?').get(pedidoId));
 }
 listarPrePedidos(){
  return {modo:'PRE_PEDIDOS_FISICOS_SEM_COBRANCA',pagamentosReais:false,cofresMovimentados:false,
   pedidos:this.banco.prepare('SELECT * FROM admin_pre_pedidos_fisicos_demo ORDER BY criado_em,pedido_id')
    .all().map(snapshot)};
 }
 criarPrePedido({pedidoId,produtoId,revisaoProduto,revisaoCustoTeste}={}){
  validar(pedidoId,ID,'pedidoId');validar(produtoId,PRODUTO,'produtoId');
  if(!Number.isSafeInteger(revisaoProduto)||revisaoProduto<1||
     !Number.isSafeInteger(revisaoCustoTeste)||revisaoCustoTeste<1) {
   throw falha('INVALIDO','Revisoes de preco e custo obrigatorias');
  }
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare('SELECT * FROM admin_pre_pedidos_fisicos_demo WHERE pedido_id=?').get(pedidoId);
   if(anterior){
    if(anterior.produto_id!==produtoId||anterior.revisao_produto!==revisaoProduto||
       anterior.revisao_custo_teste!==revisaoCustoTeste){
     throw falha('CONFLITO','ID de pre-pedido usado com referencias diferentes');
    }
    this.banco.exec('COMMIT');
    return {repetido:true,pedido:snapshot(anterior)};
   }
   // IDs sao globais dentro deste laboratorio, inclusive nos modulos antigos.
   // Em teste unitario esta base pode nao conter os outros modulos;
   // no escritorio completo, a mesma validacao impede colisoes de IDs.
   for(const tabela of ['admin_pedidos_comerciais_demo','admin_pdf_demo_pedidos']){
    const existeTabela=this.banco.prepare(
     "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tabela);
    if(existeTabela){
     const existePedido=this.banco.prepare(
      'SELECT 1 FROM '+tabela+' WHERE pedido_id=?'
     ).get(pedidoId);
     if(existePedido)throw falha('CONFLITO','ID ja associado a outro tipo de pedido');
    }
   }
   const d=this.diagnostico(produtoId);
   if(!d)throw falha('NAO_ENCONTRADO','Produto inexistente');
   if(d.revisaoProduto!==revisaoProduto||d.revisaoCustoTeste!==revisaoCustoTeste) {
    throw falha('CONFLITO','Produto ou custo atualizado; recarregue a simulacao');
   }
   if(d.situacao!=='PRE_PEDIDO_FICTICIO_POSSIVEL') {
    throw falha('INVALIDO','Sem margem preliminar positiva e fornecedor ativo de teste');
   }
   const pagamentoId='intent-fisico-'+pedidoId;
   this.banco.prepare(`
    INSERT INTO admin_pre_pedidos_fisicos_demo
     (pedido_id,pagamento_intento_teste_id,produto_id,nome_produto,revisao_produto,
      fornecedor_id,sku,revisao_vinculo_fornecedor,revisao_custo_teste,
      preco_catalogo_centavos,custo_fornecedor_teste_centavos,
      reserva_referencial_loop_centavos,margem_bruta_preliminar_centavos,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(pedidoId,pagamentoId,produtoId,d.nomeProduto,d.revisaoProduto,
    d.fornecedorId,d.sku,d.revisaoVinculoFornecedor,d.revisaoCustoTeste,
    d.precoCatalogoCentavos,d.custoFornecedorTesteCentavos,
    d.reservaReferencialLoopCentavos,d.margemBrutaPreliminarCentavos,
    new Date().toISOString());
   this.banco.exec('COMMIT');
   return {repetido:false,pedido:this.buscarPrePedido(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={PlanejamentoVendasFisicasDemoSQLite,RESERVA_REFERENCIAL_LOOP};
