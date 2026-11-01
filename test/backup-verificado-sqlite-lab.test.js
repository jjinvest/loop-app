'use strict';
// Testes descartaveis: sem credencial, cliente ou banco real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {gerarBackupVerificadoLab}=require('../scripts/backup-verificado-sqlite-lab');
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-backup-lab-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const origem=path.join(pasta,'origem.sqlite'),destino=path.join(pasta,'reserva.sqlite');
 const banco=new DatabaseSync(origem);
 t.after(()=>{try{banco.close();}catch{}});
 banco.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
 banco.exec("CREATE TABLE catalogo_produtos(id TEXT PRIMARY KEY);");
 banco.exec("CREATE TABLE admin_contas_participantes_demo(id TEXT PRIMARY KEY, nome TEXT);");
 banco.prepare('INSERT INTO admin_contas_participantes_demo VALUES (?,?)')
  .run('laboratorio-1','Titular Ficticio');
 return {pasta,origem,destino,banco};
}
const args=(m,extra={})=>({origem:m.origem,destino:m.destino,autorizado:true,...extra});
test('gera backup WAL integrado, SHA e copia restauravel; nao muda fonte',async t=>{
 const m=fixture(t);
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await gerarBackupVerificadoLab(args(m));
 assert.equal(r.estado,'BACKUP_SQLITE_LAB_VERIFICADO');
 assert.equal(r.sqliteIntegrity,'ok');
 assert.equal(r.restauracaoTestadaComReabertura,true);
 assert.equal(r.backupOffsiteComprovado,false);
 assert.equal(r.rpoRtoComprovados,false);
 assert.equal(r.modoArquivo,'0600');
 assert.equal(fs.statSync(m.destino).mode&0o777,0o600);
 assert.equal(r.tamanhoBytes,fs.statSync(m.destino).size);
 assert.equal(r.sha256,createHash('sha256').update(fs.readFileSync(m.destino)).digest('hex'));
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 m.banco.prepare('INSERT INTO admin_contas_participantes_demo VALUES (?,?)')
  .run('laboratorio-2','Cliente posterior');
 const copia=new DatabaseSync(m.destino,{readOnly:true});
 try{
  assert.equal(copia.prepare('SELECT COUNT(*) AS n FROM admin_contas_participantes_demo').get().n,1);
  assert.deepEqual(copia.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(copia.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{copia.close();}
});
test('bloqueia execucao sem autorizacao e arquivo de destino preexistente sem sobrescrever',async t=>{
 const m=fixture(t);
 await assert.rejects(gerarBackupVerificadoLab({...args(m),autorizado:false}),
  {codigo:'BACKUP_LAB_NAO_AUTORIZADO'});
 assert.equal(fs.existsSync(m.destino),false);
 fs.writeFileSync(m.destino,'NAO ALTERAR');
 await assert.rejects(gerarBackupVerificadoLab(args(m)));
 assert.equal(fs.readFileSync(m.destino,'utf8'),'NAO ALTERAR');
});
test('recusa arquivo arbitrario, mesma origem, link simbolico e origem corrompida',async t=>{
 const m=fixture(t);
 await assert.rejects(gerarBackupVerificadoLab(args(m,{destino:m.origem})),
  {codigo:'CAMINHO_BACKUP_INVALIDO'});
 const link=path.join(m.pasta,'referencia-simbolica.sqlite');
 fs.symlinkSync(m.origem,link);
 await assert.rejects(gerarBackupVerificadoLab(args(m,{origem:link})),
  {codigo:'ORIGEM_NAO_REGULAR'});
 const falso=path.join(m.pasta,'arquivo-qualquer.sqlite');
 fs.writeFileSync(falso,'arquivo que nao e banco de dados');
 await assert.rejects(gerarBackupVerificadoLab(args(m,{origem:falso})));
 assert.equal(fs.existsSync(m.destino),false);
});
test('recusa SQLite integro que nao tenha tabelas de laboratorio',async t=>{
 const m=fixture(t);
 const outro=path.join(m.pasta,'outro.sqlite');
 const b=new DatabaseSync(outro);
 b.exec('CREATE TABLE aleatorio(id INTEGER);');b.close();
 await assert.rejects(gerarBackupVerificadoLab(args(m,{origem:outro})),
  {codigo:'ORIGEM_NAO_IDENTIFICADA_COMO_LABORATORIO'});
 assert.equal(fs.existsSync(m.destino),false);
});
