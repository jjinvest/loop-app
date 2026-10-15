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
class SessoesParticipanteDemo{
 constructor({contas,agoraMs=()=>Date.now()}={}){
  if(!contas||typeof contas.autenticar!=='function'||typeof contas.buscar!=='function'){
   throw new TypeError('Cadastro local obrigatorio');
  }
  if(typeof agoraMs!=='function')throw new TypeError('Relogio invalido');
  this.contas=contas;
  this.agoraMs=agoraMs;
  this.sessoes=new Map();
  this.falhas=new Map();
 }
 _limpar(agora){
  for(const [id,s] of this.sessoes)if(s.venceEm<=agora)this.sessoes.delete(id);
  for(const [id,r] of this.falhas)if(r.ate<=agora)this.falhas.delete(id);
 }
 entrar({nome,senha,origem='loopback'}={}){
  const agora=this.agoraMs();
  this._limpar(agora);
  // Apenas endereco local e usado como chave de limitacao. A ausencia
  // de usuario nunca gera resposta distinguivel de senha incorreta.
  const chave=String(origem).slice(0,128);
  const tentativas=this.falhas.get(chave);
  if(tentativas&&tentativas.quantidade>=MAX_FALHAS)throw falha('LIMITE_LOGIN_DE_TESTE');
  if(!somenteTexto(nome,200)||!somenteTexto(senha,128)){
   throw falha('LOGIN_DE_TESTE_INVALIDO');
  }
  let autenticada;
  try{
   autenticada=this.contas.autenticar({nome,senha});
  }catch{
   const proximo=tentativas||{quantidade:0,ate:agora+JANELA};
   proximo.quantidade++;
   this.falhas.set(chave,proximo);
   throw falha('LOGIN_DE_TESTE_INVALIDO');
  }
  this.falhas.delete(chave);
  if(this.sessoes.size>=MAX_SESSOES)throw falha('MAXIMO_SESSOES_DE_TESTE');
  const token=randomBytes(32).toString('base64url');
  const contaId=autenticada.conta.contaId;
  this.sessoes.set(chaveToken(token),{contaId,venceEm:agora+DURACAO});
  return {token,duracaoSegundos:DURACAO/1000};
 }
 identificar(token){
  if(!somenteTexto(token,128)||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const agora=this.agoraMs();
  this._limpar(agora);
  const sessao=this.sessoes.get(chaveToken(token));
  if(!sessao||sessao.venceEm<=agora)return null;
  return this.contas.buscar(sessao.contaId)?.contaId||null;
 }
 sair(token){
  if(!somenteTexto(token,128)||!/^[A-Za-z0-9_-]{43}$/.test(token))return;
  this.sessoes.delete(chaveToken(token));
 }
}
module.exports={SessoesParticipanteDemo,DURACAO,MAX_FALHAS};
