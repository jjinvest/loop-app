'use strict';
// Travas SQLite exclusivamente do candidato local.
// As três fases (rascunho, prepedido, cobrança Sandbox) precisam preservar
// o MESMO titular imutável e valor; nenhuma entrada "por nome/nick/email".
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class IntegridadeTitularCandidatoSQLite{
 constructor({banco}={}){
  if(process.env.NODE_ENV==='production')falha('TITULARIDADE_CANDIDATA_NAO_HOMOLOGADA');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw new TypeError('SQLite obrigatorio');
  this.banco=banco;
  const tables=[
   'akitemm_conta_unica_candidata',
   'akitemm_checkout_intencoes_preparacao',
   'akitemm_checkout_prepedidos_staging',
   'akitemm_prepedido_asaas_sandbox_staging'
  ];
  for(const table of tables){
   if(!banco.prepare([
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
   ].join(' ')).get(table))falha('TABELAS_CANDIDATO_NAO_PRONTAS');
  }
  // BEFORE INSERT não depende de PRAGMA foreign_keys: qualquer processo
  // que use o mesmo arquivo de dados encontra a barreira no próprio banco.
  banco.exec([
   'CREATE TRIGGER IF NOT EXISTS candidato_integridade_rascunho_insert',
   'BEFORE INSERT ON akitemm_checkout_intencoes_preparacao',
   'WHEN NOT EXISTS (SELECT 1 FROM akitemm_conta_unica_candidata c',
   'WHERE c.id=NEW.titular_id)',
   "BEGIN SELECT RAISE(ABORT,'TITULAR_CANDIDATO_INEXISTENTE'); END;",
   'CREATE TRIGGER IF NOT EXISTS candidato_integridade_prepedido_insert',
   'BEFORE INSERT ON akitemm_checkout_prepedidos_staging',
   'WHEN NOT EXISTS (',
   'SELECT 1 FROM akitemm_checkout_intencoes_preparacao i',
   'JOIN akitemm_conta_unica_candidata c ON c.id=i.titular_id',
   'WHERE i.pedido_id=NEW.rascunho_id',
   'AND i.titular_id=NEW.titular_id',
   'AND i.total_centavos=NEW.total_centavos)',
   "BEGIN SELECT RAISE(ABORT,'TITULAR_OU_VALOR_PREPEDIDO_DIVERGENTE'); END;",
   'CREATE TRIGGER IF NOT EXISTS candidato_integridade_cobranca_insert',
   'BEFORE INSERT ON akitemm_prepedido_asaas_sandbox_staging',
   'WHEN NOT EXISTS (',
   'SELECT 1 FROM akitemm_checkout_prepedidos_staging p',
   'JOIN akitemm_conta_unica_candidata c ON c.id=p.titular_id',
   'WHERE p.prepedido_id=NEW.prepedido_id',
   'AND p.titular_id=NEW.titular_id',
   'AND p.total_centavos=NEW.valor_centavos',
   "AND NEW.external_ref='LOOPLAB-' || NEW.prepedido_id)",
   "BEGIN SELECT RAISE(ABORT,'COBRANCA_TITULAR_OU_VALOR_DIVERGENTE'); END;",
   'CREATE TRIGGER IF NOT EXISTS candidato_integridade_cobranca_identidade_update',
   'BEFORE UPDATE OF prepedido_id,titular_id,cliente_asaas_id,',
   'valor_centavos,external_ref',
   'ON akitemm_prepedido_asaas_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'COBRANCA_IDENTIDADE_IMUTAVEL'); END;"
  ].join(' '));
  const check=this.auditar();
  if(check.totalInconsistencias!==0)
   falha('INTEGRIDADE_TITULAR_CANDIDATO_DIVERGENTE');
 }
 auditar(){
  if(process.env.NODE_ENV==='production')falha('TITULARIDADE_CANDIDATA_NAO_HOMOLOGADA');
  const q=this.banco.prepare.bind(this.banco);
  const draft=q([
   'SELECT COUNT(*) AS n FROM akitemm_checkout_intencoes_preparacao i',
   'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=i.titular_id',
   'WHERE c.id IS NULL'
  ].join(' ')).get().n;
  const prep=q([
   'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging p',
   'LEFT JOIN akitemm_checkout_intencoes_preparacao i',
   'ON i.pedido_id=p.rascunho_id',
   'LEFT JOIN akitemm_conta_unica_candidata c',
   'ON c.id=p.titular_id',
   'WHERE i.pedido_id IS NULL OR c.id IS NULL',
   'OR p.titular_id<>i.titular_id OR p.total_centavos<>i.total_centavos'
  ].join(' ')).get().n;
  const cobranca=q([
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging a',
   'LEFT JOIN akitemm_checkout_prepedidos_staging p',
   'ON p.prepedido_id=a.prepedido_id',
   'LEFT JOIN akitemm_conta_unica_candidata c',
   'ON c.id=a.titular_id',
   'WHERE p.prepedido_id IS NULL OR c.id IS NULL',
   'OR p.titular_id<>a.titular_id OR p.total_centavos<>a.valor_centavos',
   "OR a.external_ref<>'LOOPLAB-' || a.prepedido_id"
  ].join(' ')).get().n;
  return {rascunhosOrfaos:draft,prepedidosDivergentes:prep,
   cobrancasDivergentes:cobranca,
   totalInconsistencias:draft+prep+cobranca,
   transacoesFinanceirasReais:0,
   bancoCandidatoIntegro:draft+prep+cobranca===0};
 }
}
module.exports={IntegridadeTitularCandidatoSQLite};
