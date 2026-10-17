'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function montar(){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>null,
  relogio:()=> '2030-01-01T00:00:00.000Z'});
 const razao=new RazaoFinanceiroDemoSQLite({banco:repo.banco});
 return {repo,ponte,razao};
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

test('botao cria bola dourada unica em B, idempotente, sem CPF/compra/saldo',t=>{
 const {repo,ponte,razao}=montar();t.after(()=>repo.fechar());
 const pos1=ponte.criarDouradaManualDemo({eventoId:'dourada-admin-a'});
 assert.equal(pos1.posicaoId,1);
 assert.equal(pos1.fila,'B');
 assert.equal(pos1.cor,'DOURADO');
 assert.equal(pos1.semCompra,true);
 assert.equal(pos1.semCPF,true);
 const repetida=ponte.criarDouradaManualDemo({eventoId:'dourada-admin-a'});
 assert.equal(repetida.repetida,true);
 assert.equal(repetida.posicaoId,pos1.posicaoId);
 const pos2=ponte.criarDouradaManualDemo({eventoId:'dourada-admin-b'});
 assert.equal(pos2.posicaoId,2);
 const s=ponte._restaurar();
 assert.equal(s.filas.filaB.length,2);
 for(const p of s.filas.filaB){
  assert.equal(p.empresa,true);
  assert.equal(p.titularOperacional,'LOOP_EMPRESA');
  assert.equal(p.statusAdesao,'POSICAO_LOOP');
  assert.equal(p.origemOperacional,'ADMIN_MANUAL_SEM_COMPRA');
  assert.equal(p.geradaSemCompra,true);
 }
 assert.throws(()=>s.registrarIndicacaoSimulada({indicadorId:'LOOP_EMPRESA',
  eventoId:'indicacao-forjada'}),/nao participa de indicacoes/);
 assert.equal(ponte.consultar().douradasManuais.length,2);
 assert.equal(ponte.consultar().compras.length,0);
 assert.equal(ponte.consultar().comissoesSimuladas.length,0);
 assert.equal(razao.consultar().lancamentosRegistrados,0);
 assert.throws(()=>repo.banco.exec(
  "UPDATE admin_ponte_douradas_manuais_demo SET origem='QUALQUER'"
 ),/bola dourada imutavel/);
});
test('dourada administrativa avanca normalmente e seis parcelas vao aos cofres certos',t=>{
 const {repo,ponte,razao}=montar();t.after(()=>repo.fechar());
 for(let i=1;i<=7;i++)ponte.criarDouradaManualDemo({eventoId:'dourada-gerada-'+i});
 const preparo=ponte.prepararTabuleiroDemo();
 assert.equal(preparo.tabuleiro.centro.id,1);
 assert.equal(preparo.tabuleiro.vagas.length,6);
 assert.equal(preparo.tabuleiro.vagas[5].id,7);
 const sim=ponte._restaurar();
 for(let i=1;i<=6;i++){
  const resultado=sim.registrarVendaNoCicloSimulada({vendaId:'simulacao-dourada-'+i});
  assert.equal(resultado.venda.destinoCofre,GOLD[i-1]);
 }
 salvarSimulador(ponte,sim);
 const auditoria=ponte.auditarCicloFinanceiroDemo({cicloNumero:1});
 assert.equal(auditoria.centroTitular,'LOOP_EMPRESA');
 assert.equal(auditoria.origemCentro,'POSICAO_OPERACIONAL_LOOP');
 assert.equal(auditoria.cofreParcelasCentro,'LOOP_DOURADAS');
 assert.equal(auditoria.seisEventosRegistrados,true);
 assert.equal(auditoria.aptoAConferirDestinos,true);
 assert.equal(auditoria.recebimentosFinanceirosComprovados,false);
 assert.equal(auditoria.podeGerarCreditoFinanceiro,false);
 assert.deepEqual(auditoria.eventos.map(e=>e.cofrePrevisto),GOLD);
 assert.equal(razao.consultar().lancamentosRegistrados,0);
 assert.equal(ponte.consultar().compras.length,0);
 const giro=sim.abrirCatraca()&&sim.tentarGiro();
 assert.equal(giro.girou,true);
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
 assert.equal((await make('admin-com-chave')).status,200);
 assert.equal((await make('admin-com-chave')).status,200);
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
