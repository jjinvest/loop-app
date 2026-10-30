'use strict';
// Rastreio read-only dos seis pedidos FICTICIOS por ciclo persistido.
// Aportes locais NUNCA sao liquidacao bancaria nem autorizacao de saque.
function auditarSeisPedidosDoCicloLab({banco,ponte}={}){
 if(!banco?.prepare||!ponte||ponte.banco!==banco||
   typeof ponte._restaurar!=='function')
  throw new TypeError('SQLite e ponte de laboratorio compartilhados obrigatorios');
 const necessario=['loop_v6_provisoes_ciclos','loop_v6_provisoes_eventos',
  'admin_ponte_compras_demo','loop_v6_pre_aportes_demo','loop_v6_pre_receitas'];
 const presentes=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const ausentes=necessario.filter(t=>!presentes.has(t));
 if(ausentes.length)return {
  modo:'RASTREIO_SEIS_PEDIDOS_LAB',situacao:'LIVROS_AUSENTES',
  tabelasAusentes:ausentes,aposPspReal:false,somenteLeitura:true};
 const ciclos=banco.prepare(
  'SELECT giro FROM loop_v6_provisoes_ciclos ORDER BY giro').all();
 const eventos=banco.prepare(`SELECT e.giro,e.ordem,
  e.venda_id AS vendaId,e.pedido_id AS pedidoId,
  e.referencia_centavos AS referenciaCentavos,
  c.posicao_id AS posicaoId, a.aporte_id AS aporteId,
  r.liquido_centavos AS valorDeAporteFicticio
  FROM loop_v6_provisoes_eventos e
  LEFT JOIN admin_ponte_compras_demo c ON c.pedido_id=e.pedido_id
  LEFT JOIN loop_v6_pre_aportes_demo a ON a.pedido_id=e.pedido_id
  LEFT JOIN loop_v6_pre_receitas r ON r.pedido_id=e.pedido_id
  ORDER BY e.giro,e.ordem`).all();
 const historico=ponte._restaurar().tabuleiro.ciclosConcluidos
  .filter(c=>c.vendas?.length===6);
 const todos=new Set(),alertas=[],itens=[];
 for(const {giro} of ciclos){
  const grupo=eventos.filter(e=>e.giro===giro);
  const avisos=[];
  if(grupo.length!==6)avisos.push('QUANTIDADE_EVENTOS_DIFERENTE_DE_SEIS');
  const ordens=new Set();
  const pedidosNoGiro=new Set();
  for(const e of grupo){
   if(!Number.isInteger(e.ordem)||e.ordem<1||e.ordem>6||
    ordens.has(e.ordem))avisos.push('ORDEM_INVALIDA');
   ordens.add(e.ordem);
   if(e.vendaId!=='compra-demo-'+e.pedidoId)
    avisos.push('PEDIDO_E_VENDA_NAO_CORRESPONDEM');
   if(e.pedidoId==null||e.pedidoId==='')avisos.push('PEDIDO_ID_AUSENTE');
   if(pedidosNoGiro.has(e.pedidoId))avisos.push('PEDIDO_REPETIDO_NO_MESMO_GIRO');
   pedidosNoGiro.add(e.pedidoId);
   if(todos.has(e.pedidoId))avisos.push('PEDIDO_CONSUMIDO_DUAS_VEZES');
   todos.add(e.pedidoId);
   if(e.posicaoId==null)avisos.push('COMPRA_FICTICIA_INEXISTENTE');
   if(e.aporteId==null||e.valorDeAporteFicticio==null)
    avisos.push('APORTE_FICTICIO_AUSENTE');
   if(!Number.isSafeInteger(e.referenciaCentavos)||e.referenciaCentavos<=0)
    avisos.push('REFERENCIA_INVALIDA');
  }
  const esperado=historico.find(c=>c.ciclo===giro);
  if(!esperado||esperado.vendas.length!==grupo.length||
   esperado.vendas.some((v,i)=>v.vendaId!==grupo[i]?.vendaId||
    v.ordem!==grupo[i]?.ordem))
   avisos.push('LIVRO_DIVERGE_DO_MOTOR_PERSISTIDO');
  const unicos=[...new Set(avisos)];
  alertas.push(...unicos.map(codigo=>({giro,codigo})));
  itens.push({giro,eventos:grupo.length,pedidosDistintos:new Set(grupo.map(e=>e.pedidoId)).size,
   alertas:unicos});
 }
 if(new Set(ciclos.map(c=>c.giro)).size!==ciclos.length)
  alertas.push({codigo:'GIRO_DUPLICADO_NO_LIVRO'});
 if(ciclos.length!==historico.length)
  alertas.push({codigo:'CICLOS_DO_LIVRO_DIVERGEM_DO_MOTOR'});
 if(eventos.some(e=>!ciclos.some(c=>c.giro===e.giro)))
  alertas.push({codigo:'EVENTO_SEM_CICLO'});
 return {modo:'RASTREIO_SEIS_PEDIDOS_LAB',
  situacao:alertas.length?'EXIGE_REVISAO':'CONSISTENTE_APENAS_NO_LABORATORIO',
  girosDocumentados:ciclos.length,eventosDocumentados:eventos.length,
  pedidosFicticiosDistintos:todos.size,itens,alertas,
  somenteLeitura:true,aportesNaoSaoPagamentosReais:true,
  liquidacaoPspComprovada:false,transferenciasReaisAutorizadas:false};
}
module.exports={auditarSeisPedidosDoCicloLab};
