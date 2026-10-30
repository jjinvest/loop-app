'use strict';
// Politica nova: taxa 0% para participantes. Bancos legados com CHECK 3%
// migram atomicamente sem reescrever ou apagar historicos antigos.
// Nenhuma despesa de PSP/banco e simulada como se fosse cobrada de verdade.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite,TAXA_SAQUE_PERCENTUAL}=
 require('../src/domain/solicitacoes-saque-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const AGORA='2036-09-20T12:00:00.000Z';
const SENHA='senha-segura-de-laboratorio-2026';
const REF='LOOP-DEMO-V1';
const ID_LEGADO='saque-11111111-2222-4333-8444-555555555555';
const ID_NOVO='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function abrir(arquivo){
 const repositorio=new RepositorioCatalogoSQLite({caminho:arquivo});
 const banco=repositorio.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>AGORA});
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,
  relogio:()=>AGORA,consultarPagamentoConfiavel:async id=>{
   const p=pedidos.buscar(id);
   return p&&{...p,status:STATUS_CONFIRMADO,confirmadoEm:AGORA};
  }
 });
 const saques=new SolicitacoesSaqueDemoSQLite({
  banco,contas,links:ponte.linksComissoes,relogio:()=>AGORA});
 return {repositorio,banco,contas,pedidos,ponte,saques,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>AGORA})};
}
async function compra(m,conta,id){
 m.pedidos.preparar({
  pedidoId:id,contaId:conta.contaId,
  produtoId:'pdf-referencia-250',valorCentavos:25000});
 return m.ponte.processar({pedidoId:id});
}
function cofre(m){
 return disponibilidadeCofreDemo(m.banco,{
  cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000});
}
function integridade(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
}
test('banco legado 3% mantém histórico, migra para novos saques 0% e resiste a reinicio',{timeout:90000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-saques-taxa-zero-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'legado.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const titular=m.contas.cadastrar({
  nome:'Titular Legado',
  email:'titular-legado@exemplo.invalid',senha:SENHA
 });
 const pos=(await compra(m,titular,'legado-titular-pdf')).posicaoId;
 m.adesoes.ativar({contaId:titular.contaId,posicaoId:pos,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:REF});
 for(let i=0;i<2;i++){
  const convidado=m.contas.cadastrar({
   nome:'Convidado Legado '+i,
   email:'convidado-legado-'+i+'@exemplo.invalid',senha:SENHA,
   codigoIndicador:titular.codigoConvite
  });
  const p=(await compra(m,convidado,'legado-indicado-'+i)).posicaoId;
  m.adesoes.ativar({contaId:convidado.contaId,posicaoId:p,
   cpfFicticio:i===0?'12345678909':'52998224725',
   aceitaTermos:true,versaoTermos:REF});
 }
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,5000);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,45000);
 assert.equal(TAXA_SAQUE_PERCENTUAL,0);
 // Reconstruir somente a tabela do laboratorio com o CHECK exato da politica
 // anterior; os demais livros de 2 comissoes permanecem no mesmo SQLite.
 const tabela='admin_solicitacoes_saque_demo';
 const ddl=m.banco.prepare("SELECT sql FROM sqlite_master WHERE name=? AND type='table'").get(tabela).sql;
 assert.match(ddl,/CHECK\(taxa_percentual IN \(0,3\)\)/);
 m.banco.exec('DROP TABLE '+tabela);
 m.banco.exec(ddl.replace('CHECK(taxa_percentual IN (0,3))','CHECK(taxa_percentual=3)')
  .replace('CHECK(taxa_percentual<>0 OR taxa_centavos=0),',''));
 m.banco.prepare('INSERT INTO '+tabela+
  '(solicitacao_id,conta_id,tipo,valor_bruto_centavos,taxa_percentual,'+
  'taxa_centavos,valor_liquido_centavos,cofre_origem,registrado_em)'+
  ' VALUES(?,?,?,?,?,?,?,?,?)').run(
   ID_LEGADO,titular.contaId,'BONUS',2500,3,75,2425,'LOOP_DIREITA',AGORA);
 const antigo=m.banco.prepare('SELECT * FROM '+tabela+' WHERE solicitacao_id=?').get(ID_LEGADO);
 assert.equal(antigo.taxa_percentual,3);
 assert.equal(antigo.taxa_centavos,75);
 m.repositorio.fechar();
 // A nova inicializacao realiza a migracao SQLite uma vez, sob lock.
 m=abrir(arquivo);
 integridade(m);
 assert.deepEqual(m.banco.prepare('SELECT * FROM '+tabela+' WHERE solicitacao_id=?')
  .get(ID_LEGADO),antigo,'Lançamento de 3% não pode ser reescrito');
 assert.equal(m.saques.consultar(titular.contaId).taxaPercentual,0);
 const saque=m.saques.registrar({contaId:titular.contaId,solicitacaoId:ID_NOVO,
  tipo:'BONUS',valorSolicitadoCentavos:2500});
 assert.equal(saque.taxaPercentual,0);
 assert.equal(saque.taxaSaqueCentavos,0);
 assert.equal(saque.valorLiquidoCentavos,2500);
 assert.equal(m.saques.registrar({contaId:titular.contaId,solicitacaoId:ID_NOVO,
  tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,true);
 const historico=m.saques.consultar(titular.contaId).historico;
 assert.equal(historico.length,2);
 assert.deepEqual(new Set(historico.map(s=>s.taxaPercentual)),new Set([0,3]));
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,0);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,45000,
  'Taxa bancária eventual não reduz o bônus nem subtrai de novo reserva');
 assert.throws(()=>m.banco.prepare('UPDATE '+tabela+
  ' SET taxa_percentual=0 WHERE solicitacao_id=?').run(ID_LEGADO),
  /solicitacao de teste imutavel/);
 assert.throws(()=>m.banco.prepare('DELETE FROM '+tabela+
  ' WHERE solicitacao_id=?').run(ID_LEGADO),
  /solicitacao de teste imutavel/);
 assert.throws(()=>m.banco.prepare('INSERT INTO '+tabela+
  '(solicitacao_id,conta_id,tipo,valor_bruto_centavos,taxa_percentual,'+
  'taxa_centavos,valor_liquido_centavos,cofre_origem,registrado_em)'+
  ' VALUES(?,?,?,?,?,?,?,?,?)').run(
   'saque-bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',titular.contaId,
   'BONUS',2500,0,75,2425,'LOOP_DIREITA',AGORA));
 integridade(m);
 m.repositorio.fechar();
 m=abrir(arquivo);
 integridade(m);
 assert.equal(m.saques.consultar(titular.contaId).historico.length,2);
 assert.deepEqual(m.banco.prepare('SELECT * FROM '+tabela+' WHERE solicitacao_id=?')
  .get(ID_LEGADO),antigo);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,45000);
 console.log('LOOP_TAXA_ZERO_MIGRACAO='+JSON.stringify({
  taxaAtualPercentual:0,
  registroHistoricoTaxa3Preservado:true,
  solicitacaoNovaCentavos:2500,taxaNovaCentavos:0,liquidoNovoCentavos:2500,
  totalSolicitacoes:2,bonusReservadoCentavos:5000,
  reservaLivreCentavos:45000,integridade:'ok',transferenciaReal:false
 }));
});
