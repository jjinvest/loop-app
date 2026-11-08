'use strict';
// Prova externa CELCOIN SOMENTE sandbox e leitura.
// POST apenas em /v5/token (autenticacao), GET apenas lista publica autenticada
// de participantes Pix. Nunca cobra, transfere, faz split ou cria conta.
const BASE='https://sandbox.openfinance.celcoin.dev';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const cred=v=>typeof v==='string'&&v.length>=8&&v.length<=512&&!/[\r\n]/.test(v);
async function provarAcessoCelcoinSandboxReadOnly({
 clientId,clientSecret,fetchImpl=globalThis.fetch
}={}){
 if(process.env.NODE_ENV==='production')falha('CELCOIN_PROVA_SANDBOX_PROIBIDA_PRODUCAO');
 if(!cred(clientId)||!cred(clientSecret))
  falha('CELCOIN_CREDENCIAIS_SANDBOX_AUSENTES');
 if(typeof fetchImpl!=='function')falha('CELCOIN_HTTP_INVALIDO');
 async function solicitar(caminho,metodo,opcoes={}){
  if(!((caminho==='/v5/token'&&metodo==='POST')||
        (caminho==='/pix/v1/participants'&&metodo==='GET')))
   falha('CELCOIN_PROVA_CAMINHO_NAO_PERMITIDO');
  let resposta;
  try{resposta=await fetchImpl(BASE+caminho,{
   method:metodo,redirect:'error',
   headers:{Accept:'application/json',...opcoes.headers},
   ...(opcoes.body?{body:opcoes.body}:{}),
   signal:AbortSignal.timeout(10000)
  });}
  catch{falha('CELCOIN_PROVA_CONEXAO_INCONCLUSIVA');}
  if(!resposta||resposta.ok!==true){
   if(resposta?.status===401||resposta?.status===403)
    falha('CELCOIN_SANDBOX_ACESSO_NAO_AUTORIZADO');
   falha('CELCOIN_SANDBOX_HTTP_NAO_CONFIRMADO');
  }
  let bruto;
  try{bruto=await resposta.text();}
  catch{falha('CELCOIN_RESPOSTA_INVALIDA');}
  if(typeof bruto!=='string'||bruto.length>65536)
   falha('CELCOIN_RESPOSTA_INVALIDA');
  try{return JSON.parse(bruto);}
  catch{falha('CELCOIN_RESPOSTA_INVALIDA');}
 }
 // Campos multipart/form-data segundo documentacao /v5/token.
 // Credenciais nunca entram em URL, retorno, logs ou console.
 const form=new FormData();
 form.set('client_id',clientId);
 form.set('client_secret',clientSecret);
 form.set('grant_type','client_credentials');
 const token=await solicitar('/v5/token','POST',{body:form});
 if(!token||typeof token.access_token!=='string'||
    token.access_token.length<16||token.access_token.length>8192||
    !/^bearer$/i.test(token.token_type||''))
  falha('CELCOIN_TOKEN_SANDBOX_INVALIDO');
 const bancos=await solicitar('/pix/v1/participants','GET',{
  headers:{Authorization:'Bearer '+token.access_token}});
 // Resposta HTTP 200 sem participantes identificaveis nao prova consulta valida:
 // evitar sucesso falso com payload {} ou erro encapsulado em JSON.
 const registros=Array.isArray(bancos)?bancos:
  Array.isArray(bancos?.data)?bancos.data:
  Array.isArray(bancos?.participants)?bancos.participants:
  Array.isArray(bancos?.result)?bancos.result:
  Array.isArray(bancos?.items)?bancos.items:null;
 if(!registros||!registros.some(x=>x&&typeof x==='object'&&
    /^\d{8}$/.test(String(x.ispb??''))))
  falha('CELCOIN_LISTA_PARTICIPANTES_INVALIDA');
 return Object.freeze({
  ambiente:'CELCOIN_SANDBOX',
  tokenSandboxAutenticado:true,listaParticipantesPixConsultada:true,
  tokenRetornadoAoOperador:false,dadosBancariosExternosConfigurados:false,
  transferenciaPixHabilitada:false,transferenciasRealizadas:0,
  contasCriadas:0,comprasGeradas:0,dinheiroReal:false,
  acessoBaasCashoutHabilitadoPeloProvedor:null,
  marcoZeroFinanceiroAprovado:false,
  status:'AUTENTICACAO_E_CONSULTA_READONLY_SANDBOX_COMPROVADAS'
 });
}
function estadoCelcoinSandboxReadOnly({clientId,clientSecret}={}){
 const configurado=cred(clientId)&&cred(clientSecret);
 return {status:configurado?'CREDENCIAIS_PRESENTES_PROVA_MANUAL_PENDENTE':
  'AGUARDANDO_CREDENCIAIS_CELCOIN_SANDBOX',
  credenciaisConfiguradas:configurado,
  ambiente:'CELCOIN_SANDBOX',autenticacaoComprovada:false,
  transferenciasReais:0,saquesReais:0,contasExternasConectadas:false,
  chavesExpostas:false};
}
module.exports={provarAcessoCelcoinSandboxReadOnly,estadoCelcoinSandboxReadOnly};
