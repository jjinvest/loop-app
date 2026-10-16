'use strict';
const MARCO='1970-01-01T00:00:00.000Z';
function falha(c){const e=new Error(c);e.codigo=c;return e;}
function validar(n){
 if(!Number.isSafeInteger(n)||n<1||n>100)
  throw falha('PORCENTAGEM_INVALIDA');
 return n;
}
class ConfiguracaoTaxaIndicacaoDemoSQLite{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(!banco||typeof agora!=='function')throw new TypeError('SQLite de laboratorio requerido');
  this.banco=banco;this.agora=agora;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_indicacao_taxas_demo(
    revisao INTEGER PRIMARY KEY CHECK(revisao>=1),
    percentual INTEGER NOT NULL CHECK(percentual BETWEEN 1 AND 100),
    vigente_desde TEXT NOT NULL UNIQUE,
    registrado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS indicacao_taxas_no_update
    BEFORE UPDATE ON admin_indicacao_taxas_demo
    BEGIN SELECT RAISE(ABORT,'taxa imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS indicacao_taxas_no_delete
    BEFORE DELETE ON admin_indicacao_taxas_demo
    BEGIN SELECT RAISE(ABORT,'taxa imutavel'); END;
   INSERT INTO admin_indicacao_taxas_demo(revisao,percentual,vigente_desde,registrado_em)
   SELECT 1,10,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'
   WHERE NOT EXISTS(SELECT 1 FROM admin_indicacao_taxas_demo);
  `);
 }
 _mapa(x){return {revisao:x.revisao,percentual:x.percentual,vigenteDesde:x.vigente_desde};}
 atual(){
  return this._mapa(this.banco.prepare(
   'SELECT * FROM admin_indicacao_taxas_demo ORDER BY revisao DESC LIMIT 1').get());
 }
 vigenteEm(data){
  if(typeof data!=='string'||!Number.isFinite(Date.parse(data))||
   new Date(data).toISOString()!==data)throw falha('HORARIO_INVALIDO');
  const r=this.banco.prepare(
   'SELECT * FROM admin_indicacao_taxas_demo WHERE vigente_desde<=? ORDER BY vigente_desde DESC LIMIT 1'
  ).get(data);
  if(!r)throw falha('HORARIO_INVALIDO');
  return this._mapa(r);
 }
 alterar({percentual,revisaoEsperada}={}){
  validar(percentual);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1)
   throw falha('REVISAO_INVALIDA');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.atual();
   if(anterior.revisao!==revisaoEsperada)throw falha('CONFLITO_REVISAO');
   if(anterior.percentual===percentual){this.banco.exec('COMMIT');return {...anterior,alterado:false};}
   const instante=this.agora();
   if(typeof instante!=='string'||!Number.isFinite(Date.parse(instante))||
    new Date(instante).toISOString()!==instante||instante<=anterior.vigenteDesde)
    throw falha('HORARIO_INVALIDO');
   this.banco.prepare(
    'INSERT INTO admin_indicacao_taxas_demo(revisao,percentual,vigente_desde,registrado_em) VALUES(?,?,?,?)'
   ).run(anterior.revisao+1,percentual,instante,instante);
   this.banco.exec('COMMIT');
   return {...this.atual(),alterado:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 historico(){return this.banco.prepare('SELECT * FROM admin_indicacao_taxas_demo ORDER BY revisao')
  .all().map(x=>this._mapa(x));}
}
module.exports={ConfiguracaoTaxaIndicacaoDemoSQLite};
