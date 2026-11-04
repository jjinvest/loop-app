'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {consultarPedido,consultarEscritorioHomologacao}=
 require('../src/domain/relatorio-homologacao-checkout-staging');
const {ProjecaoFilasCandidatoSandbox}=require('../src/domain/projecao-filas-candidato-sandbox');
// Fixture de leitura com a superficie dos livros, inclusive duplicatas legadas
// impossiveis nas tabelas novas. Nenhum registro e enviado para PSP ou producao.
function schema(b){b.exec(`
 CREATE TABLE akitemm_checkout_prepedidos_staging(
  prepedido_id TEXT PRIMARY KEY,titular_id TEXT,total_centavos INTEGER,criado_em TEXT);
 CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(
  prepedido_id TEXT PRIMARY KEY,titular_id TEXT,estado TEXT,pagamento_id TEXT);
 CREATE TABLE akitemm_prepedido_webhook_inbox_staging(
  evento_id TEXT PRIMARY KEY,prepedido_id TEXT,pagamento_id TEXT,tipo TEXT);
 CREATE TABLE akitemm_prepedido_webhook_reconsulta_staging(
  evento_id TEXT PRIMARY KEY,estado TEXT,codigo TEXT);
 CREATE TABLE akitemm_prepedido_asaas_consultas_staging(
  id INTEGER PRIMARY KEY,prepedido_id TEXT,pagamento_id TEXT,status_asaas TEXT,consultado_em TEXT);
 CREATE TABLE akitemm_prepedido_posicoes_pendentes_sandbox_staging(
  id TEXT PRIMARY KEY,prepedido_id TEXT,titular_id TEXT,criado_em TEXT);`);}
function seed(b,n,titular='titular_laboratorio'){
 const id='hom-00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 const pay='pay_LABORATORIO'+n,evt='evt_LABORATORIO'+n;
 const data='2026-11-04T00:00:'+String(n%60).padStart(2,'0')+'.000Z';
 b.prepare('INSERT INTO akitemm_checkout_prepedidos_staging VALUES(?,?,25000,?)').run(id,titular,data);
 b.prepare('INSERT INTO akitemm_prepedido_asaas_sandbox_staging VALUES(?,?,?,?)')
  .run(id,titular,'RECEBIMENTO_INFORMADO_SANDBOX',pay);
 b.prepare('INSERT INTO akitemm_prepedido_webhook_inbox_staging VALUES(?,?,?,?)')
  .run(evt,id,pay,'PAYMENT_RECEIVED');
 b.prepare('INSERT INTO akitemm_prepedido_webhook_reconsulta_staging VALUES(?,?,?)')
  .run(evt,'CONCLUIDO','PSP_RECONSULTADO');
 b.prepare('INSERT INTO akitemm_prepedido_asaas_consultas_staging(prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,?)')
  .run(id,pay,'RECEIVED',data);
 b.prepare('INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging VALUES(?,?,?,?)')
  .run('pos-'+n,id,titular,data);
 return {id,pay,evt,titular};
}
test('historico paginado cruza 1000, fixa fronteira de insercao e reavalia PSP sem escrever',()=>{
 const b=new DatabaseSync(':memory:');schema(b);
 try{
  const xs=Array.from({length:1003},(_,i)=>seed(b,i+1));
  const fonte=new ProjecaoFilasCandidatoSandbox({banco:b,
   posicoes:{banco:b,consultar:()=>({estado:'PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX'})},
   sinalizacao:{db:b,consultarFotografiaPrepedido:()=>({totalCentavos:25000,podeSimularFilaBAzul:true})}});
  const inicial=fonte.consultarPagina();
  assert.equal(inicial.itens.length,25);assert.equal(inicial.haMais,true);
  seed(b,1004);
  b.prepare("UPDATE akitemm_prepedido_asaas_consultas_staging SET status_asaas='REFUNDED' WHERE prepedido_id=?").run(xs[25].id);
  const antes=b.prepare('SELECT total_changes() n').get().n;
  b.exec('PRAGMA query_only=ON');
  let pagina=inicial,ids=[];
  do{
   ids.push(...pagina.itens.map(x=>x.id));
   assert.ok(pagina.itens.length<=25);
   assert.equal(pagina.posicoesReaisCriadas,0);assert.equal(pagina.consultaPSPExecutada,false);
   if(!pagina.haMais)break;
   pagina=fonte.consultarPagina({cursor:pagina.proximoCursor});
   if(ids.length===25)assert.equal(pagina.itens[0].estado,'EXIGE_REVISAO_PSP');
  }while(true);
  assert.equal(ids.length,1003);assert.equal(new Set(ids).size,1003);
  assert.equal(ids.includes('pos-1004'),false);
  assert.equal(pagina.proximoCursor,null);
  assert.deepEqual(fonte.consultarPagina().itens.map(x=>x.id),inicial.itens.map(x=>x.id));
  assert.equal(b.prepare('SELECT total_changes() n').get().n,antes);
  for(const cursor of ['',[],{},'***',Buffer.from('{"apos":-1,"ate":2}').toString('base64url')])
   assert.throws(()=>fonte.consultarPagina({cursor}),/CURSOR_POSICOES_INVALIDO/);
 }finally{b.close();}
});
test('resumo global coincide com o diagnostico individual fora da amostra e apos reabrir SQLite',t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-resumo-psp-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'ensaio.sqlite');let b=new DatabaseSync(arquivo);schema(b);
 const xs=Array.from({length:45},(_,i)=>seed(b,i+1));
 const consulta=b.prepare(`INSERT INTO akitemm_prepedido_asaas_consultas_staging
  (prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,'2020-01-01')`);
 // A ordem autoritativa e o ID do registro; data do PSP nao reabilita passado.
 for(const [i,status] of [[0,'PENDING'],[1,'FUTURE_STATUS'],[2,'REFUNDED']])
  consulta.run(xs[i].id,xs[i].pay,status);
 b.prepare('DELETE FROM akitemm_prepedido_asaas_consultas_staging WHERE prepedido_id=?').run(xs[3].id);
 const novo=b.prepare('INSERT INTO akitemm_prepedido_webhook_inbox_staging VALUES(?,?,?,?)');
 const job=b.prepare('INSERT INTO akitemm_prepedido_webhook_reconsulta_staging VALUES(?,?,?)');
 novo.run('evt_DUPLICADO_LAB',xs[4].id,xs[4].pay,'PAYMENT_RECEIVED');
 job.run('evt_DUPLICADO_LAB','CONCLUIDO','PSP_RECONSULTADO');
 novo.run('evt_REVISAO_LAB',xs[5].id,xs[5].pay,'PAYMENT_CREATED');
 job.run('evt_REVISAO_LAB','EXIGE_REVISAO','REVISAR');
 b.prepare('UPDATE akitemm_prepedido_asaas_sandbox_staging SET estado=? WHERE prepedido_id=?')
  .run('REVERSAO_INFORMADA_SANDBOX',xs[6].id);
 b.prepare('UPDATE akitemm_prepedido_asaas_sandbox_staging SET titular_id=? WHERE prepedido_id=?')
  .run('titular_outro',xs[7].id);
 b.prepare('INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging VALUES(?,?,?,?)')
  .run('pos-duplicada',xs[8].id,xs[8].titular,'2026-11-04');
 b.prepare('DELETE FROM akitemm_prepedido_webhook_reconsulta_staging WHERE evento_id=?').run(xs[9].evt);
 // Reconsulta de outro pagamento nao interfere no pagamento corretamente ligado.
 consulta.run(xs[10].id,'pay_OUTRO_PAGAMENTO','PENDING');
 function conferir(){
  const antes=b.prepare('SELECT total_changes() n').get().n;
  const individuais=xs.map(x=>consultarPedido({banco:b,prepedidoId:x.id}));
  const esperados=individuais.filter(x=>x.conferenciaPSPConcluida&&!x.exigeRevisaoManual).length;
  assert.equal(esperados,35);
  const resumo=consultarEscritorioHomologacao({banco:b,limite:1});
  assert.equal(resumo.pedidos.length,1);assert.equal(resumo.paginacaoNecessaria,true);
  assert.equal(resumo.resumo.recebimentosPSPConciliados,esperados);
  assert.equal(resumo.resumo.posicoesPendentesSimuladas,46,'nao apagar historico');
  assert.equal(resumo.resumo.posicoesReais,0);assert.equal(resumo.resumo.saquesReais,0);
  assert.equal(resumo.consultaPSPExecutadaNestaLeitura,false);
  assert.equal(b.prepare('SELECT total_changes() n').get().n,antes);
 }
 try{conferir();b.close();b=new DatabaseSync(arquivo,{readOnly:true});conferir();}
 finally{b.close();}
});
test('limite hipotetico de dez continua individual sem consumir vagas com pagamentos em revisao',()=>{
 const b=new DatabaseSync(':memory:');schema(b);
 try{
  const meus=Array.from({length:12},(_,i)=>seed(b,i+1,'titular_cliente_01'));
  for(let i=13;i<=30;i++)seed(b,i,'titular_cliente_02');
  b.prepare('INSERT INTO akitemm_prepedido_asaas_consultas_staging(prepedido_id,pagamento_id,status_asaas,consultado_em) VALUES(?,?,?,?)')
   .run(meus[0].id,meus[0].pay,'PENDING','2026-11-04');
  const idsLidos=[];
  const fonte=new ProjecaoFilasCandidatoSandbox({banco:b,
   posicoes:{banco:b,consultar:({titularId,prepedidoId})=>{
    idsLidos.push(titularId);return {estado:'PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX'};
   }},
   sinalizacao:{db:b,consultarFotografiaPrepedido:()=>({totalCentavos:25000,podeSimularFilaBAzul:true})}
  });
  b.exec('PRAGMA query_only=ON');
  const a=fonte.consultar({titularId:'titular_cliente_01'});
  assert.equal(a.meusPendentesHistoricos,12);assert.equal(a.meusSimuladosNaFilaB,10);
  assert.equal(a.pendencias.filter(x=>x.estado==='EXIGE_REVISAO_PSP').length,1);
  assert.equal(a.pendencias.filter(x=>x.estado==='ACIMA_DEZ_APENAS_PARA_PLANEJAMENTO').length,1);
  assert.ok(idsLidos.every(x=>x==='titular_cliente_01'));
  assert.equal(a.escopoOrdemHipotetica,'SOMENTE_TITULAR_NAO_E_ORDEM_GLOBAL');
  assert.equal(JSON.stringify(a).includes('titular_cliente_02'),false);
  assert.equal(a.posicoesReaisCriadas,0);assert.equal(a.filaRealAlterada,false);
 }finally{b.close();}
});
