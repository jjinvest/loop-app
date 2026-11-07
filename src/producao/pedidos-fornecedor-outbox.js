'use strict';
// Envio de pedidos fisicos pago/conciliado ao fornecedor, preparado mas
// NAO montado em rotas HTTP. Sem fornecedor/documentacao/PSP real, nao envia nada.
// Outbox duravel: crash apos POST externo nao reenvia pedido ambiguo.
const {createHash,createHmac,randomBytes,
 createCipheriv,createDecipheriv}=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const SKU=/^[A-Za-z0-9_-]{1,80}$/;
const ESTADOS=new Set(['PENDENTE','INDETERMINADO','ENVIADO']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validoId(s){return typeof s==='string'&&ID.test(s);}
function itensValidos(itens){
 if(!Array.isArray(itens)||itens.length<1||itens.length>20)
  falha('ITENS_FORNECEDOR_INVALIDOS');
 const vistos=new Set();
 return itens.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
     !SKU.test(x.sku)||!Number.isSafeInteger(x.quantidade)||
     x.quantidade<1||x.quantidade>50||vistos.has(x.sku))
   falha('ITENS_FORNECEDOR_INVALIDOS');
  vistos.add(x.sku);
  return {sku:x.sku,quantidade:x.quantidade};
 });
}
function enderecoValido(x){
 if(!x||typeof x!=='object'||Array.isArray(x))falha('ENDERECO_INVALIDO');
 const campos=['destinatario','cep','logradouro','numero','bairro','cidade','uf','complemento'];
 if(Object.keys(x).some(k=>!campos.includes(k)))falha('ENDERECO_INVALIDO');
 const limites={destinatario:90,logradouro:120,numero:20,bairro:100,
  cidade:100,complemento:120};
 const endereco={};
 for(const [nome,max] of Object.entries(limites)){
  const valor=x[nome];
  if(nome==='complemento'&&valor===undefined){endereco[nome]='';continue;}
  if(typeof valor!=='string'||valor.trim().length<(nome==='complemento'?0:1)||
     valor.length>max||/[\x00-\x1f\x7f]/.test(valor))
   falha('ENDERECO_INVALIDO');
  endereco[nome]=valor.trim();
 }
 if(typeof x.cep!=='string'||!/^[0-9]{5}-?[0-9]{3}$/.test(x.cep)||
    typeof x.uf!=='string'||!/^[A-Z]{2}$/.test(x.uf))
  falha('ENDERECO_INVALIDO');
 return {destinatario:endereco.destinatario,cep:x.cep.replace('-',''),
  logradouro:endereco.logradouro,numero:endereco.numero,
  bairro:endereco.bairro,cidade:endereco.cidade,uf:x.uf,
  complemento:endereco.complemento};
}
function cifra(key,txt){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from('AKITEMM-FORNECEDOR-OUTBOX-V1'));
 const ct=Buffer.concat([c.update(txt,'utf8'),c.final()]);
 return {iv:iv.toString('hex'),ct:ct.toString('hex'),
  tag:c.getAuthTag().toString('hex')};
}
function decifra(key,row){
 const c=createDecipheriv('aes-256-gcm',key,Buffer.from(row.payload_iv,'hex'));
 c.setAAD(Buffer.from('AKITEMM-FORNECEDOR-OUTBOX-V1'));
 c.setAuthTag(Buffer.from(row.payload_tag,'hex'));
 return JSON.parse(Buffer.concat([
  c.update(Buffer.from(row.payload_ct,'hex')),c.final()
 ]).toString('utf8'));
}
function hash(txt){return createHash('sha256').update(txt).digest('hex');}
class PedidosFornecedorOutbox {
 constructor({banco,registro,consultarPagamentoConciliado,chavePedidos,
  agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof registro?.obter!=='function'||
     typeof consultarPagamentoConciliado!=='function'||
     !Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32||
     typeof agora!=='function')falha('DEPENDENCIAS_OUTBOX_OBRIGATORIAS');
  this.db=banco;this.registro=registro;
  this.consultarPagamentoConciliado=consultarPagamentoConciliado;
  this.key=Buffer.from(chavePedidos);this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_outbox_fornecedor(',
   'pedido_id TEXT NOT NULL,fornecedor_id TEXT NOT NULL,',
   'pagamento_id TEXT NOT NULL,valor_pago_centavos INTEGER NOT NULL,',
   'chave_idempotencia TEXT NOT NULL UNIQUE,',
   'payload_hash TEXT NOT NULL,payload_iv TEXT NOT NULL,',
   'payload_ct TEXT NOT NULL,payload_tag TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado IN ('PENDENTE','INDETERMINADO','ENVIADO')),",
   'pedido_parceiro_id TEXT,criado_em INTEGER NOT NULL,atualizado_em INTEGER NOT NULL,',
   'PRIMARY KEY(pedido_id,fornecedor_id));',
   'CREATE INDEX IF NOT EXISTS idx_loja_real_outbox_estado',
   'ON loja_real_outbox_fornecedor(estado,atualizado_em);'
  ].join(' '));
 }
 _row(id,fornecedorId){
  return this.db.prepare([
   'SELECT * FROM loja_real_outbox_fornecedor WHERE pedido_id=? AND fornecedor_id=?'
  ].join(' ')).get(id,fornecedorId);
 }
 _publico(row){
  return {pedidoId:row.pedido_id,fornecedorId:row.fornecedor_id,
   estado:row.estado,pedidoParceiroId:row.pedido_parceiro_id,
   revisaoManual:row.estado==='INDETERMINADO',
   criadoEm:row.criado_em,atualizadoEm:row.atualizado_em};
 }
 consultar({pedidoId,fornecedorId}={}){
  if(!validoId(pedidoId)||!validoId(fornecedorId))
   falha('PEDIDO_FORNECEDOR_INVALIDO');
  const row=this._row(pedidoId,fornecedorId);
  return row?this._publico(row):null;
 }
 async registrarPagamentoConciliado({pedidoId,fornecedorId,itens,enderecoEntrega}={}){
  if(!validoId(pedidoId)||!validoId(fornecedorId))
   falha('PEDIDO_FORNECEDOR_INVALIDO');
  // A chamada deve retornar de componente de reconsulta autenticada do PSP
  // com pedidoId exato e valor real; o browser nao fornece uma confirmacao.
  const prova=await this.consultarPagamentoConciliado({pedidoId});
  if(!prova||prova.pedidoId!==pedidoId||
     prova.status!=='CONFIRMADO'||prova.moeda!=='BRL'||
     !validoId(prova.pagamentoId)||
     !Number.isSafeInteger(prova.valorCentavos)||prova.valorCentavos<=0)
   falha('PAGAMENTO_PSP_NAO_CONCILIADO');
  const payload={itens:itensValidos(itens),
   enderecoEntrega:enderecoValido(enderecoEntrega)};
  const texto=JSON.stringify(payload),sumario=hash(texto),enc=cifra(this.key,texto);
  const ts=this.agora(),idempotencia=createHmac('sha256',this.key)
   .update('FORNECEDOR:'+pedidoId+':'+fornecedorId).digest('hex');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this._row(pedidoId,fornecedorId);
   if(anterior){
    if(anterior.payload_hash!==sumario||
       anterior.pagamento_id!==prova.pagamentoId||
       anterior.valor_pago_centavos!==prova.valorCentavos)
     falha('PEDIDO_FORNECEDOR_CONFLITO');
    this.db.exec('COMMIT');
    return {...this._publico(anterior),repetido:true};
   }
   this.db.prepare([
    'INSERT INTO loja_real_outbox_fornecedor(',
    'pedido_id,fornecedor_id,pagamento_id,valor_pago_centavos,',
    'chave_idempotencia,payload_hash,payload_iv,payload_ct,payload_tag,',
    'estado,criado_em,atualizado_em)',
    "VALUES(?,?,?,?,?,?,?,?,?,'PENDENTE',?,?)"
   ].join(' ')).run(pedidoId,fornecedorId,prova.pagamentoId,
    prova.valorCentavos,idempotencia,sumario,enc.iv,enc.ct,enc.tag,ts,ts);
   const novo=this._row(pedidoId,fornecedorId);
   this.db.exec('COMMIT');
   return {...this._publico(novo),repetido:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async despachar({pedidoId,fornecedorId}={}){
  if(!validoId(pedidoId)||!validoId(fornecedorId))
   falha('PEDIDO_FORNECEDOR_INVALIDO');
  const adaptador=this.registro.obter(fornecedorId);
  if(typeof adaptador.enviarPedidoIdempotente!=='function')
   falha('API_FORNECEDOR_SEM_ENVIO_IDEMPOTENTE');
  let payload,row;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   row=this._row(pedidoId,fornecedorId);
   if(!row)falha('PEDIDO_FORNECEDOR_NAO_ENCONTRADO');
   if(row.estado==='ENVIADO'){
    this.db.exec('COMMIT');return {...this._publico(row),repetido:true};
   }
   if(row.estado!=='PENDENTE')
    falha('ENVIO_FORNECEDOR_REQUER_RECONCILIACAO');
   payload=decifra(this.key,row);
   this.db.prepare([
    "UPDATE loja_real_outbox_fornecedor SET estado='INDETERMINADO',",
    'atualizado_em=? WHERE pedido_id=? AND fornecedor_id=?'
   ].join(' ')).run(this.agora(),pedidoId,fornecedorId);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  let resposta;
  try{
   resposta=await adaptador.enviarPedidoIdempotente({
    pedidoLojaId:pedidoId,chaveIdempotencia:row.chave_idempotencia,
    itens:payload.itens,enderecoEntrega:payload.enderecoEntrega
   });
  }catch{falha('ENVIO_FORNECEDOR_INDETERMINADO');}
  if(!validoId(resposta?.pedidoParceiroId))
   falha('ENVIO_FORNECEDOR_INDETERMINADO');
  this.db.prepare([
   "UPDATE loja_real_outbox_fornecedor SET estado='ENVIADO',",
   'pedido_parceiro_id=?,atualizado_em=?',
   "WHERE pedido_id=? AND fornecedor_id=? AND estado='INDETERMINADO'"
  ].join(' ')).run(resposta.pedidoParceiroId,this.agora(),pedidoId,fornecedorId);
  return {...this.consultar({pedidoId,fornecedorId}),repetido:false};
 }
 async reconciliar({pedidoId,fornecedorId}={}){
  const row=this._row(pedidoId,fornecedorId);
  if(!row)falha('PEDIDO_FORNECEDOR_NAO_ENCONTRADO');
  if(row.estado!=='INDETERMINADO')return this._publico(row);
  const adaptador=this.registro.obter(fornecedorId);
  if(typeof adaptador.consultarPedidoPorChave!=='function')
   falha('API_FORNECEDOR_SEM_CONSULTA_IDEMPOTENTE');
  let resposta;
  try{
   resposta=await adaptador.consultarPedidoPorChave({
    chaveIdempotencia:row.chave_idempotencia
   });
  }catch{falha('RECONCILIACAO_FORNECEDOR_INDETERMINADA');}
  if(resposta?.encontrado!==true||!validoId(resposta.pedidoParceiroId))
   return this._publico(row); // nunca reenviar automaticamente
  this.db.prepare([
   "UPDATE loja_real_outbox_fornecedor SET estado='ENVIADO',",
   'pedido_parceiro_id=?,atualizado_em=?',
   "WHERE pedido_id=? AND fornecedor_id=? AND estado='INDETERMINADO'"
  ].join(' ')).run(resposta.pedidoParceiroId,this.agora(),pedidoId,fornecedorId);
  return this.consultar({pedidoId,fornecedorId});
 }
}
module.exports={PedidosFornecedorOutbox};
