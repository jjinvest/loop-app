'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CaixaAvisosAsaasSandboxSQLite}=require('../src/domain/caixa-avisos-asaas-sandbox-sqlite');
const TOKEN='asaas-token-sandbox-ficticio-seguro-2026-123456';
const dados={id:'evt_asaas_teste_001',event:'PAYMENT_RECEIVED',
 payment:{id:'pay_asaas_teste_001',billingType:'PIX',status:'RECEIVED',
  externalReference:'LOOPLAB-pedido-teste-001',value:250,
  customer:'cus_ficticio',netValue:248.35}};
const raw=x=>Buffer.from(JSON.stringify(x));
function nova(t,db=new DatabaseSync(':memory:')){
 t.after(()=>db.close());
 return {db,caixa:new CaixaAvisosAsaasSandboxSQLite({banco:db,authToken:TOKEN})};
}
test('Asaas inbox sandbox salva sinal sem dinheiro, posicao ou dados privados',t=>{
 const {caixa}=nova(t);
 const r=caixa.registrar({cabecalhoToken:TOKEN,corpoBruto:raw(dados)});
 assert.equal(r.registrado,true);assert.equal(r.repetido,false);
 for(const f of ['liquidacaoRealConfirmada','autorizacaoDePosicao',
   'autorizacaoDeSaque','pixRealHabilitado'])assert.equal(r[f],false);
 assert.equal(caixa.listar().length,1);
 assert.equal(caixa.listar()[0].valorInformadoCentavos,25000);
 assert.equal(caixa.listar()[0].customer,undefined);
});
test('Asaas inbox sandbox recusa token ausente e falsificado antes de armazenar',t=>{
 const {caixa}=nova(t);
 for(const invalido of [null,'','outro',TOKEN+'-x','Bearer '+TOKEN])
  assert.throws(()=>caixa.registrar({cabecalhoToken:invalido,corpoBruto:raw(dados)}),
   {codigo:'TOKEN_WEBHOOK_INVALIDO'});
 assert.equal(caixa.listar().length,0);
});
test('Asaas inbox sandbox deduplica replay, detecta ID conflitante e imutabilidade',t=>{
 const {db,caixa}=nova(t);
 const enviar=p=>caixa.registrar({cabecalhoToken:TOKEN,corpoBruto:raw(p)});
 assert.equal(enviar(dados).registrado,true);
 assert.equal(enviar(dados).repetido,true);
 assert.throws(()=>enviar({...dados,payment:{...dados.payment,value:250.01}}),
  {codigo:'ID_EVENTO_REUTILIZADO_COM_DADOS_DIVERGENTES'});
 assert.equal(enviar({...dados,id:'evt_asaas_teste_002',event:'PAYMENT_CONFIRMED',
  payment:{...dados.payment,status:'CONFIRMED'}}).registrado,true);
 assert.equal(caixa.listar()[0].statusInformado,'RECEIVED');
 assert.throws(()=>db.prepare("UPDATE akitemm_asaas_sandbox_avisos SET tipo='PAYMENT_CREATED'").run());
 assert.throws(()=>db.prepare('DELETE FROM akitemm_asaas_sandbox_avisos').run());
});
test('Asaas inbox sandbox rejeita corpos invalidos e nao contabiliza nada',t=>{
 const {caixa}=nova(t),send=p=>caixa.registrar({cabecalhoToken:TOKEN,corpoBruto:raw(p)});
 for(const p of [{...dados,event:'PIX_CONFIRMED'},
  {...dados,payment:{...dados.payment,billingType:'BOLETO'}},
  {...dados,payment:{...dados.payment,externalReference:'EXTERNO-123'}},
  {...dados,payment:{...dados.payment,value:'250'}},
  {...dados,payment:{...dados.payment,value:250.001}},
  {...dados,payment:{...dados.payment,value:-1}},[dados]]){
  assert.throws(()=>send(p));
 }
 assert.throws(()=>caixa.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from('{')}),
  {codigo:'CORPO_WEBHOOK_INVALIDO'});
 assert.throws(()=>caixa.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.alloc(16385)}),
  {codigo:'CORPO_WEBHOOK_INVALIDO'});
 assert.equal(caixa.listar().length,0);
});
test('Asaas inbox sandbox nao duplica evento depois de reabrir SQLite',t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'asaas-sandbox-inbox-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const file=path.join(pasta,'eventos.sqlite'),db1=new DatabaseSync(file);
 const a=new CaixaAvisosAsaasSandboxSQLite({banco:db1,authToken:TOKEN});
 assert.equal(a.registrar({cabecalhoToken:TOKEN,corpoBruto:raw(dados)}).registrado,true);
 db1.close();
 const db2=new DatabaseSync(file);t.after(()=>db2.close());
 const b=new CaixaAvisosAsaasSandboxSQLite({banco:db2,authToken:TOKEN});
 assert.equal(b.registrar({cabecalhoToken:TOKEN,corpoBruto:raw(dados)}).repetido,true);
 assert.equal(b.listar().length,1);
});