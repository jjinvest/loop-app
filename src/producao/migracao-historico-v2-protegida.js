'use strict';
// Conversão única de formato. Sem qualquer emissão de compra/bonificação/giro.
// É executada ANTES do listener real e apenas com backup offsite recuperável.
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
async function migrarHistoricoV2Protegido({
 motor,agendador,autorizacaoInterna=false
}={}){
 if(autorizacaoInterna!==true||
    typeof motor?.migrarHistoricoExterno!=='function'||
    typeof motor?.verificar!=='function'||
    typeof agendador?.estado!=='function'||
    typeof agendador?.executarUmaVez!=='function')
  falha('HISTORICO_V2_AUTORIZACAO_INVALIDA');
 const antesBackup=agendador.estado();
 if(antesBackup.backupAtualEmDia!==true||
    antesBackup.chavesDeLeituraVerificadas!==true||
    antesBackup.emExecucao===true)
  falha('HISTORICO_V2_BACKUP_ANTES_NAO_COMPROVADO');
 const antes=motor.verificar();
 const convertido=motor.migrarHistoricoExterno();
 const depois=motor.verificar();
 if(depois.integridade!=='OK'||antes.integridade!=='OK'||
    antes.compras!==depois.compras||
    antes.eventos!==depois.eventos||
    antes.giros!==depois.giros||
    convertido.formato!=='V2'||convertido.semMovimento!==true||
    convertido.financeiroReal!==false)
  falha('HISTORICO_V2_REGRAS_DIVERGENTES');
 const prova=await agendador.executarUmaVez();
 if(prova.copiaExternaConfirmada!==true||
    prova.restauracaoIsoladaConfirmada!==true||
    agendador.estado().chavesDeLeituraVerificadas!==true)
  falha('HISTORICO_V2_BACKUP_DEPOIS_NAO_COMPROVADO');
 return {formato:'V2',estado:'COMPROVADO',
  ciclos:convertido.ciclos,repetida:convertido.repetida,
  backupsAntesDepoisRestaurados:true,filasPreservadas:true,
  financeiroReal:false,semMovimento:true};
}
module.exports={migrarHistoricoV2Protegido};
