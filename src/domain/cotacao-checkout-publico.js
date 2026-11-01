'use strict';
// Preparação da jornada pública: orçamento SEM compromisso, pedido ou pagamento.
// O catálogo é a única fonte de preço; nenhum dado pessoal é armazenado.
function falhar(codigo){const erro=new Error(codigo);erro.codigo=codigo;return erro;}
const ID_PRODUTO=/^[a-z0-9-]{3,80}$/;
const MAX_ITENS=20,MAX_QUANTIDADE=50,MAX_TOTAL_CENTAVOS=100000000;
function entradaValida(dados){
 if(!dados||typeof dados!=='object'||Array.isArray(dados)||
  Object.keys(dados).sort().join(',')!=='itens')throw falhar('CAMPOS_COTACAO_INVALIDOS');
 const {itens}=dados;
 if(!Array.isArray(itens)||!itens.length||itens.length>MAX_ITENS)
  throw falhar('ITENS_COTACAO_INVALIDOS');
 const vistos=new Set();
 for(const item of itens){
  if(!item||typeof item!=='object'||Array.isArray(item)||
    Object.keys(item).sort().join(',')!=='produtoId,quantidade'||
    typeof item.produtoId!=='string'||!ID_PRODUTO.test(item.produtoId)||
    !Number.isSafeInteger(item.quantidade)||item.quantidade<1||item.quantidade>MAX_QUANTIDADE)
   throw falhar('ITEM_COTACAO_INVALIDO');
  if(vistos.has(item.produtoId))throw falhar('PRODUTO_REPETIDO_NA_COTACAO');
  vistos.add(item.produtoId);
 }
 return itens;
}
async function cotarCheckoutPublico({repositorio,entrada}={}){
 if(typeof repositorio?.buscar!=='function')
  throw new TypeError('Repositorio com buscar() obrigatorio');
 const itens=entradaValida(entrada);
 let totalCentavos=0;
 const fotografia=[];
 for(const {produtoId,quantidade} of itens){
  // Nao vazar catalogo interno, produtos despublicados ou demo.
  const p=await repositorio.buscar(produtoId);
  if(!p||p.estado!=='PUBLICADO'||!['PDF','FISICO'].includes(p.tipo)||
    !Number.isSafeInteger(p.precoCentavos)||p.precoCentavos<=0||
    typeof p.nome!=='string'||!p.nome.trim())
   throw falhar('PRODUTO_INDISPONIVEL_PARA_COTACAO');
  const subtotalCentavos=p.precoCentavos*quantidade;
  if(!Number.isSafeInteger(subtotalCentavos)||
    subtotalCentavos>MAX_TOTAL_CENTAVOS||
    totalCentavos+subtotalCentavos>MAX_TOTAL_CENTAVOS)
   throw falhar('LIMITE_COTACAO_EXCEDIDO');
  totalCentavos+=subtotalCentavos;
  fotografia.push(Object.freeze({
   produtoId, nome:p.nome, tipo:p.tipo,quantidade,
   precoUnitarioCentavos:p.precoCentavos,subtotalCentavos
  }));
 }
 return Object.freeze({
  modo:'COTACAO_INFORMATIVA_SEM_PEDIDO',
  moeda:'BRL',itens:fotografia,totalCentavos,
  precoNaoReservado:true,compraDisponivel:false,
  pedidoCriado:false,cobrancaCriada:false,pagamentoReal:false,
  quantidadePosicoesCriadas:0,participacaoLoopDisponivel:false,
  aviso:'Cotacao sem compromisso. Nao gera pedido, reserva de preco, posicao ou pagamento.'
 });
}
module.exports={cotarCheckoutPublico,entradaValida};
