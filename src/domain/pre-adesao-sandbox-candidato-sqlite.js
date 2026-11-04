'use strict';
// Registro DURÁVEL de PRÉ-ADESÃO FICTÍCIA: não é posição ativada.
// Usa somente evidências já gravadas no SQLite de homologação.
// Proibido ligar à fila comercial, tabuleiro, catraca, bônus ou saque.
const {createHash}=require('node:crypto');
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const PREPEDIDO=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function statusBase(){return {ambiente:'SANDBOX_LOCAL',
 preAdesaoReal:false,posicoesReaisCriadas:0,
 filaRealAlterada:false,tabuleiroRealAlterado:false,
 saquesReais:0,bonusReais:0,semPagamentoReal:true,
 validacaoExternaCPF:false,autorizacaoMotorReal:false};}
class PreAdesaoSandboxCandidatoSQLite{
 constructor({banco,posicoes=null,sinalizacao,cpf=null,termosVersao=null,agora=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')falha('PRE_ADESAO_SANDBOX_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     sinalizacao?.db!==banco||typeof sinalizacao?.consultarFotografiaPrepedido!=='function'||
     (posicoes!==null&&(posicoes?.banco!==banco||typeof posicoes?.consultar!=='function'))||
     (cpf!==null&&(cpf?.banco!==banco||typeof cpf?.consultar!=='function'))||
     typeof agora!=='function')falha('FONTES_STAGING_OBRIGATORIAS');
  this.db=banco;this.posicoes=posicoes;this.sinalizacao=sinalizacao;
  this.cpf=cpf;this.termosVersao=termosVersao;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_pre_adesao_sandbox_candidato(',
   'prepedido_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'posicao_id TEXT NOT NULL UNIQUE REFERENCES',
   'akitemm_prepedido_posicoes_pendentes_sandbox_staging(id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado='PRE_ADESAO_FICTICIA_NAO_ATIVADA'),",
   'hash_fotografia TEXT NOT NULL,versao_termos TEXT NOT NULL,',
   'hash_termos TEXT NOT NULL,criado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_pre_adesao_sandbox_titular',
   'ON akitemm_pre_adesao_sandbox_candidato(titular_id);',
   'CREATE TRIGGER IF NOT EXISTS pre_adesao_sandbox_no_update',
   'BEFORE UPDATE ON akitemm_pre_adesao_sandbox_candidato',
   "BEGIN SELECT RAISE(ABORT,'pre adesao historica imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS pre_adesao_sandbox_no_delete',
   'BEFORE DELETE ON akitemm_pre_adesao_sandbox_candidato',
   "BEGIN SELECT RAISE(ABORT,'pre adesao historica imutavel'); END;"
  ].join(' '));
 }
 validarId(prepedidoId,titularId=null){
  if(typeof prepedidoId!=='string'||!PREPEDIDO.test(prepedidoId))
   falha('PREPEDIDO_INVALIDO');
  if(titularId!==null&&(typeof titularId!=='string'||!TITULAR.test(titularId)))
   falha('TITULAR_INVALIDO');
 }
 buscarLinha(prepedidoId,titularId=null){
  this.validarId(prepedidoId,titularId);
  return this.db.prepare([
   'SELECT * FROM akitemm_pre_adesao_sandbox_candidato',
   'WHERE prepedido_id=?',...(titularId?['AND titular_id=?']:[])
  ].join(' ')).get(...(titularId?[prepedidoId,titularId]:[prepedidoId]));
 }
 avaliar({prepedidoId,titularId=null}={}){
  if(process.env.NODE_ENV==='production')falha('PRE_ADESAO_SANDBOX_PROIBIDA_PRODUCAO');
  this.validarId(prepedidoId,titularId);
  const r=this.db.prepare([
   'SELECT titular_id AS titularId,total_centavos AS totalCentavos',
   'FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?',
   ...(titularId?['AND titular_id=?']:[])
  ].join(' ')).get(...(titularId?[prepedidoId,titularId]:[prepedidoId]));
  if(!r)return null;
  const motivos=[];
  if(!this.posicoes)motivos.push('PSP_SANDBOX_NAO_CONFIGURADO');
  if(!this.cpf)motivos.push('CUSTODIA_CPF_LAB_NAO_CONFIGURADA');
  if(r.totalCentavos!==25000)motivos.push('VALOR_REFERENCIA_INCOMPATIVEL');
  let pagamento=null,pendente=null,foto=null,identidade=null;
  if(this.posicoes){
   pagamento=consultarPedido({banco:this.db,prepedidoId,titularId:r.titularId});
   pendente=this.posicoes.consultar({prepedidoId,titularId:r.titularId});
   if(!pagamento||pagamento.conferenciaPSPConcluida!==true||
      pagamento.posicoesFicticiasAptasAgora!==1||
      pagamento.exigeRevisaoManual===true||
      pendente?.estado!=='PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX')
    motivos.push('RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE');
  }
  foto=this.sinalizacao.consultarFotografiaPrepedido({
   prepedidoId,titularId:r.titularId});
  if(!foto)motivos.push('FOTOGRAFIA_HISTORICA_AUSENTE');
  else if(foto.totalCentavos!==25000||foto.podeSimularFilaBAzul!==true||
     foto.valorVerdeConsideradoCentavos!==25000||foto.eventoPendente)
   motivos.push('OFERTA_HISTORICA_NAO_QUALIFICADA');
  if(this.cpf){
   identidade=this.cpf.consultar({titularId:r.titularId});
   if(!identidade)motivos.push('CPF_E_TERMOS_DE_ENSAIO_AUSENTES');
   else if(identidade.termosVersao!==this.termosVersao||
     identidade.estado!=='NAO_VERIFICADA_EXTERNAMENTE')
    motivos.push('TERMOS_DO_ENSAIO_DIVERGENTES');
  }
  const previa=this.buscarLinha(prepedidoId,r.titularId);
  if(previa){
   const hashAtual=foto?createHash('sha256').update(JSON.stringify(foto)).digest('hex'):null;
   if(hashAtual!==previa.hash_fotografia||
      identidade?.termosSha256!==previa.hash_termos||
      identidade?.termosVersao!==previa.versao_termos)
    motivos.push('EVIDENCIA_HISTORICA_DIVERGENTE');
  }
  return {...statusBase(),prepedidoId,titularId:r.titularId,
   ensaioRegistrado:!!previa,
   estado:!previa?(motivos.length?'BLOQUEADA_PARA_ENSAIO':'APTA_APENAS_PARA_PREPARAR_ENSAIO'):
    motivos.length?'ENSAIO_HISTORICO_EM_REVISAO':'PRE_ADESAO_FICTICIA_PERSISTIDA',
   motivos,proximoPassoReal:'HOMOLOGAR_IDENTIDADE_PAGAMENTO_MOTOR_E_REGRAS',
   fotografiaHistoricaConferida:!!foto,
   situacaoPSPSemNovaConsulta:pagamento?.estadoOperacional||'SEM_PSP_CONCILIADO',
   cpfDeclaradoNoEnsaio:!!identidade,
   cpfExternamenteVerificado:false,
   termosVersao:identidade?.termosVersao||null,
   gravadoEm:previa?.criado_em||null,
   posicaoFicticiaId:previa?.posicao_id||null,
   ...(previa?{hashFotografia:previa.hash_fotografia}:{}),
   // Os dados de CPF nunca são devolvidos no endpoint.
   posicoesAtivas:0,prontaParaFilaReal:false};
 }
 registrar({prepedidoId,autorizado=false}={}){
  if(process.env.NODE_ENV==='production'||autorizado!==true)
   falha('REGISTRO_PRE_ADESAO_NAO_AUTORIZADO');
  this.validarId(prepedidoId);
  if(!this.posicoes||!this.cpf)falha('PRE_ADESAO_INDISPONIVEL');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const situacao=this.avaliar({prepedidoId});
   if(!situacao)falha('PREPEDIDO_NAO_ENCONTRADO');
   if(situacao.ensaioRegistrado){
    this.db.exec('COMMIT');
    return {repetido:true,...situacao};
   }
   if(situacao.motivos.length)falha('PRE_ADESAO_BLOQUEADA_'+situacao.motivos[0]);
   const foto=this.sinalizacao.consultarFotografiaPrepedido({
    prepedidoId,titularId:situacao.titularId});
   const identidade=this.cpf.consultar({titularId:situacao.titularId});
   const pos=this.posicoes.consultar({titularId:situacao.titularId,prepedidoId});
   if(!foto||!identidade||!pos?.id)falha('EVIDENCIAS_PSP_CPF_INCOMPLETAS');
   const now=this.agora();
   if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
    falha('RELOGIO_NAO_CONFIAVEL');
   const hashFoto=createHash('sha256').update(JSON.stringify(foto)).digest('hex');
   this.db.prepare([
    'INSERT INTO akitemm_pre_adesao_sandbox_candidato',
    '(prepedido_id,posicao_id,titular_id,estado,hash_fotografia,',
    'versao_termos,hash_termos,criado_em)',
    "VALUES(?,?,?,'PRE_ADESAO_FICTICIA_NAO_ATIVADA',?,?,?,?)"
   ].join(' ')).run(prepedidoId,pos.id,situacao.titularId,
    hashFoto,identidade.termosVersao,identidade.termosSha256,now);
   this.db.exec('COMMIT');
   return {repetido:false,...this.avaliar({prepedidoId,titularId:situacao.titularId})};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 listarTitular(titularId){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))falha('TITULAR_INVALIDO');
  const ids=this.db.prepare([
   'SELECT prepedido_id AS id FROM akitemm_pre_adesao_sandbox_candidato',
   'WHERE titular_id=? ORDER BY criado_em DESC,prepedido_id DESC LIMIT 50'
  ].join(' ')).all(titularId);
  return {modo:'PRE_ADESAO_FICTICIA_SEM_DIREITOS',registros:ids.map(x=>
   this.avaliar({prepedidoId:x.id,titularId})),...statusBase()};
 }
}
module.exports={PreAdesaoSandboxCandidatoSQLite};
