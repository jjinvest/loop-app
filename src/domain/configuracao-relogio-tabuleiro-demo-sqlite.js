'use strict';
// Intervalo visual de referencia, sem comandar giros ou gerar eventos.
class ConfiguracaoRelogioTabuleiroDemoSQLite {
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(!banco)throw new TypeError('SQLite necessario');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop03_intervalo_relogio_demo(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'minutos INTEGER CHECK(minutos BETWEEN 1 AND 1440),',
   'revisao INTEGER NOT NULL CHECK(revisao>=0),alterado_em TEXT);',
   'CREATE TABLE IF NOT EXISTS loop03_intervalo_relogio_historico_demo(',
   'revisao INTEGER PRIMARY KEY,anterior INTEGER,',
   'novo INTEGER NOT NULL CHECK(novo BETWEEN 1 AND 1440),',
   'justificativa TEXT NOT NULL,registrado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop03_relogio_historico_no_update',
   'BEFORE UPDATE ON loop03_intervalo_relogio_historico_demo',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop03_relogio_historico_no_delete',
   'BEFORE DELETE ON loop03_intervalo_relogio_historico_demo',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;"
  ].join('\n'));
  banco.prepare('INSERT OR IGNORE INTO loop03_intervalo_relogio_demo (id,minutos,revisao,alterado_em) VALUES(1,NULL,0,NULL)').run();
 }
 consultar(){
  const a=this.banco.prepare('SELECT minutos,revisao,alterado_em AS alteradoEm FROM loop03_intervalo_relogio_demo WHERE id=1').get();
  if(!a)throw Error('CONFIGURACAO_RELOGIO_AUSENTE');
  return {intervaloMinutos:a.minutos,revisao:a.revisao,alteradoEm:a.alteradoEm,
   finalidade:'REFERENCIA_VISUAL_SEM_GIRO_AUTOMATICO',laboratorio:true};
 }
 historico(){
  return this.banco.prepare('SELECT revisao,anterior,novo,justificativa,registrado_em AS registradoEm FROM loop03_intervalo_relogio_historico_demo ORDER BY revisao DESC LIMIT 30').all();
 }
 alterar({intervaloMinutos,revisaoEsperada,justificativa}={}){
  const falhar=codigo=>{throw Object.assign(Error(codigo),{codigo});};
  if(!Number.isSafeInteger(intervaloMinutos)||intervaloMinutos<1||intervaloMinutos>1440||
   !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0||
   typeof justificativa!=='string'||justificativa.trim().length<8||justificativa.trim().length>250)
    falhar('DADOS_INVALIDOS');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const a=this.consultar();
   if(a.revisao!==revisaoEsperada)falhar('CONFLITO_REVISAO');
   if(a.intervaloMinutos===intervaloMinutos)falhar('SEM_MUDANCA');
   const data=this.agora(),revisao=a.revisao+1;
   b.prepare('UPDATE loop03_intervalo_relogio_demo SET minutos=?,revisao=?,alterado_em=? WHERE id=1')
    .run(intervaloMinutos,revisao,data);
   b.prepare('INSERT INTO loop03_intervalo_relogio_historico_demo VALUES(?,?,?,?,?)')
    .run(revisao,a.intervaloMinutos,intervaloMinutos,justificativa.trim(),data);
   b.exec('COMMIT');return this.consultar();
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
}
module.exports={ConfiguracaoRelogioTabuleiroDemoSQLite};
