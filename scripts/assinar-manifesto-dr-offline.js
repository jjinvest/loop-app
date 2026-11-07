'use strict';
// Executar SOMENTE no equipamento do custodiante independente.
// Nao gerar/armazenar chave privada no Railway ou na origem.
const fs=require('node:fs');
const path=require('node:path');
const {createPrivateKey,createPublicKey,createHash,sign}=
 require('node:crypto');
const {canonizarManifesto}=require('../src/producao/recuperacao-independente-offsite');
function falhar(c){const e=Error(c);e.codigo=c;throw e;}
function arquivoSeguro(nome,entrada){
 if(typeof nome!=='string'||!path.isAbsolute(nome)||
    nome.startsWith('/dados-reais/')||nome.startsWith('/dados-preview/'))
  falhar('DR_CUSTODIANTE_CAMINHO_INVALIDO');
 if(entrada){
  let st;
  try{st=fs.lstatSync(nome);}catch{falhar('DR_CUSTODIANTE_ARQUIVO_INVALIDO');}
  if(!st.isFile()||st.isSymbolicLink()||st.size>8192)
   falhar('DR_CUSTODIANTE_ARQUIVO_INVALIDO');
 }
 return nome;
}
function criarAtestacaoOffline(ambiente=process.env){
 if(ambiente.LOOP_DR_CUSTODIANTE_AUTORIZADO!=='SIM'||
    ambiente.LOOP_REAL_CADASTRO_GO==='SIM'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  falhar('DR_CUSTODIANTE_NAO_AUTORIZADO');
 const manifestoArquivo=arquivoSeguro(ambiente.LOOP_DR_CUSTODIANTE_MANIFESTO_ARQUIVO,true);
 const privadaArquivo=arquivoSeguro(ambiente.LOOP_DR_CUSTODIANTE_PRIVADA_ARQUIVO,true);
 const saidaArquivo=arquivoSeguro(ambiente.LOOP_DR_CUSTODIANTE_SAIDA_ARQUIVO,false);
 const st=fs.statSync(privadaArquivo);
 if((st.mode&0o077)!==0)falhar('DR_CUSTODIANTE_PERMISSOES_PRIVADA_INSEGURAS');
 let manifesto,privada;
 try{
  manifesto=JSON.parse(fs.readFileSync(manifestoArquivo,'utf8'));
  privada=createPrivateKey(fs.readFileSync(privadaArquivo,'utf8'));
 }catch{falhar('DR_CUSTODIANTE_MATERIAL_INVALIDO');}
 if(privada.asymmetricKeyType!=='ed25519')
  falhar('DR_CUSTODIANTE_ALGORITMO_INVALIDO');
 let assinado;
 try{
  assinado={versao:1,algoritmo:'Ed25519',manifesto,
   assinaturaEd25519Hex:sign(null,canonizarManifesto(manifesto),privada).toString('hex')};
 }catch{falhar('DR_CUSTODIANTE_MANIFESTO_INVALIDO');}
 // wx impede sobrescrever um envelope previamente aprovado.
 fs.writeFileSync(saidaArquivo,JSON.stringify(assinado,null,2)+'\n',{
  encoding:'utf8',flag:'wx',mode:0o600
 });
 const publica=createPublicKey(privada);
 const sha256ChavePublicaAprovada=createHash('sha256')
  .update(publica.export({type:'spki',format:'der'})).digest('hex');
 return {estado:'MANIFESTO_ASSINADO_OFFLINE',sha256ChavePublicaAprovada,
  bytesManifesto:fs.statSync(saidaArquivo).size,semPII:true};
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(criarAtestacaoOffline())+'\n');}
 catch(e){
  process.stderr.write('DR_CUSTODIANTE_FALHOU='+
   (e.codigo||'DR_CUSTODIANTE_INCONCLUSIVO')+'\n');
  process.exitCode=1;
 }
}
module.exports={criarAtestacaoOffline};
