'use strict';
// Comandos duraveis do operador para a catraca do MESMO motor SQLite.
// Sem liberar creditos ou pagamentos; o motor de ensaio e vedado em producao.
const TABELAS_CATRACA_ADMIN=Object.freeze([
 'loop_real_catraca_admin_politica',
 'loop_real_catraca_admin_giros',
 'loop_real_catraca_admin_historico'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const FUSO='America/Sao_Paulo';
function horaOk(h){return typeof h==='string'&&/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(h);}
function horarioLocal(agora){
 const data=agora();
 if(!(data instanceof Date)||Number.isNaN(data.valueOf()))falha('CATRACA_RELOGIO_INVALIDO');
 const partes=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:FUSO,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(data).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {dia:partes.year+'-'+partes.month+'-'+partes.day,
  hora:partes.hour+':'+partes.minute,ts:data.getTime()};
}
function dentroJanela(hora,inicio,fim){
 if(inicio===fim)return true; // mesma hora = dia inteiro, sem janela artificial
 return inicio<fim?hora>=inicio&&hora<=fim:hora>=inicio||hora<=fim;
}
class OperacaoCatracaAdminSQLite{
 constructor({banco,motor,agora=()=>new Date()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     motor?.banco!==banco||typeof motor._transacao!=='function'||
     typeof agora!=='function')falha('CATRACA_ADMIN_MOTOR_NAO_COMPARTILHADO');
  this.db=banco;this.motor=motor;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_politica(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'revisao INTEGER NOT NULL CHECK(revisao>0),',
   "modo TEXT NOT NULL CHECK(modo IN ('PAUSADA','MANUAL','AUTOMATICA')),",
   'inicio TEXT NOT NULL,fim TEXT NOT NULL,limite_diario INTEGER,',
   'atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_giros(',
   'giro INTEGER PRIMARY KEY CHECK(giro>0),',
   'chave_evento TEXT NOT NULL UNIQUE REFERENCES loop_real_motor_eventos(chave),',
   'dia TEXT NOT NULL,origem TEXT NOT NULL,',
   'revisao_politica INTEGER NOT NULL,executado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS loop_real_catraca_admin_giros_dia',
   'ON loop_real_catraca_admin_giros(dia);',
   'CREATE TABLE IF NOT EXISTS loop_real_catraca_admin_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'acao TEXT NOT NULL,detalhes TEXT NOT NULL,executado_em INTEGER NOT NULL);'
  ].join(' '));
  banco.prepare([
   'INSERT OR IGNORE INTO loop_real_catraca_admin_politica',
   "(id,revisao,modo,inicio,fim,limite_diario,atualizado_em)",
   "VALUES(1,1,'PAUSADA','00:00','00:00',NULL,1)"
  ].join(' ')).run();
 }
 _ensaio(){
  if(process.env.NODE_ENV==='production')falha('CATRACA_MOTOR_PRODUTIVO_NAO_HOMOLOGADO');
 }
 _politica(){
  const p=this.db.prepare(
   'SELECT revisao,modo,inicio,fim,limite_diario FROM loop_real_catraca_admin_politica WHERE id=1'
  ).get();
  if(!p||!horaOk(p.inicio)||!horaOk(p.fim)||
     !['PAUSADA','MANUAL','AUTOMATICA'].includes(p.modo)||
     !Number.isSafeInteger(p.revisao)||p.revisao<1||
     !(p.limite_diario===null||
      (Number.isSafeInteger(p.limite_diario)&&p.limite_diario>=1)))
   falha('CATRACA_ADMIN_POLITICA_CORROMPIDA');
  return p;
 }
 _girosDia(dia){return this.db.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros WHERE dia=?'
 ).get(dia).n;}
 _log(acao,detalhes,ts){
  this.db.prepare([
   'INSERT INTO loop_real_catraca_admin_historico(acao,detalhes,executado_em)',
   'VALUES(?,?,?)'
  ].join(' ')).run(acao,JSON.stringify(detalhes),ts);
 }
 consultar(){
  const p=this._politica(),tempo=horarioLocal(this.agora);
  const girosDia=this._girosDia(tempo.dia);
  const motor=this.motor.consultar();
  const dentro=dentroJanela(tempo.hora,p.inicio,p.fim);
  const permitido=p.limite_diario===null||girosDia<p.limite_diario;
  return {modo:p.modo,janelaInicio:p.inicio,janelaFim:p.fim,
   limiteDiario:p.limite_diario,revisao:p.revisao,
   girosHoje:girosDia,hoje:tempo.dia,horaLocal:tempo.hora,
   fuso:FUSO,horarioPermitido:dentro,
   limiteNaoAtingido:permitido,
   eventosNoCiclo:motor.tabuleiro.eventosNoCiclo,
   girosTotais:motor.catraca.giros,
   filaA:motor.filaA,filaB:motor.filaB,
   pausada:p.modo==='PAUSADA',
   podeGirar:p.modo!=='PAUSADA'&&dentro&&permitido&&
    motor.tabuleiro.eventosNoCiclo===6,
   habilitadoSomenteEnsaio:process.env.NODE_ENV!=='production',
   financeiroReal:false};
 }
 configurar({modo,janelaInicio,janelaFim,limiteDiario,revisaoEsperada,
  motivo='AJUSTE_OPERACIONAL'}={}){
  this._ensaio();
  if(!['PAUSADA','MANUAL','AUTOMATICA'].includes(modo)||
     !horaOk(janelaInicio)||!horaOk(janelaFim)||
     !(limiteDiario===null||
      (Number.isSafeInteger(limiteDiario)&&limiteDiario>=1&&limiteDiario<=1000000))||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1||
     typeof motivo!=='string'||motivo.trim().length<3||
     motivo.length>200)falha('CATRACA_ADMIN_CONFIGURACAO_INVALIDA');
  const result=this.motor._transacao(sim=>{
   const p=this._politica();
   if(p.revisao!==revisaoEsperada)falha('CATRACA_ADMIN_REVISAO_DESATUALIZADA');
   const t=horarioLocal(this.agora);
   this.db.prepare([
    'UPDATE loop_real_catraca_admin_politica SET revisao=revisao+1,',
    'modo=?,inicio=?,fim=?,limite_diario=?,atualizado_em=? WHERE id=1'
   ].join(' ')).run(modo,janelaInicio,janelaFim,limiteDiario,t.ts);
   if(modo==='PAUSADA')sim.pausarCatraca();
   else sim.abrirCatraca();
   this._log('CONFIGURAR',{modo,janelaInicio,janelaFim,
    limiteDiario,revisaoAnterior:p.revisao,motivo:motivo.trim()},t.ts);
   return {alterado:true};
  });
  return {...result,...this.consultar()};
 }
 executarGiro({origem='OPERADOR'}={}){
  this._ensaio();
  if(!['OPERADOR','AGENDA'].includes(origem))
   falha('CATRACA_ADMIN_ORIGEM_INVALIDA');
  return this.motor._transacao(sim=>{
   const p=this._politica(),t=horarioLocal(this.agora);
   if(origem==='AGENDA'&&p.modo!=='AUTOMATICA')
    return {girou:false,motivo:'AGENDA_NAO_HABILITADA'};
   if(p.modo==='PAUSADA')return {girou:false,motivo:'PAUSADA_PELO_ADMINISTRADOR'};
   if(!dentroJanela(t.hora,p.inicio,p.fim))
    return {girou:false,motivo:'FORA_DO_HORARIO_ADMINISTRATIVO'};
   if(p.limite_diario!==null&&this._girosDia(t.dia)>=p.limite_diario)
    return {girou:false,motivo:'LIMITE_DIARIO_DEFINIDO_PELO_ADMINISTRADOR'};
   const vendas=sim.tabuleiro.vendasDoCiclo;
   if(vendas.length!==6)return {girou:false,motivo:'AGUARDANDO_SEIS_VENDAS'};
   for(const venda of vendas){
    const encontrada=this.db.prepare([
     "SELECT 1 FROM loop_real_motor_eventos WHERE chave=? AND tipo='EVENTO'"
    ].join(' ')).get(venda.vendaId);
    if(!encontrada)falha('CATRACA_GIRO_SEM_EVENTOS_COMPROVADOS');
   }
   // Apenas o operador/configuracao pode habilitar o giro: nunca o cliente.
   if(!sim.catracaAberta)falha('CATRACA_SNAPSHOT_CONTROLE_DIVERGENTE');
   const r=sim.tentarGiro();
   if(!r.girou)falha('CATRACA_GIRO_INESPERADAMENTE_NEGADO');
   const chave='g:'+sim.giros;
   this.db.prepare([
    "INSERT INTO loop_real_motor_eventos(chave,tipo) VALUES(?,'GIRO')"
   ].join(' ')).run(chave);
   this.db.prepare([
    'INSERT INTO loop_real_catraca_admin_giros',
    '(giro,chave_evento,dia,origem,revisao_politica,executado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(sim.giros,chave,t.dia,origem,p.revisao,t.ts);
   this._log('GIRO',{giro:sim.giros,origem,dia:t.dia,revisao:p.revisao},t.ts);
   return {girou:true,giro:sim.giros,girosHoje:this._girosDia(t.dia)};
  });
 }
 processarAgenda(){
  // Quem define se a agenda esta ativa e o operador, nao a compra.
  if(process.env.NODE_ENV==='production')return {girou:false,motivo:'NAO_HOMOLOGADO'};
  if(this._politica().modo!=='AUTOMATICA')
   return {girou:false,motivo:'AGENDA_NAO_HABILITADA'};
  return this.executarGiro({origem:'AGENDA'});
 }
 verificar(){
  const p=this._politica();
  const linhas=this.db.prepare([
   'SELECT g.giro,g.chave_evento,e.tipo FROM loop_real_catraca_admin_giros g',
   'LEFT JOIN loop_real_motor_eventos e ON e.chave=g.chave_evento'
  ].join(' ')).all();
  const giros=this.motor.consultar().catraca.giros;
  if(linhas.some(x=>x.tipo!=='GIRO'||x.chave_evento!=='g:'+x.giro||
     x.giro>giros))
   falha('CATRACA_ADMIN_LIVRO_DE_GIROS_DIVERGENTE');
  return {integridade:'OK',girosAuditados:linhas.length,revisao:p.revisao};
 }
}
module.exports={OperacaoCatracaAdminSQLite,TABELAS_CATRACA_ADMIN};
