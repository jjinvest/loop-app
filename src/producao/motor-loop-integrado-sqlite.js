'use strict';
// Ponte de regras do LOOP no MESMO SQLite da identidade definitiva.
// Apenas leitura em produção. Eventos de ensaio exigem modo não produtivo.
// Não usar MotorContaUnicaEnsaioSQLite nem importar tabelas staging.
// Não cria pagamento, posição remunerada, Pix, saldo, saque ou comissão.
const {SimuladorLoop}=require('../domain/simulador-loop');
const {LIMITE_POSICOES_ATIVAS}=require('../domain/capacidade-posicoes-loop');
const TABELAS_MOTOR=Object.freeze([
 'loop_real_motor_estado','loop_real_motor_compras',
 'loop_real_motor_eventos','loop_real_motor_qualificacoes'
]);
const ID=/^[a-zA-Z0-9_-]{3,100}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function restaurar(snapshot){
 const sim=snapshot?SimuladorLoop.restaurarSnapshot(JSON.parse(snapshot)):
  new SimuladorLoop();
 // Não permitir atribuir indicação em massa ao titular.
 sim.filas.travaPromocaoAtiva=true;
 return sim;
}
class MotorLoopIntegradoSQLite{
 constructor({banco}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE name='loop_real_contas'").get())
   falha('LOOP_MOTOR_REQUER_IDENTIDADE_NO_MESMO_SQLITE');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_motor_estado(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'revisao INTEGER NOT NULL CHECK(revisao>0),',
   'snapshot TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_motor_compras(',
   'pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL REFERENCES',
   'loop_real_contas(id) ON DELETE RESTRICT,',
   'posicao_id INTEGER NOT NULL UNIQUE,valor_centavos INTEGER NOT NULL',
   'CHECK(valor_centavos>=25000));',
   // A indicação só pode ser qualificada uma vez por cadastro vinculando.
   'CREATE TABLE IF NOT EXISTS loop_real_motor_qualificacoes(',
   'indicado_id TEXT PRIMARY KEY REFERENCES',
   'loop_real_vinculos_indicacao(indicado_id) ON DELETE RESTRICT,',
   'indicador_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'pedido_id TEXT NOT NULL UNIQUE REFERENCES loop_real_motor_compras(pedido_id) ON DELETE RESTRICT,',
   'posicao_id INTEGER NOT NULL,evento_id TEXT NOT NULL UNIQUE,',
   'qualificado_em INTEGER NOT NULL CHECK(qualificado_em>0));',
   'CREATE TRIGGER IF NOT EXISTS loop_real_motor_qualificacao_imutavel_update',
   "BEFORE UPDATE ON loop_real_motor_qualificacoes BEGIN SELECT RAISE(ABORT,'qualificacao imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_real_motor_qualificacao_imutavel_delete',
   "BEFORE DELETE ON loop_real_motor_qualificacoes BEGIN SELECT RAISE(ABORT,'qualificacao imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS loop_real_motor_eventos(',
   'chave TEXT PRIMARY KEY,tipo TEXT NOT NULL',
   "CHECK(tipo IN ('INDICACAO','EVENTO','GIRO')),",
   'pedido_id TEXT REFERENCES loop_real_motor_compras(pedido_id)',
   'ON DELETE RESTRICT);'
  ].join(' '));
  this.verificar();
 }
 _transacao(fn){
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   if(this.banco.prepare(
    "SELECT 1 FROM sqlite_master WHERE name='loop_real_promocoes_pedido_ensaio'"
   ).get()){
    const cancelada=this.banco.prepare([
     'SELECT 1 FROM loop_real_promocoes_pedido_ensaio p',
     'JOIN loop_real_eventos_comerciais e ON e.pedido_id=p.pedido_id',
     "WHERE e.estado='CANCELADO' LIMIT 1"
    ].join(' ')).get();
    if(cancelada)falha('LOOP_PROMOCAO_ESTORNADA_EXIGE_REVISAO');
   }
   const row=this.banco.prepare(
    'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1').get();
   const sim=restaurar(row?.snapshot);
   const resultado=fn(sim);
   this.banco.prepare([
    'INSERT INTO loop_real_motor_estado(id,revisao,snapshot)',
    'VALUES(1,1,?) ON CONFLICT(id)',
    'DO UPDATE SET revisao=revisao+1,snapshot=excluded.snapshot'
   ].join(' ')).run(JSON.stringify(sim.exportarSnapshot()));
   this.banco.exec('COMMIT');
   return resultado;
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 _ensaio(){
  if(process.env.NODE_ENV==='production')
   falha('LOOP_MOTOR_SEM_COMPROVANTE_PRODUTIVO');
 }
 _titular(id){
  if(typeof id!=='string'||!/^titular-[a-f0-9-]{36}$/.test(id)||
     !this.banco.prepare(
      'SELECT 1 FROM loop_real_contas WHERE id=?'
     ).get(id))falha('LOOP_TITULAR_NAO_RECONHECIDO');
 }
 _sim(){return restaurar(this.banco.prepare(
  'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get()?.snapshot);}
 _ativos(sim,id){
  return [...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,
   ...sim.tabuleiro.vagas].filter(p=>p&&p.empresa!==true&&
   p.participanteId===id).length;
 }
 // Métodos de teste internos. Em produção: nenhum pode criar posições.
 _registrarCompraEmSim(sim,{titularId,pedidoId,valorCentavos}={}){
  if(typeof pedidoId!=='string'||!ID.test(pedidoId)||
     !Number.isSafeInteger(valorCentavos)||valorCentavos<25000)
   falha('LOOP_COMPRA_ENSAIO_INVALIDA');
  const anterior=this.banco.prepare(
   'SELECT titular_id,posicao_id,valor_centavos FROM loop_real_motor_compras WHERE pedido_id=?'
  ).get(pedidoId);
  if(anterior){
   if(anterior.titular_id!==titularId||anterior.valor_centavos!==valorCentavos)
    falha('LOOP_PEDIDO_DIVERGENTE');
   return {repetida:true,posicaoId:anterior.posicao_id};
  }
  if(this._ativos(sim,titularId)>=LIMITE_POSICOES_ATIVAS)
   falha('LOOP_MAXIMO_DEZ_POSICOES');
  const res=sim.registrarPosicaoSimulada({
   nome:'Posição de ensaio',participanteId:titularId,vendaId:pedidoId
  });
  this.banco.prepare([
   'INSERT INTO loop_real_motor_compras(pedido_id,titular_id,posicao_id,valor_centavos)',
   'VALUES(?,?,?,?)'
  ].join(' ')).run(pedidoId,titularId,res.posicao.id,valorCentavos);
  return {repetida:false,posicaoId:res.posicao.id};
 }
 registrarCompraEnsaio({titularId,pedidoId,valorCentavos=25000}={}){
  this._ensaio();this._titular(titularId);
  return this._transacao(sim=>this._registrarCompraEmSim(sim,{
   titularId,pedidoId,valorCentavos
  }));
 }
 // Para a ponte comercial: única transação já aberta no MESMO SQLite.
 // Se a ponte falhar, o snapshot, a fila e o pedido são revertidos juntos.
 registrarCompraConciliadaEnsaioEmTransacao({
  titularId,pedidoId,valorCentavos
 }={}){
  this._ensaio();
  if(this.banco.isTransaction!==true)
   falha('LOOP_COMPRA_CONCILIADA_REQUER_TRANSACAO');
  this._titular(titularId);
  const linha=this.banco.prepare(
   'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
  ).get();
  const sim=restaurar(linha?.snapshot);
  const res=this._registrarCompraEmSim(sim,{
   titularId,pedidoId,valorCentavos
  });
  if(!res.repetida){
   this.banco.prepare([
    'INSERT INTO loop_real_motor_estado(id,revisao,snapshot)',
    'VALUES(1,1,?) ON CONFLICT(id)',
    'DO UPDATE SET revisao=revisao+1,snapshot=excluded.snapshot'
   ].join(' ')).run(JSON.stringify(sim.exportarSnapshot()));
  }
  return res;
 }
 registrarIndicacaoEnsaio({indicadorId,indicadoId,posicaoId,pedidoIndicado,eventoId}={}){
  this._ensaio();this._titular(indicadorId);this._titular(indicadoId);
  if(indicadorId===indicadoId||!Number.isSafeInteger(posicaoId)||
     posicaoId<1||typeof eventoId!=='string'||!ID.test(eventoId)||
     typeof pedidoIndicado!=='string'||!ID.test(pedidoIndicado))
   falha('LOOP_INDICACAO_INVALIDA');
  return this._transacao(sim=>{
   const visto=this.banco.prepare(
    'SELECT 1 FROM loop_real_motor_eventos WHERE chave=?'
   ).get('i:'+eventoId);
   if(visto){
    const anterior=this.banco.prepare([
     'SELECT indicado_id,indicador_id,posicao_id,pedido_id',
     'FROM loop_real_motor_qualificacoes WHERE evento_id=?'
    ].join(' ')).get('i:'+eventoId);
    if(!anterior||anterior.indicado_id!==indicadoId||
       anterior.indicador_id!==indicadorId||
       anterior.posicao_id!==posicaoId||
       anterior.pedido_id!==pedidoIndicado)
     falha('LOOP_INDICACAO_REPLAY_DIVERGENTE');
    return {repetida:true};
   }
   const vinculo=this.banco.prepare(
    'SELECT indicador_id FROM loop_real_vinculos_indicacao WHERE indicado_id=?'
   ).get(indicadoId);
   if(!vinculo||vinculo.indicador_id!==indicadorId)
    falha('LOOP_SEM_CONVITE_CADASTRADO');
   if(this.banco.prepare(
    'SELECT 1 FROM loop_real_motor_qualificacoes WHERE indicado_id=?'
   ).get(indicadoId))falha('LOOP_INDICACAO_JA_QUALIFICADA');
   const pedido=this.banco.prepare(
    'SELECT titular_id FROM loop_real_motor_compras WHERE pedido_id=?'
   ).get(pedidoIndicado);
   if(!pedido||pedido.titular_id!==indicadoId)
    falha('LOOP_INDICADO_SEM_COMPRA_VERIFICADA');
   const r=sim.registrarIndicacaoSimulada({
    indicadorId,eventoId:'i:'+eventoId,posicaoAlvoId:posicaoId
   });
   this.banco.prepare(
    "INSERT INTO loop_real_motor_eventos(chave,tipo,pedido_id) VALUES(?,'INDICACAO',?)"
   ).run('i:'+eventoId,pedidoIndicado);
   this.banco.prepare([
    'INSERT INTO loop_real_motor_qualificacoes',
    '(indicado_id,indicador_id,pedido_id,posicao_id,evento_id,qualificado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(indicadoId,indicadorId,pedidoIndicado,posicaoId,
    'i:'+eventoId,Date.now());
   return {repetida:false,promovidas:r.promovidas.length};
  });
 }
 prepararTabuleiroEnsaio(){
  this._ensaio();
  return this._transacao(sim=>sim.prepararTabuleiro());
 }
 registrarEventoEnsaio({pedidoId}={}){
  this._ensaio();
  if(typeof pedidoId!=='string'||!ID.test(pedidoId))
   falha('LOOP_EVENTO_INVALIDO');
  return this._transacao(sim=>{
   const x=this.banco.prepare(
    'SELECT 1 FROM loop_real_motor_compras WHERE pedido_id=?'
   ).get(pedidoId);
   if(!x)falha('LOOP_EVENTO_SEM_COMPRA');
   const chave='e:'+pedidoId;
   if(this.banco.prepare(
    'SELECT 1 FROM loop_real_motor_eventos WHERE chave=?'
   ).get(chave))return {repetida:true};
   const r=sim.registrarVendaNoCicloSimulada({vendaId:chave});
   this.banco.prepare(
    "INSERT INTO loop_real_motor_eventos(chave,tipo,pedido_id) VALUES(?,'EVENTO',?)"
   ).run(chave,pedidoId);
   return {repetida:false,eventosNoCiclo:r.estado.vendasNoCiclo};
  });
 }
 controlarCatracaEnsaio({acao}={}){
  this._ensaio();
  if(!['ABRIR','PAUSAR','GIRAR'].includes(acao))falha('LOOP_ACAO_INVALIDA');
  return this._transacao(sim=>{
   if(acao==='ABRIR'){sim.abrirCatraca();return {aberta:true};}
   if(acao==='PAUSAR'){sim.pausarCatraca();return {aberta:false};}
   // As seis provas DEVEM existir no livro de ensaio.
   const vendas=sim.tabuleiro.vendasDoCiclo;
   if(vendas.length===6){
    for(const v of vendas){
     if(!this.banco.prepare(
      "SELECT 1 FROM loop_real_motor_eventos WHERE chave=? AND tipo='EVENTO'"
     ).get(v.vendaId))falha('LOOP_EVENTO_SEM_ORIGEM');
    }
   }
   const r=sim.tentarGiro();
   if(r.girou){
    this.banco.prepare(
     "INSERT INTO loop_real_motor_eventos(chave,tipo) VALUES(?,'GIRO')"
    ).run('g:'+sim.giros);
   }
   return {girou:r.girou,motivo:r.motivo||null,
    giros:sim.giros};
  });
 }
 verificar(){
  // Snapshot da auditoria fica consistente enquanto outras conexões escrevem.
  this.banco.exec('BEGIN');
  try{
  const row=this.banco.prepare(
   'SELECT snapshot FROM loop_real_motor_estado WHERE id=1').get();
  const sim=restaurar(row?.snapshot);
  const compras=this.banco.prepare(
   'SELECT pedido_id,titular_id,posicao_id FROM loop_real_motor_compras'
  ).all();
  if(compras.length!==sim.filas.vendasRegistradas.size)
   falha('LOOP_MOTOR_COMPRA_SNAPSHOT_DIVERGENTE');
  for(const c of compras){
   const p=sim.filas.vendasRegistradas.get(c.pedido_id);
   if(!p||p.id!==c.posicao_id||p.participanteId!==c.titular_id)
    falha('LOOP_MOTOR_TITULAR_POSICAO_DIVERGENTE');
  }
  const eventos=this.banco.prepare(
   "SELECT chave FROM loop_real_motor_eventos WHERE tipo='EVENTO'"
  ).all().map(x=>x.chave);
  if(eventos.length!==sim.tabuleiro.vendasProcessadas.size||
     eventos.some(x=>!sim.tabuleiro.vendasProcessadas.has(x)))
   falha('LOOP_MOTOR_EVENTOS_DIVERGENTES');
  const qualificacoes=this.banco.prepare([
   'SELECT q.indicado_id,q.indicador_id,q.pedido_id,q.posicao_id,q.evento_id,',
   'v.indicador_id AS vinculo_indicador,p.titular_id AS comprador',
   'FROM loop_real_motor_qualificacoes q',
   'JOIN loop_real_vinculos_indicacao v ON v.indicado_id=q.indicado_id',
   'JOIN loop_real_motor_compras p ON p.pedido_id=q.pedido_id'
  ].join(' ')).all();
  const indicacoes=this.banco.prepare(
   "SELECT chave FROM loop_real_motor_eventos WHERE tipo='INDICACAO'"
  ).all().map(x=>x.chave);
  const totalIndicacoes=[...sim.filas.indicacoes.values()]
   .reduce((s,v)=>s+v.quantidade,0);
  if(totalIndicacoes!==qualificacoes.length||
     qualificacoes.length!==indicacoes.length||
     qualificacoes.length!==sim.filas.indicacoesProcessadas.size||
     qualificacoes.some(q=>
      q.indicador_id!==q.vinculo_indicador||
      q.comprador!==q.indicado_id||
      !indicacoes.includes(q.evento_id)||
      !sim.filas.indicacoesProcessadas.has(q.evento_id)))
   falha('LOOP_MOTOR_INDICACOES_DIVERGENTES');
  const giros=this.banco.prepare(
   "SELECT COUNT(*) AS n FROM loop_real_motor_eventos WHERE tipo='GIRO'"
  ).get().n;
  if(giros!==sim.giros)falha('LOOP_MOTOR_GIROS_DIVERGENTES');
  if(process.env.NODE_ENV==='production'&&
     (compras.length>0||eventos.length>0||giros>0))
   falha('LOOP_MOTOR_ENSAIO_PROIBIDO_PRODUCAO');
  this.banco.exec('COMMIT');
  return {integridade:'OK',compras:compras.length,eventos:eventos.length,
   giros};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 consultar({titularId=null}={}){
  if(titularId!==null)this._titular(titularId);
  const sim=this._sim(),estado=sim.estado();
  // Pedido confirmado pelo PSP é apenas um evento comercial pendente.
  // Não soma luzes, não entra em fila nem abre catraca.
  let comercial={registrados:0,aguardandoConciliacao:0,
   cancelados:0,liberadosParaLoop:0};
  if(this.banco.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_eventos_comerciais'"
  ].join(' ')).get()){
   const filtro=titularId===null?'':'WHERE titular_id=?';
   const stmt=this.banco.prepare([
    'SELECT COUNT(*) AS total,',
    "COALESCE(SUM(CASE WHEN estado='AGUARDANDO_CONCILIACAO'",
    'THEN 1 ELSE 0 END),0) AS pendentes,',
    "COALESCE(SUM(CASE WHEN estado='CANCELADO'",
    'THEN 1 ELSE 0 END),0) AS cancelados',
    'FROM loop_real_eventos_comerciais',filtro
   ].join(' '));
   const x=titularId===null?stmt.get():stmt.get(titularId);
   comercial={registrados:x.total,aguardandoConciliacao:x.pendentes,
    cancelados:x.cancelados,liberadosParaLoop:0};
  }
  // O evento aprovado pelo PSP continua aguardando validação FINANCEIRA REAL.
  // A posição fictícia criada em laboratório aparece em coluna separada.
  if(this.banco.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_promocoes_pedido_ensaio'"
  ].join(' ')).get()){
   const filtro=titularId===null?'':'AND p.titular_id=?';
   const q=this.banco.prepare([
    'SELECT COUNT(*) AS total,',
    "COALESCE(SUM(CASE WHEN e.estado='CANCELADO'",
    'THEN 1 ELSE 0 END),0) AS revisao',
    'FROM loop_real_promocoes_pedido_ensaio p',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=p.pedido_id',
    'WHERE 1=1',filtro
   ].join(' '));
   const x=titularId===null?q.get():q.get(titularId);
   comercial={...comercial,promovidasSomenteEmEnsaio:x.total,
    emRevisaoPorEstornoEnsaio:x.revisao};
  }
  const visual=p=>p?{
   numero:p.id,minha:p.participanteId===titularId&&p.empresa!==true,
   dourada:p.empresa===true,
   indicacoesVinculadas:p.indicacoesVinculadas||0
  }:null;
  const posicoes=[
   ...sim.filas.filaA.map(p=>({...p,local:'FILA_A'})),
   ...sim.filas.filaB.map(p=>({...p,local:'FILA_B'})),
   ...(sim.tabuleiro.centro?[{...sim.tabuleiro.centro,local:'CENTRO'}]:[]),
   ...sim.tabuleiro.vagas.flatMap((p,i)=>p?[{...p,local:'VAGA_'+(i+1)}]:[])
  ];
  const azuis=sim.filas.filaB.filter(p=>p.statusAdesao==='PENDENTE').length;
  const revisoes=sim.filas.filaB.filter(p=>p.statusAdesao==='REVISAR_PSP').length;
  return {status:'FLUXO_INTERNO_EM_VALIDACAO',
   fonte:'IDENTIDADE_E_MOTOR_MESMO_SQLITE',
   transacoesReais:false,financeiroReal:false,
   limitePosicoesAtivas:LIMITE_POSICOES_ATIVAS,
   limitePorTitularTabuleiro:2,ordemAlimentacao:'3A:1B',
   eventosPorCiclo:6,eventosComerciais:comercial,catraca:{
    estado:estado.catraca.status,giros:sim.giros
   },filaA:sim.filas.filaA.length,
   filaB:sim.filas.filaB.length-revisoes,
   posicoesAzuisPendentes:azuis,posicoesEmRevisaoNaFilaB:revisoes,
   tabuleiro:{
    centro:visual(sim.tabuleiro.centro),
    vagas:sim.tabuleiro.vagas.map(visual),
    eventosNoCiclo:sim.tabuleiro.vendasDoCiclo.length,
    ciclosConcluidos:sim.tabuleiro.ciclosConcluidos.length
   },minhasPosicoes:titularId===null?[]:posicoes.filter(p=>
    p.participanteId===titularId&&p.empresa!==true)
    .map(p=>({numero:p.id,
     local:p.statusAdesao==='REVISAR_PSP'?'EM_REVISAO_PSP':p.local,
     indicacoesVinculadas:p.indicacoesVinculadas||0,
     estadoAdesao:p.statusAdesao||'ATIVA_ENSAIO',
     aguardandoCpfTermos:p.statusAdesao==='PENDENTE'})),
   posicoesReais:0,saquesReais:0};
 }
}
module.exports={MotorLoopIntegradoSQLite,TABELAS_MOTOR};
