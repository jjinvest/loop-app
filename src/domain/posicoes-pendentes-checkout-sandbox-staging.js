'use strict';
// FOTOGRAFIA DE UMA POSICAO PENDENTE apenas no laboratorio: uma compra
// ficticia de R$250 no Asaas Sandbox reconsultada independentemente.
// Nenhuma posicao entra nas filas/tabuleiros/contas publicas; sem direito
// financeiro, indicacao, bonus, giro ou saque. NAO e o motor LOOP real.
const {randomUUID}=require('node:crypto');
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^[a-zA-Z0-9_-]{6,80}$/;
const EVENTO=/^[A-Za-z0-9_&-]{5,150}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class PosicoesPendentesCheckoutSandboxStaging{
 constructor({banco,ponte,agora=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('POSICOES_SANDBOX_PROIBIDAS_EM_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     ponte?.banco!==banco||typeof ponte.consultar!=='function')
   throw new TypeError('Ponte de cobranca e SQLite staging do mesmo banco obrigatorios');
  this.banco=banco;this.ponte=ponte;this.agora=agora;
  for(const t of [
   'akitemm_checkout_prepedidos_staging',
   'akitemm_prepedido_asaas_sandbox_staging'
  ])if(!banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(t))throw new TypeError('Base staging ainda nao preparada: '+t);
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_posicoes_pendentes_sandbox_staging(',
   'id TEXT PRIMARY KEY,',
   'prepedido_id TEXT NOT NULL UNIQUE REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL,',
   'pagamento_id TEXT NOT NULL UNIQUE,',
   'evento_id TEXT NOT NULL UNIQUE REFERENCES',
   'akitemm_prepedido_webhook_inbox_staging(evento_id) ON DELETE RESTRICT,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos=25000),',
   "estado TEXT NOT NULL CHECK(estado='PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX'),",
   'criado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_posicoes_pendentes_sandbox_titular',
   'ON akitemm_prepedido_posicoes_pendentes_sandbox_staging(titular_id);',
   'CREATE TRIGGER IF NOT EXISTS posicao_pendente_sandbox_no_update',
   'BEFORE UPDATE ON akitemm_prepedido_posicoes_pendentes_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'posicao de laboratorio imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS posicao_pendente_sandbox_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_posicoes_pendentes_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'posicao de laboratorio imutavel'); END;"
  ].join(' '));
 }
 _identidade(titularId,prepedidoId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
   throw falha('PREPEDIDO_SANDBOX_NAO_ENCONTRADO');
 }
 _saida(row){
  if(!row)return null;
  const p=this.ponte.consultar({
   titularId:row.titular_id,prepedidoId:row.prepedido_id
  });
  // Uma reversao posterior nunca continua a ser apresentada como apta
  // para confirmacao. O registro continua historico, sem deletar.
  const revisao=p?.estado!=='RECEBIMENTO_INFORMADO_SANDBOX'||
   p?.ultimaConsultaSandbox?.statusAsaas!=='RECEIVED'||
   p?.revisaoManualObrigatoria===true;
  return {
   id:row.id,prepedidoId:row.prepedido_id,
   estado:revisao?'EXIGE_REVISAO_SANDBOX':row.estado,
   valorCentavos:row.valor_centavos,criadoEm:row.criado_em,
   quantidadePosicoesPendentesSimuladas:1,
   fonte:'ASAAS_SANDBOX_RECONSULTADO',permissaoConfirmarCPF:false,
   posicoesReaisCriadas:0,filasMovimentadas:0,
   bonusGerados:0,saquesLiberados:0,dinheiroReal:false
  };
 }
 consultar({titularId,prepedidoId}={}){
  this._identidade(titularId,prepedidoId);
  return this._saida(this.banco.prepare([
   'SELECT * FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging',
   'WHERE titular_id=? AND prepedido_id=?'
  ].join(' ')).get(titularId,prepedidoId));
 }
 projetar({titularId,prepedidoId,eventoId,execucaoLiberada=false}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('POSICOES_SANDBOX_PROIBIDAS_EM_PRODUCAO');
  if(execucaoLiberada!==true)
   throw falha('PROJECAO_SANDBOX_NAO_AUTORIZADA');
  this._identidade(titularId,prepedidoId);
  if(typeof eventoId!=='string'||!EVENTO.test(eventoId))
   throw falha('EVENTO_SANDBOX_INVALIDO');
  const b=this.banco;
  b.exec('BEGIN IMMEDIATE');
  try{
   const cobrança=b.prepare([
    'SELECT a.prepedido_id,a.pagamento_id,a.valor_centavos,',
    'p.total_centavos,p.titular_id,a.estado',
    'FROM akitemm_prepedido_asaas_sandbox_staging a',
    'JOIN akitemm_checkout_prepedidos_staging p',
    'ON p.prepedido_id=a.prepedido_id',
    'WHERE a.prepedido_id=? AND a.titular_id=? AND p.titular_id=?'
   ].join(' ')).get(prepedidoId,titularId,titularId);
   const evento=b.prepare([
    'SELECT a.tipo,r.estado AS estado_reconsulta,r.codigo',
    'FROM akitemm_prepedido_webhook_inbox_staging a',
    'JOIN akitemm_prepedido_webhook_reconsulta_staging r',
    'ON r.evento_id=a.evento_id',
    'WHERE a.evento_id=? AND a.prepedido_id=? AND a.pagamento_id=?'
   ].join(' ')).get(eventoId,prepedidoId,cobrança?.pagamento_id??'');
   // Jamais derivar elegibilidade de um webhook bruto ou de CONFIRMED:
   // requer evento recebido, GET PSP concluido e estado persistido RECEIVED.
   const verificado=cobrança?.estado==='RECEBIMENTO_INFORMADO_SANDBOX'&&
    cobrança.valor_centavos===25000&&cobrança.total_centavos===25000&&
    evento?.tipo==='PAYMENT_RECEIVED'&&
    evento?.estado_reconsulta==='CONCLUIDO'&&
    evento?.codigo==='PSP_RECONSULTADO';
   if(!verificado)throw falha('RECEBIMENTO_SANDBOX_NAO_VERIFICADO');
   const estado=this.ponte.consultar({titularId,prepedidoId});
   if(estado?.ultimaConsultaSandbox?.statusAsaas!=='RECEIVED'||
      estado?.revisaoManualObrigatoria)
    throw falha('PSP_SANDBOX_NAO_CONCILIADO');
   const anterior=b.prepare([
    'SELECT * FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging',
    'WHERE prepedido_id=?'
   ].join(' ')).get(prepedidoId);
   if(anterior){
    b.exec('COMMIT');
    return {repetido:true,pendente:this._saida(anterior)};
   }
   const agora=this.agora();
   if(typeof agora!=='string'||!Number.isFinite(Date.parse(agora)))
    throw falha('RELOGIO_INVALIDO');
   const id='pos-sbx-'+randomUUID();
   b.prepare([
    'INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging',
    '(id,prepedido_id,titular_id,pagamento_id,evento_id,valor_centavos,estado,criado_em)',
    "VALUES(?,?,?,?,?,25000,'PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX',?)"
   ].join(' ')).run(id,prepedidoId,titularId,cobrança.pagamento_id,eventoId,agora);
   b.exec('COMMIT');
   return {repetido:false,pendente:this.consultar({titularId,prepedidoId})};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
}
module.exports={PosicoesPendentesCheckoutSandboxStaging};
