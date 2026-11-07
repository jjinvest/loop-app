'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {PreLancamentoCofresV6DemoSQLite}=require('../src/domain/prelancamento-cofres-v6-demo-sqlite');
const {ConciliacaoCofresV6DemoSQLite}=require('../src/domain/conciliacao-cofres-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function montar(){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=> '2030-01-01T00:00:00.000Z'});
 const razao=new RazaoFinanceiroDemoSQLite({banco:repo.banco});
 return {repo,ponte,razao,contas,comprovantes};
}
function salvarSimulador(ponte,sim){
 ponte.banco.prepare(`
 INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)
 ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
 `).run(JSON.stringify(sim.exportarSnapshot()));
}
const GOLD=['LOOP_DOURADAS','LOOP_ESQUERDA','LOOP_DOURADAS',
 'LOOP_DIREITA','LOOP_DOURADAS','LOOP_ESQUERDA'];
const RED=['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_CENTRO',
 'LOOP_DIREITA','LOOP_CENTRO','LOOP_ESQUERDA'];

async function criarReservaFicticia(fixture,{quantidade=12}={}){
 const {repo,ponte,contas,comprovantes}=fixture;
 const pre=new PreLancamentoCofresV6DemoSQLite({banco:repo.banco,ponte});
 for(let i=1;i<=quantidade;i++){
  const pessoa=contas.cadastrar({nome:'Fundo reserva '+i,
   email:'fundo-reserva-'+i+'@exemplo.invalid',senha:'senha-ficticia-fundo-2026'});
  const pedidoId='aporte-venda-reserva-'+String(i).padStart(2,'0');
  comprovantes.set(pedidoId,{pedidoId,contaId:pessoa.contaId,
   produtoId:'pdf-reserva-demo',valorCentavos:25000,
   confirmadoEm:'2030-01-01T00:00:00.000Z',status:STATUS_CONFIRMADO});
  assert.equal((await ponte.processar({pedidoId})).posicaoCriada,true);
 }
 pre.habilitar({valorFixoLoopCentavos:25000});
 for(let i=1;i<=quantidade;i++){
  pre.registrarAporteFicticio({aporteId:'aporte-direita-'+String(i).padStart(2,'0'),
   pedidoId:'aporte-venda-reserva-'+String(i).padStart(2,'0'),
   valorLoopCentavos:25000});
 }
 return {pre,conciliacao:new ConciliacaoCofresV6DemoSQLite({
  banco:repo.banco,preLancamento:pre,livro:pre.livro
 })};
}
test('nova dourada manual nao consome reserva, sem pre-lancamento, imutavel e idempotente',t=>{
 const {repo,ponte,razao,contas}=montar();t.after(()=>repo.fechar());
 const primeira=ponte.criarDouradaManualDemo({eventoId:'dourada-sem-reserva'});
 assert.equal(primeira.posicaoId,1);
 assert.equal(primeira.fila,'B');assert.equal(primeira.cor,'DOURADO');
 assert.equal(primeira.aporteRegistrado,false);
 assert.equal(primeira.reservaConsumidaCentavos,0);
 assert.equal(primeira.receitaNovaCentavos,0);
 assert.equal(primeira.cofreDestinoContemplacao,'LOOP_DOURADAS');
 const repetida=ponte.criarDouradaManualDemo({eventoId:'dourada-sem-reserva'});
 assert.equal(repetida.repetida,true);
 assert.equal(repetida.posicaoId,primeira.posicaoId);
 const segunda=ponte.criarDouradaManualDemo({eventoId:'dourada-sem-reserva-2'});
 assert.equal(segunda.posicaoId,primeira.posicaoId+1);
 const contabil=repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_ponte_douradas_financiadas_demo'
 ).get();
 assert.equal(contabil.n,0);
 const estado=ponte.consultar();
 assert.equal(estado.douradasManuais.length,2);
 assert.equal(estado.compras.length,0);
 assert.equal(razao.consultar().lancamentosRegistrados,0);
 assert.equal(ponte.auditarIntegridadeOperacionalDemo().totalAlertas,0);
 const sim=ponte._restaurar();
 for(const p of sim.filas.filaB){
  assert.equal(p.empresa,true);assert.equal(p.titularOperacional,'LOOP_EMPRESA');
  assert.equal(p.statusAdesao,'POSICAO_LOOP');
  assert.equal(p.origemOperacional,'ADMIN_MANUAL_SEM_COMPRA');
  assert.equal(p.geradaSemCompra,true);
  assert.equal(p.aporteInternoCentavos,0);
 }
 assert.throws(()=>repo.banco.exec('DELETE FROM admin_ponte_douradas_manuais_demo'),
  /bola dourada imutavel/);
 const reaberta=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas});
 assert.equal(reaberta.criarDouradaManualDemo({eventoId:'dourada-sem-reserva'}).repetida,true);
 assert.equal(reaberta.criarDouradaManualDemo({eventoId:'dourada-sem-reserva-3'}).posicaoId,3);
 assert.equal(reaberta.auditarIntegridadeOperacionalDemo().totalAlertas,0);
});

test('douradas novas nao afetam saldo ou compromissos antigos do cofre de reserva',async t=>{
 const fixture=montar();const {repo,ponte,razao}=fixture;
 t.after(()=>repo.fechar());
 const {pre,conciliacao}=await criarReservaFicticia(fixture);
 assert.equal(pre.resumo().reservaRestanteSimuladoCentavos,50000);
 const inicial=conciliacao.conferir();
 assert.equal(inicial.cofreDireitaDisponivelSimuladoCentavos,50000);
 const primeira=ponte.criarDouradaManualDemo({eventoId:'dourada-reserva-intocada-a'});
 const segunda=ponte.criarDouradaManualDemo({eventoId:'dourada-reserva-intocada-b'});
 assert.equal(segunda.posicaoId,primeira.posicaoId+1);
 assert.equal(segunda.reservaConsumidaCentavos,0);
 assert.equal(conciliacao.conferir().cofreDireitaDisponivelSimuladoCentavos,50000);
 assert.equal(conciliacao.conferir().reservaDouradasComprometidaCentavos,0);
 assert.equal(pre.resumo().reservaRestanteSimuladoCentavos,50000);
 assert.equal(ponte.consultar().douradasManuais.length,2);
 assert.equal(ponte.auditarIntegridadeOperacionalDemo().totalAlertas,0);
 assert.equal(razao.consultar().lancamentosRegistrados,0);
 assert.equal(repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_ponte_douradas_financiadas_demo').get().n,0);
});
test('dourada operacional no simulador respeita seis eventos e destinacoes de cofres',t=>{
 const {repo,ponte,razao}=montar();t.after(()=>repo.fechar());
 const sim=ponte._restaurar();
 // Apenas o simulador isolado forma o cenario: NAO e uma criacao
 // administrativa gratuita, a qual a API e o motor financeiro proibem.
 for(let i=1;i<=7;i++){
  const x=sim.registrarPosicaoSimulada({participanteId:'LOOP_EMPRESA',
   nome:'Centro LOOP demonstrativo',vendaId:'simulacao-operacao-'+i}).posicao;
  const p=sim.filas.filaB.find(y=>y.id===x.id);
  p.empresa=true;p.titularOperacional='LOOP_EMPRESA';
  p.statusAdesao='POSICAO_LOOP';
 }
 sim.prepararTabuleiro();
 assert.equal(sim.tabuleiro.centro.id,1);
 assert.equal(sim.tabuleiro.vagas.length,6);
 assert.equal(sim.tabuleiro.vagas[5].id,7);
 for(let i=1;i<=6;i++){
  const result=sim.registrarVendaNoCicloSimulada({vendaId:'simulacao-dourada-'+i});
  assert.equal(result.venda.destinoCofre,GOLD[i-1]);
 }
 salvarSimulador(ponte,sim);
 const audit=ponte.auditarCicloFinanceiroDemo({cicloNumero:1});
 assert.equal(audit.centroTitular,'LOOP_EMPRESA');
 assert.equal(audit.cofreParcelasCentro,'LOOP_DOURADAS');
 assert.equal(audit.recebimentosFinanceirosComprovados,false);
 assert.equal(audit.podeGerarCreditoFinanceiro,false);
 assert.deepEqual(audit.eventos.map(e=>e.cofrePrevisto),GOLD);
 assert.equal(razao.consultar().lancamentosRegistrados,0);
 assert.equal(ponte.consultar().compras.length,0);
 sim.abrirCatraca();
 assert.equal(sim.tentarGiro().girou,true);
 salvarSimulador(ponte,sim);
 assert.equal(ponte.auditarCicloFinanceiroDemo({cicloNumero:1}).concluidoNoTabuleiro,true);
});
test('centro de participante distingue cofre cliente do caixa douradas',t=>{
 const {repo,ponte}=montar();t.after(()=>repo.fechar());
 const sim=ponte._restaurar();
 for(let i=1;i<=7;i++)sim.registrarPosicaoSimulada({
  participanteId:'conta-'+i,nome:'Participante '+i,
  vendaId:'teste-validacao-'+i
 });
 sim.prepararTabuleiro();
 for(let i=1;i<=6;i++)sim.registrarVendaNoCicloSimulada({vendaId:'venda-normal-'+i});
 salvarSimulador(ponte,sim);
 const auditoria=ponte.auditarCicloFinanceiroDemo({cicloNumero:1});
 assert.equal(auditoria.centroTitular,'PARTICIPANTE');
 assert.deepEqual(auditoria.eventos.map(e=>e.cofrePrevisto),RED);
 assert.equal(auditoria.cofreParcelasCentro,'LOOP_CENTRO');
});
test('API administrativa protegida e pagina traz botao de douradas e auditoria',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='controle-admin-douradas-v6-teste';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const uri=base+'/api/admin/ponte-compras-convites-demo';
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const make=(eventoId,head=headers)=>fetch(uri+'/douradas',{
  method:'POST',headers:head,body:JSON.stringify({eventoId})
 });
 assert.equal((await make('admin-sem-chave',{'Content-Type':'application/json'})).status,401);
 const criada=await make('admin-com-chave');
 assert.equal(criada.status,200);
 const corpo=await criada.json();
 assert.equal(corpo.resultado.reservaConsumidaCentavos,0);
 assert.equal(corpo.resultado.aporteRegistrado,false);
 assert.equal(corpo.aporteInternoDemonstrativo,false);
 const repetida=await make('admin-com-chave');
 assert.equal(repetida.status,200);
 assert.equal((await repetida.json()).resultado.repetida,true);
 const list=await (await fetch(uri,{headers})).json();
 assert.equal(list.douradasManuais.length,1);
 assert.equal(list.filas.B.quantidade,1);
 assert.equal((await fetch(uri+'/auditoria-ciclo?ciclo=1')).status,401);
 assert.equal((await fetch(uri+'/auditoria-ciclo?ciclo=0',{headers})).status,400);
 assert.equal((await fetch(uri+'/auditoria-ciclo?ciclo=1',{headers})).status,404);
 const pagina=await (await fetch(base+'/admin/financeiro-demo')).text();
 const script=await (await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(pagina,/criarDouradaManualDemo/);
 assert.match(pagina,/conferirCicloDouradasDemo/);
 assert.match(script,/criarDouradaManual/);
 assert.match(script,/conferirCicloDouradas/);
 assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
});
