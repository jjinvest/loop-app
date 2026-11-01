'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {preparar}=require('../scripts/preparar-e-enviar-webhook-asaas-sandbox-staging');
const {
 criarBackupCriptografado,restaurarBackupCriptografado
}=require('../scripts/backup-criptografado-checkout-staging');
const SENHA='SegredoDeEnsaioAleatorioExtensoNaoReutilizar_2026!+=';
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-backup-staging-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return {origem:path.join(pasta,'homologacao.sqlite'),
  copia:path.join(pasta,'homologacao.loopbak'),
  restaurado:path.join(pasta,'outro-staging.sqlite')};
}
test('staging: foto WAL criptografada restaura SQLite integro sem substituir origem',async t=>{
 const a=fixture(t);
 const cadastro=await preparar({arquivo:a.origem,
  clienteAsaasId:'cus_ClienteFicticioCriptografia0001',
  execucaoLiberada:true});
 const banco=new DatabaseSync(a.origem);
 banco.exec("PRAGMA journal_mode=WAL; CREATE TABLE prova_backup(v INTEGER);");
 banco.prepare('INSERT INTO prova_backup(v) VALUES (?)').run(10);
 const r=await criarBackupCriptografado({
  origem:a.origem,destino:a.copia,senha:SENHA,autorizado:true
 });
 assert.equal(r.estado,'BACKUP_STAGING_CRIPTOGRAFADO');
 assert.equal(r.algoritmo,'AES-256-GCM');
 assert.equal(r.fonteIntegra,true);
 assert.equal(r.copiaOffsiteVerificada,false);
 assert.equal(fs.statSync(a.copia).mode&0o777,0o600);
 assert.equal(fs.readFileSync(a.copia).includes(Buffer.from('SQLite format 3')),false);
 assert.notEqual(fs.readFileSync(a.copia).subarray(0,16).toString('utf8'),'SQLite format 3');
 banco.prepare('INSERT INTO prova_backup(v) VALUES (?)').run(20);
 const rec=await restaurarBackupCriptografado({
  origem:a.copia,destino:a.restaurado,senha:SENHA,autorizado:true
 });
 assert.equal(rec.estado,'STAGING_RESTAURADO_EM_ARQUIVO_NOVO');
 assert.equal(rec.recuperacaoOffsiteComprovada,false);
 assert.equal(rec.recuperacaoEmProducao,false);
 assert.equal(fs.statSync(a.restaurado).mode&0o777,0o600);
 const restaurado=new DatabaseSync(a.restaurado,{readOnly:true});
 assert.equal(restaurado.prepare('SELECT COUNT(*) AS n FROM prova_backup').get().n,1);
 assert.equal(restaurado.prepare('SELECT v FROM prova_backup').get().v,10);
 assert.equal(restaurado.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?'
 ).get(cadastro.prepedidoId).n,1);
 assert.equal(restaurado.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(restaurado.prepare('PRAGMA foreign_key_check').all(),[]);
 restaurado.close();
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM prova_backup').get().n,2);
 banco.close();
});
test('staging: falhas de autenticacao e backup adulterado nao gravam restauracao',async t=>{
 const a=fixture(t);
 await preparar({arquivo:a.origem,
  clienteAsaasId:'cus_ClienteFicticioCriptografia0001',
  execucaoLiberada:true});
 const args={origem:a.origem,destino:a.copia,senha:SENHA,autorizado:true};
 await assert.rejects(criarBackupCriptografado({...args,autorizado:false}),
  {codigo:'BACKUP_STAGING_NAO_AUTORIZADO'});
 assert.equal(fs.existsSync(a.copia),false);
 await criarBackupCriptografado(args);
 await assert.rejects(criarBackupCriptografado(args),{codigo:'DESTINO_JA_EXISTE'});
 assert.equal(fs.statSync(a.copia).size>40,true);
 await assert.rejects(restaurarBackupCriptografado({
  origem:a.copia,destino:a.restaurado,senha:SENHA+'erro',autorizado:true
 }),{codigo:'RESTAURACAO_STAGING_FALHOU_OU_SEGREDO_INVALIDO'});
 assert.equal(fs.existsSync(a.restaurado),false);
 const copia=fs.readFileSync(a.copia);
 copia[60]^=1;
 fs.writeFileSync(a.copia,copia);
 await assert.rejects(restaurarBackupCriptografado({
  origem:a.copia,destino:a.restaurado,senha:SENHA,autorizado:true
 }),{codigo:'RESTAURACAO_STAGING_FALHOU_OU_SEGREDO_INVALIDO'});
 assert.equal(fs.existsSync(a.restaurado),false);
});
test('staging: nao sobrescreve destino nem restaura banco de laboratorio generico',async t=>{
 const a=fixture(t);
 const b=new DatabaseSync(a.origem);
 b.exec('CREATE TABLE qualquer(id INTEGER);');
 b.close();
 await assert.rejects(criarBackupCriptografado({
  origem:a.origem,destino:a.copia,senha:SENHA,autorizado:true
 }),{codigo:'SQLITE_NAO_E_CHECKOUT_STAGING'});
 assert.equal(fs.existsSync(a.copia),false);
 fs.rmSync(a.origem);
 await preparar({arquivo:a.origem,
  clienteAsaasId:'cus_ClienteFicticioCriptografia0001',
  execucaoLiberada:true});
 await criarBackupCriptografado({
  origem:a.origem,destino:a.copia,senha:SENHA,autorizado:true
 });
 fs.writeFileSync(a.restaurado,'NAO_SOBRESCREVER');
 await assert.rejects(restaurarBackupCriptografado({
  origem:a.copia,destino:a.restaurado,senha:SENHA,autorizado:true
 }),{codigo:'DESTINO_JA_EXISTE'});
 assert.equal(fs.readFileSync(a.restaurado,'utf8'),'NAO_SOBRESCREVER');
 const symlink=path.join(path.dirname(a.origem),'link.sqlite');
 fs.symlinkSync(a.origem,symlink);
 await assert.rejects(criarBackupCriptografado({
  origem:symlink,destino:path.join(path.dirname(a.copia),'link.loopbak'),
  senha:SENHA,autorizado:true
 }),{codigo:'ARQUIVO_ORIGEM_INSEGURO'});
});
