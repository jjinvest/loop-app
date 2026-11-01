'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const AUTH={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
const ENDPOINT='/api/admin/escritorio-demo/marco-zero';
const {consultarMarcoZeroLab}=
 require('../src/domain/marco-zero-gate-sqlite-lab');

test('Gate Marco Zero nega autorizacao mesmo quando SQLite esta integro',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const antes=banco.prepare('SELECT total_changes() AS n').get().n;
  const d=consultarMarcoZeroLab({banco});
  assert.equal(d.modo,'MARCO_ZERO_GATE_SQLITE_LAB');
  assert.equal(d.estado,'NAO_LIBERADO_PARA_DIVULGACAO');
  assert.equal(d.marcoZeroLiberado,false);
  assert.equal(d.aptoParaReceberClientesReais,false);
  assert.equal(d.aptoParaPagamentosReais,false);
  assert.equal(d.homologacaoRemotaAsaasComprovada,false);
  assert.equal(d.conciliacaoBancariaComprovada,false);
  assert.equal(d.parecerJuridicoComprovado,false);
  assert.equal(d.percentualAutomatico,null);
  assert.equal(d.somenteLeitura,true);
  assert.equal(d.tecnicos.find(x=>x.id==='INTEGRIDADE_SQLITE').estado,'OK_LABORATORIO');
  assert.equal(d.tecnicos.find(x=>x.id==='FONTES_SQLITE').estado,'FONTE_AUSENTE');
  assert.equal(d.resumo.bloqueiosExternosNaoComprovados,6);
  assert.ok(d.externos.every(x=>x.estado==='NAO_COMPROVADO_NESTA_FONTE'));
  assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,antes);
 }finally{banco.close();}
});

test('API exige administrador, recusa filtros, nao escreve e nao libera divulgacao',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const url=m.base+ENDPOINT;
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url+'?liberar=1',{headers:AUTH})).status,400);
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const response=await fetch(url,{headers:AUTH});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const d=await response.json();
 assert.equal(d.marcoZeroLiberado,false);
 assert.equal(d.tecnicos.find(x=>x.id==='INTEGRIDADE_SQLITE').estado,'OK_LABORATORIO');
 assert.equal(d.tecnicos.find(x=>x.id==='FONTES_SQLITE').estado,'OK_LABORATORIO');
 assert.equal(d.resumo.alertasLocaisPorCriterio,0);
 assert.equal(d.externos.length,6);
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Gate identifica anomalia de pagamento e nunca muda posicoes ou caixa',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const nome='Cliente Marco Zero',senha='senha-ficticia-gate-marco';
 m.contas.cadastrar({nome,email:'marco-zero@example.invalid',senha});
 const {cookie}=await m.http('/entrar',{body:{nome,senha}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 m.banco.prepare("UPDATE akitemm_sandbox_cobrancas SET status='STATUS_DESCONHECIDO_SANDBOX' WHERE pedido_id=?")
  .run(pedido);
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await fetch(m.base+ENDPOINT,{headers:AUTH});
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.resumo.alertasLocaisPorCriterio,1);
 assert.equal(d.tecnicos.find(x=>x.id==='COBRANCAS_SANDBOX').estado,'ALERTA');
 assert.equal(d.marcoZeroLiberado,false);
 assert.equal(d.aptoParaReceberClientesReais,false);
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(m.ponte._restaurar().giros,0);
});

test('Escritorio mostra checklist autenticado e sem controles de promocao automatica',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const html=await(await fetch(m.base+'/admin/loop03')).text();
 const js=await(await fetch(m.base+'/admin/loop03.js')).text();
 for(const id of ['marcoZeroAdmin','marcoZeroEstadoAdmin','marcoZeroExternosAdmin',
  'marcoZeroAlertasAdmin','marcoZeroTecnicosAdmin','marcoZeroGatesExternosAdmin',
  'marcoZeroStatusAdmin'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('href="#marcoZeroAdmin"'));
 assert.match(js,/async function carregarMarcoZero/);
 assert.match(js,/await carregarMarcoZero\(\)/);
 assert.match(js,/marcoZeroLiberado!==false/);
 assert.match(js,/percentualAutomatico!==null/);
 assert.match(html,/NÃO LIBERADO/);
});
