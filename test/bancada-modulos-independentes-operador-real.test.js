'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {BancadaModulosLoopSQLite}=
 require('../src/producao/bancada-modulos-loop-sqlite');
function contexto(modo='MANUAL'){
 const db=new DatabaseSync(':memory:');
 let ts=Date.parse('2026-11-23T12:00:00Z');
 const agenda={modo,metaCentrosDia:1,metaDataAlvo:null,
  janelaInicio:'09:00',janelaFim:'18:00'};
 const teste=new BancadaModulosLoopSQLite({banco:db,
  agora:()=>ts,consultarAgenda:()=>({...agenda})});
 let contador=0;
 const acao=(nome,outros={})=>teste.comandar({
  idOperacao:'op-bancada-'+String(++contador).padStart(5,'0'),
  acao:nome,...outros
 });
 return {db,teste,agenda,acao,mudarTempo:ms=>{ts=ms;}};
}
test('catraca cumpre seis eventos, gira posicoes e preserva a porteira FECHADA',t=>{
 const c=contexto();t.after(()=>c.db.close());
 const montado=c.acao('CATRACA_CARREGAR');
 assert.equal(montado.tabuleiroCarregado,true);
 assert.equal(montado.porteiraAberta,false);
 const antes=c.teste.consultar();
 assert.equal(antes.catraca.tabuleiro.vagas.filter(Boolean).length,6);
 assert.equal(antes.catraca.tabuleiro.centro,'Posição de teste 01');
 c.acao('CATRACA_INICIAR');
 for(let i=1;i<=5;i++){
  const r=c.acao('CATRACA_PULSO');
  assert.equal(r.ordem,i);assert.equal(r.girou,false);
  assert.equal(c.teste.consultar().catraca.tabuleiro.giros,0);
 }
 const giro=c.acao('CATRACA_PULSO');
 assert.equal(giro.ordem,6);
 assert.equal(giro.girou,true);
 assert.equal(giro.centroConcluido,'Posição de teste 01');
 const depois=c.teste.consultar();
 assert.equal(depois.catraca.porteiraAberta,false);
 assert.equal(depois.catraca.tabuleiro.centro,'Posição de teste 02');
 assert.equal(depois.catraca.tabuleiro.vagas[5],null);
 assert.equal(depois.catraca.tabuleiro.centrosConcluidos,1);
 assert.equal(depois.catraca.tabuleiro.giros,1);
 assert.equal(depois.catraca.tabuleiro.eventosNoCiclo,0);
 assert.equal(depois.fila.filaA.length+depois.fila.filaB.length,0);
 assert.equal(c.db.prepare(
  "SELECT COUNT(*) n FROM loop_teste_modulos_operacoes WHERE modulo='CATRACA'"
 ).get().n,8); // carregar + iniciar + seis eventos
});
test('fila recebe nomes, promove por posicao e abastece sem qualquer giro',t=>{
 const c=contexto();t.after(()=>c.db.close());
 const maria=c.acao('FILA_ENTRAR',{nome:'Maria'});
 const joao=c.acao('FILA_ENTRAR',{nome:'João'});
 const ana=c.acao('FILA_ENTRAR',{nome:'Ana'});
 assert.deepEqual(c.teste.consultar().fila.filaB.map(x=>x.nome),
  ['Maria','João','Ana']);
 assert.equal(c.teste.consultar().fila.porteiraAberta,false);
 const movida=c.acao('FILA_PROMOVER',{posicaoId:joao.posicaoId});
 assert.deepEqual(movida.promovidas,[joao.posicaoId]);
 assert.deepEqual(c.teste.consultar().fila.filaA.map(x=>x.nome),['João']);
 assert.deepEqual(c.teste.consultar().fila.filaB.map(x=>x.nome),
  ['Maria','Ana']);
 assert.throws(()=>c.acao('FILA_PREENCHER_TABULEIRO'),
  {codigo:'BANCADA_PORTEIRA_FECHADA'});
 assert.equal(c.teste.consultar().fila.tabuleiro.giros,0);
 c.acao('FILA_ABRIR_PORTEIRA');
 const abast=c.acao('FILA_PREENCHER_TABULEIRO');
 assert.equal(abast.centro,'João');
 assert.equal(c.teste.consultar().fila.tabuleiro.giros,0);
 c.acao('FILA_FECHAR_PORTEIRA');
 assert.equal(c.teste.consultar().fila.porteiraAberta,false);
 assert.equal(c.teste.consultar().catraca.tabuleiro.centro,null);
 assert.equal(c.teste.consultar().catraca.tabuleiro.giros,0);
 assert.equal(maria.entrouNaFila,'B');
 assert.equal(ana.entrouNaFila,'B');
});
test('idempotencia, limite de 10 e reinicio atingem apenas teste selecionado',t=>{
 const c=contexto();t.after(()=>c.db.close());
 const id='op-bancada-repeticao-001';
 const primeira=c.teste.comandar({idOperacao:id,acao:'FILA_ENTRAR',nome:'Eva'});
 const repetida=c.teste.comandar({idOperacao:id,acao:'FILA_ENTRAR',nome:'Eva'});
 assert.equal(repetida.repetida,true);
 assert.equal(primeira.posicaoId,repetida.posicaoId);
 assert.throws(()=>c.teste.comandar({
  idOperacao:id,acao:'FILA_ENTRAR',nome:'Outro'
 }),{codigo:'BANCADA_REPLAY_DIVERGENTE'});
 for(let i=1;i<10;i++)c.acao('FILA_ENTRAR',{nome:'Eva'});
 assert.equal(c.teste.consultar().fila.filaB.length,10);
 assert.throws(()=>c.acao('FILA_ENTRAR',{nome:'Eva'}),
  {codigo:'LOOP_MAXIMO_DEZ_POSICOES'});
 c.acao('CATRACA_CARREGAR');
 c.acao('FILA_REINICIAR');
 assert.equal(c.teste.consultar().fila.filaB.length,0);
 assert.equal(c.teste.consultar().catraca.tabuleiro.vagas.filter(Boolean).length,6);
});
test('relogio programado provoca movimentos persistidos sem abrir a porteira',t=>{
 const c=contexto('AUTOMATICA');t.after(()=>c.db.close());
 c.acao('CATRACA_CARREGAR');
 c.acao('CATRACA_INICIAR');
 const inicio=Date.parse('2026-11-23T12:00:00Z');
 assert.equal(c.teste.processarRelogio().processado,false);
 for(let i=1;i<=6;i++){
  c.mudarTempo(inicio+i*90*60000);
  const r=c.teste.processarRelogio();
  assert.equal(r.processado,true);
  assert.equal(r.ordem,i);
  assert.equal(c.teste.processarRelogio().processado,false);
 }
 const res=c.teste.consultar().catraca;
 assert.equal(res.tabuleiro.giros,1);
 assert.equal(res.tabuleiro.centrosConcluidos,1);
 assert.equal(res.porteiraAberta,false);
 assert.equal(res.cursorLuz,6);
 c.agenda.modo='PAUSADA';
 assert.equal(c.teste.processarRelogio().processado,false);
 // Reabrir a instancia do teste no mesmo SQLite preserva giro e cursor.
 const reaberta=new BancadaModulosLoopSQLite({banco:c.db,
  agora:()=>Date.parse('2026-11-23T21:00:00Z'),
  consultarAgenda:()=>({...c.agenda})});
 assert.equal(reaberta.consultar().catraca.tabuleiro.giros,1);
 assert.equal(reaberta.consultar().catraca.cursorLuz,6);
 // Reiniciar a prova cria uma nova geracao: marcas anteriores nunca
 // bloqueiam os eventos de uma nova bateria no mesmo dia.
 c.acao('CATRACA_REINICIAR');
 c.mudarTempo(inicio);
 c.agenda.modo='AUTOMATICA';
 c.acao('CATRACA_CARREGAR');
 c.acao('CATRACA_INICIAR');
 c.mudarTempo(inicio+90*60000);
 assert.equal(c.teste.processarRelogio().processado,true);
 assert.equal(c.teste.consultar().catraca.tabuleiro.eventosNoCiclo,1);
});

test('visao do operador usa movimentos da bancada; cliente preserva privacidade',()=>{
 const browser=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
 const visual=fs.readFileSync('src/shared/tabuleiro-visual-loop.js','utf8');
 const server=fs.readFileSync('scripts/iniciar-identidade-real-loop.js','utf8');
 const gateway=fs.readFileSync('src/producao/gateway-admin-comercial.js','utf8');
 assert.match(browser,/async function carregarTabuleiroTesteOperador\(\)/);
 assert.match(browser,/visualTabuleiro\.preencherLuzes\(x\.tabuleiro\.eventosNoCiclo\)/);
 assert.match(browser,/exibirNomesTeste:true/);
 assert.match(browser,/TESTE OPERACIONAL/);
 assert.match(visual,/exibirNomesTeste=false/);
 assert.match(visual,/nomeTeste=exibirNomesTeste===true/);
 assert.match(server,/new DatabaseSync\('\/dados-reais\/testes-modulos\.sqlite'\)/);
 assert.match(gateway,/app\.get\('\/api\/admin\/loop\/testes-modulos',proteger/);
 assert.match(gateway,/app\.post\('\/api\/admin\/loop\/testes-modulos',proteger,validarCsrf/);
 const guard=fs.readFileSync('src/producao/backup-identidade-real.js','utf8');
 assert.match(guard,/BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS/);
});
