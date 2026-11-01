'use strict';
// Backup OPERACIONAL DE LABORATORIO: somente opt-in, nenhum dado em log.
// Nao e backup de producao, nem prova de armazenamento externo/offsite.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function certificar(banco){
 const integrity=banco.prepare('PRAGMA integrity_check').all();
 if(integrity.length===0||integrity.some(r=>Object.values(r)[0]!=='ok'))
  throw erro('INTEGRIDADE_SQLITE_REPROVADA');
 if(banco.prepare('PRAGMA foreign_key_check').all().length!==0)
  throw erro('CHAVES_ESTRANGEIRAS_REPROVADAS');
}
async function hashArquivo(arquivo){
 const hash=createHash('sha256');
 for await (const bytes of fs.createReadStream(arquivo))hash.update(bytes);
 return hash.digest('hex');
}
async function gerarBackupVerificadoLab({origem,destino,autorizado=false}={}){
 if(autorizado!==true||process.env.NODE_ENV==='production')
  throw erro('BACKUP_LAB_NAO_AUTORIZADO');
 if(typeof origem!=='string'||typeof destino!=='string'||
    !origem.trim()||!destino.trim()||origem===':memory:'||destino===':memory:')
  throw erro('CAMINHO_BACKUP_INVALIDO');
 const origemAbs=path.resolve(origem),destinoAbs=path.resolve(destino);
 if(origemAbs===destinoAbs)throw erro('CAMINHO_BACKUP_INVALIDO');
 let info;
 try{info=fs.lstatSync(origemAbs);}
 catch{throw erro('ORIGEM_SQLITE_AUSENTE');}
 if(!info.isFile()||info.isSymbolicLink())throw erro('ORIGEM_NAO_REGULAR');
 let bd=null,restore=null,criouDestino=false;
 try{
  bd=new DatabaseSync(origemAbs,{readOnly:true});
  const tabelas=new Set(bd.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(!tabelas.has('catalogo_produtos')||!tabelas.has('admin_contas_participantes_demo'))
   throw erro('ORIGEM_NAO_IDENTIFICADA_COMO_LABORATORIO');
  certificar(bd);
  // 'wx' evita sobrescrever arquivo preexistente e recusa symlinks. O VACUUM
  // INTO aceita somente arquivo novo ou previamente vazio.
  const fd=fs.openSync(destinoAbs,'wx',0o600);
  criouDestino=true;fs.closeSync(fd);
  fs.chmodSync(destinoAbs,0o600);
  bd.prepare('VACUUM INTO ?').run(destinoAbs);
  restore=new DatabaseSync(destinoAbs,{readOnly:true});
  certificar(restore);
  const tabelasRestauradas=new Set(restore.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(![...tabelas].every(t=>tabelasRestauradas.has(t)))
   throw erro('BACKUP_TABELAS_DIVERGENTES');
  restore.close();restore=null;bd.close();bd=null;
  const tamanhoBytes=fs.statSync(destinoAbs).size;
  if(tamanhoBytes===0)throw erro('BACKUP_VAZIO');
  return Object.freeze({
   estado:'BACKUP_SQLITE_LAB_VERIFICADO',
   metodo:'VACUUM_INTO',
   destinoNaoSobrescrito:true,
   fonteLaboratorio:true,
   tabelasIdentificadas:tabelas.size,
   sqliteIntegrity:'ok',
   violacoesForeignKeys:0,
   sha256:await hashArquivo(destinoAbs),
   tamanhoBytes,
   modoArquivo:'0600',
   restauracaoTestadaComReabertura:true,
   backupOffsiteComprovado:false,
   rpoRtoComprovados:false,
   dinheiroReal:false
  });
 }catch(e){
  if(restore){try{restore.close();}catch{}}
  if(bd){try{bd.close();}catch{}}
  if(criouDestino){try{fs.rmSync(destinoAbs,{force:true});}catch{}}
  throw e.codigo?e:erro('BACKUP_LAB_FALHOU');
 }
}
if(require.main===module){
 gerarBackupVerificadoLab({
  origem:process.argv[2],destino:process.argv[3],
  autorizado:process.env.LOOP_BACKUP_LAB_AUTORIZADO==='SIM'
 }).then(x=>process.stdout.write('LOOP_BACKUP_LAB='+JSON.stringify(x)+'\n'),
 e=>{process.stderr.write('LOOP_BACKUP_LAB_FALHOU='+String(e.codigo||'INDETERMINADO')+'\n');
  process.exitCode=1;});
}
module.exports={gerarBackupVerificadoLab};
