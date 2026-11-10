'use strict';
// Ponte operacional de ENSAIO: evento comercial comprovado pelo modulo PSP
// -> posicao VERDE azul -> fila -> luzes auditadas -> escritorio no mesmo SQLite.
// Nao produz prova bancaria real, CPF ou credito. Proibida em producao.
const {createHash}=require('node:crypto');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class SincronizadorComercialLoopEnsaioSQLite{
 constructor({banco,motor,classificacaoLoop,promocao}={}){
  if(process.env.NODE_ENV==='production')
   falha('INTEGRACAO_LOOP_PRODUTIVA_NAO_HOMOLOGADA');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     motor?.banco!==banco||promocao?.db!==banco||
     classificacaoLoop?.db!==banco||
     typeof promocao.aprovarEEnfileirarEmEnsaio!=='function'||
     typeof motor.registrarEventoEnsaio!=='function')
   falha('INTEGRACAO_COMERCIAL_SQLITE_DIVERGENTE');
  this.db=banco;this.motor=motor;this.classificacao=classificacaoLoop;
  this.promocao=promocao;
 }
 _ensaio(){
  if(process.env.NODE_ENV==='production')
   falha('INTEGRACAO_LOOP_PRODUTIVA_NAO_HOMOLOGADA');
 }
 _aprovadas(){
  return this.db.prepare([
   'SELECT e.pedido_id,e.pagamento_id,e.valor_total_centavos,',
   'e.estado,e.registrado_em,p.status AS status_pedido',
   'FROM loop_real_eventos_comerciais e',
   'JOIN loja_real_pedidos p ON p.pedido_id=e.pedido_id',
   'ORDER BY e.registrado_em ASC,e.pedido_id ASC'
  ].join(' ')).all();
 }
 _purezaVerde(c){
  return c.posicoesVerdesPrevistas===1&&
   c.posicoesDouradasPrevistas===0&&
   c.posicoesRoxasBloqueadas===0&&
   c.totalPosicoesMistasPrevistas===1&&
   c.eventosEspeciaisNaoHomologados===false&&
   c.ultrapassaDezPorCompra===false;
 }
 _semPosicao(c){
  // Produtos sem regra registrada sao cinza por padrao: vendem normalmente
  // na loja e jamais geram posicao do LOOP.
  return c.totalPosicoesMistasPrevistas===0;
 }
 _origemUnica(pedidoId,pagamentoId){
  // Identificador opaco deterministicamente derivado dos dois IDs do livro,
  // garantindo mesmo replay apos restart sem usar credencial PSP.
  return 'AUTO_ENSAIO_'+createHash('sha256')
   .update(pedidoId+'\0'+pagamentoId).digest('hex').slice(0,48);
 }
 consultar(){
  const res={confirmadas:0,verdesQualificadas:0,
   enfileiradas:0,aguardandoPromocao:0,
   naoQualificadas:0,regrasEspeciaisPendentes:0,
   estornadas:0,esperandoSeisEventos:0,
   eventosNoCiclo:0,giros:0,financeiroReal:false,
   status:'INTEGRACAO_INTERNA_ENSAIO'};
  for(const p of this._aprovadas()){
   if(p.estado==='CANCELADO'){res.estornadas++;continue;}
   if(p.estado!=='AGUARDANDO_CONCILIACAO'||
      p.status_pedido!=='APROVADO_PARA_EXPEDICAO')
    falha('INTEGRACAO_EVENTO_INCONSISTENTE');
   res.confirmadas++;
   const cor=this.classificacao.avaliarPedido({pedidoId:p.pedido_id});
   if(this._purezaVerde(cor)){
    res.verdesQualificadas++;
    if(this.db.prepare(
     'SELECT 1 FROM loop_real_promocoes_pedido_ensaio WHERE pedido_id=?'
    ).get(p.pedido_id))res.enfileiradas++;
    else res.aguardandoPromocao++;
    if(this.db.prepare([
     'SELECT 1 FROM loop_real_promocoes_pedido_ensaio pm',
     'LEFT JOIN loop_real_motor_eventos ev',
     "ON ev.chave='e:'||pm.pedido_id",
     'WHERE pm.pedido_id=? AND ev.chave IS NULL'
    ].join(' ')).get(p.pedido_id))res.esperandoSeisEventos++;
   }else if(this._semPosicao(cor))res.naoQualificadas++;
   else res.regrasEspeciaisPendentes++;
  }
  const estado=this.motor.consultar();
  res.eventosNoCiclo=estado.tabuleiro.eventosNoCiclo;
  res.giros=estado.catraca.giros;
  res.filaA=estado.filaA;res.filaB=estado.filaB;
  res.posicoesAzuisPendentes=estado.posicoesAzuisPendentes;
  return res;
 }
 sincronizar({limite=100}={}){
  this._ensaio();
  if(!Number.isSafeInteger(limite)||limite<1||limite>500)
   falha('INTEGRACAO_LIMITE_INVALIDO');
  let novasPosicoes=0,novosEventos=0,ignoradas=0,especiais=0;
  // Cada promocao e atomicamente gravada no mesmo SQLite pelo motor.
  // Se o processo cair, a proxima varredura encontra a mesma prova/posicao.
  let examinadas=0;
  for(const p of this._aprovadas()){
   if(examinadas>=limite)break;
   if(p.estado==='CANCELADO')continue;
   if(p.estado!=='AGUARDANDO_CONCILIACAO'||
      p.status_pedido!=='APROVADO_PARA_EXPEDICAO')
    falha('INTEGRACAO_EVENTO_INCONSISTENTE');
   if(this.db.prepare(
    'SELECT 1 FROM loop_real_promocoes_pedido_ensaio WHERE pedido_id=?'
   ).get(p.pedido_id))continue;
   const cor=this.classificacao.avaliarPedido({pedidoId:p.pedido_id});
   if(this._semPosicao(cor)){ignoradas++;continue;}
   if(!this._purezaVerde(cor)){especiais++;continue;}
   examinadas++;
   const x=this.promocao.aprovarEEnfileirarEmEnsaio({
    pedidoId:p.pedido_id,pagamentoId:p.pagamento_id,
    valorCentavos:p.valor_total_centavos,
    provaEnsaioId:this._origemUnica(p.pedido_id,p.pagamento_id),
    autorizadoEnsaio:true
   });
   if(!x.repetida)novasPosicoes++;
  }
  // Registrar luzes apenas de posicoes efetivamente enfileiradas.
  // Sem centro, vendas aguardam sem virar ciclo ficticio.
  const s=this.motor.consultar();
  if(s.tabuleiro.centro!==null&&s.tabuleiro.eventosNoCiclo<6){
   const pendentes=this.db.prepare([
    'SELECT pm.pedido_id FROM loop_real_promocoes_pedido_ensaio pm',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=pm.pedido_id',
    "WHERE e.estado='AGUARDANDO_CONCILIACAO'",
    'AND NOT EXISTS(SELECT 1 FROM loop_real_motor_eventos m',
    "WHERE m.chave='e:'||pm.pedido_id)",
    'ORDER BY pm.criado_em ASC,pm.pedido_id ASC'
   ].join(' ')).all();
   for(const p of pendentes){
    if(this.motor.consultar().tabuleiro.eventosNoCiclo===6)break;
    const x=this.motor.registrarEventoEnsaio({pedidoId:p.pedido_id});
    if(!x.repetida)novosEventos++;
   }
  }
  return {novasPosicoes,novosEventos,ignoradas,especiais,
   ...this.consultar()};
 }
 prepararTabuleiro(){
  this._ensaio();
  const x=this.motor.prepararTabuleiroEnsaio();
  return {centro:x.centro?.id||null,
   vagasOcupadas:x.vagas.filter(Boolean).length,
   ...this.sincronizar()};
 }
 sinalizarCancelamento({pedidoId}={}){
  this._ensaio();
  if(typeof pedidoId!=='string'||!/^[A-Za-z0-9_-]{3,120}$/.test(pedidoId))
   falha('INTEGRACAO_CANCELAMENTO_INVALIDO');
  const evento=this.db.prepare(
   'SELECT estado FROM loop_real_eventos_comerciais WHERE pedido_id=?'
  ).get(pedidoId);
  if(!evento||evento.estado!=='CANCELADO')
   falha('INTEGRACAO_CANCELAMENTO_NAO_CONFIRMADO');
  if(!this.db.prepare(
   'SELECT 1 FROM loop_real_promocoes_pedido_ensaio WHERE pedido_id=?'
  ).get(pedidoId))return {sinalizada:false,semPosicao:true};
  return this.promocao.suspenderPromocaoRevertidaEmEnsaio({
   pedidoId,autorizadoEnsaio:true
  });
 }
}
module.exports={SincronizadorComercialLoopEnsaioSQLite};
