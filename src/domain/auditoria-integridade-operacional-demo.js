'use strict';

// Inspecao cruzada read-only. O motor e o livro de compras precisam concordar.
// Nenhum saldo, pagamento ou CPF e usado; diagnostico exclusivo de laboratorio.
function auditarIntegridadeOperacionalDemo(ponte){
 const sim=ponte._restaurar(); // A restauracao valida ciclo e destinos de cofres.
 const db=ponte.banco,alertas=[],origens=new Map(),posicoes=new Map();
 let totalAlertas=0;
 const alertar=(codigo,posicaoId=null)=>{
  totalAlertas+=1;
  if(alertas.length<100)alertas.push({codigo,...(posicaoId===null?{}:{posicaoId})});
 };
 const registrar=(id,tipo,contaId=null)=>{
  if(!Number.isSafeInteger(id)||id<1)throw new Error('ID de posicao invalido no ledger');
  if(origens.has(id))alertar('POSICAO_COM_ORIGENS_DUPLICADAS',id);
  else origens.set(id,{tipo,contaId});
 };
 const compras=db.prepare(
  'SELECT pedido_id AS pedidoId,conta_id AS contaId,posicao_id AS posicaoId FROM admin_ponte_compras_demo'
 ).all();
 const adicionais=db.prepare(
  'SELECT pedido_id AS pedidoId,posicao_id AS posicaoId,ordem FROM admin_ponte_posicoes_adicionais_demo'
 ).all();
 const manuais=db.prepare('SELECT posicao_id AS posicaoId FROM admin_ponte_douradas_manuais_demo').all();
 const financiadas=db.prepare(`
  SELECT posicao_id AS posicaoId,valor_referencia_centavos AS valorCentavos,
   revisao_valor AS revisaoValor,cofre_origem AS cofreOrigem
  FROM admin_ponte_douradas_financiadas_demo
 `).all();
 const desistencias=db.prepare(
  'SELECT posicao_id AS posicaoId,conta_id AS contaId FROM admin_loop_desistencias_vaga6_demo'
 ).all();
 const temTabela=nome=>!!db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
 ).get(nome);
 const aceites=temTabela('admin_loop_adesoes_posicoes_demo')?
  db.prepare('SELECT posicao_id AS posicaoId,conta_id AS contaId FROM admin_loop_adesoes_posicoes_demo').all():[];
 const contaPorPedido=new Map(compras.map(c=>[c.pedidoId,c.contaId]));
 const indiceEsperado=new Map();
 for(const c of compras){
  registrar(c.posicaoId,'COMPRA',c.contaId);
  indiceEsperado.set(c.posicaoId,'compra-demo-'+c.pedidoId);
 }
 for(const p of adicionais){
  registrar(p.posicaoId,'COMPRA',contaPorPedido.get(p.pedidoId));
  if(!contaPorPedido.has(p.pedidoId))alertar('PACOTE_SEM_PEDIDO',p.posicaoId);
  indiceEsperado.set(p.posicaoId,'compra-demo-'+p.pedidoId+'-'+p.ordem);
 }
 for(const d of manuais)registrar(d.posicaoId,'DOURADA_MANUAL');
 for(const d of financiadas)registrar(d.posicaoId,'DOURADA_FINANCIADA');
 const inserir=(p,local)=>{
  if(!p)return;
  if(posicoes.has(p.id)){alertar('POSICAO_DUPLICADA_NO_ESTADO',p.id);return;}
  posicoes.set(p.id,{p,local});
 };
 for(const p of sim.filas.filaA)inserir(p,'FILA_A');
 for(const p of sim.filas.filaB)inserir(p,'FILA_B');
 inserir(sim.tabuleiro.centro,'CENTRO');
 for(const p of sim.tabuleiro.vagas)inserir(p,'TABULEIRO');
 for(const ciclo of sim.tabuleiro.ciclosConcluidos)inserir(ciclo.centro,'CONCLUIDA');
 for(const [id,{p,local}] of posicoes){
  const origem=origens.get(id);
  if(!origem){alertar('POSICAO_SEM_ORIGEM_REGISTRADA',id);continue;}
  if(origem.tipo==='DOURADA_MANUAL'){
   if(p.participanteId!=='LOOP_EMPRESA'||p.empresa!==true||
     p.titularOperacional!=='LOOP_EMPRESA'||p.statusAdesao!=='POSICAO_LOOP'||
     p.origemOperacional!=='ADMIN_MANUAL_SEM_COMPRA'||p.geradaSemCompra!==true)
    alertar('DOURADA_MANUAL_ALTERADA',id);
   if(local==='FILA_A')alertar('DOURADA_MANUAL_PROMOVIDA_INDEVIDAMENTE',id);
  }else if(origem.tipo==='DOURADA_FINANCIADA'){
   const lancamento=financiadas.find(v=>v.posicaoId===id);
   if(p.participanteId!=='LOOP_EMPRESA'||p.empresa!==true||
     p.titularOperacional!=='LOOP_EMPRESA'||p.statusAdesao!=='POSICAO_LOOP'||
     p.origemOperacional!=='ADMIN_MANUAL_COM_APORTE_RESERVA_DEMO'||
     p.geradaSemCompra!==false||
     p.aporteInternoCentavos!==lancamento.valorCentavos||
     p.revisaoValorPosicao!==lancamento.revisaoValor||
     lancamento.cofreOrigem!=='LOOP_DIREITA')
    alertar('DOURADA_FINANCIADA_DIVERGENTE',id);
   if(local==='FILA_A')alertar('DOURADA_MANUAL_PROMOVIDA_INDEVIDAMENTE',id);
  }else{
   if(p.participanteId!==origem.contaId||p.geradaSemCompra===true)
    alertar('TITULARIDADE_DA_COMPRA_DIVERGENTE',id);
   if(local.startsWith('FILA_')&&
      (p.empresa===true||['PRAZO_ENCERRADO','DESISTENTE'].includes(p.statusAdesao)))
    alertar('COMPRA_ASSUMIDA_ANTES_DA_VAGA_6',id);
   if(['CENTRO','TABULEIRO'].includes(local)&&p.statusAdesao==='PENDENTE')
    alertar('AZUL_ENTROU_NO_TABULEIRO',id);
  }
 }
 for(const [id] of origens)if(!posicoes.has(id))
  alertar('POSICAO_REGISTRADA_AUSENTE_DO_MOTOR',id);
 for(const [id,vendaId] of indiceEsperado){
  const v=sim.filas.vendasRegistradas.get(vendaId);
  if(!v||v.id!==id)alertar('COMPRA_DIVERGENTE_DO_INDICE_DO_MOTOR',id);
 }
 for(const [vendaId,pos] of sim.filas.vendasRegistradas){
  if(!origens.has(pos.id)||origens.get(pos.id).tipo!=='COMPRA'||
   indiceEsperado.get(pos.id)!==vendaId)
   alertar('VENDA_DE_POSICAO_SEM_COMPRA',pos.id);
 }
 for(const d of desistencias){
  const origem=origens.get(d.posicaoId),p=posicoes.get(d.posicaoId)?.p;
  if(!origem||origem.tipo!=='COMPRA'||origem.contaId!==d.contaId||
   !p||p.statusAdesao!=='DESISTENTE'||
   p.titularOperacional!=='LOOP_EMPRESA'||p.empresa!==true)
   alertar('DESISTENCIA_DIVERGENTE',d.posicaoId);
 }
 for(const a of aceites){
  const origem=origens.get(a.posicaoId),p=posicoes.get(a.posicaoId)?.p;
  if(!origem||origem.tipo!=='COMPRA'||origem.contaId!==a.contaId||
   !p||!['ATIVA','DESISTENTE'].includes(p.statusAdesao))
   alertar('ADESAO_DIVERGENTE',a.posicaoId);
 }
 if(sim.filas.indicacoes.has('LOOP_EMPRESA'))
  alertar('INDICACAO_INDEVIDA_DA_EMPRESA');
 return {
  modo:'AUDITORIA_INTEGRIDADE_SOMENTE_LABORATORIO',
  integridade:totalAlertas?'DIVERGENCIAS_ENCONTRADAS':'SEM_DIVERGENCIAS_DETECTADAS',
  totalAlertas,alertas,alertasTruncados:totalAlertas>alertas.length,
  indicadores:{
   comprasQualificadas:compras.length,posicoesAdicionais:adicionais.length,
   douradasManuais:manuais.length+financiadas.length,
   douradasManuaisFinanciadas:financiadas.length,
   compromissosDouradasCentavos:financiadas.reduce((acc,v)=>acc+v.valorCentavos,0),
   desistenciasExpressas:desistencias.length,
   posicoesAtivadasRegistradas:aceites.length,
   posicoesComOrigemContabil:origens.size,posicoesIdentificadasNoMotor:posicoes.size,
   ciclosConcluidos:sim.tabuleiro.ciclosConcluidos.length,
   eventosNoCicloAtual:sim.tabuleiro.vendasDoCiclo.length
  },
  semMovimentacao:true,saldosBancariosVerificados:false,
  comprovantesReaisVerificados:false,
  auditoriaContabilIndependente:false,nenhumDadoPessoalExposto:true
 };
}
module.exports={auditarIntegridadeOperacionalDemo};
