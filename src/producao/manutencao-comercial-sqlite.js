'use strict';
// Trava operacional cirúrgica: suspende NOVOS pedidos/cotações e edições
// comerciais, sem interromper login, consulta de pedidos já existentes,
// despachos de vendas previamente pagas ou leitura do catálogo.
// Estado persistente em SQLite, reversível, auditado na MESMA transação.
// Nunca cria, cancela ou modifica pagamentos/posições no LOOP.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const MOTIVOS=new Set(['CORRECAO_TECNICA','VALIDACAO_CATALOGO',
 'INCIDENTE_OPERACIONAL','RETOMADA_OPERACAO']);
class ManutencaoComercialSQLite{
 constructor({banco,auditoria,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !auditoria||auditoria.db!==banco||
     typeof auditoria.registrar!=='function'||
     typeof auditoria.verificar!=='function'||
     typeof agora!=='function')
   falha('MANUTENCAO_SEM_AUDITORIA_CONFIGURADA');
  this.db=banco;this.auditoria=auditoria;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_manutencao_comercial(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'suspensa INTEGER NOT NULL CHECK(suspensa IN (0,1)),',
   'revisao INTEGER NOT NULL CHECK(revisao>=0),',
   'motivo TEXT NOT NULL,alterado_em INTEGER NOT NULL);'
  ].join(' '));
  // Preserva estado existente após reinicialização, não abre automaticamente.
  banco.prepare([
   'INSERT OR IGNORE INTO loja_real_manutencao_comercial(',
   "id,suspensa,revisao,motivo,alterado_em) VALUES(1,0,0,'OPERACAO_NORMAL',0)"
  ].join(' ')).run();
 }
 estado(){
  const r=this.db.prepare([
   'SELECT suspensa,revisao,motivo,alterado_em',
   'FROM loja_real_manutencao_comercial WHERE id=1'
  ].join(' ')).get();
  if(!r)falha('MANUTENCAO_ESTADO_INDISPONIVEL');
  return {suspensa:r.suspensa===1,revisao:r.revisao,
   motivo:r.motivo,alteradoEm:r.alterado_em,
   loginClientesDisponivel:true,pedidosPagosContinuam:true,
   vendasReaisHabilitadasPorEsteControle:false};
 }
 garantirOperacaoDisponivel(){
  if(this.estado().suspensa)falha('OPERACAO_COMERCIAL_EM_MANUTENCAO');
 }
 alterar({suspensa,revisaoEsperada,motivo}={}){
  if(typeof suspensa!=='boolean'||!Number.isSafeInteger(revisaoEsperada)||
     revisaoEsperada<0||revisaoEsperada>100000000||
     !MOTIVOS.has(motivo))
   falha('MANUTENCAO_COMANDO_INVALIDO');
  const justificativa=motivo;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.estado();
   if(atual.revisao!==revisaoEsperada)
    falha('MANUTENCAO_REVISAO_EM_CONFLITO');
   if(atual.suspensa===suspensa)
    falha('MANUTENCAO_MODO_JA_DEFINIDO');
   const agora=this.agora();
   if(!Number.isSafeInteger(agora)||agora<=0)
    falha('MANUTENCAO_RELOGIO_INVALIDO');
   this.db.prepare([
    'UPDATE loja_real_manutencao_comercial',
    'SET suspensa=?,revisao=?,motivo=?,alterado_em=? WHERE id=1'
   ].join(' ')).run(suspensa?1:0,revisaoEsperada+1,justificativa,agora);
   this.auditoria.registrar({
    acao:'MANUTENCAO_COMERCIAL_ALTERADA',ator:'ADMIN_COMERCIAL',
    entidade:'MANUTENCAO_COMERCIAL',
    antes:{suspensa:atual.suspensa,revisao:atual.revisao},
    depois:{suspensa,revisao:revisaoEsperada+1,motivo:justificativa},
    revisaoAnterior:revisaoEsperada,revisaoNova:revisaoEsperada+1
   });
   this.db.exec('COMMIT');
   return this.estado();
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
module.exports={ManutencaoComercialSQLite};
