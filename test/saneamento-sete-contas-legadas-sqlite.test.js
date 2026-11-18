'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {planejarSaneamentoLegados,aplicarSaneamentoLegados}=
 require('../src/producao/saneamento-sete-contas-legadas-sqlite');
const {auditarContasMigradasReadOnly}=
 require('../src/producao/auditoria-contas-migradas-readonly');
function montar(){
 const b=new DatabaseSync(':memory:');
 b.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL UNIQUE);',
  'CREATE TABLE loop_real_migracoes_preview(',
  'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id) ON DELETE RESTRICT);',
  'CREATE TABLE loop_real_vinculos_indicacao(',
  'indicado_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
  'indicador_id TEXT REFERENCES loop_real_contas(id) ON DELETE RESTRICT);',
  'CREATE TRIGGER IF NOT EXISTS loop_real_vinculos_sem_delete',
  "BEFORE DELETE ON loop_real_vinculos_indicacao BEGIN SELECT RAISE(ABORT,'vinculo imutavel'); END;",
  'CREATE TRIGGER IF NOT EXISTS loop_real_vinculos_sem_update',
  "BEFORE UPDATE ON loop_real_vinculos_indicacao BEGIN SELECT RAISE(ABORT,'vinculo imutavel'); END;"
 ].join(' '));
 for(const [id,nick] of [
  ['titular-legitimo-v','VILELA'],['titular-legitimo-t','Taisaassi'],
  ...Array.from({length:7},(_,i)=>[
   'titular-ensaio-'+i,'Legado'+String.fromCharCode(65+i)])
 ]){
  b.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,nick);
  b.prepare('INSERT INTO loop_real_migracoes_preview VALUES(?)').run(id);
 }
 for(const [indicado,indicador] of [
  ['titular-legitimo-t','titular-legitimo-v'],
  ['titular-ensaio-1','titular-ensaio-0'],
  ['titular-ensaio-3','titular-ensaio-2'],
  ['titular-ensaio-5','titular-ensaio-4']
 ])b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run(indicado,indicador);
 return b;
}
const qtd=(b,t)=>b.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
test('planejamento read-only: 9 para 2, sem serializar ID ou tocar no banco',t=>{
 const b=montar();t.after(()=>b.close());
 b.exec('PRAGMA query_only=ON');
 const p=planejarSaneamentoLegados({banco:b});
 assert.deepEqual([p.estado,p.remover,p.vinculos,p.migracoes],
  ['APTO',7,3,7]);
 const log=JSON.stringify(p);
 for(const protegido of [
  'VILELA','Taisaassi','titular-ensaio','titular-legitimo'
 ])assert.ok(!log.includes(protegido),'PII no planejamento');
 assert.equal(qtd(b,'loop_real_contas'),9);
 assert.equal(qtd(b,'loop_real_vinculos_indicacao'),4);
});
test('sem comprovacao do backup e autorizacao nunca exclui nada',t=>{
 const b=montar();t.after(()=>b.close());
 assert.throws(()=>aplicarSaneamentoLegados({
  banco:b,autorizacaoOperador:true,backupAnteriorComprovado:false
 }),/SANEAMENTO_SEM_AUTORIZACAO_OU_BACKUP/);
 assert.throws(()=>aplicarSaneamentoLegados({
  banco:b,autorizacaoOperador:false,backupAnteriorComprovado:true
 }),/SANEAMENTO_SEM_AUTORIZACAO_OU_BACKUP/);
 assert.equal(qtd(b,'loop_real_contas'),9);
});
test('so remove 7 migradas e 3 vinculos do ensaio; preserva 2, convite original e trigger',t=>{
 const b=montar();t.after(()=>b.close());
 const res=aplicarSaneamentoLegados({
  banco:b,autorizacaoOperador:true,backupAnteriorComprovado:true
 });
 assert.equal(res.estado,'SANEADO');
 assert.equal(res.remover,7);
 assert.equal(qtd(b,'loop_real_contas'),2);
 assert.equal(qtd(b,'loop_real_migracoes_preview'),2);
 assert.equal(qtd(b,'loop_real_vinculos_indicacao'),1);
 assert.deepEqual(b.prepare(
  'SELECT nick FROM loop_real_contas ORDER BY nick').all()
  .map(x=>x.nick),['Taisaassi','VILELA']);
 const original=b.prepare('SELECT * FROM loop_real_vinculos_indicacao').get();
 assert.deepEqual([original.indicado_id,original.indicador_id],
  ['titular-legitimo-t','titular-legitimo-v']);
 assert.equal(auditarContasMigradasReadOnly({banco:b}).estado,
  'SOMENTE_IDENTIDADES_RECONHECIDAS');
 assert.equal(b.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>b.prepare('DELETE FROM loop_real_vinculos_indicacao')
  .run(),/vinculo imutavel/);
 const idempotente=aplicarSaneamentoLegados({
  banco:b,autorizacaoOperador:true,backupAnteriorComprovado:true
 });
 assert.equal(idempotente.estado,'JA_SANEADO');
 assert.equal(idempotente.remover,0);
});
test('dependencia financeira ou de pedidos desconhecida impede limpeza',t=>{
 const b=montar();t.after(()=>b.close());
 b.exec('CREATE TABLE loja_real_fatura_externa('+
  'id TEXT PRIMARY KEY, titular_id TEXT REFERENCES loop_real_contas(id))');
 b.prepare('INSERT INTO loja_real_fatura_externa VALUES(?,?)')
  .run('pedido-externo','titular-ensaio-0');
 assert.throws(()=>planejarSaneamentoLegados({banco:b}),
  /SANEAMENTO_DEPENDENCIAS_IMPREVISTAS/);
 assert.equal(qtd(b,'loop_real_contas'),9);
});
test('vinculo cruzado com titular reconhecido nao pode ser excluido',t=>{
 const b=montar();t.after(()=>b.close());
 b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run('titular-legitimo-v','titular-ensaio-2');
 assert.throws(()=>planejarSaneamentoLegados({banco:b}),
  /SANEAMENTO_(?:DEPENDENCIAS_IMPREVISTAS|INDICACOES_ENTRE_REDES)/);
 assert.equal(qtd(b,'loop_real_contas'),9);
});
test('falha a meio da limpeza reverte DROP TRIGGER e todos os DELETEs',t=>{
 const b=montar();t.after(()=>b.close());
 b.exec("CREATE TRIGGER impedir_contas BEFORE DELETE ON loop_real_contas "+
  "BEGIN SELECT RAISE(ABORT,'falha de ensaio'); END;");
 assert.throws(()=>aplicarSaneamentoLegados({
  banco:b,backupAnteriorComprovado:true,autorizacaoOperador:true
 }),/SANEAMENTO_TRANSACAO_ABORTADA/);
 assert.equal(qtd(b,'loop_real_contas'),9);
 assert.equal(qtd(b,'loop_real_vinculos_indicacao'),4);
 assert.equal(qtd(b,'loop_real_migracoes_preview'),9);
 assert.ok(b.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='loop_real_vinculos_sem_delete'"
 ).get());
 assert.equal(b.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('se nao sao exatamente 7 adicionais, nunca normalizar por aproximacao',t=>{
 const b=montar();t.after(()=>b.close());
 b.prepare('INSERT INTO loop_real_contas VALUES(?,?)')
  .run('novo-legitimo-externo','CadastroNovo');
 assert.throws(()=>planejarSaneamentoLegados({banco:b}),
  /SANEAMENTO_DEPENDENCIAS_IMPREVISTAS/);
 assert.equal(qtd(b,'loop_real_contas'),10);
});
