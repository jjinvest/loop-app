'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {selecionar}=require('../scripts/iniciar-cadastro-publico-release');
const base={NODE_ENV:'production',LOOP_REAL_DADOS_SEPARADOS:'SIM'};
test('release entra em preparacao enquanto cadastro nao esta autorizado, preservando rotas do catalogo',()=>{
 assert.deepEqual(selecionar({...base,LOOP_REAL_CADASTRO_GO:'NAO',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',LOOP_REAL_PREPARACAO_INTERNA:'SIM'}),{
   modo:'PREPARACAO_SEGURA',cadastroDisponivelSobBackup:false
  });
});
test('cadastro real so pode ser selecionado com GO e documentos juntos',()=>{
 assert.deepEqual(selecionar({...base,LOOP_REAL_CADASTRO_GO:'SIM',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM'}),{
   modo:'CADASTRO_REAL',cadastroDisponivelSobBackup:true
  });
 for(const [go,docs] of [['SIM','NAO'],['NAO','SIM'],['NAO','NAO'],['SIM',undefined]]){
  assert.throws(()=>selecionar({...base,LOOP_REAL_CADASTRO_GO:go,
   LOOP_REAL_APROVACAO_DOCUMENTOS:docs}),/CADASTRO_RELEASE_GO_E_DOCUMENTOS_INCONSISTENTES/);
 }
});
test('release rejeita laboratorio e nao depende de pagamento ou credencial comercial',()=>{
 const prod={...base,LOOP_REAL_CADASTRO_GO:'SIM',LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM'};
 for(const env of [
  {...prod,NODE_ENV:'test'},
  {...prod,LOOP_CLIENTES_LAB:'SIM'},
  {...prod,LOOP_MODO_SIMULACAO:'1'},
  {...prod,LOOP_PREVIEW_EXCLUSIVO:'SIM'},
  {...prod,LOOP_REAL_DADOS_SEPARADOS:'NAO'}
 ])assert.throws(()=>selecionar(env),/CADASTRO_RELEASE_AMBIENTE_INVALIDO/);
 assert.equal(selecionar(prod).modo,'CADASTRO_REAL');
 assert.ok(!('LOOP_REAL_CHAVE_ADMIN' in prod));
});

test('operacao interna real nao libera cadastro e exige nucleo definitivo',()=>{
 const ambiente={...base,LOOP_REAL_CADASTRO_GO:'NAO',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_PREPARACAO_INTERNA:'SIM',LOOP_REAL_NUCLEO_COMERCIAL_INTERNO:'SIM',
  LOOP_REAL_OPERACAO_INTERNA:'SIM'};
 assert.deepEqual(selecionar(ambiente),{
  modo:'OPERACAO_INTERNA_REAL',cadastroDisponivelSobBackup:false
 });
 assert.deepEqual(selecionar({...ambiente,LOOP_REAL_OPERACAO_INTERNA:'NAO'}),{
  modo:'PREPARACAO_SEGURA',cadastroDisponivelSobBackup:false
 });
 assert.throws(()=>selecionar({...ambiente,LOOP_REAL_NUCLEO_COMERCIAL_INTERNO:'NAO'}),
  /OPERACAO_INTERNA_NUCLEO_INCOMPLETO/);
 assert.throws(()=>selecionar({...ambiente,LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM'}),
  /CADASTRO_RELEASE_GO_E_DOCUMENTOS_INCONSISTENTES/);
 assert.throws(()=>selecionar({...ambiente,LOOP_CLIENTES_LAB:'SIM'}),
  /CADASTRO_RELEASE_AMBIENTE_INVALIDO/);
});
