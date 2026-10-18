'use strict';

// Projecao individual do laboratorio; nunca retorna a lista geral do admin.
// Sem consulta financeira real, CPF, entrega, saque ou autorizacao de pedido.
const LIMITE_ATIVAS=6;

function posicoesTitular(sim,contaId){
 const f=sim.filas,t=sim.tabuleiro;
 const itens=[];
 function anexar(posicao,local){
  if(posicao&&posicao.participanteId===contaId&&!['PRAZO_ENCERRADO','DESISTENTE'].includes(posicao.statusAdesao)&&posicao.empresa!==true){
   itens.push({posicaoId:posicao.id,local,entrouEm:posicao.entrouEm,
    statusAdesao:posicao.statusAdesao||'ATIVA_LEGADA'});
  }
 }
 f.filaA.forEach(p=>anexar(p,'FILA_A'));
 f.filaB.forEach(p=>anexar(p,'FILA_B'));
 anexar(t.centro,'CENTRO');
 t.vagas.forEach((p,i)=>anexar(p,'VAGA_'+(i+1)));
 return itens;
}
// Visao PUBLICAVEL por sessao: nunca expor nome, CPF, email ou ID de outras contas.
function mapaCoresDoEscritorio(sim,contaId){
 function marcar(p){
  if(!p)return null;
  let cor='CINZA';
  if(p.empresa===true||p.statusAdesao==='PRAZO_ENCERRADO')cor='DOURADO';
  else if(p.statusAdesao==='PENDENTE')cor='AZUL';
  else if(p.participanteId===contaId)cor='VERMELHO';
  // Apenas sinalizamos titularidade AO PROPRIO TITULAR.
  // Azul continua azul para todos; o destaque nao interfere na fila.
  const minha=p.participanteId===contaId &&
   !['PRAZO_ENCERRADO','DESISTENTE'].includes(p.statusAdesao) && p.empresa!==true;
  return {posicaoId:p.id,cor,minha};
 }
 return {
  filaA:sim.filas.filaA.map(marcar),
  filaB:sim.filas.filaB.map(marcar),
  tabuleiro:{centro:marcar(sim.tabuleiro.centro),vagas:sim.tabuleiro.vagas.map(marcar)}
 };
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
  const simulador=this.ponte._restaurar();
  const posicoes=posicoesTitular(simulador,contaId);
  const mapaCores=mapaCoresDoEscritorio(simulador,contaId);
  // Apenas indicados DIRETOS do titular da sessao, nao a rede alheia.
  const temTabelaAtivacao=!!this.banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_loop_adesoes_posicoes_demo'"
  ).get();
  const posicaoAtivadaSQL=temTabelaAtivacao?
   'EXISTS(SELECT 1 FROM admin_loop_adesoes_posicoes_demo a WHERE a.conta_id=c.id)':'0';
  const equipe=this.banco.prepare(`
   SELECT c.id AS convidadoId,c.nome,
    tel.telefone_normalizado AS telefone,
    v.confirmado_em AS compraConfirmadaEm,
    m.posicao_indicador_id AS posicaoAtribuidaId,
    ${posicaoAtivadaSQL} AS posicaoAtivada
   FROM admin_contas_participantes_demo c
   LEFT JOIN admin_contas_telefones_demo tel ON tel.conta_id=c.id
   LEFT JOIN admin_ponte_convites_validados_demo v
    ON v.convidado_id=c.id AND v.indicador_id=?
   LEFT JOIN admin_loop_vinculos_indicacao_posicao_demo m
    ON m.convidado_id=c.id AND m.indicador_id=?
   WHERE c.indicado_por_id=?
   ORDER BY c.criado_em,c.id
  `).all(contaId,contaId,contaId).map(c=>{
   const pos=[...simulador.filas.filaA,...simulador.filas.filaB,
    simulador.tabuleiro.centro,...simulador.tabuleiro.vagas]
    .find(p=>p&&p.participanteId===c.convidadoId&&p.empresa!==true);
   return {convidadoId:c.convidadoId,nome:c.nome,telefone:c.telefone,
    estado:c.compraConfirmadaEm&&c.posicaoAtivada?'ATIVO':'PENDENTE',
    filaAtual:pos?pos.fila:null,posicaoAtribuidaId:c.posicaoAtribuidaId,
    atribuicaoPendente:!!c.compraConfirmadaEm&&!!c.posicaoAtivada&&
     c.posicaoAtribuidaId===null};
  });
  const encerradas=[simulador.tabuleiro.centro,...simulador.tabuleiro.vagas]
   .filter(p=>p&&p.participanteId===contaId&&p.statusAdesao==='PRAZO_ENCERRADO').length;
  const desistidas=[simulador.tabuleiro.centro,...simulador.tabuleiro.vagas]
   .filter(p=>p&&p.participanteId===contaId&&p.statusAdesao==='DESISTENTE').length;
  const idsAtivos=new Set();
  for(const p of posicoes){
   if(!Number.isSafeInteger(p.posicaoId)||idsAtivos.has(p.posicaoId)){
    throw new Error('Integridade de posicoes ficticias invalida');
   }
   idsAtivos.add(p.posicaoId);
  }
  const comprasPorPosicao=new Map();
  for(const c of compras){
   c.posicaoIds=[c.posicaoId,...this.banco.prepare(`
    SELECT posicao_id AS id FROM admin_ponte_posicoes_adicionais_demo
    WHERE pedido_id=? ORDER BY ordem
   `).all(c.pedidoId).map(r=>r.id)];
   for(const id of c.posicaoIds){
    if(comprasPorPosicao.has(id))
     throw new Error('Posicao de teste associada a multiplos pedidos');
    comprasPorPosicao.set(id,c.pedidoId);
   }
  }
  // Ponte ainda nao cria giros nem historico de posicoes concluídas:
  // o ledger de compras deve corresponder exatamente a posicoes ativas.
  if(posicoes.length+encerradas+desistidas>comprasPorPosicao.size||
    posicoes.some(p=>!comprasPorPosicao.has(p.posicaoId))){
   throw new Error('Integridade entre compras e posicoes do titular divergente');
  }
  if(posicoes.length>LIMITE_ATIVAS)throw new Error('Limite de posicoes do titular excedido');
  const confirmadas=indicacoes.filter(c=>c.confirmadoId!==null).length;
  const aplicadas=indicacoes.filter(c=>c.aplicadoId!==null).length;
  if(aplicadas>confirmadas)throw new Error('Historico de indicacoes inconsistente');
  const bonus=this.ponte.linksComissoes.comissoesDaConta(contaId);
  const minima=this.ponte.configuracaoValor.atual().valorCentavos;
  const temCadeira=posicoes.length>0;
  const habilitado=bonus.bonificacoesHabilitadas;
  const bonusIndicacoes={
   ...bonus,
   ativoNoLoopAgora:temCadeira,
   porcentagemCampanhaHoje:bonus.porcentagemAtual.percentual,
   porcentagemAplicavelHoje:habilitado?(temCadeira?bonus.porcentagemAtual.percentual:10):0,
   valorMinimoPosicaoHojeCentavos:minima,
   criterioExtra:'POSICAO_PROPRIA_EM_FILA_OU_TABULEIRO',
   ativacaoLinkNaoEquivaleAPosicao:true,
   necessitaAceiteCPFParaComissoesESaques:true
  };
  return {
   modo:'ESCRITORIO_INDIVIDUAL_EXCLUSIVAMENTE_FICTICIO',
   conta:{nome:conta.nome,login:conta.login},
   linkIndicacao:this.ponte.linksComissoes.linkDaConta(contaId),
   bonusIndicacoes,
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
   // A posicao conserva a referencia do instante da compra,
   // mesmo apos mudanca da configuracao global de valor.
   posicoes:posicoes.map(p=>{
    const pedidoId=comprasPorPosicao.get(p.posicaoId);
    if(!pedidoId)throw new Error('Posicao sem pedido associado');
    const referencia=this.banco.prepare(`
     SELECT v.revisao_valor AS revisaoValor,
      v.valor_referencia_centavos AS valorReferenciaCentavos
     FROM admin_ponte_posicoes_valores_demo v
     JOIN admin_ponte_compras_demo c ON c.pedido_id=v.pedido_id
     WHERE c.pedido_id=? AND c.conta_id=?
      AND (c.posicao_id=? OR EXISTS(
       SELECT 1 FROM admin_ponte_posicoes_adicionais_demo x
       WHERE x.pedido_id=c.pedido_id AND x.posicao_id=?
      ))
    `).get(pedidoId,contaId,p.posicaoId,p.posicaoId);
    if(!referencia)throw new Error('Referencia da posicao de teste ausente');
    const vinculos=this.banco.prepare(`
     SELECT COUNT(*) AS total FROM admin_loop_vinculos_indicacao_posicao_demo
     WHERE indicador_id=? AND posicao_indicador_id=?
    `).get(contaId,p.posicaoId).total;
    return {...p,...referencia,indicacoesRecebidas:vinculos};
   }).sort((a,b)=>a.posicaoId-b.posicaoId),
   mapaCores,equipe,
   // Contagem da fila A vem dos convites VALIDADOS pelo motor; sem dados
   // pessoais de terceiros. O indice segue rigorosamente a ordem da fila A.
   convitesValidosFilaA:simulador.filas.filaA.map(p=>
    p.indicacoesVinculadas ??
     simulador.filas.informacoesParticipante(p.participanteId).quantidade),
   // Eventos simulados do CENTRO ATUAL; nao comprovam credito financeiro.
   progressoCiclo:{eventosValidos:simulador.tabuleiro.vendasDoCiclo.length,
    totalEventos:6,modo:'LABORATORIO_SEM_PAGAMENTOS'},
   girosUltimas24Horas:simulador.tabuleiro.ciclosConcluidos.filter(c=>{
    const ms=Date.parse(c.concluidoEm),agora=Date.now();
    return Number.isFinite(ms)&&ms<=agora&&ms>agora-86400000;
   }).length,
   posicoesComPrazoEncerrado:encerradas,
   posicoesDesistidasAssumidasPeloLoop:desistidas,
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
module.exports={EscritorioIndividualDemo,posicoesTitular,mapaCoresDoEscritorio};
