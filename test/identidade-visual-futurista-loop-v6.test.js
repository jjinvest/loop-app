'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const pages=[
 'public/index.html','public/produto.html',
 'src/laboratorio/participante-demo.html',
 'src/laboratorio/loja-cliente-demo.html',
 'src/laboratorio/financeiro-admin-demo.html',
 'src/laboratorio/escritorio-demo.html',
 'src/laboratorio/painel-catalogo.html',
 'src/laboratorio/cadastro-participantes-demo.html',
 'src/laboratorio/convite-cliente-demo.html'
];
test('identidade visual metálica única vinculada à plataforma toda',()=>{
 for(const p of pages){
  const html=file(p);
  assert.match(html,/\/css\/loop-futurista-v6\.css/,'Tema ausente: '+p);
  assert.match(html,/name="viewport"/,'Responsividade ausente: '+p);
 }
});
test('tabuleiro público V6 exibe centro, seis vagas e três roxos/três pretos',()=>{
 const html=file('public/index.html');
 assert.equal((html.match(/class="vaga v[1-6]"/g)||[]).length,6);
 assert.match(html,/class="vaga v6"/);
 assert.match(html,/class="centro"/);
 assert.equal((html.match(/<span title="[1-6]º evento: (?:participante|empresa)"><\/span>/g)||[]).length,6);
 assert.match(html,/3 roxos · participante/);
 assert.match(html,/3 pretos · empresa/);
});
test('escritório renderiza seis marcadores sem fingir recebimento',()=>{
 const html=file('src/laboratorio/participante-demo.html');
 assert.equal((html.match(/<span title="[1-6]º: (?:participante|empresa)"><\/span>/g)||[]).length,6);
 assert.match(html,/marcos-v6/);
 assert.match(html,/Os marcadores não são pagamentos realizados/);
 assert.match(html,/mapaTabuleiroParticipante/);
});
test('tema tem metalizados distintos, foco visível e preferência de movimento reduzido',()=>{
 const css=file('public/css/loop-futurista-v6.css');
 for(const key of ['--loop-metal','--loop-green-metal','.posicao-dourado',
  '.posicao-azul','.posicao-vermelho','.posicao-cinza',
  '.marcos span:nth-child(odd)','.marcos span:nth-child(even)',
  '.espaco-tabuleiro-demo','.tabuleiro .v6',':focus-visible',
  'prefers-reduced-motion','@media(max-width:480px)']){
  assert.ok(css.includes(key),'Faltando design token/regra: '+key);
 }
 assert.doesNotMatch(css,/@import|url\(https?:|@font-face/,'Sem recursos remotos no tema');
});
