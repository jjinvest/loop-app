'use strict';

// Um pedido = um carrinho, soma dos itens = valor unico de qualificacao.
// Valores dos itens sao buscados no catalogo, nunca declarados pelo cliente.
// Somente laboratorio administrativo, sem cobranca ou entregas reais.
const {STATUS_CONFIRMADO}=require('./processador-pedidos-simulados');
const ID=/^[a-z0-9][a-z0-9-]{2,69}$/;
const PRODUTO_VIRTUAL='carrinho-loop-demo';
function falha(codigo,mensagem){const e=new Error(mensagem);e.codigo=codigo;return e;}
function idValido(id){
 if(typeof id!=='string'||!ID.test(id))throw falha('INVALIDO','ID de pedido invalido');
}
function validarLista(itens){
 if(!Array.isArray(itens)||itens.length===0||itens.length>20)
  throw falha('INVALIDO','Carrinho deve ter de 1 a 20 itens');
 const ids=new Set();
 return itens.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||
   Object.keys(item).sort().join(',')!=='produtoId,quantidade'||
   typeof item.produtoId!=='string'||!ID.test(item.produtoId)||
   !Number.isSafeInteger(item.quantidade)||item.quantidade<1||item.quantidade>100)
   throw falha('INVALIDO','Item ou quantidade invalida');
  if(ids.has(item.produtoId))throw falha('INVALIDO','Produto repetido: utilize quantidade');
  ids.add(item.produtoId);
  return {...item};
 });
}
class CarrinhoLojaLoopDemoSQLite{
 constructor({catalogo,contas,pedidosIdentificados,ponte,relogio=()=>new Date().toISOString()}={}){
  const banco=catalogo?.banco;
  if(!banco||contas?.banco!==banco||pedidosIdentificados?.banco!==banco||
   ponte?.banco!==banco||typeof relogio!=='function')
   throw new TypeError('Todos os modulos de carrinho devem compartilhar SQLite');
  this.banco=banco;this.catalogo=catalogo;this.contas=contas;
  this.pedidosIdentificados=pedidosIdentificados;
  this.ponte=ponte;this.relogio=relogio;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_carrinho_loop_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    total_centavos INTEGER NOT NULL CHECK(total_centavos>0),
    criado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_carrinho_loop_itens_demo(
    pedido_id TEXT NOT NULL REFERENCES admin_carrinho_loop_demo(pedido_id) ON DELETE RESTRICT,
    ordem INTEGER NOT NULL CHECK(ordem>=1),
    produto_id TEXT NOT NULL REFERENCES catalogo_produtos(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK(tipo IN ('PDF','FISICO')),
    nome TEXT NOT NULL,
    revisao INTEGER NOT NULL CHECK(revisao>0),
    quantidade INTEGER NOT NULL CHECK(quantidade>=1),
    unitario_centavos INTEGER NOT NULL CHECK(unitario_centavos>0),
    subtotal_centavos INTEGER NOT NULL CHECK(subtotal_centavos>0),
    PRIMARY KEY(pedido_id,ordem),UNIQUE(pedido_id,produto_id)
   );
   CREATE TABLE IF NOT EXISTS admin_carrinho_loop_eventos_demo(
    evento_id TEXT PRIMARY KEY NOT NULL,
    pedido_id TEXT NOT NULL REFERENCES admin_carrinho_loop_demo(pedido_id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK(tipo IN ('CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO')),
    registrado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_carrinho_eventos_pedido
    ON admin_carrinho_loop_eventos_demo(pedido_id,registrado_em);
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_no_update
    BEFORE UPDATE ON admin_carrinho_loop_demo
    BEGIN SELECT RAISE(ABORT,'carrinho imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_no_delete
    BEFORE DELETE ON admin_carrinho_loop_demo
    BEGIN SELECT RAISE(ABORT,'carrinho imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_itens_no_update
    BEFORE UPDATE ON admin_carrinho_loop_itens_demo
    BEGIN SELECT RAISE(ABORT,'itens de carrinho imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_itens_no_delete
    BEFORE DELETE ON admin_carrinho_loop_itens_demo
    BEGIN SELECT RAISE(ABORT,'itens de carrinho imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_eventos_no_update
    BEFORE UPDATE ON admin_carrinho_loop_eventos_demo
    BEGIN SELECT RAISE(ABORT,'eventos imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_carrinho_eventos_no_delete
    BEFORE DELETE ON admin_carrinho_loop_eventos_demo
    BEGIN SELECT RAISE(ABORT,'eventos imutaveis'); END;
  `);
 }
 opcoes(){
  return {produtos:this.catalogo.listar().filter(p=>
    ['PDF','FISICO'].includes(p.tipo)&&p.estado==='PUBLICADO'&&
    Number.isSafeInteger(p.precoCentavos)&&p.precoCentavos>0
   ).map(p=>({produtoId:p.id,nome:p.nome,tipo:p.tipo,precoCentavos:p.precoCentavos})),
   semCheckout:true};
 }
 buscar(pedidoId){
  idValido(pedidoId);
  const row=this.banco.prepare(
   'SELECT pedido_id AS pedidoId,conta_id AS contaId,total_centavos AS totalCentavos,criado_em AS criadoEm FROM admin_carrinho_loop_demo WHERE pedido_id=?'
  ).get(pedidoId);
  if(!row)return null;
  const itens=this.banco.prepare(
   `
    SELECT ordem,produto_id AS produtoId,tipo,nome,revisao,quantidade,
    unitario_centavos AS unitarioCentavos,subtotal_centavos AS subtotalCentavos
    FROM admin_carrinho_loop_itens_demo WHERE pedido_id=? ORDER BY ordem
   `
  ).all(pedidoId);
  if(itens.reduce((n,i)=>n+i.subtotalCentavos,0)!==row.totalCentavos)
   throw new Error('Integridade financeira do carrinho de teste comprometida');
  const evento=this.banco.prepare(
   'SELECT tipo FROM admin_carrinho_loop_eventos_demo WHERE pedido_id=? ORDER BY registrado_em DESC, rowid DESC LIMIT 1'
  ).get(pedidoId);
  const posicao=this.banco.prepare(
   'SELECT posicao_id AS id FROM admin_ponte_compras_demo WHERE pedido_id=?'
  ).get(pedidoId);
  const loja=this.banco.prepare(
   `
    SELECT pedido_id FROM admin_ponte_vendas_loja_sem_loop_demo WHERE pedido_id=?
    UNION ALL SELECT pedido_id FROM admin_ponte_vendas_loja_apos_reajuste_demo WHERE pedido_id=?
   `
  ).get(pedidoId,pedidoId);
  return {...row,itens,
   situacaoPagamentoFicticio:!evento?'AGUARDANDO_FICTICIO':
    evento.tipo==='CONFIRMAR_FICTICIO'?'CONFIRMADO_FICTICIO':'ESTORNADO_FICTICIO',
   posicaoCriada:!!posicao,posicaoId:posicao?.id??null,
   vendaSomenteLoja:!!loja,semPagamentoReal:true,entregaReal:false};
 }
 listar(){
  const ids=this.banco.prepare(
   'SELECT pedido_id AS pedidoId FROM admin_carrinho_loop_demo ORDER BY criado_em,pedido_id'
  ).all();
  return {pedidos:ids.map(x=>this.buscar(x.pedidoId)),semPagamentoReal:true,
   modulo:'CARRINHO_MULTIPLOS_ITENS_DEMO'};
 }
 criar({pedidoId,contaId,itens}={}){
  idValido(pedidoId);
  const lista=validarLista(itens);
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   // Primeiro snapshot da lista com dados imutaveis do catalogo.
   const fotografias=lista.map(({produtoId,quantidade},indice)=>{
    const r=this.catalogo.buscarRegistro(produtoId);
    const p=r?.produto;
    if(!p||p.estado!=='PUBLICADO'||!['PDF','FISICO'].includes(p.tipo)||
     !Number.isSafeInteger(p.precoCentavos)||p.precoCentavos<=0)
     throw falha('PRODUTO_INVALIDO','Produto indisponivel no catalogo');
    const subtotalCentavos=p.precoCentavos*quantidade;
    if(!Number.isSafeInteger(subtotalCentavos)||subtotalCentavos>1000000000)
     throw falha('VALOR_INVALIDO','Subtotal de item excede limite de teste');
    return {ordem:indice+1,produtoId,nome:p.nome,tipo:p.tipo,
     revisao:r.revisao,quantidade,unitarioCentavos:p.precoCentavos,subtotalCentavos};
   });
   const totalCentavos=fotografias.reduce((n,i)=>n+i.subtotalCentavos,0);
   if(!Number.isSafeInteger(totalCentavos)||totalCentavos<=0||totalCentavos>1000000000)
    throw falha('VALOR_INVALIDO','Total de carrinho invalido');
   const anterior=this.banco.prepare(
    'SELECT pedido_id FROM admin_carrinho_loop_demo WHERE pedido_id=?'
   ).get(pedidoId);
   if(anterior){
    const existente=this.buscar(pedidoId);
    const equivalentes=existente.contaId===contaId&&
     existente.itens.length===fotografias.length&&
     existente.itens.every((p,i)=>p.produtoId===fotografias[i].produtoId&&
      p.quantidade===fotografias[i].quantidade&&
      p.unitarioCentavos===fotografias[i].unitarioCentavos&&
      p.revisao===fotografias[i].revisao);
    if(!equivalentes)throw falha('CONFLITO','Pedido ja usado para outro carrinho');
    this.banco.exec('COMMIT');
    return {...existente,repetido:true};
   }
   if(!this.contas.buscar(contaId))throw falha('TITULAR_INVALIDO','Comprador ficticio inexistente');
   const criadoEm=this.relogio();
   // SAVEPOINT protege o vinculo mesmo dentro desta transacao externa.
   this.pedidosIdentificados.preparar({
    pedidoId,contaId,produtoId:PRODUTO_VIRTUAL,valorCentavos:totalCentavos
   });
   this.banco.prepare(
    'INSERT INTO admin_carrinho_loop_demo(pedido_id,conta_id,total_centavos,criado_em) VALUES (?,?,?,?)'
   ).run(pedidoId,contaId,totalCentavos,criadoEm);
   const inserir=this.banco.prepare(`
    INSERT INTO admin_carrinho_loop_itens_demo(pedido_id,ordem,produto_id,tipo,nome,revisao,quantidade,unitario_centavos,subtotal_centavos)
    VALUES (?,?,?,?,?,?,?,?,?)
   `);
   for(const i of fotografias)inserir.run(pedidoId,i.ordem,i.produtoId,
    i.tipo,i.nome,i.revisao,i.quantidade,i.unitarioCentavos,i.subtotalCentavos);
   this.banco.exec('COMMIT');
   return {...this.buscar(pedidoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 eventos(pedidoId){
  idValido(pedidoId);
  return this.banco.prepare(
   'SELECT evento_id AS eventoId,tipo,registrado_em AS registradoEm FROM admin_carrinho_loop_eventos_demo WHERE pedido_id=? ORDER BY registrado_em,rowid'
  ).all(pedidoId);
 }
 // Apenas o ADMIN LOCAL pode criar evento ficticio: nenhuma chamada publica.
 registrarEvento({pedidoId,eventoId,tipo}={}){
  idValido(pedidoId);
  if(typeof eventoId!=='string'||!ID.test(eventoId)||
   !['CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO'].includes(tipo))
   throw falha('INVALIDO','Evento de teste invalido');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const pedido=this.buscar(pedidoId);
   if(!pedido)throw falha('NAO_ENCONTRADO','Carrinho inexistente');
   const igual=this.banco.prepare(
    'SELECT pedido_id AS pedidoId,tipo FROM admin_carrinho_loop_eventos_demo WHERE evento_id=?'
   ).get(eventoId);
   if(igual){
    if(igual.pedidoId!==pedidoId||igual.tipo!==tipo)
     throw falha('CONFLITO','Evento reutilizado em outra compra');
    this.banco.exec('COMMIT');
    return {repetido:true,pedido:this.buscar(pedidoId)};
   }
   const numero=this.eventos(pedidoId).length;
   if((tipo==='CONFIRMAR_FICTICIO'&&numero!==0)||
    (tipo==='ESTORNAR_FICTICIO'&&
     (numero!==1||pedido.situacaoPagamentoFicticio!=='CONFIRMADO_FICTICIO')))
    throw falha('CONFLITO','Transicao de pagamento ficticio indevida');
   this.banco.prepare(
    'INSERT INTO admin_carrinho_loop_eventos_demo(evento_id,pedido_id,tipo,registrado_em) VALUES (?,?,?,?)'
   ).run(eventoId,pedidoId,tipo,this.relogio());
   this.banco.exec('COMMIT');
   return {repetido:false,pedido:this.buscar(pedidoId)};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 comprovanteConfirmado(pedidoId){
  const carrinho=this.buscar(pedidoId);
  if(!carrinho)throw falha('NAO_ENCONTRADO','Carrinho inexistente');
  if(carrinho.situacaoPagamentoFicticio!=='CONFIRMADO_FICTICIO')
   throw falha('NAO_CONFIRMADO','Pagamento nao confirmado ou estornado');
  const pedido=this.pedidosIdentificados.buscar(pedidoId);
  if(!pedido||pedido.contaId!==carrinho.contaId||
   pedido.valorCentavos!==carrinho.totalCentavos||
   pedido.produtoId!==PRODUTO_VIRTUAL)
   throw falha('PEDIDO_DIVERGENTE','Vinculo e carrinho nao correspondem');
  const evento=this.eventos(pedidoId).find(x=>x.tipo==='CONFIRMAR_FICTICIO');
  if(!evento)throw falha('NAO_CONFIRMADO','Sem evento comprovado');
  return {pedidoId,contaId:pedido.contaId,produtoId:PRODUTO_VIRTUAL,
   valorCentavos:carrinho.totalCentavos,intentoPagamentoId:pedido.intentoPagamentoId,
   confirmadoEm:evento.registradoEm,status:STATUS_CONFIRMADO};
 }
 async sincronizar(pedidoId){
  const c=this.buscar(pedidoId);
  if(!c)throw falha('NAO_ENCONTRADO','Carrinho nao existe');
  if(c.situacaoPagamentoFicticio==='AGUARDANDO_FICTICIO')
   return {situacao:'AGUARDANDO_PAGAMENTO',posicaoCriada:false};
  if(c.situacaoPagamentoFicticio==='ESTORNADO_FICTICIO')
   return {situacao:'ESTORNADO_REQUER_CONFERENCIA',
    posicaoCriada:c.posicaoCriada,naoDesfazPosicaoAutomaticamente:true};
  const resultado=await this.ponte.processar({pedidoId});
  return {...resultado,situacao:resultado.posicaoCriada?
   'POSICAO_AZUL_CRIADA_OU_EXISTENTE':'VENDA_SOMENTE_LOJA',
   fonte:'CARRINHO_TESTE',semPagamentoReal:true};
 }
}
module.exports={CarrinhoLojaLoopDemoSQLite,PRODUTO_VIRTUAL};
