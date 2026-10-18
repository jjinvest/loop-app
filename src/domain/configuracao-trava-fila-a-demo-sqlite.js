'use strict';
// Configuracao da regra da Fila A, laboratorio local, com auditoria imutavel.
class ConfiguracaoTravaFilaADemoSQLite {
 constructor({banco,relogio=()=>new Date().toISOString()}={}){
  if(!banco)throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.relogio=relogio;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS loop03_trava_fila_a_demo(
    id INTEGER PRIMARY KEY CHECK(id=1),
    vaga INTEGER NOT NULL CHECK(vaga BETWEEN 1 AND 6),
    revisao INTEGER NOT NULL,alterado_em TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS loop03_trava_fila_a_historico_demo(
    revisao INTEGER PRIMARY KEY,anterior INTEGER NOT NULL,
    nova INTEGER NOT NULL,motivo TEXT NOT NULL,registrado_em TEXT NOT NULL);
   CREATE TRIGGER IF NOT EXISTS loop03_trava_historico_no_update
    BEFORE UPDATE ON loop03_trava_fila_a_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS loop03_trava_historico_no_delete
    BEFORE DELETE ON loop03_trava_fila_a_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;
  `);
  banco.prepare('INSERT OR IGNORE INTO loop03_trava_fila_a_demo VALUES(1,5,1,?)').run(this.relogio());
 }
 consultar(){
  const x=this.banco.prepare('SELECT vaga,revisao,alterado_em FROM loop03_trava_fila_a_demo WHERE id=1').get();
  return {vagaLiberacao:x.vaga,revisao:x.revisao,alteradoEm:x.alterado_em,modo:'TRAVA_POR_TITULAR',laboratorio:true};
 }
 historico(){
  return this.banco.prepare('SELECT revisao,anterior,nova,motivo,registrado_em AS registradoEm FROM loop03_trava_fila_a_historico_demo ORDER BY revisao DESC LIMIT 50').all();
 }
 alterar({vagaLiberacao,revisaoEsperada,motivo}={}){
  if(!Number.isSafeInteger(vagaLiberacao)||vagaLiberacao<1||vagaLiberacao>6||
    !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1||
    typeof motivo!=='string'||motivo.trim().length<8||motivo.trim().length>250)
    throw Object.assign(Error('DADOS_INVALIDOS'),{codigo:'DADOS_INVALIDOS'});
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar();
   if(atual.revisao!==revisaoEsperada)throw Object.assign(Error('CONFLITO_REVISAO'),{codigo:'CONFLITO_REVISAO'});
   if(atual.vagaLiberacao===vagaLiberacao)throw Object.assign(Error('SEM_MUDANCA'),{codigo:'SEM_MUDANCA'});
   const agora=this.relogio();
   this.banco.prepare('UPDATE loop03_trava_fila_a_demo SET vaga=?,revisao=?,alterado_em=? WHERE id=1')
    .run(vagaLiberacao,atual.revisao+1,agora);
   this.banco.prepare('INSERT INTO loop03_trava_fila_a_historico_demo VALUES(?,?,?,?,?)')
    .run(atual.revisao+1,atual.vagaLiberacao,vagaLiberacao,motivo.trim(),agora);
   this.banco.exec('COMMIT');return this.consultar();
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={ConfiguracaoTravaFilaADemoSQLite};