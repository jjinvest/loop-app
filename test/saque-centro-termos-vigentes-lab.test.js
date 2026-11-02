'use strict';
// Caso novo: um aceite legado de termos nao habilita reserva do centro.
// Nao executa PIX; sem repassar valores reais a qualquer conta.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {RetornoSaqueCentroV6DemoSQLite}=
 require('../src/domain/retorno-saque-centro-v6-demo-sqlite');
const {VERSAO_TERMOS_DEMO}=
 require('../src/domain/adesoes-posicoes-demo-sqlite');

function cenario(t){
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 banco.exec('CREATE TABLE admin_loop_adesoes_contas_demo('+
  'conta_id TEXT PRIMARY KEY,cpf_digest TEXT,termos_versao TEXT,aceito_em TEXT)');
 const contas={banco,buscar:id=>['titular-a','titular-b'].includes(id)?{contaId:id}:null};
 const livro={banco,extrato:()=>({totalPrevistoCentavos:75000})};
 const servico=new RetornoSaqueCentroV6DemoSQLite({banco,contas,livro,
  agora:()=> '2026-11-01T12:00:00.000Z'});
 const aceitar=(contaId,versao,aceitoEm,cpfDigest='a'.repeat(64))=>{
  banco.prepare('INSERT OR REPLACE INTO admin_loop_adesoes_contas_demo '+
   '(conta_id,cpf_digest,termos_versao,aceito_em) VALUES(?,?,?,?)')
   .run(contaId,cpfDigest,versao,aceitoEm);
 };
 const solicitar=(contaId,id,valor=2500)=>servico.solicitar({
  contaId,solicitacaoId:id,valorCentavos:valor});
 const quantidade=()=>banco.prepare(
  'SELECT COUNT(*) n FROM loop_v6_saques_centro_teste').get().n;
 return {banco,aceitar,solicitar,quantidade,servico};
}

test('aceite legado de termos nao habilita novo saque ficticio do centro',t=>{
 const s=cenario(t);
 s.aceitar('titular-a','LOOP-DEMO-V0','2026-10-20T00:00:00.000Z');
 assert.throws(()=>s.solicitar('titular-a','saque-centro-adesao-legada-0001'),
  {codigo:'CPF_E_TERMOS_OBRIGATORIOS'});
 assert.equal(s.quantidade(),0);
 assert.equal(s.servico.consultar('titular-a').disponivelParaSaqueRealCentavos,0);
 assert.equal(Object.values(s.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});

test('aceite com data ausente nao substitui confirmacao valida e idempotente',t=>{
 const s=cenario(t);
 const id='saque-centro-aceite-valido-0002';
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'');
 assert.throws(()=>s.solicitar('titular-a',id),
  {codigo:'CPF_E_TERMOS_OBRIGATORIOS'});
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'2026-10-20T00:00:00.000Z');
 const primeiro=s.solicitar('titular-a',id);
 assert.equal(primeiro.repetida,false);
 assert.equal(primeiro.status,'SOLICITADO');
 assert.equal(primeiro.transferenciaReal,false);
 assert.equal(s.solicitar('titular-a',id).repetida,true);
 assert.throws(()=>s.solicitar('titular-b',id),
  {codigo:'CONFLITO_IDEMPOTENCIA'});
 assert.equal(s.quantidade(),1);
 assert.equal(s.servico.consultar('titular-a').disponivelParaSaqueRealCentavos,0);
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('aceite apenas textual, digest falso e aceite futuro nunca habilitam saque central',t=>{
 const s=cenario(t);
 const id='saque-centro-comprovacao-invalida-0003';
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'2026-10-20T00:00:00.000Z','');
 assert.throws(()=>s.solicitar('titular-a',id),{codigo:'CPF_E_TERMOS_OBRIGATORIOS'});
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'2026-10-20T00:00:00.000Z','cpf-nao-validado');
 assert.throws(()=>s.solicitar('titular-a',id),{codigo:'CPF_E_TERMOS_OBRIGATORIOS'});
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'2026-12-01T00:00:00.000Z');
 assert.throws(()=>s.solicitar('titular-a',id),{codigo:'CPF_E_TERMOS_OBRIGATORIOS'});
 s.aceitar('titular-a',VERSAO_TERMOS_DEMO,'2026-10-20T00:00:00.000Z');
 const result=s.solicitar('titular-a',id);
 assert.equal(result.taxaPercentual,0);
 assert.equal(result.taxaSaqueCentavos,0);
 assert.equal(result.valorLiquidoSimuladoCentavos,2500);
 assert.equal(result.transferenciaReal,false);
 assert.equal(s.quantidade(),1);
});
