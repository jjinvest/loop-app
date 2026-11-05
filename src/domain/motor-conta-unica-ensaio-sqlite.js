'use strict';
// Fonte unica do MOTOR DE ENSAIO na MESMA conexao SQLite de contas, loja e admin.
// As operacoes abaixo nao constituem liquidação PSP, adesao, direito ou ganho.
// Bloqueio absoluto em NODE_ENV=production e sem rotas publicas de escrita.
const {SimuladorLoop}=require('./simulador-loop');
const {LIMITE_POSICOES_ATIVAS}=require('./capacidade-posicoes-loop');
const {planejarPosicoesCompraAkitemm}=require('./plano-posicoes-compra-akitemm');
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarAmbiente(){
 if(process.env.NODE_ENV==='production')falha('MOTOR_ENSAIO_PROIBIDO_PRODUCAO');
}
class MotorContaUnicaEnsaioSQLite{
 constructor({banco,sinalizacao,ponte=null,cpf=null,termosVersao=null}={}){
  validarAmbiente();
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     sinalizacao?.db!==banco||
     typeof sinalizacao?.consultarFotografiaPrepedido!=='function'||
     (ponte!==null&&(ponte?.banco!==banco||typeof ponte?.consultar!=='function'))||
     (cpf!==null&&(cpf?.banco!==banco||typeof cpf?.consultar!=='function'))||
     (termosVersao!==null&&(typeof termosVersao!=='string'||!/^LAB-/.test(termosVersao))))
   falha('MOTOR_FONTE_SQLITE_UNICA_OBRIGATORIA');
  this.banco=banco;this.sinalizacao=sinalizacao;this.ponte=ponte;
  this.cpf=cpf;this.termosVersao=termosVersao;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_motor_conta_ensaio_estado(',
   'id INTEGER PRIMARY KEY CHECK(id=1),revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'snapshot TEXT NOT NULL,atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_motor_conta_ensaio_operacoes(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'tipo TEXT NOT NULL,prepedido_id TEXT,',
   'titular_id TEXT,numero_posicao INTEGER,criado_em INTEGER NOT NULL);',
   'CREATE UNIQUE INDEX IF NOT EXISTS idx_motor_ensaio_prepared_once',
   "ON akitemm_motor_conta_ensaio_operacoes(prepedido_id) WHERE tipo='VINCULAR_PEDIDO';",
   'CREATE TABLE IF NOT EXISTS akitemm_motor_ensaio_lotes_pedido(',
   'prepedido_id TEXT NOT NULL,ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 10),',
   'titular_id TEXT NOT NULL,numero_posicao INTEGER NOT NULL UNIQUE,',
   'PRIMARY KEY(prepedido_id,ordinal));',
   'CREATE TABLE IF NOT EXISTS akitemm_motor_ensaio_aceites_posicao(',
   'numero_posicao INTEGER PRIMARY KEY REFERENCES',
   'akitemm_motor_ensaio_lotes_pedido(numero_posicao) ON DELETE RESTRICT,',
   'prepedido_id TEXT NOT NULL,titular_id TEXT NOT NULL,',
   'cpf_hmac TEXT NOT NULL,versao_termos TEXT NOT NULL,',
   'hash_termos TEXT NOT NULL,criado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS motor_ensaio_aceite_sem_update',
   'BEFORE UPDATE ON akitemm_motor_ensaio_aceites_posicao',
   "BEGIN SELECT RAISE(ABORT,'aceite por posicao imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS motor_ensaio_aceite_sem_delete',
   'BEFORE DELETE ON akitemm_motor_ensaio_aceites_posicao',
   "BEGIN SELECT RAISE(ABORT,'aceite por posicao imutavel'); END;",
   'CREATE INDEX IF NOT EXISTS idx_motor_ensaio_giros',
   'ON akitemm_motor_conta_ensaio_operacoes(tipo,criado_em);'
  ].join(' '));
 }
 _simulador(){
  const row=this.banco.prepare('SELECT snapshot FROM akitemm_motor_conta_ensaio_estado WHERE id=1').get();
  return row?SimuladorLoop.restaurarSnapshot(JSON.parse(row.snapshot)):new SimuladorLoop();
 }
 _gravar(sim){
  const snapshot=JSON.stringify(sim.exportarSnapshot());
  this.banco.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_estado',
   '(id,revisao,snapshot,atualizado_em) VALUES(1,1,?,?)',
   'ON CONFLICT(id) DO UPDATE SET revisao=revisao+1,',
   'snapshot=excluded.snapshot,atualizado_em=excluded.atualizado_em'
  ].join(' ')).run(snapshot,Date.now());
 }
 _evento(tipo,{prepedidoId=null,titularId=null,posicaoId=null}={}){
  this.banco.prepare([
   'INSERT INTO akitemm_motor_conta_ensaio_operacoes',
   '(tipo,prepedido_id,titular_id,numero_posicao,criado_em)',
   'VALUES(?,?,?,?,?)'
  ].join(' ')).run(tipo,prepedidoId,titularId,posicaoId,Date.now());
 }
 _transacao(acao){
  validarAmbiente();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const sim=this._simulador();
   const resultado=acao(sim);
   this._gravar(sim);
   this.banco.exec('COMMIT');
   return resultado;
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 _contarAtivas(sim,titularId){
  const estado=sim.estado();
  return [...estado.filas.A.pessoas,...estado.filas.B.pessoas,
   estado.tabuleiro.centro,...estado.tabuleiro.vagas]
   .filter(p=>p&&!p.empresa&&p.participanteId===titularId).length;
 }
 vincularPedido({prepedidoId,aceiteEnsaio,exigirPSPSandbox=false}={}){
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
  if(aceiteEnsaio!==true)falha('CIENCIA_DE_ENSAIO_OBRIGATORIA');
  return this._transacao(sim=>{
   const pedido=this.banco.prepare([
    'SELECT p.prepedido_id AS prepedidoId,p.titular_id AS titularId,',
    'p.total_centavos AS totalCentavos',
    'FROM akitemm_checkout_prepedidos_staging p',
    'JOIN akitemm_conta_unica_candidata a ON a.id=p.titular_id',
    'WHERE p.prepedido_id=?'
   ].join(' ')).get(prepedidoId);
   if(!pedido)falha('PREPEDIDO_SEM_TITULAR_VALIDO');
   const foto=this.sinalizacao.consultarFotografiaPrepedido({
    prepedidoId,titularId:pedido.titularId
   });
   if(foto?.totalCentavos!==pedido.totalCentavos)
    falha('FOTOGRAFIA_HISTORICA_INCONSISTENTE');
   if(exigirPSPSandbox){
    if(!this.ponte||!foto?.planejamentoPosicoes)
     falha('RECONCILIACAO_SANDBOX_NAO_CONFIGURADA');
    // A prova real aqui é somente PSP SANDBOX: aviso bruto não vale.
    // Reconsulta independente RECEIVED, titular, pagamento, valor, histórico
    // e ausência de reversão são reavaliados NA transação de escrita.
    const pagamento=consultarPedido({
     banco:this.banco,prepedidoId,titularId:pedido.titularId
    });
    const ponte=this.ponte.consultar({
     titularId:pedido.titularId,prepedidoId
    });
    if(!pagamento||pagamento.conferenciaPSPConcluida!==true||
       pagamento.exigeRevisaoManual===true||
       pagamento.ultimoStatusPSP!=='RECEIVED'||
       pagamento.valorCentavos!==pedido.totalCentavos||
       ponte?.estado!=='RECEBIMENTO_INFORMADO_SANDBOX'||
       ponte?.valorCentavos!==pedido.totalCentavos||
       ponte?.ultimaConsultaSandbox?.statusAsaas!=='RECEIVED'||
       ponte?.revisaoManualObrigatoria===true||
       !ponte.pagamentoSandboxId)
     falha('PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE');
   }
   // Fotografias anteriores à regra mista seguem estritamente o contrato
   // legado: uma posição verde; nunca reinterpretar pedidos antigos.
   let quantidade=1;
   if(foto?.planejamentoPosicoes){
    const plano=planejarPosicoesCompraAkitemm(foto.itens);
    if(JSON.stringify(plano)!==JSON.stringify(foto.planejamentoPosicoes)||
       !plano.podeVincularEnsaio||
       plano.valorTotalCentavos!==pedido.totalCentavos)
     falha('PLANEJAMENTO_PEDIDO_NAO_QUALIFICA_ENSAIO');
    quantidade=plano.quantidadePosicoesPrevistas;
   }else if(pedido.totalCentavos<25000||
      foto?.referenciaVerdeAtingida!==true||
      foto?.valorVerdeConsideradoCentavos<25000||
      foto?.podeSimularFilaBAzul!==true||foto?.eventoPendente===true){
    falha('PEDIDO_NAO_QUALIFICA_ENSAIO_MOTOR');
   }
   const anterior=this.banco.prepare([
    'SELECT numero_posicao AS posicaoId,titular_id AS titularId',
    'FROM akitemm_motor_conta_ensaio_operacoes',
    "WHERE prepedido_id=? AND tipo='VINCULAR_PEDIDO'"
   ].join(' ')).get(prepedidoId);
   if(anterior){
    if(anterior.titularId!==pedido.titularId)
     falha('INTEGRIDADE_TITULAR_MOTOR');
    const posicoes=this.banco.prepare([
     'SELECT numero_posicao AS id FROM akitemm_motor_ensaio_lotes_pedido',
     'WHERE prepedido_id=? ORDER BY ordinal'
    ].join(' ')).all(prepedidoId).map(p=>p.id);
    if(!posicoes.length)posicoes.push(anterior.posicaoId);
    return {repetido:true,posicaoId:anterior.posicaoId,
     posicoesIds:posicoes,quantidadePosicoes:posicoes.length,
     apenasEnsaio:true,posicoesReais:0,financeiroReal:false};
   }
   if(!TITULAR.test(pedido.titularId))falha('TITULAR_MOTOR_INVALIDO');
   if(!Number.isSafeInteger(quantidade)||quantidade<1||quantidade>LIMITE_POSICOES_ATIVAS||
      this._contarAtivas(sim,pedido.titularId)+quantidade>LIMITE_POSICOES_ATIVAS)
    falha('LIMITE_DEZ_POSICOES_MOTOR_ENSAIO');
   const posicoesIds=[];
   for(let indice=1;indice<=quantidade;indice++){
    const r=sim.registrarPosicaoSimulada({
     participanteId:pedido.titularId,
     vendaId:'ensaio:'+prepedidoId+(indice===1?'':':'+indice),
     adesaoPendente:true
    });
    if(r.repetida)falha('INDICE_PEDIDO_MOTOR_INCONSISTENTE');
    posicoesIds.push(r.posicao.id);
    this.banco.prepare([
     'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
     '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
    ].join(' ')).run(prepedidoId,indice,pedido.titularId,r.posicao.id);
   }
   this._evento('VINCULAR_PEDIDO',{
    prepedidoId,titularId:pedido.titularId,posicaoId:posicoesIds[0]
   });
   return {repetido:false,posicaoId:posicoesIds[0],
    posicoesIds,quantidadePosicoes:posicoesIds.length,
    apenasEnsaio:true,posicoesReais:0,financeiroReal:false};
  });
 }
 // Esta via AUTOMATIZAVEL é permitida só quando o PSP sandbox
 // previamente reconsultado e a fotografia versionada continuam válidos.
 // Registra posições azuis/pendentes, nunca as confirma ou paga.
 vincularPedidoConferidoSandbox({prepedidoId}={}){
  if(!this.ponte)falha('RECONCILIACAO_SANDBOX_NAO_CONFIGURADA');
  return this.vincularPedido({prepedidoId,aceiteEnsaio:true,
   exigirPSPSandbox:true});
 }
 // Um estorno/chargeback comprovado pelo GET PSP coloca o lote em
 // REVISAO, conserva seu historico e impede alimentacao e giro indevidos.
 // Nunca ressuscitar automaticamente posicoes apos reembolso.
 suspenderLoteRevertidoSandbox({prepedidoId}={}){
  if(!this.ponte||typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('REVERSAO_SANDBOX_INVALIDA');
  return this._transacao(sim=>{
   const pedido=this.banco.prepare([
    'SELECT titular_id AS titularId FROM akitemm_checkout_prepedidos_staging',
    'WHERE prepedido_id=?'
   ].join(' ')).get(prepedidoId);
   if(!pedido)falha('PREPEDIDO_SEM_TITULAR_VALIDO');
   const ponte=this.ponte.consultar({
    titularId:pedido.titularId,prepedidoId
   });
   if(ponte?.estado!=='REVERSAO_INFORMADA_SANDBOX')
    falha('REVERSAO_PSP_NAO_CONCILIADA');
   const posicoes=this.banco.prepare([
    'SELECT numero_posicao AS id FROM akitemm_motor_ensaio_lotes_pedido',
    'WHERE prepedido_id=?'
   ].join(' ')).all(prepedidoId);
   const ids=new Set(posicoes.map(p=>p.id));
   if(!ids.size)return {suspensas:0,semLote:true,somenteEnsaio:true};
   const presentes=[...sim.filas.filaA,...sim.filas.filaB,
    sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
   let alteradas=0;
   for(const p of presentes){
    if(ids.has(p.id)&&p.participanteId===pedido.titularId&&
       p.statusAdesao!=='REVISAR_PSP'){
     p.statusAdesao='REVISAR_PSP';alteradas++;
    }
   }
   if(alteradas){
    sim.pausarCatraca();
    this._evento('REVERSAO_PSP',{prepedidoId,titularId:pedido.titularId});
   }
   return {suspensas:alteradas,semLote:false,somenteEnsaio:true,
    catracaPausada:alteradas>0,financeiroReal:false};
  });
 }
 // Confirmacao INDIVIDUAL em ensaio da posicao PENDENTE (azul).
 // Exige CPF ja protegido por titular, aceite explicito na posicao,
 // versao vigente dos termos e prova PSP reconsultada; nao valida KYC externo.
 registrarAceitePosicaoEnsaio({titularId,posicaoId,versaoTermos,aceiteExplicito=false}={}){
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     !Number.isSafeInteger(posicaoId)||posicaoId<1||
     aceiteExplicito!==true||
     typeof versaoTermos!=='string'||versaoTermos!==this.termosVersao)
   falha('ACEITE_POSICAO_DADOS_INVALIDOS');
  if(!this.cpf||!this.ponte||!this.termosVersao)
   falha('ACEITE_POSICAO_ENSAIO_INDISPONIVEL');
  return this._transacao(sim=>{
   const vinculo=this.banco.prepare([
    'SELECT prepedido_id AS prepedidoId FROM akitemm_motor_ensaio_lotes_pedido',
    'WHERE numero_posicao=? AND titular_id=?'
   ].join(' ')).get(posicaoId,titularId);
   if(!vinculo)falha('POSICAO_NAO_PERTENCE_A_CONTA');
   const pagamento=consultarPedido({
    banco:this.banco,prepedidoId:vinculo.prepedidoId,titularId
   });
   const provedor=this.ponte.consultar({prepedidoId:vinculo.prepedidoId,titularId});
   if(pagamento?.conferenciaPSPConcluida!==true||
      pagamento.exigeRevisaoManual===true||
      pagamento.ultimoStatusPSP!=='RECEIVED'||
      provedor?.estado!=='RECEBIMENTO_INFORMADO_SANDBOX'||
      provedor?.ultimaConsultaSandbox?.statusAsaas!=='RECEIVED'||
      provedor?.revisaoManualObrigatoria===true)
    falha('PSP_SANDBOX_NAO_CONFIRMADO_PARA_ACEITE');
   const identidade=this.cpf.consultar({titularId});
   if(!identidade||identidade.termosVersao!==this.termosVersao||
      identidade.estado!=='NAO_VERIFICADA_EXTERNAMENTE')
    falha('CPF_E_TERMOS_TITULAR_AUSENTES_OU_DIVERGENTES');
   const r=this.banco.prepare([
    'SELECT cpf_hmac AS cpfHash,termos_versao AS versao,',
    'termos_sha256 AS hashTermos',
    'FROM akitemm_candidato_titularidade_unificada WHERE titular_id=?'
   ].join(' ')).get(titularId);
   if(!r||r.versao!==this.termosVersao||
      r.hashTermos!==identidade.termosSha256)
    falha('CUSTODIA_TERMO_INVALIDA');
   const posicao=[...sim.filas.filaA,...sim.filas.filaB,
    sim.tabuleiro.centro,...sim.tabuleiro.vagas].find(p=>p?.id===posicaoId);
   if(!posicao||posicao.empresa===true||posicao.participanteId!==titularId)
    falha('POSICAO_NAO_PERTENCE_A_CONTA');
   if(posicao.statusAdesao==='REVISAR_PSP')
    falha('POSICAO_COM_PSP_EM_REVISAO');
   const anterior=this.banco.prepare([
    'SELECT prepedido_id AS prepedidoId,titular_id AS titularId,',
    'cpf_hmac AS cpfHash,versao_termos AS versao,hash_termos AS hashTermos',
    'FROM akitemm_motor_ensaio_aceites_posicao WHERE numero_posicao=?'
   ].join(' ')).get(posicaoId);
   if(anterior){
    if(anterior.titularId!==titularId||anterior.prepedidoId!==vinculo.prepedidoId||
       anterior.cpfHash!==r.cpfHash||anterior.versao!==r.versao||
       anterior.hashTermos!==r.hashTermos||
       posicao.statusAdesao!=='ACEITE_ENSAIO')
     falha('ACEITE_POSICAO_HISTORICO_DIVERGENTE');
    return {repetido:true,posicaoId,aceiteIndividualRegistrado:true,
     identidadeExternaVerificada:false,criouDireitoReal:false};
   }
   if(posicao.statusAdesao!=='PENDENTE')falha('POSICAO_NAO_PENDENTE');
   const criadoEm=new Date().toISOString();
   this.banco.prepare([
    'INSERT INTO akitemm_motor_ensaio_aceites_posicao',
    '(numero_posicao,prepedido_id,titular_id,cpf_hmac,versao_termos,hash_termos,criado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(posicaoId,vinculo.prepedidoId,titularId,
    r.cpfHash,r.versao,r.hashTermos,criadoEm);
   posicao.statusAdesao='ACEITE_ENSAIO';
   sim.filas.liberarEscalonadas(sim.tabuleiro);
   this._evento('ACEITE_POSICAO_ENSAIO',{
    prepedidoId:vinculo.prepedidoId,titularId,posicaoId
   });
   return {repetido:false,posicaoId,aceiteIndividualRegistrado:true,
    identidadeExternaVerificada:false,criouDireitoReal:false,
    permissoesFinanceiras:false};
  });
 }
 prepararTabuleiro(){
  return this._transacao(sim=>{
   if(sim.tabuleiro.iniciado)falha('CICLO_MOTOR_ENSAIO_JA_INICIADO');
   const e=sim.prepararTabuleiro();
   this._evento('PREPARAR_TABULEIRO');
   return {preparado:true,ocupadas:[e.centro,...e.vagas].filter(Boolean).length,
    somenteEnsaio:true};
  });
 }
 registrarEvento({prepedidoId}={}){
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
  return this._transacao(sim=>{
   const origem=this.banco.prepare([
    'SELECT titular_id FROM akitemm_motor_conta_ensaio_operacoes',
    "WHERE prepedido_id=? AND tipo='VINCULAR_PEDIDO'"
   ].join(' ')).get(prepedidoId);
   if(!origem)falha('PEDIDO_FORA_DO_MOTOR_ENSAIO');
   if(this.ponte&&this.banco.prepare([
    "SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes WHERE prepedido_id=? AND tipo='REVERSAO_PSP'"
   ].join(' ')).get(prepedidoId))falha('PEDIDO_EM_REVISAO_PSP');
   const resultado=sim.registrarVendaNoCicloSimulada({vendaId:'ensaio:'+prepedidoId});
   if(!resultado.repetida)this._evento('EVENTO_CICLO',{titularId:origem.titular_id});
   return {repetido:resultado.repetida,eventosNoCiclo:resultado.estado.vendasNoCiclo,
    prontoParaGiro:resultado.estado.elegivelParaGiro,
    dinheiroReal:false,somenteEnsaio:true};
  });
 }
 controlarCatraca(acao){
  if(!['ABRIR','PAUSAR','GIRAR'].includes(acao))falha('ACAO_CATRACA_INVALIDA');
  return this._transacao(sim=>{
   let r;
   if(acao==='ABRIR')r=sim.abrirCatraca();
   if(acao==='PAUSAR')r=sim.pausarCatraca();
   if(acao==='GIRAR'&&[sim.tabuleiro.centro,...sim.tabuleiro.vagas].some(p=>
     p?.statusAdesao==='REVISAR_PSP'))falha('CATRACA_BLOQUEADA_PSP_EM_REVISAO');
   if(acao==='GIRAR')r=sim.tentarGiro();
   if(acao==='GIRAR'&&!r.girou)
    return {girou:false,motivo:r.motivo,somenteEnsaio:true,
     creditoReal:false};
   this._evento(acao==='GIRAR'?'GIRO':acao);
   return {girou:acao==='GIRAR',somenteEnsaio:true,creditoReal:false};
  });
 }
 consultar({titularId=null}={}){
  validarAmbiente();
  if(titularId!==null){
   if(typeof titularId!=='string'||!TITULAR.test(titularId))
    falha('TITULAR_MOTOR_INVALIDO');
   if(!this.banco.prepare(
    'SELECT 1 FROM akitemm_conta_unica_candidata WHERE id=?'
   ).get(titularId))falha('TITULAR_MOTOR_INEXISTENTE');
  }
  const sim=this._simulador();
  const estado=sim.estado();
  const visual=p=>p?{
   numero:p.id,
   minha:p.participanteId===titularId&&p.empresa!==true,
   pendente:p.statusAdesao==='PENDENTE'&&p.empresa!==true,
   dourada:p.empresa===true,
   // Nao enviar nome, UUID, nick nem CPF de outros participantes.
   status:p.empresa===true?'EMPRESA':p.statusAdesao==='REVISAR_PSP'?'REVISAO_PSP':p.statusAdesao==='PENDENTE'?'PENDENTE':p.statusAdesao==='ACEITE_ENSAIO'?'ACEITE_ENSAIO':'ENSAIO',
   aceiteEnsaio:p.participanteId===titularId&&p.statusAdesao==='ACEITE_ENSAIO'
  }:null;
  const ativas=[
   ...estado.filas.A.pessoas.map(p=>({...p,local:'FILA',fila:'A'})),
   ...estado.filas.B.pessoas.map(p=>({...p,local:'FILA',fila:'B'})),
   ...(estado.tabuleiro.centro?[{...estado.tabuleiro.centro,local:'CENTRO'}]:[]),
   ...estado.tabuleiro.vagas.flatMap((p,i)=>p?[{...p,local:'VAGA_'+(i+1)}]:[])
  ];
  const minhas=titularId===null?[]:ativas
   .filter(p=>p.participanteId===titularId&&p.empresa!==true)
   .map(p=>({numero:p.id,local:p.local,
    fila:p.fila||null,pendente:p.statusAdesao==='PENDENTE',
    aceiteIndividualRegistrado:p.statusAdesao==='ACEITE_ENSAIO',
    estado:p.statusAdesao==='REVISAR_PSP'?'ENSAIO_EM_REVISAO_PSP':
     p.statusAdesao==='ACEITE_ENSAIO'?'ACEITE_ENSAIO_SEM_DIREITO':'ENSAIO_SEM_DIREITO'}));
  const giros24h=this.banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes',
   "WHERE tipo='GIRO' AND criado_em>=?"
  ].join(' ')).get(Date.now()-86400000).n;
  return {origem:'MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA',
   laboratorio:true,autorizacaoComercial:false,
   dinheiroReal:false,posicoesReais:0,saldoRealCentavos:null,
   limitePosicoesAtivas:LIMITE_POSICOES_ATIVAS,limitePorTitularTabuleiro:2,
   ordemAlimentacao:'3A:1B',eventosPorCiclo:6,
   filaA:estado.filas.A.pessoas.map(visual),
   filaB:estado.filas.B.pessoas.map(visual),
   tabuleiro:{centro:visual(estado.tabuleiro.centro),
    vagas:estado.tabuleiro.vagas.map(visual),
    eventosNoCiclo:estado.tabuleiro.vendasNoCiclo,
    preparadoParaGiro:estado.tabuleiro.elegivelParaGiro,
    ciclosConcluidos:estado.tabuleiro.ciclosConcluidos},
   catraca:{estado:estado.catraca.status,giros:estado.catraca.giros,giros24h},
   minhasPosicoes:minhas,pendentesDeEnsaio:minhas.filter(p=>p.pendente).length,
   posicoesAtivasDoTitular:minhas.length,
   status:'SEM_PAGAMENTO_OU_ATIVACAO_REAL'};
 }
}
module.exports={MotorContaUnicaEnsaioSQLite};
