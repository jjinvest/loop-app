'use strict';
// Backup local cifrado da IDENTIDADE REAL, separado do laboratório.
// Não substitui upload offsite, retenção, prova de recuperação inter-regional,
// backup financeiro nem autorização para disponibilizar pagamentos.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {pipeline}=require('node:stream/promises');
const {createHash,createCipheriv,createDecipheriv,randomBytes,hkdfSync}=
 require('node:crypto');
const {MotorLoopIntegradoSQLite,TABELAS_MOTOR}=require('./motor-loop-integrado-sqlite');
const {TABELAS_COMERCIAIS,validarRecuperacaoComercial}=
 require('./validacao-recuperacao-comercial');
const MAGIC=Buffer.from('LOOPREALBKP1','ascii');
const HEADER=40,TAG=16;
const TABELAS=Object.freeze([
 'loop_real_contas','loop_real_sessoes','loop_real_codigos',
 'loop_real_custodia','loop_real_limites','loop_real_vinculos_indicacao'
]);
// Administração, cotações, pedidos, custo congelado e outbox são protegidos
// juntos quando coexistem no MESMO SQLite. Liquidação PSP/banco e tributos
// externos NÃO são cobertos nem autorizados por este backup.
const TABELAS_ADMIN=Object.freeze([
 'loja_real_produtos','loja_real_ofertas_distribuidores',
 'loja_real_custos_ofertas','loja_real_custos_historico',
 'loja_real_revisoes_preco','loja_real_precos_historico',
 'loja_real_sessoes_admin','loja_real_limite_login_admin',
 'loja_real_auditoria_admin','loja_real_manutencao_comercial'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function conferir({origem,destino,chaveBackup,autorizado,restaurar=false}){
 if(autorizado!==true||!Buffer.isBuffer(chaveBackup)||
    chaveBackup.length!==32)falha('CUSTODIA_BACKUP_REAL_NAO_AUTORIZADA');
 if(typeof origem!=='string'||!path.isAbsolute(origem)||
    typeof destino!=='string'||!path.isAbsolute(destino)||
    origem===destino||origem.includes('\0')||destino.includes('\0')||
    !origem.endsWith(restaurar?'.looprealbak':'.sqlite')||
    !destino.endsWith(restaurar?'.sqlite':'.looprealbak'))
  falha('CAMINHOS_BACKUP_REAL_INVALIDOS');
 const canonicalOrigem=path.resolve(origem),canonicalDestino=path.resolve(destino);
 if(!fs.existsSync(origem)||!fs.lstatSync(origem).isFile()||
    fs.lstatSync(origem).isSymbolicLink())
  falha('ORIGEM_BACKUP_REAL_INSEGURA');
 const destinoPai=path.dirname(canonicalDestino);
 if(!fs.existsSync(destinoPai)||
    !fs.statSync(destinoPai).isDirectory()||
    fs.lstatSync(destinoPai).isSymbolicLink())
  falha('DESTINO_BACKUP_REAL_INSEGURO');
 if(process.env.NODE_ENV==='production'){
  if(!restaurar){
   if(canonicalOrigem!=='/dados-reais/clientes.sqlite'||
      canonicalDestino.startsWith('/dados-reais/'))
    falha('BACKUP_REAL_VOLUME_OU_ORIGEM_INVALIDOS');
  }else if(canonicalDestino==='/dados-reais/clientes.sqlite'){
   // Recuperação somente em arquivo novo, com promoção offline controlada.
   falha('RESTAURACAO_NAO_PODE_ATINGIR_BANCO_ATIVO');
  }
 }
 if(fs.existsSync(canonicalDestino))falha('DESTINO_BACKUP_REAL_JA_EXISTE');
 return {origem:canonicalOrigem,destino:canonicalDestino,destinoPai};
}
function validarIdentidade(arquivo){
 const b=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const lista=b.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(x=>x.name);
  if(TABELAS.some(x=>!lista.includes(x)))falha('BACKUP_REAL_ESQUEMA_INCOMPLETO');
  const todos=[...TABELAS,...TABELAS_ADMIN,...TABELAS_COMERCIAIS,...TABELAS_MOTOR];
  if(lista.some(x=>!todos.includes(x)))
   falha('BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS');
  // O snapshot da fila, eventos e livro de compras pertencem ao mesmo backup.
  const temMotor=TABELAS_MOTOR.some(t=>lista.includes(t));
  if(temMotor){
   if(TABELAS_MOTOR.some(t=>!lista.includes(t)))
    falha('BACKUP_MOTOR_PARCIAL');
   try{
    const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
    motor.banco=b;motor.verificar();
   }catch{falha('BACKUP_MOTOR_INTEGRIDADE_DIVERGENTE');}
  }
  // Não aceitar snapshot administrativo parcial. Pedidos e remessas
  // são conferidos semanticamente, sem inferir conciliação bancária.
  const adminPresente=TABELAS_ADMIN.some(x=>lista.includes(x));
  if(adminPresente&&TABELAS_ADMIN.some(x=>!lista.includes(x)))
   falha('BACKUP_ADMIN_PARCIAL');
  if(adminPresente){
   const ver=(t,colunas)=>{
    const encontrados=b.prepare('PRAGMA table_info('+t+')')
     .all().map(x=>x.name);
    if(colunas.some(x=>!encontrados.includes(x)))
     falha('BACKUP_ADMIN_ESQUEMA_INCOMPLETO');
   };
   ver('loja_real_produtos',['produto_id','titulo','ativo']);
   ver('loja_real_ofertas_distribuidores',
    ['produto_id','distribuidor_id','preco_centavos']);
   ver('loja_real_custos_ofertas',
    ['produto_id','distribuidor_id','custo_unit_centavos']);
   ver('loja_real_precos_historico',['id','revisao']);
   ver('loja_real_sessoes_admin',['token_hash','csrf','expira_em']);
   ver('loja_real_auditoria_admin',['id','hash_anterior','hash_atual']);
   ver('loja_real_manutencao_comercial',['id','suspensa','revisao']);
  }
  const integridade=b.prepare('PRAGMA integrity_check').all();
  if(integridade.length!==1||integridade[0].integrity_check!=='ok')
   falha('BACKUP_REAL_SQLITE_CORROMPIDO');
  if(b.prepare('PRAGMA foreign_key_check').all().length)
   falha('BACKUP_REAL_CHAVES_DIVERGENTES');
  if(!b.prepare('SELECT id FROM loop_real_custodia WHERE id=1').get())
   falha('BACKUP_REAL_SEM_CUSTODIA');
  const comercial=validarRecuperacaoComercial(b,lista);
  return {contas:b.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,
   administracaoIncluida:adminPresente,integridade:'ok',...comercial};
 }finally{b.close();}
}
function derivar(k,salt){return Buffer.from(hkdfSync(
 'sha256',k,salt,Buffer.from('LOOP-IDENTIDADE-REAL-BACKUP-V1'),32
));}
async function digest(arquivo){
 const sha=createHash('sha256');
 for await(const bloco of fs.createReadStream(arquivo))sha.update(bloco);
 return sha.digest('hex');
}
async function criarBackupIdentidadeReal({
 origem,destino,chaveBackup,autorizado=false
}={}){
 const p=conferir({origem,destino,chaveBackup,autorizado});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-backup-'));
 fs.chmodSync(tmp,0o700);
 const snapshot=path.join(tmp,'snapshot.sqlite');
 let b=null,fd=null,gerado=false,chave=null;
 try{
  validarIdentidade(p.origem);
  b=new DatabaseSync(p.origem,{readOnly:true});
  b.prepare('VACUUM INTO ?').run(snapshot);
  b.close();b=null;
  fs.chmodSync(snapshot,0o600);
  const prova=validarIdentidade(snapshot);
  const salt=randomBytes(16),iv=randomBytes(12);
  const header=Buffer.concat([MAGIC,salt,iv]);
  if(header.length!==HEADER)falha('BACKUP_CABECALHO_INVALIDO');
  chave=derivar(chaveBackup,salt);
  const cifra=createCipheriv('aes-256-gcm',chave,iv);
  cifra.setAAD(header);
  fd=fs.openSync(p.destino,'wx',0o600);
  gerado=true;
  fs.writeSync(fd,header);
  fs.closeSync(fd);fd=null;
  await pipeline(fs.createReadStream(snapshot),cifra,
   fs.createWriteStream(p.destino,{flags:'a',mode:0o600}));
  fs.appendFileSync(p.destino,cifra.getAuthTag());
  return {estado:'IDENTIDADE_REAL_BACKUP_LOCAL_CIFRADO',
   contas:prova.contas,integridadeSQLite:prova.integridade,
   administracaoIncluida:prova.administracaoIncluida,
   recuperacaoComercialIncluida:prova.recuperacaoComercialIncluida,
   pedidos:prova.pedidos,linhasCustos:prova.linhasCustos,
   remessas:prova.remessas,cotacoes:prova.cotacoes,
   sha256Cifrado:await digest(p.destino),
   tamanhoBytes:fs.statSync(p.destino).size,permissao:'0600',
   copiaOffsiteConfirmada:false,restauracaoOffsiteConfirmada:false,
   backupFinanceiroConfirmado:false};
 }catch(e){
  if(gerado)fs.rmSync(p.destino,{force:true});
  throw e.codigo?e:falha('BACKUP_IDENTIDADE_REAL_FALHOU');
 }finally{
  if(fd!==null)fs.closeSync(fd);
  if(b)try{b.close();}catch{}
  if(chave)chave.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
function bloquearAcessoRestaurado(arquivo){
 const db=new DatabaseSync(arquivo);
 try{
  db.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE;');
  try{
   const sessoes=db.prepare('DELETE FROM loop_real_sessoes').run().changes;
   const temAdmin=!!db.prepare([
    "SELECT 1 FROM sqlite_master WHERE type='table'",
    "AND name='loja_real_sessoes_admin'"
   ].join(' ')).get();
   const sessoesAdminRevogadas=temAdmin?db.prepare(
    'DELETE FROM loja_real_sessoes_admin'
   ).run().changes:0;
   const codigos=db.prepare([
    "UPDATE loop_real_codigos SET estado='BLOQUEADO'",
    "WHERE estado IN ('ENVIADO','RESERVADO')"
   ].join(' ')).run().changes;
   db.exec('COMMIT');
   return {sessoesRevogadas:sessoes,
    sessoesAdminRevogadas,codigosInvalidados:codigos};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.close();}
}
async function restaurarBackupIdentidadeReal({
 origem,destino,chaveBackup,autorizado=false
}={}){
 const p=conferir({origem,destino,chaveBackup,autorizado,restaurar:true});
 const tmp=fs.mkdtempSync(path.join(p.destinoPai,'.loop-real-restore-'));
 fs.chmodSync(tmp,0o700);
 const restaurado=path.join(tmp,'restaurado.sqlite');
 let chave=null;
 try{
  const tamanho=fs.statSync(p.origem).size;
  if(tamanho<=HEADER+TAG)falha('ARQUIVO_BACKUP_REAL_INVALIDO');
  const fd=fs.openSync(p.origem,'r');
  const header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
  try{
   if(fs.readSync(fd,header,0,HEADER,0)!==HEADER||
      fs.readSync(fd,tag,0,TAG,tamanho-TAG)!==TAG||
      !header.subarray(0,MAGIC.length).equals(MAGIC))
    falha('ARQUIVO_BACKUP_REAL_INVALIDO');
  }finally{fs.closeSync(fd);}
  const salt=header.subarray(MAGIC.length,MAGIC.length+16);
  const iv=header.subarray(MAGIC.length+16,HEADER);
  chave=derivar(chaveBackup,salt);
  const cifra=createDecipheriv('aes-256-gcm',chave,iv);
  cifra.setAAD(header);cifra.setAuthTag(tag);
  await pipeline(fs.createReadStream(p.origem,{
   start:HEADER,end:tamanho-TAG-1
  }),cifra,fs.createWriteStream(restaurado,{flags:'wx',mode:0o600}));
  const antes=validarIdentidade(restaurado);
  const invalidacao=bloquearAcessoRestaurado(restaurado);
  validarIdentidade(restaurado);
  // Nunca sobrescrever arquivo preexistente, nem mesmo após corrida.
  fs.linkSync(restaurado,p.destino);
  fs.chmodSync(p.destino,0o600);
  return {estado:'IDENTIDADE_RESTAURADA_EM_ARQUIVO_NOVO',
   contas:antes.contas,integridadeSQLite:'ok',...invalidacao,
   administracaoIncluida:antes.administracaoIncluida,
   recuperacaoComercialIncluida:antes.recuperacaoComercialIncluida,
   pedidos:antes.pedidos,linhasCustos:antes.linhasCustos,
   remessas:antes.remessas,cotacoes:antes.cotacoes,
   destinoExistenteNaoSobrescrito:true,financeiroRealAtivado:false,
   comprovacaoOffsite:false};
 }catch(e){
  if(e.code==='EEXIST')falha('DESTINO_BACKUP_REAL_JA_EXISTE');
  if(e.codigo)throw e;
  falha('RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA');
 }finally{
  if(chave)chave.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
module.exports={validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal};
