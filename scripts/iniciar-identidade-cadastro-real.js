'use strict';
// Cadastro público independente do checkout e do administrativo comercial.
// Usa o MESMO clientes.sqlite da preparação e mantém as rotas internas de
// catálogo/tabuleiro. Não recebe pedidos, pagamentos, bônus ou saques.
// Sem termos aprovados, prova offsite restaurável e chaves distintas, NÃO inicia.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {criarTransporteEmailVerificacaoResend}=
 require('../src/adapters/email-verificacao-resend');
const {criarTransporteRecuperacaoResend}=
 require('../src/adapters/email-recuperacao-resend');
const {validarConfig:validarS3,enviarBackupOffsiteIdentidade}=
 require('../src/producao/backup-identidade-offsite');
const {criarAgendadorBackupIdentidadeReal}=
 require('../src/producao/agendador-backup-identidade-real');
const {criarCatalogoMercadoriasReal}=
 require('../src/producao/catalogo-mercadorias-real');
const {autorizarInterno,consultarArquivoReal}=
 require('../src/producao/leitura-tabuleiro-operacional-real');

function configurar(ambiente=process.env,{pasta='/dados-reais',io=fs}={}){
 if(ambiente.NODE_ENV!=='production'||
    ambiente.LOOP_REAL_CADASTRO_GO!=='SIM'||
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='SIM'||
    ambiente.LOOP_REAL_BACKUP_OFFSITE_AUTO!=='SIM'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    ambiente.LOOP_CLIENTES_LAB==='SIM'||
    ambiente.LOOP_MODO_SIMULACAO==='1'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('CADASTRO_PUBLICO_NAO_AUTORIZADO');
 const arquivo=path.join(pasta,'clientes.sqlite');
 if(ambiente.LOOP_REAL_SQLITE!==arquivo||
    !io.existsSync(pasta)||!io.statSync(pasta).isDirectory()||
    io.realpathSync(pasta)!==pasta)
  throw Error('CADASTRO_VOLUME_DEDICADO_AUSENTE');
 const key=nome=>{
  const raw=ambiente[nome];
  if(typeof raw!=='string'||!/^[0-9a-f]{64}$/.test(raw))
   throw Error('CADASTRO_CHAVE_AUSENTE_'+nome);
  return Buffer.from(raw,'hex');
 };
 const chaveEmail=key('LOOP_REAL_CHAVE_EMAIL');
 const chaveCifra=key('LOOP_REAL_CHAVE_CIFRA');
 const chaveCodigo=key('LOOP_REAL_CHAVE_CODIGO');
 const chaveBackup=key('LOOP_REAL_CHAVE_BACKUP');
 const keys=[chaveEmail,chaveCifra,chaveCodigo,chaveBackup];
 for(let i=0;i<keys.length;i++)
  for(let j=i+1;j<keys.length;j++)
   if(keys[i].equals(keys[j]))throw Error('CADASTRO_CHAVES_NAO_INDEPENDENTES');
 const termos={versao:ambiente.LOOP_REAL_TERMOS_VERSAO,
  texto:ambiente.LOOP_REAL_TERMOS_TEXTO};
 const privacidade={versao:ambiente.LOOP_REAL_PRIVACIDADE_VERSAO,
  texto:ambiente.LOOP_REAL_PRIVACIDADE_TEXTO};
 // Não criar documentos implícitos nem apresentar texto de laboratório.
 for(const doc of [termos,privacidade]){
  if(typeof doc.versao!=='string'||!/^[A-Z0-9][A-Z0-9._-]{3,79}$/.test(doc.versao)||
     typeof doc.texto!=='string'||doc.texto.length<100||
     doc.texto.length>50000||/^(LAB|TESTE)[._-]/i.test(doc.versao))
   throw Error('CADASTRO_DOCUMENTOS_DEFINITIVOS_AUSENTES');
 }
 const origemHttps=ambiente.LOOP_REAL_ORIGEM;
 let url;
 try{url=new URL(origemHttps);}catch{
  throw Error('CADASTRO_ORIGEM_HTTPS_INVALIDA');
 }
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||
    url.username||url.password||url.port)
  throw Error('CADASTRO_ORIGEM_HTTPS_INVALIDA');
 const configS3={
  endpoint:ambiente.LOOP_REAL_S3_ENDPOINT,
  bucket:ambiente.LOOP_REAL_S3_BUCKET,
  accessKeyId:ambiente.LOOP_REAL_S3_ACCESS_KEY_ID,
  secretAccessKey:ambiente.LOOP_REAL_S3_SECRET_ACCESS_KEY,
  region:ambiente.LOOP_REAL_S3_REGION||'auto'
 };
 validarS3(configS3); // Exige bucket exclusivo da identidade, não o do LAB.
 if(typeof ambiente.RESEND_API_KEY!=='string'||!ambiente.RESEND_API_KEY||
    typeof ambiente.RESEND_FROM_EMAIL!=='string'||!ambiente.RESEND_FROM_EMAIL)
  throw Error('CADASTRO_EMAIL_INDISPONIVEL');
 if(ambiente.LOOP_REAL_CATALOGO_EDITAVEL==='SIM'&&
    (typeof ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN!=='string'||
     !/^[a-f0-9]{64}$/.test(ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN)))
  throw Error('CADASTRO_NAO_PODE_INTERROMPER_CATALOGO');
 return {arquivo,pasta,chaveEmail,chaveCifra,chaveCodigo,chaveBackup,
  termos,privacidade,origemHttps,configS3,
  remetente:ambiente.RESEND_FROM_EMAIL,apiKey:ambiente.RESEND_API_KEY,
  catalogoAtivo:ambiente.LOOP_REAL_CATALOGO_EDITAVEL==='SIM',
  tokenInterno:ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN};
}
async function iniciar(ambiente=process.env){
 const cfg=configurar(ambiente);
 const confirmar=criarTransporteEmailVerificacaoResend({
  apiKey:cfg.apiKey,remetente:cfg.remetente});
 const recuperar=criarTransporteRecuperacaoResend({
  apiKey:cfg.apiKey,remetente:cfg.remetente});
 const banco=new DatabaseSync(cfg.arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 let agendador=null,catalogo=null;
 try{
  const contas=new IdentidadeClienteLoopReal({
   banco,chaveEmail:cfg.chaveEmail,chaveCifra:cfg.chaveCifra,
   chaveCodigo:cfg.chaveCodigo,termos:cfg.termos,
   privacidade:cfg.privacidade,
   enviarEmail:async({finalidade,...args})=>
    (finalidade==='SENHA'?recuperar:confirmar)(args)
  });
  // Sem primeiro PUT + GET + restore verificados, sequer abrir a porta.
  agendador=criarAgendadorBackupIdentidadeReal({
   exigirProvaChaves:true,
   executar:()=>enviarBackupOffsiteIdentidade({
    fonteSqlite:cfg.arquivo,chaveBackup:cfg.chaveBackup,
    config:cfg.configS3,exigirProvaChaves:true,
    chavesRecuperacao:{chaveEmail:cfg.chaveEmail,chaveCifra:cfg.chaveCifra,
     chaveCodigo:cfg.chaveCodigo}
   })
  });
  await agendador.iniciar();
  // O catálogo comercial persistente continua no arquivo próprio e não
  // migra para o banco de clientes ao ativar somente cadastros.
  if(cfg.catalogoAtivo)catalogo=criarCatalogoMercadoriasReal({
   arquivo:path.join(cfg.pasta,'catalogo-produtos.sqlite'),
   tokenRaiz:cfg.tokenInterno
  });
  const app=criarAppIdentidadeLoop({
   contas,origemHttps:cfg.origemHttps,permitirCadastro:true,
   backupEstado:()=>agendador.estado()
  });
  const server=http.createServer((req,res)=>{
   if(req.url?.startsWith('/internal/catalogo/')){
    if(!catalogo){res.writeHead(503);res.end();return;}
    void Promise.resolve(catalogo.atender(req,res)).catch(()=>{
     if(!res.writableEnded){res.writeHead(503);res.end();}
    });return;
   }
   if(req.url==='/internal/loop/tabuleiro'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(!autorizarInterno(req.headers['x-loop-interservice-token'],cfg.tokenInterno)){
     res.writeHead(401);res.end(JSON.stringify({erro:'ACESSO_INTERNO_NEGADO'}));return;
    }
    try{res.end(JSON.stringify(consultarArquivoReal({arquivo:cfg.arquivo})));}
    catch{res.writeHead(503);res.end(JSON.stringify({operacional:false}));}
    return;
   }
   app(req,res);
  });
  const porta=Number(ambiente.PORT||3000);
  if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
   throw Error('CADASTRO_PORTA_INVALIDA');
  server.listen({port:porta,host:'::',ipv6Only:false});
  const encerrar=()=>server.close(async()=>{
   await agendador.encerrar();
   catalogo?.fechar();
   banco.close();
  });
  process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
  return {server,banco,agendador,catalogo};
 }catch(e){
  if(agendador)await agendador.encerrar();
  catalogo?.fechar();banco.close();throw e;
 }
}
if(require.main===module)
 iniciar().catch(e=>{
  // O servidor nunca imprime documentos, CPF, tokens ou credenciais.
  const codigo=/^[A-Z0-9_]{5,100}$/.test(e?.message||'')?e.message:
   'CADASTRO_BACKUP_OU_CONFIG_INDISPONIVEL';
  console.error(codigo);process.exitCode=1;
 });
module.exports={configurar,iniciar};
