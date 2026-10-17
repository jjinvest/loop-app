'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {mapaCoresDoEscritorio}=require('../src/domain/escritorio-individual-demo');

const arq=arquivo=>readFileSync(join(__dirname,'..','src','laboratorio',arquivo),'utf8');

test('cem entradas: mapa marca minhas posicoes corretamente sem alterar fila nem a cor azul',()=>{
 const sim=new SimuladorLoop({
  relogio:()=>new Date('2026-10-16T14:00:00.000Z').toISOString()
 });
 for(let i=1;i<=100;i++){
  const dado=sim.registrarPosicaoSimulada({
   nome:'Cliente de teste '+i,
   participanteId:'cliente-'+String(i).padStart(3,'0'),
   vendaId:'pedido-mobile-'+String(i).padStart(3,'0'),
   adesaoPendente:i%3===0
  });
  assert.equal(dado.posicao.id,i);
 }
 const preenche=sim.prepararTabuleiro();
 assert.equal(preenche.centro.id,1);
 assert.equal(preenche.vagas[1].id,3);
 assert.equal(preenche.vagas[1].statusAdesao,'PRAZO_ENCERRADO');
 const indicacao=sim.registrarIndicacaoSimulada({
  indicadorId:'cliente-097',eventoId:'convite-mobile-101'
 });
 assert.equal(indicacao.repetida,false);
 const antes=sim.exportarSnapshot();
 const mapa99=mapaCoresDoEscritorio(sim,'cliente-099');
 assert.equal(mapa99.filaA.length,1);
 assert.equal(mapa99.filaB.length,92);
 assert.equal(mapa99.filaA[0].posicaoId,97);
 assert.equal(mapa99.filaA[0].minha,false);
 const p99=mapa99.filaB.find(p=>p.posicaoId===99);
 assert.deepEqual(p99,{posicaoId:99,cor:'AZUL',minha:true});
 const p98=mapa99.filaB.find(p=>p.posicaoId===98);
 assert.deepEqual(p98,{posicaoId:98,cor:'CINZA',minha:false});
 const mapa98=mapaCoresDoEscritorio(sim,'cliente-098');
 assert.deepEqual(mapa98.filaB.find(p=>p.posicaoId===98),
  {posicaoId:98,cor:'VERMELHO',minha:true});
 assert.deepEqual(mapa98.filaB.find(p=>p.posicaoId===99),
  {posicaoId:99,cor:'AZUL',minha:false});
 const mapa97=mapaCoresDoEscritorio(sim,'cliente-097');
 assert.deepEqual(mapa97.filaA[0],{posicaoId:97,cor:'VERMELHO',minha:true});
 const mapa3=mapaCoresDoEscritorio(sim,'cliente-003');
 assert.deepEqual(mapa3.tabuleiro.vagas[1],{
  posicaoId:3,cor:'DOURADO',minha:false
 });
 assert.deepEqual(mapaCoresDoEscritorio(sim,'cliente-001').tabuleiro.centro,{
  posicaoId:1,cor:'VERMELHO',minha:true
 });
 // O mapa e uma projecao: nunca move vagas ou altera posicoes.
 assert.deepEqual(sim.exportarSnapshot(),antes);
 for(const p of [mapa99.filaA[0],...mapa99.filaB,
  mapa99.tabuleiro.centro,...mapa99.tabuleiro.vagas]){
  if(!p)continue;
  assert.deepEqual(Object.keys(p).sort(),['cor','minha','posicaoId']);
  assert.ok(!JSON.stringify(p).includes('cliente-'));
 }
});

test('layout da fila e tabuleiro no celular preserva centro e seis vagas, filtros e acessibilidade',()=>{
 const html=arq('participante-demo.html');
 const css=arq('participante-demo.css');
 const js=arq('participante-demo.js');
 for(const id of ['mapaFilaAParticipante','mapaFilaBParticipante',
  'mapaTabuleiroParticipante','filtroResumoMapaParticipante',
  'filtroMinhasMapaParticipante','filtroTodasMapaParticipante',
  'contadorFilaAParticipante','contadorFilaBParticipante','resumoMapaParticipante',
  'atalhoAtivarParticipante']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/aria-pressed="true"/);
 assert.match(js,/filtroMapa==='minhas'/);
 assert.match(js,/i\+1/);
 assert.match(js,/posicoes\.length-anterior-1/);
 assert.match(js,/p\.minha/);
 assert.match(js,/aria-label/);
 assert.match(js,/tabuleiro-centro|classe:'centro'/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 assert.match(css,/\.tabuleiro-centro\{grid-column:2;grid-row:2/);
 for(let i=1;i<=6;i++)assert.match(css,new RegExp('\\.tabuleiro-vaga-'+i+'\\{'));
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/\.minha-posicao-demo/);
 assert.match(css,/\.atalhos-participante/);
 const loja=arq('loja-cliente-demo.html');
 assert.match(loja,/href="\/escritorio-vilela#tituloMapaParticipante"/);
 assert.match(loja,/href="\/escritorio-vilela#tituloHistoricoLojaParticipante"/);
});
