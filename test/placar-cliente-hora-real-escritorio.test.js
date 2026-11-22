'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('os tres quadros pertencem ao shell comum de todas as abas do cliente',()=>{
 const html=source('src/producao/interface-aprovada-loop.js');
 const css=source('src/producao/acabamento-botoes-real.css');
 const js=source('src/producao/interface-aprovada-contas.js');
 assert.match(html,/CICLOS \/ 24H/);
 assert.match(html,/LUZES \/ 24H/);
 assert.match(html,/loop03LuzesHoraIntegrado/);
 assert.match(css,/#loop03IrPosicoesIntegrado>span/);
 assert.match(css,/#loop03StatusPosicao/);
 assert.match(js,/\$\('painelConta'\)\?\.hidden===false/);
 assert.match(js,/async function atualizarPlacarCliente\(\)/);
 assert.match(js,/else if\(!modoOperadorAtual&&\$\('painelConta'\)\?\.hidden===false\)/);
 assert.match(js,/if\(placarClienteConsultando\|\|modoOperadorAtual/);
 assert.match(js,/atualizarTopoPosicaoReal\(\)/);
 assert.match(js,/posicoesResumoReal\[0\]\.numero/);
});
test('contadores separados de giros persistidos e luzes no relógio',()=>{
 const admin=source('src/producao/operacao-catraca-admin-sqlite.js');
 const agenda=source('src/producao/projecao-agenda-tabuleiro-compartilhada.js');
 const visor=source('src/shared/visor-catraca.js');
 assert.match(admin,/_girosHora\(agoraMs,horaLocal\)/);
 assert.match(admin,/executado_em>=\? AND executado_em<=\?/);
 assert.match(agenda,/girosReaisHora:estado\.girosHora/);
 assert.match(visor,/const luzesHora=emTurno&&!finalizado/);
 assert.match(visor,/const luzes24h=\$\('loop03LuzesHoraIntegrado'\)/);
 assert.match(visor,/if\(resumo&&compartilhado&&operadorAberto\)/);
 assert.match(visor,/String\(Math\.floor\(estado\.passadas\/6\)\)/);
 assert.doesNotMatch(visor,/Nao renomear GIROS NAS ULTIMAS 24H/);
});

test('moldura central do operador usa ciclos confirmados e luzes do turno do cliente',()=>{
 const vm=require('node:vm');
 const js=source('src/producao/interface-aprovada-contas.js');
 const visor=source('src/shared/visor-catraca.js');
 assert.match(js,/caixas\[1\]\.querySelector\('small'\)\.textContent='CICLOS \/ 24H'/);
 assert.match(js,/controle\.agenda\.ciclosRelogio24h!==controle\.ciclosRelogio24h/);
 assert.doesNotMatch(visor,/giros\.textContent=String\(movimentosRelogio\)/);
 function executar(operador){
  const agora=Date.parse('2026-11-22T09:36:00-03:00');
  const FakeDate=class extends Date{static now(){return agora;}};
  const elements={};
  for(const id of ['loop03Giros24Integrado','loop03LuzesHoraIntegrado',
   'relogioTabuleiroIntegrado','tituloRelogioTabuleiro',
   'estadoRelogioTabuleiro','loop03NumeroIntegrado','loop03StatusPosicao']){
   elements[id]={textContent:'',parentElement:{querySelector:()=>({textContent:''})}};
  }
  const document={hidden:false,body:{classList:{
   contains:classe=>classe==='loop03-modo-operador'&&operador
  }}};
  const ctx={window:{setInterval:()=>1},document,
   Date:FakeDate,Intl,Math,Number,String,Object};
  vm.runInNewContext(visor,ctx,{timeout:2000});
  const instancia=ctx.window.LoopVisorCatraca.criar({
   elemento:id=>elements[id]||null
  });
  instancia.registrarAgenda({
   origem:'CATRACA_REAL_MESMO_SQLITE',
   modoExecucao:'AGENDADA',pausaManual:false,
   luzesDoRelogioCompartilhado:true,
   abertura:'09:00',fechamento:'18:00',agoraServidorMs:agora,
   girosReaisHora:3,girosReaisHoje:6,girosReais24h:0,
   ciclosReaisConcluidos:1,
   ciclosRelogio24h:1,luzesRelogio24h:6,
   eventosReaisNoCiclo:0,
   metaLotes:{ativa:true,quantidade:5,dataAlvo:null}
  });
  return {giros:elements.loop03Giros24Integrado.textContent,
   luzes:elements.loop03LuzesHoraIntegrado.textContent};
 }
 const cliente=executar(false),operador=executar(true);
 assert.deepEqual(operador,cliente);
 assert.deepEqual(cliente,{giros:'0',luzes:'2 / 30'});
});

test('somente o quadro central exibe duas metades iguais no operador e cliente',()=>{
 const css=source('src/producao/acabamento-botoes-real.css');
 const html=require('../src/producao/interface-aprovada-loop')
  .renderizarInterfaceAprovada();
 assert.match(html,/class="loop03-indicador loop03-placar-hora"/);
 assert.match(html,/class="loop03-placar-metade loop03-placar-giros"/);
 assert.match(html,/class="loop03-placar-metade loop03-placar-luzes"/);
 assert.match(css,/body\.loop03-logado \.cliente-integrado \.loop03-placar-hora\{/);
 assert.match(css,/body\.loop03-logado \.cliente-integrado \.loop03-placar-metade\{/);
 assert.match(css,/body\.loop03-logado \.cliente-integrado \.loop03-placar-metade\+ \.loop03-placar-metade\{/);
 assert.match(css,/border-top:1px solid #a98755/);
 assert.doesNotMatch(css,/loop03-modo-operador \.cliente-integrado \.loop03-placar-luzes\s*\{\s*display:none/);
 assert.doesNotMatch(css,/not\(\.loop03-modo-operador\) \.cliente-integrado \.loop03-placar-metade/);
 // Nao abrir a regra dos dois quadros laterais para o operador.
 assert.match(css,/body\.loop03-logado:not\(\.loop03-modo-operador\) \.cliente-integrado #loop03IrPosicoesIntegrado\{/);
 assert.match(css,/body\.loop03-logado:not\(\.loop03-modo-operador\) \.cliente-integrado \.loop03-placar-posicao\{/);
});

test('progresso atual/meta aparece igual para cliente e operador; só o operador limpa a repetição no canto direito',()=>{
 const vm=require('node:vm');
 const codigo=source('src/shared/visor-catraca.js');
 function fotografar(hora,operador){
  const agora=Date.parse(hora);
  const FakeDate=class extends Date{static now(){return agora;}};
  const elementos=Object.fromEntries([
   'relogioTabuleiroIntegrado','tituloRelogioTabuleiro',
   'estadoRelogioTabuleiro','loop03Giros24Integrado',
   'loop03LuzesHoraIntegrado','loop03NumeroIntegrado',
   'loop03StatusPosicao'
  ].map(id=>[id,{textContent:id==='loop03StatusPosicao'?
   '60 / 60 luzes':id==='loop03NumeroIntegrado'?'posição do titular':'—'}]));
  const tituloDireito={textContent:'EVENTOS NO CICLO'};
  elementos.loop03NumeroIntegrado.parentElement={
   querySelector:()=>tituloDireito
  };
  const ctx={
   window:{setInterval:()=>1},
   document:{hidden:false,body:{classList:{
    contains:n=>n==='loop03-modo-operador'&&operador
   }}},
   Date:FakeDate,Intl,Math,Number,String,Object
  };
  vm.runInNewContext(codigo,ctx,{timeout:2000});
  const visor=ctx.window.LoopVisorCatraca.criar({
   elemento:id=>elementos[id]||null
  });
  visor.registrarAgenda({
   origem:'CATRACA_REAL_MESMO_SQLITE',
   modoExecucao:'AGENDADA',pausaManual:false,
   luzesDoRelogioCompartilhado:true,
   abertura:'09:00',fechamento:'18:00',agoraServidorMs:agora,
   ciclosRelogio24h:0,luzesRelogio24h:0,
   eventosReaisNoCiclo:0,
   metaLotes:{ativa:true,quantidade:10,dataAlvo:null}
  });
  return {luzes:elementos.loop03LuzesHoraIntegrado.textContent,
   centro:elementos.loop03NumeroIntegrado.textContent,
   resumo:elementos.loop03StatusPosicao.textContent,
   titulo:tituloDireito.textContent};
 }
 for(const [hora,esperado,centro] of [
  ['2026-11-22T09:00:00-03:00','0 / 60','0 / 6'],
  ['2026-11-22T10:48:00-03:00','12 / 60','6 / 6'],
  ['2026-11-22T18:00:00-03:00','60 / 60','6 / 6']
 ]){
  const cliente=fotografar(hora,false),operador=fotografar(hora,true);
  assert.equal(cliente.luzes,esperado);
  assert.equal(operador.luzes,esperado);
  assert.equal(cliente.centro,'posição do titular',
   'placar direito do cliente permanece inalterado');
  assert.equal(operador.centro,centro);
  assert.equal(operador.resumo,'',
   'não duplicar 60/60 luzes abaixo do marcador do centro');
  assert.equal(cliente.resumo,'60 / 60 luzes',
   'não alterar o resumo da posição do cliente');
  assert.equal(operador.titulo,'EVENTOS NO CICLO');
 }
 const fonteOperador=source('src/producao/interface-aprovada-contas.js');
 assert.match(fonteOperador,/visorCatraca\.registrarAgenda\(controle\.agenda\)/);
 assert.match(fonteOperador,/visorCatraca\.registrarAgenda\(d\.agenda\)/);
 assert.doesNotMatch(codigo,/executarGiro\(|registrarCompra\(|registrarPosicao\(/);
});
