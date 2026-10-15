'use strict';

// Projecao individual do laboratorio; nunca retorna a lista geral do admin.
// Sem consulta financeira real, CPF, entrega, saque ou autorizacao de pedido.
const LIMITE_ATIVAS=5;

function posicoesTitular(sim,contaId){
 const f=sim.filas,t=sim.tabuleiro;
 const itens=[];
 function anexar(posicao,local){
  if(posicao&&posicao.participanteId===contaId){
   itens.push({posicaoId:posicao.id,local,entrouEm:posicao.entrouEm});
  }
 }
 f.filaA.forEach(p=>anexar(p,'FILA_A'));
 f.filaB.forEach(p=>anexar(p,'FILA_B'));
 anexar(t.centro,'CENTRO');
 t.vagas.forEach((p,i)=>anexar(p,'VAGA_'+(i+1)));
 return itens;
}
class EscritorioIndividualDemo{
 constructor({ponte,contas}={}){
  if(!ponte||!ponte.banco||typeof ponte._restaurar!=='function'||
    !contas||typeof contas.buscar!=='function'||ponte.banco!==contas.banco){
   throw new TypeError('Ponte e contas devem compartilhar SQLite de laboratorio');
  }
  this.banco=ponte.banco;this.ponte=ponte;this.contas=contas;
 }
 consultar(contaId){
  const conta=this.contas.buscar(contaId);
  if(!conta)return null;
  const compras=this.banco.prepare(`
   SELECT pedido_id AS pedidoId,produto_id AS produtoId,
    valor_centavos AS valorCentavos,confirmado_em AS confirmadoEm,
    posicao_id AS posicaoId
   FROM admin_ponte_compras_demo WHERE conta_id=?
   ORDER BY confirmado_em,pedido_id
  `).all(contaId);
  const comprasLojaSemLoop=this.banco.prepare(`
   SELECT pedido_id AS pedidoId,produto_id AS produtoId,
    valor_centavos AS valorCentavos,confirmado_em AS confirmadoEm
   FROM (
    SELECT * FROM admin_ponte_vendas_loja_sem_loop_demo
    UNION ALL SELECT * FROM admin_ponte_vendas_loja_apos_reajuste_demo
   ) WHERE conta_id=?
   ORDER BY confirmado_em,pedido_id
  `).all(contaId);
  const indicacoes=this.banco.prepare(`
   SELECT c.id AS convidadoId,
    v.convidado_id AS confirmadoId,
    a.convidado_id AS aplicadoId
   FROM admin_contas_participantes_demo c
   LEFT JOIN admin_ponte_convites_validados_demo v
     ON v.convidado_id=c.id AND v.indicador_id=?
   LEFT JOIN admin_ponte_convites_aplicados_demo a
     ON a.convidado_id=v.convidado_id
   WHERE c.indicado_por_id=?
  `).all(contaId,contaId);
  const posicoes=posicoesTitular(this.ponte._restaurar(),contaId);
  const idsAtivos=new Set();
  for(const p of posicoes){
   if(!Number.isSafeInteger(p.posicaoId)||idsAtivos.has(p.posicaoId)){
    throw new Error('Integridade de posicoes ficticias invalida');
   }
   idsAtivos.add(p.posicaoId);
  }
  const comprasPorPosicao=new Map();
  for(const c of compras){
   if(comprasPorPosicao.has(c.posicaoId)){
    throw new Error('Posicao de teste associada a multiplos pedidos');
   }
   comprasPorPosicao.set(c.posicaoId,c.pedidoId);
  }
  // Ponte ainda nao cria giros nem historico de posicoes concluídas:
  // o ledger de compras deve corresponder exatamente a posicoes ativas.
  if(posicoes.length!==compras.length||
    posicoes.some(p=>!comprasPorPosicao.has(p.posicaoId))){
   throw new Error('Integridade entre compras e posicoes do titular divergente');
  }
  if(posicoes.length>LIMITE_ATIVAS)throw new Error('Limite de posicoes do titular excedido');
  const confirmadas=indicacoes.filter(c=>c.confirmadoId!==null).length;
  const aplicadas=indicacoes.filter(c=>c.aplicadoId!==null).length;
  if(aplicadas>confirmadas)throw new Error('Historico de indicacoes inconsistente');
  return {
   modo:'ESCRITORIO_INDIVIDUAL_EXCLUSIVAMENTE_FICTICIO',
   conta:{nome:conta.nome,login:conta.login,codigoConvite:conta.codigoConvite},
   compras:compras.map(c=>{
    const ref=this.banco.prepare(
     'SELECT revisao_valor AS revisaoValor, valor_referencia_centavos AS valorReferenciaCentavos FROM admin_ponte_posicoes_valores_demo WHERE pedido_id=?'
    ).get(c.pedidoId);
    if(!ref)throw new Error('Referencia da posicao de teste nao identificada');
    return {...c,...ref,confirmacao:'INTERNA_SIMULADA',
     status:'CONFIRMADO_SOMENTE_TESTE'};
   }),
   comprasLojaSemLoop:comprasLojaSemLoop.map(c=>({
    ...c,confirmacao:'INTERNA_SIMULADA',
    status:'VENDA_LOJA_SEM_POSICAO_LOOP',posicaoCriada:false
   })),
   posicoes:posicoes.sort((a,b)=>a.posicaoId-b.posicaoId),
   limitePosicoesAtivas:LIMITE_ATIVAS,
   vagasLivres:LIMITE_ATIVAS-posicoes.length,
   indicacoes:{
    cadastrosPorConvite:indicacoes.length,
    cadastrosPendentes:indicacoes.length-confirmadas,
    comprasConfirmadasFicticias:confirmadas,
    aplicadasNaFilaA:aplicadas
   },
   semOutrosTitulares:true,semCPF:true,semPagamentoReal:true,
   semSaque:true,semContemplacaoReal:true,
   termosJuridicosAprovados:false
  };
 }
}
module.exports={EscritorioIndividualDemo,posicoesTitular};
