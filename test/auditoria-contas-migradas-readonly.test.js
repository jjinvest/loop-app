'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {auditarContasMigradasReadOnly}=
 require('../src/producao/auditoria-contas-migradas-readonly');
function criarBanco(){
 const b=new DatabaseSync(':memory:');
 b.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL UNIQUE);',
  'CREATE TABLE loop_real_migracoes_preview(titular_id TEXT PRIMARY KEY',
  'REFERENCES loop_real_contas(id));',
  'CREATE TABLE loop_real_vinculos_indicacao(',
  'indicado_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id),',
  'indicador_id TEXT NOT NULL REFERENCES loop_real_contas(id));',
  'CREATE TABLE loop_real_motor_compras(',
  'pedido_id TEXT PRIMARY KEY,',
  'titular_id TEXT REFERENCES loop_real_contas(id));',
  'CREATE TABLE loop_real_telefones_legados(',
  'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id));'
 ].join(' '));
 const registros=[
  ['id-raiz','VILELA'],['id-primeiro','Taisaassi'],
  ...Array.from({length:7},(_,i)=>['id-lab-'+i,'Antigo'+String.fromCharCode(65+i)])
 ];
 for(const [id,nick] of registros){
  b.prepare('INSERT INTO loop_real_contas(id,nick) VALUES(?,?)').run(id,nick);
  b.prepare('INSERT INTO loop_real_migracoes_preview(titular_id) VALUES(?)').run(id);
 }
 b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run('id-primeiro','id-raiz');
 b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run('id-lab-1','id-lab-0');
 b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run('id-lab-3','id-lab-2');
 b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run('id-lab-5','id-lab-4');
 b.prepare('INSERT INTO loop_real_motor_compras VALUES(?,?)')
  .run('pedido-falso-para-auditoria','id-lab-0');
 b.prepare('INSERT INTO loop_real_telefones_legados VALUES(?)').run('id-lab-6');
 return b;
}
test('auditoria de 9 cadastros conserva 2 reconhecidos e sinaliza 7 sem alterar dados',t=>{
 const banco=criarBanco();
 t.after(()=>banco.close());
 const antes=banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n;
 const resultado=auditarContasMigradasReadOnly({banco});
 assert.equal(resultado.estado,'CONTAS_ADICIONAIS_EXIGEM_CONCILIACAO');
 assert.equal(resultado.totalContas,9);
 assert.equal(resultado.reconhecidas,2);
 assert.equal(resultado.duasReconhecidas,true);
 assert.equal(resultado.primeiroVinculoConferido,true);
 assert.equal(resultado.adicionais,7);
 assert.equal(resultado.adicionaisComOrigemDeMigracao,7);
 assert.equal(resultado.adicionaisSemProvaDeMigracao,0);
 assert.equal(resultado.integridadeChavesEstrangeiras,'OK');
 assert.equal(resultado.exclusaoExecutada,false);
 assert.equal(resultado.exclusaoAutomaticaPermitida,false);
 assert.ok(resultado.referencias.some(x=>
  x.tabela==='loop_real_motor_compras'&&x.coluna==='titular_id'&&x.quantidade===1));
 assert.ok(resultado.referencias.some(x=>
  x.tabela==='loop_real_vinculos_indicacao'&&x.coluna==='indicado_id'&&x.quantidade===3));
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,antes);
 const publicado=JSON.stringify(resultado);
 for(const proibido of ['id-lab-0','AntigoA','pedido-falso-para-auditoria'])
  assert.ok(!publicado.includes(proibido));
});
test('conta sem migracao nao pode passar por uma das sete importadas',t=>{
 const banco=criarBanco();t.after(()=>banco.close());
 banco.prepare('DELETE FROM loop_real_migracoes_preview WHERE titular_id=?')
  .run('id-lab-4');
 const r=auditarContasMigradasReadOnly({banco});
 assert.equal(r.adicionaisSemProvaDeMigracao,1);
 assert.equal(r.todasAdicionaisRegistradasNaMigracao,false);
 assert.equal(r.exclusaoAutomaticaPermitida,false);
});
test('auditoria exige os dois nicks originais e o vinculo reconhecido',t=>{
 const banco=criarBanco();t.after(()=>banco.close());
 banco.prepare('UPDATE loop_real_vinculos_indicacao SET indicador_id=? WHERE indicado_id=?')
  .run('id-lab-0','id-primeiro');
 const r=auditarContasMigradasReadOnly({banco});
 assert.equal(r.estado,'IDENTIDADE_ORIGINAL_NAO_COMPROVADA');
 assert.equal(r.primeiroVinculoConferido,false);
 assert.equal(r.exclusaoAutomaticaPermitida,false);
});
test('sem contas adicionais retorna somente identidades reconhecidas',t=>{
 const banco=criarBanco();t.after(()=>banco.close());
 banco.prepare('DELETE FROM loop_real_motor_compras').run();
 banco.prepare('DELETE FROM loop_real_telefones_legados').run();
 banco.prepare("DELETE FROM loop_real_vinculos_indicacao WHERE indicado_id!='id-primeiro'").run();
 banco.prepare("DELETE FROM loop_real_migracoes_preview WHERE titular_id NOT IN ('id-raiz','id-primeiro')").run();
 banco.prepare("DELETE FROM loop_real_contas WHERE id NOT IN ('id-raiz','id-primeiro')").run();
 const r=auditarContasMigradasReadOnly({banco});
 assert.equal(r.estado,'SOMENTE_IDENTIDADES_RECONHECIDAS');
 assert.equal(r.adicionais,0);
 assert.equal(r.reconhecidas,2);
 assert.equal(r.exclusaoAutomaticaPermitida,false);
});
