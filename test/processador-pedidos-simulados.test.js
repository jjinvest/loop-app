'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RepositorioSimulacoesSQLite } = require('../src/domain/repositorio-simulacoes-sqlite');
const { ProcessadorPedidosSimulados, STATUS_CONFIRMADO } = require('../src/domain/processador-pedidos-simulados');

function preparar(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-pedidos-test-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const caminho = path.join(pasta, 'dados.sqlite');
  const banco = new RepositorioSimulacoesSQLite({ caminho });
  t.after(() => banco.fechar());
  return { banco, caminho };
}
function confirmado(id, participanteId = 'p1', valorCentavos = 1200) {
  return {
    pedidoId:id,
    participanteId,
    produtoId:'curso-pdf',
    nome:'Cliente de teste',
    status:STATUS_CONFIRMADO,
    valorCentavos
  };
}

test('somente compra confirmada no verificador interno cria uma posicao', async (t) => {
  const { banco } = preparar(t);
  const eventos = new Map([
    ['pedido-1', confirmado('pedido-1')],
    ['pedido-2', { ...confirmado('pedido-2'), status:'PENDENTE' }]
  ]);
  const consultarPagamentoConfiavel = async pedidoId => eventos.get(pedidoId);
  const processor = new ProcessadorPedidosSimulados({ repositorio:banco, consultarPagamentoConfiavel });

  await assert.rejects(
    processor.processar({simulacaoId:'demo',pedidoId:'pedido-2'}),
    /ainda nao confirmado/
  );
  assert.equal(banco.recuperar({id:'demo'}),null);

  const registrado = await processor.processar({simulacaoId:'demo',pedidoId:'pedido-1'});
  assert.equal(registrado.criado,true);
  assert.equal(registrado.repetido,false);
  assert.equal(registrado.posicao.fila,'B');
  assert.equal(banco.recuperar({id:'demo'}).simulador.estado().filas.B.quantidade,1);
  const repetido = await processor.processar({simulacaoId:'demo',pedidoId:'pedido-1'});
  assert.equal(repetido.criado,false);
  assert.equal(repetido.repetido,true);
  assert.equal(repetido.posicao.id,registrado.posicao.id);
  assert.equal(banco.recuperar({id:'demo'}).revisao,1);
});

test('precos distintos nao mudam a regra: cada pedido gera uma posicao', async (t) => {
  const { banco } = preparar(t);
  const eventos = {
    barato: confirmado('barato','cliente-x',300),
    caro: confirmado('caro','cliente-x',350000)
  };
  const processor = new ProcessadorPedidosSimulados({
    repositorio:banco,consultarPagamentoConfiavel:async id=>eventos[id]
  });
  const primeiro=await processor.processar({simulacaoId:'s1',pedidoId:'barato'});
  const segundo=await processor.processar({simulacaoId:'s1',pedidoId:'caro'});
  assert.equal(primeiro.posicao.participanteId,segundo.posicao.participanteId);
  assert.notEqual(primeiro.posicao.id,segundo.posicao.id);
  assert.equal(banco.recuperar({id:'s1'}).simulador.estado().filas.B.quantidade,2);
  assert.equal(banco.recuperar({id:'s1'}).revisao,2);
});

test('reabrir banco e processar mesmo pedido nao duplica posicoes', async (t) => {
  const { caminho, banco } = preparar(t);
  const consultarPagamentoConfiavel = async id => confirmado(id);
  const primeiro = new ProcessadorPedidosSimulados({repositorio:banco,consultarPagamentoConfiavel});
  const criado=await primeiro.processar({simulacaoId:'retomar',pedidoId:'compra-22'});
  const copia = new RepositorioSimulacoesSQLite({ caminho });
  t.after(()=>copia.fechar());
  const outro = new ProcessadorPedidosSimulados({repositorio:copia,consultarPagamentoConfiavel});
  const repetido=await outro.processar({simulacaoId:'retomar',pedidoId:'compra-22'});
  assert.equal(repetido.criado,false);
  assert.equal(repetido.posicao.id,criado.posicao.id);
  assert.equal(copia.recuperar({id:'retomar'}).revisao,1);
});

test('evento com valor, status ou titular adulterado nao gera posicao', async (t) => {
  const { banco } = preparar(t);
  const casos = [
    { ...confirmado('invalido'), status:'PENDENTE' },
    { ...confirmado('invalido'), valorCentavos:0 },
    { ...confirmado('invalido'), valorCentavos:12.99 },
    { ...confirmado('invalido'), pedidoId:'outro-pedido' },
    { ...confirmado('invalido'), participanteId:'' },
    { ...confirmado('invalido'), produtoId:'' },
    undefined
  ];
  for (const evento of casos) {
    const processor = new ProcessadorPedidosSimulados({
      repositorio:banco, consultarPagamentoConfiavel:async ()=>evento
    });
    await assert.rejects(processor.processar({
      simulacaoId:'invalido',pedidoId:'invalido'
    }));
    assert.equal(banco.recuperar({id:'invalido'}),null);
  }
});

test('pedido nunca pode ser transferido para outro participante', async (t) => {
  const { banco } = preparar(t);
  let idParticipante='comprador-original';
  const processor = new ProcessadorPedidosSimulados({
    repositorio:banco,consultarPagamentoConfiavel:async id=>confirmado(id,idParticipante)
  });
  await processor.processar({simulacaoId:'vinculo',pedidoId:'compra-unica'});
  idParticipante='pessoa-diferente';
  await assert.rejects(processor.processar({
    simulacaoId:'vinculo',pedidoId:'compra-unica'
  }),/ja associado a outro participante/);
  assert.equal(banco.recuperar({id:'vinculo'}).simulador.estado().filas.B.quantidade,1);
});

test('conflito de revisao recarrega e nao perde outra gravacao', async (t) => {
  const { banco } = preparar(t);
  const confirmar = async id => confirmado(id);
  const processor = new ProcessadorPedidosSimulados({
    repositorio:banco,consultarPagamentoConfiavel:confirmar
  });
  await processor.processar({simulacaoId:'concorrente',pedidoId:'pedido-inicial'});

  const salvarReal = banco.salvar.bind(banco);
  let interceptado = false;
  banco.salvar = dados => {
    if (!interceptado) {
      interceptado = true;
      const externo = banco.recuperar({id:'concorrente'});
      externo.simulador.registrarPosicaoSimulada({
        participanteId:'outro', vendaId:'pedido-externo'
      });
      salvarReal({
        id:'concorrente',simulador:externo.simulador,revisaoEsperada:externo.revisao
      });
    }
    return salvarReal(dados);
  };
  const resposta = await processor.processar({simulacaoId:'concorrente',pedidoId:'novo-pedido'});
  assert.equal(resposta.criado,true);
  const resgate=banco.recuperar({id:'concorrente'});
  assert.equal(resgate.revisao,3);
  assert.equal(resgate.simulador.estado().filas.B.quantidade,3);
  assert.equal(resgate.simulador.registrarPosicaoSimulada({
    participanteId:'outro',vendaId:'pedido-externo'
  }).repetida,true);
});

test('sem verificador confiavel, processo nem inicia', (t) => {
  const { banco } = preparar(t);
  assert.throws(()=>new ProcessadorPedidosSimulados({repositorio:banco}),/verificar pedidos/);
  assert.throws(()=>new ProcessadorPedidosSimulados({
    repositorio:banco,consultarPagamentoConfiavel:()=>{},tentativas:0
  }),/tentativas/);
});
