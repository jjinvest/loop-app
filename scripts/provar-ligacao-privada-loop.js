'use strict';
// Prova SEM credenciais e sem transacoes: destino privado, interface real,
// separacao cliente/operador e exatidao do Origin nas mutacoes.
// POST /api/operador/sair SEM cookie eh idempotente: nao altera qualquer
// sessao ou conta. Nunca realizar login falso e causar bloqueio de operador.
const http=require('node:http');
const MAX_RESPOSTA=512*1024;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function pedir({alvo,path,method='GET',origin=null,timeoutMs=5000}){
 return new Promise((resolve,reject)=>{
  const headers={'Accept':'application/json, text/html, */*'};
  if(origin)headers.origin=origin;
  const request=http.request({
   hostname:alvo.hostname,port:Number(alvo.port||80),method,path,
   headers,timeout:timeoutMs
  },response=>{
   const pedaços=[];let recebido=0;
   response.on('data',bloco=>{
    recebido+=bloco.length;
    if(recebido>MAX_RESPOSTA){
     response.destroy();reject(new Error('PROVA_PRIVADA_RESPOSTA_EXTENSA'));
    }else pedaços.push(bloco);
   });
   response.on('end',()=>{
    resolve({status:response.statusCode,
     body:Buffer.concat(pedaços).toString('utf8'),
     headers:response.headers});
   });
   response.on('error',reject);
  });
  request.on('timeout',()=>{
   request.destroy(new Error('PROVA_PRIVADA_TIMEOUT'));
  });
  request.on('error',reject);
  request.end();
 });
}
function jsonResposta(res){
 try{return JSON.parse(res.body);}
 catch{falha('PROVA_PRIVADA_JSON_INVALIDO');}
}
async function provarLigacaoPrivada({alvo,origemReal,timeoutMs=5000}={}){
 if(!(alvo instanceof URL)||alvo.protocol!=='http:'||
    typeof origemReal!=='string'||!/^https:\/\/[a-z0-9.-]+$/.test(origemReal)||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)
  falha('PROVA_PRIVADA_CONFIG_INVALIDA');
 // Nenhuma destas chamadas requer senha, token, dado de cliente,
 // pagamento, compra, saque ou cadastramento.
 const health=await pedir({alvo,path:'/healthz',timeoutMs});
 const h=jsonResposta(health);
 if(health.status!==200||
    h.estado!=='SERVICO_IDENTIDADE_SEPARADO'||h.financeiroReal!==false)
  falha('PROVA_PRIVADA_NAO_E_IDENTIDADE_REAL');
 const titular=await pedir({alvo,path:'/api/contas/me',timeoutMs});
 if(titular.status!==401)
  falha('PROVA_PRIVADA_CLIENTE_SESSAO_ABERTA');
 const loja=await pedir({alvo,path:'/loja',timeoutMs});
 if(loja.status!==401)
  falha('PROVA_PRIVADA_LOJA_PUBLICA_SEM_LOGIN');
 const operador=await pedir({alvo,path:'/api/operador/estado',timeoutMs});
 if(operador.status!==200||jsonResposta(operador).operador!==false)
  falha('PROVA_PRIVADA_OPERADOR_ISOLADO_FALHOU');
 // O logout anonimo eh uma prova segura de Origin: rota idempotente
 // que nao autentica, nao consome limite de login e nao destrói sessao.
 const origem=await pedir({alvo,path:'/api/operador/sair',
  method:'POST',origin:origemReal,timeoutMs});
 if(origem.status!==200||jsonResposta(origem).operador!==false)
  falha('PROVA_PRIVADA_ORIGEM_NAO_CONFERE');
 const pagina=await pedir({alvo,path:'/minha-conta',timeoutMs});
 if(pagina.status!==200||
    !pagina.body.includes('id="formCadastro"')||
    !pagina.body.includes('id="formLogin"'))
  falha('PROVA_PRIVADA_INTERFACE_REAL_AUSENTE');
 const fotos=await pedir({alvo,
  path:'/identidade/assets/operador-fotos.js',timeoutMs});
 if(fotos.status!==200||
    !fotos.body.includes('X-Foto-Versao-Esperada'))
  falha('PROVA_PRIVADA_FOTOS_OPERADOR_AUSENTES');
 return Object.freeze({identidadeReal:true,financeiroReal:false,
  contaFechadaSemLogin:true,operadorIsolado:true,origemConfirmada:true,
  interfaceAprovada:true,uploadOperador:true});
}
async function executar(ambiente=process.env){
 const {validarConfiguracao}=
  require('./iniciar-gateway-publico-real-loop');
 const {alvo,origemReal}=validarConfiguracao({
  urlIdentidadeReal:ambiente.LOOP_PUBLICO_URL_IDENTIDADE_INTERNA,
  origemReal:ambiente.LOOP_PUBLICO_ORIGEM_IDENTIDADE_REAL
 });
 return provarLigacaoPrivada({alvo,origemReal});
}
if(require.main===module){
 executar().then(()=>{
  process.stdout.write('GATEWAY_PUBLICO_ORIGEM_REAL=PROVADA_SEM_DINHEIRO\n');
 }).catch(e=>{
  const codigo=e?.codigo||e?.message||'PROVA_PRIVADA_INDISPONIVEL';
  process.stderr.write('GATEWAY_PUBLICO_ORIGEM_REAL=NAO_COMPROVADA_'+
   (/^[A-Z0-9_]{5,100}$/.test(codigo)?codigo:'ERRO')+'\n');
  process.exitCode=1;
 });
}
module.exports={provarLigacaoPrivada,executar};
