'use strict';
// Auditoria SOMENTE LEITURA do motor no SQLite UNICO da loja/PSP.
// Usada pela readiness e pelo backup antes de declarar recuperacao apta.
// Nunca aciona giros, consultas PSP, saques ou mutacoes.
const {SimuladorLoop}=require('./simulador-loop');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const TABELAS=[
 'akitemm_motor_conta_ensaio_estado',
 'akitemm_motor_conta_ensaio_operacoes',
 'akitemm_motor_ensaio_lotes_pedido',
 'akitemm_motor_ensaio_aceites_posicao'
];
function auditarIntegridadeMotorCandidato({banco,exigirMotor=false}={}){
 if(process.env.NODE_ENV==='production')
  falha('AUDITORIA_MOTOR_ENSAIO_PROIBIDA_PRODUCAO');
 if(typeof banco?.prepare!=='function')
  falha('AUDITORIA_MOTOR_SQLITE_INVALIDO');
 const presentes=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
 ).all().map(x=>x.name));
 const quantidade=TABELAS.filter(t=>presentes.has(t)).length;
 if(quantidade===0&&!exigirMotor)
  return {presente:false,totalInconsistencias:0,snapshotValidado:false};
 if(quantidade!==TABELAS.length)
  falha('MOTOR_SQLITE_ESTRUTURA_INCOMPLETA');
 const basicas=['akitemm_checkout_prepedidos_staging',
  'akitemm_conta_unica_candidata'];
 if(basicas.some(t=>!presentes.has(t)))
  falha('MOTOR_SQLITE_ORIGEM_INCOMPLETA');
 const contar=(sql)=>banco.prepare(sql).get().n;
 const lotesOrfaos=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=l.prepedido_id AND p.titular_id=l.titular_id',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=l.titular_id',
  'WHERE p.prepedido_id IS NULL OR c.id IS NULL'
 ].join(' '));
 const aceitesOrfaos=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao a',
  'LEFT JOIN akitemm_motor_ensaio_lotes_pedido l',
  'ON l.numero_posicao=a.numero_posicao',
  'AND l.prepedido_id=a.prepedido_id AND l.titular_id=a.titular_id',
  'WHERE l.numero_posicao IS NULL'
 ].join(' '));
 const lotesSemOperacao=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'WHERE NOT EXISTS (',
  'SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes o',
  "WHERE o.tipo='VINCULAR_PEDIDO' AND o.prepedido_id=l.prepedido_id",
  'AND o.titular_id=l.titular_id)'
 ].join(' '));
 const operacoesOrfas=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes o',
  "WHERE o.tipo='VINCULAR_PEDIDO' AND NOT EXISTS (",
  'SELECT 1 FROM akitemm_motor_ensaio_lotes_pedido l',
  'WHERE l.prepedido_id=o.prepedido_id AND l.titular_id=o.titular_id',
  'AND l.numero_posicao=o.numero_posicao AND l.ordinal=1)'
 ].join(' '));
 const total=lotesOrfaos+aceitesOrfaos+lotesSemOperacao+operacoesOrfas;
 if(total>0)falha('MOTOR_SQLITE_VINCULOS_SEMANTICOS_INVALIDOS');
 const row=banco.prepare([
  'SELECT revisao,snapshot FROM akitemm_motor_conta_ensaio_estado',
  'WHERE id=1'
 ].join(' ')).get();
 const temLotes=contar('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido')>0;
 if(!row&&temLotes)falha('MOTOR_SQLITE_SNAPSHOT_AUSENTE');
 if(row){
  if(!Number.isSafeInteger(row.revisao)||row.revisao<1||
     typeof row.snapshot!=='string'||row.snapshot.length>32*1024*1024)
   falha('MOTOR_SQLITE_SNAPSHOT_INVALIDO');
  try{
   // Reconstituir a semantica completa: seis vagas, filas, ciclos,
   // catraca, IDs repetidos, destino financeiro e regras de snapshot.
   SimuladorLoop.restaurarSnapshot(JSON.parse(row.snapshot));
  }catch{falha('MOTOR_SQLITE_SNAPSHOT_INVALIDO');}
 }
 return {presente:true,totalInconsistencias:0,
  snapshotValidado:Boolean(row),lotesOrfaos:0,aceitesOrfaos:0,
  operacoesOrfas:0,valorRealProvado:false};
}
module.exports={auditarIntegridadeMotorCandidato};
