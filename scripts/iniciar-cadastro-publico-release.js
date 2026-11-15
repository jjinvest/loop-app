'use strict';
// Entrypoint de producao controlada: codigo real PUBLICADO, sem criar
// contas enquanto documentos, backup e GO nao estiverem prontos.
// NUNCA converte ensaio em producao; o app antigo de preparacao permanece
// funcional para catalogo interno e leitura do tabuleiro.
const {iniciarPreparacao}=require('./iniciar-identidade-real-preparacao');
const {iniciar:iniciarCadastroReal}=require('./iniciar-identidade-cadastro-real');

function selecionar(ambiente=process.env){
 if(ambiente.NODE_ENV!=='production'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    ambiente.LOOP_CLIENTES_LAB==='SIM'||
    ambiente.LOOP_MODO_SIMULACAO==='1'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('CADASTRO_RELEASE_AMBIENTE_INVALIDO');
 const go=ambiente.LOOP_REAL_CADASTRO_GO,
       documentos=ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS;
 if(go==='SIM'&&documentos==='SIM')
  return {modo:'CADASTRO_REAL',cadastroDisponivelSobBackup:true};
 if(go==='NAO'&&documentos==='NAO'&&
    ambiente.LOOP_REAL_PREPARACAO_INTERNA==='SIM')
  return {modo:'PREPARACAO_SEGURA',cadastroDisponivelSobBackup:false};
 throw Error('CADASTRO_RELEASE_GO_E_DOCUMENTOS_INCONSISTENTES');
}
function iniciar(ambiente=process.env){
 const selecionado=selecionar(ambiente);
 // Nenhum erro de operacao deve ser tratado como sucesso nem ocultar
 // falhas de bootstrap real, inclusive backup S3 e restauracao isolada.
 if(selecionado.modo==='CADASTRO_REAL')
  return iniciarCadastroReal(ambiente);
 return iniciarPreparacao(ambiente);
}
if(require.main===module){
 Promise.resolve().then(()=>iniciar()).catch(e=>{
  const code=typeof e?.message==='string'&&
   /^[A-Z0-9_]{5,100}$/.test(e.message)?e.message:
   'CADASTRO_RELEASE_INDISPONIVEL';
  console.error(code);
  process.exitCode=1;
 });
}
module.exports={selecionar,iniciar};
