'use strict';
// Preparacao de INFRAESTRUTURA REAL, nao de contas.
// Entra em operacao antes da aprovacao documental sem aceitar NENHUM dado pessoal.
// Na liberacao definitiva, remover esta modalidade e usar
// scripts/iniciar-identidade-real-loop.js com healthcheck /readyz.
const fs=require('node:fs');
const os=require('node:os');
const http=require('node:http');
const path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {prepararEstruturaIdentidadeReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {autorizarInterno,consultarArquivoReal}=
 require('../src/producao/leitura-tabuleiro-operacional-real');

function conferirInfra(ambiente=process.env,{pasta='/dados-reais',io=fs}={}){
 if(ambiente.NODE_ENV!=='production'||
    ambiente.LOOP_REAL_PREPARACAO_INTERNA!=='SIM'||
    ambiente.LOOP_REAL_CADASTRO_GO!=='NAO'||
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='NAO'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM')
  throw Error('PREPARACAO_REAL_EXIGE_CADASTRO_BLOQUEADO');
 if(ambiente.LOOP_CLIENTES_LAB==='SIM'||
    ambiente.LOOP_MODO_SIMULACAO==='1'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('PREPARACAO_REAL_NAO_ACEITA_LAB');
 if(ambiente.LOOP_REAL_SQLITE!==path.join(pasta,'clientes.sqlite')||
    !io.existsSync(pasta)||!io.statSync(pasta).isDirectory()||
    io.realpathSync(pasta)!==pasta)
  throw Error('PREPARACAO_REAL_VOLUME_SEPARADO_AUSENTE');
 // Prova de volume gravavel; so bytes aleatorios, nunca registros de clientes.
 const teste=path.join(pasta,'.probe-'+randomUUID());
 const dados=randomBytes(24);
 try{
  io.writeFileSync(teste,dados,{flag:'wx',mode:0o600});
  if(!io.readFileSync(teste).equals(dados))
   throw Error('PREPARACAO_REAL_VOLUME_DIVERGENTE');
 }finally{
  if(io.existsSync(teste))io.unlinkSync(teste);
 }
 return Object.freeze({volumeDedicado:true});
}

function iniciarMotorRealSemCadastro({ambiente=process.env}={}){
 if(ambiente.LOOP_REAL_BOOTSTRAP_MOTOR_INTERNO!=='SIM')return false;
 const key=n=>{
  const raw=ambiente[n];
  if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))
   throw Error('CHAVE_CUSTODIA_REAL_AUSENTE_'+n);
  return Buffer.from(raw,'hex');
 };
 const banco=new DatabaseSync(ambiente.LOOP_REAL_SQLITE);
 try{
  banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
  if(banco.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_contas'"
   ).get()){
   const x=banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get();
   if(x.n>0)throw Error('MOTOR_REAL_EXIGE_INICIALIZACAO_FORMAL_COM_CLIENTES');
  }
  prepararEstruturaIdentidadeReal({
   banco,chaveEmail:key('LOOP_REAL_CHAVE_EMAIL'),
   chaveCifra:key('LOOP_REAL_CHAVE_CIFRA'),
   chaveCodigo:key('LOOP_REAL_CHAVE_CODIGO')
  });
  new MotorLoopIntegradoSQLite({banco});
  if(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n!==0)
   throw Error('MOTOR_REAL_PREPARACAO_NAO_E_VAZIA');
  return true;
 }finally{banco.close();}
}
function criarServidorPreparacao({ambiente=process.env,pasta='/dados-reais',io=fs}={}){
 conferirInfra(ambiente,{pasta,io});
 iniciarMotorRealSemCadastro({ambiente});
 return http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  // API privada SOMENTE GET da fonte real; nao ativa cadastro ou motor.
  // Se o banco definitivo ainda nao tem schema, devolve 503, nao zero falso.
  if(req.url==='/internal/loop/tabuleiro'){
   if(req.method!=='GET'){
    res.writeHead(405);return res.end(JSON.stringify({erro:'METODO_INVALIDO'}));
   }
   if(!autorizarInterno(req.headers['x-loop-interservice-token'],
     ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN)){
    res.writeHead(401);return res.end(JSON.stringify({erro:'ACESSO_INTERNO_NEGADO'}));
   }
   try{
    const estado=consultarArquivoReal({arquivo:ambiente.LOOP_REAL_SQLITE});
    res.writeHead(200);return res.end(JSON.stringify(estado));
   }catch(e){
    res.writeHead(503);return res.end(JSON.stringify({
     erro:e.codigo||'FONTE_REAL_INDISPONIVEL',operacional:false
    }));
   }
  }
  // Health de infraestrutura diferente de readiness para clientes.
  if(req.method==='GET'&&req.url==='/healthz'){
   // Revalidar volume em cada probe: o startup aprovado não prova
   // que o armazenamento continue disponível depois de uma falha.
   try{conferirInfra(ambiente,{pasta,io});}catch{
    res.writeHead(503);
    return res.end(JSON.stringify({
     estado:'INFRAESTRUTURA_REAL_INDISPONIVEL',
     volumeDedicado:false,cadastroReal:false,
     checkoutReal:false,financeiroReal:false
    }));
   }
   res.writeHead(200);
   return res.end(JSON.stringify({
    estado:'INFRAESTRUTURA_REAL_INICIADA',
    volumeDedicado:true,cadastroReal:false,
    checkoutReal:false,financeiroReal:false
   }));
  }
  if(req.method==='GET'&&req.url==='/readyz'){
   res.writeHead(503);
   return res.end(JSON.stringify({
    estado:'CADASTRO_REAL_AINDA_NAO_AUTORIZADO',
    cadastroReal:false,checkoutReal:false,financeiroReal:false
   }));
  }
  // Qualquer rota de conta, vitrine, admin, API ou webhook permanece indisponivel.
  res.writeHead(503);
  return res.end(JSON.stringify({
   erro:'SERVICO_REAL_EM_PREPARACAO',cadastroReal:false,
   checkoutReal:false,financeiroReal:false
  }));
 });
}

function iniciarPreparacao(ambiente=process.env){
 const server=criarServidorPreparacao({ambiente});
 const porta=Number(ambiente.PORT||3000);
 if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
  throw Error('PORTA_REAL_INVALIDA');
 // Rede privada Railway usa IPv6; dual-stack tambem atende health IPv4.
 server.listen({port:porta,host:'::',ipv6Only:false});
 const finalizar=()=>server.close();
 process.once('SIGTERM',finalizar);
 process.once('SIGINT',finalizar);
 return server;
}
if(require.main===module){
 try{iniciarPreparacao();}catch(e){
  const code=typeof e?.message==='string'&&
   /^PREPARACAO_REAL_[A-Z_]+$/.test(e.message)?e.message:
   'PREPARACAO_REAL_NAO_INICIOU';
  console.error(code);
  process.exitCode=1;
 }
}
module.exports={conferirInfra,iniciarMotorRealSemCadastro,criarServidorPreparacao,iniciarPreparacao};
