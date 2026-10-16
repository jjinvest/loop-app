'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {SimuladorLoop} = require('../src/domain/simulador-loop');
const {DESTINOS} = require('../src/domain/tabuleiro-loop');
const {mapaCoresDoEscritorio} = require('../src/domain/escritorio-individual-demo');

// Cenario reproduzivel: 100 compras iniciais + 25 novas compras em cinco
// ciclos de cinco vendas. Tudo ficticio, sem pagamento nem contemplacao real.
test('100 entradas uma a uma, indicacoes cruzadas, 25 novas vendas e exatamente 5 giros', () => {
  let relogioTick = 0;
  const relogio = () => new Date(Date.UTC(2026, 9, 16, 10) + (++relogioTick)*1000).toISOString();
  let loop = new SimuladorLoop({relogio});
  const todas = new Set();
  const indicacoes = [];
  const giros = [];
  const indicadoresPotenciais = [8,9,10,12,15,18,20,25,30,40,50,60,70,80,95,100,105,110,115];
  const pessoa = i => 'cliente-' + String(i).padStart(3,'0');
  const pedido = i => 'pedido-unico-' + String(i).padStart(3,'0');

  function conferirIntegridade(qtdCompras, concluidos){
    const s=loop.estado();
    const tab=[s.tabuleiro.centro,...s.tabuleiro.vagas].filter(Boolean);
    const fila=[...s.filas.A.pessoas,...s.filas.B.pessoas];
    const ativos=[...tab,...fila];
    const ids=ativos.map(p=>p.id);
    assert.equal(new Set(ids).size,ids.length,'posicoes ativas duplicadas');
    assert.ok(ativos.every(p=>todas.has(p.id)),'posicao nao criada pela compra');
    assert.equal(tab.length,Math.min(qtdCompras-concluidos,6),'ocupacao do tabuleiro');
    assert.equal(ativos.length,qtdCompras-concluidos,'conservacao das posicoes');
    assert.equal(fila.length,qtdCompras-concluidos-tab.length,'contagem da fila');
    assert.equal(s.catraca.giros,concluidos,'contagem de giros');
    assert.equal(s.tabuleiro.ciclosConcluidos,concluidos,'contagem de ciclos');
    assert.ok(ativos.every(p=>p.id>0&&p.id<=qtdCompras));
    return s;
  }

  function registrarCompra(i){
    const idPessoa=pessoa(i), idPedido=pedido(i);
    const pendente=i%3===0;
    const retorno=loop.registrarPosicaoSimulada({
      nome:'Cliente ficticio '+i,participanteId:idPessoa,vendaId:idPedido,
      adesaoPendente:pendente
    });
    assert.equal(retorno.repetida,false);
    assert.equal(retorno.posicao.id,i,'posicoes sequenciais');
    assert.ok(!todas.has(retorno.posicao.id));
    todas.add(retorno.posicao.id);
    const repetida=loop.registrarPosicaoSimulada({
      participanteId:idPessoa,vendaId:idPedido
    });
    assert.equal(repetida.repetida,true,'compra duplicada nunca cria segunda posicao');

    // A indicacao so e validada depois da compra do convidado.
    if(i>=14 && (i%2===0 || i%7===0)){
      const elegiveis=indicadoresPotenciais.filter(n=>n<i);
      const indicador=elegiveis[(i*7+Math.floor(i/4))%elegiveis.length];
      const indicadorId=pessoa(indicador);
      const eventoId='indicacao-paga-'+i;
      const resultado=loop.registrarIndicacaoSimulada({indicadorId,eventoId});
      assert.equal(resultado.repetida,false);
      assert.ok(resultado.quantidade>=1);
      const duplicada=loop.registrarIndicacaoSimulada({indicadorId,eventoId});
      assert.equal(duplicada.repetida,true,'uma indicacao paga so conta uma vez');
      indicacoes.push({indicador,convidado:i});
    }
    return idPedido;
  }

  // Abrir o tabuleiro progressivamente: 1, 2, 3, 4, 5, 6 pessoas.
  for(let i=1;i<=100;i++){
    registrarCompra(i);
    if(i<=6){
      const inicial=loop.prepararTabuleiro();
      assert.equal([inicial.centro,...inicial.vagas].filter(Boolean).length,i);
    }
    conferirIntegridade(i,0);
  }
  const inicial=loop.estado();
  assert.equal(inicial.filas.A.quantidade+inicial.filas.B.quantidade,94);
  assert.equal(inicial.tabuleiro.centro.id,1);
  assert.deepEqual(inicial.tabuleiro.vagas.map(p=>p.id),[2,3,4,5,6]);
  assert.ok(inicial.filas.A.quantidade>12,'ha indicados na fila A');
  assert.ok(inicial.filas.B.quantidade>12,'ha clientes na fila B');
  assert.ok(indicacoes.length>=35,'convites distribuidos entre clientes');
  assert.equal(mapaCoresDoEscritorio(loop,pessoa(1)).tabuleiro.centro.cor,'VERMELHO');
  assert.equal(mapaCoresDoEscritorio(loop,pessoa(100)).tabuleiro.vagas[1].cor,'DOURADO');

  // Cada um dos cinco ciclos recebe cinco NOVAS compras qualificadas.
  // A compra cria uma posicao e, uma unica vez, constitui uma venda do
  // ciclo que esta com ocupante no centro no momento.
  for(let giro=1;giro<=5;giro++){
    const tabAntes=loop.estado().tabuleiro;
    const filaAntes=loop.estado().filas;
    assert.equal(loop.tentarGiro().motivo,'CATRACA_PAUSADA');
    for(let etapa=1;etapa<=5;etapa++){
      const i=100+(giro-1)*5+etapa;
      const idPedido=registrarCompra(i);
      const venda=loop.registrarVendaNoCicloSimulada({vendaId:idPedido});
      assert.equal(venda.repetida,false);
      assert.equal(venda.venda.ordem,etapa);
      assert.equal(venda.venda.destinoPrevisto,DESTINOS[etapa-1]);
      assert.equal(venda.venda.posicaoCentroId,tabAntes.centro.id);
      assert.equal(venda.elegivelParaGiro,etapa===5);
      const idempotente=loop.registrarVendaNoCicloSimulada({vendaId:idPedido});
      assert.equal(idempotente.repetida,true,'venda duplicada nao acelera o ciclo');
      assert.equal(loop.estado().tabuleiro.centro.id,tabAntes.centro.id);
    }
    assert.equal(loop.estado().tabuleiro.vendasNoCiclo,5);
    assert.equal(loop.tentarGiro().motivo,'CATRACA_PAUSADA',
      'nem a quinta venda gira com catraca fechada');
    loop.abrirCatraca();
    const indice=loop.estado().filas;
    const esperado=indice.A.quantidade>0&&
      (indice.contadorA<3||indice.B.quantidade===0)?'A':'B';
    const resultado=loop.tentarGiro();
    assert.equal(resultado.girou,true);
    assert.equal(resultado.centroConcluido.id,tabAntes.centro.id);
    assert.equal(resultado.estado.centro.id,tabAntes.vagas[0].id);
    assert.deepEqual(resultado.estado.vagas.slice(0,4).map(p=>p.id),
      tabAntes.vagas.slice(1,5).map(p=>p.id));
    assert.equal(resultado.novaPosicao5.origemFila,esperado,
      'admissao prioritaria de 3A para 1B');
    assert.equal(resultado.estado.vendasNoCiclo,0);
    assert.equal(loop.tentarGiro().motivo,'CICLO_INCOMPLETO');
    loop.pausarCatraca();
    const quantidade=100+5*giro;
    const situacao=conferirIntegridade(quantidade,giro);
    assert.equal(situacao.filas.A.quantidade+situacao.filas.B.quantidade,
      94+4*giro,'cinco novas compras e uma entrada da fila');
    assert.equal(loop.tabuleiro.ciclosConcluidos[giro-1].vendas.length,5);
    assert.deepEqual(loop.tabuleiro.ciclosConcluidos[giro-1].vendas.map(v=>v.destinoPrevisto),DESTINOS);
    giros.push({
      giro,totalCompras:quantidade,concluidos:giro,
      filaA:situacao.filas.A.quantidade,
      filaB:situacao.filas.B.quantidade,
      totalFila:situacao.filas.A.quantidade+situacao.filas.B.quantidade,
      centro:situacao.tabuleiro.centro.id,
      novoNoTabuleiro:resultado.novaPosicao5.id,
      origem:resultado.novaPosicao5.origemFila
    });

    // Em meio ao teste, reproduzir reinicio do servidor a partir do snapshot.
    if(giro===3){
      const snapshot=loop.exportarSnapshot();
      loop=SimuladorLoop.restaurarSnapshot(snapshot,{relogio});
      assert.deepEqual(loop.exportarSnapshot(),snapshot);
      conferirIntegridade(quantidade,giro);
    }
    assert.ok(filaAntes.A.quantidade+filaAntes.B.quantidade>=6);
  }

  assert.equal(todas.size,125);
  assert.equal(indicacoes.length,loop.filas.indicacoesProcessadas.size);
  assert.equal(loop.tabuleiro.ciclosConcluidos.length,5);
  assert.equal(loop.tabuleiro.vendasProcessadas.size,25);
  assert.equal(giros.at(-1).totalFila,114);
  assert.equal(giros.at(-1).filaA+giros.at(-1).filaB,114);
  assert.equal(giros.filter(g=>g.origem==='A').length,4);
  assert.equal(giros.filter(g=>g.origem==='B').length,1);
  console.log('RESULTADO_LOOP_100_PESSOAS_5_GIROS='+JSON.stringify({
    iniciais:100,novas:25,total:125,indicacoesValidadas:indicacoes.length,
    posicoesNoTabuleiro:6,posicoesConcluidas:5,giros:5,
    filaFinal:114,prioridadeAdmissoes:'4A/1B',rodadas:giros
  }));
});
