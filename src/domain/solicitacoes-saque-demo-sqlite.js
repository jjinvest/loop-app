'use strict';

// Livro de SOLICITACOES SIMULADAS. Nao emite PIX, nao retira saldo bancario,
// nao transforma a provisao de bonificacoes em dinheiro disponivel.
// Nenhum CPF real ou informacao bancaria entra neste livro.
const {simularElegibilidadeSaque}=require('./indicacoes-links-comissoes-demo-sqlite');
const ID=/^saque-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MINIMO_SAQUE_CENTAVOS=2500;
const TAXA_SAQUE_PERCENTUAL=0;
const PRAZO_SAQUE_CALENDARIO_MS=24*60*60*1000;
function prazoDaSolicitacao(registradoEm,agora){
  const momento=Date.parse(registradoEm),atual=Date.parse(agora);
  if(!Number.isFinite(momento)||!Number.isFinite(atual))
    throw new Error('Relogio de saque invalido');
  return {prazoMaximoAnaliseEm:new Date(momento+PRAZO_SAQUE_CALENDARIO_MS).toISOString(),
    prazoHorasCorridas:24,consideraSabadosDomingosFeriados:true,
    prazoUltrapassadoNoTeste:atual>momento+PRAZO_SAQUE_CALENDARIO_MS,
    permiteLiberacaoAntecipadaSomenteAposConciliacao:true,
    liberacaoRealHabilitada:false};
}

function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
const SELECAO=`
 SELECT solicitacao_id AS solicitacaoId,conta_id AS contaId,
  tipo,valor_bruto_centavos AS valorSolicitadoCentavos,
  taxa_percentual AS taxaPercentual,taxa_centavos AS taxaSaqueCentavos,
  valor_liquido_centavos AS valorLiquidoCentavos,
  cofre_origem AS origemExclusiva,registrado_em AS registradoEm
 FROM admin_solicitacoes_saque_demo`;
class SolicitacoesSaqueDemoSQLite{
 constructor({banco,contas,links,relogio=()=>new Date().toISOString()}={}){
  if(!banco||contas?.banco!==banco||links?.banco!==banco||
   typeof links.comissoesDaConta!=='function')
   throw new TypeError('Contas, bonificacoes e SQLite compartilhados obrigatorios');
  this.banco=banco;this.contas=contas;this.links=links;this.relogio=relogio;
  // Registros legados de 3% permanecem intactos e legiveis no histórico.
  // A antiga CHECK(taxa_percentual=3) exige uma migração transacional.
  const campos=` 
     solicitacao_id TEXT PRIMARY KEY NOT NULL,
     conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
     tipo TEXT NOT NULL CHECK(tipo IN ('BONUS','PARTICIPACAO_LUCRO')),
     valor_bruto_centavos INTEGER NOT NULL CHECK(valor_bruto_centavos>=2500),
     taxa_percentual INTEGER NOT NULL CHECK(taxa_percentual IN (0,3)),
     taxa_centavos INTEGER NOT NULL CHECK(taxa_centavos>=0),
     valor_liquido_centavos INTEGER NOT NULL CHECK(valor_liquido_centavos>0),
     cofre_origem TEXT NOT NULL CHECK(cofre_origem IN ('LOOP_DIREITA','LOOP_CENTRO')),
     registrado_em TEXT NOT NULL,
     CHECK(valor_bruto_centavos=taxa_centavos+valor_liquido_centavos),
     CHECK(taxa_percentual<>0 OR taxa_centavos=0),
     CHECK((tipo='BONUS' AND cofre_origem='LOOP_DIREITA') OR
           (tipo='PARTICIPACAO_LUCRO' AND cofre_origem='LOOP_CENTRO'))`;
  const tabela='admin_solicitacoes_saque_demo';
  const colunas='solicitacao_id,conta_id,tipo,valor_bruto_centavos,'+
   'taxa_percentual,taxa_centavos,valor_liquido_centavos,cofre_origem,registrado_em';
  const esquema=()=>banco.prepare(
   "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tabela)?.sql;
  const legado=sql=>typeof sql==='string'&&/CHECK\s*\(\s*taxa_percentual\s*=\s*3\s*\)/i.test(sql);
  if(legado(esquema())){
   banco.exec('BEGIN IMMEDIATE');
   try{
    // Revalidar sob lock: dois processos podem inicializar simultaneamente.
    if(legado(esquema())){
     const nova='admin_solicitacoes_saque_demo_migrando_taxa_zero';
     banco.exec('CREATE TABLE '+nova+'('+campos+')');
     banco.exec('INSERT INTO '+nova+'('+colunas+') SELECT '+colunas+' FROM '+tabela);
     const antes=banco.prepare('SELECT COUNT(*) AS n FROM '+tabela).get().n;
     const depois=banco.prepare('SELECT COUNT(*) AS n FROM '+nova).get().n;
     if(antes!==depois)throw new Error('Migracao de saques perdeu registros');
     banco.exec('DROP TABLE '+tabela);
     banco.exec('ALTER TABLE '+nova+' RENAME TO '+tabela);
    }
    banco.exec('COMMIT');
   }catch(e){banco.exec('ROLLBACK');throw e;}
  }
  banco.exec('CREATE TABLE IF NOT EXISTS '+tabela+'('+campos+')');
  banco.exec(`
   CREATE INDEX IF NOT EXISTS idx_solicitacoes_saque_demo_conta
    ON admin_solicitacoes_saque_demo(conta_id,registrado_em);
   CREATE TRIGGER IF NOT EXISTS admin_solicitacoes_saque_demo_no_update
    BEFORE UPDATE ON admin_solicitacoes_saque_demo
    BEGIN SELECT RAISE(ABORT,'solicitacao de teste imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_solicitacoes_saque_demo_no_delete
    BEFORE DELETE ON admin_solicitacoes_saque_demo
    BEGIN SELECT RAISE(ABORT,'solicitacao de teste imutavel'); END;`);
  `);
 }
 consultar(contaId){
  if(!this.contas.buscar(contaId))throw erro('CONTA_INVALIDA');
  const extrato=this.links.comissoesDaConta(contaId);
  const registros=this.banco.prepare(SELECAO+
   ' WHERE conta_id=? ORDER BY registrado_em,solicitacao_id').all(contaId);
  const reservado=registros.filter(r=>r.tipo==='BONUS')
   .reduce((v,r)=>v+r.valorSolicitadoCentavos,0);
  const bruto=extrato.totalSimuladoCentavos;
  if(!Number.isSafeInteger(reservado)||!Number.isSafeInteger(bruto)||
   reservado>bruto)throw new Error('Conciliacao de pedidos ficticios divergiu do bonus');
  const disponivel=bruto-reservado;
  return {
   modo:'SOLICITACOES_SAQUE_SOMENTE_SIMULACAO',
   minSaqueCentavos:MINIMO_SAQUE_CENTAVOS,taxaPercentual:TAXA_SAQUE_PERCENTUAL,
   bonusBrutoHistoricoCentavos:bruto,
   bonusSolicitadoSimuladoCentavos:reservado,
   bonusDisponivelSimuladoCentavos:disponivel,
   podeSolicitarBonus:extrato.bonificacoesHabilitadas&&disponivel>=MINIMO_SAQUE_CENTAVOS,
   cpfTermosConfirmados:extrato.cpfTermosConfirmados,
   participacaoLucroSaldoConhecido:false,
   podeSolicitarParticipacaoLucro:false,
   motivoBloqueioParticipacaoLucro:'SEM_LIVRO_DE_PARTICIPACAO_LUCRO',
   solicitacoesReaisHabilitadas:false,
   pagamentosReais:false,transferenciasExecutadas:false,
   politicaPrazoSaque:{horasCorridas:24,diasCorridos:true,
    anteciparSeValidado:true,transferenciaRealAindaNaoImplementada:true},
   historico:registros.map(({contaId:_contaId,...r})=>({
    ...r,...prazoDaSolicitacao(r.registradoEm,this.relogio()),
    status:'REGISTRADA_APENAS_SIMULACAO',transferenciaExecutada:false
   }))
  };
 }
 registrar({contaId,solicitacaoId,tipo,valorSolicitadoCentavos}={}){
  if(!ID.test(solicitacaoId))throw erro('SOLICITACAO_ID_INVALIDO');
  if(!['BONUS','PARTICIPACAO_LUCRO'].includes(tipo))throw erro('TIPO_SAQUE_INVALIDO');
  if(!Number.isSafeInteger(valorSolicitadoCentavos)||valorSolicitadoCentavos<=0)
   throw erro('SAQUE_INVALIDO');
  if(!this.contas.buscar(contaId))throw erro('CONTA_INVALIDA');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare(SELECAO+' WHERE solicitacao_id=?').get(solicitacaoId);
   if(anterior){
    if(anterior.contaId!==contaId||anterior.tipo!==tipo||
     anterior.valorSolicitadoCentavos!==valorSolicitadoCentavos)
     throw erro('CONFLITO_IDEMPOTENCIA');
    this.banco.exec('COMMIT');
    const {contaId:_id,...seguro}=anterior;
    return {...seguro,...prazoDaSolicitacao(anterior.registradoEm,this.relogio()),
     repetida:true,transferenciaExecutada:false,
     status:'REGISTRADA_APENAS_SIMULACAO'};
   }
   if(tipo==='PARTICIPACAO_LUCRO')
    throw erro('SALDO_PARTICIPACAO_INDISPONIVEL');
   // Nunca usar saldo alegado pelo browser, nem tratar provisao como saldo bancario.
   const resumo=this.consultar(contaId);
   const calculo=simularElegibilidadeSaque({
    saldoSimuladoCentavos:resumo.bonusDisponivelSimuladoCentavos,
    valorSolicitadoCentavos,cpfTermosConfirmados:
     resumo.cpfTermosConfirmados&&this.links.habilitadoBonificacoes(contaId),
    tipo
   });
   const registradoEm=this.relogio();
   if(typeof registradoEm!=='string'||Number.isNaN(Date.parse(registradoEm)))
    throw new Error('Relogio de teste invalido');
   this.banco.prepare(`INSERT INTO admin_solicitacoes_saque_demo(
    solicitacao_id,conta_id,tipo,valor_bruto_centavos,taxa_percentual,
    taxa_centavos,valor_liquido_centavos,cofre_origem,registrado_em)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
     solicitacaoId,contaId,tipo,valorSolicitadoCentavos,
     calculo.taxaPercentual,calculo.taxaSaqueCentavos,
     calculo.valorLiquidoCentavos,calculo.origemExclusiva,registradoEm);
   this.banco.exec('COMMIT');
   return {solicitacaoId,tipo,valorSolicitadoCentavos,
    taxaPercentual:calculo.taxaPercentual,
    taxaSaqueCentavos:calculo.taxaSaqueCentavos,
    valorLiquidoCentavos:calculo.valorLiquidoCentavos,
    origemExclusiva:calculo.origemExclusiva,registradoEm,
    ...prazoDaSolicitacao(registradoEm,this.relogio()),
    repetida:false,status:'REGISTRADA_APENAS_SIMULACAO',
    transferenciaExecutada:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={SolicitacoesSaqueDemoSQLite,MINIMO_SAQUE_CENTAVOS,TAXA_SAQUE_PERCENTUAL,
 PRAZO_SAQUE_CALENDARIO_MS,prazoDaSolicitacao};
