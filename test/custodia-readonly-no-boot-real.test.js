'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {emitirAuditoriaCustodiaReadOnly}=
 require('../src/producao/emitir-auditoria-custodia-readonly');
function bancoDeProva(){
 const b=new DatabaseSync(':memory:');
 b.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL UNIQUE);',
  'CREATE TABLE loop_real_migracoes_preview(',
  'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id));',
  'CREATE TABLE loop_real_vinculos_indicacao(',
  'indicado_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id),',
  'indicador_id TEXT NOT NULL REFERENCES loop_real_contas(id));',
  'CREATE TABLE loop_real_provas_historicas(',
  'titular_id TEXT REFERENCES loop_real_contas(id),documento TEXT);'
 ].join(' '));
 for(const [id,nick] of [
  ['legit-01','VILELA'],['legit-02','Taisaassi'],
  ...Array.from({length:7},(_,i)=>['antigo-'+i,'Antigo'+String.fromCharCode(65+i)])
 ]){
  b.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,nick);
  b.prepare('INSERT INTO loop_real_migracoes_preview VALUES(?)').run(id);
 }
 for(const [indicado,indicador] of [
  ['legit-02','legit-01'],['antigo-1','antigo-0'],
  ['antigo-3','antigo-2'],['antigo-5','antigo-4']
 ])b.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
  .run(indicado,indicador);
 b.prepare('INSERT INTO loop_real_provas_historicas VALUES(?,?)')
  .run('antigo-6','NAO_EXIBIR_IDENTIFICADOR_DO_LEGADO');
 return b;
}
test('relatorio real identifica 2 legitimos, 7 extras e suas dependencias sem PII ou mutacao',t=>{
 const b=bancoDeProva();t.after(()=>b.close());
 const antes=b.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n;
 const linhas=[],erros=[];
 b.exec('PRAGMA query_only=ON');
 const r=emitirAuditoriaCustodiaReadOnly({banco:b,
  informar:x=>linhas.push(x),falhar:x=>erros.push(x)});
 assert.equal(erros.length,0);
 assert.equal(r.totalContas,9);
 assert.equal(r.reconhecidas,2);
 assert.equal(r.adicionais,7);
 assert.equal(r.adicionaisMigradas,7);
 assert.equal(r.adicionaisSemProva,0);
 assert.equal(r.primeiraIndicacaoValida,true);
 assert.equal(r.integridadeReferencial,'OK');
 assert.equal(r.alterouDados,false);
 assert.equal(r.exclusaoExecutada,false);
 assert.ok(r.dependencias.some(x=>x.tabela==='loop_real_provas_historicas'&&
  x.coluna==='titular_id'&&x.quantidade===1));
 assert.equal(b.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,antes);
 const exposto=linhas.join('');
 assert.match(exposto,/^LOOP_CUSTODIA_READONLY=/);
 for(const proibido of [
  'legit-01','legit-02','antigo-6','AntigoA','VILELA','Taisaassi',
  'NAO_EXIBIR_IDENTIFICADOR_DO_LEGADO'
 ])assert.ok(!exposto.includes(proibido),'vazamento '+proibido);
});
test('sem dados ou esquema nao mascara falha nem imprime erros brutos',()=>{
 const linhas=[],erros=[];
 const x=emitirAuditoriaCustodiaReadOnly({
  banco:{prepare(){throw Error('CPF 12345678900; segredo');}},
  informar:y=>linhas.push(y),falhar:y=>erros.push(y)
 });
 assert.equal(x.estado,'INCONCLUSIVA');
 assert.equal(x.alterouDados,false);
 assert.equal(linhas.length,0);
 assert.deepEqual(erros,['LOOP_CUSTODIA_READONLY=INCONCLUSIVA;CODIGO=AUDITORIA_INCONCLUSIVA']);
});
