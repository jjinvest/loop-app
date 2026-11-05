'use strict';
// Fonte unica do MOTOR DE ENSAIO na MESMA conexao SQLite de contas, loja e admin.
// As operacoes abaixo nao constituem liquidação PSP, adesao, direito ou ganho.
// Bloqueio absoluto em NODE_ENV=production e sem rotas publicas de escrita.
const {SimuladorLoop}=require('./simulador-loop');
const {LIMITE_POSICOES_ATIVAS}=require('./capacidade-posicoes-loop');
const {planejarPosicoesCompraAkitemm}=require('./plano-posicoes-compra-akitemm');
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarAmbiente(){
 if(process.env.NODE_ENV==='production')falha('MOTOR_ENSAIO_PROIBIDO_PRODUCAO');
}
class MotorContaUnicaEnsaioSQLite{
 constructor({banco,sinalizacao}={}){
  validarAmbiente();
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     sinalizacao?.db!==banco||
     typeof sinalizacao?.consultarFotografiaPrepedido!=='function')
   falha('MOTOR_FONTE_SQLITE_UNICA_OBRIGATORIA');
  this.banco=banco;this.sinalizacao=sinalizacao;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_motor_conta_ensaio_estado(',
   'id INTEGER PRIMARY KEY CHECK(id=1),revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'snapshot TEXT NOT NULL,atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_motor_conta_ensaio_operacoes(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'tipo TEXT NOT NULL,prepedido_id TEXT,',
   'titular_id TEXT,numero_posicao INTEGER,criado_em INTEGER NOT NULL);',
   'CREATE UNIQUE INDEX IF NOT EXISTS idx_motor_ensaio_prepared_once',
   "ON akitemm_motor_conta_ensaio_operacoes(prepedido_id) WHERE tipo='VINCULAR_PEDIDO';",
   'CREATE TABLE IF NOT EXISTS akitemm_motor_ensaio_lotes_pedido(',
   'prepedido_id TEXT NOT NULL,ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 10),',
   'titular_id TEXT NOT NULL,numero_posicao INTEGER NOT NULL UNIQUE,',
   'PRIMARY KEY(prepedido_id,ordinal));',
   'CREATE INDEX IF NOT EXISTS idx_motor_ensaio_giros',
   'ON akitemm_motor_conta_ensaio_operacoes(tipo,criado_em);'
  ].join(' '));
 }
 _simulador(){
  const row=this.banco.prepare('SELECT snapshot FROM akitemm_motor_conta_ensaio_estado WHERE id=1').get();
  return row?SimuladorLoop.restaurarSnapshot(JSON.parse(row.snapshot)):new SimuladorLoop();
 }
 _gravar(sim){
  const snapshot=JSON.stringify(sim.exportarSnapshot());
  this.banco.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_estado',
   '(id,revisao,snapshot,atualizado_em) VALUES(1,1,?,?)',
   'ON CONFLICT(id) DO UPDATE SET revisao=revisao+1,',
   'snapshot=excluded.snapshot,atualizado_em=excluded.atualizado_em'
  ].join(' ')).run(snapshot,Date.now());
 }
 _evento(tipo,{prepedidoId=null,titularId=null,posicaoId=null}={}){
  this.banco.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_operacoes',
   '(tipo,prepedido_id,titular_id,numero_posicao,criado_em)',
   'VALUES(?,?,?,?,?)'
  ].join(' ')).run(tipo,prepedidoId,titularId,posicaoId,Date.now());
 }
 _transacao(acao){
  validarAmbiente();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const sim=this._simulador();
   const resultado=acao(sim);
   this._gravar(sim);
   this.banco.exec('COMMIT');
   return resultado;
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 _contarAtivas(sim,titularId){
  const estado=sim.estado();
  return [...estado.filas.A.pessoas,...estado.filas.B.pessoas,
   estado.tabuleiro.centro,...estado.tabuleiro.vagas]
   .filter(p=>p&&!p.empresa&&p.participanteId===titularId).length;
 }
 vincularPedido({prepedidoId,aceiteEnsaio}={}){
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
  if(aceiteEnsaio!==true)falha('CIENCIA_DE_ENSAIO_OBRIGATORIA');
  return this._transacao(sim=>{
   const pedido=this.banco.prepare([
    'SELECT p.prepedido_id AS prepedidoId,p.titular_id AS titularId,',
    'p.total_centavos AS totalCentavos',
    'FROM akitemm_checkout_prepedidos_staging p',
    'JOIN akitemm_conta_unica_candidata a ON a.id=p.titular_id',
    'WHERE p.prepedido_id=?'
   ].join(' ')).get(prepedidoId);
   if(!pedido)falha('PREPEDIDO_SEM_TITULAR_VALIDO');
   const foto=this.sinalizacao.consultarFotografiaPrepedido({
    prepedidoId,titularId:pedido.titularId
   });
   if(foto?.totalCentavos!==pedido.totalCentavos)
    falha('FOTOGRAFIA_HISTORICA_INCONSISTENTE');
   // Fotografias anteriores à regra mista seguem estritamente o contrato
   // legado: uma posição verde; nunca reinterpretar pedidos antigos.
   let quantidade=1;
   if(foto?.planejamentoPosicoes){
    const plano=planejarPosicoesCompraAkitemm(foto.itens);
    if(JSON.stringify(plano)!==JSON.stringify(foto.planejamentoPosicoes)||
       !plano.podeVincularEnsaio||
       plano.valorTotalCentavos!==pedido.totalCentavos)
     falha('PLANEJAMENTO_PEDIDO_NAO_QUALIFICA_ENSAIO');
    quantidade=plano.quantidadePosicoesPrevistas;
   }else if(pedido.totalCentavos<25000||
      foto?.referenciaVerdeAtingida!==true||
      foto?.valorVerdeConsideradoCentavos<25000||
      foto?.podeSimularFilaBAzul!==true||foto?.eventoPendente===true){
    falha('PEDIDO_NAO_QUALIFICA_ENSAIO_MOTOR');
   }
   const anterior=this.banco.prepare([
    'SELECT numero_posicao AS posicaoId,titular_id AS titularId',
    'FROM akitemm_motor_conta_ensaio_operacoes',
    "WHERE prepedido_id=? AND tipo='VINCULAR_PEDIDO'"
   ].join(' ')).get(prepedidoId);
   if(anterior){
    if(anterior.titularId!==pedido.titularId)
     falha('INTEGRIDADE_TITULAR_MOTOR');
    const posicoes=this.banco.prepare([
     'SELECT numero_posicao AS id FROM akitemm_motor_ensaio_lotes_pedido',
     'WHERE prepedido_id=? ORDER BY ordinal'
    ].join(' ')).all(prepedidoId).map(p=>p.id);
    if(!posicoes.length)posicoes.push(anterior.posicaoId);
    return {repetido:true,posicaoId:anterior.posicaoId,
     posicoesIds:posicoes,quantidadePosicoes:posicoes.length,
     apenasEnsaio:true,posicoesReais:0,financeiroReal:false};
   }
   if(!TITULAR.test(pedido.titularId))falha('TITULAR_MOTOR_INVALIDO');
   if(!Number.isSafeInteger(quantidade)||quantidade<1||quantidade>LIMITE_POSICOES_ATIVAS||
      this._contarAtivas(sim,pedido.titularId)+quantidade>LIMITE_POSICOES_ATIVAS)
    falha('LIMITE_DEZ_POSICOES_MOTOR_ENSAIO');
   const posicoesIds=[];
   for(let indice=1;indice<=quantidade;indice++){
    const r=sim.registrarPosicaoSimulada({
     participanteId:pedido.titularId,
     vendaId:'ensaio:'+prepedidoId+(indice===1?'':':'+indice),
     adesaoPendente:true
    });
    if(r.repetida)falha('INDICE_PEDIDO_MOTOR_INCONSISTENTE');
    posicoesIds.push(r.posicao.id);
    this.banco.prepare([
     'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
     '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
    ].join(' ')).run(prepedidoId,indice,pedido.titularId,r.posicao.id);
   }
   this._evento('VINCULAR_PEDIDO',{
    prepedidoId,titularId:pedido.titularId,posicaoId:posicoesIds[0]
   });
   return {repetido:false,posicaoId:posicoesIds[0],
    posicoesIds,quantidadePosicoes:posicoesIds.length,
    apenasEnsaio:true,posicoesReais:0,financeiroReal:false};
  });
 }
 prepararTabuleiro(){
  return this._transacao(sim=>{
   if(sim.tabuleiro.iniciado)falha('CICLO_MOTOR_ENSAIO_JA_INICIADO');
   const e=sim.prepararTabuleiro();
   this._evento('PREPARAR_TABULEIRO');
   return {preparado:true,ocupadas:[e.centro,...e.vagas].filter(Boolean).length,
    somenteEnsaio:true};
  });
 }
 registrarEvento({prepedidoId}={}){
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
  return this._transacao(sim=>{
   const origem=this.banco.prepare([
    'SELECT titular_id FROM akitemm_motor_conta_ensaio_operacoes',
    "WHERE prepedido_id=? AND tipo='VINCULAR_PEDIDO'"
   ].join(' ')).get(prepedidoId);
   if(!origem)falha('PEDIDO_FORA_DO_MOTOR_ENSAIO');
   const resultado=sim.registrarVendaNoCicloSimulada({vendaId:'ensaio:'+prepedidoId});
   if(!resultado.repetida)this._evento('EVENTO_CICLO',{titularId:origem.titular_id});
   return {repetido:resultado.repetida,eventosNoCiclo:resultado.estado.vendasNoCiclo,
    prontoParaGiro:resultado.estado.elegivelParaGiro,
    dinheiroReal:false,somenteEnsaio:true};
  });
 }
 controlarCatraca(acao){
  if(!['ABRIR','PAUSAR','GIRAR'].includes(acao))falha('ACAO_CATRACA_INVALIDA');
  return this._transacao(sim=>{
   let r;
   if(acao==='ABRIR')r=sim.abrirCatraca();
   if(acao==='PAUSAR')r=sim.pausarCatraca();
   if(acao==='GIRAR')r=sim.tentarGiro();
   if(acao==='GIRAR'&&!r.girou)
    return {girou:false,motivo:r.motivo,somenteEnsaio:true,
     creditoReal:false};
   this._evento(acao==='GIRAR'?'GIRO':acao);
   return {girou:acao==='GIRAR',somenteEnsaio:true,creditoReal:false};
  });
 }
 consultar({titularId=null}={}){
  validarAmbiente();
  if(titularId!==null){
   if(typeof titularId!=='string'||!TITULAR.test(titularId))
    falha('TITULAR_MOTOR_INVALIDO');
   if(!this.banco.prepare(
    'SELECT 1 FROM akitemm_conta_unica_candidata WHERE id=?'
   ).get(titularId))falha('TITULAR_MOTOR_INEXISTENTE');
  }
  const sim=this._simulador();
  const estado=sim.estado();
  const visual=p=>p?{
   numero:p.id,
   minha:p.participanteId===titularId&&p.empresa!==true,
   pendente:p.statusAdesao==='PENDENTE'&&p.empresa!==true,
   dourada:p.empresa===true,
   // Nao enviar nome, UUID, nick nem CPF de outros participantes.
   status:p.empresa===true?'EMPRESA':p.statusAdesao==='PENDENTE'?'PENDENTE':'ENSAIO'
  }:null;
  const ativas=[
   ...estado.filas.A.pessoas.map(p=>({...p,local:'FILA',fila:'A'})),
   ...estado.filas.B.pessoas.map(p=>({...p,local:'FILA',fila:'B'})),
   ...(estado.tabuleiro.centro?[{...estado.tabuleiro.centro,local:'CENTRO'}]:[]),
   ...estado.tabuleiro.vagas.flatMap((p,i)=>p?[{...p,local:'VAGA_'+(i+1)}]:[])
  ];
  const minhas=titularId===null?[]:ativas
   .filter(p=>p.participanteId===titularId&&p.empresa!==true)
   .map(p=>({numero:p.id,local:p.local,
    fila:p.fila||null,pendente:p.statusAdesao==='PENDENTE',
    estado:'ENSAIO_SEM_DIREITO'}));
  const giros24h=this.banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes',
   "WHERE tipo='GIRO' AND criado_em>=?"
  ].join(' ')).get(Date.now()-86400000).n;
  return {origem:'MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA',
   laboratorio:true,autorizacaoComercial:false,
   dinheiroReal:false,posicoesReais:0,saldoRealCentavos:null,
   limitePosicoesAtivas:LIMITE_POSICOES_ATIVAS,limitePorTitularTabuleiro:2,
   ordemAlimentacao:'3A:1B',eventosPorCiclo:6,
   filaA:estado.filas.A.pessoas.map(visual),
   filaB:estado.filas.B.pessoas.map(visual),
   tabuleiro:{centro:visual(estado.tabuleiro.centro),
    vagas:estado.tabuleiro.vagas.map(visual),
    eventosNoCiclo:estado.tabuleiro.vendasNoCiclo,
    preparadoParaGiro:estado.tabuleiro.elegivelParaGiro,
    ciclosConcluidos:estado.tabuleiro.ciclosConcluidos},
   catraca:{estado:estado.catraca.status,giros:estado.catraca.giros,giros24h},
   minhasPosicoes:minhas,pendentesDeEnsaio:minhas.filter(p=>p.pendente).length,
   posicoesAtivasDoTitular:minhas.length,
   status:'SEM_PAGAMENTO_OU_ATIVACAO_REAL'};
 }
}
module.exports={MotorContaUnicaEnsaioSQLite};
