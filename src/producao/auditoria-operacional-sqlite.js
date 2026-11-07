'use strict';
// Trilha administrativa verificável: HMAC encadeado, somente append,
// escrita NA MESMA transação da alteração e sem dados pessoais do cliente.
// Não confundir com auditoria de PSP/financeiro, que exigirá trilha própria.
const {createHmac}=require('node:crypto');
const ACOES=new Set([
 'PRODUTO_CRIADO','OFERTA_RASCUNHO_CRIADA',
 'CUSTO_FORNECEDOR_ALTERADO','PRECO_VENDA_ALTERADO',
 'PRODUTO_STATUS_ALTERADO','OFERTA_STATUS_ALTERADO',
 'MANUTENCAO_COMERCIAL_ALTERADA'
]);
const TEXTO=/^[A-Za-z0-9_-]{1,200}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function canonico(x){return JSON.stringify(x);}
class AuditoriaOperacionalSQLite{
 constructor({banco,chaveAuditoria,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !Buffer.isBuffer(chaveAuditoria)||chaveAuditoria.length!==32||
     typeof agora!=='function')
   falha('AUDITORIA_REAL_NAO_CONFIGURADA');
  this.db=banco;this.key=Buffer.from(chaveAuditoria);this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_auditoria_admin(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'ocorrido_em INTEGER NOT NULL,acao TEXT NOT NULL,',
   'ator_hash TEXT NOT NULL,entidade TEXT NOT NULL,',
   'revisao_anterior INTEGER,revisao_nova INTEGER,',
   'antes_json TEXT NOT NULL,depois_json TEXT NOT NULL,',
   'hash_anterior TEXT NOT NULL,hash_atual TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loja_real_auditoria_admin_imutavel_u',
   'BEFORE UPDATE ON loja_real_auditoria_admin BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loja_real_auditoria_admin_imutavel_d',
   'BEFORE DELETE ON loja_real_auditoria_admin BEGIN',
   "SELECT RAISE(ABORT,'AUDITORIA_IMUTAVEL'); END;"
  ].join(' '));
 }
 _h(x){return createHmac('sha256',this.key).update(x).digest('hex');}
 _assinatura(x){return this._h('EVENTO-ADMIN-AKITEMM-V1\n'+canonico(x));}
 _dados(r){
  return {id:r.id,ocorridoEm:r.ocorrido_em,acao:r.acao,
   atorHash:r.ator_hash,entidade:r.entidade,
   revisaoAnterior:r.revisao_anterior,revisaoNova:r.revisao_nova,
   antesJson:r.antes_json,depoisJson:r.depois_json,
   hashAnterior:r.hash_anterior};
 }
 registrar({acao,ator,entidade,antes,depois,
  revisaoAnterior=null,revisaoNova=null}={}){
  if(!ACOES.has(acao)||typeof ator!=='string'||!TEXTO.test(ator)||
     typeof entidade!=='string'||!TEXTO.test(entidade)||
     !antes||typeof antes!=='object'||Array.isArray(antes)||
     !depois||typeof depois!=='object'||Array.isArray(depois)||
     [revisaoAnterior,revisaoNova].some(n=>
      n!==null&&(!Number.isSafeInteger(n)||n<0)))
   falha('AUDITORIA_EVENTO_INVALIDO');
  const antesJson=canonico(antes),depoisJson=canonico(depois);
  if(antesJson.length>2048||depoisJson.length>2048||
     /email|senha|cpf|endereco|telefone|token|segredo/i.test(
      Object.keys(antes).join(' ')+' '+Object.keys(depois).join(' ')))
   falha('AUDITORIA_DADOS_SENSIVEIS_OU_EXCESSIVOS');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)falha('AUDITORIA_RELOGIO_INVALIDO');
  // Falha fechada: não anexar eventos a uma cadeia adulterada.
  // O custo de conferir a cadeia é aceito nas operações administrativas
  // (baixa frequência); substituir por checkpoints externos quando crescer.
  this.verificar();
  // Quem invoca deve manter BEGIN IMMEDIATE até finalizar a alteração.
  // Não abrir transação paralela: transação e auditoria são indivisíveis.
  const anterior=this.db.prepare([
   'SELECT id,hash_atual FROM loja_real_auditoria_admin',
   'ORDER BY id DESC LIMIT 1'
  ].join(' ')).get();
  const anteriorHash=anterior?.hash_atual||'GENESE';
  const proxId=(anterior?.id||0)+1;
  const evento={id:proxId,ocorridoEm:ts,acao,
   atorHash:this._h('ATOR-ADMIN-AKITEMM-V1:'+ator),
   entidade,revisaoAnterior,revisaoNova,antesJson,depoisJson,
   hashAnterior:anteriorHash};
  const assinatura=this._assinatura(evento);
  const r=this.db.prepare([
   'INSERT INTO loja_real_auditoria_admin(',
   'id,ocorrido_em,acao,ator_hash,entidade,revisao_anterior,',
   'revisao_nova,antes_json,depois_json,hash_anterior,hash_atual)',
   'VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ].join(' ')).run(proxId,ts,acao,evento.atorHash,
   entidade,revisaoAnterior,revisaoNova,antesJson,depoisJson,
   anteriorHash,assinatura);
  if(r.changes!==1)falha('AUDITORIA_NAO_GRAVADA');
  return {eventoId:proxId,hash:assinatura};
 }
 verificar({limite=100000}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>1000000)
   falha('AUDITORIA_LIMITE_INVALIDO');
  const rows=this.db.prepare([
   'SELECT * FROM loja_real_auditoria_admin ORDER BY id ASC'
  ].join(' ')).all();
  if(rows.length>limite)falha('AUDITORIA_ACIMA_DO_LIMITE');
  let prevHash='GENESE',prevId=0;
  for(const r of rows){
   if(r.id!==prevId+1||r.hash_anterior!==prevHash||
      !/^[a-f0-9]{64}$/.test(r.hash_atual)||
      this._assinatura(this._dados(r))!==r.hash_atual)
    falha('AUDITORIA_CADEIA_DIVERGENTE');
   prevHash=r.hash_atual;prevId=r.id;
  }
  return {integra:true,total:rows.length,
   hashUltimo:prevHash,semInformacoesPessoais:true};
 }
 listar({limite=50}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)
   falha('AUDITORIA_LIMITE_INVALIDO');
  // Verifica toda a cadeia antes de reportar. Chave e hashes de origem
  // não são expostos aos clientes; a rota requer sessão ADMIN.
  this.verificar();
  return this.db.prepare([
   'SELECT id,ocorrido_em,acao,entidade,',
   'revisao_anterior,revisao_nova',
   'FROM loja_real_auditoria_admin',
   'ORDER BY id DESC LIMIT ?'
  ].join(' ')).all(limite).map(r=>({
   eventoId:r.id,ocorridoEm:r.ocorrido_em,acao:r.acao,
   entidade:r.entidade,revisaoAnterior:r.revisao_anterior,
   revisaoNova:r.revisao_nova
  }));
 }
}
module.exports={AuditoriaOperacionalSQLite};
