'use strict';
// Reserva lógica de ENTREGAS FICTÍCIAS, nunca um download, frete, direito
// real ou pedido comercial. Depende do RECEIVED confirmado por GET ao PSP.
// Não consumir webhooks como confirmação suficiente.
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^[a-zA-Z0-9_-]{6,80}$/;
const PRODUTO=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function lerSnapshot(json,total){
 let itens;
 try{itens=JSON.parse(json);}catch{falha('FOTOGRAFIA_CORROMPIDA');}
 if(!Array.isArray(itens)||itens.length<1||itens.length>20)
  falha('FOTOGRAFIA_CORROMPIDA');
 const vistos=new Set();
 let soma=0;
 for(const i of itens){
  if(typeof i?.produtoId!=='string'||!PRODUTO.test(i.produtoId)||
     vistos.has(i.produtoId)||!['PDF','FISICO'].includes(i.tipo)||
     !Number.isSafeInteger(i.quantidade)||i.quantidade<1||i.quantidade>50||
     !Number.isSafeInteger(i.precoUnitarioCentavos)||
     i.precoUnitarioCentavos<1||
     !Number.isSafeInteger(i.subtotalCentavos)||
     i.subtotalCentavos!==i.quantidade*i.precoUnitarioCentavos)
   falha('FOTOGRAFIA_CORROMPIDA');
  vistos.add(i.produtoId);
  soma+=i.subtotalCentavos;
  if(!Number.isSafeInteger(soma))falha('FOTOGRAFIA_CORROMPIDA');
 }
 if(soma!==total)falha('TOTAL_ITENS_DIVERGENTE');
 return itens;
}
class EntregasPrePedidosAsaasSandboxStaging{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')falha('ENTREGA_STAGING_PROIBIDA');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_entregas_sandbox_staging(',
   'prepedido_id TEXT NOT NULL REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'produto_id TEXT NOT NULL,titular_id TEXT NOT NULL,',
   "tipo TEXT NOT NULL CHECK(tipo IN ('PDF','FISICO')),",
   'quantidade INTEGER NOT NULL CHECK(quantidade BETWEEN 1 AND 50),',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'pagamento_id TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado='APTA_SIMULADA_SEM_ENTREGA'),",
   'criado_em TEXT NOT NULL,',
   'PRIMARY KEY(prepedido_id,produto_id));',
   'CREATE TRIGGER IF NOT EXISTS entregas_sandbox_no_update',
   'BEFORE UPDATE ON akitemm_prepedido_entregas_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'entrega simulada imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS entregas_sandbox_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_entregas_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'entrega simulada imutavel'); END;"
  ].join(' '));
 }
 _validar(titularId,prepedidoId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))
   falha('SESSAO_INVALIDA');
  if(typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
 }
 _pedido(titularId,prepedidoId){
  return this.banco.prepare([
   'SELECT p.titular_id,p.prepedido_id,p.fotografia_json,p.total_centavos,',
   'a.pagamento_id,a.estado',
   'FROM akitemm_checkout_prepedidos_staging p',
   'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging a',
   'ON a.prepedido_id=p.prepedido_id AND a.titular_id=p.titular_id',
   'WHERE p.prepedido_id=? AND p.titular_id=?'
  ].join(' ')).get(prepedidoId,titularId);
 }
 consultar({titularId,prepedidoId}={}){
  this._validar(titularId,prepedidoId);
  const pedido=this._pedido(titularId,prepedidoId);
  if(!pedido)return null;
  const confirma=consultarPedido({banco:this.banco,titularId,prepedidoId});
  const itens=this.banco.prepare([
   'SELECT produto_id AS produtoId,tipo,quantidade,',
   'valor_centavos AS valorCentavos,estado',
   'FROM akitemm_prepedido_entregas_sandbox_staging',
   'WHERE prepedido_id=? AND titular_id=? ORDER BY produto_id'
  ].join(' ')).all(prepedidoId,titularId);
  const liberado=confirma?.conferenciaPSPConcluida===true&&
    confirma.exigeRevisaoManual!==true&&
    confirma.ultimoStatusPSP==='RECEIVED'&&
    confirma.estadoSandbox==='RECEBIMENTO_INFORMADO_SANDBOX';
  return {prepedidoId,preparacaoSimulada:itens.length>0,
   status:!liberado?(
      confirma?.exigeRevisaoManual===true||itens.length>0
       ?'BLOQUEADA_PARA_REVISAO_SANDBOX'
       :'AGUARDANDO_RECONSULTA_PSP_SANDBOX'
    ):itens.length?'APTA_SIMULADA_SEM_ENTREGA':'AINDA_NAO_PREPARADA',
   quantidadeLinhas:itens.length,itens,
   habilitadaParaEntregaReal:false,downloadRealHabilitado:false,
   pedidoComercial:false,produtoFisicoExpedido:false,
   pagamentoReal:false,consultaPSPExecutadaNestaLeitura:false};
 }
 preparar({titularId,prepedidoId,autorizado=false}={}){
  if(process.env.NODE_ENV==='production'||autorizado!==true)
   falha('PREPARACAO_ENTREGA_NAO_AUTORIZADA');
  this._validar(titularId,prepedidoId);
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const pedido=this._pedido(titularId,prepedidoId);
   if(!pedido)falha('PREPEDIDO_NAO_ENCONTRADO');
   const confirma=consultarPedido({banco:this.banco,titularId,prepedidoId});
   if(confirma?.conferenciaPSPConcluida!==true||
      confirma?.exigeRevisaoManual===true||
      confirma?.ultimoStatusPSP!=='RECEIVED'||
      pedido.estado!=='RECEBIMENTO_INFORMADO_SANDBOX'||
      typeof pedido.pagamento_id!=='string')
    falha('RECEBIMENTO_PSP_NAO_COMPROVADO');
   const itens=lerSnapshot(pedido.fotografia_json,pedido.total_centavos);
   const ja=this.banco.prepare([
    'SELECT produto_id,tipo,quantidade,valor_centavos,pagamento_id',
    'FROM akitemm_prepedido_entregas_sandbox_staging',
    'WHERE prepedido_id=?'
   ].join(' ')).all(prepedidoId);
   if(ja.length){
    if(ja.length!==itens.length||ja.some(p=>{
     const i=itens.find(x=>x.produtoId===p.produto_id);
     return !i||p.tipo!==i.tipo||p.quantidade!==i.quantidade||
      p.valor_centavos!==i.subtotalCentavos||
      p.pagamento_id!==pedido.pagamento_id;
    }))falha('ENTREGA_SIMULADA_DIVERGENTE');
    this.banco.exec('COMMIT');
    return {repetido:true,...this.consultar({titularId,prepedidoId})};
   }
   const data=this.agora();
   if(typeof data!=='string'||!Number.isFinite(Date.parse(data)))
    falha('RELOGIO_INVALIDO');
   for(const i of itens){
    this.banco.prepare([
     'INSERT INTO akitemm_prepedido_entregas_sandbox_staging',
     '(prepedido_id,produto_id,titular_id,tipo,quantidade,',
     "valor_centavos,pagamento_id,estado,criado_em)",
     "VALUES(?,?,?,?,?,?,?,'APTA_SIMULADA_SEM_ENTREGA',?)"
    ].join(' ')).run(prepedidoId,i.produtoId,titularId,i.tipo,
     i.quantidade,i.subtotalCentavos,pedido.pagamento_id,data);
   }
   this.banco.exec('COMMIT');
   return {repetido:false,...this.consultar({titularId,prepedidoId})};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={EntregasPrePedidosAsaasSandboxStaging};
