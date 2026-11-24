'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {consultarCofresOperador,COFRES}=
 require('../src/producao/cofres-operador-readonly');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');
const raiz=path.resolve(__dirname,'..');
const fonte=p=>fs.readFileSync(path.join(raiz,p),'utf8');
const ts=Date.parse('2026-11-22T11:00:00-03:00');

test('sem banco autenticado, cofres existem mas valores ficam desconhecidos',async()=>{
 const d=await consultarCofresOperador({agoraMs:ts});
 assert.equal(d.estado,'AGUARDANDO_CONCILIACAO_EXTERNA');
 assert.equal(d.fonte,'SEM_ADAPTADOR_PSP_BANCO_HOMOLOGADO');
 assert.equal(d.somenteLeitura,true);
 assert.equal(d.movimentacoesHabilitadas,false);
 assert.equal(d.saquesHabilitados,false);
 assert.deepEqual(d.cofres.map(x=>x.codigo),
  ['INVESTIMENTO','CENTRAL','RESERVA']);
 assert.ok(d.cofres.every(x=>x.saldoCentavos===null));
 assert.deepEqual(COFRES.map(x=>x.nome),
  ['Investimento','Cofre Central LOOP','Reserva']);
});

test('somente valor conciliado recente e verificado pela conta externa pode aparecer',async()=>{
 const items=COFRES.map((x,i)=>({
  codigo:x.codigo,moeda:'BRL',
  tipo:'SALDO_LIQUIDADO_CONCILIADO',
  saldoCentavos:[0,25000,175000][i],
  conciliadoEm:ts-60000,comprovanteId:'proof_banco_'+i
 }));
 let provas=0;
 const adaptador={
  consultarSaldosConciliados:async()=>({cofres:items}),
  comprovarSaldo:async item=>{
   provas++;return items.includes(item);
  }
 };
 const d=await consultarCofresOperador({adaptador,agoraMs:ts});
 assert.equal(d.estado,'CONCILIADO');
 assert.equal(d.fonte,'ADAPTADOR_PSP_BANCO_AUTENTICADO');
 assert.equal(d.dinheiroRealComprovado,true);
 assert.deepEqual(d.cofres.map(x=>x.saldoCentavos),[0,25000,175000]);
 assert.equal(provas,3);
 assert.equal(d.saquesHabilitados,false,'provar saldo nao autoriza saque');
 assert.equal(d.movimentacoesHabilitadas,false);
});

test('extrato velho, sem assinatura ou parcial nao inventa saldo',async()=>{
 const foto={
  codigo:'CENTRAL',moeda:'BRL',tipo:'SALDO_LIQUIDADO_CONCILIADO',
  saldoCentavos:10000,conciliadoEm:ts-16*60000,
  comprovanteId:'prova_valida_12345678'
 };
 const adaptador={
  consultarSaldosConciliados:async()=>({cofres:[foto]}),
  comprovarSaldo:async()=>{throw Error('prova antiga nao deve ser consultada')}
 };
 const r=await consultarCofresOperador({adaptador,agoraMs:ts});
 assert.equal(r.estado,'AGUARDANDO_CONCILIACAO_EXTERNA');
 assert.equal(r.cofres[1].saldoCentavos,null);
 assert.equal(r.cofres[1].estado,'CONCILIACAO_DESATUALIZADA');
 const falso={...adaptador,consultarSaldosConciliados:async()=>({
  cofres:[{...foto,conciliadoEm:ts-3000}]
 }),comprovarSaldo:async()=>false};
 await assert.rejects(consultarCofresOperador({adaptador:falso,agoraMs:ts}),
  {codigo:'COFRES_PROVA_EXTERNA_INVALIDA'});
 const duplicado={...adaptador,consultarSaldosConciliados:async()=>({
  cofres:[{...foto,conciliadoEm:ts-3000},
   {...foto,codigo:'RESERVA',conciliadoEm:ts-3000}]
 })};
 await assert.rejects(consultarCofresOperador({adaptador:duplicado,agoraMs:ts}),
  {codigo:'COFRES_EXTRATO_INVALIDO'});
});

test('rodape exclusivo nao cria 4º cofre, nao invade cliente e usa route protegida',()=>{
 const html=renderizarInterfaceAprovada();
 for(const id of ['loop03CofreInvestimento','loop03CofreCentral',
  'loop03CofreReserva','loop03CofresOperador','loop03CofresAtualizar'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal((html.match(/class="loop03-cofre loop03-cofre-/g)||[]).length,3);
 assert.equal((html.match(/id="loop03CofresOperador"/g)||[]).length,1);
 assert.doesNotMatch(html,/class="loop03-cofre-fisico"/,
  'sem desenho ornamental: os cofres são saldos e estados reais');
 const css=fonte('src/producao/acabamento-botoes-real.css');
 assert.match(css,/body\.loop03-modo-operador \.cliente-integrado #conteudoPosicoes \.loop03-admin-section \.loop03-cofres-rodape/);
 assert.match(css,/#loop03CofresOperador\[hidden\]\{display:none!important\}/);
 const client=fonte('src/producao/interface-aprovada-contas.js');
 assert.match(client,/fetch\('\/api\/admin\/loop\/cofres'/);
 assert.match(client,/revelarCofresOperador\(false\)/);
 assert.match(client,/comercial\.after\(cofres\)/);
 assert.match(client,/ancora\.after\(cofres\)/);
 const gate=fonte('src/producao/gateway-admin-comercial.js');
 assert.match(gate,/app\.get\('\/api\/admin\/loop\/cofres',proteger/);
 assert.doesNotMatch(gate,/app\.post\('\/api\/admin\/loop\/cofres'/);
});

 test('financeiro e ficha do operador usam a mesma fonte, exclusivamente leitura',()=>{
 const gate=fonte('src/producao/gateway-admin-comercial.js');
 const office=fonte('src/producao/interface-aprovada-contas.js');
 const inicio=gate.indexOf("app.get('/api/admin/loop/distribuicao-financeira',proteger");
 const fim=gate.indexOf('// Cofres exclusivamente do operador:',inicio);
 assert.ok(inicio>=0&&fim>inicio);
 const rota=gate.slice(inicio,fim);
 assert.ok(rota.includes('FROM loop_real_fin_lancamentos'));
 assert.ok(rota.includes("titular?'WHERE titular_id=?':''"));
 assert.ok(rota.includes('total.get(titular.id)'));
 assert.ok(rota.includes('private, no-store'));
 assert.ok(rota.includes('saqueRealHabilitado:false'));
 assert.ok(rota.includes('ganhosFuturosGarantidos:false'));
 assert.doesNotMatch(rota,/\.run\(|\.exec\(|INSERT INTO|UPDATE |DELETE FROM/);
 assert.ok(office.includes('id="adminDistribuicaoFinanceira"'));
 assert.ok(office.includes('id="adminGanhosCliente"'));
 assert.ok(office.includes('nickCadastroConsultado===x.nick'));
 assert.ok(office.includes('selecionado()'));
 assert.ok(office.includes("if(id==='abaFinanceiro')void carregarDistribuicaoFinanceira()"));
 });
