'use strict';
// Auditoria read-only de laboratorio. O extrato informado e uma fixture
// ficticia independente, nao webhook verificado nem saldo bancario real.
const TIPOS=new Set(['CONFIRMACAO_FICTICIA','ESTORNO_FICTICIO']);
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
function validar(eventos){
 if(!Array.isArray(eventos)||eventos.length>10000)
  throw new TypeError('Extrato ficticio deve ser lista limitada');
 return eventos.map(e=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||
   !ID.test(e.eventoId)||!ID.test(e.pedidoId)||
   typeof e.intentoPagamentoId!=='string'||e.intentoPagamentoId.length<1||
   e.intentoPagamentoId.length>128||!TIPOS.has(e.tipo)||
   !Number.isSafeInteger(e.valorCentavos)||e.valorCentavos<=0)
   throw new TypeError('Evento financeiro ficticio invalido');
  return {eventoId:e.eventoId,pedidoId:e.pedidoId,
   intentoPagamentoId:e.intentoPagamentoId,tipo:e.tipo,
   valorCentavos:e.valorCentavos};
 });
}
function auditarExtratoPspFicticioLoop({carrinhos,eventosExternosFicticios}={}){
 if(!carrinhos?.banco||carrinhos.ponte?.banco!==carrinhos.banco||
  !carrinhos.pedidosIdentificados||
  carrinhos.pedidosIdentificados.banco!==carrinhos.banco)
  throw new TypeError('Carrinho, pedido identificado e SQLite compartilhados obrigatorios');
 const eventos=validar(eventosExternosFicticios);
 const db=carrinhos.banco;
 const locais=carrinhos.listar().pedidos;
 const mapa=new Map(locais.map(p=>[p.pedidoId,p]));
 const vistos=new Map(),porPedido=new Map(),conflitos=new Set(),alertasGlobais=[];
 let reenviosIdenticos=0,idsConflitantes=0,eventosOrfaos=0;
 for(const e of eventos){
  const ant=vistos.get(e.eventoId);
  if(ant){
   if(ant.pedidoId===e.pedidoId&&ant.intentoPagamentoId===e.intentoPagamentoId&&
    ant.valorCentavos===e.valorCentavos&&ant.tipo===e.tipo){
    reenviosIdenticos++;continue;
   }
   idsConflitantes++;
   conflitos.add(ant.pedidoId);conflitos.add(e.pedidoId);
   alertasGlobais.push({codigo:'ID_EXTERNO_REUTILIZADO_COM_DADOS_DIVERGENTES'});
   continue;
  }
  vistos.set(e.eventoId,e);
  if(!mapa.has(e.pedidoId)){
   eventosOrfaos++;
   alertasGlobais.push({codigo:'EVENTO_EXTERNO_SEM_PEDIDO_LOCAL',
    pedidoId:e.pedidoId});
   continue;
  }
  if(!porPedido.has(e.pedidoId))porPedido.set(e.pedidoId,[]);
  porPedido.get(e.pedidoId).push(e);
 }
 const consultaPosicoes=db.prepare(
  'SELECT posicao_id AS id FROM admin_ponte_compras_demo WHERE pedido_id=?');
 const adicionais=db.prepare(
  'SELECT posicao_id AS id FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=?');
 const loja=db.prepare(`SELECT pedido_id FROM admin_ponte_vendas_loja_sem_loop_demo WHERE pedido_id=?
  UNION ALL SELECT pedido_id FROM admin_ponte_vendas_loja_apos_reajuste_demo WHERE pedido_id=?`);
 const comissoes=db.prepare(`SELECT indicador_id AS indicadorId,valor_centavos AS valorCentavos
  FROM (
   SELECT c.indicador_id,r.valor_centavos FROM admin_comissoes_indicacoes_demo c
    JOIN admin_comissoes_reserva_demo r ON r.pedido_id=c.pedido_id WHERE c.pedido_id=?
   UNION ALL
   SELECT c.indicador_id,r.valor_centavos FROM admin_comissoes_indicacoes_v2_demo c
    JOIN admin_comissoes_reserva_v2_demo r ON r.pedido_id=c.pedido_id WHERE c.pedido_id=?
  )`);
 const temSaques=!!db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_solicitacoes_saque_demo'"
 ).get();
 const saques=temSaques?db.prepare(`SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo
  WHERE conta_id=? AND tipo='BONUS'`):null;
 const linhas=[],totais={
  pedidosLocais:locais.length,eventosRecebidosFicticios:eventos.length,
  reenviosIdenticosIgnorados:reenviosIdenticos,idsConflitantes,
  eventosExternosOrfaos:eventosOrfaos,pedidosComAlertas:0,
  estornosExternosValidos:0,pedidosComPosicaoExposta:0,
  posicoesExpostas:0,bonusProvisionadoExpostoCentavos:0,
  indicadoresComSolicitacaoDeSaqueSimulada:0
 };
 for(const p of locais){
  const alertas=[];
  const porTipo=porPedido.get(p.pedidoId)||[];
  const pedido=carrinhos.pedidosIdentificados.buscar(p.pedidoId);
  if(!pedido||pedido.contaId!==p.contaId||
   pedido.valorCentavos!==p.totalCentavos)
   alertas.push('VINCULO_INTERNO_PEDIDO_DIVERGENTE');
  if(conflitos.has(p.pedidoId))alertas.push('ID_EXTERNO_CONFLITANTE');
  const validos=[];
  for(const ev of porTipo){
   if(!pedido||ev.intentoPagamentoId!==pedido.intentoPagamentoId){
    alertas.push('INTENTO_EXTERNO_DIVERGENTE');continue;
   }
   if(ev.valorCentavos!==p.totalCentavos){
    alertas.push('VALOR_EXTERNO_DIVERGENTE');continue;
   }
   validos.push(ev);
  }
  const pagos=validos.filter(x=>x.tipo==='CONFIRMACAO_FICTICIA').length;
  const estornos=validos.filter(x=>x.tipo==='ESTORNO_FICTICIO').length;
  if(pagos>1)alertas.push('CONFIRMACOES_EXTERNAS_MULTIPLAS');
  if(estornos>1)alertas.push('ESTORNOS_EXTERNOS_MULTIPLOS');
  if(estornos&&!pagos)alertas.push('ESTORNO_EXTERNO_SEM_CONFIRMACAO');
  if(estornos)totais.estornosExternosValidos++;
  const confirmacaoLocal=p.situacaoPagamentoFicticio==='CONFIRMADO_FICTICIO';
  const estornoLocal=p.situacaoPagamentoFicticio==='ESTORNADO_FICTICIO';
  if(confirmacaoLocal&&!pagos)
   alertas.push('CONFIRMACAO_LOCAL_SEM_EXTRATO_EXTERNO');
  if(confirmacaoLocal&&estornos)
   alertas.push('ESTORNO_EXTERNO_NAO_REFLETIDO_LOCALMENTE');
  if(estornoLocal&&!estornos)
   alertas.push('ESTORNO_LOCAL_NAO_COMPROVADO_NO_EXTRATO');
  if(p.situacaoPagamentoFicticio==='AGUARDANDO_FICTICIO'&&pagos&&!estornos)
   alertas.push('EXTRATO_CONFIRMADO_MAS_LOCAL_PENDENTE');
  const posicaoBase=consultaPosicoes.get(p.pedidoId);
  const qtdPosicoes=posicaoBase?1+adicionais.all(p.pedidoId).length:0;
  const vendaLoja=!!loja.get(p.pedidoId,p.pedidoId);
  const registrosBonus=comissoes.all(p.pedidoId,p.pedidoId);
  const bonus=registrosBonus.reduce((sum,x)=>{
   const s=sum+x.valorCentavos;
   if(!Number.isSafeInteger(s))throw new Error('Comissao ficticia excedeu inteiro seguro');
   return s;
  },0);
  let indicadoresComSaque=0;
  if(estornos){
   if(qtdPosicoes){
    alertas.push('ESTORNO_EXTERNO_COM_POSICAO_PRESERVADA');
    totais.pedidosComPosicaoExposta++;totais.posicoesExpostas+=qtdPosicoes;
   }
   if(vendaLoja)alertas.push('ESTORNO_EXTERNO_COM_VENDA_LOJA_PERSISTIDA');
   if(bonus){
    alertas.push('ESTORNO_EXTERNO_COM_BONUS_PROVISIONADO');
    totais.bonusProvisionadoExpostoCentavos+=bonus;
   }
   for(const b of registrosBonus){
    if(saques&&saques.get(b.indicadorId).n)indicadoresComSaque++;
   }
   if(indicadoresComSaque){
    alertas.push('INDICADOR_COM_SAQUE_SIMULADO_E_ESTORNO');
    totais.indicadoresComSolicitacaoDeSaqueSimulada+=indicadoresComSaque;
   }
  }
  if(qtdPosicoes&&(!pagos||estornos))
   alertas.push('POSICAO_SEM_COBERTURA_DO_EXTRATO_FICTICIO');
  const unicos=[...new Set(alertas)];
  if(unicos.length)totais.pedidosComAlertas++;
  linhas.push({
   pedidoId:p.pedidoId,estadoLocal:p.situacaoPagamentoFicticio,
   confirmacoesExternasValidas:pagos,estornosExternosValidos:estornos,
   posicoesPersistidas:qtdPosicoes,vendaSomenteLojaPersistida:vendaLoja,
   bonusProvisionadoCentavos:bonus,
   indicadorComPedidoSaqueSimulado:indicadoresComSaque>0,
   alertas:unicos,exigeRevisao:unicos.length>0
  });
 }
 return {
  modo:'CONCILIACAO_CRUZADA_PSP_FICTICIO_SOMENTE_LABORATORIO',
  situacao:totais.pedidosComAlertas||alertasGlobais.length?'EXIGE_REVISAO':'SEM_DIVERGENCIAS_NESTA_AMOSTRA',
  totais,alertasGlobais,linhas,
  somenteLeitura:true,estornosNaoCancelamPosicoes:true,
  movimentacaoBancariaReal:false,conciliacaoPspReal:false,
  pagamentosAutorizados:false,saquesReaisHabilitados:false,
  semCpfOuDadosBancariosNoResultado:true
 };
}
module.exports={auditarExtratoPspFicticioLoop};
