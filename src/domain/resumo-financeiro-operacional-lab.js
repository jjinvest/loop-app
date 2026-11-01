'use strict';
// Projecao operacional consolidada do laboratorio. Fontes separadas.
// NUNCA cria saldo sacavel, PIX, movimento contabil ou conciliacao bancaria.
const COFRES=Object.freeze(['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS']);
const FONTES=Object.freeze([
 'loop_v6_provisoes_ciclos','loop_v6_provisoes_eventos','loop_v6_provisoes_parcelas',
 'admin_solicitacoes_saque_demo','loop_v6_saques_centro_teste',
 'loop_v6_eventos_saques_centro_teste','loop_v6_gestao_cofres_solicitacoes_demo',
 'loop_v6_pre_receitas','loop_v6_pre_saidas'
]);
function consultarResumoFinanceiroOperacionalLab({banco}={}){
 if(typeof banco?.prepare!=='function')throw new TypeError('SQLite de laboratorio obrigatorio');
 const existentes=new Set(banco.prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all().map(x=>x.name));
 const tem=nome=>existentes.has(nome);
 const consultar=(tabela,sql)=>tem(tabela)?banco.prepare(sql).get():null;
 const ciclos=consultar('loop_v6_provisoes_ciclos',
  'SELECT COUNT(*) AS quantidade,COALESCE(SUM(previsto_centro),0) AS previstoCentavos FROM loop_v6_provisoes_ciclos');
 const eventos=consultar('loop_v6_provisoes_eventos',
  'SELECT COUNT(*) AS quantidade FROM loop_v6_provisoes_eventos');
 const parcelas=consultar('loop_v6_provisoes_parcelas',
  'SELECT COUNT(*) AS quantidade,COALESCE(SUM(previsto_centavos),0) AS previstoCentavos FROM loop_v6_provisoes_parcelas');
 const bonus=consultar('admin_solicitacoes_saque_demo',
  'SELECT COUNT(*) AS quantidade,COALESCE(SUM(valor_bruto_centavos),0) AS solicitadoBrutoCentavos,'+
  'COALESCE(SUM(valor_liquido_centavos),0) AS solicitadoLiquidoCentavos,'+
  'COUNT(CASE WHEN taxa_percentual=3 THEN 1 END) AS historicosTaxaTres'+
  ' FROM admin_solicitacoes_saque_demo');
 const centro=consultar('loop_v6_saques_centro_teste',
  'SELECT COUNT(*) AS quantidade,COALESCE(SUM(valor_centavos),0) AS solicitadoCentavos FROM loop_v6_saques_centro_teste');
 const falhasCentro=consultar('loop_v6_eventos_saques_centro_teste',
  "SELECT COUNT(DISTINCT solicitacao_id) AS quantidade FROM loop_v6_eventos_saques_centro_teste WHERE tipo='FALHA_BANCARIA_SIMULADA'");
 const gestao=consultar('loop_v6_gestao_cofres_solicitacoes_demo',
  "SELECT COUNT(*) AS quantidade,COALESCE(SUM(valor_centavos),0) AS solicitadoCentavos"+
  " FROM loop_v6_gestao_cofres_solicitacoes_demo WHERE status='PENDENTE_CONCILIACAO_REAL'");
 const receitas=consultar('loop_v6_pre_receitas',
  'SELECT COUNT(*) AS pedidosComReferencia,COALESCE(SUM(centro_centavos),0) AS centroCentavos,'+
  'COALESCE(SUM(esquerda_centavos),0) AS esquerdaCentavos,'+
  'COALESCE(SUM(direita_centavos),0) AS direitaCentavos FROM loop_v6_pre_receitas');
 const douradas=consultar('loop_v6_pre_saidas',
  "SELECT COUNT(*) AS quantidade,COALESCE(SUM(valor_centavos),0) AS previstoCentavos"+
  " FROM loop_v6_pre_saidas WHERE destino='LOOP_DOURADAS'");
 let destinosPrevistosPorCofre=null, destinosDesconhecidos=0;
 if(tem('loop_v6_provisoes_eventos')){
  destinosPrevistosPorCofre=Object.fromEntries(COFRES.map(nome=>[nome,0]));
  const destinos=banco.prepare('SELECT destino_cofre AS destino,COUNT(*) AS eventos,'+
   'COALESCE(SUM(referencia_centavos),0) AS centavos FROM loop_v6_provisoes_eventos'+
   ' GROUP BY destino_cofre').all();
  for(const linha of destinos){
   if(Object.hasOwn(destinosPrevistosPorCofre,linha.destino))
    destinosPrevistosPorCofre[linha.destino]=linha.centavos;
   else destinosDesconhecidos+=linha.eventos;
  }
 }
 return Object.freeze({
  modo:'FINANCEIRO_OPERACIONAL_SQLITE_SOMENTE_LEITURA',
  fontesAusentes:FONTES.filter(nome=>!tem(nome)),
  ciclos, eventos, parcelas, bonus, centro, falhasCentro, gestao, receitas,
  douradas,destinosPrevistosPorCofre,destinosDesconhecidos,
  alertasOperacionais:destinosDesconhecidos>0,
  livrosFinanceirosSeparados:true,provisoesNaoLiquidadas:true,
  bancoConciliado:false,pagamentosReais:false,saquesReais:false,
  saldosSacaveisReaisCentavos:0,movimentosExecutados:0,
  somenteLeitura:true
 });
}
module.exports={consultarResumoFinanceiroOperacionalLab};
