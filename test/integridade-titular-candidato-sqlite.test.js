'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {IntegridadeTitularCandidatoSQLite}=
 require('../src/domain/integridade-titular-candidato-sqlite');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const TERMOS='Aceite apenas de laboratório fictício, sem pagamento, entrega, retorno ou posição real.';
test('triggers SQLite rejeitam titular diferente por SQL direto em rascunho, pedido e cobrança',async()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const catalogo=catalogoFicticioCheckout();
 const {contas,intencoes,prePedidos,ponte,integridade}=
  criarAppLojaEscritorioCandidato({
   banco,repositorioCatalogo:catalogo,chaveEmail:randomBytes(32),
   chaveCifra:randomBytes(32),segredoOperador:'escritorio-integridade-'+('Z'.repeat(45)),
   termosVersao:'LAB-integridade-2026',termosTexto:TERMOS
  });
 const alice=await contas.cadastrar({nome:'Alice Exemplo',nick:'Alice',
  email:'alice-integridade@example.invalid',senha:'SenhaFicticiaMuitoForte2026!',
  aceiteExplicito:true,termosVersao:'LAB-integridade-2026',termosTexto:TERMOS});
 const bob=await contas.cadastrar({nome:'Bia Exemplo',nick:'Bia',
  email:'bia-integridade@example.invalid',senha:'SenhaFicticiaMuitoForte2026!',
  aceiteExplicito:true,termosVersao:'LAB-integridade-2026',termosTexto:TERMOS});
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const novoRascunho=()=>{
  return banco.prepare([
   'INSERT INTO akitemm_checkout_intencoes_preparacao',
   '(pedido_id,titular_id,chave_hash,itens_canonicos_json,',
   'cotacao_json,total_centavos,estado,criado_em)',
   "VALUES(?,?,?,?,?,25000,'RASCUNHO_SEM_COBRANCA',?)"
  ].join(' '));
 };
 assert.throws(()=>novoRascunho().run(
  'pre-'+randomUUID(),'titular-'+randomUUID(),
  'f'.repeat(64),JSON.stringify(entrada.itens),
  JSON.stringify(cotacao),new Date().toISOString()
 ),/TITULAR_CANDIDATO_INEXISTENTE/);
 const x=intencoes.criar({
  titularId:alice.titularId,chaveIdempotencia:'integridade-sql-1',
  entrada,cotacao
 });
 const rascunhoId=x.intencao.pedidoId;
 const falsoPre=banco.prepare([
  'INSERT INTO akitemm_checkout_prepedidos_staging',
  '(prepedido_id,rascunho_id,titular_id,fotografia_json,',
  'total_centavos,estado,criado_em)',
  "VALUES(?,?,?,?,25000,'AGUARDANDO_HOMOLOGACAO_EXTERNA',?)"
 ].join(' '));
 assert.throws(()=>falsoPre.run(
  'hom-'+randomUUID(),rascunhoId,bob.titularId,
  JSON.stringify(cotacao.itens),new Date().toISOString()
 ),/TITULAR_OU_VALOR_PREPEDIDO_DIVERGENTE/);
 const pedido=await prePedidos.preparar({
  titularId:alice.titularId,rascunhoId,
  repositorioCatalogo:catalogo
 });
 const prepedidoId=pedido.prepedido.prepedidoId;
 const original=banco.prepare([
  'INSERT INTO akitemm_prepedido_asaas_sandbox_staging',
  '(prepedido_id,titular_id,cliente_asaas_id,valor_centavos,',
  'external_ref,pagamento_id,estado,criado_em,atualizado_em)',
  "VALUES(?,?,?,?,?,NULL,'PREPARADA',?,?)"
 ].join(' '));
 assert.throws(()=>original.run(
  prepedidoId,bob.titularId,'cus_LABINTEGRIDADE01',25000,
  'LOOPLAB-'+prepedidoId,new Date().toISOString(),new Date().toISOString()
 ),/COBRANCA_TITULAR_OU_VALOR_DIVERGENTE/);
 assert.throws(()=>original.run(
  prepedidoId,alice.titularId,'cus_LABINTEGRIDADE01',10000,
  'LOOPLAB-'+prepedidoId,new Date().toISOString(),new Date().toISOString()
 ),/COBRANCA_TITULAR_OU_VALOR_DIVERGENTE/);
 ponte.preparar({titularId:alice.titularId,prepedidoId,
  clienteAsaasId:'cus_LABINTEGRIDADE01'});
 assert.throws(()=>banco.prepare([
  'UPDATE akitemm_prepedido_asaas_sandbox_staging',
  'SET titular_id=? WHERE prepedido_id=?'
 ].join(' ')).run(bob.titularId,prepedidoId),
 /COBRANCA_IDENTIDADE_IMUTAVEL/);
 const audit=integridade.auditar();
 assert.equal(audit.totalInconsistencias,0);
 assert.equal(audit.bancoCandidatoIntegro,true);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 banco.close();
});
test('auditoria impede reiniciar candidato sobre dados de titularidade corrompidos',async()=>{
 const db=new DatabaseSync(':memory:');
 const catalogo=catalogoFicticioCheckout();
 criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogo,chaveEmail:randomBytes(32),
  chaveCifra:randomBytes(32),segredoOperador:'escritorio-corrupcao-'+('Z'.repeat(48)),
  termosVersao:'LAB-integridade-2026',termosTexto:TERMOS
 });
 db.exec('DROP TRIGGER candidato_integridade_rascunho_insert');
 db.prepare([
  'INSERT INTO akitemm_checkout_intencoes_preparacao',
  '(pedido_id,titular_id,chave_hash,itens_canonicos_json,',
  'cotacao_json,total_centavos,estado,criado_em)',
  "VALUES(?,?,?,?,?,25000,'RASCUNHO_SEM_COBRANCA',?)"
 ].join(' ')).run('pre-'+randomUUID(),'titular-'+randomUUID(),
 'd'.repeat(64),'[]','{}',new Date().toISOString());
 assert.throws(()=>new IntegridadeTitularCandidatoSQLite({banco:db}),
  /INTEGRIDADE_TITULAR_CANDIDATO_DIVERGENTE/);
 db.close();
});
