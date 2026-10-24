'use strict';

// Sessoes EFEMERAS em RAM para demonstracao local do escritorio.
// NAO e autenticacao, hospedagem ou cadastro de producao.
const {randomBytes,createHash}=require('node:crypto');
const DURACAO=20*60*1000;
const JANELA=15*60*1000;
const MAX_FALHAS=5;
const MAX_SESSOES=256;

function falha(codigo){
 const e=new Error(codigo);e.codigo=codigo;return e;
}
function chaveToken(token){
 return createHash('sha256').update(token).digest('hex');
}
function somenteTexto(val,limite){
 return typeof val==='string'&&val.length>0&&val.length<=limite;
}
function tokenValido(token){
 return somenteTexto(token,128)&&/^[A-Za-z0-9_-]{43}$/.test(token);
}
class SessoesParticipanteDemo{
 constructor({contas,agoraMs=()=>Date.now(),auditoria=null}={}){
  if(!contas||typeof contas.autenticar!=='function'||typeof contas.buscar!=='function'){
   throw new TypeError('Cadastro local obrigatorio');
  }
  if(typeof agoraMs!=='function')throw new TypeError('Relogio invalido');
  if(auditoria!==null&&typeof auditoria.registrar!=='function'){
   throw new TypeError('Auditoria local invalida');
  }
  this.contas=contas;
  this.agoraMs=agoraMs;
  this.auditoria=auditoria;
  this.sessoes=new Map();
  this.falhas=new Map();
 }
 _evento(tipo,contaId=null){
  if(this.auditoria)this.auditoria.registrar({
   tipo,contaId,registradoEm:new Date(this.agoraMs()).toISOString()
  });
 }
 _limpar(agora){
  for(const [id,s] of this.sessoes)if(s.venceEm<=agora)this.sessoes.delete(id);
  for(const [id,r] of this.falhas)if(r.ate<=agora)this.falhas.delete(id);
 }
 entrar({nome,senha,origem='loopback'}={}){
  const agora=this.agoraMs();
  this._limpar(agora);
  // Somente IP do socket local: nunca confiar em X-Forwarded-For.
  // Ausencia de usuario e senha errada produzem a mesma resposta.
  const chave=String(origem).slice(0,128);
  const tentativas=this.falhas.get(chave);
  if(tentativas&&tentativas.quantidade>=MAX_FALHAS){
   if(!tentativas.bloqueioAuditado){
    this._evento('LOGIN_BLOQUEADO');
    tentativas.bloqueioAuditado=true;
   }
   throw falha('LIMITE_LOGIN_DE_TESTE');
  }
  if(!somenteTexto(nome,200)||!somenteTexto(senha,128)){
   this._evento('LOGIN_INVALIDO');
   throw falha('LOGIN_DE_TESTE_INVALIDO');
  }
  let autenticada;
  try{
   autenticada=this.contas.autenticar({nome,senha});
  }catch{
   const proximo=tentativas||{quantidade:0,ate:agora+JANELA};
   proximo.quantidade++;
   this.falhas.set(chave,proximo);
   this._evento('LOGIN_INVALIDO');
   throw falha('LOGIN_DE_TESTE_INVALIDO');
  }
  if(this.sessoes.size>=MAX_SESSOES)throw falha('MAXIMO_SESSOES_DE_TESTE');
  const token=randomBytes(32).toString('base64url');
  const contaId=autenticada.conta.contaId;
  // Registro antes da abertura da sessao: caso a auditoria falhe
  // a autenticacao nao e aceita parcialmente.
  this._evento('LOGIN_SUCESSO',contaId);
  this.falhas.delete(chave);
  this.sessoes.set(chaveToken(token),{contaId,venceEm:agora+DURACAO});
  return {token,duracaoSegundos:DURACAO/1000};
 }
 identificar(token){
  if(!tokenValido(token))return null;
  const agora=this.agoraMs();
  this._limpar(agora);
  const sessao=this.sessoes.get(chaveToken(token));
  if(!sessao||sessao.venceEm<=agora)return null;
  return this.contas.buscar(sessao.contaId)?.contaId||null;
 }
 revogarTodasDaConta(contaId){
  if(typeof contaId!=='string'||!contaId)return 0;
  let total=0;
  for(const [chave,s] of this.sessoes){
   if(s.contaId!==contaId)continue;
   this.sessoes.delete(chave);total++;
  }
  if(total)this._evento('SESSAO_REVOGADA',contaId);
  return total;
 }
 sair(token,{motivo='SESSAO_ENCERRADA'}={}){
  if(!tokenValido(token))return false;
  const chave=chaveToken(token);
  const sessao=this.sessoes.get(chave);
  if(!sessao)return false;
  if(!['SESSAO_ENCERRADA','SESSAO_REVOGADA'].includes(motivo)){
   throw new TypeError('Motivo de saida invalido');
  }
  this._evento(motivo,sessao.contaId);
  this.sessoes.delete(chave);
  return true;
 }
}
module.exports={SessoesParticipanteDemo,DURACAO,MAX_FALHAS};
