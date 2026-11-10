'use strict';
// Compra especial de ENSAIO: 1 pedido -> N posicoes (verde, dourada, roxa).
// A venda fornece apenas um evento luminoso, independente das posicoes geradas.
// Usa o mesmo SQLite e mesmo motor; nenhum credito ou pagamento real.
const {createHash,createHmac}=require('node:crypto');
const {PreflightCapacidadeCheckoutSQLite}=require('./preflight-capacidade-checkout-sqlite');
const TABELAS_LOTES_ENSAIO=Object.freeze([
 'loop_real_promocoes_lotes_ensaio',
 'loop_real_promocoes_lotes_posicoes_ensaio',
 'loop_real_aceites_lotes_ensaio',
 'loop_real_reversoes_lotes_ensaio'
]);
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function cpfValido(cpf){
 if(typeof cpf!=='string'||!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;
 const a=[...cpf].map(Number);
 for(let n=9;n<11;n++){
  const z=a.slice(0,n).reduce((sum,v,i)=>sum+v*(n+1-i),0);
  const d=(z*10)%11;
  if(a[n]!==((d===10)?0:d))return false;
 }
 return true;
}
class PromocaoLotesEnsaioSQLite{
 constructor({banco,motor,classificacaoLoop,aceiteAzul=null,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')falha('LOTE_ENSAIO_PROIBIDO_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    motor?.banco!==banco||classificacaoLoop?.db!==banco||
    typeof motor.registrarCompraConciliadaEnsaioEmTransacao!=='function'||
    typeof classificacaoLoop.avaliarPedido!=='function'||
    (aceiteAzul!==null&&(aceiteAzul.db!==banco||
     typeof aceiteAzul.confirmar!=='function'))||
    typeof agora!=='function')falha('LOTE_ENSAIO_EXIGE_MOTOR_UNIFICADO');
  this.db=banco;this.motor=motor;this.classificacao=classificacaoLoop;
  this.aceiteAzul=aceiteAzul;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_promocoes_lotes_ensaio(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loop_real_eventos_comerciais(pedido_id)',
   'ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'pagamento_id TEXT NOT NULL UNIQUE,prova_ensaio_id TEXT NOT NULL UNIQUE,',
   'valor_total_centavos INTEGER NOT NULL,',
   'valor_produtos_centavos INTEGER NOT NULL,',
   'posicoes INTEGER NOT NULL CHECK(posicoes>=1 AND posicoes<=10),',
   'criado_em INTEGER NOT NULL CHECK(criado_em>0));',
   'CREATE TABLE IF NOT EXISTS loop_real_promocoes_lotes_posicoes_ensaio(',
   'pedido_id TEXT NOT NULL REFERENCES loop_real_promocoes_lotes_ensaio(pedido_id)',
   'ON DELETE RESTRICT,ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 10),',
   "tipo TEXT NOT NULL CHECK(tipo IN ('VERDE','DOURADO','ROXO')),",
   'venda_interna_id TEXT NOT NULL UNIQUE,',
   'posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),',
   'PRIMARY KEY(pedido_id,ordinal));',
   'CREATE TABLE IF NOT EXISTS loop_real_aceites_lotes_ensaio(',
   'posicao_id INTEGER PRIMARY KEY REFERENCES',
   'loop_real_promocoes_lotes_posicoes_ensaio(posicao_id) ON DELETE RESTRICT,',
   'cpf_hmac TEXT NOT NULL,termos_versao TEXT NOT NULL,',
   'termos_hash TEXT NOT NULL,criado_em INTEGER NOT NULL CHECK(criado_em>0));',
   'CREATE TABLE IF NOT EXISTS loop_real_reversoes_lotes_ensaio(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loop_real_promocoes_lotes_ensaio(pedido_id)',
   'ON DELETE RESTRICT,registrado_em INTEGER NOT NULL CHECK(registrado_em>0));',
   'CREATE TRIGGER IF NOT EXISTS loop_lote_posicao_imutavel_u',
   'BEFORE UPDATE ON loop_real_promocoes_lotes_posicoes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_POSICAO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lote_posicao_imutavel_d',
   'BEFORE DELETE ON loop_real_promocoes_lotes_posicoes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_POSICAO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lote_aceite_imutavel_u',
   'BEFORE UPDATE ON loop_real_aceites_lotes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_ACEITE_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lote_aceite_imutavel_d',
   'BEFORE DELETE ON loop_real_aceites_lotes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_ACEITE_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lote_reversao_imutavel_u',
   'BEFORE UPDATE ON loop_real_reversoes_lotes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_REVERSAO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_lote_reversao_imutavel_d',
   'BEFORE DELETE ON loop_real_reversoes_lotes_ensaio BEGIN',
   "SELECT RAISE(ABORT,'LOTE_REVERSAO_IMUTAVEL'); END;"
  ].join(' '));
 }
 _ensaio(){if(process.env.NODE_ENV==='production')falha('LOTE_ENSAIO_PROIBIDO_PRODUCAO');}
 _ts(){const x=this.agora();if(!Number.isSafeInteger(x)||x<1)falha('LOTE_RELOGIO_INVALIDO');return x;}
 _interno(pedidoId,ordinal){
  if(ordinal===1)return pedidoId;
  return 'lote_'+createHash('sha256').update(pedidoId+'\0'+ordinal)
   .digest('hex').slice(0,44)+'_'+ordinal;
 }
 _plano(cor){
  const tipos=[
   ...Array(cor.posicoesVerdesPrevistas).fill('VERDE'),
   ...Array(cor.posicoesDouradasPrevistas).fill('DOURADO'),
   ...Array(cor.posicoesRoxasConfiguradas).fill('ROXO')
  ];
  if(tipos.length!==cor.totalPosicoesMistasPrevistas)
   falha('LOTE_CLASSIFICACAO_DIVERGENTE');
  if(tipos.length<1||tipos.length>10||cor.ultrapassaDezPorCompra)
   falha('LOTE_QUANTIDADE_INVALIDA');
  return tipos;
 }
 _pedido(pedidoId,pagamentoId,valorCentavos){
  const row=this.db.prepare([
   'SELECT e.pedido_id,e.titular_id,e.pagamento_id,e.estado,',
   'e.valor_total_centavos,e.valor_produtos_centavos,',
   'p.status AS status_pedido,p.pagamento_id AS pagamento_pedido,',
   'p.titular_id AS titular_pedido',
   'FROM loop_real_eventos_comerciais e',
   'JOIN loja_real_pedidos p ON p.pedido_id=e.pedido_id',
   'WHERE e.pedido_id=?'
  ].join(' ')).get(pedidoId);
  if(!row||row.estado!=='AGUARDANDO_CONCILIACAO'||
    row.status_pedido!=='APROVADO_PARA_EXPEDICAO')
   falha('LOTE_SEM_VENDA_CONFIRMADA');
  if(row.pagamento_id!==pagamentoId||row.pagamento_pedido!==pagamentoId||
    row.valor_total_centavos!==valorCentavos||
    row.titular_id!==row.titular_pedido||!TITULAR.test(row.titular_id)||
    row.valor_produtos_centavos<25000)
   falha('LOTE_PEDIDO_PSP_DIVERGENTE');
  return row;
 }
 _posicoes(pedidoId){
  return this.db.prepare([
   'SELECT posicao_id AS posicaoId,ordinal,tipo,',
   'venda_interna_id AS vendaInternaId',
   'FROM loop_real_promocoes_lotes_posicoes_ensaio',
   'WHERE pedido_id=? ORDER BY ordinal ASC'
  ].join(' ')).all(pedidoId);
 }
 aprovarEEnfileirarEmEnsaio({
  pedidoId,pagamentoId,valorCentavos,provaEnsaioId,autorizadoEnsaio=false
 }={}){
  this._ensaio();
  if(autorizadoEnsaio!==true||!ID.test(pedidoId||'')||
    !ID.test(pagamentoId||'')||!ID.test(provaEnsaioId||'')||
    !Number.isSafeInteger(valorCentavos)||valorCentavos<25000)
   falha('LOTE_ENSAIO_COMPROVACAO_INVALIDA');
  if(this.db.isTransaction)falha('LOTE_ENSAIO_TRANSACAO_EXTERNA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this._pedido(pedidoId,pagamentoId,valorCentavos);
   const cor=this.classificacao.avaliarPedido({pedidoId});
   const tipos=this._plano(cor);
   // Legado VERDE puro continua no livro antigo, sem segunda promocao.
   if(tipos.length===1&&tipos[0]==='VERDE')
    falha('LOTE_VERDE_PURO_USAR_PONTE_EXISTENTE');
   const antigo=this.db.prepare(
    'SELECT * FROM loop_real_promocoes_lotes_ensaio WHERE pedido_id=?'
   ).get(pedidoId);
   if(antigo){
    if(antigo.pagamento_id!==pagamentoId||
       antigo.prova_ensaio_id!==provaEnsaioId||
       antigo.titular_id!==row.titular_id||
       antigo.posicoes!==tipos.length||
       antigo.valor_total_centavos!==valorCentavos)
     falha('LOTE_REPLAY_DIVERGENTE');
    const posicoes=this._posicoes(pedidoId);
    if(posicoes.length!==tipos.length||
       posicoes.some((p,i)=>p.tipo!==tipos[i]))
     falha('LOTE_REPLAY_LIVRO_DIVERGENTE');
    this.db.exec('COMMIT');
    return {repetida:true,posicoes,quantidade:posicoes.length,financeiroReal:false};
   }
   if(this.db.prepare(
    'SELECT 1 FROM loop_real_promocoes_pedido_ensaio WHERE pedido_id=?'
   ).get(pedidoId)||this.db.prepare(
    'SELECT 1 FROM loop_real_motor_compras WHERE pedido_id=?'
   ).get(pedidoId))
    falha('LOTE_PEDIDO_JA_USADO');
   if(this.db.prepare(
    'SELECT 1 FROM loop_real_promocoes_lotes_ensaio WHERE prova_ensaio_id=?'
   ).get(provaEnsaioId))falha('LOTE_PROVA_JA_USADA');
   const ativos=this.motor.consultar({titularId:row.titular_id})
    .minhasPosicoes.length;
   if(ativos+tipos.length>10)falha('LOTE_EXCEDE_DEZ_POSICOES_ATIVAS');
   const ids=[];
   for(let i=0;i<tipos.length;i++){
    const interno=this._interno(pedidoId,i+1);
    const res=this.motor.registrarCompraConciliadaEnsaioEmTransacao({
     titularId:row.titular_id,pedidoId:interno,
     valorCentavos:row.valor_produtos_centavos
    });
    if(res.repetida)falha('LOTE_POSICAO_DUPLICADA');
    ids.push({posicaoId:res.posicaoId,ordinal:i+1,tipo:tipos[i],
     vendaInternaId:interno});
   }
   this.db.prepare([
    'INSERT INTO loop_real_promocoes_lotes_ensaio',
    '(pedido_id,titular_id,pagamento_id,prova_ensaio_id,',
    'valor_total_centavos,valor_produtos_centavos,posicoes,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' ')).run(pedidoId,row.titular_id,pagamentoId,
    provaEnsaioId,valorCentavos,row.valor_produtos_centavos,
    tipos.length,this._ts());
   const inserir=this.db.prepare([
    'INSERT INTO loop_real_promocoes_lotes_posicoes_ensaio',
    '(pedido_id,ordinal,tipo,venda_interna_id,posicao_id)',
    'VALUES(?,?,?,?,?)'
   ].join(' '));
   for(const x of ids)inserir.run(pedidoId,x.ordinal,x.tipo,
    x.vendaInternaId,x.posicaoId);
   // O azul e individual. Atualizar todas as copias no snapshot no MESMO commit.
   const foto=JSON.parse(this.db.prepare(
    'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
   ).get().snapshot);
   for(const x of ids){
    const p=foto.filas.filaB.find(p=>p.id===x.posicaoId);
    const v=foto.filas.vendasRegistradas.find(v=>v[0]===x.vendaInternaId)?.[1];
    if(!p||!v||p.participanteId!==row.titular_id||
       v.id!==x.posicaoId)falha('LOTE_POSICAO_AZUL_DIVERGENTE');
    p.statusAdesao='PENDENTE';v.statusAdesao='PENDENTE';
    p.classeProdutoOrigem=x.tipo;v.classeProdutoOrigem=x.tipo;
   }
   this.db.prepare(
    'UPDATE loop_real_motor_estado SET revisao=revisao+1,snapshot=? WHERE id=1'
   ).run(JSON.stringify(foto));
   // Um pedido com N posicoes consome a reserva de N exatamente uma vez.
   PreflightCapacidadeCheckoutSQLite.consumirEmTransacao(this.db,{
    pedidoId,quantidade:ids.length
   });
   this.verificar();
   this.db.exec('COMMIT');
   return {repetida:false,posicoes:ids,quantidade:ids.length,
    aguardaCpfTermos:true,financeiroReal:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _snapshotMudar({vendaInternaId,posicaoId,titularId,novo,exigirFila}){
  if(!this.db.isTransaction)falha('LOTE_SNAPSHOT_EXIGE_TRANSACAO');
  const row=this.db.prepare('SELECT snapshot FROM loop_real_motor_estado WHERE id=1').get();
  if(!row)falha('LOTE_SNAPSHOT_INEXISTENTE');
  const s=JSON.parse(row.snapshot);
  const vivos=[...s.filas.filaA,...s.filas.filaB,s.tabuleiro.centro,...s.tabuleiro.vagas]
   .filter(Boolean);
  const v=s.filas.vendasRegistradas.find(x=>x[0]===vendaInternaId)?.[1];
  const p=vivos.find(x=>x.id===posicaoId);
  if(!v||v.id!==posicaoId||v.participanteId!==titularId)
   falha('LOTE_SNAPSHOT_DIVERGENTE');
  if(novo==='ACEITE_ENSAIO'){
   if(!p||p.empresa===true||
      ![...s.filas.filaA,...s.filas.filaB].some(x=>x.id===posicaoId))
    falha('AZUL_PRAZO_DE_CONFIRMACAO_ENCERRADO');
   if(v.statusAdesao!=='PENDENTE'||p.statusAdesao!=='PENDENTE')
    falha('LOTE_AZUL_ESTADO_INCONSISTENTE');
  }
  if(exigirFila&&(!p||p.empresa===true))
   falha('LOTE_POSICAO_FORA_DA_FILA');
  if(p&&p.empresa!==true&&
    ['PENDENTE','ACEITE_ENSAIO'].includes(p.statusAdesao))p.statusAdesao=novo;
  if(['PENDENTE','ACEITE_ENSAIO'].includes(v.statusAdesao))v.statusAdesao=novo;
  this.db.prepare(
   'UPDATE loop_real_motor_estado SET revisao=revisao+1,snapshot=? WHERE id=1'
  ).run(JSON.stringify(s));
 }
 confirmarAzul({titularId,posicaoId,cpf,versaoTermos,hashTermos,
  aceiteExplicito=false}={}){
  this._ensaio();
  if(!TITULAR.test(titularId||'')||!Number.isSafeInteger(posicaoId)||
    posicaoId<1||!cpfValido(cpf)||aceiteExplicito!==true||
    typeof versaoTermos!=='string'||typeof hashTermos!=='string')
   falha('AZUL_CPF_OU_ACEITE_INVALIDO');
  if(!this.aceiteAzul?.chave)
   falha('AZUL_CPF_ENSAIO_SEM_CHAVE');
  if(this.db.isTransaction)falha('LOTE_TRANSACAO_EXTERNA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.db.prepare([
    'SELECT l.titular_id,l.pedido_id,l.pagamento_id,e.estado,',
    'p.venda_interna_id',
    'FROM loop_real_promocoes_lotes_posicoes_ensaio p',
    'JOIN loop_real_promocoes_lotes_ensaio l ON l.pedido_id=p.pedido_id',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=l.pedido_id',
    'WHERE p.posicao_id=? AND l.titular_id=?'
   ].join(' ')).get(posicaoId,titularId);
   if(!row)falha('AZUL_POSICAO_NAO_PERTENCE_A_CONTA');
   if(row.estado!=='AGUARDANDO_CONCILIACAO')falha('AZUL_PSP_EM_REVISAO');
   const conta=this.db.prepare(
    'SELECT termos_versao,termos_hash,email_confirmado_em FROM loop_real_contas WHERE id=?'
   ).get(titularId);
   if(!conta?.email_confirmado_em||conta.termos_versao!==versaoTermos||
      conta.termos_hash!==hashTermos)
    falha('AZUL_TERMOS_OU_EMAIL_INVALIDOS');
   const hmac=createHmac('sha256',this.aceiteAzul.chave)
    .update('LOOP_AZUL_ENSAIO_CPF_V1:'+cpf).digest('hex');
   const anterior=this.db.prepare(
    'SELECT * FROM loop_real_aceites_lotes_ensaio WHERE posicao_id=?'
   ).get(posicaoId);
   if(anterior){
    if(anterior.cpf_hmac!==hmac||anterior.termos_versao!==versaoTermos||
       anterior.termos_hash!==hashTermos)falha('AZUL_ACEITE_REPLAY_DIVERGENTE');
    this.db.exec('COMMIT');
    return {repetido:true,posicaoId,estado:'ACEITE_ENSAIO',financeiroReal:false};
   }
   this._snapshotMudar({vendaInternaId:row.venda_interna_id,
    posicaoId,titularId,novo:'ACEITE_ENSAIO',exigirFila:true});
   this.db.prepare([
    'INSERT INTO loop_real_aceites_lotes_ensaio',
    '(posicao_id,cpf_hmac,termos_versao,termos_hash,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(posicaoId,hmac,versaoTermos,hashTermos,this._ts());
   this.db.exec('COMMIT');
   return {repetido:false,posicaoId,estado:'ACEITE_ENSAIO',
    identidadeExternaVerificada:false,financeiroReal:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 suspenderReversao({pedidoId,autorizadoEnsaio=false}={}){
  this._ensaio();
  if(!ID.test(pedidoId||'')||autorizadoEnsaio!==true)
   falha('LOTE_REVERSAO_NAO_AUTORIZADA');
  if(this.db.isTransaction)falha('LOTE_TRANSACAO_EXTERNA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const p=this.db.prepare([
    'SELECT l.titular_id,e.estado FROM loop_real_promocoes_lotes_ensaio l',
    'JOIN loop_real_eventos_comerciais e ON e.pedido_id=l.pedido_id',
    'WHERE l.pedido_id=?'
   ].join(' ')).get(pedidoId);
   if(!p||p.estado!=='CANCELADO')falha('LOTE_REVERSAO_SEM_PSP');
   if(this.db.prepare(
    'SELECT 1 FROM loop_real_reversoes_lotes_ensaio WHERE pedido_id=?'
   ).get(pedidoId)){
    this.db.exec('COMMIT');
    return {repetido:true,estado:'REVISAR_PSP',financeiroReal:false};
   }
   for(const x of this._posicoes(pedidoId)){
    this._snapshotMudar({vendaInternaId:x.vendaInternaId,
     posicaoId:x.posicaoId,titularId:p.titular_id,novo:'REVISAR_PSP',
     exigirFila:false});
   }
   this.db.prepare(
    'INSERT INTO loop_real_reversoes_lotes_ensaio(pedido_id,registrado_em) VALUES(?,?)'
   ).run(pedidoId,this._ts());
   this.db.exec('COMMIT');
   return {repetido:false,estado:'REVISAR_PSP',
    posicoesEmRevisao:this._posicoes(pedidoId).length,financeiroReal:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 verificar(){
  const lotes=this.db.prepare([
   'SELECT l.*,e.titular_id AS titular_evento,',
   'e.pagamento_id AS pagamento_evento,e.valor_total_centavos AS valor_evento,',
   'e.valor_produtos_centavos AS produtos_evento',
   'FROM loop_real_promocoes_lotes_ensaio l',
   'JOIN loop_real_eventos_comerciais e ON e.pedido_id=l.pedido_id'
  ].join(' ')).all();
  const fila=this.db.prepare(
   'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
  ).get();
  const snapshot=fila?JSON.parse(fila.snapshot):null;
  const indice=new Map(snapshot?.filas?.vendasRegistradas||[]);
  const vivos=snapshot?[...snapshot.filas.filaA,...snapshot.filas.filaB,
   snapshot.tabuleiro.centro,...snapshot.tabuleiro.vagas].filter(Boolean):[];
  const aceitos=new Set(this.db.prepare(
   'SELECT posicao_id FROM loop_real_aceites_lotes_ensaio'
  ).all().map(x=>x.posicao_id));
  const revertidos=new Set();
  for(const x of this.db.prepare([
   'SELECT r.pedido_id,e.estado FROM loop_real_reversoes_lotes_ensaio r',
   'JOIN loop_real_eventos_comerciais e ON e.pedido_id=r.pedido_id'
  ].join(' ')).all()){
   if(x.estado!=='CANCELADO')falha('LOTE_REVERSAO_SEM_CANCELAMENTO');
   revertidos.add(x.pedido_id);
  }
  let total=0,aceites=0;
  for(const l of lotes){
   const ps=this._posicoes(l.pedido_id);
   const regra=this.classificacao.avaliarPedido({pedidoId:l.pedido_id});
   const tipos=this._plano(regra);
   if(l.titular_id!==l.titular_evento||
      l.pagamento_id!==l.pagamento_evento||
      l.valor_total_centavos!==l.valor_evento||
      l.valor_produtos_centavos!==l.produtos_evento||
      l.posicoes!==ps.length||ps.length!==tipos.length||
      ps.some((x,i)=>x.ordinal!==i+1||x.tipo!==tipos[i]||
       x.vendaInternaId!==this._interno(l.pedido_id,i+1)))
    falha('LOTE_LIVRO_COMERCIAL_DIVERGENTE');
   for(const x of ps){
    const m=this.db.prepare(
     'SELECT titular_id,posicao_id FROM loop_real_motor_compras WHERE pedido_id=?'
    ).get(x.vendaInternaId);
    const origem=indice.get(x.vendaInternaId);
    const estadoEsperado=revertidos.has(l.pedido_id)?'REVISAR_PSP':
     aceitos.has(x.posicaoId)?'ACEITE_ENSAIO':'PENDENTE';
    if(!m||m.posicao_id!==x.posicaoId||m.titular_id!==l.titular_id||
       !origem||origem.id!==x.posicaoId||
       origem.participanteId!==l.titular_id||
       origem.classeProdutoOrigem!==x.tipo||
       origem.statusAdesao!==estadoEsperado)
     falha('LOTE_LIVRO_MOTOR_DIVERGENTE');
    const vivo=vivos.find(v=>v.id===x.posicaoId);
    if(vivo){
     const assumida=vivo.empresa===true&&
      vivo.statusAdesao==='PRAZO_ENCERRADO'&&
      vivo.titularOperacional==='LOOP_EMPRESA'&&
      vivo.motivoAssuncao==='SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6';
     if(vivo.participanteId!==l.titular_id||
        vivo.classeProdutoOrigem!==x.tipo||
        (vivo.statusAdesao!==estadoEsperado&&!assumida))
      falha('LOTE_POSICAO_MOVIMENTO_OU_ACEITE_DIVERGENTE');
    }
   }
   total+=ps.length;
  }
  for(const a of this.db.prepare([
   'SELECT a.*,p.pedido_id,l.titular_id,',
   'c.termos_versao AS versao_c,c.termos_hash AS hash_c',
   'FROM loop_real_aceites_lotes_ensaio a',
   'JOIN loop_real_promocoes_lotes_posicoes_ensaio p ON p.posicao_id=a.posicao_id',
   'JOIN loop_real_promocoes_lotes_ensaio l ON l.pedido_id=p.pedido_id',
   'JOIN loop_real_contas c ON c.id=l.titular_id'
  ].join(' ')).all()){
   if(a.termos_versao!==a.versao_c||
      a.termos_hash!==a.hash_c||
      !/^[a-f0-9]{64}$/.test(a.cpf_hmac))
    falha('LOTE_ACEITE_DIVERGENTE');
   aceites++;
  }
  if(aceites!==aceitos.size)falha('LOTE_ACEITES_FORA_DO_LIVRO');
  return {integridade:'OK',pedidosEmLote:lotes.length,
   posicoesEmLote:total,aceitesIndividuaisEnsaio:aceites,financeiroReal:false};
 }
 consultarPosicoes({titularId}={}){
  if(!TITULAR.test(titularId||''))falha('LOTE_TITULAR_INVALIDO');
  return this.db.prepare([
   'SELECT p.posicao_id AS posicaoId,p.ordinal,p.tipo,l.pedido_id AS pedidoId',
   'FROM loop_real_promocoes_lotes_posicoes_ensaio p',
   'JOIN loop_real_promocoes_lotes_ensaio l ON l.pedido_id=p.pedido_id',
   'WHERE l.titular_id=? ORDER BY l.criado_em ASC,p.ordinal ASC'
  ].join(' ')).all(titularId);
 }
}
module.exports={PromocaoLotesEnsaioSQLite,TABELAS_LOTES_ENSAIO};
