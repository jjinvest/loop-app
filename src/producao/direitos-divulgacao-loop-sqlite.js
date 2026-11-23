'use strict';
// Leitura da habilitacao comercial do link pessoal. Cadastro e nick nao
// autorizam divulgacao: apenas compra confirmada de produto habilitador.
// Nenhuma rotina credita comissao, gera posicao ou movimenta a catraca.
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const CORES_LINK=Object.freeze(['VERDE','ROXO','DOURADO','LARANJA']);
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function conferirBanco(banco){
 if(typeof banco?.prepare!=='function')erro('DIVULGACAO_BANCO_INVALIDO');
}
function fontesPresentes(banco){
 const nomes=['loja_real_pedidos','loop_real_fotos_regras_pedido'];
 const achados=banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)"
 ).all(...nomes);
 return achados.length===nomes.length;
}
function liberadoPeloPedido(banco,titularId,antesDe=null){
 const partes=[
  'SELECT 1 FROM loja_real_pedidos p',
  'JOIN loop_real_fotos_regras_pedido f ON f.pedido_id=p.pedido_id',
  'WHERE p.titular_id=?',
  "AND p.status='APROVADO_PARA_EXPEDICAO'",
  'AND p.pagamento_id IS NOT NULL AND length(p.pagamento_id)>0',
  'AND f.revisao>0',
  "AND f.cor IN ('VERDE','ROXO','DOURADO','LARANJA')",
  ...(antesDe===null?[]:['AND p.atualizado_em<=?']),
  'LIMIT 1'
 ];
 return !!banco.prepare(partes.join(' ')).get(...(
  antesDe===null?[titularId]:[titularId,antesDe]
 ));
}
function consultarDivulgacao({banco,titularId}={}){
 conferirBanco(banco);
 if(typeof titularId!=='string'||!TITULAR.test(titularId))
  erro('DIVULGACAO_TITULAR_INVALIDO');
 const pronta=fontesPresentes(banco);
 const liberado=pronta&&liberadoPeloPedido(banco,titularId);
 return Object.freeze({
  fonte:'PEDIDO_PSP_CONFIRMADO_COM_FOTOGRAFIA_DA_COR',
  linkLiberado:liberado,compraHabilitadoraConfirmada:liberado,
  cadastroSozinhoNaoLibera:true,cinzaNaoLibera:true,
  independeDeAdesaoAoLoop:true,participacaoLoopAtiva:false,
  financeiroReal:false
 });
}
// Projecao contábil em leitura: NUNCA é saldo disponível, repasse ou crédito.
// Considera apenas venda confirmada de indicado que entrou quando o divulgador
// já tinha um pedido habilitador confirmado. Independe de posição no LOOP.
// Base 10%: preço dos produtos efetivamente adquiridos, sem frete.
function consultarComissoesDivulgacao({banco,titularId}={}){
 conferirBanco(banco);
 if(typeof titularId!=='string'||!TITULAR.test(titularId))
  erro('DIVULGACAO_TITULAR_INVALIDO');
 const tabelas=fontesPresentes(banco)&&!!banco.prepare([
  "SELECT 1 FROM sqlite_master WHERE type='table'",
  "AND name='loop_real_vinculos_indicacao'"
 ].join(' ')).get();
 const base={percentual:10,fonte:'VENDAS_CONFIRMADAS_DE_INDICADOS',
  somenteLeitura:true,financeiroReal:false,
  comissaoPagaCentavos:0,saldoLiberadoCentavos:0,
  nenhumaPosicaoLoopCriada:true,podeSacar:false};
 if(!tabelas)return {...base,vendasConfirmadas:0,
  comissaoAConferirCentavos:0,fonteCompleta:false};
 const linhas=banco.prepare([
  'SELECT p.pedido_id,',
  'SUM(f.preco_unit_centavos*f.quantidade) AS base_centavos',
  'FROM loop_real_vinculos_indicacao v',
  'JOIN loja_real_pedidos p ON p.titular_id=v.indicado_id',
  'JOIN loop_real_fotos_regras_pedido f ON f.pedido_id=p.pedido_id',
  'WHERE v.indicador_id=?',
  "AND p.status='APROVADO_PARA_EXPEDICAO'",
  'AND p.pagamento_id IS NOT NULL',
  'AND p.atualizado_em>=v.registrado_em',
  'AND EXISTS (',
  'SELECT 1 FROM loja_real_pedidos origem',
  'JOIN loop_real_fotos_regras_pedido f2',
  'ON f2.pedido_id=origem.pedido_id',
  'WHERE origem.titular_id=v.indicador_id',
  "AND origem.status='APROVADO_PARA_EXPEDICAO'",
  'AND origem.pagamento_id IS NOT NULL',
  'AND f2.revisao>0',
  "AND f2.cor IN ('VERDE','ROXO','DOURADO','LARANJA')",
  'AND origem.atualizado_em<=v.registrado_em',
  ') GROUP BY p.pedido_id'
 ].join(' ')).all(titularId);
 let total=0;
 for(const linha of linhas){
  if(!Number.isSafeInteger(linha.base_centavos)||linha.base_centavos<=0)
   erro('DIVULGACAO_BASE_PEDIDO_INCONSISTENTE');
  total+=Math.floor(linha.base_centavos/10);
  if(!Number.isSafeInteger(total))erro('DIVULGACAO_COMISSOES_EXCEDIDAS');
 }
 return {...base,vendasConfirmadas:linhas.length,
  comissaoAConferirCentavos:total,fonteCompleta:true};
}
function verificarNickDivulgador({banco,nick}={}){
 conferirBanco(banco);
 if(typeof nick!=='string'||!/^[a-zA-Z]{1,12}$/.test(nick))
  erro('DIVULGACAO_NICK_INVALIDO');
 const id=banco.prepare(
  'SELECT id FROM loop_real_contas WHERE nick=?'
 ).get(nick)?.id;
 return id?consultarDivulgacao({banco,titularId:id}).linkLiberado:false;
}
module.exports={consultarDivulgacao,consultarComissoesDivulgacao,verificarNickDivulgador,CORES_LINK};
