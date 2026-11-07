'use strict';
// Executar em outra instancia/conta operacional, com segredo e manifesto
// custodiados independentemente. NUNCA executar no container da origem.
// Apenas GET S3 + restauracao temporaria + verificacao; sem POST ou SQL vivo.
const fs=require('node:fs');
const path=require('node:path');
const {provarRecuperacaoIndependente}=
 require('../src/producao/recuperacao-independente-offsite');
function carregarConfiguracao(ambiente){
 if(ambiente.LOOP_DR_EXECUCAO_AUTORIZADA!=='SIM'||
    ambiente.LOOP_REAL_CADASTRO_GO==='SIM'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('RECUPERACAO_DR_NAO_AUTORIZADA_NESTE_SERVICO');
 const key=(nome,opcional=false)=>{
  const value=ambiente[nome];
  if(opcional&&(value===undefined||value===''))return null;
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))
   throw Error('RECUPERACAO_DR_SEGREDO_AUSENTE');
  return Buffer.from(value,'hex');
 };
 const nome=ambiente.LOOP_DR_MANIFESTO_ARQUIVO;
 const nomeChavePublica=ambiente.LOOP_DR_CHAVE_PUBLICA_MANIFESTO_ARQUIVO;
 if(typeof nomeChavePublica!=='string'||!path.isAbsolute(nomeChavePublica)||
    /^(\/dados-reais\/|\/dados-preview\/)/.test(nomeChavePublica)||
    !fs.existsSync(nomeChavePublica)||
    !fs.lstatSync(nomeChavePublica).isFile()||
    fs.lstatSync(nomeChavePublica).isSymbolicLink()||
    fs.statSync(nomeChavePublica).size>8192)
  throw Error('RECUPERACAO_DR_CHAVE_PUBLICA_NAO_CONFIGURADA');
 if(typeof nome!=='string'||!path.isAbsolute(nome)||
    /^(\/dados-reais\/|\/dados-preview\/)/.test(nome)||
    !fs.existsSync(nome)||!fs.lstatSync(nome).isFile()||
    fs.lstatSync(nome).isSymbolicLink()||
    fs.statSync(nome).size>8192)
  throw Error('RECUPERACAO_DR_MANIFESTO_FORA_DA_ORIGEM_OBRIGATORIO');
 let atestacaoManifesto;
 try{atestacaoManifesto=JSON.parse(fs.readFileSync(nome,'utf8'));}
 catch{throw Error('RECUPERACAO_DR_MANIFESTO_INVALIDO');}
 return {
  atestacaoManifesto,
  chavePublicaManifesto:fs.readFileSync(nomeChavePublica,'utf8'),
  sha256ChavePublicaAprovada:ambiente.LOOP_DR_CHAVE_PUBLICA_SHA256_CONFIAVEL,
  config:{
   endpoint:ambiente.LOOP_DR_S3_ENDPOINT,
   bucket:ambiente.LOOP_DR_S3_BUCKET,
   accessKeyId:ambiente.LOOP_DR_S3_ACCESS_KEY_ID,
   secretAccessKey:ambiente.LOOP_DR_S3_SECRET_ACCESS_KEY,
   region:ambiente.LOOP_DR_S3_REGION||'auto'
  },
  chaveBackup:key('LOOP_DR_CHAVE_BACKUP'),
  chavesRecuperacao:{
   chaveEmail:key('LOOP_DR_CHAVE_EMAIL'),
   chaveCifra:key('LOOP_DR_CHAVE_CIFRA'),
   chaveCodigo:key('LOOP_DR_CHAVE_CODIGO'),
   chaveAuditoria:key('LOOP_DR_CHAVE_AUDITORIA',true),
   chaveCotacoes:key('LOOP_DR_CHAVE_COTACOES',true),
   chavePedidos:key('LOOP_DR_CHAVE_PEDIDOS',true),
   chaveOutbox:key('LOOP_DR_CHAVE_OUTBOX',true)
  }
 };
}
async function executar(ambiente=process.env){
 const config=carregarConfiguracao(ambiente);
 return provarRecuperacaoIndependente(config);
}
if(require.main===module){
 executar().then(relatorio=>{
  // Sem URL assinada, segredos, dados bancarios ou nomes de clientes.
  process.stdout.write(JSON.stringify(relatorio)+'\n');
 }).catch(e=>{
  const codigo=typeof e.codigo==='string'&&
   /^[A-Z0-9_]{5,90}$/.test(e.codigo)?
   e.codigo:'RECUPERACAO_DR_NAO_COMPROVADA';
  process.stderr.write('DR_FALHOU='+codigo+'\n');
  process.exitCode=1;
 });
}
module.exports={carregarConfiguracao,executar};