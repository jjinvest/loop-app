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
function cotacaoValida(x,cotacaoId,ts){
 if(!x||x.cotacaoId!==cotacaoId||x.status!=='APROVADA'||
    !idOk(x.fornecedorId)||!Array.isArray(x.itens)||
    x.itens.length<1||x.itens.length>20||
    !Number.isSafeInteger(x.freteCentavos)||x.freteCentavos<0||
    !Number.isSafeInteger(x.expiraEm)||x.expiraEm<=ts||
    x.expiraEm>ts+24*3600*1000)erro('COTACAO_COMERCIAL_NAO_CONFIRMADA');
 const vistos=new Set();
 let soma=x.freteCentavos;
 const itens=x.itens.map(i=>{
  if(!i||typeof i!=='object'||Array.isArray(i)||
     typeof i.sku!=='string'||!SKU.test(i.sku)||
     !Number.isSafeInteger(i.quantidade)||i.quantidade<1||i.quantidade>50||
     !Number.isSafeInteger(i.precoUnitCentavos)||i.precoUnitCentavos<1||
     vistos.has(i.sku))erro('COTACAO_COMERCIAL_INVALIDA');
  vistos.add(i.sku);
  const valor=i.precoUnitCentavos*i.quantidade;
  if(!Number.isSafeInteger(valor)||valor>100000000)erro('COTACAO_COMERCIAL_INVALIDA');
  soma+=valor;
  return {sku:i.sku,quantidade:i.quantidade,precoUnitCentavos:i.precoUnitCentavos};
 });
 if(!Number.isSafeInteger(soma)||soma>100000000)
  erro('COTACAO_COMERCIAL_INVALIDA');
 return {fornecedorId:x.fornecedorId,cotacaoId,itens,
  freteCentavos:x.freteCentavos,valorTotalCentavos:soma};
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
  consultarPagamentoPsp,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32||
     typeof consultarCotacaoConfiavel!=='function'||
     typeof consultarPagamentoPsp!=='function'||
     typeof agora!=='function')erro('PEDIDOS_REAIS_NAO_CONFIGURADOS');
  this.db=banco;this.key=Buffer.from(chavePedidos);
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
   'ON loja_real_pedidos(titular_id,criado_em DESC);'
  ].join(' '));
 }
 _row(pedidoId){
  return this.db.prepare('SELECT * FROM loja_real_pedidos WHERE pedido_id=?')
   .get(pedidoId);
 }
 _publico(r){
  return {pedidoId:r.pedido_id,fornecedorId:r.fornecedor_id,
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
  // Cotacao e frete nunca chegam do browser; o backend busca valores no
  // parceiro ou catalogo comercial homologado antes de gravar o pedido.
  const preco=cotacaoValida(await this.cotacao({cotacaoId}),cotacaoId,this.agora());
  const payload={itens:preco.itens,enderecoEntrega:endereco(enderecoEntrega)};
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
   this.db.prepare([
    "UPDATE loja_real_pedidos SET status='CANCELADO',atualizado_em=?",
    "WHERE pedido_id=? AND status!='CANCELADO'"
   ].join(' ')).run(this.agora(),pedidoId);
   return {...this._publico(this._row(pedidoId)),cancelado:true};
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
   const confirmado=this._row(pedidoId);
   this.db.exec('COMMIT');
   return {...this._publico(confirmado),confirmado:true};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 consultarPedidoAprovado({pedidoId}={}){
  if(!idOk(pedidoId))erro('PEDIDO_INVALIDO');
  const r=this._row(pedidoId);
  if(!r)return null;
  const dados=decifrar(this.key,r);
  return {pedidoId:r.pedido_id,fornecedorId:r.fornecedor_id,
   status:r.status,pagamentoId:r.pagamento_id,
   valorTotalCentavos:r.valor_total_centavos,
   itens:dados.itens.map(x=>({sku:x.sku,quantidade:x.quantidade})),
   enderecoEntrega:dados.enderecoEntrega};
 }
}
module.exports={PedidosComerciaisSQLite};
