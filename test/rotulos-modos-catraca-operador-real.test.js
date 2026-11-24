'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
const motor=fs.readFileSync('src/producao/operacao-catraca-admin-sqlite.js','utf8');
test('rotulos da catraca: Parada, Automatico, Agendada',()=>{
 assert.ok(ui.includes("['PAUSADA','Parada'],['MANUAL','Automático'],"));
 assert.ok(ui.includes("['AUTOMATICA','Agendada']"));
 assert.ok(!ui.includes("d.modo==='MANUAL'?'MODO AUTOMÁTICO'"),'aviso redundante removido; seletor preservado');
 assert.ok(ui.includes("Modo Automático: sem contagem pela agenda."));
 assert.ok(!ui.includes("['MANUAL','Manual']"));
 assert.ok(!ui.includes('Modo Manual: não há contagem automática.'));
});
test('somente textos: contratos de modo internos e janela 9-18 preservados',()=>{
 assert.ok(ui.includes("['PAUSADA','MANUAL','AUTOMATICA'].includes(d.modo)"));
 assert.ok(ui.includes("['PAUSADA','MANUAL','AUTOMATICA'].includes(controle.modo)"));
 assert.ok(ui.includes("modo.value==='MANUAL'"));
 assert.ok(ui.includes("modo.value==='PAUSADA'"));
 assert.ok(motor.includes("VALUES(1,1,'PAUSADA','09:00','18:00',NULL,1)"));
 assert.ok(motor.includes("if(process.env.NODE_ENV==='production')return {girou:false,motivo:'NAO_HOMOLOGADO'};"));
});
