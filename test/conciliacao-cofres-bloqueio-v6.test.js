'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('concilia entradas comerciais, aportes separados e impede giro com aporte inventado',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const certificados=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>certificados.get(id)});
 for(let i=0;i<8;i++){
  const conta=contas.cadastrar({nome:'Balanco Demo '+i,
   email:'balanco-demo-'+i+'@exemplo.invalid',
   senha:'senha-exemplo-forte-2026'});
  const pedidoId='balanco-pdf-'+i;
  certificados.set(pedidoId,{pedidoId,contaId:conta.contaId,
   status:STATUS_CONFIRMADO,produtoId:'pdf-laboratorio',
   valorCentavos:25000,confirmadoEm:'2026-10-17T10:00:00.000Z'});
  await ponte.processar({pedidoId});
 }
 const agora=()=> '2026-10-17T15:00:00.000Z';
 const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco,agora});
 const bridge=new CircuitBreakPonteV6DemoSQLite({
  banco:repo.banco,ponte,controle,agora
 });
 assert.equal(bridge.conciliacao.conferir().integridadeDemonstrativa,
  'SEM_PRELANCAMENTO_CONFIGURADO');
 bridge.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 assert.equal(bridge.conciliacao.conferir().comprasComerciaisSemCreditoAutomatico,8);
 assert.equal(bridge.conciliacao.conferir().quantidadeAportesSeparados,0);
 assert.equal(bridge.conciliacao.conferir().entradasAportesSimuladosCentavos,0);
 for(let i=0;i<8;i++){
  bridge.preLancamento.registrarAporteFicticio({
    aporteId:'aporte-reconciliar-'+i,
    pedidoId:'balanco-pdf-'+i,valorLoopCentavos:25000
  });
 }
 const antes=bridge.conciliacao.conferir();
 assert.equal(antes.integridadeDemonstrativa,'CONFERIDA_APENAS_EM_SIMULACAO');
 assert.equal(antes.quantidadeDivergencias,0);
 assert.equal(antes.somaDestinacoesConservadasCentavos,200000);
 assert.equal(antes.cofreCentroRestanteSimuladoCentavos,100000);
 assert.equal(antes.dinheiroBancarioComprovadoCentavos,0);
 // Corrupcao simulada por acesso interno ao banco, sem passar pelas rotas.
 // O erro NAO pode permitir giro nem auto-ajustar um saldo inventado.
 repo.banco.prepare([
  'INSERT INTO loop_v6_pre_receitas',
  '(pedido_id,conta_id,bruto_centavos,liquido_centavos,',
  'centro_centavos,esquerda_centavos,direita_centavos,registrado_em)',
  'VALUES(?,?,?,?,?,?,?,?)'
 ].join(' ')).run('pedido-inventado-sem-aporte','conta-inventada',25000,
  25000,12500,8333,4167,agora());
 const adulterado=bridge.conciliacao.conferir();
 assert.equal(adulterado.integridadeDemonstrativa,'DIVERGENTE');
 assert.equal(adulterado.divergencias.some(x=>x.codigo==='RECEITA_LOOP_SEM_APORTE'),true);
 controle.executar({tipo:'ABRIR',comandoId:'cb-abrir-conciliacao-v6',revisaoEsperada:0});
 bridge.preLancamento.iniciar();
 assert.throws(()=>bridge.liberar({
  comandoId:'cb-giro-conciliacao-bloqueado',
  revisaoEsperada:1,quantidade:1
 }),{codigo:'CONCILIACAO_COFRES_DIVERGENTE'});
 assert.equal(bridge.resumo().girosConcluidos,0);
 assert.equal(bridge.livro.resumo().ciclosRegistrados,0);
 assert.equal(bridge.preLancamento.resumo().girosRegistrados,0);
 assert.equal(bridge.conciliacao.conferir().disponivelParaSaqueCentavos,0);
});
test('API conciliacao dos quatro cofres apenas admin no laboratorio',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='segredo-conciliacao-test-2026-12345';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo})
  .listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+
  '/api/admin/circuit-break-v6-demo/ponte/conciliacao';
 const sem=await fetch(url);
 assert.equal(sem.status,401);
 const ok=await fetch(url,{headers:{Authorization:'Bearer '+segredo}});
 assert.equal(ok.status,200);
 const dados=await ok.json();
 assert.equal(dados.integridadeDemonstrativa,'SEM_PRELANCAMENTO_CONFIGURADO');
 assert.equal(dados.dinheiroBancarioComprovadoCentavos,0);
 assert.equal(dados.disponivelParaSaqueCentavos,0);
 assert.equal(dados.pagamentosReaisAutorizados,false);
});
