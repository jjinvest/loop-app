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
 assert.match(ui,/desdeInicio=1/);
 assert.match(ui,/d\.janela\.length>10/);
 assert.match(ui,/d\.pagina\.length>30/);
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
 assert.match(js,/Fila vazia\./);
 assert.match(js,/ordem de espera/);
 assert.match(js,/filaSelecionada===fila/);
});

test('exibicao global tem 10 no painel e 30 por pagina desde 1, sem reordenar o motor',()=>{
 const {motor,titular}=montar();
 const primeira=motor.consultarFilaPaginada({titularId:titular,fila:'A',desdeInicio:true});
 assert.equal(primeira.total,95);
 assert.deepEqual(primeira.janela.map(p=>p.ordem),Array.from({length:10},(_,i)=>i+1));
 assert.equal(primeira.pagina.length,30);
 assert.deepEqual(primeira.pagina.map(p=>p.ordem),Array.from({length:30},(_,i)=>i+1));
 assert.equal(primeira.pagina[0].numero,1);
 assert.equal(primeira.proximaPagina,1);
 const segunda=motor.consultarFilaPaginada({titularId:titular,fila:'A',desdeInicio:true,pagina:1});
 assert.equal(segunda.pagina[0].ordem,31);
 assert.equal(segunda.pagina[29].ordem,60);
 const ultima=motor.consultarFilaPaginada({titularId:titular,fila:'A',desdeInicio:true,pagina:3});
 assert.deepEqual(ultima.pagina.map(p=>p.ordem),[91,92,93,94,95]);
 assert.equal(ultima.proximaPagina,null);
 const b=motor.consultarFilaPaginada({titularId:titular,fila:'B',desdeInicio:true});
 assert.deepEqual(b.janela.map(p=>p.ordem),[1,2,3]);
 assert.deepEqual(b.pagina.map(p=>p.numero),[201,202,203]);
 assert.equal(b.proximaPagina,null);
 const estado=motor._sim().filas.filaA;
 assert.deepEqual(estado.slice(0,3).map(p=>p.id),[1,2,3]);
});
test('mil lugares permitem 34 paginas sem mudar o ID unico',()=>{
 const {motor,titular}=montar();
 const fila=Array.from({length:1000},(_,i)=>({
  id:15000+i*10,participanteId:i===490?titular:
   'titular-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',empresa:false
 }));
 motor._sim=()=>({filas:{filaA:fila,filaB:[]}});
 const primeira=motor.consultarFilaPaginada({titularId:titular,fila:'A',desdeInicio:true});
 assert.deepEqual(primeira.janela.map(p=>p.ordem),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(primeira.janela[0].numero,15000);
 const ultima=motor.consultarFilaPaginada({titularId:titular,fila:'A',pagina:33,desdeInicio:true});
 assert.equal(ultima.pagina.length,10);
 assert.equal(ultima.pagina[0].ordem,991);
 assert.equal(ultima.pagina[9].ordem,1000);
 assert.equal(ultima.pagina[9].numero,24990);
 assert.equal(ultima.proximaPagina,null);
 assert.equal(fila[999].id,24990);
});
