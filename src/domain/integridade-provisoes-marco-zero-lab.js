'use strict';
// Coerencia entre livros de previsoes. Nao e conciliacao bancaria e nao liquida valores.
const {cofreDoEvento}=require('./destino-financeiro-centro-loop');
const FONTES=Object.freeze([
 'loop_v6_provisoes_ciclos','loop_v6_provisoes_eventos','loop_v6_provisoes_parcelas'
]);
function consultarIntegridadeProvisoesLab({banco}={}){
 if(typeof banco?.prepare!=='function')throw new TypeError('SQLite de laboratorio obrigatorio');
 const existentes=new Set(banco.prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all().map(x=>x.name));
 const fontesAusentes=FONTES.filter(nome=>!existentes.has(nome));
 if(fontesAusentes.length)return {estado:'FONTE_AUSENTE',fontesAusentes,
  contagens:null,alertasPorCriterio:null,somenteLeitura:true,conciliacaoBancaria:false};
 // Uma unica instrucao usa o mesmo snapshot mesmo com escritores em outro processo.
 // Agregar antes do JOIN evita multiplicar seis eventos por tres parcelas.
 const destinos=Array.from({length:6},(_,i)=>[i+1,
  cofreDoEvento({posicaoCentro:{empresa:false},ordem:i+1}),
  cofreDoEvento({posicaoCentro:{empresa:true},ordem:i+1})]);
 const contagens=banco.prepare(`WITH destinos(ordem,participante,empresa) AS (
  VALUES ${destinos.map(()=>'(?,?,?)').join(',')}
 ), eventos AS (
  SELECT e.giro,COUNT(*) n,COUNT(DISTINCT e.ordem) ordens,SUM(e.referencia_centavos) total,
   SUM(CASE WHEN typeof(e.referencia_centavos)<>'integer' OR e.referencia_centavos<=0
    OR e.ordem NOT BETWEEN 1 AND 6
    OR e.destino_cofre IS NOT CASE WHEN c.conta_id IS NULL
     THEN d.empresa ELSE d.participante END
    THEN 1 ELSE 0 END) invalidos
  FROM loop_v6_provisoes_eventos e
  LEFT JOIN loop_v6_provisoes_ciclos c ON c.giro=e.giro
  LEFT JOIN destinos d ON d.ordem=e.ordem GROUP BY e.giro
 ), parcelas AS (
  SELECT p.giro,COUNT(*) n,COUNT(DISTINCT p.ordem) ordens,SUM(p.previsto_centavos) total,
   SUM(CASE WHEN p.conta_id IS NOT c.conta_id
    OR p.posicao_centro IS NOT c.posicao_centro
    OR p.previsto_centavos IS NOT c.referencia_centro
    OR typeof(p.previsto_centavos)<>'integer' OR p.previsto_centavos<=0
    OR p.ordem NOT IN (1,3,5) OR p.situacao IS NOT 'PREVISTO_NAO_LIQUIDADO'
    THEN 1 ELSE 0 END) invalidas
  FROM loop_v6_provisoes_parcelas p
  LEFT JOIN loop_v6_provisoes_ciclos c ON c.giro=p.giro GROUP BY p.giro
 ), verificacoes AS (
  SELECT c.giro,
   CASE WHEN typeof(c.posicao_centro)<>'integer' OR c.posicao_centro<=0
    OR typeof(c.referencia_centro)<>'integer' OR typeof(c.previsto_centro)<>'integer'
    OR typeof(c.referencia_eventos)<>'integer' OR c.referencia_eventos<=0
    OR (c.conta_id IS NULL AND (c.cofre_centro IS NOT 'LOOP_DOURADAS'
     OR c.referencia_centro<>0 OR c.previsto_centro<>0))
    OR (c.conta_id IS NOT NULL AND (length(trim(c.conta_id))=0
     OR c.cofre_centro IS NOT 'LOOP_CENTRO' OR c.referencia_centro<=0
     OR c.previsto_centro<>3*c.referencia_centro)) THEN 1 ELSE 0 END cabecalho,
   CASE WHEN COALESCE(e.n,0)<>6 OR e.ordens<>6 OR e.total IS NOT c.referencia_eventos
    OR COALESCE(e.invalidos,0)>0 THEN 1 ELSE 0 END eventos,
   CASE WHEN COALESCE(p.n,0)<>CASE WHEN c.conta_id IS NULL THEN 0 ELSE 3 END
    OR COALESCE(p.ordens,0)<>CASE WHEN c.conta_id IS NULL THEN 0 ELSE 3 END
    OR COALESCE(p.total,0)<>c.previsto_centro
    OR COALESCE(p.invalidas,0)>0 THEN 1 ELSE 0 END parcelas
  FROM loop_v6_provisoes_ciclos c
  LEFT JOIN eventos e ON e.giro=c.giro LEFT JOIN parcelas p ON p.giro=c.giro
 ) SELECT COUNT(*) ciclos,
  COALESCE(SUM(cabecalho),0) ciclosCabecalhoInconsistente,
  COALESCE(SUM(eventos),0) ciclosEventosInconsistentes,
  COALESCE(SUM(parcelas),0) ciclosParcelasInconsistentes,
  COALESCE(SUM(CASE WHEN cabecalho+eventos+parcelas>0 THEN 1 ELSE 0 END),0)
   ciclosInconsistentes,
  (SELECT COUNT(*) FROM loop_v6_provisoes_eventos e WHERE NOT EXISTS
   (SELECT 1 FROM loop_v6_provisoes_ciclos c WHERE c.giro=e.giro)) eventosOrfaos,
  (SELECT COUNT(*) FROM loop_v6_provisoes_parcelas p WHERE NOT EXISTS
   (SELECT 1 FROM loop_v6_provisoes_ciclos c WHERE c.giro=p.giro)) parcelasOrfas
 FROM verificacoes`).get(...destinos.flat());
 const alertasPorCriterio=contagens.ciclosCabecalhoInconsistente+
  contagens.ciclosEventosInconsistentes+contagens.ciclosParcelasInconsistentes+
  contagens.eventosOrfaos+contagens.parcelasOrfas;
 return {estado:alertasPorCriterio>0?'ALERTA':contagens.ciclos===0?'SEM_OPERACOES':
  'SEM_ALERTAS_LOCAIS',fontesAusentes,contagens,alertasPorCriterio,
  somenteLeitura:true,conciliacaoBancaria:false};
}
module.exports={consultarIntegridadeProvisoesLab};
