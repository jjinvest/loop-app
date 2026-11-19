'use strict';
// Verificacao read-only da plataforma REAL implantada no Railway.
// Os hashes deste verificador e do manifesto devem estar fixados fora
// do GitHub, em configuracao Railway, para impedir que ambos sejam
// atualizados juntos sem aprovacao.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const RAIZ=path.resolve(__dirname,'..');
const MANIFESTO='docs/TRAVA_BASE_REAL_ATUAL_20261119.json';
const AREAS=Object.freeze(['src','scripts','public','test','.github/workflows']);
const EXTRAS=Object.freeze([
 'package.json','package-lock.json','Dockerfile.preview',
 'Dockerfile.public-real','.dockerignore','.gitignore'
]);
const EXCECOES=new Set([
 'scripts/trava-base-real.js',
 'test/trava-base-real.test.js',
 '.github/workflows/trava-base-real.yml'
]);
const ERRO='TRAVA_REAL_ALTERACAO_NAO_AUTORIZADA';
function falhar(motivo){
 const e=new Error(ERRO+': '+motivo);e.codigo=ERRO;throw e;
}
function hashGitBlob(bytes){
 return createHash('sha1').update('blob '+bytes.length+'\0')
  .update(bytes).digest('hex');
}
function inventario(raiz){
 const vistos=[];
 function percorrer(relativo){
  const caminho=path.join(raiz,relativo);
  if(!fs.existsSync(caminho))falhar('pasta obrigatoria ausente: '+relativo);
  if(!fs.lstatSync(caminho).isDirectory())falhar('pasta invalida: '+relativo);
  for(const entrada of fs.readdirSync(caminho,{withFileTypes:true})){
   const rel=relativo+'/'+entrada.name;
   if(entrada.isSymbolicLink())falhar('symlink proibido: '+rel);
   if(entrada.isDirectory())percorrer(rel);
   else if(entrada.isFile()){if(!EXCECOES.has(rel))vistos.push(rel);}
   else falhar('tipo de arquivo invalido: '+rel);
  }
 }
 for(const pasta of AREAS)percorrer(pasta);
 for(const rel of EXTRAS){
  const caminho=path.join(raiz,rel);
  if(!fs.existsSync(caminho)||!fs.lstatSync(caminho).isFile())
   falhar('arquivo obrigatorio ausente: '+rel);
  vistos.push(rel);
 }
 return vistos.sort();
}
function verificar({raiz=RAIZ,manifesto=MANIFESTO}={}){
 let dados;
 try{dados=JSON.parse(fs.readFileSync(path.join(raiz,manifesto),'utf8'));}
 catch{falhar('manifesto ausente ou ilegivel');}
 if(dados.schema!==1||dados.proprietarioAutorizacaoExigida!==true||
    dados.algoritmo!=='git-blob-sha1'||!Array.isArray(dados.arquivos))
  falhar('manifesto invalido');
 const esperados=new Map();
 for(const a of dados.arquivos){
  if(typeof a?.path!=='string'||typeof a?.sha!=='string'||
     !/^[a-f0-9]{40}$/.test(a.sha)||esperados.has(a.path)||
     a.path.startsWith('/')||a.path.includes('..')||
     EXCECOES.has(a.path))falhar('registro invalido: '+String(a?.path));
  esperados.set(a.path,a.sha);
 }
 const atuais=inventario(raiz);
 if(atuais.length!==esperados.size)
  falhar('quantidade divergente: esperado '+esperados.size+', atual '+atuais.length);
 const vistos=new Set(atuais);
 for(const rel of atuais){
  if(!esperados.has(rel))falhar('arquivo novo nao aprovado: '+rel);
  const atual=hashGitBlob(fs.readFileSync(path.join(raiz,rel)));
  if(atual!==esperados.get(rel))falhar('conteudo mudou: '+rel);
 }
 for(const rel of esperados.keys()){
  if(!vistos.has(rel))falhar('arquivo removido: '+rel);
 }
 return {ok:true,arquivos:atuais.length,referencia:dados.referenciaGit};
}
if(require.main===module){
 try{
  const resultado=verificar();
  process.stdout.write('TRAVA_REAL_BASE_INTEGRA='+resultado.arquivos+'\n');
 }catch(erro){
  process.stderr.write(String(erro.message||erro)+'\n');
  process.exitCode=1;
 }
}
module.exports={verificar,hashGitBlob,ERRO};
