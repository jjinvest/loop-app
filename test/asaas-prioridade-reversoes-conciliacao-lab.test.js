'use strict';
// Reconciliacao preventiva de estornos deve continuar sob backlog de pedidos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliacaoAutomaticaAsaasSandboxLab}=require('../src/domain/conciliacao-automatica-asaas-sandbox-lab');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');

test('cota de revisoes reconsulta recebimentos antes de backlog sem estourar lote',async()=>{
 const chamados=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:4,maxRecebimentosPorVerificacao:2,
  listarRecebimentos:()=>['pedido-antigo-a','pedido-antigo-b','pedido-antigo-c'],
  conciliador:{processar:async id=>{
   chamados.push(id);
   return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
  }}
 });
 for(let i=0;i<30;i++)agenda.acompanhar('pedido-fila-'+String(i).padStart(3,'0'));
 await agenda.verificar();
 assert.deepEqual(chamados,['pedido-antigo-a','pedido-antigo-b','pedido-fila-000','pedido-fila-001']);
 assert.equal(new Set(chamados).size,4);
 assert.equal(agenda.pendentes.size,28);
});

test('recebimento tambem pendente na fila nao recebe duas consultas na rodada',async()=>{
 const chamados=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:2,maxRecebimentosPorVerificacao:1,
  listarRecebimentos:()=>['pedido-c01'],
  conciliador:{processar:async id=>{
   chamados.push(id);
   return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
  }}
 });
 agenda.acompanhar('pedido-c01');agenda.acompanhar('pedido-p02');
 await agenda.verificar();
 assert.deepEqual(chamados,['pedido-c01','pedido-p02']);
 assert.equal(agenda.pendentes.size,0);
});

test('falha da listagem prioritária preserva reconsulta normal e mascara excecao',async()=>{
 const chamados=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:2,
  listarRecebimentos:()=>{throw Error('SEGREDO_PRIVADO');},
  aoErro:()=>{throw Error('SEGREDO_OBSERVADOR');},
  conciliador:{processar:async id=>{
   chamados.push(id);
   return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
  }}
 });
 agenda.acompanhar('pedido-n01');
 await agenda.verificar();
 assert.deepEqual(chamados,['pedido-n01']);
 assert.equal(agenda.falhasAgendador,1);
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('SEGREDO'),false);
});

test('rejeita cota de reversoes invalida ou fonte nao-funcao',()=>{
 for(const cota of [0,6,-1,1.2,'2']){
  assert.throws(()=>new ConciliacaoAutomaticaAsaasSandboxLab({
   conciliador:{processar:async()=>({})},
   maxPorVerificacao:5,maxRecebimentosPorVerificacao:cota
  }),{name:'RangeError'});
 }
 assert.throws(()=>new ConciliacaoAutomaticaAsaasSandboxLab({
  conciliador:{processar:async()=>({})},listarRecebimentos:[]
 }),{name:'TypeError'});
});

test('HTTP/SQLite: estorno de compra integrada é visto apesar de grande fila pendente',async t=>{
 const m=await abrirLaboratorio(':memory:');
 t.after(()=>m.fechar());
 const titular=m.contas.cadastrar({
  nome:'Titular Reversao Posterior',email:'reversao-prioridade@example.invalid',
  senha:'senha-ficticia-reversao'
 });
 const {cookie}=await m.http('/entrar',{body:{nome:titular.nome,senha:'senha-ficticia-reversao'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,1);
 const sql=m.banco.prepare(`INSERT INTO akitemm_sandbox_cobrancas
 (pedido_id,origem,valor_centavos,cliente_asaas_id,pagamento_id,status,criado_em,atualizado_em)
 VALUES(?,'CARRINHO',25000,'cus_CargaFicticia',?,
 'PENDENTE_SANDBOX','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`);
 for(let i=0;i<41;i++){
  const id='pedido-prioridade-'+String(i).padStart(3,'0');
  sql.run(id,'pay_prioridade_'+String(i).padStart(3,'0'));
 }
 m.banco.prepare("UPDATE akitemm_sandbox_cobrancas SET atualizado_em='2026-10-01T00:00:00.000Z' WHERE pedido_id=?").run(pedido);
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?")
 .run('LOOPLAB-'+pedido);
 const agenda=m.integracao.automatico;
 const prioritarios=agenda.listarRecebimentos();
 assert.equal(prioritarios.includes(pedido),true);
 await agenda.verificar();
 assert.equal(m.integracao.cobrancas.consultar(pedido).status,'REVERSAO_INFORMADA_SANDBOX');
 assert.equal(agenda.pendentes.has(pedido),false);
 const linhas=m.banco.prepare('SELECT COUNT(*) n,COUNT(DISTINCT posicao_id) unicas FROM admin_ponte_compras_demo').get();
 assert.equal(linhas.n,1);assert.equal(linhas.unicas,1);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
