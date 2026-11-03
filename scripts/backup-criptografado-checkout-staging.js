'use strict';
// Backup/restauracao criptografados EXCLUSIVAMENTE do checkout em staging.
// Nao substitui backup offsite, infraestrutura, RPO/RTO ou homologacao.
// Nunca operar em producao, nunca sobrescrever destino, nunca logar chave.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pipeline}=require('node:stream/promises');
const {createHash,randomBytes,scryptSync,createCipheriv,createDecipheriv}=
 require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const MAGIC=Buffer.from('LOOPBKP1','ascii');
const HEADER_SIZE=36;
const TAG_SIZE=16;
const NECESSARIAS=[
 'akitemm_checkout_intencoes_preparacao',
 'akitemm_checkout_prepedidos_staging',
 'akitemm_prepedido_asaas_sandbox_staging'
];
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function conferirAutorizacao(autorizado){
 if(autorizado!==true||process.env.NODE_ENV==='production')
  throw falha('BACKUP_STAGING_NAO_AUTORIZADO');
}
function conferirCaminho(caminho,extensao){
 if(typeof caminho!=='string'||!path.isAbsolute(caminho)||
    !caminho.endsWith(extensao)||caminho.includes('\0'))
  throw falha('CAMINHO_STAGING_INVALIDO');
 return path.resolve(caminho);
}
function conferirArquivoRegular(arquivo){
 let s;
 try{s=fs.lstatSync(arquivo);}catch{throw falha('ARQUIVO_ORIGEM_INEXISTENTE');}
 if(!s.isFile()||s.isSymbolicLink())throw falha('ARQUIVO_ORIGEM_INSEGURO');
 return s;
}
function conferirSenha(senha){
 if(typeof senha!=='string'||Buffer.byteLength(senha,'utf8')<32||
    Buffer.byteLength(senha,'utf8')>512||senha.trim().length<32)
  throw falha('SEGREDO_BACKUP_NAO_CONFIGURADO');
}
// O checkout candidato tem UMA identidade para todas as fases da compra.
// Conferir também a relação semântica: alguns vínculos legados não têm FK.
function validarTitularCandidato(banco,tabelas){
 if(!tabelas.has('akitemm_conta_unica_candidata'))return false;
 const necessarias=[
  'akitemm_sessoes_candidatas',
  'akitemm_checkout_intencoes_preparacao',
  'akitemm_checkout_prepedidos_staging',
  'akitemm_prepedido_asaas_sandbox_staging'
 ];
 if(necessarias.some(x=>!tabelas.has(x)))
  throw falha('BACKUP_CANDIDATO_TABELAS_INCOMPLETAS');
 const q=sql=>banco.prepare(sql).get().n;
 const orfaos=q([
  'SELECT COUNT(*) AS n FROM akitemm_checkout_intencoes_preparacao i',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=i.titular_id',
  'WHERE c.id IS NULL'
 ].join(' '));
 const divergentes=q([
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging p',
  'LEFT JOIN akitemm_checkout_intencoes_preparacao i',
  'ON i.pedido_id=p.rascunho_id',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=p.titular_id',
  'WHERE i.pedido_id IS NULL OR c.id IS NULL',
  'OR i.titular_id<>p.titular_id OR i.total_centavos<>p.total_centavos'
 ].join(' '));
 const cobrancas=q([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging a',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=a.prepedido_id',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=a.titular_id',
  'WHERE p.prepedido_id IS NULL OR c.id IS NULL',
  'OR p.titular_id<>a.titular_id OR p.total_centavos<>a.valor_centavos',
  "OR a.external_ref<>'LOOPLAB-' || a.prepedido_id"
 ].join(' '));
 if(orfaos||divergentes||cobrancas)
  throw falha('BACKUP_CANDIDATO_TITULAR_DIVERGENTE');
 return true;
}
function endurecerAcessoRestaurado(arquivo){
 const banco=new DatabaseSync(arquivo);
 let sessoesRevogadas=0,desafiosInvalidos=0;
 try{
  const tabelas=new Set(banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(x=>x.name));
  banco.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
  try{
   // Jamais ressuscitar sessões de navegador que já haviam sido
   // encerradas depois do momento da foto de backup.
   if(tabelas.has('akitemm_sessoes_candidatas'))
    sessoesRevogadas=banco.prepare(
     'DELETE FROM akitemm_sessoes_candidatas'
    ).run().changes;
   // Uma prova de posse anterior à restauração não pode ser concluída
   // após desastre: solicita-se novo código ao provedor de e-mail.
   if(tabelas.has('akitemm_candidato_email_desafios'))
    desafiosInvalidos=banco.prepare([
     'UPDATE akitemm_candidato_email_desafios',
     "SET estado='BLOQUEADO'",
     "WHERE estado IN ('ENVIADO','RESERVADO')"
    ].join(' ')).run().changes;
   banco.exec('COMMIT');
  }catch(e){banco.exec('ROLLBACK');throw e;}
 }finally{banco.close();}
 return {sessoesRevogadas,desafiosInvalidos};
}
function validarBanco(arquivo){
 const banco=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const tabelas=new Set(banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(NECESSARIAS.some(t=>!tabelas.has(t)))
   throw falha('SQLITE_NAO_E_CHECKOUT_STAGING');
  const integrity=banco.prepare('PRAGMA integrity_check').all();
  if(!integrity.length||integrity.some(x=>Object.values(x)[0]!=='ok'))
   throw falha('SQLITE_CORROMPIDO');
  if(banco.prepare('PRAGMA foreign_key_check').all().length)
   throw falha('SQLITE_REFERENCIAS_INVALIDAS');
  const contaUnicaValidada=validarTitularCandidato(banco,tabelas);
  return {tabelas:tabelas.size,integro:true,contaUnicaValidada};
 }finally{banco.close();}
}
async function sha256(arquivo){
 const hash=createHash('sha256');
 for await(const bytes of fs.createReadStream(arquivo))hash.update(bytes);
 return hash.digest('hex');
}
function derivar(senha,salt){
 return scryptSync(senha,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
async function criarBackupCriptografado({
 origem,destino,senha,autorizado=false
}={}){
 conferirAutorizacao(autorizado);conferirSenha(senha);
 const fonte=conferirCaminho(origem,'.sqlite');
 const saida=conferirCaminho(destino,'.loopbak');
 if(fonte===saida)throw falha('CAMINHO_STAGING_INVALIDO');
 conferirArquivoRegular(fonte);
 // A pasta do backup precisa existir; criar temp em diretorio 0700.
 const temporario=fs.mkdtempSync(path.join(path.dirname(saida),'.loop-bkp-'));
 const snapshot=path.join(temporario,'snapshot.sqlite');
 let db=null,criado=false,chave=null;
 try{
  validarBanco(fonte);
  db=new DatabaseSync(fonte,{readOnly:true});
  // VACUUM INTO capta fotografia transacional inclusive sob WAL ativo.
  db.prepare('VACUUM INTO ?').run(snapshot);
  db.close();db=null;
  const integridade=validarBanco(snapshot);
  const salt=randomBytes(16),iv=randomBytes(12);
  const header=Buffer.concat([MAGIC,salt,iv]);
  chave=derivar(senha,salt);
  const cipher=createCipheriv('aes-256-gcm',chave,iv);
  cipher.setAAD(header);
  fs.writeFileSync(saida,header,{flag:'wx',mode:0o600});
  criado=true;
  await pipeline(fs.createReadStream(snapshot),cipher,
   fs.createWriteStream(saida,{flags:'a',mode:0o600}));
  fs.appendFileSync(saida,cipher.getAuthTag());
  fs.chmodSync(saida,0o600);
  return {estado:'BACKUP_STAGING_CRIPTOGRAFADO',
   algoritmo:'AES-256-GCM',derivacao:'SCRYPT',fonteIntegra:true,
   tabelasVerificadas:integridade.tabelas,sha256:await sha256(saida),
   tamanhoBytes:fs.statSync(saida).size,permissao:'0600',
   copiaOffsiteVerificada:false,restauracaoExternaVerificada:false,
   rpoRtoMedidos:false,checkoutPublicoHabilitado:false,pagamentosReais:0};
 }catch(e){
  if(criado){try{fs.rmSync(saida,{force:true});}catch{}}
  throw e.code==='EEXIST'?falha('DESTINO_JA_EXISTE'):e.codigo?e:falha('BACKUP_STAGING_FALHOU');
 }finally{
  if(db){try{db.close();}catch{}}
  if(chave)chave.fill(0);
  fs.rmSync(temporario,{recursive:true,force:true});
 }
}
async function restaurarBackupCriptografado({
 origem,destino,senha,autorizado=false
}={}){
 conferirAutorizacao(autorizado);conferirSenha(senha);
 const arquivo=conferirCaminho(origem,'.loopbak');
 const saida=conferirCaminho(destino,'.sqlite');
 conferirArquivoRegular(arquivo);
 const temporario=fs.mkdtempSync(path.join(path.dirname(saida),'.loop-restore-'));
 const restaure=path.join(temporario,'recuperado.sqlite');
 let fd=null,chave=null;
 try{
  const stat=fs.statSync(arquivo);
  if(stat.size<=HEADER_SIZE+TAG_SIZE)throw falha('BACKUP_CRIPTOGRAFADO_INVALIDO');
  fd=fs.openSync(arquivo,'r');
  const header=Buffer.alloc(HEADER_SIZE),tag=Buffer.alloc(TAG_SIZE);
  if(fs.readSync(fd,header,0,HEADER_SIZE,0)!==HEADER_SIZE||
     fs.readSync(fd,tag,0,TAG_SIZE,stat.size-TAG_SIZE)!==TAG_SIZE||
     !header.subarray(0,8).equals(MAGIC))
   throw falha('BACKUP_CRIPTOGRAFADO_INVALIDO');
  fs.closeSync(fd);fd=null;
  chave=derivar(senha,header.subarray(8,24));
  const decipher=createDecipheriv('aes-256-gcm',chave,header.subarray(24,36));
  decipher.setAAD(header);decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(arquivo,{
   start:HEADER_SIZE,end:stat.size-TAG_SIZE-1
  }),decipher,fs.createWriteStream(restaure,{flags:'wx',mode:0o600}));
  const integridade=validarBanco(restaure);
  // Recuperação de conta exige reautenticação. A cópia criptografada
  // original permanece intocada; somente o banco recuperado muda.
  const acesso=endurecerAcessoRestaurado(restaure);
  validarBanco(restaure);
  // Hardlink atomico, SEM permitir troca do arquivo de destino existente.
  // Temporario e destino ficam no mesmo filesystem.
  fs.linkSync(restaure,saida);
  fs.chmodSync(saida,0o600);
  return {estado:'STAGING_RESTAURADO_EM_ARQUIVO_NOVO',
   integridadeSQLite:'ok',tabelasVerificadas:integridade.tabelas,
   identidadeCandidataAuditada:integridade.contaUnicaValidada,
   sessoesCandidatasRevogadas:acesso.sessoesRevogadas,
   provasEmailPendentesInvalidadas:acesso.desafiosInvalidos,
   origemCriptografada:true,destinoNaoSobrescrito:true,
   permissao:'0600',recuperacaoOffsiteComprovada:false,
   recuperacaoEmProducao:false,pagamentosReais:0,posicoesCriadas:0};
 }catch(e){
  if(e.code==='EEXIST')throw falha('DESTINO_JA_EXISTE');
  if(e.codigo)throw e;
  throw falha('RESTAURACAO_STAGING_FALHOU_OU_SEGREDO_INVALIDO');
 }finally{
  if(fd!==null)fs.closeSync(fd);
  if(chave)chave.fill(0);
  fs.rmSync(temporario,{recursive:true,force:true});
 }
}
if(require.main===module){
 const opc=process.env.LOOP_BACKUP_STAGING_ACAO;
 const args={origem:process.env.LOOP_BACKUP_STAGING_ORIGEM,
  destino:process.env.LOOP_BACKUP_STAGING_DESTINO,
  senha:process.env.LOOP_BACKUP_STAGING_SEGREDO,
  autorizado:process.env.LOOP_BACKUP_STAGING_AUTORIZADO==='SIM'};
 const acao=opc==='CRIAR'?criarBackupCriptografado:
  opc==='RESTAURAR'?restaurarBackupCriptografado:null;
 Promise.resolve().then(()=>acao?acao(args):Promise.reject(falha('ACAO_BACKUP_INVALIDA')))
 .then(x=>process.stdout.write('CHECKOUT_STAGING_BACKUP='+JSON.stringify(x)+'\n'),
 e=>{process.stderr.write('CHECKOUT_STAGING_BACKUP_FALHOU='+
  String(e.codigo||'FALHA_NAO_CLASSIFICADA')+'\n');process.exitCode=1;});
}
module.exports={criarBackupCriptografado,restaurarBackupCriptografado};
