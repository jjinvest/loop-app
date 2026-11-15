'use strict';
// Projecao de leitura sobre o MESMO SQLite da identidade, loja e motor.
// Nao ativa posicao ou dinheiro real; nao permite cliente escrever no motor.
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class VisaoEscritorioUnificadaSQLite{
 constructor({banco,motor,consultarTelefone=()=>null}={}){
  if(!banco||typeof banco.prepare!=='function'||
     !motor||motor.banco!==banco||
     typeof motor.consultar!=='function'||
     typeof motor.verificar!=='function'||
     typeof consultarTelefone!=='function'||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE name='loop_real_motor_qualificacoes'").get()||
     !banco.prepare("SELECT 1 FROM sqlite_master WHERE name='loop_real_vinculos_indicacao'").get())
   falha('ESCRITORIO_UNIFICADO_EXIGE_MESMO_SQLITE');
  this.banco=banco;this.motor=motor;
  this.consultarTelefone=consultarTelefone;
 }
 _titular(id){
  if(typeof id!=='string'||!TITULAR.test(id)||
     !this.banco.prepare('SELECT 1 FROM loop_real_contas WHERE id=?').get(id))
   falha('ESCRITORIO_TITULAR_INVALIDO');
 }
 _resumoRede(id){
  const r=this.banco.prepare([
   'SELECT COUNT(*) AS total,',
   'COALESCE(SUM(CASE WHEN EXISTS(',
   'SELECT 1 FROM loop_real_motor_compras m',
   'WHERE m.titular_id=v.indicado_id)',
   'THEN 1 ELSE 0 END),0) AS compras,',
   'COALESCE(SUM(CASE WHEN q.indicado_id IS NOT NULL',
   'THEN 1 ELSE 0 END),0) AS qualificadas',
   'FROM loop_real_vinculos_indicacao v',
   'LEFT JOIN loop_real_motor_qualificacoes q',
   'ON q.indicado_id=v.indicado_id AND q.indicador_id=v.indicador_id',
   'WHERE v.indicador_id=?'
  ].join(' ')).get(id);
  if(!r||r.qualificadas>r.compras||r.compras>r.total)
   falha('ESCRITORIO_REDE_INCONSISTENTE');
  return Object.freeze({cadastros:r.total,comprasEmEnsaio:r.compras,
   qualificadasEmEnsaio:r.qualificadas,
   comprasAguardandoQualificacaoEnsaio:r.compras-r.qualificadas,
   cadastrosAguardandoCompra:r.total-r.compras,
   comissoesReais:0,financeiroReal:false});
 }
 consultarEstado({titularId}={}){
  this._titular(titularId);
  const d=this.motor.consultar({titularId});
  if(d.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||
     d.financeiroReal!==false||!Array.isArray(d.minhasPosicoes))
   falha('ESCRITORIO_MOTOR_NAO_CONFIAVEL');
  const lotesPresentes=!!this.banco.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_promocoes_lotes_posicoes_ensaio'"
  ].join(' ')).get();
  // Cada posicao especial tem chave interna distinta, mas o cliente ve
  // exclusivamente o pedido comercial ORIGINAL, jamais venda sintetica.
  const compras=this.banco.prepare(lotesPresentes?[
   'SELECT m.posicao_id,COALESCE(l.pedido_id,m.pedido_id) AS pedido_id,',
   'm.valor_centavos AS valor_base_posicao_centavos',
   'FROM loop_real_motor_compras m',
   'LEFT JOIN loop_real_promocoes_lotes_posicoes_ensaio l',
   'ON l.venda_interna_id=m.pedido_id',
   'WHERE m.titular_id=?'
  ].join(' '):[
   'SELECT posicao_id,pedido_id,',
   'valor_centavos AS valor_base_posicao_centavos FROM loop_real_motor_compras',
   'WHERE titular_id=?'
  ].join(' ')).all(titularId);
  const porPosicao=new Map(compras.map(x=>[x.posicao_id,x]));
  const tabelaExiste=nome=>!!this.banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(nome);
  const temPedidos=tabelaExiste('loja_real_pedidos');
  const temItens=tabelaExiste('loja_real_custos_pedido');
  const temProdutos=tabelaExiste('loja_real_produtos');
  const buscarPedido=temPedidos?this.banco.prepare([
   'SELECT pedido_id,status,valor_total_centavos FROM loja_real_pedidos',
   'WHERE pedido_id=? AND titular_id=?'
  ].join(' ')):null;
  const buscarItens=temItens?this.banco.prepare([
   'SELECT i.sku,i.produto_id,i.quantidade,i.preco_unit_centavos,',
   temProdutos?'p.titulo AS titulo':'NULL AS titulo',
   'FROM loja_real_custos_pedido i',
   ...(temProdutos?['LEFT JOIN loja_real_produtos p ON p.produto_id=i.produto_id']:[]),
   'WHERE i.pedido_id=? ORDER BY i.fornecedor_id,i.sku LIMIT 100'
  ].join(' ')):null;
  const vinculos=this.banco.prepare([
   'SELECT posicao_id,COUNT(*) AS total',
   'FROM loop_real_motor_qualificacoes WHERE indicador_id=?',
   'GROUP BY posicao_id'
  ].join(' ')).all(titularId);
  const count=new Map(vinculos.map(x=>[x.posicao_id,x.total]));
  const posicoes=d.minhasPosicoes.map(p=>{
   if(!Number.isSafeInteger(p.numero)||!porPosicao.has(p.numero))
    falha('ESCRITORIO_POSICAO_SEM_PEDIDO_NO_LIVRO');
   const qualificadas=count.get(p.numero)||0;
   if(qualificadas!==(p.indicacoesVinculadas||0))
    falha('ESCRITORIO_INDICACOES_FORA_DO_MOTOR');
   const registro=porPosicao.get(p.numero);
   const pedido=buscarPedido?.get(registro.pedido_id,titularId)||null;
   const itens=pedido&&buscarItens?
    buscarItens.all(pedido.pedido_id).map(item=>({
     titulo:typeof item.titulo==='string'&&item.titulo.trim()?
      item.titulo:null,
     produtoId:item.produto_id||null,sku:item.sku,
     quantidade:item.quantidade,
     precoUnitarioCentavos:item.preco_unit_centavos
    })):[];
   if(itens.some(x=>!Number.isSafeInteger(x.quantidade)||x.quantidade<1||
     !Number.isSafeInteger(x.precoUnitarioCentavos)||x.precoUnitarioCentavos<1))
    falha('ESCRITORIO_ITENS_PEDIDO_INVALIDOS');
   // O valor da base do motor não prova que houve pagamento externo.
   // A cor verde exige um registro REAL de identidade validada, que
   // ainda não existe nesta integração; ACEITE_ENSAIO nunca é verde.
   return {...p,pedidoDeOrigemEnsaio:registro.pedido_id,
    origemComercial:{
     pedidoId:registro.pedido_id,
     valorBaseMotorEnsaioCentavos:registro.valor_base_posicao_centavos,
     valorTotalPedidoCentavos:pedido?.valor_total_centavos??null,
     statusPedido:pedido?.status??null,itens
    },
    confirmacaoExternaVerificada:false,
    indicacoesQualificadasEnsaio:qualificadas,
    posicaoRemuneradaReal:false,movimentacaoRealAutorizada:false};
  });
  return {...d,minhasPosicoes:posicoes,
   minhasPosicoesAtivasEmEnsaio:posicoes.length,
   redeResumo:this._resumoRede(titularId),
   somenteLeitura:true,compraRealHabilitada:false,
   catracaClientePodeGirar:false,financeiroReal:false};
 }
 listarRede({titularId,offset=0,limite=50}={}){
  this._titular(titularId);
  if(!Number.isSafeInteger(offset)||offset<0||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   falha('ESCRITORIO_PAGINACAO_INVALIDA');
  const rows=this.banco.prepare([
   'SELECT v.indicado_id AS indicadoId,c.nick,',
   'v.registrado_em AS registradoEm,',
   'q.posicao_id AS posicaoDestinoEnsaio,',
   'EXISTS(SELECT 1 FROM loop_real_motor_compras m',
   'WHERE m.titular_id=v.indicado_id) AS compraEmEnsaio',
   'FROM loop_real_vinculos_indicacao v',
   'JOIN loop_real_contas c ON c.id=v.indicado_id',
   'LEFT JOIN loop_real_motor_qualificacoes q',
   'ON q.indicado_id=v.indicado_id AND q.indicador_id=v.indicador_id',
   'WHERE v.indicador_id=?',
   'ORDER BY v.registrado_em ASC,v.indicado_id ASC',
   'LIMIT ? OFFSET ?'
  ].join(' ')).all(titularId,limite,offset);
  const resumo=this._resumoRede(titularId);
  return {indicados:rows.map((x,i)=>({
   nick:x.nick,registradoEm:x.registradoEm,
   numeroCadastro:offset+i+1,filaCadastro:'B',
   telefone:this.consultarTelefone({
    indicadorId:titularId,indicadoId:x.indicadoId
   }),
   estado:x.posicaoDestinoEnsaio!==null?'QUALIFICACAO_ENSAIO':
    x.compraEmEnsaio?'COMPRA_ENSAIO_SEM_QUALIFICACAO':
    'CADASTRO_AGUARDANDO_COMPRA',
   posicaoDestinoEnsaio:x.posicaoDestinoEnsaio,
   remuneracaoReal:false
  })),total:resumo.cadastros,
   temMais:resumo.cadastros>offset+rows.length,
   proximoOffset:resumo.cadastros>offset+rows.length?
    offset+rows.length:null,resumo,remuneracoesConfirmadas:0,
   qualificacoesReais:0,financeiroReal:false};
 }
}
module.exports={VisaoEscritorioUnificadaSQLite};
