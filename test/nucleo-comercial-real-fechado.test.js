'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {prepararEstruturaIdentidadeReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {prepararNucleoComercialRealFechado,consultarNucleoComercialRealFechado}=
 require('../src/producao/preparar-nucleo-comercial-real-fechado');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
function criar(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-nucleo-real-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const hex=n=>n.repeat(64);
 const env={
  LOOP_REAL_NUCLEO_COMERCIAL_INTERNO:'SIM',
  LOOP_REAL_CADASTRO_GO:'NAO',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_DADOS_SEPARADOS:'SIM',
  LOOP_REAL_CHAVE_EMAIL:hex('1'),
  LOOP_REAL_CHAVE_CIFRA:hex('2'),
  LOOP_REAL_CHAVE_CODIGO:hex('3'),
  LOOP_REAL_CHAVE_BACKUP:hex('4'),
  LOOP_REAL_CHAVE_AUDITORIA:hex('5'),
  LOOP_REAL_CHAVE_PEDIDOS:hex('6'),
  LOOP_REAL_CHAVE_ADMIN:hex('7'),
  LOOP_REAL_ADMIN_CREDENCIAL:'ADMIN-APENAS-TESTE-SEM-PUBLICACAO-1234567890'
 };
 prepararEstruturaIdentidadeReal({
  banco,chaveEmail:Buffer.from(env.LOOP_REAL_CHAVE_EMAIL,'hex'),
  chaveCifra:Buffer.from(env.LOOP_REAL_CHAVE_CIFRA,'hex'),
  chaveCodigo:Buffer.from(env.LOOP_REAL_CHAVE_CODIGO,'hex'),
  somenteTeste:true
 });
 return {banco,arquivo,env};
}
test('núcleo real integra motor, catraca, pedidos, regras e auditoria sem criar pessoas ou dinheiro',t=>{
 const {banco,arquivo,env}=criar(t);
 const criado=prepararNucleoComercialRealFechado({banco,ambiente:env});
 assert.equal(criado.nucleoRealPersistente,true);
 assert.equal(criado.cadastroLiberado,false);
 assert.equal(criado.checkoutLiberado,false);
 assert.equal(criado.catracaPausada,true);
 assert.equal(criado.componentesIntegrados.length,8);
 assert.equal(criado.pagamentosLiberados,false);
 assert.equal(criado.simulacaoImportada,false);
 // Bootstrap idempotente: não altera nenhuma das regras iniciais.
 assert.equal(prepararNucleoComercialRealFechado({banco,ambiente:env})
  .nucleoRealPersistente,true);
 const prova=consultarNucleoComercialRealFechado({arquivo,permitirTeste:true});
 assert.equal(prova.origem,'SQLITE_OPERACIONAL_REAL');
 assert.equal(prova.componentes,17);
 assert.equal(prova.estruturaIntegra,true);
 assert.equal(prova.catracaPausada,true);
 assert.equal(prova.contas,0);assert.equal(prova.pedidos,0);
 assert.equal(prova.giros,0);assert.equal(prova.lancamentosFinanceiros,0);
 const backup=validarIdentidade(arquivo);
 assert.equal(backup.integridade,'ok');
 assert.equal(backup.administracaoIncluida,true);
 assert.equal(backup.recuperacaoComercialIncluida,true);
 assert.equal(backup.contas,0);
 assert.equal(backup.pedidos,0);
 assert.equal(banco.prepare("SELECT modo FROM loop_real_catraca_admin_politica").get().modo,'PAUSADA');
});
test('não prepara o real sem travas e chaves independentes',t=>{
 const {banco,env}=criar(t);
 assert.throws(()=>prepararNucleoComercialRealFechado({
  banco,ambiente:{...env,LOOP_REAL_CADASTRO_GO:'SIM'}
 }),/NUCLEO_REAL_PREPARACAO_FECHADA_OBRIGATORIA/);
 assert.throws(()=>prepararNucleoComercialRealFechado({
  banco,ambiente:{...env,LOOP_REAL_CHAVE_PEDIDOS:env.LOOP_REAL_CHAVE_AUDITORIA}
 }),/NUCLEO_REAL_CUSTODIAS_NAO_INDEPENDENTES/);
 assert.throws(()=>prepararNucleoComercialRealFechado({
  banco,ambiente:{...env,LOOP_REAL_CHAVE_ADMIN:undefined}
 }),/NUCLEO_REAL_CHAVE_AUSENTE_LOOP_REAL_CHAVE_ADMIN/);
});
