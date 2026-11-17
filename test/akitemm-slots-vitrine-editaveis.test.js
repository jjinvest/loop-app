'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {AkitemmConfigLojaDemoSQLite}=require('../src/domain/akitemm-config-loja-demo-sqlite');
const raiz=path.resolve(__dirname,'..');
const ler=p=>readFileSync(path.join(raiz,p),'utf8');
const codigo=ler('src/laboratorio/loja-cliente-demo.js');
const admin=ler('src/candidato/escritorio-admin-candidato-ui.js');
const padrao=['ROXO','DOURADO','VERDE','CINZA','CINZA','VERDE','DOURADO','ROXO'];
const esperado=Array.from({length:200},(_,i)=>padrao[i%8]);

test('configuracao persistida tem 200 cores sem perder compatibilidade de oito',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const mod=new AkitemmConfigLojaDemoSQLite({banco});
  assert.deepEqual(mod.consultar().vitrineSlots,esperado);
  const cfg=mod.consultar();
  const novo=['CINZA','CINZA','VERDE','ROXO','DOURADO','DOURADO','ROXO','VERDE'];
  cfg.vitrineSlots=Array.from({length:200},(_,i)=>novo[i%8]);
  assert.deepEqual(mod.salvarComRevisao({config:cfg,revisaoEsperada:0}).config.vitrineSlots,cfg.vitrineSlots);
  assert.deepEqual(new AkitemmConfigLojaDemoSQLite({banco}).consultar().vitrineSlots,cfg.vitrineSlots);
  assert.equal(mod.revisao(),1);
  assert.throws(()=>mod.salvarComRevisao({config:cfg,revisaoEsperada:0}),/CONFIG_CONFLITO_REVISAO/);
  for(const invalido of [[],['ROXO'],[...cfg.vitrineSlots.slice(0,199),'AZUL']])
   assert.throws(()=>mod.salvarComRevisao({config:{...cfg,vitrineSlots:invalido},revisaoEsperada:1}),/VITRINE_SLOTS_INVALIDOS/);
 }finally{banco.close();}
});

test('configuracao antiga sem slots preserva informacoes e ganha 200 slots',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const mod=new AkitemmConfigLojaDemoSQLite({banco});
  const antiga={...mod.consultar()};
  delete antiga.vitrineSlots;
  antiga.informacoes.sobre='Conteudo anterior preservado';
  banco.prepare('INSERT INTO admin_akitemm_config_loja_demo (id,dados_json,atualizado_em) VALUES(1,?,?)')
   .run(JSON.stringify(antiga),new Date().toISOString());
  assert.deepEqual(new AkitemmConfigLojaDemoSQLite({banco}).consultar().vitrineSlots,esperado);
  assert.equal(mod.consultar().informacoes.sobre,'Conteudo anterior preservado');
  assert.equal(mod.revisao(),0);
 }finally{banco.close();}
});

test('400 quadrinhos em 10 abas; molduras vazias nao oferecem compra',()=>{
 assert.match(codigo,/TOTAL_ABAS=10,COLUNAS_FAIXA=10,LINHAS_ABA=4,VAGAS_ABA=40/);
 assert.match(codigo,/function criarSlotVazio\(/);
 assert.match(codigo,/Aguardando produto cadastrado/);
 assert.match(codigo,/if\(!item\.produto\)\{alvo\.append\(criarSlotVazio\(item\)\);continue;\}/);
 assert.match(codigo,/const exibirMolduras=filtro==='todos'&&!termoBusca/);
 assert.match(codigo,/gradeVitrineMontada\(filtrados\)/);
 assert.match(codigo,/operadorVitrine/);
 assert.match(codigo,/abrirCadastroOperador/);
});

test('editor preserva classificacao comercial e nao recria 200 seletores de cor',()=>{
 assert.match(admin,/config\.vitrineSlots=configLojaAtual\.config\.vitrineSlots/);
 assert.match(admin,/slots\.hidden=true/);
 assert.doesNotMatch(admin,/classificacao\s*=\s*campo\.value/);
});
