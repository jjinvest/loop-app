'use strict';

// Projecao SOMENTE para leitura em laboratorio. Nao recebe CPF e nao
// registra compra, credito, contemplacao, saque ou qualquer pagamento.
const {LIMITE_POSICOES_ATIVAS}=require('./capacidade-posicoes-loop');
const ESTADOS_VALIDOS = new Set(['ATIVA','CONCLUIDA']);
const FILAS_VALIDAS = new Set(['A','B']);
const LOCAIS_VALIDOS = new Set(['FILA','CENTRO','VAGA_1','VAGA_2','VAGA_3','VAGA_4','VAGA_5','VAGA_6']);
const TITULARES_FICTICIOS = Object.freeze([
  Object.freeze({id:'conta-demo-a',nome:'Conta demonstrativa A'}),
  Object.freeze({id:'conta-demo-b',nome:'Conta demonstrativa B'}),
  Object.freeze({id:'conta-demo-c',nome:'Conta demonstrativa C'}),
  Object.freeze({id:'conta-demo-d',nome:'Conta demonstrativa D'})
]);

function registro(id, titularId, situacao, local, fila) {
  return Object.freeze({
    id, titularId, situacao,
    ...(local ? {local}:{}),
    ...(fila ? {fila}:{})
  });
}

// IDs totalmente inventados e sem referencia a CPF real.
// Existe historico concluido, mas NENHUM valor financeiro.
const POSICOES_FICTICIAS = Object.freeze([
  registro('posicao-demo-a-01','conta-demo-a','CONCLUIDA'),
  registro('posicao-demo-a-02','conta-demo-a','ATIVA','CENTRO'),
  registro('posicao-demo-a-03','conta-demo-a','ATIVA','VAGA_1'),
  registro('posicao-demo-a-04','conta-demo-a','ATIVA','FILA','A'),
  registro('posicao-demo-a-05','conta-demo-a','ATIVA','FILA','A'),
  registro('posicao-demo-a-06','conta-demo-a','ATIVA','FILA','B'),
  registro('posicao-demo-b-01','conta-demo-b','CONCLUIDA'),
  registro('posicao-demo-b-02','conta-demo-b','ATIVA','FILA','A'),
  registro('posicao-demo-b-03','conta-demo-b','ATIVA','FILA','B'),
  registro('posicao-demo-b-04','conta-demo-b','ATIVA','FILA','B'),
  registro('posicao-demo-b-05','conta-demo-b','ATIVA','FILA','B'),
  registro('posicao-demo-c-01','conta-demo-c','ATIVA','FILA','B'),
  registro('posicao-demo-d-01','conta-demo-d','CONCLUIDA')
]);

function criarVisaoEscritorioDemo({titularId, titulares=TITULARES_FICTICIOS, posicoes=POSICOES_FICTICIAS}={}) {
  if(typeof titularId!=='string' || !titularId) throw new Error('Identificador demonstrativo obrigatorio');
  const titular=titulares.find(p=>p.id===titularId);
  if(!titular)return null;
  if(!Array.isArray(posicoes))throw new TypeError('Posicoes invalidas');
  const ids=new Set();
  const ativas=[];
  const concluidas=[];
  for(const p of posicoes) {
    if(!p || typeof p!=='object'||typeof p.id!=='string'||ids.has(p.id)) {
      throw new Error('Posicao demonstrativa invalida ou duplicada');
    }
    ids.add(p.id);
    if(p.titularId!==titularId)continue;
    if(!ESTADOS_VALIDOS.has(p.situacao))throw new Error('Situacao demonstrativa invalida');
    if(p.situacao==='ATIVA') {
      if(!LOCAIS_VALIDOS.has(p.local) || (p.local==='FILA' && !FILAS_VALIDAS.has(p.fila))) {
        throw new Error('Local da posicao demonstrativa invalido');
      }
      ativas.push({id:p.id,situacao:p.situacao,local:p.local, ...(p.fila?{fila:p.fila}:{})});
    } else {
      concluidas.push({id:p.id,situacao:'CONCLUIDA'});
    }
  }
  if(ativas.length>LIMITE_POSICOES_ATIVAS) {
    throw new Error('Limite de posicoes ativas por titular excedido');
  }
  return {
    modo:'ESCRITORIO_APENAS_DEMONSTRACAO',
    titular:{id:titular.id,nome:titular.nome},
    limitePosicoesAtivas:LIMITE_POSICOES_ATIVAS,
    posicoesAtivas:ativas.length,
    vagasDisponiveis:LIMITE_POSICOES_ATIVAS-ativas.length,
    posicoesConcluidas:concluidas.length,
    ativas,
    historico:concluidas,
    indicacoes:{status:'NAO_CONECTADO_NESTA_ETAPA'},
    pedidos:{status:'NAO_CONECTADO_NESTA_ETAPA'},
    atendimento:{status:'PREVISTO_NAO_ATIVO'},
    termos:{status:'PENDENTE_DE_REDACAO_E_APROVACAO'},
    valores:{status:'NAO_EXISTEM_SALDOS_NEM_CREDITOS_REAIS'},
    compraHabilitada:false,
    saqueHabilitado:false,
    possuiCpfReal:false
  };
}

module.exports={
  criarVisaoEscritorioDemo,TITULARES_FICTICIOS,POSICOES_FICTICIAS,LIMITE_POSICOES_ATIVAS
};
