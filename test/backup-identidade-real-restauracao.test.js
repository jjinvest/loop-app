'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const TEXTO='Consentimento fictício somente para prova técnica de recuperação. '+
 'Cadastro de identidade do Escritório LOOP e AKITEMM sem dinheiro nem posições reais.';
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-backup-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const backup=path.join(pasta,'identidade.looprealbak');
 const restauro=path.join(pasta,'restaurado.sqlite');
 const segredos={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const chaveBackup=randomBytes(32);
 const emails=[];
 const opcoes={...segredos,
  termos:{versao:'LOOP-TESTE-CONSENT-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-TESTE-PRIV-2026',texto:TEXTO},
  enviarEmail:async x=>{emails.push(x);return true;}
 };
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON');
 const identidade=new IdentidadeClienteLoopReal({...opcoes,banco});
 return {pasta,arquivo,backup,restauro,chaveBackup,opcoes,banco,
  identidade,emails};
}
async function cadastrar(x,nick,email){
 const d=x.identidade.documentos();
 return x.identidade.cadastrar({
  nome:nick+' Exemplo',nick,email,senha:'SenhaFicticiaRobusta2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,
  hashPrivacidade:d.privacidade.hash
 });
}
test('snapshot cifrado do SQLite WAL e restauração isolada preservam contas e revogam cookies',async t=>{
 const x=fixture(t);
 const a=await cadastrar(x,'Ana','ana@example.invalid');
 await cadastrar(x,'Bia','bia@example.invalid');
 const sessao=await x.identidade.entrar({
  nick:'Ana',senha:'SenhaFicticiaRobusta2026!'
 });
 assert.equal(sessao.titularId,a.titularId);
 await x.identidade.solicitarCodigo({
  titularId:a.titularId,finalidade:'EMAIL'
 });
 assert.equal(x.emails.length,1);
 const relatorio=await criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(relatorio.estado,'IDENTIDADE_REAL_BACKUP_LOCAL_CIFRADO');
 assert.equal(relatorio.contas,2);
 assert.equal(relatorio.copiaOffsiteConfirmada,false);
 assert.equal(relatorio.backupFinanceiroConfirmado,false);
 assert.equal(fs.statSync(x.backup).mode&0o777,0o600);
 const bin=fs.readFileSync(x.backup);
 assert.equal(bin.includes(Buffer.from('ana@example.invalid')),false);
 assert.equal(bin.includes(Buffer.from('SQLite format 3')),false);
 assert.equal(bin.includes(Buffer.from('SenhaFicticiaRobusta2026!')),false);
 const restaurado=await restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,chaveBackup:x.chaveBackup,
  autorizado:true
 });
 assert.equal(restaurado.contas,2);
 assert.equal(restaurado.sessoesRevogadas,1);
 assert.equal(restaurado.codigosInvalidados,1);
 assert.equal(restaurado.comprovacaoOffsite,false);
 assert.equal(fs.statSync(x.restauro).mode&0o777,0o600);
 const banco2=new DatabaseSync(x.restauro);
 banco2.exec('PRAGMA foreign_keys=ON');
 const conta2=new IdentidadeClienteLoopReal({...x.opcoes,banco:banco2});
 assert.equal(conta2.sessao(sessao.token),null);
 await assert.rejects(conta2.confirmarCodigo({
  titularId:a.titularId,finalidade:'EMAIL',codigo:x.emails[0].codigo
 }),{codigo:'CODIGO_INVALIDO'});
 const login2=await conta2.entrar({nick:'Ana',senha:'SenhaFicticiaRobusta2026!'});
 assert.equal(login2.titularId,a.titularId);
 assert.equal(conta2.dadosTitular(a.titularId).email,'ana@example.invalid');
 assert.equal(validarIdentidade(x.restauro).integridade,'ok');
 banco2.close();
 x.banco.close();
});
test('backup não sobrescreve arquivo; segredo errado ou conteúdo adulterado não gera restauração',async t=>{
 const x=fixture(t);
 await cadastrar(x,'Ana','ana@example.invalid');
 const opts={origem:x.arquivo,destino:x.backup,
  chaveBackup:x.chaveBackup,autorizado:true};
 await criarBackupIdentidadeReal(opts);
 await assert.rejects(criarBackupIdentidadeReal(opts),
  {codigo:'DESTINO_BACKUP_REAL_JA_EXISTE'});
 const errado=path.join(x.pasta,'segredo-invalido.sqlite');
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:x.backup,destino:errado,chaveBackup:randomBytes(32),autorizado:true
 }),{codigo:'RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA'});
 assert.equal(fs.existsSync(errado),false);
 const bad=path.join(x.pasta,'corrompido.looprealbak');
 const buf=fs.readFileSync(x.backup);
 buf[Math.floor(buf.length/2)]^=0x7f;
 fs.writeFileSync(bad,buf);
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:bad,destino:errado,chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA'});
 assert.equal(fs.existsSync(errado),false);
 fs.writeFileSync(x.restauro,'NAO_APAGAR');
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,
  chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'DESTINO_BACKUP_REAL_JA_EXISTE'});
 assert.equal(fs.readFileSync(x.restauro,'utf8'),'NAO_APAGAR');
 x.banco.close();
});
test('não executar backup de identidade isolado se contém tabelas de pedidos comerciais',async t=>{
 const x=fixture(t);
 await cadastrar(x,'Ana','ana@example.invalid');
 x.banco.exec('CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY)');
 assert.throws(()=>validarIdentidade(x.arquivo),
  {codigo:'BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS'});
 await assert.rejects(criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS'});
 assert.equal(fs.existsSync(x.backup),false);
 x.banco.close();
});
