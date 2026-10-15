'use strict';

// Financeiro de LABORATORIO: projecao aritmetica de cinco vendas FICTICIAS.
// Nao recebe pagamentos, CPF, saldos reais, extratos, ordens de saque ou split.
// Nao controla nem altera a catraca existente. Ela apenas fornece o padrao
// de destinos ja acordado, importado do modulo de simulacao.
const { DESTINOS } = require('./tabuleiro-loop');
const { VALOR_PADRAO_LOOP_CENTAVOS } = require('./valor-padrao-loop');

const MODOS = Object.freeze({
  SPLIT:'SPLIT_DISTRIBUIDOR_SIMULADO',
  RESERVA:'DISTRIBUIDOR_A_PAGAR_SIMULADO'
});
const COFRES = Object.freeze({
  CENTRO:'LOOP_CENTRO',
  ESQUERDA:'LOOP_ESQUERDA',
  DIREITA:'LOOP_DIREITA',
  COMERCIAL:'LOJA_COMERCIAL',
  DISTRIBUIDOR:'LOJA_FORNECEDOR_A_PAGAR'
});
const TITULOS = Object.freeze({
  [COFRES.ESQUERDA]:'Investimento LOOP',
  [COFRES.CENTRO]:'Bonificacoes e participacao dos clientes',
  [COFRES.DIREITA]:'Reserva de suporte LOOP',
  [COFRES.COMERCIAL]:'Sobra bruta comercial',
  [COFRES.DISTRIBUIDOR]:'Reserva para pagar distribuidor'
});
const EXEMPLOS = Object.freeze(Array.from({length:5},(_,i)=>Object.freeze({
  vendaId:'venda-financeira-ficticia-'+(i+1),
  precoCentavos:60000,
  fornecedorCentavos:30000,
  parcelaLoopCentavos:VALOR_PADRAO_LOOP_CENTAVOS
})));

function validarCentavos(n){
  return Number.isSafeInteger(n) && n>=0;
}
function somar(valores){
  return valores.reduce((t,v)=>{
    if(!validarCentavos(v) || !Number.isSafeInteger(t+v))throw new Error('Valor financeiro de teste invalido');
    return t+v;
  },0);
}
function criarVisaoFinanceiraAdminDemo({modo=MODOS.SPLIT,vendas=EXEMPLOS}={}){
  if(!Object.values(MODOS).includes(modo))throw new Error('Modo de repasse ficticio invalido');
  if(!Array.isArray(vendas) || vendas.length!==5 || DESTINOS.length!==5){
    throw new Error('Cenario requer os cinco eventos ficticios do ciclo');
  }
  const IDs=new Set();
  const caixaCiclo=[COFRES.CENTRO,COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.CENTRO];
  const caixasIds=[COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.COMERCIAL];
  if(modo===MODOS.RESERVA)caixasIds.push(COFRES.DISTRIBUIDOR);
  const acumulado=Object.fromEntries(caixasIds.map(id=>[id,0]));
  const historico=[];
  const vendasConferidas=[];
  let sequencia=0;
  function registrar(vendaId,cofreId,tipo,valorCentavos){
    historico.push({
      sequencia:++sequencia,vendaId,cofreId,tipo,
      valorCentavos, dataSimulada:'2026-10-15T00:00:00.000Z',
      comprovanteReal:false
    });
  }
  for(let i=0;i<vendas.length;i++){
    const v=vendas[i];
    if(!v || typeof v!=='object' || typeof v.vendaId!=='string' ||
       !/^venda-[a-z0-9-]{1,70}$/.test(v.vendaId) || IDs.has(v.vendaId) ||
       ![v.precoCentavos,v.fornecedorCentavos,v.parcelaLoopCentavos].every(validarCentavos)){
      throw new Error('Venda demonstrativa invalida ou duplicada');
    }
    IDs.add(v.vendaId);
    if(v.parcelaLoopCentavos!==VALOR_PADRAO_LOOP_CENTAVOS){
      throw new Error('Parcela de referencia do ciclo deve ser R$250 neste exemplo');
    }
    const sobra=v.precoCentavos-v.fornecedorCentavos-v.parcelaLoopCentavos;
    if(!validarCentavos(sobra))throw new Error('Venda ficticia nao cobre obrigacoes');
    const destinoCiclo=caixaCiclo[i];
    if((DESTINOS[i]==='PARTICIPANTE')!==(destinoCiclo===COFRES.CENTRO)){
      throw new Error('Destino do ciclo divergente do tabuleiro existente');
    }
    const fornecedorDestino=modo===MODOS.SPLIT?'DISTRIBUIDOR_EXTERNO_SIMULADO':COFRES.DISTRIBUIDOR;
    if(modo===MODOS.RESERVA)acumulado[COFRES.DISTRIBUIDOR]=somar([acumulado[COFRES.DISTRIBUIDOR],v.fornecedorCentavos]);
    acumulado[destinoCiclo]=somar([acumulado[destinoCiclo],v.parcelaLoopCentavos]);
    acumulado[COFRES.COMERCIAL]=somar([acumulado[COFRES.COMERCIAL],sobra]);
    registrar(v.vendaId,fornecedorDestino,modo===MODOS.SPLIT?'SPLIT_EXTERNO_PREVISTO':'FORNECEDOR_RESERVADO',v.fornecedorCentavos);
    registrar(v.vendaId,destinoCiclo,'PARCELA_LOOP_PREVISTA',v.parcelaLoopCentavos);
    registrar(v.vendaId,COFRES.COMERCIAL,'SOBRA_BRUTA_COMERCIAL',sobra);
    vendasConferidas.push({
      vendaId:v.vendaId,eventoCiclo:i+1,precoCentavos:v.precoCentavos,
      fornecedorCentavos:v.fornecedorCentavos,parcelaLoopCentavos:v.parcelaLoopCentavos,
      sobraBrutaCentavos:sobra,destinoCiclo,fornecedorDestino
    });
  }
  const totalVendasCentavos=somar(vendasConferidas.map(v=>v.precoCentavos));
  const totalFornecedorCentavos=somar(vendasConferidas.map(v=>v.fornecedorCentavos));
  const totalLoopCentavos=somar(vendasConferidas.map(v=>v.parcelaLoopCentavos));
  const totalSobraBrutaCentavos=somar(vendasConferidas.map(v=>v.sobraBrutaCentavos));
  if(somar([totalFornecedorCentavos,totalLoopCentavos,totalSobraBrutaCentavos])!==totalVendasCentavos ||
     somar(Object.values(acumulado))!==totalVendasCentavos-(modo===MODOS.SPLIT?totalFornecedorCentavos:0)){
    throw new Error('Conciliacao matematica ficticia falhou');
  }
  return {
    modo:'FINANCEIRO_ADMINISTRATIVO_APENAS_DEMONSTRACAO',
    repasseSimulado:modo,
    acesso:'LABORATORIO_ADMIN_LOCAL',
    movimentacaoBancariaReal:false,
    splitBancarioReal:false,
    saquesReaisHabilitados:false,
    modeloSemTaxasTributosOuEstornos:true,
    totalVendasCentavos,totalFornecedorCentavos,totalLoopCentavos,totalSobraBrutaCentavos,
    caixas:caixasIds.map(id=>({
      id,nomeProvisorio:TITULOS[id],entradasAcumuladasCentavos:acumulado[id],
      saldoRealConhecido:false
    })),
    historico,vendas:vendasConferidas
  };
}
module.exports={criarVisaoFinanceiraAdminDemo,MODOS,COFRES,EXEMPLOS};
