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
  origemHttps,enviarEmail};
}
function iniciar(ambiente=process.env){
 const config=configurar(ambiente);
 const banco=new DatabaseSync(config.arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 try{
  const contas=new IdentidadeClienteLoopReal({...config,banco});
  const app=criarAppIdentidadeLoop({
   contas,origemHttps:config.origemHttps,permitirCadastro:true
  });
  const porta=Number(ambiente.PORT||3000);
  if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
   throw Error('PORTA_INVALIDA');
  const server=app.listen(porta,'0.0.0.0');
  const encerrar=()=>{
   server.close(()=>{
    try{banco.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}
    banco.close();
   });
  };
  process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
  return {server,banco};
 }catch(e){banco.close();throw e;}
}
if(require.main===module){
 try{iniciar();}
 catch(e){
  console.error('IDENTIDADE_REAL_NAO_INICIOU: '+e.message);
  process.exitCode=1;
 }
}
module.exports={configurar,iniciar};
