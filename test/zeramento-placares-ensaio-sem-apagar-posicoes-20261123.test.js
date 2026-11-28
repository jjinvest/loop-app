'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
const {projetarAgendaTabuleiroCompartilhada}=require('../src/producao/projecao-agenda-tabuleiro-compartilhada');
test('zerar somente relógio: 5 posições na B e 2 cadastros permanecem, idempotente',t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 banco.exec("CREATE TABLE contas_teste(id INTEGER PRIMARY KEY);"+
  "CREATE TABLE posicoes_teste(id INTEGER PRIMARY KEY,fila TEXT);");
 for(let i=1;i<=2;i++)banco.prepare('INSERT INTO contas_teste(id) VALUES(?)').run(i);
 for(let i=1;i<=5;i++)banco.prepare("INSERT INTO posicoes_teste(id,fila) VALUES(?,'B')").run(i);
 let agora=Date.parse('2026-11-23T08:50:00-03:00');
 const motor={banco,_transacao:fn=>{banco.exec('BEGIN IMMEDIATE');
  try{const r=fn(null);banco.exec('COMMIT');return r;}
  catch(e){banco.exec('ROLLBACK');throw e;}},
  consultar:()=>({tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},
   catraca:{giros:0},filaA:0,filaB:5})};
 const operador=new OperacaoCatracaAdminSQLite({banco,motor,
  agora:()=>new Date(agora)});
 const anterior=operador.consultar();
 operador.configurar({modo:'AUTOMATICA',janelaInicio:'09:00',
  janelaFim:'18:00',limiteDiario:null,revisaoEsperada:anterior.revisao,
  metaCentrosDia:10,metaDataAlvo:'2026-11-23',motivo:'TESTES INTERNOS'});
 agora=Date.parse('2026-11-23T12:00:00-03:00');
 let d=operador.consultar();
 assert.equal(d.luzesRelogioHoje,20);
 assert.equal(d.ciclosRelogioHoje,3);
 assert.equal(operador.zerarPlacaresDeTesteUmaVez(),true);
 assert.equal(operador.zerarPlacaresDeTesteUmaVez(),false);
 d=operador.consultar();
 assert.deepEqual([d.luzesRelogioHoje,d.ciclosRelogioHoje,
  d.luzesRelogio24h,d.ciclosRelogio24h,
  d.luzesRelogioAcumuladas,d.ciclosRelogioAcumulados],
  [0,0,0,0,0,0]);
 assert.equal(d.eventosNoCiclo,0);
 assert.equal(d.filaB,5);
 assert.equal(d.marcoZeramentoVisualMs,agora);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM contas_teste').get().n,2);
 assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM posicoes_teste WHERE fila='B'").get().n,5);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_catraca_admin_historico WHERE acao=?')
  .get('ZERAR_PLACARES_TESTE_20261123').n,1);
 const agenda=projetarAgendaTabuleiroCompartilhada(d);
 assert.equal(agenda.marcoZeramentoVisualMs,agora);
 assert.equal(agenda.luzesRelogioHoje,0);
 agora=Date.parse('2026-11-23T12:09:00-03:00');
 d=operador.consultar();
 assert.equal(d.luzesRelogioHoje,1);
 assert.equal(d.ciclosRelogioHoje,0);
 assert.equal(d.luzesRelogio24h,1);
 agora=Date.parse('2026-11-23T12:54:00-03:00');
 d=operador.consultar();
 assert.equal(d.luzesRelogioHoje,6);
 assert.equal(d.ciclosRelogioHoje,1);
 assert.equal(d.filaB,5);
});
test('LEDs e 3 indicadores compartilhados recomeçam em zero no marco',()=>{
 const agora=Date.parse('2026-11-23T12:00:00-03:00');
 const estado={modo:'AUTOMATICA',janelaInicio:'09:00',janelaFim:'18:00',
  agoraServidorMs:agora,proximaLuzPrevistaEmMs:agora+540000,
  metaCentrosDia:10,metaDataAlvo:'2026-11-23',
  intervaloLuzSegundos:540,horarioPermitido:true,
  eventosNoCiclo:0,ciclosConcluidos:0,girosHoje:0,giros24h:0,
  luzesRelogioHoje:0,ciclosRelogioHoje:0,
  luzesRelogio24h:0,ciclosRelogio24h:0,
  luzesRelogioAcumuladas:0,ciclosRelogioAcumulados:0,
  marcoZeramentoVisualMs:agora};
 const agenda=projetarAgendaTabuleiroCompartilhada(estado);
 const js=fs.readFileSync(path.resolve(__dirname,'../src/shared/visor-catraca.js'),'utf8');
 const elementos={};
 const elem=id=>{
  if(!elementos[id]){
   const classes=new Set();
   elementos[id]={textContent:'',hidden:false,offsetWidth:20,
    classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),
     add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}};
  }
  return elementos[id];
 };
 const fakeDate=class extends Date{static now(){return agora;}};
 const ctx={window:{setInterval:()=>1,matchMedia:()=>({matches:true})},
  document:{hidden:false,body:{classList:{contains:()=>true}}},
  Date:fakeDate,Intl,Math,Number,String,Object,setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(js,ctx,{timeout:3000});
 const visor=ctx.window.LoopVisorCatraca.criar({elemento:elem});
 visor.registrarAgenda(agenda);
 assert.equal(elem('loop03Giros24Integrado').textContent,'0');
 assert.equal(elem('loop03LuzesHoraIntegrado').textContent,'0 / 60');
 assert.equal(elem('loop03NumeroIntegrado').textContent,'0 / 6');
 assert.match(elem('estadoRelogioTabuleiro').textContent,/Eventos: 0\/6 luzes · 0\/60 luzes/);
 for(let i=1;i<=6;i++)
  assert.equal(elem('motorBolinha'+i).classList.contains('loop03-relogio-luz-visual'),false);
});

test('zerar meta de ensaio preserva bolas e cadastros e permite nova meta',t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 banco.exec('CREATE TABLE clientes_teste(id INTEGER PRIMARY KEY);'+
  'CREATE TABLE bolas_teste(id INTEGER PRIMARY KEY,fila TEXT);');
 for(let i=1;i<=2;i++)banco.prepare('INSERT INTO clientes_teste VALUES(?)').run(i);
 for(let i=1;i<=5;i++)banco.prepare("INSERT INTO bolas_teste VALUES(?,'B')").run(i);
 const agora=Date.parse('2026-11-24T09:00:00-03:00');
 const motor={banco,_transacao:fn=>fn(null),consultar:()=>({
  filaA:0,filaB:5,tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},
  catraca:{giros:0}
 })};
 const op=new OperacaoCatracaAdminSQLite({banco,motor,agora:()=>new Date(agora)});
 const anterior=op.consultar();
 op.configurar({modo:'AUTOMATICA',janelaInicio:'09:00',
  janelaFim:'18:00',limiteDiario:null,revisaoEsperada:anterior.revisao,
  metaCentrosDia:10,metaDataAlvo:'2026-11-24',motivo:'TESTAR META DEZ'});
 assert.equal(op.consultar().metaCentrosDia,10);
 assert.equal(op.zerarMetaDoRelogioUmaVez(),true);
 assert.equal(op.zerarMetaDoRelogioUmaVez(),false);
 const d=op.consultar();
 assert.equal(d.metaCentrosDia,0);
 assert.equal(d.metaDataAlvo,null);
 assert.equal(d.luzesRelogioHoje,0);
 assert.equal(d.ciclosRelogioHoje,0);
 assert.equal(d.filaB,5);
 assert.equal(projetarAgendaTabuleiroCompartilhada(d).metaLotes,null);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM clientes_teste').get().n,2);
 assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM bolas_teste WHERE fila='B'").get().n,5);
 assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM loop_real_catraca_admin_historico WHERE acao='ZERAR_META_RELOGIO_20261124'").get().n,1);
 op.configurar({modo:'AUTOMATICA',janelaInicio:'09:00',
  janelaFim:'18:00',limiteDiario:null,revisaoEsperada:d.revisao,
  metaCentrosDia:3,metaDataAlvo:'2026-11-24',motivo:'NOVA META OPERADOR'});
 assert.equal(projetarAgendaTabuleiroCompartilhada(op.consultar()).metaLotes.quantidade,3);
});
