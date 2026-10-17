'use strict';

// Snapshots sao somente para testes e preparacao da futura persistencia.
// NAO constituem banco de dados, comprovantes de venda ou registros financeiros.
const { DESTINOS } = require('./tabuleiro-loop');
const {
 cofreDoEvento,origemDoCentro,centroDoLoop
}=require('./destino-financeiro-centro-loop');

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error('Snapshot LOOP invalido: ' + mensagem);
}
function objeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function inteiro(x) { return Number.isSafeInteger(x) && x >= 0; }
function texto(x) { return typeof x === 'string' && x.trim().length > 0; }
function lista(x, campo) {
  exigir(Array.isArray(x), campo + ' precisa ser uma lista');
  return x;
}
function posicao(x, campo) {
  exigir(objeto(x) && Number.isSafeInteger(x.id) && x.id > 0 &&
    texto(x.participanteId) && texto(x.nome) &&
    (x.fila === 'A' || x.fila === 'B'), campo + ' possui posicao invalida');
  return x;
}
function pares(x, campo) {
  const vistos = new Set();
  return lista(x, campo).map((par) => {
    exigir(Array.isArray(par) && par.length === 2 && texto(par[0]), campo + ' possui entrada invalida');
    exigir(!vistos.has(par[0]), campo + ' possui chave duplicada');
    vistos.add(par[0]);
    return par;
  });
}
function textosUnicos(x, campo) {
  const values = lista(x, campo);
  exigir(values.every(texto) && new Set(values).size === values.length, campo + ' possui identificadores invalidos');
  return values;
}
function copiar(x) { return JSON.parse(JSON.stringify(x)); }

function exportarSnapshot(loop) {
  const f = loop.filas;
  const t = loop.tabuleiro;
  return copiar({
    formato: 'LOOP_SIMULADOR_V1',
    versao: 1,
    filas: {
      filaA: f.filaA, filaB: f.filaB, sequencia: f.sequencia,
      contadorA: f.contadorA, evento: f.evento,
      indicacoes: [...f.indicacoes.entries()],
      indicacoesProcessadas: [...f.indicacoesProcessadas],
      vendasRegistradas: [...f.vendasRegistradas.entries()],
      participantesConhecidos: [...f.participantesConhecidos]
    },
    tabuleiro: {
      centro: t.centro, vagas: t.vagas,
      vendasDoCiclo: t.vendasDoCiclo,
      vendasProcessadas: [...t.vendasProcessadas],
      ciclosConcluidos: t.ciclosConcluidos,
      iniciado: t.iniciado
    },
    catraca: { aberta: loop.catracaAberta, giros: loop.giros }
  });
}

function restaurarSnapshot(snapshot, criarLoop) {
  // Copia de entrada: jamais reter referencias externas ou alterar a origem.
  exigir(objeto(snapshot), 'raiz ausente');
  const s = copiar(snapshot);
  exigir(s.formato === 'LOOP_SIMULADOR_V1' && s.versao === 1, 'versao nao suportada');
  const f = s.filas, t = s.tabuleiro, c = s.catraca;
  // Migracao de snapshots ficticios antigos: preserva IDs, fila, centro,
  // cinco vagas e ciclos concluidos de cinco. A nova sexta vaga nasce vazia;
  // ciclos antigos continuam historicos, sem reabrir pagamentos ou giros.
  const migradoV5=Array.isArray(t?.vagas)&&t.vagas.length===5;
  if(migradoV5)t.vagas.push(null);
  exigir(objeto(f) && objeto(t) && objeto(c), 'secoes incompletas');
  for (const campo of ['sequencia','contadorA','evento']) {
    exigir(inteiro(f[campo]), 'filas.' + campo + ' invalido');
  }
  exigir(inteiro(c.giros) && typeof c.aberta === 'boolean', 'catraca invalida');
  exigir(typeof t.iniciado === 'boolean', 'iniciado invalido');

  const conhecidos = textosUnicos(f.participantesConhecidos,'participantesConhecidos');
  const conjuntoConhecidos = new Set(conhecidos);
  const indiceVendas = pares(f.vendasRegistradas, 'vendasRegistradas');
  const indicacoes = pares(f.indicacoes, 'indicacoes');
  const vistosAtivos = new Set();
  let maiorId = 0;
  const checarPosicao = (p, nome, ativa = false) => {
    posicao(p, nome);
    exigir(conjuntoConhecidos.has(p.participanteId), nome + ' sem participante conhecido');
    maiorId = Math.max(maiorId, p.id);
    if (ativa) {
      exigir(!vistosAtivos.has(p.id), nome + ' duplicada no tabuleiro/filas');
      vistosAtivos.add(p.id);
    }
  };

  for (const p of lista(f.filaA,'filaA')) {
    checarPosicao(p, 'filaA', true);
    exigir(p.fila === 'A', 'filaA contem posicao da fila B');
  }
  for (const p of lista(f.filaB,'filaB')) {
    checarPosicao(p, 'filaB', true);
    exigir(p.fila === 'B', 'filaB contem posicao da fila A');
  }
  for (const [id, p] of indiceVendas) checarPosicao(p, 'vendasRegistradas[' + id + ']');

  for (const [id, valor] of indicacoes) {
    exigir(conjuntoConhecidos.has(id), 'indicacao de participante desconhecido');
    exigir(objeto(valor) && Number.isSafeInteger(valor.quantidade) && valor.quantidade > 0 &&
      texto(valor.ultimoConviteEm) && !Number.isNaN(Date.parse(valor.ultimoConviteEm)) &&
      inteiro(valor.ordemUltimoConvite), 'indicacao corrompida');
  }
  const eventos = textosUnicos(f.indicacoesProcessadas, 'indicacoesProcessadas');
  exigir(indicacoes.reduce((n, [,v]) => n + v.quantidade, 0) === eventos.length,
    'contagem total de indicacoes inconsistente');

  if (t.centro !== null) checarPosicao(t.centro, 'centro', true);
  const vagas = lista(t.vagas,'vagas');
  exigir(vagas.length === 6, 'tabuleiro precisa de seis vagas');
  for (let i = 0; i < vagas.length; i++) {
    if (vagas[i] !== null) checarPosicao(vagas[i], 'vaga ' + (i+1), true);
  }
  const vendas = lista(t.vendasDoCiclo,'vendasDoCiclo');
  exigir(vendas.length <= DESTINOS.length, 'ciclo com mais de seis vendas');
  const concluidos = lista(t.ciclosConcluidos, 'ciclosConcluidos');
  const processadas = textosUnicos(t.vendasProcessadas,'vendasProcessadas');
  const idsVendas = new Set();
  function conferirVenda(v, indice, ciclo, centro, legadoV5=false) {
    exigir(objeto(v) && texto(v.vendaId) && v.ordem === indice + 1 &&
      v.ciclo === ciclo && v.posicaoCentroId === centro.id &&
      v.destinoPrevisto === DESTINOS[indice], 'registro do ciclo invalido');
    // Na versao V6, o destino e determinado pelo centro real, dourado
    // ou desistente no instante da venda, nunca por um campo arbitrario
    // de snapshot. Preservar os registros historicos V5 sem esse campo.
    const destinoCorreto=cofreDoEvento({posicaoCentro:centro,ordem:indice+1});
    const origemCorreta=origemDoCentro(centro);
    const dourada=centroDoLoop(centro);
    exigir(legadoV5||(
      v.destinoCofre===destinoCorreto &&
      v.origemTitularCentro===origemCorreta &&
      (dourada?v.destinoParticipanteDoCentro==='LOOP_DOURADAS':
       v.destinoParticipanteDoCentro===undefined)
    ),'destino financeiro do ciclo divergente da titularidade central');
    if(legadoV5){
      // Historicos antigos nao trazem marcadores novos; se os trouxerem,
      // nao permitir marcadores incoerentes com a posicao central.
      exigir(
       (v.destinoCofre===undefined||v.destinoCofre===destinoCorreto)&&
       (v.origemTitularCentro===undefined||v.origemTitularCentro===origemCorreta)&&
       (v.destinoParticipanteDoCentro===undefined||
         (dourada&&v.destinoParticipanteDoCentro==='LOOP_DOURADAS')),
       'marcador financeiro historico divergente'
      );
    }
    exigir(!idsVendas.has(v.vendaId), 'venda repetida entre ciclos');
    idsVendas.add(v.vendaId);
  }
  concluidos.forEach((completo, i) => {
    exigir(objeto(completo) && completo.ciclo === i+1 &&
      objeto(completo.centro) && Array.isArray(completo.vendas) &&
      (completo.vendas.length === 5||completo.vendas.length === 6), 'ciclo concluido invalido');
    checarPosicao(completo.centro, 'centro de ciclo concluido');
    completo.vendas.forEach((v,j) => conferirVenda(v,j,i+1,completo.centro,completo.vendas.length===5));
  });
  vendas.forEach((v,i) => {
    exigir(t.centro !== null, 'vendas sem centro');
    conferirVenda(v,i,concluidos.length+1,t.centro,migradoV5);
  });
  exigir(processadas.length === idsVendas.size &&
    processadas.every(id => idsVendas.has(id)), 'indice de vendas processadas inconsistente');
  exigir(c.giros === concluidos.length, 'giros nao correspondem a ciclos concluidos');
  exigir(f.sequencia >= maiorId, 'sequencia menor que o maior ID');
  exigir(!vendas.length || t.iniciado, 'ciclo ativo nao iniciado');

  // A instancia original nao e tocada. Uma falha de validacao cancela tudo.
  const loop = criarLoop();
  loop.filas.filaA = copiar(f.filaA);
  loop.filas.filaB = copiar(f.filaB);
  loop.filas.sequencia = f.sequencia;
  loop.filas.contadorA = f.contadorA;
  loop.filas.evento = f.evento;
  loop.filas.indicacoes = new Map(copiar(indicacoes));
  loop.filas.indicacoesProcessadas = new Set(eventos);
  loop.filas.vendasRegistradas = new Map(copiar(indiceVendas));
  loop.filas.participantesConhecidos = new Set(conhecidos);
  loop.tabuleiro.centro = copiar(t.centro);
  loop.tabuleiro.vagas = copiar(t.vagas);
  loop.tabuleiro.vendasDoCiclo = copiar(vendas);
  loop.tabuleiro.vendasProcessadas = new Set(processadas);
  loop.tabuleiro.ciclosConcluidos = copiar(concluidos);
  loop.tabuleiro.iniciado = t.iniciado;
  loop.catracaAberta = c.aberta;
  loop.giros = c.giros;
  return loop;
}

module.exports = { exportarSnapshot, restaurarSnapshot };
