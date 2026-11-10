'use strict';
const {AceitePosicaoAzulEnsaioSQLite}=require('./aceite-posicao-azul-ensaio-sqlite');
// PONTE DE HOMOLOGACAO INTERNA: pedido aprovado + evento comercial +
// fotografia de regra verde + aceite de ensaio -> uma posição no motor.
// Esse aceite é SIMULADO. Não substitui Pix, liquidação ou KYC reais.
// Não existe rota HTTP, deploy, dinheiro real ou ativação produtiva.
const TABELAS_PROMOCAO_ENSAIO=Object.freeze([
 'loop_real_promocoes_pedido_ensaio',
 ...AceitePosicaoAzulEnsaioSQLite.TABELAS
]);
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class PromocaoPedidoMotorEnsaioSQLite{
 constructor({banco,motor,classificacaoLoop,
  chaveCpfEnsaio=null,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('PROMOCAO_PRODUCAO_NAO_HOMOLOGADA');
  if(!banco||typeof banco.prepare!=='function'||
     typeof banco.exec!=='function'||typeof agora!=='function'||
     !motor||motor.banco!==banco||
     typeof motor.registrarCompraConciliadaEnsaioEmTransacao!=='function'||
     !classificacaoLoop||classificacaoLoop.db!==banco||
     typeof classificacaoLoop.avaliarPedido!=='function')
   falha('PROMOCAO_ENSAIO_EXIGE_MODULOS_UNIFICADOS');
  for(const nome of ['loja_real_pedidos','loop_real_eventos_comerciais',
   'loop_real_motor_compras','loop_real_fotos_regras_pedido']){
   if(!banco.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
   ).get(nome))falha('PROMOCAO_ENSAIO_ESQUEMA_INCOMPLETO');
  }
  this.db=banco;this.motor=motor;
  this.classificacao=classificacaoLoop;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_promocoes_pedido_ensaio(',
   'pedido_id TEXT PRIMARY KEY REFERENCES',
   'loop_real_eventos_comerciais(pedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL,',
   'pagamento_id TEXT NOT NULL UNIQUE,',
   'prova_ensaio_id TEXT NOT NULL UNIQUE,',
   'valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos>=25000),',
   'produtos_centavos INTEGER NOT NULL CHECK(produtos_centavos>=25000),',
   'posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),',
   'criado_em INTEGER NOT NULL CHECK(criado_em>0),',
   "origem TEXT NOT NULL CHECK(origem='OPERADOR_ENSAIO_SEM_PROVA_BANCARIA'));",
   'CREATE TRIGGER IF NOT EXISTS loop_promocao_ensaio_no_update',
   'BEFORE UPDATE ON loop_real_promocoes_pedido_ensaio',
   "BEGIN SELECT RAISE(ABORT,'PROMOCAO_ENSAIO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_promocao_ensaio_no_delete',
   'BEFORE DELETE ON loop_real_promocoes_pedido_ensaio',
   "BEGIN SELECT RAISE(ABORT,'PROMOCAO_ENSAIO_IMUTAVEL'); END;"
  ].join(' '));
  this.aceiteAzul=new AceitePosicaoAzulEnsaioSQLite({
   banco,chaveCpfEnsaio,agora
  });
  this.verificar();
 }
 _validarPedido(pedidoId,pagamentoId,valorCentavos){
  const e=this.db.prepare([
   'SELECT e.pedido_id,e.titular_id,e.pagamento_id,',
   'e.valor_total_centavos,e.valor_produtos_centavos,',
   'e.estado,p.status AS status_pedido,p.pagamento_id AS pagamento_pedido,',
   'p.titular_id AS titular_pedido',
   'FROM loop_real_eventos_comerciais e',
   'JOIN loja_real_pedidos p ON p.pedido_id=e.pedido_id',
   'WHERE e.pedido_id=?'
  ].join(' ')).get(pedidoId);
  if(!e)falha('PROMOCAO_SEM_EVENTO_COMERCIAL');
  if(e.estado!=='AGUARDANDO_CONCILIACAO'||
     e.status_pedido!=='APROVADO_PARA_EXPEDICAO')
   falha('PROMOCAO_EVENTO_CANCELADO_OU_NAO_CONFIRMADO');
  if(e.pagamento_id!==pagamentoId||
     e.pagamento_pedido!==pagamentoId||
     e.valor_total_centavos!==valorCentavos||
     e.titular_id!==e.titular_pedido)
   falha('PROMOCAO_PAGAMENTO_OU_TITULAR_DIVERGENTE');
  if(!TITULAR.test(e.titular_id)||e.valor_produtos_centavos<25000||
     e.valor_produtos_centavos>e.valor_total_centavos)
   falha('PROMOCAO_VALOR_PRODUTOS_INVALIDO');
  const cor=this.classificacao.avaliarPedido({pedidoId});
  if(cor.pedidoId!==pedidoId||
     cor.posicoesVerdesPrevistas!==1||
     cor.totalPosicoesPrevistas!==1||
     cor.posicoesDouradasPrevistas!==0||
     cor.posicoesRoxasBloqueadas!==0||
     cor.itensSemRegraExplicita!==0||
     cor.eventosEspeciaisNaoHomologados!==false||
     cor.ultrapassaDezPorCompra!==false||
     cor.posicoesReaisCriadas!==0||
     cor.financeiroReal!==false)
   falha('PROMOCAO_COMPRA_NAO_QUALIFICADA_OU_REGRA_PENDENTE');
  return e;
 }
 aprovarEEnfileirarEmEnsaio({
  pedidoId,pagamentoId,valorCentavos,provaEnsaioId,
  autorizadoEnsaio=false
 }={}){
  if(process.env.NODE_ENV==='production')
   falha('PROMOCAO_PRODUCAO_NAO_HOMOLOGADA');
  if(autorizadoEnsaio!==true||typeof pedidoId!=='string'||
     !ID.test(pedidoId)||typeof pagamentoId!=='string'||
     !ID.test(pagamentoId)||typeof provaEnsaioId!=='string'||
     !ID.test(provaEnsaioId)||!Number.isSafeInteger(valorCentavos)||
     valorCentavos<25000||valorCentavos>100000000)
   falha('PROMOCAO_ENSAIO_AUTORIZACAO_OU_PROVA_INVALIDA');
  if(this.db.isTransaction)falha('PROMOCAO_ENSAIO_TRANSACAO_EXTERNA_PROIBIDA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const e=this._validarPedido(pedidoId,pagamentoId,valorCentavos);
   const antigo=this.db.prepare([
    'SELECT * FROM loop_real_promocoes_pedido_ensaio WHERE pedido_id=?'
   ].join(' ')).get(pedidoId);
   if(antigo){
    if(antigo.prova_ensaio_id!==provaEnsaioId||
       antigo.pagamento_id!==pagamentoId||
       antigo.titular_id!==e.titular_id||
       antigo.valor_total_centavos!==valorCentavos||
       antigo.produtos_centavos!==e.valor_produtos_centavos)
     falha('PROMOCAO_REPLAY_DIVERGENTE');
    this.db.exec('COMMIT');
    return {repetida:true,posicaoId:antigo.posicao_id,
     entradaNaFilaEnsaio:false,aguardandoCpfTermos:true,
     financeiroReal:false};
   }
   if(this.db.prepare([
    'SELECT 1 FROM loop_real_promocoes_pedido_ensaio WHERE prova_ensaio_id=?'
   ].join(' ')).get(provaEnsaioId))
    falha('PROMOCAO_PROVA_DE_ENSAIO_REUTILIZADA');
   if(this.db.prepare(
    'SELECT 1 FROM loop_real_motor_compras WHERE pedido_id=?'
   ).get(pedidoId))
    falha('PROMOCAO_PEDIDO_JA_USADO_NO_MOTOR');
   const resultado=this.motor.registrarCompraConciliadaEnsaioEmTransacao({
    titularId:e.titular_id,pedidoId,
    valorCentavos:e.valor_produtos_centavos
   });
   if(resultado.repetida)
    falha('PROMOCAO_COMPRA_DUPLICADA_NO_MOTOR');
   const ts=this.agora();
   if(!Number.isSafeInteger(ts)||ts<=0)
    falha('PROMOCAO_RELOGIO_INVALIDO');
   this.db.prepare([
    'INSERT INTO loop_real_promocoes_pedido_ensaio(',
    'pedido_id,titular_id,pagamento_id,prova_ensaio_id,',
    'valor_total_centavos,produtos_centavos,posicao_id,criado_em,origem)',
    "VALUES(?,?,?,?,?,?,?,?,'OPERADOR_ENSAIO_SEM_PROVA_BANCARIA')"
   ].join(' ')).run(pedidoId,e.titular_id,pagamentoId,provaEnsaioId,
    valorCentavos,e.valor_produtos_centavos,resultado.posicaoId,ts);
   const atual=this.db.prepare('SELECT snapshot FROM loop_real_motor_estado WHERE id=1').get();
   if(!atual)falha('PROMOCAO_SEM_SNAPSHOT');
   const foto=JSON.parse(atual.snapshot);
   const pos=foto.filas.filaB.find(x=>x.id===resultado.posicaoId);
   const indexada=foto.filas.vendasRegistradas.find(x=>x[0]===pedidoId);
   if(!pos||!indexada||indexada[1].id!==pos.id||
      pos.participanteId!==e.titular_id)
    falha('PROMOCAO_AZUL_DIVERGENTE');
   pos.statusAdesao='PENDENTE';
   indexada[1].statusAdesao='PENDENTE';
   this.db.prepare('UPDATE loop_real_motor_estado SET revisao=revisao+1,snapshot=? WHERE id=1')
    .run(JSON.stringify(foto));
   this.verificar();
   this.db.exec('COMMIT');
   return {repetida:false,posicaoId:resultado.posicaoId,
    entradaNaFilaEnsaio:false,aguardandoCpfTermos:true,
    compraRealConciliada:false,
    pagamentoRealValidado:false,financeiroReal:false,
    catracaRealLiberada:false};
  }catch(err){this.db.exec('ROLLBACK');throw err;}
 }
 confirmarPosicaoAzulEmEnsaio(dados){
  return this.aceiteAzul.confirmar(dados);
 }
 suspenderPromocaoRevertidaEmEnsaio(dados){
  return this.aceiteAzul.suspenderReversao(dados);
 }
 verificar(){
  let total=0,emRevisao=0;
  for(const row of this.db.prepare([
   'SELECT x.*,e.estado,e.valor_produtos_centavos AS produtos_evento,',
   'e.valor_total_centavos AS total_evento,',
   'e.titular_id AS titular_evento,e.pagamento_id AS pagamento_evento,',
   'p.titular_id AS titular_pedido,p.posicao_id AS posicao_motor,',
   'p.valor_centavos AS produtos_motor',
   'FROM loop_real_promocoes_pedido_ensaio x',
   'JOIN loop_real_eventos_comerciais e ON e.pedido_id=x.pedido_id',
   'LEFT JOIN loop_real_motor_compras p ON p.pedido_id=x.pedido_id'
  ].join(' ')).iterate()){
   total++;
   if(row.titular_id!==row.titular_evento||
      row.titular_id!==row.titular_pedido||
      row.pagamento_id!==row.pagamento_evento||
      row.valor_total_centavos!==row.total_evento||
      row.produtos_centavos!==row.produtos_evento||
      row.produtos_centavos!==row.produtos_motor||
      row.posicao_id!==row.posicao_motor||
      row.origem!=='OPERADOR_ENSAIO_SEM_PROVA_BANCARIA'||
      !ID.test(row.prova_ensaio_id)||!ID.test(row.pagamento_id)||
      !ID.test(row.pedido_id)||
      !Number.isSafeInteger(row.criado_em)||row.criado_em<=0)
    falha('PROMOCAO_LIVRO_SNAPSHOT_DIVERGENTE');
   if(row.estado==='CANCELADO')emRevisao++;
   else if(row.estado!=='AGUARDANDO_CONCILIACAO')
    falha('PROMOCAO_EVENTO_ESTADO_DESCONHECIDO');
  }
  const auditoriaAzul=AceitePosicaoAzulEnsaioSQLite.verificar(this.db);
  return {integridade:'OK',promocoesEnsaio:total,
   ...auditoriaAzul,
   posicoesEnsaioComEstornoPendente:emRevisao,
   motorBloqueadoPorEstorno:false,
   revisaoFinanceiraPendente:emRevisao>0,
   comprovantesBancariosReais:0,financeiroReal:false};
 }
 consultarTitularEnsaio({titularId}={}){
  if(!TITULAR.test(titularId||''))
   falha('PROMOCAO_CONSULTA_TITULAR_INVALIDO');
  const linhas=this.db.prepare([
   'SELECT pedido_id,posicao_id,criado_em FROM loop_real_promocoes_pedido_ensaio',
   'WHERE titular_id=? ORDER BY criado_em DESC,pedido_id DESC'
  ].join(' ')).all(titularId);
  return {promocoes:linhas.map(x=>({pedidoId:x.pedido_id,
   posicaoId:x.posicao_id,registradoEm:x.criado_em,
   estadoAdesao:AceitePosicaoAzulEnsaioSQLite.estado(this.db,x.posicao_id)})),
   financeiroReal:false,comprovacaoExternaReal:false};
 }
}
module.exports={PromocaoPedidoMotorEnsaioSQLite,TABELAS_PROMOCAO_ENSAIO};
