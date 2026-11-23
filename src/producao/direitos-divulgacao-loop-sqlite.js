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
function verificarNickDivulgador({banco,nick}={}){
 conferirBanco(banco);
 if(typeof nick!=='string'||!/^[a-zA-Z]{1,12}$/.test(nick))
  erro('DIVULGACAO_NICK_INVALIDO');
 const id=banco.prepare(
  'SELECT id FROM loop_real_contas WHERE nick=?'
 ).get(nick)?.id;
 return id?consultarDivulgacao({banco,titularId:id}).linkLiberado:false;
}
module.exports={consultarDivulgacao,verificarNickDivulgador,CORES_LINK};
