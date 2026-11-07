'use strict';
// Auditoria SOMENTE LEITURA do motor no SQLite UNICO da loja/PSP.
// Usada pela readiness e pelo backup antes de declarar recuperacao apta.
// Nunca aciona giros, consultas PSP, saques ou mutacoes.
const {SimuladorLoop}=require('./simulador-loop');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const TABELAS=[
 'akitemm_motor_conta_ensaio_estado',
 'akitemm_motor_conta_ensaio_operacoes',
 'akitemm_motor_ensaio_lotes_pedido',
 'akitemm_motor_ensaio_aceites_posicao'
];
function auditarIntegridadeMotorCandidato({banco,exigirMotor=false}={}){
 if(process.env.NODE_ENV==='production')
  falha('AUDITORIA_MOTOR_ENSAIO_PROIBIDA_PRODUCAO');
 if(typeof banco?.prepare!=='function')
  falha('AUDITORIA_MOTOR_SQLITE_INVALIDO');
 const presentes=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
 ).all().map(x=>x.name));
 const quantidade=TABELAS.filter(t=>presentes.has(t)).length;
 if(quantidade===0&&!exigirMotor)
  return {presente:false,totalInconsistencias:0,snapshotValidado:false};
 if(quantidade!==TABELAS.length)
  falha('MOTOR_SQLITE_ESTRUTURA_INCOMPLETA');
 const basicas=['akitemm_checkout_prepedidos_staging',
  'akitemm_conta_unica_candidata'];
 if(basicas.some(t=>!presentes.has(t)))
  falha('MOTOR_SQLITE_ORIGEM_INCOMPLETA');
 const contar=(sql)=>banco.prepare(sql).get().n;
 const lotesOrfaos=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'LEFT JOIN akitemm_checkout_prepedidos_staging p',
  'ON p.prepedido_id=l.prepedido_id AND p.titular_id=l.titular_id',
  'LEFT JOIN akitemm_conta_unica_candidata c ON c.id=l.titular_id',
  'WHERE p.prepedido_id IS NULL OR c.id IS NULL'
 ].join(' '));
 const aceitesOrfaos=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao a',
  'LEFT JOIN akitemm_motor_ensaio_lotes_pedido l',
  'ON l.numero_posicao=a.numero_posicao',
  'AND l.prepedido_id=a.prepedido_id AND l.titular_id=a.titular_id',
  'WHERE l.numero_posicao IS NULL'
 ].join(' '));
 const lotesSemOperacao=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido l',
  'WHERE NOT EXISTS (',
  'SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes o',
  "WHERE o.tipo='VINCULAR_PEDIDO' AND o.prepedido_id=l.prepedido_id",
  'AND o.titular_id=l.titular_id)'
 ].join(' '));
 const operacoesOrfas=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes o',
  "WHERE o.tipo='VINCULAR_PEDIDO' AND NOT EXISTS (",
  'SELECT 1 FROM akitemm_motor_ensaio_lotes_pedido l',
  'WHERE l.prepedido_id=o.prepedido_id AND l.titular_id=o.titular_id',
  'AND l.numero_posicao=o.numero_posicao AND l.ordinal=1)'
 ].join(' '));
 const total=lotesOrfaos+aceitesOrfaos+lotesSemOperacao+operacoesOrfas;
 if(total>0)falha('MOTOR_SQLITE_VINCULOS_SEMANTICOS_INVALIDOS');
 // Uma compra de produto nao pode ganhar posicao retroativamente.
 // Validar contrato de capacidade do pedido, sem disparar PSP ou motor.
 // Tabelas opcionais sao aceitas somente quando inteiramente ausentes
 // (compatibilidade com laboratorios anteriores a esta migracao).
 let reservasAuditadas=0,checkpointsAuditados=0;
 const tabelaReserva='akitemm_prepedido_asaas_reserva_posicoes_staging';
 if(presentes.has(tabelaReserva)){
  if(!presentes.has('akitemm_prepedido_asaas_sandbox_staging'))
   falha('MOTOR_SQLITE_RESERVAS_SEM_PONTE');
  const reservas=banco.prepare([
   'SELECT v.prepedido_id AS pedidoId,v.titular_id AS titularId,',
   'v.posicoes_previstas AS previstas,v.posicoes_reservadas AS reservadas,',
   'v.modalidade,p.prepedido_id AS pspPedido,p.titular_id AS pspTitular,',
   'c.prepedido_id AS checkoutPedido,c.titular_id AS checkoutTitular,',
   'f.fotografia_json AS foto,f.titular_id AS fotoTitular',
   'FROM akitemm_prepedido_asaas_reserva_posicoes_staging v',
   'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging p',
   'ON p.prepedido_id=v.prepedido_id',
   'LEFT JOIN akitemm_checkout_prepedidos_staging c',
   'ON c.prepedido_id=v.prepedido_id',
   'LEFT JOIN akitemm_vitrine_fotografia_classificacao_prepedido f',
   'ON f.prepedido_id=v.prepedido_id'
  ].join(' ')).all();
  for(const x of reservas){
   reservasAuditadas++;
   if(x.pspPedido!==x.pedidoId||x.checkoutPedido!==x.pedidoId||
      x.pspTitular!==x.titularId||x.checkoutTitular!==x.titularId||
      x.fotoTitular!==x.titularId)
    falha('MOTOR_SQLITE_RESERVAS_TITULAR_DIVERGENTE');
   let fotografia;
   try{fotografia=JSON.parse(x.foto);}
   catch{falha('MOTOR_SQLITE_RESERVA_FOTOGRAFIA_INVALIDA');}
   if(fotografia?.prepedidoId!==x.pedidoId||
      fotografia?.titularId!==x.titularId||
      fotografia?.planejamentoPosicoes?.quantidadePosicoesPrevistas!==x.previstas)
    falha('MOTOR_SQLITE_RESERVA_FOTOGRAFIA_DIVERGENTE');
   if(!Number.isSafeInteger(x.previstas)||x.previstas<0||
      !Number.isSafeInteger(x.reservadas)||x.reservadas<0||
      x.reservadas>10||x.reservadas>x.previstas)
    falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
   if(x.modalidade==='COM_POSICOES'){
    if(x.previstas<1||x.reservadas!==x.previstas)
     falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
   }else if(x.modalidade==='SEM_POSICOES_LIMITE'){
    if(x.previstas<1||x.reservadas!==0)
     falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
   }else if(x.modalidade==='SEM_POSICOES_PRODUTO'){
    if(x.previstas!==0||x.reservadas!==0)
     falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
   }else if(x.modalidade==='LEGADO_SEM_RESERVA'){
    if(x.reservadas!==0)
     falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
   }else falha('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
  }
  const convertidas=banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes m',
   'JOIN akitemm_prepedido_asaas_reserva_posicoes_staging v',
   'ON v.prepedido_id=m.prepedido_id',
   "WHERE m.tipo='VINCULAR_PEDIDO'",
   'AND (v.posicoes_reservadas=0 OR',
   'v.posicoes_reservadas<>(SELECT COUNT(*)',
   'FROM akitemm_motor_ensaio_lotes_pedido l',
   'WHERE l.prepedido_id=m.prepedido_id))'
  ].join(' ')).get().n;
  if(convertidas)falha('MOTOR_SQLITE_RESERVAS_CONVERTIDAS_INDEVIDAMENTE');
 }
 // Checkpoints de reversao tambem pertencem a este mesmo banco.
 // Falhas operacionais pendentes NAO tornam backup invalido: preserva-las
 // no backup e essencial para o retry. Apenas checkpoint adulterado falha.
 const tabelaReversoes='akitemm_motor_reversoes_psp_checkpoint';
 if(presentes.has(tabelaReversoes)){
  if(!presentes.has('akitemm_prepedido_webhook_inbox_staging')||
     !presentes.has('akitemm_prepedido_asaas_sandbox_staging'))
   falha('MOTOR_SQLITE_REVERSOES_SEM_PSP');
  const invalidos=banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_reversoes_psp_checkpoint c',
   'LEFT JOIN akitemm_prepedido_webhook_inbox_staging i',
   'ON i.evento_id=c.evento_id',
   'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging p',
   'ON p.prepedido_id=i.prepedido_id',
   'WHERE i.evento_id IS NULL OR p.prepedido_id IS NULL',
   "OR i.tipo NOT IN ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',",
   "'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',",
   "'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED')",
   "OR p.estado<>'REVERSAO_INFORMADA_SANDBOX'"
  ].join(' ')).get().n;
  if(invalidos)falha('MOTOR_SQLITE_REVERSOES_INCONSISTENTES');
  checkpointsAuditados=contar(
   'SELECT COUNT(*) AS n FROM akitemm_motor_reversoes_psp_checkpoint');
 }
 // O livro de criacao de douradas e imutavel e deve corresponder a cada
 // posicao efetivamente existente no snapshot do mesmo motor.
 const tabelaDouradas='akitemm_motor_douradas_manuais_lab';
 const registrosDouradas=presentes.has(tabelaDouradas)?banco.prepare([
  'SELECT evento_id AS eventoId,numero_posicao AS posicaoId',
  'FROM akitemm_motor_douradas_manuais_lab'
 ].join(' ')).all():[];
 const operacoesDouradas=contar([
  'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes',
  "WHERE tipo='CRIAR_DOURADA_MANUAL'"
 ].join(' '));
 if(registrosDouradas.length!==operacoesDouradas)
  falha('MOTOR_DOURADAS_LIVRO_OPERACAO_DIVERGENTE');
 const duplicadas=banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes o',
  "WHERE o.tipo='CRIAR_DOURADA_MANUAL' AND NOT EXISTS (",
  'SELECT 1 FROM akitemm_motor_douradas_manuais_lab d',
  'WHERE d.numero_posicao=o.numero_posicao)'
 ].join(' ')).get().n;
 if(presentes.has(tabelaDouradas)&&duplicadas>0)
  falha('MOTOR_DOURADAS_OPERACAO_ORFA');
 const row=banco.prepare([
  'SELECT revisao,snapshot FROM akitemm_motor_conta_ensaio_estado',
  'WHERE id=1'
 ].join(' ')).get();
 const temLotes=contar('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido')>0;
 if(!row&&(temLotes||registrosDouradas.length))falha('MOTOR_SQLITE_SNAPSHOT_AUSENTE');
 if(row){
  if(!Number.isSafeInteger(row.revisao)||row.revisao<1||
     typeof row.snapshot!=='string'||row.snapshot.length>32*1024*1024)
   falha('MOTOR_SQLITE_SNAPSHOT_INVALIDO');
  let restaurado;
  try{
   // Reconstituir a semantica completa: seis vagas, filas, ciclos,
   // catraca, IDs repetidos, destino financeiro e regras de snapshot.
   restaurado=SimuladorLoop.restaurarSnapshot(JSON.parse(row.snapshot));
  }catch{falha('MOTOR_SQLITE_SNAPSHOT_INVALIDO');}
  const posicoes=[...restaurado.filas.filaA,...restaurado.filas.filaB,
   restaurado.tabuleiro.centro,...restaurado.tabuleiro.vagas,
   ...restaurado.tabuleiro.ciclosConcluidos.map(x=>x.centro)]
   .filter(Boolean);
  const porId=new Map(posicoes.map(p=>[p.id,p]));
  for(const d of registrosDouradas){
   const p=porId.get(d.posicaoId);
   if(!p||p.empresa!==true||p.participanteId!=='LOOP_EMPRESA'||
      p.titularOperacional!=='LOOP_EMPRESA'||
      p.origemOperacional!=='ADMIN_MANUAL_SEM_COMPRA'||
      p.aporteInternoCentavos!==0||p.geradaSemCompra!==true)
    falha('MOTOR_DOURADA_MANUAL_SEM_POSICAO');
   if(banco.prepare([
    'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido',
    'WHERE numero_posicao=?'
   ].join(' ')).get(d.posicaoId).n!==0)
    falha('MOTOR_DOURADA_COM_PEDIDO_INDEVIDO');
  }
 }
 return {presente:true,totalInconsistencias:0,
  snapshotValidado:Boolean(row),lotesOrfaos:0,aceitesOrfaos:0,
  operacoesOrfas:0,douradasManuaisAuditadas:registrosDouradas.length,
  reservasAuditadas,checkpointsAuditados,
  valorRealProvado:false};
}
module.exports={auditarIntegridadeMotorCandidato};
