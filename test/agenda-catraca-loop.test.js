'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PADRAO,FUSO,validarAgenda,agoraLocal,avaliarAgenda}=
 require('../src/domain/agenda-catraca-loop');
const sp=hora=>'2026-11-06T'+hora+'-03:00';
const at=hora=>Date.parse(sp(hora));
const cfg={...PADRAO,ativo:true};
test('Sao Paulo: abre 09h, primeira luz 09h10, fecha 18h sem contagem ficticia',()=>{
 assert.equal(FUSO,'America/Sao_Paulo');
 assert.equal(agoraLocal(at('08:59:00')).horario,'08:59');
 const antes=avaliarAgenda(cfg,at('08:59:00'));
 assert.equal(antes.dentroDoHorario,false);
 assert.equal(antes.podeContabilizar,false);
 const abre=avaliarAgenda(cfg,at('09:00:00'));
 assert.equal(abre.dentroDoHorario,true);
 assert.equal(abre.podeContabilizar,false);
 assert.equal(avaliarAgenda(cfg,at('09:09:59')).podeContabilizar,false);
 const primeiro=avaliarAgenda(cfg,at('09:10:00'));
 assert.equal(primeiro.podeContabilizar,true);
 assert.equal(primeiro.slot,1);
 assert.equal(primeiro.pulsoMaximo,1);
 assert.equal(avaliarAgenda({...cfg,ultimoDia:primeiro.dia,ultimoSlot:1},
  at('09:10:40')).podeContabilizar,false);
 assert.equal(avaliarAgenda(cfg,at('17:59:59')).dentroDoHorario,true);
 assert.equal(avaliarAgenda(cfg,at('18:00:00')).dentroDoHorario,false);
});
test('fechamento excepcional ate 21h somente no dia configurado',()=>{
 const excecao={...cfg,excecaoData:'2026-11-06',
  excecaoFechamento:'21:00'};
 assert.equal(avaliarAgenda(excecao,at('20:50:00')).dentroDoHorario,true);
 assert.equal(avaliarAgenda(excecao,at('21:00:00')).dentroDoHorario,false);
 assert.equal(avaliarAgenda(excecao,
  Date.parse('2026-11-07T19:00:00-03:00')).dentroDoHorario,false);
});
test('pausa manual bloqueia pulsos, mas nao altera relogio de vendas',()=>{
 const parado=avaliarAgenda({...cfg,pausaManual:true},at('10:30:00'));
 assert.equal(parado.dentroDoHorario,true);
 assert.equal(parado.podeContabilizar,false);
 assert.equal(avaliarAgenda({...cfg,ativo:false},at('10:30:00')).podeContabilizar,false);
});
test('config invalidos nao iniciam agendamento de ensaio',()=>{
 for(const params of [
  {...cfg,abertura:'27:00',fechamento:'09:00'},
  {...cfg,intervaloMinutos:0},
  {...cfg,intervaloMinutos:1.5},
  {...cfg,excecaoData:'2026-11-06'},
  {...cfg,excecaoFechamento:'21:00'},
  {...cfg,ultimoSlot:0.5}
 ])assert.throws(()=>validarAgenda(params),/AGENDA_/);
});
test('horarios livres: duas horas, madrugada e encerramento ate 00:00 do dia seguinte',()=>{
 const estendido={...cfg,intervaloMinutos:120,
  excecaoData:'2026-11-06',excecaoFechamento:'00:00'};
 assert.equal(avaliarAgenda(estendido,at('11:00:00')).podeContabilizar,true);
 assert.equal(avaliarAgenda(estendido,at('20:59:00')).dentroDoHorario,true);
 assert.equal(avaliarAgenda(estendido,at('23:59:00')).dentroDoHorario,true);
 assert.equal(avaliarAgenda(estendido,
  Date.parse('2026-11-07T00:00:00-03:00')).dentroDoHorario,false);
 const madrugada={...cfg,abertura:'18:00',fechamento:'02:00',
  intervaloMinutos:120};
 assert.equal(avaliarAgenda(madrugada,
  Date.parse('2026-11-07T01:00:00-03:00')).dentroDoHorario,true);
 assert.equal(avaliarAgenda(madrugada,
  Date.parse('2026-11-07T02:00:00-03:00')).dentroDoHorario,false);
 assert.doesNotThrow(()=>validarAgenda({...cfg,intervaloMinutos:600}));
});
