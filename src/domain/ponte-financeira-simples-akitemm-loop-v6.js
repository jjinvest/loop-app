'use strict';

// PONTE FINANCEIRA SIMPLES — AKITEMM > LOOP (SOMENTE CALCULO).
// Regra comercial: pagar produto, separar R$250 do LOOP, resto do titular
// da operacao. Nenhum frete, tributo, custo indireto ou PSP e calculado aqui.
// Isto NAO registra transferencia, nao cria posicao, nao gera saldo bancario.
const MINIMO_LOOP_CENTAVOS=25000;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function centavos(valor,campo){
 if(!Number.isSafeInteger(valor)||valor<0||valor>100000000000)
  throw erro(campo+'_INVALIDO');
 return valor;
}
function calcularPonteAkitemmLoop({
 valorVendaCentavos,custoProdutosCentavos,valorElegivelLoopCentavos=valorVendaCentavos
}={}){
 const venda=centavos(valorVendaCentavos,'VALOR_VENDA');
 const custo=centavos(custoProdutosCentavos,'CUSTO_PRODUTOS');
 const elegivel=centavos(valorElegivelLoopCentavos,'VALOR_ELEGIVEL');
 if(elegivel>venda)throw erro('VALOR_ELEGIVEL_SUPERA_VENDA');
 if(custo>venda)return {
  situacao:'CUSTO_PRODUTOS_SUPERA_VENDA',vendaCentavos:venda,
  custoProdutosCentavos:custo,valorElegivelLoopCentavos:elegivel,
  loopSeparavelCentavos:0,restanteProprietarioCentavos:0,
  insuficienciaCentavos:custo-venda,posicaoFinanceiramenteCoberta:false,
  separacaoRealExecutada:false,dinheiroRealRecebidoCentavos:0
 };
 const depoisDoProduto=venda-custo;
 if(elegivel<MINIMO_LOOP_CENTAVOS)return {
  situacao:'VENDA_SOMENTE_AKITEMM',vendaCentavos:venda,
  custoProdutosCentavos:custo,valorElegivelLoopCentavos:elegivel,
  loopSeparavelCentavos:0,restanteProprietarioCentavos:depoisDoProduto,
  insuficienciaCentavos:0,posicaoFinanceiramenteCoberta:false,
  separacaoRealExecutada:false,dinheiroRealRecebidoCentavos:0
 };
 if(depoisDoProduto<MINIMO_LOOP_CENTAVOS)return {
  situacao:'SEM_COBERTURA_PARA_LOOP',vendaCentavos:venda,
  custoProdutosCentavos:custo,valorElegivelLoopCentavos:elegivel,
  loopSeparavelCentavos:0,restanteProprietarioCentavos:0,
  saldoNaoAlocadoCentavos:depoisDoProduto,
  insuficienciaCentavos:MINIMO_LOOP_CENTAVOS-depoisDoProduto,
  posicaoFinanceiramenteCoberta:false,
  separacaoRealExecutada:false,dinheiroRealRecebidoCentavos:0
 };
 const restante=depoisDoProduto-MINIMO_LOOP_CENTAVOS;
 return {
  situacao:'COBERTURA_CALCULADA_SEM_TRANSFERENCIA',
  vendaCentavos:venda,custoProdutosCentavos:custo,
  valorElegivelLoopCentavos:elegivel,
  loopSeparavelCentavos:MINIMO_LOOP_CENTAVOS,
  restanteProprietarioCentavos:restante,
  insuficienciaCentavos:0,posicaoFinanceiramenteCoberta:true,
  separacaoRealExecutada:false,dinheiroRealRecebidoCentavos:0
 };
}
module.exports={calcularPonteAkitemmLoop,MINIMO_LOOP_CENTAVOS};
