'use strict';
// Verificacao nao destrutiva das regras visuais APROVADAS: aba Tabuleiro,
// Minhas Posicoes, Minha Equipe, nick e coroa. Nao desenha ou altera telas.
// Provas visuais pixel-a-pixel continuam dependentes do Playwright/screenshot.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const f=file=>readFileSync(path.join(__dirname,'../src/laboratorio',file),'utf8');
test('contrato de interface: tabs aprovadas, nick privado, coroa e seis cadeiras',()=>{
 const shell=f('loop-03-shell.js'), participante=f('participante-demo.js'),
  html=f('participante-demo.html'),css=f('loop-03-shell.css');
 for(const aba of ['tabuleiro','posicoes','rede'])
  assert.match(shell,new RegExp('data-loop03-aba="'+aba+'"'));
 for(const id of ['loop03NickVisor','loop03CoroaTabuleiro','loop03CoroaVisor',
  'loop03NomeBaixo','loop03LetraRodape','loop03OpcoesPosicoes','loop03ListaEquipe'])
  assert.ok(shell.includes(id),'Campo/controle aprovado ausente: '+id);
 assert.match(shell,/h2>Minha Equipe<\/h2>/);
 assert.match(shell,/Tabuleiro LOOP 3\.0/);
 assert.match(shell,/NickVisor/);
 assert.match(shell,/dados\.hidden=!nick/);
 assert.match(shell,/naCatraca/);
 assert.match(shell,/e\('loop03CoroaTabuleiro'\)\.hidden=!naCatraca/);
 assert.match(shell,/limitePosicoesAtivas/);
 assert.match(participante,/mostrarMapa\(visao\.mapaCores,visao\.linkIndicacao\?\.apelido\)/);
 assert.match(participante,/\.textContent=nick/);
 assert.match(html,/Centro e seis posições do tabuleiro/);
 assert.match(css,/\.loop03-roda \.tabuleiro-centro/);
 for(let i=1;i<=6;i++)
  assert.match(css,new RegExp('\\.loop03-roda \\.tabuleiro-vaga-'+i));
 assert.doesNotMatch(shell,/data-loop03-aba="ativacoes"/i);
 assert.doesNotMatch(shell,/Minhas Ativações/);
 console.log('LOOP_VISUAL_CONTRATO='+JSON.stringify({
  abasValidas:3,cadeirasTabuleiro:6,nickPersistenteNaInterface:true,
  coroaCondicionadaACatraca:true,atalhoAtivacoesRevogado:true,
  pixelsComparados:false,layoutAlterado:false}));
});
