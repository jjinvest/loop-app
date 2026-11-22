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
 assert.match(html,/GIROS \/ HORA/);
 assert.match(html,/LUZES \/ HORA/);
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
 assert.match(visor,/const luzesHora=\$\('loop03LuzesHoraIntegrado'\)/);
 assert.match(visor,/if\(resumo&&compartilhado&&operadorAberto&&valido\)/);
 assert.doesNotMatch(visor,/Nao renomear GIROS NAS ULTIMAS 24H/);
});
