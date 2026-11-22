'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ControleCaixaCatracaLoopSQLite}=require(
 '../src/producao/controle-caixa-catraca-loop-sqlite');
const dia='2026-11-18';
const momento=h=>Date.parse(dia+'T'+h+':00-03:00');
const criar=({comprovar=true}={})=>{
 const db=new DatabaseSync(':memory:');
 let ts=momento('09:00'),chamadas=0;
 const dados=[];
 const provas=comprovar?{confirmarReservaCentros:pedido=>{
  chamadas++;dados.push(pedido);
  return {ambiente:'PRODUCAO',estado:'RESERVA_SEGREGADA',
   valorReservadoCentavos:pedido.reservaTotalCentavos,
   comprovanteId:'extrato-psp-'+pedido.dia};
 }}:null;
 const controle=new ControleCaixaCatracaLoopSQLite({
  banco:db,provas,agora:()=>ts});
 return {db,controle,avancar:h=>ts=momento(h),provas:dados,
  comprovacoes:()=>chamadas};
};
const configurar=(controle,extras={})=>controle.programar({
 dia,abertura:'09:00',fechamento:'18:00',
 metaCentros:5,reservaPorCentroCentavos:150000,
 ...extras});
test('sem banco/PSP comprovado nao cria sequer reserva operacional',()=>{
 const {db,controle}=criar({comprovar:false});
 try{
  assert.deepEqual(controle.consultar({dia}),{
   dia,programada:false,centrosAutorizados:0,
   luzesAutorizadas:0,caixaComprovado:false});
  assert.throws(()=>configurar(controle),
   /CATRACA_CAIXA_COMPROVACAO_EXTERNA_INDISPONIVEL/);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_caixa_programacao'
  ).get().n,0);
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:1,liberacaoOperador:true}),/PAUSADA_OU_SEM_RESERVA/);
 }finally{db.close();}
});
test('5 centros criam direito operacional a 30 LUZES apenas com reserva provada',()=>{
 const {db,controle,avancar,provas,comprovacoes}=criar();
 try{
  const resultado=configurar(controle);
  assert.equal(resultado.metaCentros,5);
  assert.equal(resultado.luzesPlanejadas,30);
  assert.equal(resultado.intervaloLuzSegundos,18*60);
  assert.equal(resultado.reservaTotalCentavos,750000);
  assert.equal(resultado.estado,'PAUSADA');
  assert.equal(provas.length,1);
  assert.equal(provas[0].reservaTotalCentavos,750000);
  assert.equal(comprovacoes(),1);
  assert.equal(configurar(controle).repetido,true);
  assert.throws(()=>controle.definirAtivacao({dia,ativa:true}),
   /CATRACA_CAIXA_ATIVACAO_INVALIDA/);
  avancar('09:18');
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:1,liberacaoOperador:true}),
   /CATRACA_CAIXA_PAUSADA_OU_SEM_RESERVA/);
  controle.definirAtivacao({dia,ativa:true,autorizacaoOperador:true});
  for(let n=1;n<=30;n++){
   const minuto=9*60+18*n;
   const h=String(Math.floor(minuto/60)).padStart(2,'0')+':'+
    String(minuto%60).padStart(2,'0');
   avancar(h);
   const r=controle.autorizarLuz({dia,indiceLuz:n,liberacaoOperador:true});
   assert.equal(r.autorizada,true);
   assert.equal(r.repetida,false);
   assert.equal(r.centroOrdinal,Math.ceil(n/6));
   assert.equal(r.luzNoCentro,(n-1)%6+1);
   assert.equal(r.movimentoFinanceiro,false);
   assert.equal(controle.autorizarLuz({
    dia,indiceLuz:n,liberacaoOperador:true}).repetida,true);
  }
  assert.equal(controle.consultar({dia}).luzesAutorizadas,30);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_caixa_autorizacoes'
  ).get().n,30);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE '%compra%'"
  ).get().n,0,'nenhuma venda foi consultada nem fabricada');
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:31,liberacaoOperador:true}),/META_EXCEDIDA/);
 }finally{db.close();}
});
test('relógio não adianta luz, não cria rajada e respeita pausa',()=>{
 const {db,controle,avancar}=criar();
 try{
  configurar(controle);
  controle.definirAtivacao({dia,ativa:true,autorizacaoOperador:true});
  avancar('09:17');
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:1,liberacaoOperador:true}),/FORA_DO_INTERVALO/);
  avancar('09:18');
  controle.autorizarLuz({dia,indiceLuz:1,liberacaoOperador:true});
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:3,liberacaoOperador:true}),/AGUARDANDO_INTERVALO|FORA_DE_ORDEM/);
  avancar('09:19');
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:2,liberacaoOperador:true}),/AGUARDANDO_INTERVALO/);
  avancar('09:36');
  controle.autorizarLuz({dia,indiceLuz:2,liberacaoOperador:true});
  controle.definirAtivacao({dia,ativa:false,autorizacaoOperador:true});
  avancar('09:54');
  assert.throws(()=>controle.autorizarLuz({
   dia,indiceLuz:3,liberacaoOperador:true}),/PAUSADA_OU_SEM_RESERVA/);
  assert.equal(controle.consultar({dia}).luzesAutorizadas,2);
 }finally{db.close();}
});
test('mudança de meta exige nova política e não consome outra reserva',()=>{
 const {db,controle}=criar();
 try{
  configurar(controle);
  assert.throws(()=>configurar(controle,{metaCentros:10}),
   /CATRACA_CAIXA_DIA_JA_PROGRAMADO/);
  assert.throws(()=>configurar(controle,{reservaPorCentroCentavos:1}),
   /CATRACA_CAIXA_DIA_JA_PROGRAMADO/);
  assert.equal(controle.consultar({dia}).reservaTotalCentavos,750000);
 }finally{db.close();}
});
