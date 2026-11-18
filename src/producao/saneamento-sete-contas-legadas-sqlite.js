'use strict';
// Depuracao UNICA de registros indevidos de migracao pre-lancamento.
// So apaga apos: duas identidades reconhecidas, 7 migradas, 4 vinculos
// estritamente segregados, ZERO outras referencias e backup restauravel.
// Dados de login, nick, CPF, IDs e e-mail nunca sao emitidos para logs.
// Nao tem HTTP e NAO participa do cadastro, da loja ou do motor.
const {auditarContasMigradasReadOnly}=
 require('./auditoria-contas-migradas-readonly');
function falha(codigo){
 const e=new Error(codigo);e.codigo=codigo;throw e;
}
const DDLS_ESPERADOS=new Set([
 'loop_real_vinculos_indicacao:indicador_id:3',
 'loop_real_vinculos_indicacao:indicado_id:3',
 'loop_real_migracoes_preview:titular_id:7'
]);
function planejarSaneamentoLegados({banco}={}){
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
  falha('SANEAMENTO_BANCO_AUSENTE');
 if(banco.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')
  falha('SANEAMENTO_SQLITE_NAO_INTEGRO');
 const auditoria=auditarContasMigradasReadOnly({banco});
 if(auditoria.duasReconhecidas!==true||
    auditoria.primeiroVinculoConferido!==true||
    auditoria.integridadeChavesEstrangeiras!=='OK')
  falha('SANEAMENTO_IDENTIDADE_ORIGINAL_NAO_CONFIRMADA');
 if(auditoria.totalContas===2&&auditoria.adicionais===0){
  const vinculos=banco.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao').get().n;
  if(vinculos!==1)falha('SANEAMENTO_HISTORICO_ORIGINAL_DIVERGENTE');
  return Object.freeze({estado:'JA_SANEADO',apto:true,remover:0,
   vinculos:0,migracoes:0,depuracaoExecutada:false});
 }
 if(auditoria.estado!=='CONTAS_ADICIONAIS_EXIGEM_CONCILIACAO'||
    auditoria.totalContas!==9||auditoria.reconhecidas!==2||
    auditoria.adicionais!==7||
    auditoria.adicionaisComOrigemDeMigracao!==7||
    auditoria.adicionaisSemProvaDeMigracao!==0||
    auditoria.referencias.length!==3||
    auditoria.referencias.some(x=>
     !DDLS_ESPERADOS.has(x.tabela+':'+x.coluna+':'+x.quantidade)))
  falha('SANEAMENTO_DEPENDENCIAS_IMPREVISTAS');
 // Os IDs sao usados SOMENTE como parametros SQL internos; nunca logados.
 const contas=banco.prepare('SELECT id,nick FROM loop_real_contas').all();
 const reconhecidas=contas.filter(x=>
  ['vilela','taisaassi'].includes(x.nick.toLowerCase()));
 if(reconhecidas.length!==2||
    new Set(reconhecidas.map(x=>x.nick.toLowerCase())).size!==2)
  falha('SANEAMENTO_DUAS_IDENTIDADES_NAO_CONFIRMDAS');
 const ids=new Set(reconhecidas.map(x=>x.id));
 const adicionais=contas.filter(x=>!ids.has(x.id)).map(x=>x.id);
 if(adicionais.length!==7||new Set(adicionais).size!==7)
  falha('SANEAMENTO_SETE_IDENTIDADES_NAO_CONFIRMADAS');
 const rejeitados=new Set(adicionais);
 const vinculos=banco.prepare(
  'SELECT indicado_id,indicador_id FROM loop_real_vinculos_indicacao'
 ).all();
 if(vinculos.length!==4||
    vinculos.filter(x=>ids.has(x.indicado_id)&&ids.has(x.indicador_id)).length!==1||
    vinculos.filter(x=>rejeitados.has(x.indicado_id)&&
      rejeitados.has(x.indicador_id)).length!==3||
    vinculos.some(x=>
     ids.has(x.indicado_id)!==ids.has(x.indicador_id)))
  falha('SANEAMENTO_INDICACOES_ENTRE_REDES');
 const trigger=banco.prepare(
  "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='loop_real_vinculos_sem_delete'"
 ).get()?.sql;
 if(typeof trigger!=='string'||
    !/^CREATE TRIGGER(?: IF NOT EXISTS)? loop_real_vinculos_sem_delete BEFORE DELETE ON loop_real_vinculos_indicacao BEGIN SELECT RAISE\(ABORT,'vinculo imutavel'\); END;?$/i.test(trigger.trim()))
  falha('SANEAMENTO_TRIGGER_IMUTAVEL_DIVERGENTE');
 return {estado:'APTO',apto:true,remover:7,vinculos:3,migracoes:7,
  depuracaoExecutada:false,
  // Campos internos nao devem ser serializados em logs.
  _ids:Object.freeze(adicionais),_trigger:trigger};
}
function aplicarSaneamentoLegados({banco,backupAnteriorComprovado=false,
 autorizacaoOperador=false}={}){
 if(autorizacaoOperador!==true||backupAnteriorComprovado!==true)
  falha('SANEAMENTO_SEM_AUTORIZACAO_OU_BACKUP');
 const plano=planejarSaneamentoLegados({banco});
 if(plano.estado==='JA_SANEADO')return plano;
 const ids=plano._ids;
 const placeholders=ids.map(()=>'?').join(',');
 let iniciou=false;
 try{
  banco.exec('BEGIN IMMEDIATE');iniciou=true;
  // Sob a mesma transacao as triggers de imutabilidade ficam restauradas
  // antes do COMMIT. Qualquer falha reverte inclusive o DROP TRIGGER.
  banco.prepare('DELETE FROM loop_real_migracoes_preview WHERE titular_id IN ('+
   placeholders+')').run(...ids);
  banco.exec('DROP TRIGGER loop_real_vinculos_sem_delete');
  banco.prepare('DELETE FROM loop_real_vinculos_indicacao WHERE indicado_id IN ('+
   placeholders+') AND indicador_id IN ('+placeholders+')')
   .run(...ids,...ids);
  banco.exec(plano._trigger);
  banco.prepare('DELETE FROM loop_real_contas WHERE id IN ('+
   placeholders+')').run(...ids);
  const final=auditarContasMigradasReadOnly({banco});
  if(final.estado!=='SOMENTE_IDENTIDADES_RECONHECIDAS'||
     final.totalContas!==2||final.reconhecidas!==2||
     final.adicionais!==0||
     final.integridadeChavesEstrangeiras!=='OK'||
     banco.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'||
     banco.prepare(
      'SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao'
     ).get().n!==1||
     !banco.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='loop_real_vinculos_sem_delete'"
     ).get())
    falha('SANEAMENTO_CONFERENCIA_ANTES_COMMIT_FALHOU');
  banco.exec('COMMIT');iniciou=false;
 }catch(e){
  if(iniciou){try{banco.exec('ROLLBACK');}catch{}}
  if(typeof e?.codigo==='string')throw e;
  falha('SANEAMENTO_TRANSACAO_ABORTADA');
 }
 return Object.freeze({estado:'SANEADO',apto:true,remover:7,
  vinculos:3,migracoes:7,depuracaoExecutada:true});
}
module.exports={planejarSaneamentoLegados,aplicarSaneamentoLegados};
