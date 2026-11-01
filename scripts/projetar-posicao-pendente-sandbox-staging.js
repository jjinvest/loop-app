'use strict';
// Passo MANUAL de homologacao, executado DEPOIS de reconsulta PSP
// independente. Uma fotografia de posicao pendente ficticia, nunca
// ativa o motor real, o tabuleiro, bonus, cofres, saques ou credito.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {PosicoesPendentesCheckoutSandboxStaging}=
 require('../src/domain/posicoes-pendentes-checkout-sandbox-staging');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function projetarPosicaoPendenteSandbox({
 arquivo,titularId,prepedidoId,eventoId,execucaoLiberada=false
}={}){
 if(process.env.NODE_ENV==='production'||execucaoLiberada!==true)
  throw falha('POSICAO_FICTICIA_NAO_AUTORIZADA');
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||!fs.existsSync(arquivo)||
    !fs.lstatSync(arquivo).isFile()||fs.lstatSync(arquivo).isSymbolicLink())
  throw falha('BANCO_STAGING_INEXISTENTE');
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const projecao=new PosicoesPendentesCheckoutSandboxStaging({banco,ponte});
  return projecao.projetar({titularId,prepedidoId,eventoId,execucaoLiberada:true});
 }finally{banco.close();}
}
if(require.main===module){
 try{
  const resultado=projetarPosicaoPendenteSandbox({
   arquivo:process.env.LOOP_HOMOLOGACAO_SQLITE,
   titularId:process.env.LOOP_HOMOLOGACAO_TITULAR_ID,
   prepedidoId:process.env.LOOP_HOMOLOGACAO_PREPEDIDO_ID,
   eventoId:process.env.LOOP_HOMOLOGACAO_EVENTO_ID,
   execucaoLiberada:process.env.LOOP_HOMOLOGACAO_PROJETAR_POSICAO==='SIM'
  });
  process.stdout.write('POSICAO_PENDENTE_STAGING='+JSON.stringify(resultado)+'\n');
 }catch(e){
  process.stderr.write('POSICAO_PENDENTE_STAGING_ERRO='+
   String(e.codigo||'FALHA_NAO_CLASSIFICADA')+'\n');
  process.exitCode=1;
 }
}
module.exports={projetarPosicaoPendenteSandbox};
