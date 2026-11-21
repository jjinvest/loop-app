'use strict';
// Acesso ÚNICO ao snapshot do motor; nunca autoriza eventos, pagamentos ou giros.
// V1 legado e V2 compactado devem reconstruir EXATAMENTE o estado V1 validado.
const {createHash}=require('node:crypto');
const {HistoricoCiclosRelacionalSQLite}=
 require('./historico-ciclos-relacional-sqlite');
const SHA=/^[0-9a-f]{64}$/;
const ZERO='0'.repeat(64);
const CAMPO='historicoRelacionalV2';
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function hash(x){return createHash('sha256').update(x).digest('hex');}
function encadear(prev,json){
 return createHash('sha256').update('LOOP_CICLOS_HISTORICO_V1\0')
  .update(prev).update('\0').update(json).digest('hex');
}
function rawEstado(banco){
 if(typeof banco?.prepare!=='function')falha('ESTADO_MOTOR_BANCO_INVALIDO');
 return banco.prepare('SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1').get();
}
function forma(raw){
 if(typeof raw!=='string')falha('ESTADO_MOTOR_SNAPSHOT_INVALIDO');
 let x;try{x=JSON.parse(raw);}catch{falha('ESTADO_MOTOR_SNAPSHOT_INVALIDO');}
 if(!x||x.formato!=='LOOP_SIMULADOR_V1'||x.versao!==1||
    !x.tabuleiro||!Array.isArray(x.tabuleiro.ciclosConcluidos))
  falha('ESTADO_MOTOR_SNAPSHOT_INVALIDO');
 return x;
}
function materializar({banco,persistido}={}){
 const estado=forma(persistido),ref=estado[CAMPO];
 if(ref===undefined)return {snapshot:persistido,formato:'V1'};
 if(ref?.versao!==2||!Number.isSafeInteger(ref.totalCiclos)||
    ref.totalCiclos<0||!SHA.test(ref.ultimoHash||'')||
    !SHA.test(ref.sha256Original||'')||
    estado.tabuleiro.ciclosConcluidos.length!==0)
  falha('ESTADO_MOTOR_V2_REFERENCIA_INVALIDA');
 const hist=HistoricoCiclosRelacionalSQLite.referenciaExistente(banco);
 if(!hist)falha('ESTADO_MOTOR_V2_HISTORICO_AUSENTE');
 const meta=hist._meta();
 if(!meta||meta.versao!==1||meta.total_ciclos!==ref.totalCiclos||
    meta.ultimo_hash!==ref.ultimoHash)
  falha('ESTADO_MOTOR_V2_HISTORICO_DIVERGENTE');
 const ciclos=[],evs=hist.db.prepare([
  'SELECT ciclo,ordem,venda_id,destino_previsto',
  'FROM loop_real_ciclos_historico_eventos ORDER BY ciclo,ordem'
 ].join(' ')).iterate()[Symbol.iterator]();
 let anterior=ZERO;
 for(const row of hist.db.prepare([
  'SELECT ciclo,centro_posicao_id,centro_titular_id,quantidade_eventos,',
  'dados_json,hash_anterior,sha256',
  'FROM loop_real_ciclos_historico ORDER BY ciclo'
 ].join(' ')).iterate()){
  let ciclo;
  try{ciclo=JSON.parse(row.dados_json);}
  catch{falha('ESTADO_MOTOR_V2_CICLO_INVALIDO');}
  if(row.ciclo!==ciclos.length+1||
     ciclo?.ciclo!==row.ciclo||
     ciclo.centro?.id!==row.centro_posicao_id||
     ciclo.centro?.participanteId!==row.centro_titular_id||
     ![5,6].includes(ciclo.vendas?.length)||
     ciclo.vendas.length!==row.quantidade_eventos||
     JSON.stringify(ciclo)!==row.dados_json||
     row.hash_anterior!==anterior||
     row.sha256!==encadear(anterior,row.dados_json))
   falha('ESTADO_MOTOR_V2_CICLO_INVALIDO');
  for(let j=0;j<ciclo.vendas.length;j++){
   const v=ciclo.vendas[j],ev=evs.next();
   if(ev.done||ev.value.ciclo!==row.ciclo||
      ev.value.ordem!==j+1||
      ev.value.venda_id!==v?.vendaId||
      ev.value.destino_previsto!==v?.destinoPrevisto||
      v.ciclo!==row.ciclo||v.ordem!==j+1||
      v.posicaoCentroId!==ciclo.centro.id)
    falha('ESTADO_MOTOR_V2_EVENTO_INVALIDO');
  }
  anterior=row.sha256;ciclos.push(ciclo);
 }
 if(!evs.next().done||ciclos.length!==ref.totalCiclos||
    anterior!==ref.ultimoHash)
  falha('ESTADO_MOTOR_V2_HISTORICO_DIVERGENTE');
 estado.tabuleiro.ciclosConcluidos=ciclos;
 delete estado[CAMPO];
 const snapshot=JSON.stringify(estado);
 if(hash(snapshot)!==ref.sha256Original)
  falha('ESTADO_MOTOR_V2_ORIGINAL_DIVERGENTE');
 return {snapshot,formato:'V2'};
}
function lerEstadoMotor(banco){
 const row=rawEstado(banco);
 if(!row)return null;
 const resolvido=materializar({banco,persistido:row.snapshot});
 return {revisao:row.revisao,
  snapshot:resolvido.snapshot,persistido:row.snapshot,
  formato:resolvido.formato};
}
function compactar({banco,snapshot}={}){
 if(!banco?.isTransaction)falha('ESTADO_MOTOR_V2_TRANSACAO_OBRIGATORIA');
 const s=forma(snapshot),hist=HistoricoCiclosRelacionalSQLite
  .referenciaExistente(banco);
 if(!hist)falha('ESTADO_MOTOR_V2_HISTORICO_AUSENTE');
 // Grave a trilha antes de trocar o formato; ambos no MESMO COMMIT.
 hist.sincronizarEmTransacao({sim:{
  tabuleiro:{ciclosConcluidos:s.tabuleiro.ciclosConcluidos}
 }});
 const meta=hist._meta();
 if(!meta||meta.total_ciclos!==s.tabuleiro.ciclosConcluidos.length||
    !SHA.test(meta.ultimo_hash))
  falha('ESTADO_MOTOR_V2_HISTORICO_DIVERGENTE');
 const compactado={...s,
  tabuleiro:{...s.tabuleiro,ciclosConcluidos:[]},
  [CAMPO]:{versao:2,totalCiclos:meta.total_ciclos,
   ultimoHash:meta.ultimo_hash,sha256Original:hash(snapshot)}};
 return JSON.stringify(compactado);
}
// O formato já migrado jamais volta para V1 após uma escrita.
function gravarEstadoMotor(banco,{snapshot,anterior,permitirV2=false}={}){
 if(!banco?.isTransaction||typeof snapshot!=='string')
  falha('ESTADO_MOTOR_GRAVACAO_INVALIDA');
 forma(snapshot);
 const v2=anterior?.formato==='V2'||permitirV2;
 const armazenado=v2?compactar({banco,snapshot}):snapshot;
 if(anterior){
  const r=banco.prepare([
   'UPDATE loop_real_motor_estado SET revisao=revisao+1,snapshot=?',
   'WHERE id=1 AND revisao=?'
  ].join(' ')).run(armazenado,anterior.revisao);
  if(r.changes!==1)falha('ESTADO_MOTOR_REVISAO_CONCORRENTE');
 }else{
  banco.prepare([
   'INSERT INTO loop_real_motor_estado(id,revisao,snapshot)',
   'VALUES(1,1,?)'
  ].join(' ')).run(armazenado);
 }
 return {snapshot:armazenado,
  revisao:(anterior?.revisao||0)+1,formato:v2?'V2':'V1'};
}
// Migração em uma transação, mesmo que exista histórico; reprocessamento V2
// não muda a revisão. Chamador deve atualizar projeção no MESMO COMMIT.
function migrarEstadoMotorEmTransacao(banco){
 if(!banco?.isTransaction)falha('ESTADO_MOTOR_V2_TRANSACAO_OBRIGATORIA');
 const atual=lerEstadoMotor(banco);
 if(!atual)falha('ESTADO_MOTOR_SNAPSHOT_AUSENTE');
 if(atual.formato==='V2')return {...atual,repetida:true};
 const novo=gravarEstadoMotor(banco,{
  anterior:atual,snapshot:atual.snapshot,permitirV2:true
 });
 return {...novo,snapshotCompleto:atual.snapshot,repetida:false};
}
module.exports={lerEstadoMotor,gravarEstadoMotor,
 migrarEstadoMotorEmTransacao,materializar};
