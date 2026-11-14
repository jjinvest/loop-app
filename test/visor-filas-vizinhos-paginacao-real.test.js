'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const fs=require('node:fs');
const path=require('node:path');

function montar(){
 const titular='titular-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const outro='titular-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const pessoa=(id,participanteId,extra={})=>({
  id,participanteId,empresa:false,...extra
 });
 const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
 motor._titular=id=>assert.equal(id,titular);
 motor._sim=()=>({filas:{
  filaA:Array.from({length:95},(_,i)=>pessoa(i+1,i===51?titular:outro)),
  filaB:[pessoa(201,outro),pessoa(202,titular),pessoa(203,outro,
   {statusAdesao:'PENDENTE'}),pessoa(204,outro,{statusAdesao:'REVISAR_PSP'})]
 }});
 return {motor,titular};
}
test('janela tem duas acima, própria e duas abaixo; página parte da própria',()=>{
 const {motor,titular}=montar();
 const r=motor.consultarFilaPaginada({titularId:titular,fila:'A',posicaoId:52});
 assert.deepEqual(r.janela.map(x=>x.numero),[50,51,52,53,54]);
 assert.deepEqual(r.janela.filter(x=>x.minha).map(x=>x.numero),[52]);
 assert.equal(r.ancora.ordem,52);
 assert.equal(r.pagina.length,30);
 assert.equal(r.pagina[0].numero,52);
 assert.equal(r.proximaPagina,1);
 const segunda=motor.consultarFilaPaginada({
  titularId:titular,fila:'A',posicaoId:52,pagina:1
 });
 assert.equal(segunda.pagina[0].numero,82);
 assert.equal(segunda.pagina.length,14);
 assert.equal(segunda.proximaPagina,null);
});
test('A/B separadas, revisões excluídas, sem identidade de terceiros',()=>{
 const {motor,titular}=montar();
 const r=motor.consultarFilaPaginada({titularId:titular,fila:'B'});
 assert.deepEqual(r.janela.map(x=>x.numero),[201,202,203]);
 assert.equal(r.total,3);
 assert.equal(r.janela[2].pendente,true);
 assert.deepEqual(Object.keys(r.janela[0]).sort(),
  ['dourada','minha','numero','ordem','pendente']);
 assert.equal(JSON.stringify(r).includes('titular-bbbbbbbb'),false);
});
test('ID de terceiro e páginas inválidas são rejeitados',()=>{
 const {motor,titular}=montar();
 assert.throws(()=>motor.consultarFilaPaginada({
  titularId:titular,fila:'A',posicaoId:51
 }),/FILA_POSICAO_NAO_PERTENCE_A_TITULAR/);
 assert.throws(()=>motor.consultarFilaPaginada({
  titularId:titular,fila:'A',pagina:-1
 }),/FILA_PAGINA_INVALIDA/);
});
test('a expansão usa a caixa aprovada e controla páginas no cliente real',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/producao/interface-aprovada-contas.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../src/candidato/escritorio-cliente-integrado.css'),'utf8');
 assert.match(ui,/atualizarFilasAncoradas/);
 assert.match(ui,/Ver fila completa/);
 assert.match(ui,/Carregar mais posições/);
 assert.match(css,/\.loop03-fila-paginada/);
});

test('quadros A/B clicáveis e acessíveis mesmo quando estão vazios',()=>{
 const html=fs.readFileSync(path.join(__dirname,
  '../src/candidato/checkout-candidato-ui.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-contas.js'),'utf8');
 for(const fila of ['A','B']){
  assert.match(html,new RegExp('id="abrirMotorFila'+fila+'".*aria-expanded="false"'));
  assert.match(html,new RegExp('id="motorFila'+fila+'Detalhes"'));
  assert.match(js,new RegExp("selecionarQuadroFila\\(fila\\)"));
 }
 assert.match(js,/Fila vazia\. Quando houver posições/);
 assert.match(js,/Você ainda não possui posição nesta fila/);
 assert.match(js,/filaSelecionada===fila/);
});
