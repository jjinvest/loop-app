'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CaixaAvisosAsaasSandboxSQLite}=require('../src/domain/caixa-avisos-asaas-sandbox-sqlite');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('../src/domain/cobrancas-akitemm-asaas-sandbox-v6');
const {ConferidorAvisosAsaasSandboxSQLite}=require('../src/domain/conferidor-avisos-asaas-sandbox-sqlite');
const TOKEN='token-sandbox-jornada-reconciliacao-2026-nao-real';
function cenario(t){
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 banco.exec('CREATE TABLE admin_pdf_demo_pedidos (pedido_id TEXT PRIMARY KEY,preco_centavos INTEGER);');
 banco.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER);');
 banco.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('pedido-sandbox-conferir',25000);
 const consultas=[],estado={tipo:'PENDING',ref:'LOOPLAB-pedido-sandbox-conferir',
  valor:25000,id:'pay_SandboxExclusivo012'};
 let fail=false;
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   return {pagamentoId:estado.id,valorCentavos,ambiente:'ASAAS_SANDBOX_EXCLUSIVO'};
  },
  async consultarCobranca(id){
   consultas.push(id);
   if(fail){fail=false;throw Error('timeout sandbox ficticio');}
   return {pagamentoId:estado.id,status:estado.tipo,
    valorCentavos:estado.valor,externalReference:estado.ref,billingType:'PIX'};
  }
 };
 const cobrancas=new CobrancasAkitemmAsaasSandboxSQLite({banco,provedor});
 const caixaAvisos=new CaixaAvisosAsaasSandboxSQLite({banco,authToken:TOKEN});
 const conferidor=new ConferidorAvisosAsaasSandboxSQLite({banco,caixaAvisos,cobrancas});
 const criar=()=>cobrancas.criar({
  pedidoId:'pedido-sandbox-conferir',origem:'CARRINHO',clienteAsaasId:'cus_TesteAsaas1234'
 });
 const enviar=({id='evt_reconciliacao001',ref=estado.ref,pagamentoId=estado.id,
  value=250,tipo='PAYMENT_RECEIVED'}={})=>caixaAvisos.registrar({
  cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(JSON.stringify({id,event:tipo,payment:{
   id:pagamentoId,externalReference:ref,value,billingType:'PIX',status:'RECEIVED'
  }}))
 });
 return {banco,criar,enviar,conferidor,cobrancas,consultas,estado,
  timeout:()=>{fail=true;}};
}
function seguro(r){
 for(const key of ['liquidezRealComprovada','autorizarPosicao',
  'autorizarSaque','alterarCatraca'])assert.equal(r[key],false,key);
}
test('Asaas: aviso valido exige reconsulta da cobranca certa sem criar saldo',async t=>{
 const s=cenario(t);await s.criar();s.enviar();
 s.estado.tipo='RECEIVED';
 const r=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(r.resultado,'CONFERIDO_SANDBOX');
 assert.equal(r.statusLocal,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.deepEqual(s.consultas,[s.estado.id]);
 seguro(r);
 assert.equal(s.banco.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='admin_ponte_compras_demo'").get().n,0);
});
test('Asaas: mesmo aviso repetido nao faz segunda reconsulta ou segundo lancamento',async t=>{
 const s=cenario(t);await s.criar();s.enviar();
 const a=await s.conferidor.conferirEvento('evt_reconciliacao001');
 const b=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(a.duplicado,false);assert.equal(b.duplicado,true);
 assert.equal(s.consultas.length,1);
 assert.equal(s.conferidor.listarConferencias().length,1);seguro(b);
});
test('Asaas: fraude de valor bloqueia reconsulta e cria pendencia auditavel',async t=>{
 const s=cenario(t);await s.criar();s.enviar({value:300});
 const r=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(r.resultado,'EXIGE_REVISAO');
 assert.equal(r.codigo,'VINCULO_OU_VALOR_DIVERGENTE');
 assert.deepEqual(s.consultas,[]);seguro(r);
 assert.equal(s.cobrancas.consultar('pedido-sandbox-conferir').status,'PENDENTE_SANDBOX');
});
test('Asaas: fraude de ID bloqueia reconsulta e persiste conflito',async t=>{
 const s=cenario(t);await s.criar();
 s.enviar({pagamentoId:'pay_IDDiferente007'});
 const r=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(r.codigo,'VINCULO_OU_VALOR_DIVERGENTE');
 assert.equal(s.consultas.length,0);seguro(r);
});
test('Asaas: pedido inexistente sinalizado vira pendencia sem movimentar valores',async t=>{
 const s=cenario(t);s.enviar({ref:'LOOPLAB-pedido-sem-compra'});
 const r=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(r.codigo,'SEM_COBRANCA_LOCAL');
 assert.equal(r.resultado,'EXIGE_REVISAO');seguro(r);
 assert.deepEqual(s.consultas,[]);
});
test('Asaas: timeout da reconsulta nao grava confirmacao e permite retentativa',async t=>{
 const s=cenario(t);await s.criar();s.enviar();s.timeout();
 await assert.rejects(()=>s.conferidor.conferirEvento('evt_reconciliacao001'));
 assert.equal(s.conferidor.listarConferencias().length,0);
 const r=await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.equal(r.resultado,'CONFERIDO_SANDBOX');seguro(r);
});
test('Asaas: nao processar evento ainda nao validado pela caixa de avisos',async t=>{
 const s=cenario(t);await s.criar();
 await assert.rejects(()=>s.conferidor.conferirEvento('evt_nao_existe777'),
  {codigo:'AVISO_NAO_ENCONTRADO'});
 assert.deepEqual(s.consultas,[]);
});
test('Asaas: estorno tardio prevalece e evento previo nao regride estado',async t=>{
 const s=cenario(t);await s.criar();s.enviar();
 s.estado.tipo='RECEIVED';
 await s.conferidor.conferirEvento('evt_reconciliacao001');
 s.enviar({id:'evt_reconciliacao002',tipo:'PAYMENT_REFUNDED'});
 s.estado.tipo='REFUNDED';
 const r=await s.conferidor.conferirEvento('evt_reconciliacao002');
 assert.equal(r.statusLocal,'REVERSAO_INFORMADA_SANDBOX');
 s.enviar({id:'evt_reconciliacao003',tipo:'PAYMENT_RECEIVED'});
 s.estado.tipo='PENDING';
 const r3=await s.conferidor.conferirEvento('evt_reconciliacao003');
 assert.equal(r3.statusLocal,'REVERSAO_INFORMADA_SANDBOX');
 assert.equal(s.cobrancas.consultar('pedido-sandbox-conferir').creditoFilaCriado,0);
 assert.equal(s.conferidor.listarConferencias().length,3);
 seguro(r3);
});
test('Asaas: trilha de conferencias nao permite edicao ou exclusao',async t=>{
 const s=cenario(t);await s.criar();s.enviar();
 await s.conferidor.conferirEvento('evt_reconciliacao001');
 assert.throws(()=>s.banco.prepare(
  "UPDATE akitemm_asaas_sandbox_conciliacoes SET resultado='APROVADO_REAL'").run());
 assert.throws(()=>s.banco.prepare('DELETE FROM akitemm_asaas_sandbox_conciliacoes').run());
});
