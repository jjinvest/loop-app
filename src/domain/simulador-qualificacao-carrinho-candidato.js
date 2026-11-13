'use strict';
// Avaliação SOMENTE INFORMATIVA: referência, quantidades e classes de produto.
// Não verifica CPF, termos, pagamento, titularidade, motor de filas, tabuleiro,
// cofre ou elegibilidade jurídica. Não cria qualquer posição ou lançamento.
const {entradaValida}=require('./cotacao-checkout-publico');
const {planejarPosicoesCompraAkitemm}=require('./plano-posicoes-compra-akitemm');
const REFERENCIA_CENTAVOS=25000;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function simularQualificacaoCandidato({entrada,catalogo,sinalizacao,
 ofertasCompostas=null}={}){
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
   const posicoes=s.modoRoxo==='POR_PEDIDO'?
    s.posicoesPorPedidoRoxo:s.posicoesPorUnidadeRoxo;
   if(!posicoes)eventoPendente=true;
   if(quantidade<Math.max(s.quantidadeMinimaLoop,
      s.modoRoxo==='POR_PEDIDO'?s.quantidadeMinimaRoxo:1))
    limiarPendente=true;
   situacao='OFERTA_ROXA_APENAS_PLANEJADO_SEM_DIREITOS';
  }else if(s.classificacao==='DOURADO'){
   const pacote=s.modoDourado==='POR_PEDIDO';
   const pisoOk=pacote?
    p.precoCentavos*s.quantidadeMinimaLoop>=REFERENCIA_CENTAVOS:
    p.precoCentavos>=REFERENCIA_CENTAVOS;
   if(quantidade<s.quantidadeMinimaLoop){
    limiarPendente=true;situacao='QUANTIDADE_MINIMA_NAO_ATINGIDA';
   }else situacao=pisoOk?
    (pacote?'PACOTE_DOURADO_PLANEJADO_SEM_DIREITOS':
     'UNIDADE_DOURADA_PLANEJADA_SEM_DIREITOS'):
    'DOURADO_PRECO_INSUFICIENTE';
  }else if(s.classificacao==='VERDE'){
   if(quantidade<s.quantidadeMinimaLoop){
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
   revisaoClassificacao:s.revisao,situacao,
   minimo:s.quantidadeMinimaLoop,
   posicoesPorUnidadeRoxo:s.posicoesPorUnidadeRoxo||0,
   modoRoxo:s.modoRoxo,quantidadeMinimaRoxo:s.quantidadeMinimaRoxo,
   posicoesPorPedidoRoxo:s.posicoesPorPedidoRoxo||0,
   modoDourado:s.modoDourado,
   posicoesPorPedidoDourado:s.posicoesPorPedidoDourado||0
  });
 }
 const pacotes=ofertasCompostas?ofertasCompostas.fotografar(detalhes):[];
 const planejamentoPosicoes=planejarPosicoesCompraAkitemm(detalhes,
  {ofertasCompostas:pacotes});
 const referenciaAtingida=valorVerde>=REFERENCIA_CENTAVOS;
 const faltamCentavos=Math.max(0,REFERENCIA_CENTAVOS-valorVerde);
 const status=referenciaAtingida?'REFERENCIA_VERDE_ATINGIDA_EM_SIMULACAO':
  planejamentoPosicoes.posicoesDourado>0?'DOURADO_PLANEJADO_SEM_DIREITOS':
  eventoPendente?'EVENTO_PENDENTE_DE_APROVACAO':
  limiarPendente?'QUANTIDADE_MINIMA_PENDENTE':
  quantidadeProdutosVerdes?'VALOR_VERDE_INSUFICIENTE':
  'SEM_PRODUTO_VERDE_APTO';
 const mensagem=planejamentoPosicoes.excedeLimitePorPedido?
  'A compra prevê mais de dez posições; deverá ser bloqueada ou revisada antes de qualquer cobrança. Nenhuma posição real criada.':
  planejamentoPosicoes.posicoesDourado>0||planejamentoPosicoes.posicoesRoxo>0?
  (pacotes.length?
   'Pacote composto completo no carrinho: vale a regra do pacote e nao se somam beneficios individuais dos itens. Nenhum direito real.':
   'Compra com ofertas configuradas: dourada por unidade ou pacote, roxa por quantidade definida. Verde mantém no máximo uma posição ao atingir R$ 250. Prévia sem direitos comerciais.'):
  referenciaAtingida?
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
  itens:detalhes,planejamentoPosicoes,ofertasCompostas:pacotes,
  eventoPendente,validacaoEspecialAutomatica:false,
  direitosCriados:0,posicoesCriadas:0,pagamentosCriados:0,saquesCriados:0,
  autorizacaoReal:false,chequeCpfETermosExecutado:false,
  pagamentoConfirmado:false,mensagem};
}
module.exports={simularQualificacaoCandidato,REFERENCIA_CENTAVOS};
