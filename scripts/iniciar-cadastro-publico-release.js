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

async function provarPrimeiraCopiaPreparacao(ambiente=process.env){
 // Prova na origem real fechada, sem aceitar usuarios ou operar pagamentos.
 if(selecionar(ambiente).modo!=='PREPARACAO_SEGURA')
  throw Error('PROVA_BACKUP_REQUER_CADASTRO_FECHADO');
 try{
  const {enviarBackupOffsiteIdentidade}=
   require('../src/producao/backup-identidade-offsite');
  const chave=n=>{
   const v=ambiente[n];
   if(typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))
    throw Error('BACKUP_CHAVE_NAO_CONFIGURADA');
   return Buffer.from(v,'hex');
  };
  const prova=await enviarBackupOffsiteIdentidade({
   fonteSqlite:ambiente.LOOP_REAL_SQLITE,
   chaveBackup:chave('LOOP_REAL_CHAVE_BACKUP'),
   config:{
    endpoint:ambiente.LOOP_REAL_S3_ENDPOINT,
    bucket:ambiente.LOOP_REAL_S3_BUCKET,
    region:ambiente.LOOP_REAL_S3_REGION||'auto',
    accessKeyId:ambiente.LOOP_REAL_S3_ACCESS_KEY_ID,
    secretAccessKey:ambiente.LOOP_REAL_S3_SECRET_ACCESS_KEY
   },
   exigirProvaChaves:true,
   chavesRecuperacao:{
    chaveEmail:chave('LOOP_REAL_CHAVE_EMAIL'),
    chaveCifra:chave('LOOP_REAL_CHAVE_CIFRA'),
    chaveCodigo:chave('LOOP_REAL_CHAVE_CODIGO')
   }
  });
  if(prova.copiaExternaConfirmada!==true||
     prova.restauracaoIsoladaConfirmada!==true||
     prova.chavesDeLeituraVerificadas!==true||
     prova.integridadeSQLite!=='ok')
   throw Error('BACKUP_IDENTIDADE_PROVA_INCOMPLETA');
  process.stdout.write('LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=COMPROVADA'+
   ';PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES='+prova.bytes+
   ';CONTAS='+prova.contas+';SHA256='+prova.sha256Cifrado+'\n');
  return true;
 }catch(e){
  const bruto=e?.codigo||e?.message||'';
  const codigo=/^[A-Z0-9_]{5,100}$/.test(bruto)?bruto:'INCONCLUSIVO';
  process.stderr.write('LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=NAO_COMPROVADA'+
   ';CODIGO='+codigo+'\n');
  return false;
 }
}

function iniciar(ambiente=process.env){
 const selecionado=selecionar(ambiente);
 // Nenhum erro de operacao deve ser tratado como sucesso nem ocultar
 // falhas de bootstrap real, inclusive backup S3 e restauracao isolada.
 if(selecionado.modo==='CADASTRO_REAL')
  return iniciarCadastroReal(ambiente);
 const server=iniciarPreparacao(ambiente);
 // Prova offsite real não bloqueia a preparação, nem ativa o cadastro.
 void provarPrimeiraCopiaPreparacao(ambiente);
 return server;
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
module.exports={selecionar,iniciar,provarPrimeiraCopiaPreparacao};
