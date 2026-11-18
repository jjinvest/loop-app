'use strict';
// Registra apenas contagens e tabelas, sem IDs, nicks, emails ou CPF.
// Nao atualiza banco, nao exclui usuarios nem cria endpoint HTTP.
const {auditarContasMigradasReadOnly}=
 require('./auditoria-contas-migradas-readonly');
const ERRO_SEGURO=/^AUDITORIA_[A-Z0-9_]{3,96}$/;
function emitirAuditoriaCustodiaReadOnly({banco,informar=console.log,falhar=console.error}={}){
 try{
  const x=auditarContasMigradasReadOnly({banco});
  const seguro=Object.freeze({
   estado:x.estado,
   totalContas:x.totalContas,
   reconhecidas:x.reconhecidas,
   adicionais:x.adicionais,
   adicionaisMigradas:x.adicionaisComOrigemDeMigracao,
   adicionaisSemProva:x.adicionaisSemProvaDeMigracao,
   primeiraIndicacaoValida:x.primeiroVinculoConferido,
   duasReconhecidas:x.duasReconhecidas,
   integridadeReferencial:x.integridadeChavesEstrangeiras,
   dependencias:x.referencias.map(({tabela,coluna,quantidade})=>({
    tabela,coluna,quantidade
   })),
   alterouDados:false,exclusaoExecutada:false
  });
  informar('LOOP_CUSTODIA_READONLY='+JSON.stringify(seguro));
  return seguro;
 }catch(e){
  const codigo=typeof e?.codigo==='string'&&ERRO_SEGURO.test(e.codigo)?
   e.codigo:'AUDITORIA_INCONCLUSIVA';
  falhar('LOOP_CUSTODIA_READONLY=INCONCLUSIVA;CODIGO='+codigo);
  return Object.freeze({estado:'INCONCLUSIVA',codigo,alterouDados:false});
 }
}
module.exports={emitirAuditoriaCustodiaReadOnly};
