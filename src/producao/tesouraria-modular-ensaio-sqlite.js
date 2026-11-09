'use strict';
// Ensaio transacional integrado: venda PSP ficticia -> alocacao -> banco ->
// abastecimento do executor Pix -> saque -> conciliacao -> contingencia.
// Usa o mesmo SQLite da identidade e pedidos, mas nunca abre HTTP nem APIs
// reais. Nem mesmo NODE_ENV=production pode instanciar este motor de ensaio.
const {createHash}=require('node:crypto');
const {ObservacoesPSPEnsaioSQLite}=
 require('./observacoes-psp-ensaio-sqlite');
const {planejarRecebimentoTresBancos}=
 require('../domain/plano-roteamento-tres-bancos-lab');
const {criarPlanoFinanceiro,validarPlanoFinanceiro,planejarTrocaFinanceira}=
 require('./portas-financeiras-modulares');
const TABELAS_TESOURARIA_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_planos','loop_lab_tesouraria_saldos',
 'loop_lab_tesouraria_movimentos','loop_lab_tesouraria_recebimentos',
 'loop_lab_tesouraria_creditos','loop_lab_tesouraria_creditos_eventos',
 'loop_lab_tesouraria_saques','loop_lab_tesouraria_transferencias',
 'loop_lab_tesouraria_tentativas',
 'loop_lab_tesouraria_migracoes',
 'loop_lab_tesouraria_compromissos_psp',
 'loop_lab_tesouraria_observacoes_psp'
]);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const idOk=x=>typeof x==='string'&&ID.test(x);
const contaOk=x=>typeof x==='string'&&
 /^(PSP|LOOP|LOJA|COFRES|PAGADOR|TRANSITO):[A-Za-z0-9_-]{1,120}$/.test(x);
const dinheiro=x=>Number.isSafeInteger(x)&&x>0&&x<=1e12;
const hash=s=>createHash('sha256').update(s).digest('hex');
const credor=plano=>plano.rotas.CAPTACAO;
const saldoLoop=id=>'LOOP:'+id;
const saldoLoja=id=>'LOJA:'+id;
const saldoExecutor=id=>'PAGADOR:'+id;
const saldoTransito=id=>'TRANSITO:'+id;
function checarTransacao(db){
 if(db.isTransaction!==true)falha('TESOURARIA_ENSAIO_REQUER_TRANSACAO');
}
class TesourariaModularEnsaioSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('TESOURARIA_ENSAIO_PROIBIDA_EM_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function'||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_contas'").get()||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='loja_real_pedidos'").get()||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_eventos_comerciais'").get())
   falha('TESOURARIA_ENSAIO_REQUER_PEDIDOS_E_IDENTIDADE_UNIFICADOS');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_planos(',
   'revisao INTEGER PRIMARY KEY CHECK(revisao>0),',
   'rotas_json TEXT NOT NULL,criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_saldos(',
   'conta TEXT PRIMARY KEY,centavos INTEGER NOT NULL CHECK(centavos>=0));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_movimentos(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,operacao_id TEXT NOT NULL UNIQUE,',
   'origem TEXT,destino TEXT,centavos INTEGER NOT NULL CHECK(centavos>0),',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,',
   'CHECK(origem IS NOT NULL OR destino IS NOT NULL),',
   'CHECK(origem IS NULL OR destino IS NULL OR origem!=destino));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_recebimentos(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loja_real_pedidos(pedido_id),',
   'liquidacao_id TEXT NOT NULL UNIQUE,',
   'valor_bruto INTEGER NOT NULL,tarifa INTEGER NOT NULL,',
   'loop_centavos INTEGER NOT NULL,margem INTEGER NOT NULL,',
   'retido INTEGER NOT NULL,psp TEXT NOT NULL,banco_loop TEXT NOT NULL,',
   'banco_loja TEXT NOT NULL,revisao INTEGER NOT NULL',
   'REFERENCES loop_lab_tesouraria_planos(revisao));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_creditos(',
   'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id),',
   'disponivel INTEGER NOT NULL CHECK(disponivel>=0),',
   'reservado INTEGER NOT NULL CHECK(reservado>=0));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_creditos_eventos(',
   'referencia TEXT PRIMARY KEY,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id),',
   "tipo TEXT NOT NULL CHECK(tipo IN ('CREDITO','RESERVA','PAGO')),",
   'centavos INTEGER NOT NULL CHECK(centavos>0),',
   'criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_saques(',
   'saque_id TEXT PRIMARY KEY,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id),',
   'chave_idempotencia TEXT NOT NULL,',
   'centavos INTEGER NOT NULL CHECK(centavos>=2500),',
   'origem TEXT NOT NULL,executor TEXT NOT NULL,',
   'revisao INTEGER NOT NULL REFERENCES loop_lab_tesouraria_planos(revisao),',
   'estado TEXT NOT NULL,transferencia_id TEXT,tentativa_id TEXT,',
   'UNIQUE(titular_id,chave_idempotencia));',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_transferencias(',
   'transferencia_id TEXT PRIMARY KEY,saque_id TEXT NOT NULL',
   'REFERENCES loop_lab_tesouraria_saques(saque_id),',
   "estado TEXT NOT NULL CHECK(estado IN ('INDETERMINADA','CONFIRMADA','DEVOLVIDA')),",
   'origem TEXT NOT NULL,destino TEXT NOT NULL,centavos INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_tentativas(',
   'tentativa_id TEXT PRIMARY KEY,saque_id TEXT NOT NULL',
   'REFERENCES loop_lab_tesouraria_saques(saque_id),',
   "estado TEXT NOT NULL CHECK(estado IN ('INDETERMINADA','CONFIRMADA','FALHOU')),",
   'centavos INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_migracoes(',
   'migracao_id TEXT PRIMARY KEY,origem TEXT NOT NULL,destino TEXT NOT NULL,',
   'centavos INTEGER NOT NULL CHECK(centavos>0),',
   "estado TEXT NOT NULL CHECK(estado IN ('INDETERMINADA','CONFIRMADA','DEVOLVIDA')));",
   ...['loop_lab_tesouraria_planos','loop_lab_tesouraria_movimentos',
      'loop_lab_tesouraria_recebimentos','loop_lab_tesouraria_creditos_eventos']
    .flatMap(t=>[
     'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_update BEFORE UPDATE ON '+t+
      " BEGIN SELECT RAISE(ABORT,'TESOURARIA_ENSAIO_HISTORICO_IMUTAVEL'); END;",
     'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_delete BEFORE DELETE ON '+t+
      " BEGIN SELECT RAISE(ABORT,'TESOURARIA_ENSAIO_HISTORICO_IMUTAVEL'); END;"
    ])
  ].join(' '));
  if(!banco.prepare('SELECT revisao FROM loop_lab_tesouraria_planos LIMIT 1').get()){
   const p=criarPlanoFinanceiro();
   banco.prepare('INSERT INTO loop_lab_tesouraria_planos VALUES(?,?,?)')
    .run(p.revisao,JSON.stringify(p.rotas),this._agora());
  }
  this.observacoesPsp=new ObservacoesPSPEnsaioSQLite({banco,agora});
  this.verificar();
 }
 _agora(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)
   falha('TESOURARIA_ENSAIO_RELOGIO_INVALIDO');
  return ts;
 }
 _transacao(f){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const result=f();
   this.verificar();
   this.db.exec('COMMIT');
   return result;
  }catch(e){
   this.db.exec('ROLLBACK');throw e;
  }
 }
 plano(){
  const r=this.db.prepare(
   'SELECT revisao,rotas_json FROM loop_lab_tesouraria_planos ORDER BY revisao DESC LIMIT 1'
  ).get();
  if(!r)falha('TESOURARIA_ENSAIO_PLANO_AUSENTE');
  return validarPlanoFinanceiro(criarPlanoFinanceiro({
   revisao:r.revisao,rotas:JSON.parse(r.rotas_json)
  }));
 }
 _saldo(conta){
  return this.db.prepare(
   'SELECT centavos FROM loop_lab_tesouraria_saldos WHERE conta=?'
  ).get(conta)?.centavos||0;
 }
 _alterar(conta,delta){
  if(!contaOk(conta)||!Number.isSafeInteger(delta))
   falha('TESOURARIA_ENSAIO_CONTA_INVALIDA');
  const atual=this._saldo(conta),novo=atual+delta;
  if(!Number.isSafeInteger(novo)||novo<0||novo>1e12)
   falha('TESOURARIA_ENSAIO_SALDO_INSUFICIENTE');
  this.db.prepare([
   'INSERT INTO loop_lab_tesouraria_saldos(conta,centavos)',
   'VALUES(?,?) ON CONFLICT(conta) DO UPDATE SET centavos=excluded.centavos'
  ].join(' ')).run(conta,novo);
 }
 _movimento({id,origem=null,destino=null,centavos}){
  checarTransacao(this.db);
  if(!idOk(id)||!dinheiro(centavos)||
     (origem!==null&&!contaOk(origem))||
     (destino!==null&&!contaOk(destino))||
     (!origem&&!destino)||origem===destino)
   falha('TESOURARIA_ENSAIO_MOVIMENTO_INVALIDO');
  if(this.db.prepare(
   'SELECT 1 FROM loop_lab_tesouraria_movimentos WHERE operacao_id=?'
  ).get(id))falha('TESOURARIA_ENSAIO_MOVIMENTO_REPETIDO');
  if(origem)this._alterar(origem,-centavos);
  if(destino)this._alterar(destino,centavos);
  const ultimo=this.db.prepare([
   'SELECT id,hash_atual FROM loop_lab_tesouraria_movimentos',
   'ORDER BY id DESC LIMIT 1'
  ].join(' ')).get();
  const next=(ultimo?.id||0)+1,prev=ultimo?.hash_atual||'GENESE';
  const ts=this._agora();
  const dados=[next,id,origem,destino,centavos,ts,prev];
  const assinatura=hash(JSON.stringify(dados));
  this.db.prepare([
   'INSERT INTO loop_lab_tesouraria_movimentos',
   '(id,operacao_id,origem,destino,centavos,hash_anterior,hash_atual,criado_em)',
   'VALUES(?,?,?,?,?,?,?,?)'
  ].join(' ')).run(next,id,origem,destino,centavos,prev,assinatura,ts);
 }
 _creditoEvento({ref,titular,tipo,centavos}){
  checarTransacao(this.db);
  if(!idOk(ref)||!idOk(titular)||!dinheiro(centavos))
   falha('TESOURARIA_ENSAIO_CREDITO_INVALIDO');
  this.db.prepare([
   'INSERT INTO loop_lab_tesouraria_creditos_eventos',
   '(referencia,titular_id,tipo,centavos,criado_em) VALUES(?,?,?,?,?)'
  ].join(' ')).run(ref,titular,tipo,centavos,this._agora());
 }
 _titular(id){
  if(!idOk(id)||!this.db.prepare(
   'SELECT 1 FROM loop_real_contas WHERE id=?'
  ).get(id))falha('TESOURARIA_ENSAIO_TITULAR_INVALIDO');
 }
 _saque(id){
  if(!idOk(id))falha('TESOURARIA_ENSAIO_SAQUE_INVALIDO');
  const r=this.db.prepare(
   'SELECT * FROM loop_lab_tesouraria_saques WHERE saque_id=?'
  ).get(id);
  if(!r)falha('TESOURARIA_ENSAIO_SAQUE_INEXISTENTE');
  return r;
 }
 _saquePublico(r){
  return {saqueId:r.saque_id,estado:r.estado,
   valorCentavos:r.centavos,origem:r.origem,executor:r.executor,
   revisao:r.revisao,financeiroReal:false,saqueRealExecutado:false};
 }
 registrarRecebimentoEnsaio({
  pedidoId,liquidacaoId,fotografia,tarifaEnsaioCentavos,planoRevisao
 }={}){
  if(!idOk(pedidoId)||!idOk(liquidacaoId)||
     !Number.isSafeInteger(tarifaEnsaioCentavos)||
     tarifaEnsaioCentavos<0||tarifaEnsaioCentavos>1e12)
   falha('TESOURARIA_ENSAIO_RECEBIMENTO_INVALIDO');
  return this._transacao(()=>{
   const p=this.plano();
   const anterior=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_recebimentos WHERE pedido_id=?'
   ).get(pedidoId);
   if(anterior){
    if(anterior.liquidacao_id!==liquidacaoId||
       anterior.valor_bruto!==fotografia?.totalBrutoCotadoCentavos||
       anterior.tarifa!==tarifaEnsaioCentavos)
     falha('TESOURARIA_ENSAIO_REPLAY_DIVERGENTE');
    return {registrado:false,repetido:true,financeiroReal:false};
   }
   if(planoRevisao!==p.revisao||!credor(p)||!p.rotas.DISTRIBUICAO||
      !p.rotas.CUSTODIA_LOOP||!p.rotas.CUSTODIA_LOJA)
    falha('TESOURARIA_ENSAIO_ROTA_NAO_DEFINIDA');
   const pedido=this.db.prepare([
    'SELECT p.pedido_id,p.valor_total_centavos,p.status,e.estado AS evento',
    'FROM loja_real_pedidos p JOIN loop_real_eventos_comerciais e',
    'ON e.pedido_id=p.pedido_id WHERE p.pedido_id=?'
   ].join(' ')).get(pedidoId);
   if(!pedido||pedido.status!=='APROVADO_PARA_EXPEDICAO'||
      pedido.evento!=='AGUARDANDO_CONCILIACAO'||
      pedido.valor_total_centavos!==fotografia?.totalBrutoCotadoCentavos)
    falha('TESOURARIA_ENSAIO_PEDIDO_SEM_EVENTO_CONSISTENTE');
   const dados=planejarRecebimentoTresBancos({
    fotografia,taxaRealPspCentavos:tarifaEnsaioCentavos,planoFinanceiro:p
   });
   if(dados.alerta!=='PLANO_CONTABIL_CONSISTENTE'||
      dados.margemParaMercadoPagoPrevistaCentavos===null||
      !Number.isSafeInteger(dados.margemParaMercadoPagoPrevistaCentavos)||
      dados.margemParaMercadoPagoPrevistaCentavos<0||
      !Number.isSafeInteger(dados.loopReservarCentavos)||
      dados.loopReservarCentavos<0||
      !Number.isSafeInteger(dados.valorLiquidoPrevistoCentavos)||
      dados.valorLiquidoPrevistoCentavos<=0)
    falha('TESOURARIA_ENSAIO_REPARTICAO_NAO_FINANCIAVEL');
   const total=dados.valorLiquidoPrevistoCentavos,
    loop=dados.loopReservarCentavos,
    margem=dados.margemParaMercadoPagoPrevistaCentavos,
    retido=total-loop-margem;
   if(retido<0||!Number.isSafeInteger(retido))
    falha('TESOURARIA_ENSAIO_REPARTICAO_INCONSISTENTE');
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_recebimentos(',
    'pedido_id,liquidacao_id,valor_bruto,tarifa,loop_centavos,margem,',
    'retido,psp,banco_loop,banco_loja,revisao)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(pedidoId,liquidacaoId,
    pedido.valor_total_centavos,tarifaEnsaioCentavos,loop,margem,
    retido,p.rotas.CAPTACAO,p.rotas.CUSTODIA_LOOP,
    p.rotas.CUSTODIA_LOJA,p.revisao);
   const psp='PSP:'+p.rotas.CAPTACAO;
   this._movimento({id:'VENDA_'+pedidoId,destino:psp,centavos:total});
   if(loop>0)this._movimento({id:'LOOP_'+pedidoId,
    origem:psp,destino:saldoLoop(p.rotas.CUSTODIA_LOOP),centavos:loop});
   if(margem>0)this._movimento({id:'LOJA_'+pedidoId,
    origem:psp,destino:saldoLoja(p.rotas.CUSTODIA_LOJA),centavos:margem});
   return {registrado:true,repetido:false,retidoCentavos:retido,
    reservadoLoopCentavos:loop,margemLojaCentavos:margem,
    custosTributosPendentesCentavos:retido,financeiroReal:false,
    distribuicaoRealExecutada:false,recebimentoSimulado:true};
  });
 }
 registrarCreditoEnsaio({titularId,creditoId,valorCentavos}={}){
  if(!idOk(creditoId)||!dinheiro(valorCentavos))
   falha('TESOURARIA_ENSAIO_CREDITO_INVALIDO');
  this._titular(titularId);
  return this._transacao(()=>{
   const anterior=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_creditos_eventos WHERE referencia=?'
   ).get(creditoId);
   if(anterior){
    if(anterior.titular_id!==titularId||
       anterior.tipo!=='CREDITO'||anterior.centavos!==valorCentavos)
     falha('TESOURARIA_ENSAIO_CREDITO_REPLAY_DIVERGENTE');
    return {registrado:false,financeiroReal:false};
   }
   const cobertura=this._cobertura();
   if(cobertura.livre<valorCentavos)
    falha('TESOURARIA_ENSAIO_COBERTURA_INSUFICIENTE');
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_creditos',
    '(titular_id,disponivel,reservado) VALUES(?,?,0)',
    'ON CONFLICT(titular_id) DO UPDATE SET',
    'disponivel=disponivel+excluded.disponivel'
   ].join(' ')).run(titularId,valorCentavos);
   this._creditoEvento({
    ref:creditoId,titular:titularId,tipo:'CREDITO',centavos:valorCentavos
   });
   return {registrado:true,creditoFicticio:true,financeiroReal:false};
  });
 }
 _cobertura(){
  const contas=this.db.prepare([
   'SELECT COALESCE(SUM(centavos),0) AS total',
   'FROM loop_lab_tesouraria_saldos',
   "WHERE conta LIKE 'LOOP:%' OR conta LIKE 'PAGADOR:%'",
   "OR conta LIKE 'TRANSITO:%'"
  ].join(' ')).get().total;
  const direitos=this.db.prepare([
   'SELECT COALESCE(SUM(disponivel+reservado),0) AS total',
   'FROM loop_lab_tesouraria_creditos'
  ].join(' ')).get().total;
  if(!Number.isSafeInteger(contas)||!Number.isSafeInteger(direitos)||
     direitos>contas)falha('TESOURARIA_ENSAIO_COBERTURA_DIVERGENTE');
  return {recursos:contas,direitos,livre:contas-direitos};
 }
 solicitarSaqueEnsaio({
  titularId,saqueId,chaveIdempotencia,valorCentavos
 }={}){
  this._titular(titularId);
  if(!idOk(saqueId)||!idOk(chaveIdempotencia)||
     !dinheiro(valorCentavos)||valorCentavos<2500)
   falha('TESOURARIA_ENSAIO_SAQUE_INVALIDO');
  return this._transacao(()=>{
   const anterior=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_saques',
    'WHERE titular_id=? AND chave_idempotencia=?'
   ].join(' ')).get(titularId,chaveIdempotencia);
   if(anterior){
    if(anterior.saque_id!==saqueId||anterior.centavos!==valorCentavos)
     falha('TESOURARIA_ENSAIO_SAQUE_REPLAY_DIVERGENTE');
    return {...this._saquePublico(anterior),repetido:true};
   }
   const plano=this.plano();
   if(!plano.rotas.CUSTODIA_LOOP||!plano.rotas.EXECUTOR_SAQUE)
    falha('TESOURARIA_ENSAIO_PAGADOR_NAO_CONFIGURADO');
   const carteira=this.db.prepare(
    'SELECT disponivel FROM loop_lab_tesouraria_creditos WHERE titular_id=?'
   ).get(titularId);
   if(!carteira||carteira.disponivel<valorCentavos)
    falha('TESOURARIA_ENSAIO_CREDITO_INSUFICIENTE');
   this.db.prepare([
    'UPDATE loop_lab_tesouraria_creditos',
    'SET disponivel=disponivel-?,reservado=reservado+?',
    'WHERE titular_id=?'
   ].join(' ')).run(valorCentavos,valorCentavos,titularId);
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_saques',
    '(saque_id,titular_id,chave_idempotencia,centavos,origem,',
    "executor,revisao,estado) VALUES(?,?,?,?,?,?,?,'RESERVADO')"
   ].join(' ')).run(saqueId,titularId,chaveIdempotencia,
    valorCentavos,plano.rotas.CUSTODIA_LOOP,
    plano.rotas.EXECUTOR_SAQUE,plano.revisao);
   this._creditoEvento({
    ref:'RES_'+saqueId,titular:titularId,tipo:'RESERVA',
    centavos:valorCentavos
   });
   return {...this._saquePublico(this._saque(saqueId)),repetido:false};
  });
 }
 iniciarAbastecimentoEnsaio({saqueId,transferenciaId}={}){
  if(!idOk(transferenciaId))falha('TESOURARIA_ENSAIO_TRANSFERENCIA_INVALIDA');
  return this._transacao(()=>{
   const s=this._saque(saqueId);
   const anterior=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_transferencias WHERE transferencia_id=?'
   ).get(transferenciaId);
   if(anterior){
    if(anterior.saque_id!==saqueId)
     falha('TESOURARIA_ENSAIO_TRANSFERENCIA_REPLAY_DIVERGENTE');
    return {repetido:true,estado:anterior.estado,pixExecutado:false};
   }
   if(s.estado!=='RESERVADO')
    falha('TESOURARIA_ENSAIO_TRANSFERENCIA_DUPLA_BLOQUEADA');
   if(s.origem===s.executor){
    this.db.prepare(
     "UPDATE loop_lab_tesouraria_saques SET estado='PRONTO_PIX' WHERE saque_id=?"
    ).run(saqueId);
    return {abastecimentoNecessario:false,financeiroReal:false};
   }
   this._movimento({
    id:'TRANS_'+transferenciaId,
    origem:saldoLoop(s.origem),
    destino:saldoTransito(transferenciaId),centavos:s.centavos
   });
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_transferencias',
    "(transferencia_id,saque_id,estado,origem,destino,centavos)",
    "VALUES(?,?,'INDETERMINADA',?,?,?)"
   ].join(' ')).run(transferenciaId,saqueId,s.origem,s.executor,s.centavos);
   this.db.prepare([
    "UPDATE loop_lab_tesouraria_saques SET",
    "estado='ABASTECIMENTO_INDETERMINADO',transferencia_id=?",
    'WHERE saque_id=?'
   ].join(' ')).run(transferenciaId,saqueId);
   return {abastecimentoNecessario:true,
    estado:'INDETERMINADA',financeiroReal:false};
  });
 }
 conciliarAbastecimentoEnsaio({transferenciaId,resultado}={}){
  if(!idOk(transferenciaId)||
     !['CONFIRMADA','DEVOLVIDA','INDETERMINADA'].includes(resultado))
   falha('TESOURARIA_ENSAIO_CONCILIACAO_INVALIDA');
  return this._transacao(()=>{
   const tr=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_transferencias',
    'WHERE transferencia_id=?'
   ].join(' ')).get(transferenciaId);
   if(!tr)falha('TESOURARIA_ENSAIO_TRANSFERENCIA_INEXISTENTE');
   if(resultado==='INDETERMINADA')
    return {repetido:true,estado:tr.estado,
     aguardandoConsulta:tr.estado==='INDETERMINADA'};
   if(tr.estado===resultado)return {repetido:true,estado:tr.estado};
   if(tr.estado!=='INDETERMINADA')
    falha('TESOURARIA_ENSAIO_RECONCILIACAO_CONTRADITORIA');
   if(resultado==='INDETERMINADA')
    return {estado:tr.estado,aguardandoConsulta:true};
   this._movimento({
    id:'CONCILIAR_'+transferenciaId,
    origem:saldoTransito(transferenciaId),
    destino:resultado==='CONFIRMADA'?saldoExecutor(tr.destino):
     saldoLoop(tr.origem),centavos:tr.centavos
   });
   this.db.prepare([
    'UPDATE loop_lab_tesouraria_transferencias SET estado=?',
    'WHERE transferencia_id=?'
   ].join(' ')).run(resultado,transferenciaId);
   this.db.prepare([
    'UPDATE loop_lab_tesouraria_saques SET estado=? WHERE saque_id=?',
    'AND estado=? AND transferencia_id=?'
   ].join(' ')).run(resultado==='CONFIRMADA'?'PRONTO_PIX':'RESERVADO',
    tr.saque_id,'ABASTECIMENTO_INDETERMINADO',transferenciaId);
   return {estado:resultado,financeiroReal:false};
  });
 }
 enviarPixEnsaio({saqueId,tentativaId}={}){
  if(!idOk(tentativaId))falha('TESOURARIA_ENSAIO_PIX_INVALIDO');
  return this._transacao(()=>{
   const s=this._saque(saqueId),tentativa=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_tentativas WHERE tentativa_id=?'
   ).get(tentativaId);
   if(tentativa){
    if(tentativa.saque_id!==saqueId)
     falha('TESOURARIA_ENSAIO_PIX_REPLAY_DIVERGENTE');
    return {repetido:true,estado:tentativa.estado,financeiroReal:false};
   }
   if(s.estado!=='PRONTO_PIX')
    falha('TESOURARIA_ENSAIO_PIX_DUPLO_BLOQUEADO');
   const conta=s.origem===s.executor?
    saldoLoop(s.origem):saldoExecutor(s.executor);
   if(this._saldo(conta)<s.centavos)
    falha('TESOURARIA_ENSAIO_PAGADOR_SEM_SALDO');
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_tentativas',
    "(tentativa_id,saque_id,estado,centavos) VALUES(?,?,'INDETERMINADA',?)"
   ].join(' ')).run(tentativaId,saqueId,s.centavos);
   this.db.prepare([
    "UPDATE loop_lab_tesouraria_saques SET estado='PIX_INDETERMINADO',",
    'tentativa_id=? WHERE saque_id=?'
   ].join(' ')).run(tentativaId,saqueId);
   return {estado:'PIX_INDETERMINADO',envioBancarioReal:false};
  });
 }
 conciliarPixEnsaio({saqueId,tentativaId,resultado}={}){
  if(!idOk(tentativaId)||
     !['CONFIRMADA','FALHOU','INDETERMINADA'].includes(resultado))
   falha('TESOURARIA_ENSAIO_PIX_CONCILIACAO_INVALIDA');
  return this._transacao(()=>{
   const s=this._saque(saqueId),tentativa=this.db.prepare([
    'SELECT * FROM loop_lab_tesouraria_tentativas WHERE tentativa_id=?'
   ].join(' ')).get(tentativaId);
   if(!tentativa||tentativa.saque_id!==saqueId)
    falha('TESOURARIA_ENSAIO_PIX_TENTATIVA_INEXISTENTE');
   if(resultado==='INDETERMINADA')
    return {repetido:true,estado:tentativa.estado,
     aguardandoConsulta:tentativa.estado==='INDETERMINADA'};
   if(tentativa.estado===resultado)
    return {repetido:true,estado:tentativa.estado};
   if(tentativa.estado!=='INDETERMINADA'||
      s.estado!=='PIX_INDETERMINADO'||s.tentativa_id!==tentativaId)
    falha('TESOURARIA_ENSAIO_PIX_PROVA_CONTRADITORIA');
   if(resultado==='INDETERMINADA')
    return {estado:resultado,aguardandoConsulta:true};
   if(resultado==='CONFIRMADA'){
    this._movimento({
     id:'PIX_'+tentativaId,
     origem:s.origem===s.executor?saldoLoop(s.origem):
      saldoExecutor(s.executor),
     centavos:s.centavos
    });
    this.db.prepare([
     'UPDATE loop_lab_tesouraria_creditos SET reservado=reservado-?',
     'WHERE titular_id=? AND reservado>=?'
    ].join(' ')).run(s.centavos,s.titular_id,s.centavos);
    this._creditoEvento({
     ref:'PAGO_'+saqueId,titular:s.titular_id,tipo:'PAGO',
     centavos:s.centavos
    });
   }
   this.db.prepare([
    'UPDATE loop_lab_tesouraria_tentativas SET estado=? WHERE tentativa_id=?'
   ].join(' ')).run(resultado,tentativaId);
   this.db.prepare([
    'UPDATE loop_lab_tesouraria_saques SET estado=?,tentativa_id=?',
    'WHERE saque_id=?'
   ].join(' ')).run(resultado==='CONFIRMADA'?'PAGO':'PRONTO_PIX',
    resultado==='CONFIRMADA'?tentativaId:null,saqueId);
   return {estado:resultado,
    pagoSomenteNoEnsaio:resultado==='CONFIRMADA',financeiroReal:false};
  });
 }
 // A troca de custodiante exige movimento EXPLICITO. Trocar a rota
 // nunca transfere os fundos de contas anteriores por conta propria.
 iniciarMigracaoCustodiaEnsaio({
  migracaoId,bancoOrigem,bancoDestino,valorCentavos
 }={}){
  if(!idOk(migracaoId)||!idOk(bancoOrigem)||!idOk(bancoDestino)||
     bancoOrigem===bancoDestino||!dinheiro(valorCentavos))
   falha('TESOURARIA_ENSAIO_MIGRACAO_INVALIDA');
  return this._transacao(()=>{
   const anterior=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_migracoes WHERE migracao_id=?'
   ).get(migracaoId);
   if(anterior){
    if(anterior.origem!==bancoOrigem||
       anterior.destino!==bancoDestino||
       anterior.centavos!==valorCentavos)
     falha('TESOURARIA_ENSAIO_MIGRACAO_REPLAY_DIVERGENTE');
    return {repetido:true,estado:anterior.estado,financeiroReal:false};
   }
   if(this.db.prepare([
    "SELECT COUNT(*) AS n FROM loop_lab_tesouraria_saques",
    "WHERE estado NOT IN ('PAGO')"
   ].join(' ')).get().n>0)
    falha('TESOURARIA_ENSAIO_MIGRACAO_COM_SAQUES_PENDENTES');
   const e=this.plano();
   if(!Object.values(e.rotas).includes(bancoOrigem))
    falha('TESOURARIA_ENSAIO_MIGRACAO_ORIGEM_NAO_CONFIGURADA');
   this._movimento({
    id:'MIGRAR_'+migracaoId,origem:saldoLoop(bancoOrigem),
    destino:saldoTransito(migracaoId),centavos:valorCentavos
   });
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_migracoes',
    "(migracao_id,origem,destino,centavos,estado)",
    "VALUES(?,?,?,?,'INDETERMINADA')"
   ].join(' ')).run(migracaoId,bancoOrigem,bancoDestino,valorCentavos);
   return {repetido:false,estado:'INDETERMINADA',
    financeiroReal:false,saldoMigradoRealmente:false};
  });
 }
 conciliarMigracaoCustodiaEnsaio({migracaoId,resultado}={}){
  if(!idOk(migracaoId)||
     !['CONFIRMADA','DEVOLVIDA','INDETERMINADA'].includes(resultado))
   falha('TESOURARIA_ENSAIO_MIGRACAO_CONCILIACAO_INVALIDA');
  return this._transacao(()=>{
   const m=this.db.prepare(
    'SELECT * FROM loop_lab_tesouraria_migracoes WHERE migracao_id=?'
   ).get(migracaoId);
   if(!m)falha('TESOURARIA_ENSAIO_MIGRACAO_INEXISTENTE');
   if(resultado==='INDETERMINADA')
    return {repetido:true,estado:m.estado,
     aguardandoConsulta:m.estado==='INDETERMINADA'};
   if(m.estado===resultado)return {repetido:true,estado:m.estado};
   if(m.estado!=='INDETERMINADA')
    falha('TESOURARIA_ENSAIO_MIGRACAO_PROVA_CONTRADITORIA');
   this._movimento({
    id:'CONCILIAR_MIG_'+migracaoId,
    origem:saldoTransito(migracaoId),
    destino:resultado==='CONFIRMADA'?saldoLoop(m.destino):
     saldoLoop(m.origem),centavos:m.centavos
   });
   this.db.prepare(
    'UPDATE loop_lab_tesouraria_migracoes SET estado=? WHERE migracao_id=?'
   ).run(resultado,migracaoId);
   return {estado:resultado,financeiroReal:false};
  });
 }
 trocarRotaEnsaio({papel,provedorDestino,motivo='MUDANCA_PLANEJADA'}={}){
  return this._transacao(()=>{
   const pendentes=this.db.prepare([
    "SELECT COUNT(*) AS n FROM loop_lab_tesouraria_saques",
    "WHERE estado NOT IN ('PAGO')"
   ].join(' ')).get().n;
   const indeterminadas=this.db.prepare([
    "SELECT COUNT(*) AS n FROM loop_lab_tesouraria_saques WHERE",
    "estado IN ('ABASTECIMENTO_INDETERMINADO','PIX_INDETERMINADO')"
   ].join(' ')).get().n;
   const migracoesEmAberto=this.db.prepare([
    "SELECT COUNT(*) AS n FROM loop_lab_tesouraria_migracoes",
    "WHERE estado='INDETERMINADA'"
   ].join(' ')).get().n;
   if(migracoesEmAberto)
    falha('TESOURARIA_ENSAIO_TROCA_COM_MIGRACAO_PENDENTE');
   const troca=planejarTrocaFinanceira({
    plano:this.plano(),papel,provedorDestino,motivo,
    operacoesEmAberto:pendentes,operacoesIndeterminadas:indeterminadas
   });
   if(troca.estado!=='AGUARDA_HOMOLOGACAO')
    falha('TESOURARIA_ENSAIO_TROCA_COM_OPERACOES_PENDENTES');
   // Só troca a rota futura do ENSAIO. Não move saldo existente ou
   // altera os pedidos/saques antigos. Provedores reais ainda não existem.
   this.db.prepare('INSERT INTO loop_lab_tesouraria_planos VALUES(?,?,?)')
    .run(troca.proposto.revisao,JSON.stringify(troca.proposto.rotas),
     this._agora());
   return {revisao:troca.proposto.revisao,
    origem:troca.origem,destino:troca.destino,
    saldoAnteriorSimuladoCentavos:troca.origem===null?0:
     this._saldo(papel==='CUSTODIA_LOOP'?saldoLoop(troca.origem):
      papel==='CUSTODIA_LOJA'?saldoLoja(troca.origem):
      papel==='EXECUTOR_SAQUE'?saldoExecutor(troca.origem):
      'PSP:'+troca.origem),
    saldoMigradoAutomaticamente:false,financeiroReal:false};
  });
 }
 consultarTitularEnsaio({titularId}={}){
  this._titular(titularId);
  const saldo=this.db.prepare(
   'SELECT disponivel,reservado FROM loop_lab_tesouraria_creditos WHERE titular_id=?'
  ).get(titularId)||{disponivel:0,reservado:0};
  const saques=this.db.prepare([
   'SELECT * FROM loop_lab_tesouraria_saques WHERE titular_id=?',
   'ORDER BY rowid DESC LIMIT 40'
  ].join(' ')).all(titularId);
  return {saldoFicticioDisponivelCentavos:saldo.disponivel,
   saldoFicticioReservadoCentavos:saldo.reservado,
   saques:saques.map(x=>this._saquePublico(x)),
   producaoHabilitada:false,financeiroReal:false};
 }
 verificar(){
  const db=this.db;
  const planos=db.prepare(
   'SELECT revisao,rotas_json FROM loop_lab_tesouraria_planos ORDER BY revisao'
  ).all();
  if(!planos.length)falha('TESOURARIA_ENSAIO_SEM_PLANO');
  for(let i=0;i<planos.length;i++){
   if(planos[i].revisao!==i+1)
    falha('TESOURARIA_ENSAIO_REVISOES_DIVERGENTES');
   criarPlanoFinanceiro({
    revisao:planos[i].revisao,rotas:JSON.parse(planos[i].rotas_json)
   });
  }
  const saldos=new Map(),contas=db.prepare(
   'SELECT conta,centavos FROM loop_lab_tesouraria_saldos'
  ).all();
  for(const a of contas){
   if(!contaOk(a.conta)||!Number.isSafeInteger(a.centavos)||a.centavos<0)
    falha('TESOURARIA_ENSAIO_CONTA_ADULTERADA');
   saldos.set(a.conta,a.centavos);
  }
  const esperado=new Map();
  let prev='GENESE',seq=0;
  for(const m of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_movimentos ORDER BY id'
  ).iterate()){
   const dados=[m.id,m.operacao_id,m.origem,m.destino,
    m.centavos,m.criado_em,m.hash_anterior];
   if(m.id!==++seq||!idOk(m.operacao_id)||
      !dinheiro(m.centavos)||m.hash_anterior!==prev||
      m.hash_atual!==hash(JSON.stringify(dados)))
    falha('TESOURARIA_ENSAIO_LIVRO_ADULTERADO');
   prev=m.hash_atual;
   for(const [conta,sinal] of [
    [m.origem,-1],[m.destino,1]
   ]){
    if(!conta)continue;
    const total=(esperado.get(conta)||0)+sinal*m.centavos;
    if(!Number.isSafeInteger(total)||total<0)
     falha('TESOURARIA_ENSAIO_MOVIMENTACAO_INCONSISTENTE');
    esperado.set(conta,total);
   }
  }
  for(const [conta,valor] of esperado)
   if(saldos.get(conta)!==valor)
    falha('TESOURARIA_ENSAIO_SALDO_DIVERGENTE');
  for(const [conta,valor] of saldos)
   if((esperado.get(conta)||0)!==valor)
    falha('TESOURARIA_ENSAIO_SALDO_SEM_LIVRO');
  const creditos=new Map();
  for(const e of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_creditos_eventos'
  ).iterate()){
   if(!idOk(e.referencia)||!dinheiro(e.centavos)||
      !['CREDITO','RESERVA','PAGO'].includes(e.tipo))
    falha('TESOURARIA_ENSAIO_CREDITO_EVENTO_INVALIDO');
   const saldo=creditos.get(e.titular_id)||{disponivel:0,reservado:0};
   if(e.tipo==='CREDITO')saldo.disponivel+=e.centavos;
   if(e.tipo==='RESERVA'){
    saldo.disponivel-=e.centavos;saldo.reservado+=e.centavos;
   }
   if(e.tipo==='PAGO')saldo.reservado-=e.centavos;
   creditos.set(e.titular_id,saldo);
  }
  for(const w of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_creditos'
  ).iterate()){
   const expected=creditos.get(w.titular_id)||{disponivel:0,reservado:0};
   if(w.disponivel!==expected.disponivel||
      w.reservado!==expected.reservado||
      w.disponivel<0||w.reservado<0)
    falha('TESOURARIA_ENSAIO_DIREITOS_DIVERGENTES');
   creditos.delete(w.titular_id);
  }
  if(creditos.size)falha('TESOURARIA_ENSAIO_CREDITOS_SEM_CARTEIRA');
  const reservado=new Map(),saques=db.prepare(
   'SELECT * FROM loop_lab_tesouraria_saques'
  ).all();
  for(const s of saques){
   if(!['RESERVADO','ABASTECIMENTO_INDETERMINADO','PRONTO_PIX',
       'PIX_INDETERMINADO','PAGO'].includes(s.estado)||
      !dinheiro(s.centavos))
    falha('TESOURARIA_ENSAIO_SAQUE_ESTADO_INVALIDO');
   if(s.estado!=='PAGO')
    reservado.set(s.titular_id,
     (reservado.get(s.titular_id)||0)+s.centavos);
   if(s.transferencia_id){
    const tr=db.prepare(
     'SELECT * FROM loop_lab_tesouraria_transferencias WHERE transferencia_id=?'
    ).get(s.transferencia_id);
    if(!tr||tr.saque_id!==s.saque_id||tr.centavos!==s.centavos||
       tr.origem!==s.origem||tr.destino!==s.executor)
     falha('TESOURARIA_ENSAIO_ABASTECIMENTO_DIVERGENTE');
   }
   if(s.tentativa_id){
    const tentativa=db.prepare(
     'SELECT * FROM loop_lab_tesouraria_tentativas WHERE tentativa_id=?'
    ).get(s.tentativa_id);
    if(!tentativa||tentativa.saque_id!==s.saque_id||
       tentativa.centavos!==s.centavos||
       (s.estado==='PAGO')!==(tentativa.estado==='CONFIRMADA'))
     falha('TESOURARIA_ENSAIO_PIX_DIVERGENTE');
   }
  }
  for(const w of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_creditos'
  ).iterate()){
   if(w.reservado!==(reservado.get(w.titular_id)||0))
    falha('TESOURARIA_ENSAIO_RESERVA_SAQUES_DIVERGENTE');
   reservado.delete(w.titular_id);
  }
  if(reservado.size)falha('TESOURARIA_ENSAIO_SAQUE_SEM_CREDITO');
  for(const r of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_recebimentos'
  ).iterate()){
   const p=db.prepare([
    'SELECT p.valor_total_centavos,p.status,e.estado AS evento',
    'FROM loja_real_pedidos p JOIN loop_real_eventos_comerciais e',
    'ON e.pedido_id=p.pedido_id WHERE p.pedido_id=?'
   ].join(' ')).get(r.pedido_id);
   if(!p||p.valor_total_centavos!==r.valor_bruto||
      p.status!=='APROVADO_PARA_EXPEDICAO'||
      p.evento!=='AGUARDANDO_CONCILIACAO'||
      r.valor_bruto-r.tarifa!==r.loop_centavos+r.margem+r.retido)
    falha('TESOURARIA_ENSAIO_RECEITA_DIVERGENTE');
  }
  for(const m of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_migracoes'
  ).iterate()){
   if(!idOk(m.migracao_id)||!idOk(m.origem)||!idOk(m.destino)||
      m.origem===m.destino||!dinheiro(m.centavos)||
      (m.estado==='INDETERMINADA')!==
       (this._saldo(saldoTransito(m.migracao_id))===m.centavos))
    falha('TESOURARIA_ENSAIO_MIGRACAO_DIVERGENTE');
  }
  const observacoes=Object.create(ObservacoesPSPEnsaioSQLite.prototype);
  observacoes.db=db;
  if(observacoes.verificar().integridade!=='OK')
   falha('TESOURARIA_ENSAIO_OBSERVACOES_INCONSISTENTES');
  const cobertura=this._cobertura();
  return {integridade:'OK',movimentos:seq,
   recebimentos:this.db.prepare(
    'SELECT COUNT(*) AS n FROM loop_lab_tesouraria_recebimentos'
   ).get().n,
   saques:saques.length,saldosFicticiosCobertos:true,
   coberturaSimuladaCentavos:cobertura.recursos,
   direitosFicticiosCentavos:cobertura.direitos,
   contasComSaldo:saldos.size,
   concilicaoRealConfirmada:false,financeiroReal:false};
 }
}
module.exports={TesourariaModularEnsaioSQLite,TABELAS_TESOURARIA_ENSAIO};
