'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {provarRestauracaoSqliteUnificadoLab:provar}=
 require('../scripts/provar-restauracao-sqlite-unificado-lab');
function fixture(t){
 const volume=fs.mkdtempSync(path.join(os.tmpdir(),'loop-restaurar-unificado-'));
 const arquivo=path.join(volume,'escritorio.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 const catalogo=catalogoFicticioCheckout();
 const app=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogo,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'OperadorEnsaioRecuperacao_'+('X'.repeat(42)),
  termosVersao:'LAB-recuperacao-2026',
  termosTexto:'Termos ficticios para verificar recuperacao isolada do SQLITE, sem direito financeiro.'
 });
 t.after(()=>{try{banco.close();}catch{}
  fs.rmSync(volume,{recursive:true,force:true});});
 return {volume,arquivo,banco,app,catalogo};
}
async function prepararPedido({app,catalogo},nick){
 const titular=await app.contas.cadastrar({
  nome:nick+' Silva',nick,email:nick.toLowerCase()+'@example.invalid',
  senha:'SenhaFicticiaTesteRecuperacao2026!',
  aceiteExplicito:true,
  termosVersao:'LAB-recuperacao-2026',
  termosTexto:'Termos ficticios para verificar recuperacao isolada do SQLITE, sem direito financeiro.'
 });
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const r=app.intencoes.criar({
  titularId:titular.titularId,entrada,cotacao,
  chaveIdempotencia:'teste-recuperacao-'+nick.toLowerCase()+'-2026'
 });
 const pre=await app.prePedidos.preparar({
  titularId:titular.titularId,rascunhoId:r.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 return {titularId:titular.titularId,prepedidoId:pre.prepedido.prepedidoId};
}
test('prova de recuperacao do SQLite completo e unica fonte preserva pedidos, PSP, lotes e aceites',async t=>{
 const f=fixture(t);
 const a=await prepararPedido(f,'Alice');
 await prepararPedido(f,'Bruna');
 f.app.ponte.preparar({
  titularId:a.titularId,prepedidoId:a.prepedidoId,
  clienteAsaasId:'cus_RecuperacaoSandboxFicticio2026'
 });
 f.banco.prepare([
  'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
  '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
 ].join(' ')).run(a.prepedidoId,1,a.titularId,7);
 f.banco.prepare([
  'INSERT INTO akitemm_motor_ensaio_aceites_posicao',
  '(numero_posicao,prepedido_id,titular_id,cpf_hmac,versao_termos,hash_termos,criado_em)',
  'VALUES(?,?,?,?,?,?,?)'
 ].join(' ')).run(7,a.prepedidoId,a.titularId,
  'hmac-ficticio','LAB-recuperacao-2026','hash-termos-ficticio',new Date().toISOString());
 const antes=f.banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await provar({
  arquivo:f.arquivo,volume:f.volume,
  autorizado:true,dirTemporario:f.volume
 });
 assert.equal(r.estado,'RECUPERACAO_ISOLADA_SQLITE_INTEGRA');
 assert.equal(r.totaisSemDadosPessoais.titulares,2);
 assert.equal(r.totaisSemDadosPessoais.pedidos,2);
 assert.equal(r.totaisSemDadosPessoais.cobrancasSandbox,1);
 assert.equal(r.totaisSemDadosPessoais.lotes,1);
 assert.equal(r.totaisSemDadosPessoais.aceitesIndividuais,1);
 assert.equal(r.originalNaoAlterado,true);
 assert.equal(r.restauracaoIsoladaConfirmada,true);
 assert.equal(r.copiaOffsiteConfirmada,false);
 assert.equal(r.agendamentoAutomaticoConfirmado,false);
 assert.equal(r.marcoZeroAprovado,false);
 assert.equal(r.sha256Snapshot.length,64);
 assert.equal(f.banco.prepare('SELECT total_changes() AS n').get().n,antes,
  'snapshot e restauracao nao alteram banco vivo');
 assert.deepEqual(fs.readdirSync(f.volume).filter(x=>x.startsWith('akitemm-restauracao-')),[]);
 assert.deepEqual(f.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(f.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('aceite ou lote sem pedido valido rejeita o snapshot inteiro',async t=>{
 const f=fixture(t);
 const a=await prepararPedido(f,'Alice');
 f.banco.prepare([
  'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
  '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
 ].join(' ')).run('hom-00000000-0000-4000-8000-000000000000',
  1,a.titularId,42);
 await assert.rejects(provar({
  arquivo:f.arquivo,volume:f.volume,
  autorizado:true,dirTemporario:f.volume
 }),/SQLITE_VINCULOS_SEMANTICOS_DIVERGENTES/);
 assert.deepEqual(fs.readdirSync(f.volume).filter(x=>x.startsWith('akitemm-restauracao-')),[]);
});
test('recusa operar sem autorizacao, fora do volume ou via symlink',async t=>{
 const f=fixture(t);
 const link=path.join(f.volume,'link.sqlite');
 fs.symlinkSync(f.arquivo,link);
 await assert.rejects(provar({arquivo:f.arquivo,volume:f.volume}),
  /ENSAIO_RECUPERACAO_NAO_AUTORIZADO/);
 await assert.rejects(provar({
  arquivo:link,volume:f.volume,autorizado:true
 }),/ORIGEM_RECUPERACAO_INSEGURA/);
 const outro=fs.mkdtempSync(path.join(os.tmpdir(),'loop-outro-volume-'));
 t.after(()=>fs.rmSync(outro,{recursive:true,force:true}));
 await assert.rejects(provar({
  arquivo:f.arquivo,volume:outro,autorizado:true
 }),/ORIGEM_FORA_VOLUME/);
});
