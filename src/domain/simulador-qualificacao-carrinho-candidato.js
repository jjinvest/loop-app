'use strict';
// Avaliação SOMENTE INFORMATIVA: referência, quantidades e classes de produto.
// Não verifica CPF, termos, pagamento, titularidade, motor de filas, tabuleiro,
// cofre ou elegibilidade jurídica. Não cria qualquer posição ou lançamento.
const {entradaValida}=require('./cotacao-checkout-publico');
const REFERENCIA_CENTAVOS=25000;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function simularQualificacaoCandidato({entrada,catalogo,sinalizacao}={}){
 if(process.env.NODE_ENV==='production')erro('SIMULADOR_NAO_HOMOLOGADO');
 if(typeof catalogo?.buscar!=='function'||typeof sinalizacao?.consultar!=='function'||
   catalogo.db!==sinalizacao.db)
  erro('FONTE_UNICA_OBRIGATORIA');
 const itens=entradaValida(entrada);
 let total=0,valorVerde=0,quantidadeProdutosVerdes=0;
 let eventoPendente=false,limiarPendente=false;
 const detalhes=[];
 for(const {produtoId,quantidade} of itens){
  const p=await catalogo.buscar(produtoId);
  if(!p||p.estado!=='PUBLICADO'||!Number.isSafeInteger(p.precoCentavos)||
    p.precoCentavos<=0)erro('PRODUTO_INDISPONIVEL_PARA_COTACAO');
  const s=sinalizacao.consultar(produtoId);
  const subtotal=p.precoCentavos*quantidade;
  if(!Number.isSafeInteger(subtotal)||subtotal>100000000||
    !Number.isSafeInteger(total+subtotal)||total+subtotal>100000000)
   erro('LIMITE_COTACAO_EXCEDIDO');
  total+=subtotal;
  let situacao;
  if(s.classificacao==='CINZA')situacao='COMPRA_COMUM_NAO_CONTA';
  else if(s.classificacao==='ROXO'){
   eventoPendente=true;situacao='EVENTO_EXIGE_REGRAS_E_APROVACAO';
  }else if(s.classificacao==='VERDE'||s.classificacao==='DOURADO'){
   if(quantidade<s.quantidadeMinimaLoop||(s.classificacao==='DOURADO'&&p.precoCentavos<REFERENCIA_CENTAVOS)){
    limiarPendente=true;situacao='QUANTIDADE_MINIMA_NAO_ATINGIDA';
   }else{
    valorVerde+=subtotal;quantidadeProdutosVerdes++;
    situacao='VALOR_APTO_APENAS_PARA_SIMULACAO';
   }
  }else erro('CLASSIFICACAO_NAO_HOMOLOGADA');
  detalhes.push({
   produtoId,quantidade,precoUnitarioCentavos:p.precoCentavos,
   subtotalCentavos:subtotal,classificacao:s.classificacao,
   quantidadeMinimaLoop:s.quantidadeMinimaLoop,
   revisaoClassificacao:s.revisao,situacao
  });
 }
 const referenciaAtingida=valorVerde>=REFERENCIA_CENTAVOS;
 const faltamCentavos=Math.max(0,REFERENCIA_CENTAVOS-valorVerde);
 const status=referenciaAtingida?'REFERENCIA_VERDE_ATINGIDA_EM_SIMULACAO':
  eventoPendente?'EVENTO_PENDENTE_DE_APROVACAO':
  limiarPendente?'QUANTIDADE_MINIMA_PENDENTE':
  quantidadeProdutosVerdes?'VALOR_VERDE_INSUFICIENTE':
  'SEM_PRODUTO_VERDE_APTO';
 const mensagem=referenciaAtingida?
  'O carrinho atinge a referência com produtos elegíveis em simulação. Nenhuma posição foi criada. Ainda seriam necessárias compra confirmada, CPF, termos e todas as demais verificações.':
  eventoPendente?
   'Produtos de evento não entram na qualificação comum. O administrador ainda deve homologar regras, quantidade de posições e autorizações do evento.':
  limiarPendente?
   'Há produto elegível abaixo da quantidade mínima ou dourado com valor insuficiente. Só a quantidade qualificada poderá ser considerada.':
  'A compra ainda não atinge a referência de R$ 250 em produtos elegíveis neste pedido.';
 return {modo:'SIMULACAO_QUALIFICACAO_SEM_DIREITOS',status,
  referenciaLoopCentavos:REFERENCIA_CENTAVOS,
  totalPedidoCentavos:total,valorVerdeConsideradoCentavos:valorVerde,
  faltamCentavos,referenciaAtingida,
  itens:detalhes,eventoPendente,validacaoEspecialAutomatica:false,
  direitosCriados:0,posicoesCriadas:0,pagamentosCriados:0,saquesCriados:0,
  autorizacaoReal:false,chequeCpfETermosExecutado:false,
  pagamentoConfirmado:false,mensagem};
}
module.exports={simularQualificacaoCandidato,REFERENCIA_CENTAVOS};
