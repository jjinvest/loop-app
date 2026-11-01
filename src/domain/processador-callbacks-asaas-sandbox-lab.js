'use strict';
// Worker local: o aviso e um sinal. Somente a reconsulta da cobranca
// e a ponte existente podem criar posicao. Nunca movimenta dinheiro real.
const {randomUUID}=require('node:crypto');
const REVERSOES=new Set(['PAYMENT_DELETED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
 'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE']);
const RECEBIMENTOS=new Set(['PAYMENT_RECEIVED','PAYMENT_CONFIRMED']);
class ProcessadorCallbacksAsaasSandboxLab{
 constructor({banco,caixaAvisos,conferidor,conciliador,agoraMs=()=>Date.now(),
  leaseMs=30000,maxTentativas=8,intervaloMs=1000}={}){
  if(!banco||caixaAvisos?.banco!==banco||conferidor?.banco!==banco||
     conciliador?.cobrancas?.banco!==banco||typeof conciliador.processar!=='function'||
     typeof caixaAvisos.buscar!=='function'||typeof conferidor.conferirEvento!=='function')
   throw new TypeError('Callback requer os mesmos servicos SQLite Sandbox');
  if(typeof agoraMs!=='function'||!Number.isSafeInteger(leaseMs)||leaseMs<100||
     !Number.isSafeInteger(maxTentativas)||maxTentativas<1||maxTentativas>20||
     !Number.isSafeInteger(intervaloMs)||intervaloMs<100)throw new TypeError('Configuracao do worker invalida');
  Object.assign(this,{banco,caixaAvisos,conferidor,conciliador,agoraMs,leaseMs,maxTentativas,intervaloMs});
  this.timer=null;this.emCurso=null;
  // Telemetria local sem mensagens de excecao, tokens ou dados do comprador.
  this.falhasAgendador=0;this.ultimaFalhaAgendador=null;
  banco.exec(`CREATE TABLE IF NOT EXISTS akitemm_asaas_callback_fila_lab(
   evento_id TEXT PRIMARY KEY REFERENCES akitemm_asaas_sandbox_avisos(evento_id),
   estado TEXT NOT NULL CHECK(estado IN ('PENDENTE','PROCESSANDO','CONCLUIDO','EXIGE_REVISAO')),
   tentativas INTEGER NOT NULL DEFAULT 0,proxima_em INTEGER NOT NULL DEFAULT 0,
   lease_token TEXT,lease_ate INTEGER,codigo TEXT NOT NULL DEFAULT 'AGUARDANDO_RECONSULTA');
   CREATE INDEX IF NOT EXISTS idx_asaas_callback_fila_disponivel
    ON akitemm_asaas_callback_fila_lab(estado,proxima_em,lease_ate);
   CREATE TABLE IF NOT EXISTS akitemm_asaas_callback_historico_lab(
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id TEXT NOT NULL REFERENCES akitemm_asaas_sandbox_avisos(evento_id),
    tentativa INTEGER NOT NULL,lease_token TEXT NOT NULL,fase TEXT NOT NULL,
    codigo TEXT NOT NULL,registrado_em INTEGER NOT NULL);
   CREATE TRIGGER IF NOT EXISTS asaas_callback_historico_no_update
    BEFORE UPDATE ON akitemm_asaas_callback_historico_lab
    BEGIN SELECT RAISE(ABORT,'historico callback imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS asaas_callback_historico_no_delete
    BEFORE DELETE ON akitemm_asaas_callback_historico_lab
    BEGIN SELECT RAISE(ABORT,'historico callback imutavel'); END;`);
 }
 _agora(){const n=this.agoraMs();if(!Number.isSafeInteger(n)||n<0)throw Error('RELOGIO_CALLBACK_INVALIDO');return n;}
 _reservar(){
  const b=this.banco,agora=this._agora();b.exec('BEGIN IMMEDIATE');
  try{
   // Descoberta duravel: mesmo uma queda imediatamente apos o ACK HTTP
   // nao perde o aviso, ainda que nenhum job tivesse sido criado antes.
   b.prepare(`INSERT OR IGNORE INTO akitemm_asaas_callback_fila_lab(evento_id,estado,proxima_em)
    SELECT evento_id,'PENDENTE',? FROM akitemm_asaas_sandbox_avisos`).run(agora);
   const job=b.prepare(`SELECT * FROM akitemm_asaas_callback_fila_lab
    WHERE (estado='PENDENTE' AND proxima_em<=?) OR (estado='PROCESSANDO' AND lease_ate<=?)
    ORDER BY proxima_em,evento_id LIMIT 1`).get(agora,agora);
   if(!job){b.exec('COMMIT');return null;}
   if(job.tentativas>=this.maxTentativas){
    b.prepare("UPDATE akitemm_asaas_callback_fila_lab SET estado='EXIGE_REVISAO',codigo='TENTATIVAS_ESGOTADAS',lease_token=NULL,lease_ate=NULL WHERE evento_id=?")
     .run(job.evento_id);
    b.prepare(`INSERT INTO akitemm_asaas_callback_historico_lab
     (evento_id,tentativa,lease_token,fase,codigo,registrado_em) VALUES(?,?,?,'FINALIZADO','TENTATIVAS_ESGOTADAS',?)`)
     .run(job.evento_id,job.tentativas,job.lease_token||'SEM_LEASE',agora);
    b.exec('COMMIT');return {esgotado:true,eventoId:job.evento_id};
   }
   const token=randomUUID(),tentativa=job.tentativas+1;
   b.prepare(`UPDATE akitemm_asaas_callback_fila_lab SET estado='PROCESSANDO',tentativas=?,
    lease_token=?,lease_ate=? WHERE evento_id=?`).run(tentativa,token,agora+this.leaseMs,job.evento_id);
   b.prepare(`INSERT INTO akitemm_asaas_callback_historico_lab
    (evento_id,tentativa,lease_token,fase,codigo,registrado_em) VALUES(?,?,?,'INICIADO','RECONSULTA',?)`)
    .run(job.evento_id,tentativa,token,agora);
   b.exec('COMMIT');return {eventoId:job.evento_id,token,tentativa};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 _finalizar(job,estado,codigo){
  const b=this.banco,agora=this._agora();b.exec('BEGIN IMMEDIATE');
  try{
   if(estado==='PENDENTE'&&job.tentativa>=this.maxTentativas){estado='EXIGE_REVISAO';codigo='TENTATIVAS_ESGOTADAS';}
   const proxima=estado==='PENDENTE'?agora+Math.min(300000,1000*2**(job.tentativa-1)):0;
   const mudou=b.prepare(`UPDATE akitemm_asaas_callback_fila_lab SET estado=?,codigo=?,proxima_em=?,
    lease_token=NULL,lease_ate=NULL WHERE evento_id=? AND estado='PROCESSANDO' AND lease_token=?`)
    .run(estado,codigo,proxima,job.eventoId,job.token).changes;
   if(mudou)b.prepare(`INSERT INTO akitemm_asaas_callback_historico_lab
    (evento_id,tentativa,lease_token,fase,codigo,registrado_em) VALUES(?,?,?,'FINALIZADO',?,?)`)
    .run(job.eventoId,job.tentativa,job.token,codigo,agora);
   b.exec('COMMIT');return {eventoId:job.eventoId,estado,codigo,leasePerdido:!mudou};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 async _executar(job){
  const aviso=this.caixaAvisos.buscar(job.eventoId);
  const pedidoId=aviso.pedidoReferencia.slice('LOOPLAB-'.length);
  const cobran=this.conciliador.cobrancas;
  let local;
  try{local=cobran.consultar(pedidoId);}catch{local=null;}
  // Callback pode chegar antes da resposta do POST remoto ser persistida.
  if(!local?.encontrado||!local.pagamentoId)
   return this._finalizar(job,'PENDENTE','COBRANCA_LOCAL_AINDA_INDISPONIVEL');
  const vinculo=await this.conferidor.conferirEvento(job.eventoId);
  if(vinculo.resultado==='EXIGE_REVISAO')return this._finalizar(job,'EXIGE_REVISAO',vinculo.codigo);
  if(REVERSOES.has(aviso.tipo)){
   // Um aviso de reversao em propagacao nunca cria nova posicao.
   const atual=await cobran.conferir(pedidoId);
   return this._finalizar(job,atual.status==='REVERSAO_INFORMADA_SANDBOX'?'CONCLUIDO':'PENDENTE',
    atual.status==='REVERSAO_INFORMADA_SANDBOX'?'REVERSAO_REGISTRADA_SEM_DESFAZER_POSICAO':'AGUARDANDO_REVERSAO_NA_API');
  }
  try{
   const r=await this.conciliador.processar(pedidoId);
   return this._finalizar(job,'CONCLUIDO',r.vendaSomenteLoja?'VENDA_SOMENTE_LOJA_CONCILIADA':'POSICOES_CONCILIADAS');
  }catch(e){
   const atual=cobran.consultar(pedidoId);
   if(atual.status==='REVERSAO_INFORMADA_SANDBOX')
    return this._finalizar(job,'CONCLUIDO','REVERSAO_REGISTRADA_SEM_DESFAZER_POSICAO');
   if(e.codigo==='COBRANCA_SANDBOX_NAO_CONFIRMADA'&&!RECEBIMENTOS.has(aviso.tipo))
    return this._finalizar(job,'CONCLUIDO','COBRANCA_AINDA_PENDENTE_NA_API');
   throw e;
  }
 }
 async processarLote({limite=20}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)throw Error('LIMITE_CALLBACK_INVALIDO');
  const resultados=[];
  for(let i=0;i<limite;i++){
   const job=this._reservar();if(!job)break;
   if(job.esgotado){resultados.push(job);continue;}
   try{resultados.push(await this._executar(job));}
   catch(e){
    const codigo=typeof e.codigo==='string'&&/^[A-Z0-9_]{1,100}$/.test(e.codigo)?e.codigo:'FALHA_TECNICA_RECONSULTA';
    resultados.push(this._finalizar(job,'PENDENTE',codigo));
   }
  }
  return resultados;
 }
 consultar(eventoId){
  return this.banco.prepare(`SELECT evento_id AS eventoId,estado,tentativas,proxima_em AS proximaEm,
   lease_ate AS leaseAte,codigo FROM akitemm_asaas_callback_fila_lab WHERE evento_id=?`).get(eventoId)||null;
 }
 listar({limite=50,offset=0,estado=null}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100||!Number.isSafeInteger(offset)||offset<0||
     (estado!==null&&!['PENDENTE','PROCESSANDO','CONCLUIDO','EXIGE_REVISAO'].includes(estado)))
   throw Error('FILTRO_CALLBACK_INVALIDO');
  const where=estado?' WHERE estado=?':'',args=estado?[estado]:[];
  const total=this.banco.prepare('SELECT COUNT(*) n FROM akitemm_asaas_callback_fila_lab'+where).get(...args).n;
  const eventos=this.banco.prepare(`SELECT evento_id AS eventoId,estado,tentativas,proxima_em AS proximaEm,
   lease_ate AS leaseAte,codigo FROM akitemm_asaas_callback_fila_lab${where}
   ORDER BY evento_id LIMIT ? OFFSET ?`).all(...args,limite,offset);
  return {total,limite,offset,eventos,somenteLeitura:true};
 }
 resumo(){
  const estados=this.banco.prepare('SELECT estado,COUNT(*) quantidade FROM akitemm_asaas_callback_fila_lab GROUP BY estado').all();
  const avisosSemJob=this.banco.prepare(`SELECT COUNT(*) n FROM akitemm_asaas_sandbox_avisos a
   WHERE NOT EXISTS(SELECT 1 FROM akitemm_asaas_callback_fila_lab f WHERE f.evento_id=a.evento_id)`).get().n;
  return {modo:'CALLBACK_SANDBOX_LOCAL',estados,avisosSemJob,somenteLeitura:true,
   falhasAgendador:this.falhasAgendador,ultimaFalhaAgendador:this.ultimaFalhaAgendador,
   telemetriaSomenteMemoria:true,
   pagamentoRealAutorizado:false,callbackRemotoHomologado:false};
 }
 historico(eventoId){
  return this.banco.prepare(`SELECT tentativa,fase,codigo,registrado_em AS registradoEm
   FROM akitemm_asaas_callback_historico_lab WHERE evento_id=? ORDER BY sequencia`).all(eventoId);
 }
 iniciar(){
  if(this.timer)return;
  this.timer=setInterval(()=>{
   if(this.emCurso)return;
   this.emCurso=this.processarLote().catch(()=>{
    // Falhas inesperadas nao devem encerrar o processo nem vazar segredos.
    // A fila persistida continua elegivel para recuperacao no proximo ciclo.
    this.falhasAgendador++;
    this.ultimaFalhaAgendador={codigo:'FALHA_INTERNA_LOTE',registradoEm:new Date().toISOString()};
   }).finally(()=>{this.emCurso=null;});
  },this.intervaloMs);this.timer.unref?.();
 }
 parar(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
}
module.exports={ProcessadorCallbacksAsaasSandboxLab};
