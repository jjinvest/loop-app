'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const vm=require('node:vm');
const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
const {projetarAgendaTabuleiroCompartilhada}=require('../src/producao/projecao-agenda-tabuleiro-compartilhada');
const {avaliarExecucaoDistribuicao,preverProximaLuzDistribuicao}=require('../src/domain/politica-execucao-distribuicao-loop');
const ms=s=>Date.parse(s+'-03:00');
function visor(agenda,operador){
 const elementos=Object.fromEntries(['relogioTabuleiroIntegrado','tituloRelogioTabuleiro',
  'estadoRelogioTabuleiro','motorContadorEventos','conteudoTabuleiro'].map(k=>[k,{textContent:'',hidden:false}]));
 const contexto={window:{},document:{hidden:false,body:{classList:{contains:()=>operador}}},
  Date:class extends Date{static now(){return agenda.agoraServidorMs;}},Intl,Math,Number,String,Object,
  setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(readFileSync(join(__dirname,'../src/shared/visor-catraca.js'),'utf8'),contexto);
 contexto.window.LoopVisorCatraca.criar({elemento:k=>elementos[k]}).registrarAgenda(agenda);
 return elementos;
}
test('configuração salva antes da abertura persiste em disco e chega igual aos dois perfis',t=>{
 const pasta=mkdtempSync(join(tmpdir(),'loop-relogio-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=join(pasta,'relogio.sqlite');
 let banco,catraca,agora=ms('2026-11-27T08:00:00');
 const abrir=()=>{
  banco=new DatabaseSync(arquivo);
  const motor={banco,consultar:()=>({tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},catraca:{giros:0},filaA:0,filaB:0}),
   _transacao:fn=>{banco.exec('BEGIN IMMEDIATE');try{const r=fn(null);banco.exec('COMMIT');return r;}catch(e){banco.exec('ROLLBACK');throw e;}}};
  catraca=new OperacaoCatracaAdminSQLite({banco,motor,agora:()=>new Date(agora)});
 };
 abrir();t.after(()=>banco.close());
 const salvar=(extra={})=>catraca.configurar({modo:'AUTOMATICA',janelaInicio:'09:00',janelaFim:'12:00',
  metaCentrosDia:5,metaDataAlvo:'2026-11-27',limiteDiario:10,
  revisaoEsperada:catraca.consultar().revisao,motivo:'TESTE_ISOLADO',...extra});
 let salvo=salvar();
 assert.equal(salvo.proximaLuzPrevistaEmMs,ms('2026-11-27T09:06:00'));
 assert.equal(salvo.intervaloLuzSegundos,360);
 banco.close();abrir();
 let lido=catraca.consultar();
 const {alterado,...estadoSalvo}=salvo;
 assert.equal(alterado,true);
 assert.deepEqual(lido,estadoSalvo,'reinício conserva programação, revisão, previsão e contadores');
 for(const perfil of [false,true]){
  const tela=visor(projetarAgendaTabuleiroCompartilhada(lido),perfil);
  assert.equal(tela.relogioTabuleiroIntegrado.textContent,'66:00');
  assert.match(tela.estadoRelogioTabuleiro.textContent,/09:00–12:00/);
 }
 // Uma data futura conserva o intervalo salvo, sem autorizar a execução hoje.
 salvo=salvar({metaDataAlvo:'2026-11-28'});
 assert.equal(salvo.intervaloLuzSegundos,360);
 assert.equal(salvo.luzesPlanejadas,0,'a meta futura não vira autorização para hoje');
 assert.equal(salvo.luzesProgramacao,30);
 assert.equal(salvo.proximaLuzPrevistaEmMs,ms('2026-11-28T09:06:00'));
 assert.equal(salvo.autorizacaoFinanceiraDosGiros,false);
 salvo=salvar({modo:'PAUSADA'});
 assert.equal(salvo.proximaLuzPrevistaEmMs,null);
 for(const perfil of [false,true])assert.equal(visor(projetarAgendaTabuleiroCompartilhada(salvo),perfil).tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 salvo=salvar({metaCentrosDia:0,metaDataAlvo:null,modo:'MANUAL'});
 assert.equal(salvo.proximaLuzPrevistaEmMs,null);
 assert.equal(salvo.intervaloLuzSegundos,null);
 assert.equal(salvo.girosTotais,0);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros').get().n,0);
});
test('previsão e execução usam a mesma grade, sem inventar próxima luz após fechamento',()=>{
 const agenda={modo:'AUTOMATICA',janelaInicio:'22:00',janelaFim:'02:00',metaCentrosDia:2,metaDataAlvo:'2026-11-27'};
 for(const hora of ['2026-11-27T21:00:00','2026-11-27T23:50:00','2026-11-28T00:30:00']){
  const agoraMs=ms(hora),p=preverProximaLuzDistribuicao({agenda,agoraMs});
  assert.equal(avaliarExecucaoDistribuicao({agenda,agoraMs,ativa:false}).proximaLuzPrevistaEmMs,p);
  assert.ok(p>agoraMs);
 }
 assert.equal(preverProximaLuzDistribuicao({agenda,agoraMs:ms('2026-11-28T02:00:00')}),null);
 assert.equal(preverProximaLuzDistribuicao({agenda,agoraMs:ms('2026-11-28T15:00:00')}),null);
});
test('os dois visores respeitam a próxima luz oficial em vez de recalculá-la pelo aparelho',()=>{
 const agora=ms('2026-11-27T09:00:00');
 const agenda={origem:'CATRACA_REAL_MESMO_SQLITE',modoExecucao:'AGENDADA',pausaManual:false,
  abertura:'09:00',fechamento:'12:00',agoraServidorMs:agora,luzesDoRelogioCompartilhado:true,
  metaLotes:{ativa:true,quantidade:5,dataAlvo:'2026-11-27',proximaLuzPrevistaEmMs:agora+120000}};
 for(const perfil of [false,true])assert.equal(visor(agenda,perfil).relogioTabuleiroIntegrado.textContent,'02:00');
});
