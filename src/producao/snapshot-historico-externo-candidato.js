'use strict';
// Contrato de migracao SOMENTE LEITURA. NAO substituir o snapshot do motor.
// Prova que a parte histórica pode sair do JSON e ser restaurada do diário
// append-only do MESMO SQLite, sem mudar posições, fila, catraca ou caixa.
const {createHash}=require('node:crypto');
const {SimuladorLoop}=require('../domain/simulador-loop');
const {HistoricoCiclosRelacionalSQLite}=
 require('./historico-ciclos-relacional-sqlite');
const FORMATO='LOOP_SNAPSHOT_HISTORICO_EXTERNO_CANDIDATO_V2';
const ZERO='0'.repeat(64),HASH=/^[0-9a-f]{64}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function sha(texto){return createHash('sha256').update(texto).digest('hex');}
function cadeia(anterior,json){
 return createHash('sha256').update('LOOP_CICLOS_HISTORICO_V1\0')
  .update(anterior).update('\0').update(json).digest('hex');
}
function exigirBanco(db){
 if(typeof db?.prepare!=='function'||typeof db?.exec!=='function')
  falha('SNAPSHOT_EXTERNO_BANCO_INVALIDO');
}
function leitura(db,fn){
 exigirBanco(db);
 const propria=db.isTransaction!==true;
 if(propria)db.exec('BEGIN');
 try{
  const resultado=fn();
  if(propria)db.exec('COMMIT');
  return resultado;
 }catch(e){
  if(propria)db.exec('ROLLBACK');
  throw e;
 }
}
function fonte(db){
 const row=db.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 if(!Number.isSafeInteger(row?.revisao)||row.revisao<1||
    typeof row.snapshot!=='string')
  falha('SNAPSHOT_EXTERNO_FONTE_AUSENTE');
 return row;
}
function historiador(db){
 const hist=HistoricoCiclosRelacionalSQLite.referenciaExistente(db);
 if(!hist)falha('SNAPSHOT_EXTERNO_ARQUIVO_INEXISTENTE');
 return hist;
}
function base(raw){
 let s;
 try{s=JSON.parse(raw);}
 catch{falha('SNAPSHOT_EXTERNO_FORMATO_INVALIDO');}
 if(s?.formato!=='LOOP_SIMULADOR_V1'||s.versao!==1||
    !Array.isArray(s.tabuleiro?.ciclosConcluidos))
  falha('SNAPSHOT_EXTERNO_FORMATO_INVALIDO');
 return s;
}
// Leitura pontual e voluntária. Não altera o banco e não é chamada pelo
// servidor cliente nem pelas transações do motor.
function prepararSnapshotCandidato({banco}={}){
 return leitura(banco,()=>{
  const row=fonte(banco),s=base(row.snapshot);
  // Valida TODAS as regras do snapshot e TODAS as provas do diário.
  SimuladorLoop.restaurarSnapshot(s);
  const hist=historiador(banco);
  const audit=hist.conferir({sim:{
   tabuleiro:{ciclosConcluidos:s.tabuleiro.ciclosConcluidos}
  }});
  const meta=hist._meta();
  if(meta.versao!==1||meta.total_ciclos!==audit.totalCiclos||
     !HASH.test(meta.ultimo_hash))
   falha('SNAPSHOT_EXTERNO_ARQUIVO_DIVERGENTE');
  // Esta é SOMENTE uma projeção temporária, jamais o estado produtivo.
  const compacto={...s,tabuleiro:{...s.tabuleiro,ciclosConcluidos:[]}};
  const json=JSON.stringify(compacto);
  const candidato={
   formato:FORMATO,versao:2,somenteLeitura:true,financeiroReal:false,
   fonte:{revisao:row.revisao,sha256:sha(row.snapshot)},
   arquivo:{tabela:'loop_real_ciclos_historico',
    totalCiclos:meta.total_ciclos,totalEventos:audit.totalEventos,
    ultimoHash:meta.ultimo_hash},
   estadoSemHistorico:json
  };
  const bytesOrigem=Buffer.byteLength(row.snapshot);
  const bytesCandidato=Buffer.byteLength(JSON.stringify(candidato));
  return {candidato,
   bytesOrigem,bytesCandidato,
   bytesRemovidos:bytesOrigem-bytesCandidato,
   validado:true,semMudancaNoMotor:true};
 });
}
// A reconstituição recusa arquivo parcial, cadeias corrompidas, eventos
// adulterados, candidato antigo e qualquer divergência no snapshot inteiro.
function reconstituirSnapshotCandidato({banco,candidato}={}){
 return leitura(banco,()=>{
  if(!candidato||candidato.formato!==FORMATO||
     candidato.versao!==2||candidato.somenteLeitura!==true||
     candidato.financeiroReal!==false||
     !Number.isSafeInteger(candidato.fonte?.revisao)||
     !HASH.test(candidato.fonte?.sha256||'')||
     !Number.isSafeInteger(candidato.arquivo?.totalCiclos)||
     candidato.arquivo.totalCiclos<0||
     !Number.isSafeInteger(candidato.arquivo?.totalEventos)||
     candidato.arquivo.totalEventos<0||
     candidato.arquivo.tabela!=='loop_real_ciclos_historico'||
     !HASH.test(candidato.arquivo?.ultimoHash||'')||
     typeof candidato.estadoSemHistorico!=='string')
   falha('SNAPSHOT_EXTERNO_CANDIDATO_INVALIDO');
  const atual=fonte(banco);
  if(atual.revisao!==candidato.fonte.revisao||
     sha(atual.snapshot)!==candidato.fonte.sha256)
   falha('SNAPSHOT_EXTERNO_FONTE_DESATUALIZADA');
  const estado=base(candidato.estadoSemHistorico);
  if(estado.tabuleiro.ciclosConcluidos.length)
   falha('SNAPSHOT_EXTERNO_HISTORICO_DUPLICADO');
  const h=historiador(banco),meta=h._meta();
  if(!meta||meta.versao!==1||
     meta.total_ciclos!==candidato.arquivo.totalCiclos||
     meta.ultimo_hash!==candidato.arquivo.ultimoHash)
   falha('SNAPSHOT_EXTERNO_ARQUIVO_DIVERGENTE');
  const eventos=h.db.prepare([
   'SELECT ciclo,ordem,venda_id,destino_previsto',
   'FROM loop_real_ciclos_historico_eventos ORDER BY ciclo,ordem'
  ].join(' ')).iterate()[Symbol.iterator]();
  const concluidos=[],vistos=new Set();
  let anterior=ZERO,totalEventos=0;
  for(const row of h.db.prepare([
   'SELECT ciclo,centro_posicao_id,centro_titular_id,',
   'quantidade_eventos,dados_json,hash_anterior,sha256',
   'FROM loop_real_ciclos_historico ORDER BY ciclo'
  ].join(' ')).iterate()){
   let c;
   try{c=JSON.parse(row.dados_json);}
   catch{falha('SNAPSHOT_EXTERNO_CICLO_DIVERGENTE');}
   if(row.ciclo!==concluidos.length+1||c?.ciclo!==row.ciclo||
      JSON.stringify(c)!==row.dados_json||
      !Number.isSafeInteger(c.centro?.id)||
      c.centro.id!==row.centro_posicao_id||
      c.centro.participanteId!==row.centro_titular_id||
      ![5,6].includes(c.vendas?.length)||
      c.vendas.length!==row.quantidade_eventos||
      row.hash_anterior!==anterior||
      row.sha256!==cadeia(anterior,row.dados_json))
    falha('SNAPSHOT_EXTERNO_CICLO_DIVERGENTE');
   for(let j=0;j<c.vendas.length;j++){
    const v=c.vendas[j],ev=eventos.next();
    if(ev.done||ev.value.ciclo!==row.ciclo||
       ev.value.ordem!==j+1||
       ev.value.venda_id!==v?.vendaId||
       ev.value.destino_previsto!==v?.destinoPrevisto||
       v.ciclo!==row.ciclo||v.ordem!==j+1||
       v.posicaoCentroId!==c.centro.id||vistos.has(v.vendaId))
     falha('SNAPSHOT_EXTERNO_EVENTO_DIVERGENTE');
    vistos.add(v.vendaId);totalEventos++;
   }
   concluidos.push(c);anterior=row.sha256;
  }
  if(!eventos.next().done||
     concluidos.length!==meta.total_ciclos||
     totalEventos!==candidato.arquivo.totalEventos||
     anterior!==meta.ultimo_hash)
   falha('SNAPSHOT_EXTERNO_ARQUIVO_DIVERGENTE');
  estado.tabuleiro.ciclosConcluidos=concluidos;
  const original=JSON.stringify(estado);
  if(sha(original)!==candidato.fonte.sha256)
   falha('SNAPSHOT_EXTERNO_ORIGINAL_DIVERGENTE');
  // Revalidar a lógica V6 completa, inclusive catraca e destinos históricos.
  SimuladorLoop.restaurarSnapshot(estado);
  return {snapshot:original,integridade:'OK',totalCiclos:concluidos.length,
   totalEventos,somenteLeitura:true,financeiroReal:false};
 });
}
module.exports={prepararSnapshotCandidato,reconstituirSnapshotCandidato};
