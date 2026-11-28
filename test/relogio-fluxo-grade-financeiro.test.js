'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const vm=require('node:vm');
const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
const {BancadaModulosLoopSQLite}=require('../src/producao/bancada-modulos-loop-sqlite');
const {avaliarExecucaoDistribuicao}=require('../src/domain/politica-execucao-distribuicao-loop');
const ms=s=>Date.parse(s+'-03:00');
test('a programação 02h–02h30 de 15 centros governa 90 lançamentos, reinício e meta no lote preservado',t=>{
 const pasta=mkdtempSync(join(tmpdir(),'loop-grade-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 let agora=ms('2026-11-28T01:51:00'),db,livro,operacao,bancada;
 const abrir=()=>{
  db=new DatabaseSync(join(pasta,'agenda.sqlite'));
  livro=new DatabaseSync(join(pasta,'lote.sqlite'));
  const motor={banco:db,consultar:()=>({tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},catraca:{giros:0},filaA:0,filaB:0}),
   _transacao:fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn(null);db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  operacao=new OperacaoCatracaAdminSQLite({banco:db,motor,agora:()=>new Date(agora)});
  bancada=new BancadaModulosLoopSQLite({banco:livro,agora:()=>agora,consultarAgenda:()=>operacao.consultar()});
 };
 abrir();t.after(()=>{db.close();livro.close();});
 const salvar=extra=>operacao.configurar({modo:'AUTOMATICA',janelaInicio:'02:00',janelaFim:'02:30',
  metaCentrosDia:15,metaDataAlvo:'2026-11-28',limiteDiario:null,revisaoEsperada:operacao.consultar().revisao,motivo:'TESTE_ISOLADO',...extra});
 salvar();
 bancada.comandar({idOperacao:'preparar-lote-prova',acao:'CATRACA_PREPARAR_1000'});
 let x=bancada.consultar().catraca;
 assert.equal(x.financeiro.execucao.proximaLuzPrevistaEmMs,ms('2026-11-28T02:00:20'));
 assert.equal(x.financeiro.eventos,0);
 assert.equal(x.catracaAtiva,false);
 assert.equal(bancada.processarRelogio().processado,false,'salvar não executa START');
 bancada.comandar({idOperacao:'start-isolado-prova',acao:'CATRACA_INICIAR'});
 const centro=bancada.consultar().catraca.tabuleiro.centroPosicao;
 assert.ok(centro);
 for(let i=1;i<=90;i++){
  // Oscilação normal do worker: uma leitura atrasada não pode perder o marco seguinte.
  agora=ms('2026-11-28T02:00:00')+i*20000+(i%2?900:100);
  assert.equal(bancada.processarRelogio().processado,true,'luz '+i);
  assert.equal(bancada.processarRelogio().processado,false,'sem replay da luz '+i);
  if(i===23){db.close();livro.close();abrir();}
 }
 x=bancada.consultar().catraca;
 assert.equal(x.financeiro.eventos,90);
 assert.equal(x.tabuleiro.giros,15);
 assert.equal(x.financeiro.contadores.ciclosHoje,15);
 assert.equal(x.financeiro.contadores.eventosHoje,90);
 assert.equal(x.financeiro.contadores.eventos24h,90);
 assert.equal(x.financeiro.execucao.proximaLuzPrevistaEmMs,null);
 assert.equal(x.financeiro.saldoCentavos,25000000-90*25000);
 assert.equal(Object.values(x.financeiro.destinos).reduce((a,b)=>a+b,0)+x.financeiro.saldoCentavos,25000000);
 const pagos=livro.prepare("SELECT SUM(valor) total FROM loop_teste_fluxo_lancamentos WHERE destino='LOOP_CENTRO' AND posicao=?").get(centro.numero).total;
 assert.equal(pagos,75000,'três lançamentos de R$250 ao ID do primeiro centro');
 const n=x.financeiro.eventos;
 salvar({janelaFim:'03:00'});
 assert.equal(bancada.processarRelogio().motivo,'META_DIARIA_ATINGIDA');
 assert.equal(bancada.consultar().catraca.financeiro.execucao.motivo,'META_DIARIA_ATINGIDA','consulta e execução usam o mesmo limite');
 assert.equal(bancada.consultar().catraca.financeiro.eventos,n);
 assert.equal(livro.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('visor mostra previsão salva mesmo antes do START e contagem do livro, sem acender eventos previstos',()=>{
 const elementos=Object.fromEntries(['relogioTabuleiroIntegrado','tituloRelogioTabuleiro','estadoRelogioTabuleiro',
  'motorContadorEventos','loop03LuzesHoraIntegrado','loop03Giros24Integrado'].map(k=>[k,{textContent:''}]));
 const agora=ms('2026-11-28T01:51:00');
 const ctx={window:{},document:{hidden:false},Date:class extends Date{static now(){return agora;}},Intl,Math,Number,String,Object,setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(readFileSync(join(__dirname,'../src/shared/visor-catraca.js'),'utf8'),ctx);
 const v=ctx.window.LoopVisorCatraca.criar({elemento:k=>elementos[k]});
 v.registrarAgenda({agoraServidorMs:agora,fluxoControlado:{ativa:false,modo:'PROGRAMADO',metaCentrosDia:15,
  proximoEmMs:ms('2026-11-28T02:00:20'),agoraServidorMs:agora,abertura:'02:00',fechamento:'02:30',
  eventos:0,total:0,limite:1000,contadores:{eventosHoje:0,ciclosHoje:0}}});
 assert.equal(elementos.relogioTabuleiroIntegrado.textContent,'09:20');
 assert.equal(elementos.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 assert.equal(elementos.loop03LuzesHoraIntegrado.textContent,'0 / 90');
 assert.equal(elementos.loop03Giros24Integrado.textContent,'0');
});
test('um marco novo não é confundido com intervalo mínimo entre consultas',()=>{
 const agenda={modo:'AUTOMATICA',janelaInicio:'02:00',janelaFim:'02:30',metaCentrosDia:15};
 const base=ms('2026-11-28T02:00:00');
 assert.equal(avaliarExecucaoDistribuicao({agenda,ativa:true,agoraMs:base+40100,ultimoEventoEm:base+20900}).podeExecutar,true);
 assert.equal(avaliarExecucaoDistribuicao({agenda,ativa:true,agoraMs:base+40900,ultimoEventoEm:base+40100}).podeExecutar,false);
});
