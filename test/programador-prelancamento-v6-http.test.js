'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {projetarCaixaPrelancamentoV6}=require('../src/domain/projetar-caixa-prelancamento-v6');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
test('100 PDFs com liquido R$225 nao sustentam 16 ciclos nominais de R$250',()=>{
 const r=projetarCaixaPrelancamentoV6({compras:100,liquidoPorCompraCentavos:22500});
 assert.equal(r.totalLiquidoHipoteticoCentavos,2250000);
 assert.deepEqual(r.alocacaoMatematicaCentavos,{
  centro:1125000,investimento:750000,reserva:375000
 });
 assert.equal(r.girosPelasCompras,16);
 assert.equal(r.comprasRestantesAposGirosPorEvento,4);
 assert.equal(r.girosPeloCaixaMatematico,15);
 assert.equal(r.tetoHipoteticoDeGiros,15);
 assert.equal(r.girosSemCoberturaNoCenario,1);
 assert.equal(r.diferencaReferenciaMenosLiquidoCentavos,250000);
 assert.equal(r.saldoReconciliadoCentavos,0);
 assert.equal(r.transferenciasHabilitadas,false);
 const completo=projetarCaixaPrelancamentoV6({
  compras:100,liquidoPorCompraCentavos:25000});
 assert.equal(completo.girosPelasCompras,16);
 assert.equal(completo.girosPeloCaixaMatematico,16);
 assert.equal(completo.tetoHipoteticoDeGiros,16);
 assert.equal(completo.diferencaReferenciaMenosLiquidoCentavos,0);
 assert.throws(()=>projetarCaixaPrelancamentoV6({
  compras:100.5,liquidoPorCompraCentavos:22500}),/COMPRAS_INVALIDAS/);
});
test('API da projeção e da agenda exige chave local, rejeita campos extras',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const senha='senha-muito-grande-laboratorio-v6-2026';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:senha}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+
   '/api/admin/circuit-break-v6-demo';
 const headers={Authorization:'Bearer '+senha,'Content-Type':'application/json'};
 assert.equal((await fetch(url+'/programacoes')).status,401);
 assert.equal((await fetch(url+'/projecao-prelancamento',{
  method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
 })).status,401);
 const consulta=await fetch(url+'/programacoes',{headers});
 assert.equal(consulta.status,200);
 assert.equal((await consulta.json()).agendas.length,0);
 const simular=async payload=>{
  const r=await fetch(url+'/projecao-prelancamento',{method:'POST',
    headers,body:JSON.stringify(payload)});
  return {status:r.status,data:await r.json()};
 };
 assert.equal((await simular({
  compras:100,liquidoPorCompraCentavos:22500,caixaSacavel:999999
 })).status,400);
 const calculo=await simular({compras:100,liquidoPorCompraCentavos:22500});
 assert.equal(calculo.status,200);
 assert.equal(calculo.data.tetoHipoteticoDeGiros,15);
 assert.equal(calculo.data.transferenciasHabilitadas,false);
 const plano={agendaId:'agenda-http-circuit-2026',modo:'DISTRIBUIDO',
  quantidade:2,inicioEm:'2026-10-18T09:00:00-03:00',
  fimEm:'2026-10-18T18:00:00-03:00'};
 const agendar=async payload=>{
  const r=await fetch(url+'/programacoes',{method:'POST',headers,
   body:JSON.stringify(payload)});
  return {status:r.status,data:await r.json()};
 };
 assert.equal((await agendar({...plano,autorizarPix:true})).status,400);
 const gravado=await agendar(plano);
 assert.equal(gravado.status,201);
 assert.equal(gravado.data.quantidade,2);
 assert.equal((await agendar(plano)).status,409);
 const cancel=await fetch(url+'/programacoes/'+plano.agendaId+'/cancelar',{
  method:'POST',headers,body:'{}'
 });
 assert.equal(cancel.status,200);
 assert.equal((await cancel.json()).status,'CANCELADA');
 const publico=require('../src/server').listen(0,'127.0.0.1');
 await once(publico,'listening');t.after(()=>new Promise(resolve=>publico.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publico.address().port+
  '/api/admin/circuit-break-v6-demo/programacoes')).status,404);
});
