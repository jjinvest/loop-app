'use strict';
// Serviço REAL isolado. Não importar o app de homologação; não permitir
// primeiro cadastro sem documentação/Resend/volume próprios e GO humano.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {criarTransporteEmailVerificacaoResend}=
 require('../src/adapters/email-verificacao-resend');
const {criarTransporteRecuperacaoResend}=
 require('../src/adapters/email-recuperacao-resend');
const {validarConfig:validarBackupS3,enviarBackupOffsiteIdentidade}=
 require('../src/producao/backup-identidade-offsite');
const {criarAgendadorBackupIdentidadeReal}=
 require('../src/producao/agendador-backup-identidade-real');
function configurar(ambiente=process.env){
 if(ambiente.NODE_ENV!=='production'||ambiente.LOOP_REAL_CADASTRO_GO!=='SIM'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='SIM')
  throw Error('CADASTRO_REAL_BLOQUEADO_ATE_GO_FORMAL');
 if(ambiente.LOOP_CLIENTES_LAB==='SIM'||ambiente.LOOP_MODO_SIMULACAO==='1'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('LABORATORIO_INCOMPATIVEL_COM_CADASTRO_REAL');
 const arquivo=ambiente.LOOP_REAL_SQLITE;
 if(arquivo!=='/dados-reais/clientes.sqlite'||
    !fs.existsSync('/dados-reais')||
    fs.realpathSync('/dados-reais')!=='/dados-reais')
  throw Error('VOLUME_SQLITE_REAL_DEDICADO_OBRIGATORIO');
 const key=n=>{
  const s=ambiente[n];
  if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))
   throw Error('SEGREDO_REAL_NAO_CONFIGURADO_'+n);
  return Buffer.from(s,'hex');
 };
 const chaveEmail=key('LOOP_REAL_CHAVE_EMAIL');
 const chaveCifra=key('LOOP_REAL_CHAVE_CIFRA');
 const chaveCodigo=key('LOOP_REAL_CHAVE_CODIGO');
 // Não aceitar cadastro permanente sem cópia OFFSITE cifrada e restore
 // comprovado. Segredo do arquivo diferente das três chaves da conta.
 if(ambiente.LOOP_REAL_BACKUP_OFFSITE_AUTO!=='SIM')
  throw Error('BACKUP_OFFSITE_REAL_OBRIGATORIO');
 const chaveBackup=key('LOOP_REAL_CHAVE_BACKUP');
 for(const k of [chaveEmail,chaveCifra,chaveCodigo]){
  if(k.equals(chaveBackup))throw Error('CHAVE_BACKUP_DEVE_SER_INDEPENDENTE');
 }
 const configS3={
  endpoint:ambiente.LOOP_REAL_S3_ENDPOINT,
  bucket:ambiente.LOOP_REAL_S3_BUCKET,
  accessKeyId:ambiente.LOOP_REAL_S3_ACCESS_KEY_ID,
  secretAccessKey:ambiente.LOOP_REAL_S3_SECRET_ACCESS_KEY,
  region:ambiente.LOOP_REAL_S3_REGION||'auto'
 };
 validarBackupS3(configS3);
 const termos={
  versao:ambiente.LOOP_REAL_TERMOS_VERSAO,
  texto:ambiente.LOOP_REAL_TERMOS_TEXTO
 };
 const privacidade={
  versao:ambiente.LOOP_REAL_PRIVACIDADE_VERSAO,
  texto:ambiente.LOOP_REAL_PRIVACIDADE_TEXTO
 };
 const origemHttps=ambiente.LOOP_REAL_ORIGEM;
 if(typeof origemHttps!=='string'||!/^https:\/\/[^/]+\/?$/.test(origemHttps))
  throw Error('DOMINIO_REAL_HTTPS_OBRIGATORIO');
 const remetente=ambiente.RESEND_FROM_EMAIL;
 const apiKey=ambiente.RESEND_API_KEY;
 const confirmar=criarTransporteEmailVerificacaoResend({apiKey,remetente});
 const recuperar=criarTransporteRecuperacaoResend({apiKey,remetente});
 const enviarEmail=async({finalidade,...args})=>
  (finalidade==='SENHA'?recuperar:confirmar)(args);
 return {arquivo,chaveEmail,chaveCifra,chaveCodigo,termos,privacidade,
  origemHttps,enviarEmail,chaveBackup,configS3};
}
async function iniciar(ambiente=process.env){
 const config=configurar(ambiente);
 const banco=new DatabaseSync(config.arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 let agendador=null;
 try{
  const contas=new IdentidadeClienteLoopReal({...config,banco});
  agendador=criarAgendadorBackupIdentidadeReal({
   executar:()=>enviarBackupOffsiteIdentidade({
    fonteSqlite:config.arquivo,chaveBackup:config.chaveBackup,
    config:config.configS3
   })
  });
  // Falha de rede, segredo, bucket, restauração ou dados bloqueia o
  // listener; nenhuma conta real é criada sem prova de recuperação.
  await agendador.iniciar();
  const app=criarAppIdentidadeLoop({
   contas,origemHttps:config.origemHttps,permitirCadastro:true,
   backupEstado:()=>agendador.estado()
  });
  const porta=Number(ambiente.PORT||3000);
  if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
   throw Error('PORTA_INVALIDA');
  const server=app.listen(porta,'0.0.0.0');
  const encerrar=()=>{
   server.close(async()=>{
    try{await agendador.encerrar();}catch{}
    try{banco.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}
    banco.close();
   });
  };
  process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
  return {server,banco,agendador};
 }catch(e){
  if(agendador)await agendador.encerrar();
  banco.close();
  throw e;
 }
}
if(require.main===module){
 iniciar().catch(e=>{
  // Nunca imprimir token do provedor, URL assinada, e-mail ou dados reais.
  const codigo=typeof e?.codigo==='string'&&
   /^[A-Z0-9_]{5,80}$/.test(e.codigo)?e.codigo:
   'CONFIGURACAO_OU_BACKUP_NAO_PROVADOS';
  console.error('IDENTIDADE_REAL_NAO_INICIOU='+codigo);
  process.exitCode=1;
 });
}
module.exports={configurar,iniciar};
