'use strict';
// Execucao unica e explicita em Sandbox: conta e pedido ficticios no MESMO
// Escritorio SQLite, cliente e Pix no PSP de homologacao, confirmacao simulada,
// webhook assinado externo, conciliacao automatica e UMA posicao pendente.
// Nunca usar CPF real, chave de producao, saque, saldo real nem direitos comerciais.
const {randomBytes}=require('node:crypto');
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
const PSP='https://api-sandbox.asaas.com/v3';
const SKU='curso-homologacao-250';
function falha(etapa){const e=new Error(etapa);e.codigo=etapa;throw e;}
function validarAmbiente(env){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_E2E_EXECUTAR!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app')
  falha('E2E_PREVIA_NAO_AUTORIZADA');
 if(typeof env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY!=='string'||
    !env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.startsWith('$aact_hmlg_')||
    env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.length<25||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  falha('E2E_CREDENCIAIS_SANDBOX_INCOMPLETAS');
}
const gerarNick=()=>('Lab'+Array.from(randomBytes(6),b=>String.fromCharCode(97+b%26)).join('')).slice(0,9);
async function homologarPixPontaAPonta({
 env=process.env,fetchImpl=globalThis.fetch,esperar=ms=>new Promise(ok=>setTimeout(ok,ms)),
 nick=gerarNick()
}={}){
 validarAmbiente(env);
 if(typeof nick!=='string'||!/^Lab[a-z]{6}$/.test(nick)||
    typeof fetchImpl!=='function'||typeof esperar!=='function')
  falha('E2E_TESTE_NAO_CONFIGURADO');
 const baseAuth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 const pspAuth=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY;
 const pass='Ensaio-'+randomBytes(20).toString('hex')+'!';
 let cookie=null,csrf=null,alterado=null;
 let pagamentoCriado=false;
 const acao=async(destino,rota,method='GET',body=null,headers={})=>{
  const host=destino==='app'?BASE:PSP;
  const h=destino==='app'?{Authorization:baseAuth,Accept:'application/json',...(cookie?{Cookie:cookie}:{})}:
   {access_token:pspAuth,'User-Agent':'LoopV6-Sandbox/1.0',Accept:'application/json'};
  const opts={method,redirect:'error',
   headers:{...h,...(body!==null?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==null?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(9000)};
  let resp;try{resp=await fetchImpl(host+rota,opts);}catch(_e){falha('E2E_REDE_INCONCLUSIVA');}
  if(!resp.ok)falha('E2E_'+(destino==='app'?'APLICACAO_':'PSP_')+resp.status);
  let dados;try{dados=await resp.json();}catch(_e){falha('E2E_RESPOSTA_INVALIDA');}
  return {dados,resp};
 };
 try{
  // So usar teste novo e exclusivamente conta criada neste ensaio.
  const senha=pass;
  const conta=await acao('app','/staging/contas/cadastrar','POST',{
   nome:'Cliente Ficticio de Homologacao',nick,
   email:nick.toLowerCase()+'@example.invalid',senha,
   aceiteExplicito:true
  });
  if(!/^titular-/.test(conta.dados.titularId||''))falha('E2E_CADASTRO_INCOMPLETO');
  const login=await acao('app','/staging/contas/entrar','POST',{nick,senha});
  csrf=login.dados.csrf;
  const cookies=login.resp.headers.getSetCookie?.()||[login.resp.headers.get('set-cookie')||''];
  const s=cookies.join(';').match(/(?:^|[;, ]+)loop_candidato_s=([a-f0-9]{64})/i);
  if(!s||typeof csrf!=='string')falha('E2E_LOGIN_INCOMPLETO');
  cookie='loop_candidato_s='+s[1];
  const catalogo=(await acao('app','/staging/vitrine/loja/catalogo')).dados;
  const produto=catalogo.produtos?.find(x=>(x.id||x.produtoId)===SKU);
  if(!produto||produto.precoCentavos!==25000)falha('E2E_PRODUTO_250_NAO_ELEGIVEL');
  const sinal=(await acao('app','/staging/escritorio-unificado/sinalizacao/'+SKU)).dados;
  if(!Number.isSafeInteger(sinal.revisao))falha('E2E_SINAL_INVALIDO');
  if(sinal.classificacao!=='VERDE'||sinal.quantidadeMinimaLoop!==1){
   const novo=(await acao('app','/staging/escritorio-unificado/sinalizacao/'+SKU,'PATCH',{
    classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:sinal.revisao
   })).dados;
   alterado={anterior:sinal,revisao:novaRevisao(novo,sinal.revisao)};
  }
  const pedido=await acao('app','/staging/vitrine/loja/pedidos','POST',{
   itens:[{produtoId:SKU,quantidade:1}]
  },{'X-LOOP-LAB':'participante','X-Checkout-Csrf':csrf,
      'Idempotency-Key':'lab-e2e-'+randomBytes(12).toString('hex')});
  const prepedido=pedido.dados.pedido;
  const pedidoId=prepedido?.pedidoId||prepedido?.prepedidoId;
  if(!/^hom-[0-9a-f-]{36}$/.test(pedidoId||'')||
     prepedido.totalCentavos!==25000)falha('E2E_PEDIDO_DIVERGENTE');
  // CPF de documentacao publica Asaas, so em Sandbox e sem email real.
  const customer=await acao('psp','/customers','POST',{
   name:'LOOP Sandbox Conta Ficticia',cpfCnpj:'24971563792',
   notificationDisabled:true,externalReference:'LOOPLAB-E2E-'+nick
  });
  const clienteAsaasId=customer.dados?.id;
  if(!/^cus_[A-Za-z0-9_-]{5,80}$/.test(clienteAsaasId||''))
   falha('E2E_CLIENTE_SANDBOX_INDETERMINADO');
  const preparo=(await acao('app',
   '/staging/escritorio-unificado/sandbox-pix/preparar','POST',{
    prepedidoId:pedidoId,clienteAsaasId,aceiteEnsaio:true
   })).dados;
  if(preparo.posicoesReservadas!==1||preparo.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO')
   falha('E2E_RESERVA_NAO_EXATA');
  pagamentoCriado=true;
  const busca=await acao('psp',
   '/payments?externalReference=LOOPLAB-'+pedidoId+'&limit=10');
  const achados=busca.dados?.data;
  if(!Array.isArray(achados)||achados.length!==1||
     achados[0].customer!==clienteAsaasId||achados[0].billingType!=='PIX'||
     achados[0].value!==250||achados[0].externalReference!=='LOOPLAB-'+pedidoId)
   falha('E2E_COBRANCA_PSP_DIVERGENTE');
  const pagamentoId=achados[0].id;
  if(!/^[a-zA-Z0-9_-]{5,90}$/.test(pagamentoId||''))
   falha('E2E_PAGAMENTO_ID_INVALIDO');
  // Unico POST de confirmacao, disponivel SOMENTE no Asaas Sandbox.
  await acao('psp','/sandbox/payment/'+pagamentoId+'/confirm','POST',{});
  let final=null;
  for(let i=0;i<10;i++){
   await esperar(7000);
   const motor=(await acao('app','/staging/motor/estado')).dados;
   if(motor.posicoesAtivasDoTitular===1&&motor.minhasPosicoes?.length===1){
    final=motor;break;
   }
  }
  if(!final)falha('E2E_WEBHOOK_OU_MOTOR_NAO_COMPROVADO');
  // Uma segunda leitura nao deve produzir duplicacao de posicao.
  const deNovo=(await acao('app','/staging/motor/estado')).dados;
  if(deNovo.posicoesAtivasDoTitular!==1||deNovo.minhasPosicoes?.length!==1)
   falha('E2E_DUPLICIDADE_DE_POSICAO');
  return {ambiente:'SANDBOX',clienteFicticio:true,pixSimulado:true,
   webhookEConciliacaoExternosComprovados:true,posicoesPendentes:1,
   posicoesReais:0,saquesReais:0};
 }catch(e){
  // Em erro parcial, nao repetir cobranca ou confirmacao silenciosamente.
  if(pagamentoCriado&&e.codigo==='E2E_REDE_INCONCLUSIVA')
   falha('E2E_PAGAMENTO_INDETERMINADO_REVISAO_MANUAL');
  throw e;
 }finally{
  if(alterado){
   const antes=alterado.anterior;
   try{
    await acao('app','/staging/escritorio-unificado/sinalizacao/'+SKU,'PATCH',{
     classificacao:antes.classificacao,quantidadeMinimaLoop:antes.quantidadeMinimaLoop,
     ...(antes.classificacao==='ROXO'&&antes.posicoesPorUnidadeRoxo>0?
      {posicoesPorUnidadeRoxo:antes.posicoesPorUnidadeRoxo}:{}),
     revisaoEsperada:alterado.revisao
    });
   }catch(_e){process.stderr.write('LOOP_E2E_LAB=RESTAURO_COR_PENDENTE\n');}
  }
 }
}
function novaRevisao(r,anterior){
 return Number.isSafeInteger(r?.revisao)?r.revisao:anterior+1;
}
if(require.main===module)homologarPixPontaAPonta().then(r=>{
 if(r.pixSimulado&&r.webhookEConciliacaoExternosComprovados&&r.posicoesPendentes===1)
  process.stdout.write('LOOP_E2E_SANDBOX=PIX_CONFIRMADO_WEBHOOK_E_POSICAO_UNICA\n');
 else process.stderr.write('LOOP_E2E_SANDBOX=INCONCLUSIVO\n');
}).catch(e=>{
 process.stderr.write('LOOP_E2E_SANDBOX='+String(e.codigo||'INCONCLUSIVO')
  .replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');
 process.exitCode=1;
});
module.exports={homologarPixPontaAPonta,validarAmbiente};