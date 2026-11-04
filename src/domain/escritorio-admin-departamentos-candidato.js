'use strict';
// Centro de trabalho do administrador - SOMENTE LEITURA + abertura de missão
// humana. Reconsulta PSP e alterações financeiras NÃO ocorrem aqui.
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const {auditarRelacoesPspCandidato}=require('./auditoria-relacional-psp-candidato-sqlite');
const DEPARTAMENTOS=Object.freeze([
 ['CLIENTES','Clientes','akitemm_conta_unica_candidata','Contas fictícias'],
 ['PEDIDOS','Pedidos','akitemm_checkout_prepedidos_staging','Pré-pedidos fictícios'],
 ['PRODUTOS','Produtos',null,'Catálogo ainda não unificado nesta base'],
 ['ENTREGAS','Entregas','akitemm_prepedido_entregas_sandbox_staging','Registros fictícios de entrega'],
 ['INDICACOES','Indicações',null,'Motor comercial não conectado'],
 ['POSICOES','Posições','akitemm_prepedido_posicoes_pendentes_sandbox_staging','Posições pendentes fictícias'],
 ['FILAS','Filas',null,'Motor comercial não conectado'],
 ['TABULEIRO','Tabuleiro',null,'Motor comercial não conectado'],
 ['COFRES','Cofres',null,'Contabilidade comercial não conectada'],
 ['SAQUES','Saques',null,'Saques reais proibidos'],
 ['SEGURANCA','Segurança',null,'Integridade estrutural do ensaio'],
 ['OUTROS','Outros',null,'Atendimento operacional']
]);
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function tabela(banco,nome){
 return !!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
}
class DepartamentosAdministradorCandidato{
 constructor({banco,missoes}={}){
  if(process.env.NODE_ENV==='production')erro('ADMIN_DEPARTAMENTOS_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||missoes?.db!==banco)
   erro('BANCO_UNICO_OBRIGATORIO');
  this.banco=banco;this.missoes=missoes;
 }
 painel(){
  const b=this.banco;
  const contagens=b.prepare([
   'SELECT departamento,COUNT(*) AS total,',
   "SUM(CASE WHEN situacao IN ('ABERTA','EM_ANDAMENTO') THEN 1 ELSE 0 END) AS pendentes",
   'FROM akitemm_admin_missoes_staging GROUP BY departamento'
  ].join(' ')).all();
  const mapa=new Map(contagens.map(x=>[x.departamento,x]));
  const estrutural=auditarRelacoesPspCandidato({banco:b});
  const departamentos=DEPARTAMENTOS.map(([codigo,nome,t,descricao])=>{
   const totalDados=t&&tabela(b,t)?
    b.prepare('SELECT COUNT(*) AS n FROM '+t).get().n:null;
   return {codigo,nome,descricao,quantidadeDadosLaboratorio:totalDados,
    missoes:mapa.get(codigo)?.total||0,
    missoesPendentes:mapa.get(codigo)?.pendentes||0,
    dadosComerciaisConectados:false,
    tipo:totalDados===null?'CONTROLE_MANUAL':'DADOS_LOCAIS_LABORATORIO'};
  });
  const seg=departamentos.find(x=>x.codigo==='SEGURANCA');
  seg.quantidadeDadosLaboratorio=estrutural.totalInconsistencias;
  seg.descricao='Inconsistências estruturais do laboratório';
  seg.tipo='AUDITORIA_LOCAL';
  return {departamentos,integridade:estrutural,
   laboratorio:true,administracaoFinanceiraRealHabilitada:false,
   tabuleiroRealConectado:false};
 }
 revisar({pagina=0,limite=25}={}){
  if(!Number.isSafeInteger(pagina)||pagina<0||pagina>10000||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   erro('PAGINACAO_INVALIDA');
  const b=this.banco,offset=pagina*limite;
  const total=b.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n;
  const ids=b.prepare([
   'SELECT prepedido_id AS id FROM akitemm_checkout_prepedidos_staging',
   'ORDER BY criado_em DESC,prepedido_id DESC LIMIT ? OFFSET ?'
  ].join(' ')).all(limite,offset);
  const alertas=[];
  for(const row of ids){
   const p=consultarPedido({banco:b,prepedidoId:row.id});
   if(!p)continue;
   const atraso=p.estadoOperacional==='WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA';
   if(p.exigeRevisaoManual||atraso)
    alertas.push({prepedidoId:p.prepedidoId,
     estadoOperacional:p.estadoOperacional,
     motivo:p.exigeRevisaoManual?'REVISAO_PSP_NECESSARIA':'RECONSULTA_PSP_PENDENTE',
     prioridade:p.exigeRevisaoManual?'CRITICA':'ALTA'});
  }
  return {alertas,pagina,limite,pedidosExaminados:ids.length,
   totalPedidos:total,haMais:offset+ids.length<total,
   amostraPaginada:true,financeiroReal:false};
 }
 abrirRevisao({prepedidoId}={}){
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   erro('PEDIDO_INVALIDO');
  const p=consultarPedido({banco:this.banco,prepedidoId});
  if(!p)erro('PEDIDO_INEXISTENTE');
  if(!p.exigeRevisaoManual&&
     p.estadoOperacional!=='WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA')
   erro('SEM_ALERTA_PSP');
  const critico=p.exigeRevisaoManual;
  return this.missoes.criar({
   departamento:'PEDIDOS',prioridade:critico?'CRITICA':'ALTA',
   titulo:'Revisar conciliação de pagamento Sandbox',
   descricao:'Revisar o pré-pedido de laboratório e conferir eventos e reconsulta independente ao PSP; nunca confirmar crédito ou pagamento sem prova externa.',
   prepedidoId,mensagemCliente:null
  },'alerta-psp-'+prepedidoId);
 }
}
module.exports={DepartamentosAdministradorCandidato,DEPARTAMENTOS};
