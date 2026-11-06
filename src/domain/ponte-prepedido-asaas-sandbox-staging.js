'use strict';
// Ponte PRE-PEDIDO -> Asaas Sandbox para ensaios EXPLICITOS e locais.
// Nao e checkout comercial. Nao montada em src/server.js, nao gera
// posicoes, saldos, saque, entrega ou comprovante para o motor LOOP.
// Transacao SQLite reserva o envio ANTES da rede: timeout nunca reenvia POST.
const {randomUUID}=require('node:crypto');
const {auditarCoberturaDePedido}=require('./auditoria-cobertura-lotes-akitemm');
const PREPEDIDO=/^hom-[0-9a-f-]{36}$/;
const TITULAR=/^[a-zA-Z0-9_-]{6,80}$/;
const CLIENTE=/^[a-zA-Z0-9_-]{5,90}$/;
const PAGAMENTO=/^[a-zA-Z0-9_-]{5,90}$/;
const CONFIRMADO=new Set(['RECEIVED']);
const REVERSO=new Set(['REFUNDED','PARTIALLY_REFUNDED','REFUND_IN_PROGRESS',
 'CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','DELETED']);
const PENDENTE=new Set(['PENDING','CONFIRMED','OVERDUE']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function apenasStaging(){
 if(process.env.NODE_ENV==='production')
  throw falha('PONTE_SANDBOX_PROIBIDA_EM_PRODUCAO');
}
class PontePrepedidoAsaasSandboxStaging{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  apenasStaging();
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw new TypeError('SQLite de staging obrigatorio');
  if(!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_checkout_prepedidos_staging'").get())
   throw new TypeError('PrePedidosCheckoutStagingSQLite obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_asaas_sandbox_staging(',
   'prepedido_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL,cliente_asaas_id TEXT NOT NULL,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'external_ref TEXT NOT NULL UNIQUE,',
   'pagamento_id TEXT UNIQUE,',
   "estado TEXT NOT NULL CHECK(estado IN ('PREPARADA','CRIACAO_INDETERMINADA',",
   "'PENDENTE_SANDBOX','RECEBIMENTO_INFORMADO_SANDBOX',",
   "'REVERSAO_INFORMADA_SANDBOX','EXIGE_REVISAO')),",
   'criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_asaas_consultas_staging(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'prepedido_id TEXT NOT NULL REFERENCES',
   'akitemm_prepedido_asaas_sandbox_staging(prepedido_id) ON DELETE RESTRICT,',
   'pagamento_id TEXT NOT NULL,',
   'status_asaas TEXT NOT NULL,estado_local TEXT NOT NULL,',
   'consultado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_prepedido_asaas_consultas',
   'ON akitemm_prepedido_asaas_consultas_staging(prepedido_id,id);',
   'CREATE TRIGGER IF NOT EXISTS prepedido_asaas_consultas_no_update',
   'BEFORE UPDATE ON akitemm_prepedido_asaas_consultas_staging',
   "BEGIN SELECT RAISE(ABORT,'consulta imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS prepedido_asaas_consultas_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_asaas_consultas_staging',
   "BEGIN SELECT RAISE(ABORT,'consulta imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS prepedido_asaas_cobranca_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_asaas_sandbox_staging',
   "BEGIN SELECT RAISE(ABORT,'vinculo imutavel'); END;"
  ].join(' '));
 }
 _data(){
  const v=this.agora();
  if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))
   throw falha('RELOGIO_INVALIDO');
  return v;
 }
 _validar(titularId,prepedidoId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))
   throw falha('SESSAO_INVALIDA');
  if(typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
   throw falha('PREPEDIDO_NAO_ENCONTRADO');
 }
 _linha(titularId,prepedidoId){
  return this.banco.prepare([
   'SELECT * FROM akitemm_prepedido_asaas_sandbox_staging',
   'WHERE prepedido_id=? AND titular_id=?'
  ].join(' ')).get(prepedidoId,titularId)||null;
 }
 _publica(row){
  if(!row)return null;
  const ultimo=this.banco.prepare([
   'SELECT status_asaas AS statusAsaas,estado_local AS estadoLocal,',
   'consultado_em AS consultadoEm',
   'FROM akitemm_prepedido_asaas_consultas_staging',
   'WHERE prepedido_id=? ORDER BY id DESC LIMIT 1'
  ].join(' ')).get(row.prepedido_id)||null;
  return {
   prepedidoId:row.prepedido_id,estado:row.estado,valorCentavos:row.valor_centavos,
   pagamentoSandboxId:row.pagamento_id,ultimaConsultaSandbox:ultimo,
   ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   criarPixAutomaticamente:false,pagamentoReal:false,valorRecebidoRealCentavos:0,
   pedidoComercialCriado:false,posicoesCriadas:0,bonusGerados:0,
   saquesLiberados:0,catracaMovimentada:false,
   revisaoManualObrigatoria:['CRIACAO_INDETERMINADA','EXIGE_REVISAO',
    'REVERSAO_INFORMADA_SANDBOX'].includes(row.estado)||
    (row.estado==='RECEBIMENTO_INFORMADO_SANDBOX'&&
     ultimo?.statusAsaas!=='RECEIVED')
  };
 }
 consultar({titularId,prepedidoId}={}){
  this._validar(titularId,prepedidoId);
  return this._publica(this._linha(titularId,prepedidoId));
 }
 preparar({titularId,prepedidoId,clienteAsaasId,capacidade=null}={}){
  apenasStaging();this._validar(titularId,prepedidoId);
  if(typeof clienteAsaasId!=='string'||!CLIENTE.test(clienteAsaasId))
   throw falha('CLIENTE_SANDBOX_INVALIDO');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const original=b.prepare([
    'SELECT titular_id,total_centavos,estado FROM akitemm_checkout_prepedidos_staging',
    'WHERE prepedido_id=? AND titular_id=?'
   ].join(' ')).get(prepedidoId,titularId);
   if(!original)throw falha('PREPEDIDO_NAO_ENCONTRADO');
   if(original.estado!=='AGUARDANDO_HOMOLOGACAO_EXTERNA'||
      !Number.isSafeInteger(original.total_centavos)||original.total_centavos<1)
    throw falha('PREPEDIDO_NAO_ELEGIVEL');
   const antigo=this._linha(titularId,prepedidoId);
   if(antigo){
    if(antigo.cliente_asaas_id!==clienteAsaasId||
       antigo.valor_centavos!==original.total_centavos)
     throw falha('CONFLITO_VINCULO_SANDBOX');
    b.exec('COMMIT');
    return {repetido:true,registro:this._publica(antigo)};
   }
   if(capacidade!==null){
    const quantidade=capacidade?.quantidadePosicoes;
    if(!Number.isSafeInteger(quantidade)||quantidade<1||quantidade>10||
       typeof capacidade.consultarAtivas!=='function')
     throw falha('CAPACIDADE_POSICOES_NAO_COMPROVADA');
    // Esta transacao IMMEDIATE serializa reservas do MESMO SQLite mesmo
    // entre requests/processos. Nao liberar um segundo Pix sobre o mesmo
    // teto de 10 posicoes ainda comprometido por cobrancas anteriores.
    const ativas=capacidade.consultarAtivas();
    if(!Number.isSafeInteger(ativas)||ativas<0||ativas>10)
     throw falha('CAPACIDADE_POSICOES_NAO_COMPROVADA');
    const reservadas=b.prepare([
     'SELECT p.prepedido_id AS pedidoId,',
     'f.fotografia_json AS foto',
     'FROM akitemm_prepedido_asaas_sandbox_staging p',
     'LEFT JOIN akitemm_vitrine_fotografia_classificacao_prepedido f',
     'ON f.prepedido_id=p.prepedido_id',
     'WHERE p.titular_id=?',
     "AND p.estado IN ('PREPARADA','CRIACAO_INDETERMINADA',",
     "'PENDENTE_SANDBOX','RECEBIMENTO_INFORMADO_SANDBOX','EXIGE_REVISAO')",
     'AND NOT EXISTS (SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes m',
     "WHERE m.prepedido_id=p.prepedido_id AND m.tipo='VINCULAR_PEDIDO')"
    ].join(' ')).all(titularId);
    let comprometidas=0;
    for(const item of reservadas){
     let qtd;
     try{
      qtd=JSON.parse(item.foto).planejamentoPosicoes.quantidadePosicoesPrevistas;
     }catch{throw falha('CAPACIDADE_RESERVAS_INDETERMINADAS');}
     if(!Number.isSafeInteger(qtd)||qtd<1||qtd>10)
      throw falha('CAPACIDADE_RESERVAS_INDETERMINADAS');
     comprometidas+=qtd;
    }
    if(ativas+comprometidas+quantidade>10)
     throw falha('LIMITE_POSICOES_ANTES_DA_COBRANCA');
   }
   const data=this._data();
   b.prepare([
    'INSERT INTO akitemm_prepedido_asaas_sandbox_staging',
    '(prepedido_id,titular_id,cliente_asaas_id,valor_centavos,external_ref,',
    "pagamento_id,estado,criado_em,atualizado_em) VALUES(?,?,?,?,?,NULL,'PREPARADA',?,?)"
   ].join(' ')).run(prepedidoId,titularId,clienteAsaasId,
    original.total_centavos,'LOOPLAB-'+prepedidoId,data,data);
   b.exec('COMMIT');
   return {repetido:false,registro:this.consultar({titularId,prepedidoId})};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 async enviarUmaVez({titularId,prepedidoId,provedor,execucaoLiberada=false,
  exigirCoberturaBruta=false}={}){
  apenasStaging();this._validar(titularId,prepedidoId);
  if(execucaoLiberada!==true)throw falha('ENVIO_SANDBOX_NAO_AUTORIZADO');
  if(provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
     typeof provedor.criarCobrancaPix!=='function')
   throw falha('PROVEDOR_SANDBOX_OBRIGATORIO');
  // Reserva ANTES da rede: interrupcao no envio gera estado indeterminado.
  // Nao fazer POST de novo nem mesmo depois de reinicio; operador precisa
  // reconciliar externalReference no Asaas, jamais repetir criacao.
  const b=this.banco;
  b.exec('BEGIN IMMEDIATE');
  let snapshot;
  try{
   const row=this._linha(titularId,prepedidoId);
   if(!row)throw falha('VINCULO_NAO_ENCONTRADO');
   if(row.estado!=='PREPARADA'){
    b.exec('COMMIT');
    return {repetido:true,registro:this._publica(row)};
   }
   // Modo ESTRITO, opt-in do laboratorio: avalia o pedido congelado
   // ANTES de reservar envio ou chamar o PSP. A auditoria nao consulta
   // PSP, nao altera o pedido e nao confunde dinheiro bruto com margem.
   // Modo antigo de testes pode continuar simulando pedidos negativos.
   if(exigirCoberturaBruta===true){
    const fotografia=b.prepare([
     'SELECT fotografia_json AS documento FROM',
     'akitemm_vitrine_fotografia_classificacao_prepedido',
     'WHERE prepedido_id=? AND titular_id=?'
    ].join(' ')).get(prepedidoId,titularId);
    if(!fotografia)throw falha('FOTOGRAFIA_PRECOBRANCA_OBRIGATORIA');
    let conferido;
    try{
     conferido=auditarCoberturaDePedido({
      fotografia:JSON.parse(fotografia.documento),
      valorPedidoCentavos:row.valor_centavos
     });
    }catch{
     throw falha('PRECOBRANCA_FOTOGRAFIA_DIVERGENTE');
    }
    if(conferido.estado==='BRUTO_INSUFICIENTE'||
       conferido.estado==='SEGMENTO_SEM_COBERTURA_BRUTA'||
       conferido.segmentosInsuficientes?.length||
       conferido.alertas?.includes('EVENTO_ROXO_NAO_CONFIGURADO')||
       conferido.alertas?.includes('LIMITE_DEZ_POSICOES'))
     throw falha('COBERTURA_BRUTA_INSUFICIENTE_PARA_COBRANCA');
   }
   b.prepare([
    'UPDATE akitemm_prepedido_asaas_sandbox_staging',
    "SET estado='CRIACAO_INDETERMINADA',atualizado_em=?",
    "WHERE prepedido_id=? AND titular_id=? AND estado='PREPARADA'"
   ].join(' ')).run(this._data(),prepedidoId,titularId);
   snapshot={pedidoId:prepedidoId,clienteAsaasId:row.cliente_asaas_id,
    valorCentavos:row.valor_centavos};
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  // Rede SEM transacao aberta. Na falha ou resposta inesperada, mantem
  // CRIACAO_INDETERMINADA e exige verificacao externa, sem POST repetido.
  const remoto=await provedor.criarCobrancaPix(snapshot);
  if(remoto?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    typeof remoto.pagamentoId!=='string'||!PAGAMENTO.test(remoto.pagamentoId)||
    remoto.valorCentavos!==snapshot.valorCentavos||
    !['PENDING','CONFIRMED'].includes(remoto.status))
   throw falha('RESPOSTA_SANDBOX_DIVERGENTE_VERIFICAR_REMOTO');
  b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._linha(titularId,prepedidoId);
   if(!atual||atual.estado!=='CRIACAO_INDETERMINADA'||
      atual.valor_centavos!==snapshot.valorCentavos)
    throw falha('ESTADO_SANDBOX_CONCORRENTE_REVISAR');
   b.prepare([
    'UPDATE akitemm_prepedido_asaas_sandbox_staging',
    "SET pagamento_id=?,estado='PENDENTE_SANDBOX',atualizado_em=?",
    "WHERE prepedido_id=? AND titular_id=? AND estado='CRIACAO_INDETERMINADA'"
   ].join(' ')).run(remoto.pagamentoId,this._data(),prepedidoId,titularId);
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return {repetido:false,registro:this.consultar({titularId,prepedidoId})};
 }
 async recuperarCriacao({titularId,prepedidoId,provedor,consultaLiberada=false}={}){
  apenasStaging();this._validar(titularId,prepedidoId);
  if(consultaLiberada!==true)throw falha('RECUPERACAO_SANDBOX_NAO_AUTORIZADA');
  if(provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
     typeof provedor.localizarCobrancaPorReferencia!=='function')
   throw falha('PROVEDOR_SANDBOX_OBRIGATORIO');
  const anterior=this._linha(titularId,prepedidoId);
  if(!anterior)throw falha('VINCULO_NAO_ENCONTRADO');
  if(anterior.estado==='PREPARADA')throw falha('ENVIO_SANDBOX_NAO_INICIADO');
  if(anterior.estado!=='CRIACAO_INDETERMINADA')
   return {repetido:true,registro:this._publica(anterior)};
  // A busca por externalReference é exclusivamente leitura do PSP.
  // Se nenhum pagamento for encontrado, NAO desbloquear novo POST.
  const remoto=await provedor.localizarCobrancaPorReferencia({
   pedidoId:prepedidoId,clienteAsaasId:anterior.cliente_asaas_id,
   valorCentavos:anterior.valor_centavos
  });
  if(remoto===null)return {encontrado:false,
   exigeRevisaoManual:true,registro:this.consultar({titularId,prepedidoId})};
  if(remoto?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
     typeof remoto.pagamentoId!=='string'||!PAGAMENTO.test(remoto.pagamentoId)||
     remoto.valorCentavos!==anterior.valor_centavos)
   throw falha('BUSCA_SANDBOX_DIVERGENTE');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._linha(titularId,prepedidoId);
   if(!atual||atual.valor_centavos!==anterior.valor_centavos||
      atual.cliente_asaas_id!==anterior.cliente_asaas_id)
    throw falha('ESTADO_SANDBOX_CONCORRENTE_REVISAR');
   if(atual.estado!=='CRIACAO_INDETERMINADA'){
    b.exec('COMMIT');
    return {repetido:true,registro:this._publica(atual)};
   }
   b.prepare([
    'UPDATE akitemm_prepedido_asaas_sandbox_staging',
    "SET pagamento_id=?,estado='PENDENTE_SANDBOX',atualizado_em=?",
    "WHERE prepedido_id=? AND titular_id=? AND estado='CRIACAO_INDETERMINADA'"
   ].join(' ')).run(remoto.pagamentoId,this._data(),prepedidoId,titularId);
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return {encontrado:true,recuperado:true,registro:this.consultar({titularId,prepedidoId}),
   precisaReconsultaIndependente:true};
 }
 async conferir({titularId,prepedidoId,provedor}={}){
  apenasStaging();this._validar(titularId,prepedidoId);
  if(provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    typeof provedor.consultarCobranca!=='function')
   throw falha('PROVEDOR_SANDBOX_OBRIGATORIO');
  const antes=this._linha(titularId,prepedidoId);
  if(!antes)throw falha('VINCULO_NAO_ENCONTRADO');
  if(!antes.pagamento_id)
   throw falha('CRIACAO_INDETERMINADA_VERIFICAR_REFERENCIA_ASAAS');
  const remoto=await provedor.consultarCobranca(antes.pagamento_id);
  if(!remoto||remoto.pagamentoId!==antes.pagamento_id||
     remoto.externalReference!==antes.external_ref||
     remoto.billingType!=='PIX'||remoto.valorCentavos!==antes.valor_centavos||
     (remoto.clienteAsaasId!==null&&remoto.clienteAsaasId!==undefined&&
      remoto.clienteAsaasId!==antes.cliente_asaas_id))
   throw falha('DADOS_SANDBOX_DIVERGENTES');
  const estado=REVERSO.has(remoto.status)?'REVERSAO_INFORMADA_SANDBOX':
    CONFIRMADO.has(remoto.status)?'RECEBIMENTO_INFORMADO_SANDBOX':
    PENDENTE.has(remoto.status)?'PENDENTE_SANDBOX':'EXIGE_REVISAO';
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._linha(titularId,prepedidoId);
   if(!atual||atual.pagamento_id!==antes.pagamento_id)
    throw falha('PAGAMENTO_CONCORRENTE_REVISAR');
   // Nao regredir recebido/revertido por PENDING; conservar indicio
   // historico e expor o ultimo status PSP para revisao.
   const final=atual.estado==='REVERSAO_INFORMADA_SANDBOX'||
    (atual.estado==='RECEBIMENTO_INFORMADO_SANDBOX'&&
      estado==='PENDENTE_SANDBOX')?atual.estado:estado;
   b.prepare([
    'UPDATE akitemm_prepedido_asaas_sandbox_staging SET estado=?,atualizado_em=?',
    'WHERE prepedido_id=? AND titular_id=?'
   ].join(' ')).run(final,this._data(),prepedidoId,titularId);
   b.prepare([
    'INSERT INTO akitemm_prepedido_asaas_consultas_staging',
    '(prepedido_id,pagamento_id,status_asaas,estado_local,consultado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(prepedidoId,antes.pagamento_id,remoto.status,
    final,this._data());
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return this.consultar({titularId,prepedidoId});
 }
}
module.exports={PontePrepedidoAsaasSandboxStaging};
