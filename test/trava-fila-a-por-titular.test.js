'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ConfiguracaoTravaFilaADemoSQLite}=require('../src/domain/configuracao-trava-fila-a-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function preparar(qtd=6,vaga=5){
 let t=0;const loop=new SimuladorLoop({
  relogio:()=>new Date(Date.UTC(2026,9,18,9,0,++t)).toISOString()
 });
 loop.filas.travaPromocaoAtiva=true;
 loop.filas.vagaLiberacao=vaga;
 for(let i=0;i<7;i++)loop.registrarPosicaoSimulada({
  participanteId:'neutro-'+i,vendaId:'pedido-neutro-'+i});
 loop.prepararTabuleiro();
 // B continua FIFO e entra normalmente no tabuleiro mesmo sem indicacoes.
 // Deixar neutros na frente evita confundir entrada regular da B com
 // liberacao PRIORITARIA pela A do influencer.
 for(let i=7;i<33;i++)loop.registrarPosicaoSimulada({
  participanteId:'neutro-'+i,vendaId:'pedido-neutro-'+i});
 const posicoes=[];
 for(let i=0;i<qtd;i++){
  const p=loop.registrarPosicaoSimulada({
   participanteId:'influencer',vendaId:'pedido-influencer-'+i}).posicao;
  posicoes.push(p.id);
  loop.registrarIndicacaoSimulada({
   indicadorId:'influencer',eventoId:'convite-'+i,posicaoAlvoId:p.id
  });
 }
 return {loop,posicoes};
}
function giro(loop,n){
 for(let i=1;i<=6;i++)
  loop.registrarVendaNoCicloSimulada({vendaId:'giro-'+n+'-evento-'+i});
 loop.abrirCatraca();
 const resultado=loop.tentarGiro();
 loop.pausarCatraca();
 assert.equal(resultado.girou,true);
 return resultado;
}
test('titular com seis posicoes e seis convites nao domina a Fila A',()=>{
 const {loop,posicoes}=preparar(6);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[posicoes[0]]);
 assert.deepEqual(loop.filas.filaB.filter(p=>p.participanteId==='influencer').map(p=>p.id),posicoes.slice(1));
 for(const p of loop.filas.filaB.filter(p=>p.participanteId==='influencer'))
  assert.equal(p.indicacoesVinculadas,1);
 giro(loop,1);
 assert.equal(loop.tabuleiro.vagas[5].id,posicoes[0]);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[]);
 giro(loop,2);
 assert.equal(loop.tabuleiro.vagas[4].id,posicoes[0]);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[posicoes[1]]);
 assert.deepEqual(loop.filas.filaB.filter(p=>p.participanteId==='influencer').map(p=>p.id),posicoes.slice(2));
 giro(loop,3);
 assert.equal(loop.tabuleiro.vagas[5].id,posicoes[1]);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[]);
 giro(loop,4);
 assert.equal(loop.tabuleiro.vagas[4].id,posicoes[1]);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[posicoes[2]]);
 assert.deepEqual(loop.filas.filaB.filter(p=>p.participanteId==='influencer').map(p=>p.id),posicoes.slice(3));
});
test('trava na vaga 4 ou 3 altera somente futuras liberacoes',()=>{
 const {loop,posicoes}=preparar(3,4);
 giro(loop,1);giro(loop,2);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[]); // anterior ainda na vaga 5
 loop.filas.vagaLiberacao=3; // admin apertou trava antes da liberacao
 giro(loop,3);
 assert.equal(loop.tabuleiro.vagas[3].id,posicoes[0]); // chegou na vaga 4
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[]);
 giro(loop,4); // agora na vaga 3
 assert.equal(loop.tabuleiro.vagas[2].id,posicoes[0]);
 assert.deepEqual(loop.filas.filaA.map(p=>p.id),[posicoes[1]]);
 assert.deepEqual(loop.filas.filaB.filter(p=>p.participanteId==='influencer').map(p=>p.id),[posicoes[2]]);
});
test('snapshot recupera ultima posicao promovida e a sequencia da trava',()=>{
 const {loop,posicoes}=preparar(2);
 giro(loop,1);
 const restaurado=SimuladorLoop.restaurarSnapshot(loop.exportarSnapshot());
 restaurado.filas.travaPromocaoAtiva=true;
 restaurado.filas.vagaLiberacao=5;
 assert.deepEqual(restaurado.filas.filaA.map(p=>p.id),[]);
 assert.equal(restaurado.filas.ultimaPromovidaPorTitular.get('influencer').posicaoId,posicoes[0]);
 giro(restaurado,2);
 assert.deepEqual(restaurado.filas.filaA.map(p=>p.id),[posicoes[1]]);
});
test('configuracao administrativa persiste, audita e rejeita revisao concorrente',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const c=new ConfiguracaoTravaFilaADemoSQLite({banco:repo.banco});
 assert.equal(c.consultar().vagaLiberacao,5);
 const nova=c.alterar({vagaLiberacao:4,revisaoEsperada:1,motivo:'Aumentar o espacamento'});
 assert.equal(nova.vagaLiberacao,4);
 assert.equal(new ConfiguracaoTravaFilaADemoSQLite({banco:repo.banco}).consultar().vagaLiberacao,4);
 assert.throws(()=>c.alterar({vagaLiberacao:3,revisaoEsperada:1,motivo:'Nova revisao testada'}),
  {codigo:'CONFLITO_REVISAO'});
 assert.equal(c.historico().length,1);
 assert.throws(()=>repo.banco.prepare('DELETE FROM loop03_trava_fila_a_historico_demo').run(),/historico imutavel/);
});
test('API do administrador protege o controle da Fila A e exige justificativa',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const segredo='chave-local-trava-fila-a-2026-1234567890';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const url='http://127.0.0.1:'+server.address().port+
  '/api/admin/circuit-break-v6-demo/trava-fila-a';
 assert.equal((await fetch(url)).status,401);
 const headers={Authorization:'Bearer '+segredo,'Content-Type':'application/json'};
 const get=await fetch(url,{headers});assert.equal(get.status,200);
 assert.equal((await get.json()).configuracao.vagaLiberacao,5);
 const post=async dados=>fetch(url,{method:'POST',headers,body:JSON.stringify(dados)});
 assert.equal((await post({vagaLiberacao:3,revisaoEsperada:1,motivo:'x'})).status,400);
 const gravado=await post({vagaLiberacao:3,revisaoEsperada:1,motivo:'Equilibrar a distribuicao'});
 assert.equal(gravado.status,200);
 assert.equal((await gravado.json()).configuracao.vagaLiberacao,3);
 assert.equal((await post({vagaLiberacao:4,revisaoEsperada:1,motivo:'Revisao concorrente'})).status,409);
 const revisao=await (await fetch(url,{headers})).json();
 assert.equal(revisao.historico.length,1);
 const pagina=await fetch('http://127.0.0.1:'+server.address().port+'/admin/circuit-break-v6');
 assert.equal(pagina.status,200);
 assert.match(await pagina.text(),/Controle das posições na Fila A/);
});
