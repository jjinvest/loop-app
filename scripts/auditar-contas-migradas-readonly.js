'use strict';
// Uso autorizado no servidor de identidade com acesso ao volume definitivo:
// LOOP_REAL_SQLITE=/dados-reais/clientes.sqlite node scripts/auditar-contas-migradas-readonly.js
// ESTE SCRIPT SO LE. Nao faz backup, exclusao, alteracao ou reimportacao.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {auditarContasMigradasReadOnly}=
 require('../src/producao/auditoria-contas-migradas-readonly');
function executar({ambiente=process.env,saida=process.stdout}={}){
 const caminho=ambiente.LOOP_REAL_SQLITE;
 if(caminho!=='/dados-reais/clientes.sqlite'||
    !fs.existsSync(caminho))
  throw Error('AUDITORIA_VOLUME_REAL_NAO_IDENTIFICADO');
 // Confere o caminho real para nao ler acidentalmente dados de homologacao.
 const pasta=fs.realpathSync('/dados-reais');
 if(pasta!=='/dados-reais')
  throw Error('AUDITORIA_VOLUME_REAL_INESPERADO');
 const db=new DatabaseSync(caminho,{readOnly:true});
 try{
  const relatorio=auditarContasMigradasReadOnly({banco:db});
  saida.write(JSON.stringify(relatorio,null,2)+'\n');
  return relatorio;
 }finally{db.close();}
}
if(require.main===module){
 try{
  const resultado=executar();
  if(resultado.integridadeChavesEstrangeiras!=='OK'||
     resultado.estado==='IDENTIDADE_ORIGINAL_NAO_COMPROVADA')
   process.exitCode=2;
  else if(resultado.adicionais>0)
   process.exitCode=1; // pendencia encontrada, sem alterar dados
 }catch(e){
  const codigo=typeof e?.codigo==='string'?e.codigo:
   /^AUDITORIA_[A-Z_]+$/.test(e?.message||'')?e.message:'AUDITORIA_INDISPONIVEL';
  process.stderr.write(codigo+'\n');
  process.exitCode=3;
 }
}
module.exports={executar};
