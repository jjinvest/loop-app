'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');
const fonte=arquivo=>fs.readFileSync(
 path.join(__dirname,'..',arquivo),'utf8');

test('varredura: quadro extra nao reaparece; sino, foto e abas originais ficam',()=>{
 const html=renderizarInterfaceAprovada();
 assert.doesNotMatch(html,/id="loopEstadoIntegrado"|id="loopResumoMotor"|<h3>Estado do LOOP<\/h3>/);
 for(const id of ['loop03Sino','loop03PainelAvisos','loop03AlterarFotoTopo',
  'loop03ImagemFotoTopo','arquivoFotoPerfil','formFotoPerfil',
  'loop03ImagemFotoRodape','abaTabuleiro','abaPosicoes',
  'loopAcessoAdminMenu','conviteIndicadorEntrada','cadastroIndicador'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="loopAcessoAdminMenu"[^>]*hidden/);
 assert.match(html,/id="cadastroIndicador"[^>]*readonly/);
 assert.match(html,/href="\/loja"/);
 assert.doesNotMatch(html,/href="\/staging\/loja"/);
});
test('varredura: foto redonda, sininho abaixo, sem alerta de foto desativada',()=>{
 const css=fonte('src/producao/acabamento-botoes-real.css');
 const js=fonte('src/producao/interface-aprovada-contas.js');
 assert.match(css,/clip-path:circle\(50% at 50% 50%\)/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/#loop03AlterarFotoTopo\{order:1\}/);
 assert.match(css,/#loop03Sino\{[^}]*order:2/);
 assert.match(js,/fetch\('\/api\/contas\/foto-perfil'/);
 assert.match(js,/'X-Loop-Csrf':csrf/);
 assert.doesNotMatch(js,/A foto de perfil ainda precisa ser ligada ao armazenamento real/);
 assert.doesNotMatch(js,/loopResumoMotor|loopEstadoIntegrado/);
});
test('varredura: VILELA no convite e atalho do admin exige operador real',()=>{
 const js=fonte('src/producao/interface-aprovada-contas.js');
 assert.match(js,/Convite de @'\+nickVisivel\(indicadorNick\)/);
 assert.match(js,/campoIndicador\.value=indicadorNick\?nickVisivel\(indicadorNick\)/);
 assert.match(js,/const liberado=d\?\.operador===true/);
 assert.ok(js.includes("$('loopAcessoAdminMenu')"));
 const api=fonte('src/producao/gateway-admin-comercial.js');
 assert.match(api,/app\.post\('\/api\/operador\/entrar'/);
 assert.match(api,/sessoes\.autenticar\(req\.body\.senha\)/);
});
