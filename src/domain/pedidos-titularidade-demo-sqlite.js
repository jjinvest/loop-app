'use strict';

// Pedido identificado APENAS em laboratorio: o titular e fixado ANTES da
// verificacao interna de pagamento. Sem checkout, cobranca ou rota publica.
const {randomUUID}=require('node:crypto');

function falha(codigo,mensagem){
 const erro=new Error(mensagem);erro.codigo=codigo;return erro;
}
function validarId(x,campo){
 if(typeof x!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(x)){
  throw falha('PEDIDO_INVALIDO',campo+' invalido');
 }
 return x;
}
function contaIdOk(x){
 if(typeof x!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)){
  throw falha('PEDIDO_INVALIDO','Identidade ficticia invalida');
 }
 return x;
}
function centavos(valor){
 if(!Number.isSafeInteger(valor)||valor<=0){
  throw falha('PEDIDO_INVALIDO','Valor de teste invalido');
 }
 return valor;
}
function exportar(linha){
 if(!linha)return null;
 return {
  pedidoId:linha.pedido_id,
  contaId:linha.conta_id,
  produtoId:linha.produto_id,
  valorCentavos:linha.valor_centavos,
  intentoPagamentoId:linha.intento_pagamento_id,
  criadoEm:linha.criado_em
 };
}
class PedidosTitularidadeDemoSQLite{
 constructor({banco,contas,relogio=()=>new Date().toISOString()}={}){
  if(!banco||typeof banco.prepare!=='function'||
    !contas||contas.banco!==banco||typeof contas.buscar!=='function'){
   throw new TypeError('Cadastro e SQLite do mesmo laboratorio sao obrigatorios');
  }
  if(typeof relogio!=='function')throw new TypeError('Relogio interno obrigatorio');
  this.banco=banco;
  this.contas=contas;
  this.relogio=relogio;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_pedidos_titularidade_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    produto_id TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
    intento_pagamento_id TEXT NOT NULL UNIQUE,
    criado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_pedidos_titularidade_conta_demo
    ON admin_pedidos_titularidade_demo(conta_id,criado_em);
   CREATE TRIGGER IF NOT EXISTS admin_pedidos_titularidade_demo_no_update
    BEFORE UPDATE ON admin_pedidos_titularidade_demo
    BEGIN SELECT RAISE(ABORT,'titularidade de pedido ficticio imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_pedidos_titularidade_demo_no_delete
    BEFORE DELETE ON admin_pedidos_titularidade_demo
    BEGIN SELECT RAISE(ABORT,'titularidade de pedido ficticio imutavel'); END;
  `);
 }
 preparar({pedidoId,contaId,produtoId,valorCentavos}={}){
  validarId(pedidoId,'pedidoId');
  contaIdOk(contaId);
  validarId(produtoId,'produtoId');
  centavos(valorCentavos);
  // So scripts/testes internos podem chamar este metodo. Identidade
  // cliente no HTTP NAO pode ser prova de titularidade de pedido.
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.buscar(pedidoId);
   if(anterior){
    if(anterior.contaId!==contaId||
      anterior.produtoId!==produtoId||
      anterior.valorCentavos!==valorCentavos){
     throw falha('PEDIDO_IMUTAVEL','Pedido ja vinculado a outro titular, produto ou valor');
    }
    this.banco.exec('COMMIT');
    return {...anterior,repetido:true};
   }
   if(!this.contas.buscar(contaId)){
    throw falha('TITULAR_DESCONHECIDO','Conta de teste nao cadastrada');
   }
   const criadoEm=this.relogio();
   if(typeof criadoEm!=='string'||!Number.isFinite(Date.parse(criadoEm))||
     new Date(criadoEm).toISOString()!==criadoEm){
    throw falha('PEDIDO_INVALIDO','Horario interno invalido');
   }
   const intentoPagamentoId='intent-demo-'+randomUUID();
   this.banco.prepare(`
    INSERT INTO admin_pedidos_titularidade_demo(
     pedido_id,conta_id,produto_id,valor_centavos,intento_pagamento_id,criado_em
    ) VALUES(?,?,?,?,?,?)
   `).run(pedidoId,contaId,produtoId,valorCentavos,intentoPagamentoId,criadoEm);
   this.banco.exec('COMMIT');
   return {pedidoId,contaId,produtoId,valorCentavos,
    intentoPagamentoId,criadoEm,repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 buscar(pedidoId){
  validarId(pedidoId,'pedidoId');
  return exportar(this.banco.prepare(`
   SELECT pedido_id,conta_id,produto_id,valor_centavos,
    intento_pagamento_id,criado_em
   FROM admin_pedidos_titularidade_demo WHERE pedido_id=?
  `).get(pedidoId));
 }
 conferir(comprovante){
  if(!comprovante||typeof comprovante!=='object'||Array.isArray(comprovante)){
   throw falha('VINCULO_DIVERGENTE','Comprovante interno invalido');
  }
  const pedido=this.buscar(comprovante.pedidoId);
  if(!pedido){
   throw falha('PEDIDO_NAO_PREPARADO','Pedido ficticio inexistente antes do pagamento');
  }
  if(pedido.contaId!==comprovante.contaId||
    pedido.produtoId!==comprovante.produtoId||
    pedido.valorCentavos!==comprovante.valorCentavos||
    pedido.intentoPagamentoId!==comprovante.intentoPagamentoId){
   throw falha('VINCULO_DIVERGENTE','Comprovante nao corresponde ao pedido predefinido');
  }
  if(typeof comprovante.confirmadoEm!=='string'||
    !Number.isFinite(Date.parse(comprovante.confirmadoEm))||
    Date.parse(comprovante.confirmadoEm)<Date.parse(pedido.criadoEm)){
   throw falha('DATA_DIVERGENTE','Confirmacao anterior a preparacao do pedido');
  }
  return pedido;
 }
 listarResumo(){
  const linhas=this.banco.prepare(`
   SELECT pedido_id AS pedidoId,conta_id AS contaId,
    produto_id AS produtoId,valor_centavos AS valorCentavos
   FROM admin_pedidos_titularidade_demo ORDER BY criado_em,pedido_id
  `).all();
  return {modo:'PEDIDOS_IDENTIFICADOS_APENAS_DE_TESTE',pedidos:linhas,
   dinheiroReal:false,contasComCPF:false,semPagamentoExterno:true};
 }
}
module.exports={PedidosTitularidadeDemoSQLite};
