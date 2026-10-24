'use strict';

// Projecao e conciliacao de COFRES FICTICIOS (sem API bancaria real).
// Testa o contrato de um futuro adaptador de reservas/subcontas, sem credenciais.
// Nenhum evento daqui altera o motor de filas, vendas ou direitos de clientes.
const {criarVisaoFinanceiraAdminDemo,MODOS,COFRES}=require('./financeiro-admin-demo');

const TIPOS=Object.freeze({
  ENTRADA:'ENTRADA_SIMULADA',
  SAIDA:'SAIDA_SIMULADA',
  RETORNO:'RETORNO_SIMULADO'
});
const IDS_VALIDOS=new Set(Object.values(COFRES));

function inteiro(n){return Number.isSafeInteger(n)&&n>=0;}
function soma(a,b){
  const n=a+b;
  if(!Number.isSafeInteger(n))throw new Error('Overflow no livro ficticio');
  return n;
}

// Eventos adicionais EXEMPLIFICATIVOS — administrador nao esta limitado a
// estes movimentos. Uma futura gestao real precisa de lancamentos auditaveis.
const MOVIMENTOS_EXEMPLO=Object.freeze([
  Object.freeze({id:'saque-simulado-centro-01',cofreId:COFRES.CENTRO,tipo:TIPOS.SAIDA,valorCentavos:10000,referencia:'pagamento ficticio centro'}),
  Object.freeze({id:'aplicacao-simulada-01',cofreId:COFRES.ESQUERDA,tipo:TIPOS.SAIDA,valorCentavos:8000,referencia:'investimento ficticio'}),
  Object.freeze({id:'retorno-simulado-01',cofreId:COFRES.ESQUERDA,tipo:TIPOS.RETORNO,valorCentavos:3000,referencia:'retorno ficticio investimento'}),
  Object.freeze({id:'reserva-saida-simulada-01',cofreId:COFRES.DIREITA,tipo:TIPOS.SAIDA,valorCentavos:1500,referencia:'uso ficticio reserva'}),
  Object.freeze({id:'reserva-retorno-simulado-01',cofreId:COFRES.DIREITA,tipo:TIPOS.RETORNO,valorCentavos:500,referencia:'retorno ficticio reserva'}),
  Object.freeze({id:'retirada-loja-simulada-01',cofreId:COFRES.COMERCIAL,tipo:TIPOS.SAIDA,valorCentavos:20000,referencia:'retirada ficticia administrador'})
]);

function projetarRazaoCofresDemo({modo=MODOS.SPLIT,centroPosicao=null,comMovimentos=false,movimentos=null}={}){
  const visao=criarVisaoFinanceiraAdminDemo({modo,centroPosicao});
  const mapa=new Map(visao.caixas.map(c=>[c.id,{
    id:c.id,entradasAcumuladasCentavos:0,saidasAcumuladasCentavos:0,
    retornosAcumuladosCentavos:0,saldoProjetadoCentavos:0,
    saldoRealConhecido:false
  }]));
  const historico=[];
  const ids=new Set();
  function registrar({id,cofreId,tipo,valorCentavos,referencia}){
    if(typeof id!=='string'|| !/^[a-z0-9-]{3,96}$/.test(id)||ids.has(id)||
       !IDS_VALIDOS.has(cofreId)||!mapa.has(cofreId)||
       !Object.values(TIPOS).includes(tipo)||!inteiro(valorCentavos)||valorCentavos===0||
       typeof referencia!=='string'||referencia.length>150){
      throw new Error('Lancamento ficticio invalido ou repetido');
    }
    ids.add(id);
    const cofre=mapa.get(cofreId);
    if(tipo===TIPOS.ENTRADA)cofre.entradasAcumuladasCentavos=soma(cofre.entradasAcumuladasCentavos,valorCentavos);
    if(tipo===TIPOS.SAIDA)cofre.saidasAcumuladasCentavos=soma(cofre.saidasAcumuladasCentavos,valorCentavos);
    if(tipo===TIPOS.RETORNO)cofre.retornosAcumuladosCentavos=soma(cofre.retornosAcumuladosCentavos,valorCentavos);
    cofre.saldoProjetadoCentavos=soma(cofre.saldoProjetadoCentavos,
      tipo===TIPOS.SAIDA?-valorCentavos:valorCentavos);
    historico.push({sequencia:historico.length+1,id,cofreId,tipo,valorCentavos,referencia,simulado:true});
  }
  for(const h of visao.historico){
    if(!mapa.has(h.cofreId))continue; // fornecedor recebido externamente por split hipotetico
    registrar({id:'lancamento-'+h.sequencia,cofreId:h.cofreId,tipo:TIPOS.ENTRADA,
      valorCentavos:h.valorCentavos,referencia:h.vendaId});
  }
  const movimentosUsados=movimentos===null?(comMovimentos?[
    ...MOVIMENTOS_EXEMPLO,
    ...(modo===MODOS.RESERVA?[{
      id:'fornecedor-pagamento-simulado-01',
      cofreId:COFRES.DISTRIBUIDOR,tipo:TIPOS.SAIDA,
      valorCentavos:30000,referencia:'pagamento ficticio fornecedor'
    }]:[])
  ]:[]):movimentos;
  if(!Array.isArray(movimentosUsados)||movimentosUsados.length>1000)throw new Error('Movimentos de teste invalidos');
  for(const m of movimentosUsados)registrar(m);
  const cofres=visao.caixas.map(c=>({...mapa.get(c.id)}));
  for(const c of cofres){
    if(c.entradasAcumuladasCentavos!==visao.caixas.find(x=>x.id===c.id).entradasAcumuladasCentavos){
      throw new Error('Lancamentos e caixas ficticios nao conciliam');
    }
  }
  return {
    modo:'RAZAO_CONTABIL_APENAS_FICTICIO',
    centroAssumidoPeloLoop:visao.centroAssumidoPeloLoop,
    origemTitularCentro:visao.origemTitularCentro,
    repasseSimulado:modo,comMovimentos:movimentosUsados.length>0,
    historico,cofres,movimentacaoBancariaReal:false,
    autenticacaoBancariaConfigurada:false,
    observacao:'Projecao do mesmo cenario ficticio de vendas; nao representa extrato verdadeiro'
  };
}

// Interface que um futuro provedor devera implementar: consultarSaldos(ids).
// Abaixo e apenas um provedor EM MEMORIA, sem endpoints, autenticacao ou transferencias.
function criarAdaptadorReservasFicticio(saldos){
  if(!saldos||typeof saldos!=='object'||Array.isArray(saldos))throw new Error('Saldos ficticios invalidos');
  const registros=Object.entries(saldos);
  if(registros.some(([id,v])=>!IDS_VALIDOS.has(id)||!inteiro(v)))throw new Error('Reserva ficticia invalida');
  const copia=Object.freeze(Object.fromEntries(registros));
  return Object.freeze({
    identificador:'PROVEDOR_RESERVAS_FICTICIO',
    async consultarSaldos(ids){
      if(!Array.isArray(ids)||ids.some(id=>!IDS_VALIDOS.has(id))||new Set(ids).size!==ids.length){
        throw new Error('IDs de reservas invalidos');
      }
      return ids.filter(id=>Object.hasOwn(copia,id)).map(id=>({
        cofreId:id,saldoCentavos:copia[id],reservaFicticia:'FAKE-'+id
      }));
    }
  });
}

async function conciliarComAdaptadorFicticio({razao,adaptador}={}){
  if(!razao||!Array.isArray(razao.cofres)||!adaptador||typeof adaptador.consultarSaldos!=='function'){
    throw new Error('Razao e adaptador validos sao obrigatorios');
  }
  const ids=razao.cofres.map(c=>c.id);
  const extrato=await adaptador.consultarSaldos(ids);
  if(!Array.isArray(extrato)||extrato.some(x=>!x||!ids.includes(x.cofreId)||
     !inteiro(x.saldoCentavos))||new Set(extrato.map(x=>x.cofreId)).size!==extrato.length){
    throw new Error('Extrato ficticio malformado');
  }
  const mapa=new Map(extrato.map(x=>[x.cofreId,x]));
  const linhas=razao.cofres.map(c=>{
    const fonte=mapa.get(c.id);
    const diferencaCentavos=fonte?soma(fonte.saldoCentavos,-c.saldoProjetadoCentavos):null;
    return {
      cofreId:c.id,saldoProjetadoCentavos:c.saldoProjetadoCentavos,
      saldoReservaFicticiaCentavos:fonte?fonte.saldoCentavos:null,
      diferencaCentavos,
      status:!fonte?'SEM_DADO_FICTICIO':diferencaCentavos===0?'CONFERIDO_NO_TESTE':'DIVERGENCIA_FICTICIA'
    };
  });
  return {
    modo:'CONCILIACAO_TOTALMENTE_FICTICIA',
    provedor:'PROVEDOR_RESERVAS_FICTICIO',
    todasConferidasNoTeste:linhas.every(l=>l.status==='CONFERIDO_NO_TESTE'),
    movimentacaoBancariaReal:false,nenhumPagamentoExecutado:true,
    observacao:'Os dois lados sao dados construidos no laboratorio; a conferencia nao comprova saldo real.',
    linhas
  };
}

async function criarConciliacaoAdministrativaDemo({
  modo=MODOS.SPLIT,centroPosicao=null,comMovimentos=false,divergenciaFicticia=false
}={}){
  const razao=projetarRazaoCofresDemo({modo,centroPosicao,comMovimentos});
  // Dois lados sao simulados. O extrato do 'banco' e montado como
  // fixture de teste e NAO e informacao independente de uma instituicao.
  const fixture=Object.fromEntries(razao.cofres.map(c=>[c.id,c.saldoProjetadoCentavos]));
  if(divergenciaFicticia)fixture[COFRES.CENTRO]=soma(fixture[COFRES.CENTRO],1000);
  const conciliacao=await conciliarComAdaptadorFicticio({
    razao,adaptador:criarAdaptadorReservasFicticio(fixture)
  });
  return {razao,conciliacao,integracaoBancaria:'NAO_CONECTADA'};
}
module.exports={
  TIPOS,MOVIMENTOS_EXEMPLO,projetarRazaoCofresDemo,
  criarAdaptadorReservasFicticio,conciliarComAdaptadorFicticio,
  criarConciliacaoAdministrativaDemo
};
