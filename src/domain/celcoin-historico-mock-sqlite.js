'use strict';
// Historico DURAVEL dos retornos CELCOIN FICTICIOS. Nunca recebe HTTP do provedor.
// Nao representa credito bancario, recebimento, aprovacao ou saldo sacavel.
const {planoCelcoinPorFotografiaLab}=require('./celcoin-fluxo-sandbox-lab');
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
const EVENTO=/^[a-z0-9_-]{3,80}$/i;
const STATUS=new Set(['PENDING','CONFIRMED','REJECTED','REVERTED']);
const TRANSICOES={
 NAO_ENVIADO:['PENDING','CONFIRMED','REJECTED'],
 PENDING:['PENDING','CONFIRMED','REJECTED'],
 CONFIRMED:['CONFIRMED','REVERTED'],
 REJECTED:['REJECTED'],REVERTED:['REVERTED']
};
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function dinheiro(v){return Number.isSafeInteger(v)&&v>0&&v<=100000000000;}
class CelcoinHistoricoMockSQLite{
 constructor({banco}={}){
  if(process.env.NODE_ENV==='production')falha('CELCOIN_MOCK_PROIBIDO_PRODUCAO');
  if(!banco||typeof banco.prepare!=='function'||typeof banco.exec!=='function')
   falha('CELCOIN_MOCK_BANCO_COMPARTILHADO_OBRIGATORIO');
  this.banco=banco;
  // Criar somente DEPOIS de akitemm_pedido_custos_fotografia_lab.
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_celcoin_eventos_mock_lab(',
   'numero INTEGER PRIMARY KEY AUTOINCREMENT,',
   'evento_id TEXT NOT NULL UNIQUE,',
   'prepedido_id TEXT NOT NULL REFERENCES',
   'akitemm_pedido_custos_fotografia_lab(prepedido_id) ON DELETE RESTRICT,',
   'client_code TEXT NOT NULL,',
   "destino TEXT NOT NULL CHECK(destino IN ('LOOP_INTER','FORNECEDOR','LOJA_MERCADO_PAGO')),",
   "status TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','REJECTED','REVERTED')),",
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'criado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS celcoin_mock_busca_pedido',
   'ON akitemm_celcoin_eventos_mock_lab(prepedido_id,client_code,numero);',
   'CREATE TRIGGER IF NOT EXISTS celcoin_mock_no_update',
   'BEFORE UPDATE ON akitemm_celcoin_eventos_mock_lab',
   "BEGIN SELECT RAISE(ABORT,'celcoin mock imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS celcoin_mock_no_delete',
   'BEFORE DELETE ON akitemm_celcoin_eventos_mock_lab',
   "BEGIN SELECT RAISE(ABORT,'celcoin mock imutavel'); END;"
  ].join(' '));
 }
 // Apenas uso interno dos testes. Nenhuma rota HTTP grava neste historico.
 registrarEnsaio({prepedidoId,evento}={}){
  if(!PEDIDO.test(prepedidoId)||!evento||typeof evento!=='object'||
     Array.isArray(evento)||!EVENTO.test(evento.eventoId)||
     typeof evento.clientCode!=='string'||!EVENTO.test(evento.clientCode)||
     !STATUS.has(evento.status)||!dinheiro(evento.valorCentavos))
   falha('CELCOIN_MOCK_EVENTO_INVALIDO');
  const banco=this.banco;
  banco.exec('BEGIN IMMEDIATE');
  try{
   const row=banco.prepare([
    'SELECT fotografia_json AS fotografia',
    'FROM akitemm_pedido_custos_fotografia_lab WHERE prepedido_id=?'
   ].join(' ')).get(prepedidoId);
   if(!row)falha('CELCOIN_MOCK_PEDIDO_NAO_EXISTE');
   const plano=planoCelcoinPorFotografiaLab({
    fotografia:JSON.parse(row.fotografia)});
   if(plano.bloqueios.some(x=>![
     'CREDENCIAIS_CELCOIN_AUSENTES','CONTAS_BANCARIAS_NAO_CONECTADAS',
     'CONCILIACAO_LIQUIDACAO_AUSENTE',
     'KYC_E_AUTORIZACAO_PAGAMENTOS_PENDENTES'
   ].includes(x)))falha('CELCOIN_MOCK_PLANO_NAO_APTO');
   const ordem=plano.ordens.find(x=>x.clientCodePrevisto===evento.clientCode);
   if(!ordem||ordem.valorPrevistoCentavos!==evento.valorCentavos)
    falha('CELCOIN_MOCK_DESTINO_VALOR_DIVERGENTE');
   const igual=banco.prepare([
    'SELECT prepedido_id AS prepedidoId,client_code AS clientCode,',
    'status,valor_centavos AS valorCentavos',
    'FROM akitemm_celcoin_eventos_mock_lab WHERE evento_id=?'
   ].join(' ')).get(evento.eventoId);
   if(igual){
    if(igual.prepedidoId!==prepedidoId||igual.clientCode!==evento.clientCode||
       igual.valorCentavos!==evento.valorCentavos||igual.status!==evento.status)
     falha('CELCOIN_MOCK_ID_REUTILIZADO_COM_CONFLITO');
    banco.exec('COMMIT');
    return {repetido:true,gravado:false,producao:false,transferenciasReais:0};
   }
   const anterior=banco.prepare([
    'SELECT status FROM akitemm_celcoin_eventos_mock_lab',
    'WHERE prepedido_id=? AND client_code=?',
    'ORDER BY numero DESC LIMIT 1'
   ].join(' ')).get(prepedidoId,evento.clientCode)?.status||'NAO_ENVIADO';
   if(!TRANSICOES[anterior].includes(evento.status))
    falha('CELCOIN_MOCK_TRANSICAO_INVALIDA');
   banco.prepare([
    'INSERT INTO akitemm_celcoin_eventos_mock_lab',
    '(evento_id,prepedido_id,client_code,destino,status,valor_centavos,criado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(evento.eventoId,prepedidoId,evento.clientCode,
    ordem.destino,evento.status,evento.valorCentavos,Date.now());
   banco.exec('COMMIT');
   return {repetido:false,gravado:true,producao:false,transferenciasReais:0};
  }catch(e){banco.exec('ROLLBACK');throw e;}
 }
 consultar({limite=20,prepedidoId=null}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>50||
     (prepedidoId!==null&&!PEDIDO.test(prepedidoId)))
   falha('CELCOIN_MOCK_CONSULTA_INVALIDA');
  const total=this.banco.prepare(
   'SELECT COUNT(*) AS total FROM akitemm_celcoin_eventos_mock_lab'
  ).get().total;
  const sql=[
   'SELECT evento_id AS eventoId,prepedido_id AS prepedidoId,',
   'destino,status,valor_centavos AS valorCentavos,',
   'criado_em AS criadoEm FROM akitemm_celcoin_eventos_mock_lab',
   prepedidoId?'WHERE prepedido_id=?':'',
   'ORDER BY numero DESC LIMIT ?'
  ].join(' ');
  const eventos=prepedidoId?this.banco.prepare(sql).all(prepedidoId,limite):
   this.banco.prepare(sql).all(limite);
  return {eventosMockPersistidos:total,eventos,
   destino:'MESMO_SQLITE_DO_MOTOR_E_DOS_PEDIDOS',
   apenasMock:true,autenticidadePixConfirmada:false,
   transferenciaBancariaConfirmada:false,saquesPermitidos:false,
   creditoRealCentavos:null,status:'SEM_CELCOIN_CONECTADA'};
 }
}
module.exports={CelcoinHistoricoMockSQLite};
