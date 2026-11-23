'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const TEXTO=('Documento de teste da rede particular do cliente, com consulta '+
 'protegida por titular e sem alterar dados, compras ou posições. ').repeat(3);
test('uma letra, acentos e pequeno erro mostram apenas nomes da propria rede',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const conta=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-BUSCAREDE-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-BUSCAREDE-2026',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const d=conta.documentos();
 const criar=(nome,nick,indicadorNick)=>conta.cadastrar({
  nome,nick,email:nick.toLowerCase()+'@example.invalid',
  senha:'SenhaMuitoLonga2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,hashPrivacidade:d.privacidade.hash,
  ...(indicadorNick?{indicadorNick}:{})
 });
 const dono=await criar('Pessoa Titular','Dono');
 const outra=await criar('Outra Pessoa','Outro');
 await criar('Thaísa Assis','tass','Dono');
 await criar('Teresa Silva','tessa','Dono');
 await criar('Tania Prado','tania','Outro');
 const r=conta.pesquisarIndicados({titularId:dono.titularId,termo:'T'});
 assert.equal(r.somenteMinhaRede,true);
 assert.deepEqual(r.resultados.map(x=>x.nick),['tass','tessa']);
 assert.ok(r.resultados.every(x=>!JSON.stringify(x).includes('tania')));
 assert.deepEqual(conta.pesquisarIndicados({titularId:dono.titularId,termo:'Thaisa'})
  .resultados.map(x=>x.nick),['tass']);
 const sugestoes=conta.pesquisarIndicados({titularId:dono.titularId,termo:'Teresaa'});
 assert.deepEqual(sugestoes.resultados.map(x=>x.nick),['tessa']);
 assert.equal(sugestoes.resultados[0].aproximado,true);
 assert.deepEqual(conta.pesquisarIndicados({titularId:outra.titularId,termo:'T'})
  .resultados.map(x=>x.nick),['tania']);
 assert.deepEqual(conta.pesquisarIndicados({titularId:dono.titularId,termo:'Z'})
  .resultados,[]);
 assert.throws(()=>conta.pesquisarIndicados({titularId:outra.titularId,termo:'<script>'}),
  {codigo:'BUSCA_REDE_INVALIDA'});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,5);
});
test('endpoint e interface limitam a rede pelo titular da sessao e preservam cartoes',()=>{
 const api=fs.readFileSync('src/producao/servidor-identidade-loop.js','utf8');
 const ui=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
 const css=fs.readFileSync('src/producao/acabamento-botoes-real.css','utf8');
 assert.match(api,/app\.post\('\/api\/contas\/minha-rede\/pesquisar',protegido,mutation,csrf/);
 assert.match(api,/contas\.pesquisarIndicados\(\{titularId:req\.conta\.titularId,termo:b\.termo\}\)/);
 assert.match(ui,/campoBusca\.addEventListener\('input'/);
 assert.match(ui,/function agendarSugestoesRede\(\)/);
 assert.match(ui,/function escolherSugestaoRede\(pessoa\)/);
 assert.match(ui,/pessoa\.nome\+' · @'\+pessoa\.nick/);
 assert.match(ui,/sugestoesRedeLista\.hidden=true/);
 assert.match(css,/#sugestoesMinhaRede/);
 assert.match(ui,/p\.nick\.toLowerCase\(\)\.includes\(filtro\)/);
});
