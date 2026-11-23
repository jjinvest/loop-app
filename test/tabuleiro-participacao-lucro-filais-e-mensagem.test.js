'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function simularRelogio({hora,modo='AGENDADA',pausado=false}){
 const now=Date.parse(hora);
 const Clock=class extends Date{static now(){return now;}};
 const ids=['relogioTabuleiroIntegrado','tituloRelogioTabuleiro',
  'estadoRelogioTabuleiro','motorContadorEventos'];
 const el=Object.fromEntries(ids.map(id=>[id,{textContent:''}]));
 const ctx={window:{setInterval:()=>1},document:{hidden:false},
  Date:Clock,Intl,Math,Number,String,Object};
 vm.runInNewContext(ler('src/shared/visor-catraca.js'),ctx,{timeout:2000});
 const visor=ctx.window.LoopVisorCatraca.criar({elemento:id=>el[id]||null});
 visor.registrarAgenda({
  origem:'CATRACA_REAL_MESMO_SQLITE',modoExecucao:modo,
  pausaManual:pausado,luzesDoRelogioCompartilhado:true,
  abertura:'09:00',fechamento:'18:00',agoraServidorMs:now,
  metaLotes:{ativa:true,quantidade:10,dataAlvo:null},
  eventosReaisNoCiclo:0
 });
 return el.motorContadorEventos.textContent;
}

test('titulo da aba e mensagem da catraca dizem PARTICIPAÇÃO DE LUCRO',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 assert.match(html,/<h2>PARTICIPAÇÃO DE LUCRO \/ LOOP 3\.0<\/h2>/);
 assert.match(html,/id="motorContadorEventos"[^>]*>RELÓGIO DE PARTICIPAÇÃO DE LUCRO — FORA DO TURNO OU PAUSADO<\/p>/);
 assert.match(html,/A catraca completa um ciclo a cada 6 eventos válidos\./);
 assert.doesNotMatch(html,/id="motorContadorEventos"[^>]*>0 de 6 eventos/);
 const real=ler('src/producao/interface-aprovada-contas.js');
 const preview=ler('src/candidato/checkout-candidato-ui.js');
 for(const src of [real,preview]){
  assert.doesNotMatch(src,/\$\('motorContadorEventos'\)\.textContent=[\s\S]{0,80}de 6 eventos neste ciclo/);
  assert.match(src,/visorCatraca\.registrarAgenda\(/);
 }
});
test('mensagem depende do turno; não exibe números nem ensaio',()=>{
 const casos=[
  ['2026-11-23T10:00:00-03:00','AGENDADA',false,'EM ANDAMENTO'],
  ['2026-11-23T20:00:00-03:00','AGENDADA',false,'FORA DO TURNO OU PAUSADO'],
  ['2026-11-23T10:00:00-03:00','STOP',true,'FORA DO TURNO OU PAUSADO'],
  ['2026-11-23T10:00:00-03:00','NATURAL',false,'MODO LIVRE']
 ];
 for(const [hora,modo,pausado,estado] of casos){
  const msg=simularRelogio({hora,modo,pausado});
  assert.equal(msg,'RELÓGIO DE PARTICIPAÇÃO DE LUCRO — '+estado);
  assert.doesNotMatch(msg,/0\s*\/\s*6|6\s*\/\s*6|Eventos confirmados|de 6|teste/i);
 }
});
test('filas A/B aumentam sem mexer em ordem e permitem rolar mais de dez',()=>{
 const css=ler('src/candidato/escritorio-cliente-integrado.css');
 const escopo=css.slice(css.indexOf('/* Filas reais A/B: altura para dez posições'));
 assert.ok(escopo.length>500);
 assert.match(escopo,/\.cliente-integrado #conteudoTabuleiro \.loop03-mapa-grade\{\s*align-items:stretch/);
 assert.match(escopo,/\.loop03-mapa-grade>\.bloco-fila-participante\{[\s\S]*?min-height:clamp\(490px,39vw,560px\)/);
 assert.match(escopo,/#motorFilaA,\s*\.cliente-integrado #conteudoTabuleiro #motorFilaB\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
 assert.match(escopo,/@media\(max-width:600px\)\{[\s\S]*?min-height:355px/);
 const html=ler('src/candidato/checkout-candidato-ui.html');
 for(const id of ['quadroMotorFilaA','quadroMotorFilaB',
  'motorFilaA','motorFilaB','motorFilaADetalhes','motorFilaBDetalhes'])
  assert.ok(html.includes('id="'+id+'"'),id);
});
