'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {AkitemmConfigLojaDemoSQLite}=require('../src/domain/akitemm-config-loja-demo-sqlite');

const padrao=['ROXO','DOURADO','VERDE','CINZA','CINZA','VERDE','DOURADO','ROXO'];
const raiz=path.resolve(__dirname,'..');
const codigo=readFileSync(path.join(raiz,'src/laboratorio/loja-cliente-demo.js'),'utf8');
const css=readFileSync(path.join(raiz,'src/laboratorio/loja-cliente-demo.css'),'utf8');
const admin=readFileSync(path.join(raiz,'src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
const html=readFileSync(path.join(raiz,'src/candidato/escritorio-admin-candidato-ui.html'),'utf8');

test('padrão persistido e 8 posições editáveis pelo administrador',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const mod=new AkitemmConfigLojaDemoSQLite({banco});
  assert.deepEqual(mod.consultar().vitrineSlots,padrao);
  const cfg=mod.consultar();
  cfg.vitrineSlots=['CINZA','CINZA','VERDE','ROXO','DOURADO','DOURADO','ROXO','VERDE'];
  assert.deepEqual(mod.salvarComRevisao({config:cfg,revisaoEsperada:0}).config.vitrineSlots,cfg.vitrineSlots);
  const outro=new AkitemmConfigLojaDemoSQLite({banco});
  assert.deepEqual(outro.consultar().vitrineSlots,cfg.vitrineSlots);
  assert.equal(outro.revisao(),1);
  assert.throws(()=>outro.salvarComRevisao({config:cfg,revisaoEsperada:0}),/CONFIG_CONFLITO_REVISAO/);
  for(const invalido of [[],['ROXO'],[...padrao.slice(0,7),'AZUL']]){
   assert.throws(()=>outro.salvarComRevisao({config:{...cfg,vitrineSlots:invalido},revisaoEsperada:1}),
    /VITRINE_SLOTS_INVALIDOS/);
  }
  assert.deepEqual(outro.consultar().vitrineSlots,cfg.vitrineSlots);
 }finally{banco.close();}
});

test('configuração SQLite antiga sem slots migra sem perder os dados',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const mod=new AkitemmConfigLojaDemoSQLite({banco:db});
  const antiga={...mod.consultar()};
  delete antiga.vitrineSlots;
  antiga.informacoes.sobre='Conteúdo anterior preservado';
  db.prepare('INSERT INTO admin_akitemm_config_loja_demo (id,dados_json,atualizado_em) VALUES(1,?,?)')
   .run(JSON.stringify(antiga),new Date().toISOString());
  assert.deepEqual(new AkitemmConfigLojaDemoSQLite({banco:db}).consultar().vitrineSlots,padrao);
  assert.equal(mod.consultar().informacoes.sobre,'Conteúdo anterior preservado');
  assert.equal(mod.revisao(),0);
 }finally{db.close();}
});

test('molduras vazias não são mercadorias nem oferecem compra',()=>{
 const comeco=codigo.indexOf('function criarSlotVazio(');
 const fim=codigo.indexOf('function mostrarCatalogo(',comeco);
 assert.ok(comeco>0&&fim>comeco);
 const trecho=codigo.slice(comeco,fim);
 assert.match(trecho,/card\.className='produto-loja-loop akitemm-slot-vazio/);
 assert.match(trecho,/Aguardando produto cadastrado/);
 assert.doesNotMatch(trecho,/createElement\('button'\)|adicionar\(|precoCentavos|pedidoId/);
 assert.match(codigo,/if\(!item\.produto\)\{destino\.append\(criarSlotVazio\(item\)\);continue;\}/);
 assert.match(codigo,/const exibirMolduras=filtro==='todos'&&!termoBusca/);
 assert.match(codigo,/gradeVitrineMontada\(filtrados\)\.filter\(item=>!corFiltro\|\|item\.cor===corFiltro\)/);
 assert.match(codigo,/Nenhum quadrinho desta cor/);
 assert.match(codigo,/const encontrado=livres\.findIndex\(p=>corDoProduto\(p\)===cor\)/);
 assert.match(codigo,/\.\.\.livres\.map\(produto=>/);
 assert.match(css,/\.akitemm-slot-roxo\{--ak-slot-cor:#bd88f6\}/);
 assert.match(css,/\.akitemm-slot-dourado\{--ak-slot-cor:#e4bd6b\}/);
 assert.match(css,/\.akitemm-slot-verde\{--ak-slot-cor:#65cfa0\}/);
 assert.match(css,/\.akitemm-slot-cinza\{--ak-slot-cor:#a0a9b2\}/);
});

test('editor administrativo usa os oito controles, sem mexer na classificação comercial',()=>{
 assert.match(html,/id="configVitrineSlotsAdmin"/);
 assert.match(admin,/campo\.name='vitrineSlotCor'/);
 assert.match(admin,/config\.vitrineSlots=\[\.\.\.\$\('configVitrineSlotsAdmin'\)/);
 assert.match(admin,/campo\.value=\(config\.vitrineSlots\|\|padrao\)\[indice\]/);
 assert.doesNotMatch(admin,/classificacao\s*=\s*campo\.value/);
});
