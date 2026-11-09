'use strict';
// Fonte de verdade imutavel do pedido comercial. Recebe PRECO/FRETE de
// cotacao confiavel do servidor, e confirma pagamento por RECONSULTA no PSP.
// Nao emite Pix, nao ativa loop, nao realiza saque e NAO tem rota publica.
const {createHmac,randomUUID,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const SKU=/^[A-Za-z0-9_-]{1,80}$/;
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const MODOS=new Set(['AGUARDANDO_PAGAMENTO','APROVADO_PARA_EXPEDICAO','CANCELADO']);
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const idOk=x=>typeof x==='string'&&ID.test(x);
function endereco(x){
 if(!x||typeof x!=='object'||Array.isArray(x))erro('ENDERECO_INVALIDO');
 const keys=['destinatario','cep','logradouro','numero','bairro','cidade','uf','complemento'];
 if(Object.keys(x).some(k=>!keys.includes(k)))erro('ENDERECO_INVALIDO');
 const out={};
 for(const k of ['destinatario','logradouro','numero','bairro','cidade']){
  if(typeof x[k]!=='string'||x[k].trim().length<1||x[k].length>120||
     /[\x00-\x1f\x7f]/.test(x[k]))erro('ENDERECO_INVALIDO');
  out[k]=x[k].trim();
 }
 if(typeof x.cep!=='string'||!/^[0-9]{5}-?[0-9]{3}$/.test(x.cep)||
    typeof x.uf!=='string'||!/^[A-Z]{2}$/.test(x.uf))
  erro('ENDERECO_INVALIDO');
 if(x.complemento!==undefined&&(typeof x.complemento!=='string'||
    x.complemento.length>120||/[\x00-\x1f\x7f]/.test(x.complemento)))
  erro('ENDERECO_INVALIDO');
 return {...out,cep:x.cep.replace('-',''),uf:x.uf,
  complemento:(x.complemento||'').trim()};
}
function cotacaoValida(x,cotacaoId,titularId,cepDestino,ts){
 if(!x||x.cotacaoId!==cotacaoId||x.titularId!==titularId||
    x.cepDestino!==cepDestino||x.status!=='APROVADA'||
    !Number.isSafeInteger(x.expiraEm)||x.expiraEm<=ts||
    x.expiraEm>ts+24*3600*1000)erro('COTACAO_COMERCIAL_NAO_CONFIRMADA');
 // Cada distribuidor tem sua lista de SKUs e frete. O carrinho possui
 // um único total e uma única cobrança, mesmo com várias remessas.
 const multiplo=Object.hasOwn(x,'grupos');
 if(multiplo&&(
    Object.hasOwn(x,'fornecedorId')||
    Object.hasOwn(x,'itens')||Object.hasOwn(x,'freteCentavos')))
  erro('COTACAO_COMERCIAL_INVALIDA');
 const fontes=multiplo?x.grupos:[{
  fornecedorId:x.fornecedorId,itens:x.itens,freteCentavos:x.freteCentavos
 }];
 if(!Array.isArray(fontes)||fontes.length<1||fontes.length>25)
  erro('COTACAO_COMERCIAL_INVALIDA');
 const fornecedores=new Set();
 let quantidadeItens=0,totalFrete=0,totalGeral=0;
 const grupos=fontes.map(grupo=>{
  if(!grupo||typeof grupo!=='object'||Array.isArray(grupo)||
     !idOk(grupo.fornecedorId)||fornecedores.has(grupo.fornecedorId)||
     !Array.isArray(grupo.itens)||grupo.itens.length<1||
     grupo.itens.length>50||!Number.isSafeInteger(grupo.freteCentavos)||
     grupo.freteCentavos<0||grupo.freteCentavos>10000000)
   erro('COTACAO_COMERCIAL_INVALIDA');
  fornecedores.add(grupo.fornecedorId);
  quantidadeItens+=grupo.itens.length;
  if(quantidadeItens>100)erro('COTACAO_COMERCIAL_INVALIDA');
  const vistos=new Set();
  let valorProdutos=0;
  const itens=grupo.itens.map(i=>{
   if(!i||typeof i!=='object'||Array.isArray(i)||
      typeof i.sku!=='string'||!SKU.test(i.sku)||
      !Number.isSafeInteger(i.quantidade)||i.quantidade<1||
      i.quantidade>50||!Number.isSafeInteger(i.precoUnitCentavos)||
      i.precoUnitCentavos<1||vistos.has(i.sku))
    erro('COTACAO_COMERCIAL_INVALIDA');
   vistos.add(i.sku);
   const valor=i.precoUnitCentavos*i.quantidade;
   if(!Number.isSafeInteger(valor)||valor>100000000)
    erro('COTACAO_COMERCIAL_INVALIDA');
   valorProdutos+=valor;
   return {sku:i.sku,quantidade:i.quantidade,
    precoUnitCentavos:i.precoUnitCentavos};
  });
  totalFrete+=grupo.freteCentavos;
  totalGeral+=valorProdutos+grupo.freteCentavos;
  return {fornecedorId:grupo.fornecedorId,itens,
   freteCentavos:grupo.freteCentavos};
 });
 if(!Number.isSafeInteger(totalGeral)||totalGeral>100000000)
  erro('COTACAO_COMERCIAL_INVALIDA');
 return {fornecedorId:grupos.length===1?grupos[0].fornecedorId:'MULTIPLOS',
  cotacaoId,grupos,freteCentavos:totalFrete,
  valorTotalCentavos:totalGeral};
}
function cifrar(k,dado){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);
 c.setAAD(Buffer.from('AKITEMM-PEDIDO-REAL-V1'));
 const ct=Buffer.concat([c.update(JSON.stringify(dado)),c.final()]);
 return {iv:iv.toString('hex'),ct:ct.toString('hex'),
  tag:c.getAuthTag().toString('hex')};
}
function decifrar(k,r){
 const c=createDecipheriv('aes-256-gcm',k,Buffer.from(r.payload_iv,'hex'));
 c.setAAD(Buffer.from('AKITEMM-PEDIDO-REAL-V1'));
 c.setAuthTag(Buffer.from(r.payload_tag,'hex'));
 return JSON.parse(Buffer.concat([
  c.update(Buffer.from(r.payload_ct,'hex')),c.final()
 ]).toString('utf8'));
}
class PedidosComerciaisSQLite{
 constructor({banco,chavePedidos,consultarCotacaoConfiavel,
  consultarPagamentoPsp,manutencao=null,eventosComerciais=null,
  classificacaoLoop=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32||
     typeof consultarCotacaoConfiavel!=='function'||
     typeof consultarPagamentoPsp!=='function'||
     typeof agora!=='function')erro('PEDIDOS_REAIS_NAO_CONFIGURADOS');
  if(manutencao!==null&&(manutencao.db!==banco||
    typeof manutencao.garantirOperacaoDisponivel!=='function'))
   erro('MANUTENCAO_PEDIDOS_NAO_CONFIGURADA');
  if(eventosComerciais!==null&&(
    eventosComerciais.db!==banco||
    typeof eventosComerciais.registrarPagamentoConciliadoEmTransacao!=='function'||
    typeof eventosComerciais.registrarCancelamentoEmTransacao!=='function'))
   erro('EVENTOS_COMERCIAIS_BANCO_DIVERGENTE');
  this.db=banco;this.key=Buffer.from(chavePedidos);
  if(classificacaoLoop!==null&&(
    classificacaoLoop.db!==banco||
    typeof classificacaoLoop.capturarPedidoEmTransacao!=='function'))
   erro('CORES_COMERCIAIS_BANCO_DIVERGENTE');
  this.classificacaoLoop=classificacaoLoop;
  this.eventosComerciais=eventosComerciais;
  this.manutencao=manutencao;
  this.cotacao=consultarCotacaoConfiavel;
  this.psp=consultarPagamentoPsp;
  this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_pedidos(',
   'pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'fornecedor_id TEXT NOT NULL,cotacao_id TEXT NOT NULL UNIQUE,',
   'idempotencia_hmac TEXT NOT NULL UNIQUE,',
   'payload_iv TEXT NOT NULL,payload_ct TEXT NOT NULL,payload_tag TEXT NOT NULL,',
   'frete_centavos INTEGER NOT NULL,valor_total_centavos INTEGER NOT NULL,',
   "status TEXT NOT NULL CHECK(status IN ('AGUARDANDO_PAGAMENTO',",
   "'APROVADO_PARA_EXPEDICAO','CANCELADO')),",
   'pagamento_id TEXT UNIQUE,criado_em INTEGER NOT NULL,atualizado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loja_real_pedidos_titular',
   'ON loja_real_pedidos(titular_id,criado_em DESC);',
   // Snapshot imutável da composição econômica no MOMENTO da venda.
   // O custo NÃO está na API pública e NÃO representa despesa quitada.
   'CREATE TABLE IF NOT EXISTS loja_real_custos_pedido(',
   'pedido_id TEXT NOT NULL REFERENCES loja_real_pedidos(pedido_id)',
   'ON DELETE RESTRICT,fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,',
   'produto_id TEXT,custo_unit_centavos INTEGER',
   'CHECK(custo_unit_centavos IS NULL OR custo_unit_centavos>=0),',
   'revisao_custo INTEGER,preco_unit_centavos INTEGER NOT NULL',
   'CHECK(preco_unit_centavos>0),',
   'quantidade INTEGER NOT NULL CHECK(quantidade>0),',
   'capturado_em INTEGER NOT NULL,',
   'PRIMARY KEY(pedido_id,fornecedor_id,sku));',
   'CREATE TRIGGER IF NOT EXISTS loja_real_custos_pedido_inalteravel_u',
   'BEFORE UPDATE ON loja_real_custos_pedido BEGIN',
   "SELECT RAISE(ABORT,'SNAPSHOT_CUSTO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loja_real_custos_pedido_inalteravel_d',
   'BEFORE DELETE ON loja_real_custos_pedido BEGIN',
   "SELECT RAISE(ABORT,'SNAPSHOT_CUSTO_IMUTAVEL'); END;"
  ].join(' '));
 }
 _row(pedidoId){
  return this.db.prepare('SELECT * FROM loja_real_pedidos WHERE pedido_id=?')
   .get(pedidoId);
 }
 _capturarCustoDoCarrinho(pedidoId,grupos,ts){
  // Mesma transação SQLite da criação da compra: nunca consultar custos
  // atuais para calcular a margem de uma venda antiga.
  const catalogoExiste=!!this.db.prepare([
   "SELECT 1 AS ok FROM sqlite_master",
   "WHERE type='table' AND name='loja_real_ofertas_distribuidores'"
  ].join(' ')).get();
  const custosExistem=!!this.db.prepare([
   "SELECT 1 AS ok FROM sqlite_master",
   "WHERE type='table' AND name='loja_real_custos_ofertas'"
  ].join(' ')).get();
  // Produto precisa ser identificado mesmo quando ainda não foi cadastrado
  // custo no painel administrativo. Nunca transformar SKU desconhecido em verde.
  const select=catalogoExiste?this.db.prepare(custosExistem?[
   'SELECT o.produto_id,c.custo_unit_centavos,c.revisao',
   'FROM loja_real_ofertas_distribuidores o',
   'LEFT JOIN loja_real_custos_ofertas c ON',
   'c.produto_id=o.produto_id AND c.distribuidor_id=o.distribuidor_id',
   'AND c.sku=o.sku',
   'WHERE o.distribuidor_id=? AND o.sku=?'
  ].join(' '):[
   'SELECT o.produto_id,NULL AS custo_unit_centavos,NULL AS revisao',
   'FROM loja_real_ofertas_distribuidores o',
   'WHERE o.distribuidor_id=? AND o.sku=?'
  ].join(' ')):null;
  const add=this.db.prepare([
   'INSERT INTO loja_real_custos_pedido(',
   'pedido_id,fornecedor_id,sku,produto_id,custo_unit_centavos,',
   'revisao_custo,preco_unit_centavos,quantidade,capturado_em)',
   'VALUES(?,?,?,?,?,?,?,?,?)'
  ].join(' '));
  for(const grupo of grupos){
   for(const item of grupo.itens){
    const origem=select?.get(grupo.fornecedorId,item.sku)||null;
    add.run(pedidoId,grupo.fornecedorId,item.sku,
     origem?.produto_id||null,origem?.custo_unit_centavos??null,
     origem?.revisao??null,item.precoUnitCentavos,item.quantidade,ts);
   }
  }
 }
 _custosCongelados(pedidoId,linhasEsperadas){
  const c=this.db.prepare([
   'SELECT COUNT(*) AS linhas,',
   'SUM(CASE WHEN custo_unit_centavos IS NULL THEN 1 ELSE 0 END) AS faltantes,',
   'SUM(quantidade*custo_unit_centavos) AS custo_total',
   'FROM loja_real_custos_pedido WHERE pedido_id=?'
  ].join(' ')).get(pedidoId);
  const completos=c.linhas===linhasEsperadas&&c.faltantes===0&&
   Number.isSafeInteger(c.custo_total);
  return {custoFornecedorEstimadoCentavos:completos?c.custo_total:null,
   custoFornecedorIntegralmenteInformado:completos,
   linhasSemCustoInformado:c.linhas===linhasEsperadas?
    c.faltantes:linhasEsperadas};
 }
 _publico(r){
  const dados=decifrar(this.key,r);
  const grupos=dados.grupos||[{
   fornecedorId:r.fornecedor_id,itens:dados.itens,
   freteCentavos:r.frete_centavos
  }];
  return {pedidoId:r.pedido_id,
   fornecedorId:grupos.length===1?grupos[0].fornecedorId:null,
   fornecedores:grupos.map(g=>g.fornecedorId),
   quantidadeDistribuidores:grupos.length,
   cotacaoId:r.cotacao_id,status:r.status,
   valorTotalCentavos:r.valor_total_centavos,
   freteCentavos:r.frete_centavos,
   criadoEm:r.criado_em,atualizadoEm:r.atualizado_em};
 }
 consultarDoTitular({pedidoId,titularId}={}){
  if(!idOk(pedidoId)||typeof titularId!=='string'||!TITULAR.test(titularId))
   erro('PEDIDO_INVALIDO');
  const r=this.db.prepare([
   'SELECT * FROM loja_real_pedidos WHERE pedido_id=? AND titular_id=?'
  ].join(' ')).get(pedidoId,titularId);
  return r?this._publico(r):null;
 }
 listarDoTitular({titularId,limite=30}={}){
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     !Number.isInteger(limite)||limite<1||limite>50)
   erro('PEDIDO_INVALIDO');
  return this.db.prepare([
   'SELECT * FROM loja_real_pedidos WHERE titular_id=?',
   'ORDER BY criado_em DESC,rowid DESC LIMIT ?'
  ].join(' ')).all(titularId,limite).map(x=>this._publico(x));
 }
 async criarPedido({titularId,cotacaoId,chaveIdempotencia,enderecoEntrega}={}){
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     !idOk(cotacaoId)||!idOk(chaveIdempotencia))erro('PEDIDO_INVALIDO');
  const hash=createHmac('sha256',this.key)
   .update('PEDIDO:'+chaveIdempotencia).digest('hex');
  const anterior=this.db.prepare(
   'SELECT * FROM loja_real_pedidos WHERE idempotencia_hmac=?'
  ).get(hash);
  if(anterior){
   if(anterior.titular_id!==titularId||anterior.cotacao_id!==cotacaoId)
    erro('IDEMPOTENCIA_PEDIDO_CONFLITO');
   return {...this._publico(anterior),repetido:true};
  }
  if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
  // Cotacao e frete nunca chegam do browser; o backend busca valores no
  // parceiro ou catalogo comercial homologado antes de gravar o pedido.
  const entrega=endereco(enderecoEntrega);
  // Cotacao deve pertencer ao mesmo titular e ao MESMO CEP final de envio.
  // Impede reaproveitar frete de outro carrinho ou de outro destino.
  const preco=cotacaoValida(
   await this.cotacao({cotacaoId,titularId}),
   cotacaoId,titularId,entrega.cep,this.agora()
  );
  const payload={grupos:preco.grupos,enderecoEntrega:entrega};
  const cifrado=cifrar(this.key,payload);
  const ts=this.agora();
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.db.prepare(
    'SELECT * FROM loja_real_pedidos WHERE idempotencia_hmac=?'
   ).get(hash);
   if(atual){
    if(atual.titular_id!==titularId||atual.cotacao_id!==cotacaoId)
     erro('IDEMPOTENCIA_PEDIDO_CONFLITO');
    this.db.exec('COMMIT');
    return {...this._publico(atual),repetido:true};
   }
   if(this.manutencao)this.manutencao.garantirOperacaoDisponivel();
   // A mesma cotacao nao deve ser usada para outro titular/checkout.
   if(this.db.prepare(
    'SELECT pedido_id FROM loja_real_pedidos WHERE cotacao_id=?'
   ).get(cotacaoId))erro('COTACAO_JA_UTILIZADA');
   const titular=this.db.prepare(
    'SELECT email_confirmado_em FROM loop_real_contas WHERE id=?'
   ).get(titularId);
   if(!titular||titular.email_confirmado_em===null)
    erro('EMAIL_REAL_NAO_VERIFICADO');
   const pedidoId='PEDIDO_'+randomUUID().replaceAll('-','');
   this.db.prepare([
    'INSERT INTO loja_real_pedidos(',
    'pedido_id,titular_id,fornecedor_id,cotacao_id,idempotencia_hmac,',
    'payload_iv,payload_ct,payload_tag,frete_centavos,valor_total_centavos,',
    'status,criado_em,atualizado_em)',
    "VALUES(?,?,?,?,?,?,?,?,?,?,'AGUARDANDO_PAGAMENTO',?,?)"
   ].join(' ')).run(pedidoId,titularId,preco.fornecedorId,cotacaoId,
    hash,cifrado.iv,cifrado.ct,cifrado.tag,
    preco.freteCentavos,preco.valorTotalCentavos,ts,ts);
   this._capturarCustoDoCarrinho(pedidoId,preco.grupos,ts);
   if(this.classificacaoLoop)
    this.classificacaoLoop.capturarPedidoEmTransacao({pedidoId});
   const novo=this._row(pedidoId);
   this.db.exec('COMMIT');
   return {...this._publico(novo),repetido:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async confirmarPagamento({pedidoId}={}){
  if(!idOk(pedidoId))erro('PEDIDO_INVALIDO');
  const atual=this._row(pedidoId);
  if(!atual)erro('PEDIDO_NAO_ENCONTRADO');
  // A confirmacao aqui e a reconsulta de um servico PSP autorizado,
  // nunca um corpo JSON com status escolhido pelo cliente.
  const prova=await this.psp({pedidoId});
  if(!prova||prova.pedidoId!==pedidoId||
     prova.moeda!=='BRL')erro('PAGAMENTO_PSP_NAO_CONCILIADO');
  if(['CANCELADO','ESTORNADO'].includes(prova.status)){
   this.db.exec('BEGIN IMMEDIATE');
   try{
    const atual=this._row(pedidoId);
    if(atual.pagamento_id!==null&&prova.pagamentoId!==atual.pagamento_id)
     erro('PAGAMENTO_DIVERGENTE');
    this.db.prepare([
     "UPDATE loja_real_pedidos SET status='CANCELADO',atualizado_em=?",
     "WHERE pedido_id=? AND status!='CANCELADO'"
    ].join(' ')).run(this.agora(),pedidoId);
    if(this.eventosComerciais)
     this.eventosComerciais.registrarCancelamentoEmTransacao({pedidoId});
    const cancelado=this._publico(this._row(pedidoId));
    this.db.exec('COMMIT');
    return {...cancelado,cancelado:true};
   }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  if(prova.status!=='CONFIRMADO'||!idOk(prova.pagamentoId)||
     prova.valorCentavos!==atual.valor_total_centavos)
   erro('PAGAMENTO_PSP_NAO_CONCILIADO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this._row(pedidoId);
   if(row.status==='CANCELADO')erro('PEDIDO_CANCELADO');
   if(row.pagamento_id!==null&&row.pagamento_id!==prova.pagamentoId)
    erro('PAGAMENTO_DIVERGENTE');
   if(row.valor_total_centavos!==prova.valorCentavos)
    erro('PAGAMENTO_PSP_NAO_CONCILIADO');
   if(row.status==='AGUARDANDO_PAGAMENTO')
    this.db.prepare([
     "UPDATE loja_real_pedidos SET status='APROVADO_PARA_EXPEDICAO',",
     'pagamento_id=?,atualizado_em=? WHERE pedido_id=?'
    ].join(' ')).run(prova.pagamentoId,this.agora(),pedidoId);
   if(this.eventosComerciais)
    this.eventosComerciais.registrarPagamentoConciliadoEmTransacao({
     pedidoId,pagamentoId:prova.pagamentoId
    });
   const confirmado=this._row(pedidoId);
   this.db.exec('COMMIT');
   return {...this._publico(confirmado),confirmado:true};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 // Relatório administrativo SEM nomes, documentos, endereço ou qualquer
 // cálculo tributário. Estado de pagamento significa status do pedido,
 // não comprovação contábil de repasse do PSP ao banco.
 listarResumoContabil({limite=500}={}){
  if(!Number.isInteger(limite)||limite<1||limite>1000)
   erro('PAGINACAO_INVALIDA');
  return this.db.prepare([
   'SELECT * FROM loja_real_pedidos',
   'ORDER BY criado_em DESC,pedido_id DESC LIMIT ?'
  ].join(' ')).all(limite).map(r=>{
   const d=decifrar(this.key,r);
   const grupos=d.grupos||[{
    fornecedorId:r.fornecedor_id,itens:d.itens,
    freteCentavos:r.frete_centavos
   }];
   const itens=grupos.flatMap(g=>g.itens.map(i=>({
    fornecedorId:g.fornecedorId,sku:i.sku,
    quantidade:i.quantidade,precoUnitCentavos:i.precoUnitCentavos
   })));
   let somaItens=0;
   for(const i of itens){
    if(!Number.isSafeInteger(i.precoUnitCentavos)||
       !Number.isSafeInteger(i.quantidade))
     erro('PEDIDO_HISTORICO_INVALIDO');
    somaItens+=i.precoUnitCentavos*i.quantidade;
   }
   if(somaItens+r.frete_centavos!==r.valor_total_centavos)
    erro('PEDIDO_HISTORICO_INCONSISTENTE');
   const snapshot=this._custosCongelados(r.pedido_id,itens.length);
   return {
    pedidoId:r.pedido_id,status:r.status,
    pagamentoId:r.pagamento_id,
    criadoEm:r.criado_em,ultimaAtualizacaoEm:r.atualizado_em,
    receitaProdutosCentavos:somaItens,
    // Diferença bruta é estimativa antes de taxas, tributos e fretes
    // PAGOS ao distribuidor, e NUNCA saldo disponível para o LOOP.
    ...snapshot,
    diferencaBrutaEstimadaCentavos:
     snapshot.custoFornecedorIntegralmenteInformado?
      somaItens-snapshot.custoFornecedorEstimadoCentavos:null,
    freteCobradoClienteCentavos:r.frete_centavos,
    valorTotalPedidoCentavos:r.valor_total_centavos,
    distribuidores:grupos.map(g=>g.fornecedorId),
    quantidadeItens:itens.reduce((a,i)=>a+i.quantidade,0),
    // Pagar o distribuidor, custo de frete, PSP, tributos, notas e
    // comprovantes reais precisam de reconciliação independente.
    despesasLiquidadasConferidas:false,
    tributosCalculados:false,
    resultadoLiquidoApurado:false
   };
  });
 }
 consultarPedidoAprovado({pedidoId,fornecedorId}={}){
  if(!idOk(pedidoId))erro('PEDIDO_INVALIDO');
  const r=this._row(pedidoId);
  if(!r)return null;
  const dados=decifrar(this.key,r);
  const grupos=dados.grupos||[{
  fornecedorId:r.fornecedor_id,itens:dados.itens,
  freteCentavos:r.frete_centavos
 }];
 const selecionado=fornecedorId===undefined?
  (grupos.length===1?grupos[0]:null):
  grupos.find(g=>g.fornecedorId===fornecedorId);
 if(!selecionado)return null;
 return {pedidoId:r.pedido_id,fornecedorId:selecionado.fornecedorId,
  status:r.status,pagamentoId:r.pagamento_id,
  // Pagamento conciliado contra o VALOR TOTAL do carrinho, não a
  // parcela individual de um dos distribuidores.
  valorTotalCentavos:r.valor_total_centavos,
  freteFornecedorCentavos:selecionado.freteCentavos,
  itens:selecionado.itens.map(x=>({sku:x.sku,quantidade:x.quantidade})),
  enderecoEntrega:dados.enderecoEntrega};
 }
}
module.exports={PedidosComerciaisSQLite};
