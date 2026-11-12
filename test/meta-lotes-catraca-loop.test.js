'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planejado,validarMeta,janelasDeLuz,dadosAtivacao}=
 require('../src/domain/meta-lotes-catraca-loop');
const {PADRAO}=require('../src/domain/agenda-catraca-loop');
const when=h=>Date.parse('2026-11-06T'+h+':00-03:00');
const original={quantidade:10,dataAlvo:null,ativadaDia:'2026-11-06',
 ativadaMinuto:9*60,ultimoDia:'2026-11-06',
 ultimoMinuto:-1,baseGiros:0};
test('10 centros distribuidos no turno 09-18 sem explosao no inicio',()=>{
 const a={...PADRAO,ativo:true};
 assert.equal(planejado(original,a,when('09:00')).ciclosAutorizadosAteAgora,0);
 assert.equal(planejado(original,a,when('09:52')).ciclosAutorizadosAteAgora,0);
 assert.equal(planejado(original,a,when('09:53')).ciclosAutorizadosAteAgora,1);
 assert.equal(planejado(original,a,when('12:00')).ciclosAutorizadosAteAgora,3);
 assert.equal(planejado(original,a,when('17:59')).ciclosAutorizadosAteAgora,10);
 assert.equal(planejado(original,a,when('18:00')).ciclosAutorizadosAteAgora,0);
});
test('meta iniciada no meio do turno distribui no tempo restante',()=>{
 const m={...original,ativadaMinuto:12*60};
 const a={...PADRAO,ativo:true};
 assert.equal(planejado(m,a,when('11:59')).ciclosAutorizadosAteAgora,0);
 assert.equal(planejado(m,a,when('12:00')).ciclosAutorizadosAteAgora,0);
 assert.equal(planejado(m,a,when('14:59')).ciclosAutorizadosAteAgora,5);
 assert.equal(planejado(m,a,when('17:59')).ciclosAutorizadosAteAgora,10);
});
test('meta por data especifica e horario livre ate meia noite',()=>{
 const m={...original,quantidade:5,dataAlvo:'2026-11-06'};
 const a={...PADRAO,ativo:true,fechamento:'00:00'};
 assert.equal(planejado(m,a,when('23:59')).ciclosAutorizadosAteAgora,5);
 assert.equal(planejado(m,a,
  Date.parse('2026-11-07T00:00:00-03:00')).abertoParaMeta,false);
 assert.equal(planejado(m,a,
  Date.parse('2026-11-07T09:30:00-03:00')).dataAlvoAtendida,false);
});
test('metas so aceitam inteiros positivos e data real',()=>{
 assert.deepEqual(dadosAtivacao(when('15:32')),
  {ativadaDia:'2026-11-06',ativadaMinuto:932});
 for(const m of [
  {...original,quantidade:-1},
  {...original,quantidade:1.5},
  {...original,dataAlvo:'2026-02-30'},
  {...original,ultimoDia:'2026-00-02'},
  {...original,baseGiros:-1}
 ])assert.throws(()=>validarMeta(m),/META_LOTES_CONFIG_INVALIDA/);
});
test('um milhao de ciclos distribuidos no tempo sem arredondamento que estoura teto',()=>{
 const a={...PADRAO,ativo:true};
 const meta={...original,quantidade:1000000};
 assert.equal(planejado(meta,a,when('09:00')).ciclosAutorizadosAteAgora,1851);
 assert.equal(planejado(meta,a,when('09:01')).ciclosAutorizadosAteAgora,3703);
 assert.equal(planejado(meta,a,when('17:59')).ciclosAutorizadosAteAgora,1000000);
 assert.doesNotThrow(()=>validarMeta({...original,quantidade:1000000}));
});

// Meta de dez ciclos nao transforma relogio em dinheiro ou compra criada.
// Turno 09–18 tem 540 minutos: 54/ciclo e cerca de 9/luz (60 luzes).
test('marcador do turno apresenta janelas ate a sexta luz e o giro',()=>{
 const agenda={...PADRAO,ativo:true},m=original;
 const primeira=janelasDeLuz(m,agenda,when('09:00'));
 assert.equal(primeira.janelasAutorizadasAteAgora,0);
 assert.equal(primeira.intervaloLuzSegundos,540);
 assert.equal(primeira.intervaloCicloSegundos,3240);
 assert.equal(primeira.marcoEstimado,true);
 assert.equal(primeira.dependeDeCompraConciliada,true);
 assert.equal(primeira.proximaJanelaEmMs,when('09:09'));
 assert.equal(janelasDeLuz(m,agenda,when('09:08')).janelasAutorizadasAteAgora,0);
 assert.equal(janelasDeLuz(m,agenda,when('09:09')).janelasAutorizadasAteAgora,1);
 assert.equal(janelasDeLuz(m,agenda,when('09:53')).janelasAutorizadasAteAgora,5);
 assert.equal(janelasDeLuz(m,agenda,when('09:54')).janelasAutorizadasAteAgora,6);
 assert.equal(janelasDeLuz(m,agenda,when('17:59')).janelasAutorizadasAteAgora,60);
 assert.equal(janelasDeLuz(m,agenda,when('17:59')).proximaJanelaEmMs,null);
 assert.equal(janelasDeLuz(m,agenda,when('18:00')),null);
});
test('meta ligada ao meio do turno recalcula intervalo sem retroagir',()=>{
 const agenda={...PADRAO,ativo:true};
 const m={...original,ativadaMinuto:12*60};
 const inicio=janelasDeLuz(m,agenda,when('12:00'));
 assert.equal(inicio.intervaloLuzSegundos,360);
 assert.equal(inicio.intervaloCicloSegundos,2160);
 assert.equal(inicio.janelasAutorizadasAteAgora,0);
 assert.equal(inicio.proximaJanelaEmMs,when('12:06'));
 assert.equal(janelasDeLuz(m,agenda,when('11:59')),null);
});
