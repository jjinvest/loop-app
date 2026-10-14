'use strict';

// ADAPTADOR DE LEITURA: extrai dados do SimuladorLoop existente, sem
// modificar filas, girar catraca ou autorizar transacoes financeiras.
const { criarVisaoEscritorioDemo, TITULARES_FICTICIOS } =
  require('../domain/visao-escritorio-demo');
const { SimuladorLoop } = require('../domain/simulador-loop');

function extrairVisaoDoMotor({ simulador, titularId, titulares=TITULARES_FICTICIOS } = {}) {
  if (!simulador || typeof simulador.estado !== 'function' ||
      !simulador.tabuleiro || !Array.isArray(simulador.tabuleiro.ciclosConcluidos)) {
    throw new TypeError('SimuladorLoop de laboratorio obrigatorio');
  }
  const estado = simulador.estado();
  const posicoes = [];
  const ativa = (p,local,fila) => {
    if (!p) return;
    if (!Number.isSafeInteger(p.id) || p.id < 1 || typeof p.participanteId !== 'string') {
      throw new Error('Estado simulado contem posicao invalida');
    }
    posicoes.push({
      id:'posicao-motor-'+p.id,
      titularId:p.participanteId,
      situacao:'ATIVA',
      local,
      ...(fila?{fila}:{})
    });
  };
  for (const pessoa of estado.filas.A.pessoas) ativa(pessoa,'FILA','A');
  for (const pessoa of estado.filas.B.pessoas) ativa(pessoa,'FILA','B');
  ativa(estado.tabuleiro.centro,'CENTRO');
  estado.tabuleiro.vagas.forEach((p,i)=>ativa(p,'VAGA_'+(i+1)));
  for (const ciclo of simulador.tabuleiro.ciclosConcluidos) {
    if (!ciclo || !ciclo.centro || !Number.isSafeInteger(ciclo.centro.id) ||
        typeof ciclo.centro.participanteId !== 'string') {
      throw new Error('Ciclo simulado sem centro valido');
    }
    posicoes.push({
      id:'posicao-motor-'+ciclo.centro.id,
      titularId:ciclo.centro.participanteId,
      situacao:'CONCLUIDA'
    });
  }
  const visao = criarVisaoEscritorioDemo({titularId,titulares,posicoes});
  if (!visao) return null;
  const informacoes=simulador.filas.informacoesParticipante(titularId);
  return {
    ...visao,
    origem:'MOTOR_EXISTENTE_EM_CENARIO_FICTICIO',
    indicacoes: {
      status:'CONTAGEM_SIMULADA_PELO_MOTOR',
      quantidade:informacoes.quantidade
    },
    tabuleiro:{
      status:'CONSULTA_SIMULADA',
      giros:estado.catraca.giros,
      catraca:estado.catraca.status,
      cicloAtual:estado.tabuleiro.cicloAtual
    }
  };
}

// Reproduz de maneira isolada as regras que o motor ja possui:
// 6 posicoes iniciais, 5 vendas com posicoes, indicacoes A/B e um giro.
// NUNCA preenche CPF, conta bancaria, valores ou pedidos reais.
function criarCenarioEscritorioMotor() {
  const simulador = new SimuladorLoop({
    relogio:()=>'2026-10-14T12:00:00.000Z'
  });
  const compra = (titular,sufixo) => {
    const vendaId='venda-laboratorio-'+titular+'-'+sufixo;
    const nova=simulador.registrarPosicaoSimulada({
      participanteId:'conta-demo-'+titular,
      vendaId
    });
    if (nova.repetida) throw new Error('Venda de teste duplicada');
    return vendaId;
  };
  for (let i=1;i<=5;i++) compra('a',i);
  compra('b',1);
  simulador.prepararTabuleiro();

  for (const [titular,sufixo] of [
    ['b',2],['b',3],['c',1],['c',2],['d',1]
  ]) {
    const vendaId=compra(titular,sufixo);
    simulador.registrarVendaNoCicloSimulada({vendaId});
  }
  simulador.registrarIndicacaoSimulada({
    indicadorId:'conta-demo-b',eventoId:'convite-ficticio-b-1',
    convidouEm:'2026-10-14T12:00:00.000Z'
  });
  simulador.registrarIndicacaoSimulada({
    indicadorId:'conta-demo-c',eventoId:'convite-ficticio-c-1',
    convidouEm:'2026-10-14T12:01:00.000Z'
  });
  if(simulador.estado().tabuleiro.elegivelParaGiro!==true){
    throw new Error('Cenario de laboratorio inconsistente');
  }
  simulador.abrirCatraca();
  if(!simulador.tentarGiro().girou){
    throw new Error('Giro ficticio nao ocorreu');
  }
  return simulador;
}

module.exports={extrairVisaoDoMotor,criarCenarioEscritorioMotor};
