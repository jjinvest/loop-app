'use strict';
// Classificação de vitrine do pedido COMERCIAL, separada das cores da fila.
// Nunca cria posição, saldo, comissão, saque ou giro. O histórico de regras
// e a fotografia do carrinho são imutáveis no mesmo banco dos pedidos.
const CORES=new Set(['CINZA','VERDE','DOURADO','ROXO']);
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function inteiro(x,min,max){return Number.isSafeInteger(x)&&x>=min&&x<=max;}
const TABELAS_CLASSIFICACAO=Object.freeze([
 'loop_real_regras_cor','loop_real_regras_cor_historico',
 'loop_real_fotos_regras_pedido'
]);
class ClassificacaoComercialLoopSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')
   erro('CORES_COMERCIAIS_SEM_BANCO');
  this.db=banco;this.agora=agora;
  for(const tabela of ['loja_real_custos_pedido','loja_real_pedidos',
   'loja_real_produtos']){
   if(!banco.prepare([
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
   ].join(' ')).get(tabela))erro('CORES_COMERCIAIS_CATALOGO_INCOMPLETO');
  }
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_regras_cor(',
   'produto_id TEXT PRIMARY KEY REFERENCES loja_real_produtos(produto_id)',
   'ON DELETE RESTRICT,cor TEXT NOT NULL',
   "CHECK(cor IN ('CINZA','VERDE','DOURADO','ROXO')),",
   'minimo INTEGER NOT NULL CHECK(minimo BETWEEN 1 AND 50),',
   'roxas_por_unidade INTEGER NOT NULL CHECK(roxas_por_unidade BETWEEN 0 AND 10),',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0),',
   "CHECK((cor='ROXO')=(roxas_por_unidade>0)));",
   'CREATE TABLE IF NOT EXISTS loop_real_regras_cor_historico(',
   'produto_id TEXT NOT NULL REFERENCES loja_real_produtos(produto_id)',
   'ON DELETE RESTRICT,revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'cor TEXT NOT NULL CHECK(cor IN',
   "('CINZA','VERDE','DOURADO','ROXO')),",
   'minimo INTEGER NOT NULL,roxas_por_unidade INTEGER NOT NULL,',
   'registrado_em INTEGER NOT NULL,',
   'PRIMARY KEY(produto_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS loop_regras_cor_hist_sem_update',
   'BEFORE UPDATE ON loop_real_regras_cor_historico BEGIN',
   "SELECT RAISE(ABORT,'historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_regras_cor_hist_sem_delete',
   'BEFORE DELETE ON loop_real_regras_cor_historico BEGIN',
   "SELECT RAISE(ABORT,'historico imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS loop_real_fotos_regras_pedido(',
   'pedido_id TEXT NOT NULL,fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,',
   'produto_id TEXT,cor TEXT NOT NULL CHECK(cor IN',
   "('CINZA','VERDE','DOURADO','ROXO')),",
   'minimo INTEGER NOT NULL CHECK(minimo BETWEEN 1 AND 50),',
   'roxas_por_unidade INTEGER NOT NULL CHECK(roxas_por_unidade BETWEEN 0 AND 10),',
   'revisao INTEGER NOT NULL CHECK(revisao>=0),',
   'preco_unit_centavos INTEGER NOT NULL CHECK(preco_unit_centavos>0),',
   'quantidade INTEGER NOT NULL CHECK(quantidade>0),',
   'capturado_em INTEGER NOT NULL CHECK(capturado_em>0),',
   'PRIMARY KEY(pedido_id,fornecedor_id,sku),',
   'FOREIGN KEY(pedido_id,fornecedor_id,sku)',
   'REFERENCES loja_real_custos_pedido(pedido_id,fornecedor_id,sku)',
   'ON DELETE RESTRICT);',
   'CREATE TRIGGER IF NOT EXISTS loop_foto_regra_sem_update',
   'BEFORE UPDATE ON loop_real_fotos_regras_pedido BEGIN',
   "SELECT RAISE(ABORT,'fotografia imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_foto_regra_sem_delete',
   'BEFORE DELETE ON loop_real_fotos_regras_pedido BEGIN',
   "SELECT RAISE(ABORT,'fotografia imutavel'); END;"
  ].join(' '));
 }
 configurarProduto({produtoId,cor='CINZA',minimo=1,
  roxasPorUnidade=0,revisaoEsperada=0,autorizado=false}={}){
  if(autorizado!==true)erro('CORES_COMERCIAIS_ADMIN_OBRIGATORIO');
  if(typeof produtoId!=='string'||!ID.test(produtoId)||
     !CORES.has(cor)||!inteiro(minimo,1,50)||
     !inteiro(roxasPorUnidade,0,10)||
     (cor==='ROXO')!==(roxasPorUnidade>0)||
     !inteiro(revisaoEsperada,0,1000000))
   erro('CORES_COMERCIAIS_REGRA_INVALIDA');
  const ts=this.agora();
  if(!inteiro(ts,1,Number.MAX_SAFE_INTEGER))
   erro('CORES_COMERCIAIS_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(!this.db.prepare('SELECT 1 FROM loja_real_produtos WHERE produto_id=?')
    .get(produtoId))erro('CORES_COMERCIAIS_PRODUTO_INEXISTENTE');
   const anterior=this.db.prepare(
    'SELECT revisao FROM loop_real_regras_cor WHERE produto_id=?'
   ).get(produtoId);
   const versao=anterior?.revisao||0;
   if(versao!==revisaoEsperada)erro('CORES_COMERCIAIS_REVISAO_DIVERGENTE');
   const proxima=versao+1;
   this.db.prepare([
    'INSERT INTO loop_real_regras_cor(produto_id,cor,minimo,',
    'roxas_por_unidade,revisao,atualizado_em) VALUES(?,?,?,?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET cor=excluded.cor,',
    'minimo=excluded.minimo,roxas_por_unidade=excluded.roxas_por_unidade,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,cor,minimo,roxasPorUnidade,proxima,ts);
   this.db.prepare([
    'INSERT INTO loop_real_regras_cor_historico',
    '(produto_id,revisao,cor,minimo,roxas_por_unidade,registrado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,proxima,cor,minimo,roxasPorUnidade,ts);
   this.db.exec('COMMIT');
   return {produtoId,cor,revisao:proxima,
    nenhumaPosicaoRealCriada:true};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 capturarPedidoEmTransacao({pedidoId}={}){
  if(this.db.isTransaction!==true)erro('CORES_COMERCIAIS_EXIGEM_TRANSACAO');
  if(typeof pedidoId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(pedidoId))
   erro('CORES_COMERCIAIS_PEDIDO_INVALIDO');
  const pedido=this.db.prepare(
   'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
  ).get(pedidoId);
  if(pedido?.status!=='AGUARDANDO_PAGAMENTO')
   erro('CORES_COMERCIAIS_PEDIDO_NAO_CRIADO');
  const linhas=this.db.prepare([
   'SELECT pedido_id,fornecedor_id,sku,produto_id,',
   'preco_unit_centavos,quantidade,capturado_em',
   'FROM loja_real_custos_pedido WHERE pedido_id=?',
   'ORDER BY fornecedor_id,sku'
  ].join(' ')).all(pedidoId);
  if(!linhas.length)erro('CORES_COMERCIAIS_SEM_ITENS');
  const inserir=this.db.prepare([
   'INSERT INTO loop_real_fotos_regras_pedido',
   '(pedido_id,fornecedor_id,sku,produto_id,cor,minimo,',
   'roxas_por_unidade,revisao,preco_unit_centavos,quantidade,capturado_em)',
   'VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ].join(' '));
  let neutralizados=0;
  for(const l of linhas){
   const regra=l.produto_id?this.db.prepare(
    'SELECT cor,minimo,roxas_por_unidade,revisao',
    'FROM loop_real_regras_cor WHERE produto_id=?'
   ).get(l.produto_id):null;
   if(!regra)neutralizados++;
   if(regra?.cor==='DOURADO'&&l.preco_unit_centavos<25000)
    erro('CORES_COMERCIAIS_DOURADO_ABAIXO_PISO');
   inserir.run(l.pedido_id,l.fornecedor_id,l.sku,l.produto_id,
    regra?.cor||'CINZA',regra?.minimo||1,
    regra?.roxas_por_unidade||0,regra?.revisao||0,
    l.preco_unit_centavos,l.quantidade,l.capturado_em);
  }
  return {capturadas:linhas.length,
   semRegraExplicita:neutralizados,direitosReaisCriados:0};
 }
 avaliarPedido({pedidoId}={}){
  if(typeof pedidoId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(pedidoId))
   erro('CORES_COMERCIAIS_PEDIDO_INVALIDO');
  const linhas=this.db.prepare([
   'SELECT f.*,c.produto_id AS origem_produto,',
   'c.preco_unit_centavos AS origem_preco,',
   'c.quantidade AS origem_quantidade,',
   'c.capturado_em AS origem_tempo',
   'FROM loop_real_fotos_regras_pedido f JOIN loja_real_custos_pedido c',
   'ON c.pedido_id=f.pedido_id AND c.fornecedor_id=f.fornecedor_id',
   'AND c.sku=f.sku WHERE f.pedido_id=?'
  ].join(' ')).all(pedidoId);
  const total=this.db.prepare(
   'SELECT COUNT(*) AS n FROM loja_real_custos_pedido WHERE pedido_id=?'
  ).get(pedidoId).n;
  if(!total||linhas.length!==total||linhas.some(l=>
     l.produto_id!==l.origem_produto||
     l.preco_unit_centavos!==l.origem_preco||
     l.quantidade!==l.origem_quantidade||
     l.capturado_em!==l.origem_tempo))
   erro('CORES_COMERCIAIS_SNAPSHOT_DIVERGENTE');
  let verde=0,dourado=0,especiais=0,desconhecidos=0;
  const grupos=new Map();
  for(const l of linhas){
   const subtotal=l.preco_unit_centavos*l.quantidade;
   if(!Number.isSafeInteger(subtotal))
    erro('CORES_COMERCIAIS_TOTAL_INVALIDO');
   if(l.revisao===0)desconhecidos++;
   if(l.cor==='VERDE'){
    const k=l.produto_id;
    const g=grupos.get(k)||{quantidade:0,total:0,minimo:l.minimo};
    if(g.minimo!==l.minimo)erro('CORES_COMERCIAIS_REGRA_DIVERGENTE');
    g.quantidade+=l.quantidade;g.total+=subtotal;grupos.set(k,g);
   }
   if(l.cor==='DOURADO'){
    if(l.preco_unit_centavos<25000)
     erro('CORES_COMERCIAIS_DOURADO_ABAIXO_PISO');
    dourado+=l.quantidade;
   }
   if(l.cor==='ROXO')especiais+=l.quantidade*l.roxas_por_unidade;
  }
  for(const g of grupos.values())if(g.quantidade>=g.minimo)verde+=g.total;
  const posicoesVerdes=verde>=25000?1:0;
  const previstas=posicoesVerdes+dourado;
  return {pedidoId,resultado:'PREVISAO_SEM_ATIVACAO',
   posicoesVerdesPrevistas:posicoesVerdes,
   posicoesDouradasPrevistas:dourado,
   posicoesRoxasBloqueadas:especiais,
   totalPosicoesPrevistas:previstas,
   ultrapassaDezPorCompra:previstas>10,
   itensSemRegraExplicita:desconhecidos,
   eventosEspeciaisNaoHomologados:especiais>0,
   aguardandoConciliacaoFinanceira:true,
   posicoesReaisCriadas:0,autorizadoParaGiro:false,financeiroReal:false};
 }
 verificar(){
  const pedidos=this.db.prepare(
   'SELECT DISTINCT pedido_id FROM loop_real_fotos_regras_pedido'
  ).all();
  let linhas=0;
  for(const p of pedidos){
   const res=this.avaliarPedido({pedidoId:p.pedido_id});
   if(res.posicoesReaisCriadas!==0||res.financeiroReal!==false)
    erro('CORES_COMERCIAIS_DIREITOS_INVALIDOS');
   linhas+=this.db.prepare(
    'SELECT COUNT(*) AS n FROM loop_real_fotos_regras_pedido WHERE pedido_id=?'
   ).get(p.pedido_id).n;
  }
  // Todo pedido deve possuir uma fotografia, mesmo quando tudo é cinza.
  const semFoto=this.db.prepare([
   'SELECT COUNT(*) AS n FROM loja_real_pedidos p',
   'WHERE NOT EXISTS(SELECT 1 FROM loop_real_fotos_regras_pedido f',
   'WHERE f.pedido_id=p.pedido_id)'
  ].join(' ')).get().n;
  if(semFoto)erro('CORES_COMERCIAIS_PEDIDOS_SEM_SNAPSHOT');
  return {integridade:'OK',pedidos:pedidos.length,linhas,
   direitosReaisCriados:0};
 }
}
module.exports={ClassificacaoComercialLoopSQLite,TABELAS_CLASSIFICACAO};
