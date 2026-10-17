'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const SCRIPT=path.join(__dirname,'..','scripts','gerar-cenario-convites-demo.js');
function executar(env){
 return spawnSync(process.execPath,[SCRIPT],{env:{...process.env,...env},encoding:'utf8'});
}
test('script ficticio opt-in nao executa sem sinalizacao explicita nem em producao',t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-seed-restricoes-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const caminho=path.join(pasta,'demo.sqlite');
 const comuns={NODE_ENV:'test',LOOP_CATALOGO_DB:caminho,LOOP_ADMIN_CATALOGO_LOCAL:'1'};
 const semAceite=executar({...comuns,LOOP_DEMO_SEED_CONVITES:'0'});
 assert.notEqual(semAceite.status,0);
 assert.equal(fs.existsSync(caminho),false);
 const emProducao=executar({...comuns,LOOP_DEMO_SEED_CONVITES:'1',NODE_ENV:'production'});
 assert.notEqual(emProducao.status,0);
 assert.equal(fs.existsSync(caminho),false);
});
test('gerador cria 3 contas, 3 compras, 2 convites validados e fila A sem catraca',t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-seed-simulacao-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const caminho=path.join(pasta,'demo.sqlite');
 const env={
  NODE_ENV:'test',LOOP_ADMIN_CATALOGO_LOCAL:'1',
  LOOP_DEMO_SEED_CONVITES:'1',LOOP_CATALOGO_DB:caminho
 };
 const primeira=executar(env);
 assert.equal(primeira.status,0,primeira.stderr);
 const resumo=JSON.parse(primeira.stdout);
 assert.equal(resumo.modo,'CENARIO_100_POR_CENTO_FICTICIO');
 assert.equal(resumo.contas,3);
 assert.equal(resumo.comprasSimuladas,3);
 assert.equal(resumo.pedidosIdentificados,3);
 assert.equal(resumo.vinculosPedidoPagamento,3);
 assert.equal(resumo.convitesValidadosNoTeste,2);
 assert.equal(resumo.filaA,1);
 assert.equal(resumo.filaB,2);
 assert.equal(resumo.pagamentosReais,0);
 assert.equal(resumo.catracaMovimentada,false);
 const repo=new RepositorioCatalogoSQLite({caminho});
 try{
  const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
  const ponte=new PonteComprasConvitesDemoSQLite({
   banco:repo.banco,contas,
   consultarPagamentoConfiavel:async()=>{throw new Error('nenhuma compra real');}
  });
  const estado=ponte.consultar();
  assert.equal(estado.compras.length,3);
  assert.equal(estado.vinculosIdentificados,3);
  assert.equal(repo.banco.prepare(
   'SELECT COUNT(*) AS n FROM admin_pedidos_titularidade_demo'
  ).get().n,3);
  assert.equal(estado.convites.filter(c=>c.aplicadoNoMotor).length,2);
  assert.equal(estado.filas.A.quantidade,1);
  assert.equal(estado.filas.A.pessoas[0].nome,'Conta Demo Principal');
  assert.equal(estado.filas.B.quantidade,2);
 }finally{repo.fechar();}
 // Nao repetir o seed e nao duplicar o mesmo lote.
 const repeticao=executar(env);
 assert.notEqual(repeticao.status,0);
 const repo2=new RepositorioCatalogoSQLite({caminho});
 try{
  assert.equal(repo2.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,3);
  assert.equal(repo2.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_vinculos_identificados_demo').get().n,3);
 }finally{repo2.fechar();}
});
