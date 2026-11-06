'use strict';
// ENSAIO EXTERNO UNICO, consentido: 2 contas ficticias, 2 cobrancas Asaas
// Sandbox simuladas, webhook externo, aceitacao de posicao de laboratorio,
// convite assinado, atribuicao a fila A e entrada no tabuleiro.
// NUNCA usar CPF de pessoa real, email ativo, checkout real ou transferencias.
const {randomBytes}=require('node:crypto');
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
const PSP='https://api-sandbox.asaas.com/v3';
const SKU='curso-homologacao-250';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarAmbiente(env){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    env.LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app')
  falha('FLUXO_CLIENTE_PREVIA_NAO_AUTORIZADA');
 if(typeof env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY!=='string'||
    !env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.startsWith('$aact_hmlg_')||
    env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.length<25||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  falha('FLUXO_CLIENTE_CREDENCIAIS_INVALIDAS');
}
const gerarNick=prefix=>prefix+Array.from(randomBytes(8),
 b=>String.fromCharCode(97+b%26)).join('');
const novaSenha=()=>randomBytes(24).toString('hex')+'!';
function cpfExclusivamenteFicticio(){
 const d=Array.from(randomBytes(9),b=>b%10);
 if(d.every(x=>x===d[0]))d[0]=(d[0]+1)%10;
 for(const n of [9,10]){
  const sum=d.reduce((acc,v,i)=>acc+v*(n+1-i),0);
  const resto=(sum*10)%11;d.push(resto===10?0:resto);
 }
 return d.join('');
}
async function homologarClienteConviteTabuleiro({
 env=process.env,fetchImpl=globalThis.fetch,
 esperar=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 nickA=gerarNick('A'),nickB=gerarNick('B')
}={}){
 validarAmbiente(env);
 if(!/^A[a-z]{8}$/.test(nickA)||!/^B[a-z]{8}$/.test(nickB)||
    typeof fetchImpl!=='function'||typeof esperar!=='function')
  falha('FLUXO_CLIENTE_FIXTURE_INVALIDA');
 const basic='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 const key=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY;
 const contar={clientes:0,pedidos:0,pix:0,posicoesConfirmadas:0,indicacoes:0};
 async function req(host,rota,{method='GET',body=null,sessao=null,headers={}}={}){
  const h=host===BASE?{Authorization:basic,Accept:'application/json'}:
   {access_token:key,Accept:'application/json','User-Agent':'LoopV6-Sandbox/1.0'};
  if(sessao){
   h.Cookie=sessao.cookie;
   if(method!=='GET')h['X-Checkout-Csrf']=sessao.csrf;
  }
  let res;
  try{
   res=await fetchImpl(host+rota,{method,redirect:'error',
    headers:{...h,...(body!==null?{'Content-Type':'application/json'}:{}),...headers},
    ...(body!==null?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(12000)});
  }catch{falha('FLUXO_CLIENTE_REDE_INCONCLUSIVA_VERIFICAR_LOGS');}
  if(!res.ok)falha((host===BASE?'FLUXO_CLIENTE_APP_':'FLUXO_CLIENTE_PSP_')+res.status);
  let data;
  try{data=await res.json();}catch{falha('FLUXO_CLIENTE_JSON_INVALIDO');}
  return {data,res};
 }
 const cadastro=async(nick,password,refCookie=null)=>{
  const id=nick.toLowerCase()+'@example.invalid';
  const r=await req(BASE,'/staging/contas/cadastrar',{
   method:'POST',body:{nome:'Conta Ficticia de Homologacao',nick,email:id,
    senha:password,aceiteExplicito:true},
   headers:refCookie?{Cookie:refCookie}:{}
  });
  if(!/^titular-[0-9a-f-]{36}$/.test(r.data.titularId||''))
   falha('FLUXO_CLIENTE_CONTA_INDETERMINADA');
  contar.clientes++;
  return r.data.titularId;
 };
 const entrar=async(nick,senha)=>{
  const r=await req(BASE,'/staging/contas/entrar',{
   method:'POST',body:{nick,senha}
  });
  const cookie=((r.res.headers.getSetCookie?.()||[
   r.res.headers.get('set-cookie')||''
  ]).join(';').match(/(?:^|[;, ]+)loop_candidato_s=([a-f0-9]{64})/i)||[])[1];
  if(!cookie||typeof r.data.csrf!=='string')falha('FLUXO_CLIENTE_LOGIN_INVALIDO');
  return {cookie:'loop_candidato_s='+cookie,csrf:r.data.csrf};
 };
 const vincularPix=async(nick,sessao,clienteAsaas)=>{
  const r=await req(BASE,'/staging/vitrine/loja/pedidos',{
   method:'POST',sessao,headers:{
    'X-LOOP-LAB':'participante',
    'Idempotency-Key':'fluxo-lab-'+randomBytes(16).toString('hex')
   },body:{itens:[{produtoId:SKU,quantidade:1}]}
  });
  const pedidoId=r.data.pedido?.pedidoId||r.data.pedido?.prepedidoId;
  if(!/^hom-[0-9a-f-]{36}$/.test(pedidoId||'')||
     r.data.pedido?.totalCentavos!==25000)
   falha('FLUXO_CLIENTE_PEDIDO_DIVERGENTE');
  contar.pedidos++;
  const preparo=await req(BASE,'/staging/escritorio-unificado/sandbox-pix/preparar',{
   method:'POST',body:{prepedidoId:pedidoId,clienteAsaasId:clienteAsaas,
    aceiteEnsaio:true}
  });
  if(preparo.data.posicoesReservadas!==1||
     preparo.data.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO')
   falha('FLUXO_CLIENTE_RESERVA_DIVERGENTE');
  // O PSP foi chamado pelo backend; aqui so confirmar a cobranca encontrada
  // por externalReference. Nunca repetir criacao de pagamento em timeout.
  const cobranca=await req(PSP,
   '/payments?externalReference='+encodeURIComponent('LOOPLAB-'+pedidoId)+'&limit=10');
  const lista=cobranca.data?.data;
  if(!Array.isArray(lista)||lista.length!==1||
     lista[0].billingType!=='PIX'||lista[0].value!==250||
     lista[0].externalReference!=='LOOPLAB-'+pedidoId||
     lista[0].customer!==clienteAsaas)
   falha('FLUXO_CLIENTE_PIX_UNICO_NAO_COMPROVADO');
  const pag=lista[0].id;
  if(!/^[A-Za-z0-9_-]{5,90}$/.test(pag||''))
   falha('FLUXO_CLIENTE_PAGAMENTO_INVALIDO');
  await req(PSP,'/sandbox/payment/'+pag+'/confirm',{
   method:'POST',body:{}
  });
  contar.pix++;
  for(let j=0;j<12;j++){
   await esperar(5000);
   const s=(await req(BASE,'/staging/motor/estado',{sessao})).data;
   if(s.posicoesAtivasDoTitular===1&&s.minhasPosicoes?.length===1&&
      s.minhasPosicoes[0].pendente===true)return s.minhasPosicoes[0].numero;
  }
  falha('FLUXO_CLIENTE_WEBHOOK_POSICAO_NAO_CONFIRMADA');
 };
 const criarClienteAsaas=async(nick)=>{
  const r=await req(PSP,'/customers',{
   method:'POST',body:{name:'LOOP Sandbox Cliente Ficticio',
    cpfCnpj:'24971563792',notificationDisabled:true,
    externalReference:'LOOPLAB-FLUXO-'+nick}
  });
  if(!/^cus_[A-Za-z0-9_-]{5,80}$/.test(r.data?.id||''))
   falha('FLUXO_CLIENTE_CUSTOMER_SANDBOX_INVALIDO');
  return r.data.id;
 };
 const senhaA=novaSenha(),senhaB=novaSenha();
 const titularA=await cadastro(nickA,senhaA);
 const sessaoA=await entrar(nickA,senhaA);
 // Preflight autenticado ANTES dos pedidos/Pix: catalogo e sinal
 // corretos, sem reclassificacao silenciosa da loja.
 const catalogo=(await req(BASE,'/staging/vitrine/loja/catalogo',
  {sessao:sessaoA})).data;
 const produto=catalogo.produtos?.find(p=>(p.id||p.produtoId)===SKU);
 const sinal=(await req(BASE,
  '/staging/escritorio-unificado/sinalizacao/'+SKU)).data;
 if(!produto||produto.precoCentavos!==25000||
    sinal.classificacao!=='VERDE'||sinal.quantidadeMinimaLoop!==1)
  falha('FLUXO_CLIENTE_CATALOGO_NAO_PREPARADO');
 const clienteA=await criarClienteAsaas(nickA);
 const posicaoA=await vincularPix(nickA,sessaoA,clienteA);
 // Identidade EXCLUSIVAMENTE ficticia e termos de laboratorio. Nao e KYC.
 const termos=(await req(BASE,'/staging/contas/termos-identidade',
  {sessao:sessaoA})).data;
 if(!termos.disponivel||!/^LAB-/.test(termos.termosVersao||''))
  falha('FLUXO_CLIENTE_TERMOS_INDISPONIVEIS');
 const identidade=await req(BASE,'/staging/contas/identidade',{
  method:'POST',sessao:sessaoA,
  body:{cpf:cpfExclusivamenteFicticio(),aceiteExplicito:true}
 });
 if(identidade.data.identidadeExternaVerificada!==false)
  falha('FLUXO_CLIENTE_IDENTIDADE_LAB_INVALIDA');
 const aceite=await req(BASE,'/staging/motor/posicoes/confirmar-ensaio',{
  method:'POST',sessao:sessaoA,
  body:{posicaoId:posicaoA,versaoTermos:termos.termosVersao,
   aceiteExplicito:true}
 });
 if(aceite.data.aceiteIndividualRegistrado!==true)
  falha('FLUXO_CLIENTE_ACEITE_NAO_COMPROVADO');
 contar.posicoesConfirmadas++;
 // Visitante B acessa link assinado do indicador A; nao forja header.
 let clique;
 try{
  clique=await fetchImpl(BASE+'/loja/'+nickA,{
   method:'GET',redirect:'manual',headers:{Authorization:basic},
   signal:AbortSignal.timeout(8000)
  });
 }catch{falha('FLUXO_CLIENTE_LINK_REDE_INCONCLUSIVA');}
 if(clique.status!==302)falha('FLUXO_CLIENTE_LINK_INVALIDO');
 const cookies=clique.headers.getSetCookie?.()||[
  clique.headers.get('set-cookie')||''
 ];
 const raw=cookies.find(x=>x.startsWith('akitemm_preview_ref='));
 const refCookie=raw?.split(';')[0];
 if(!/^akitemm_preview_ref=v1\.[a-z]{1,9}\.\d{13}\.[a-f0-9]{64}$/.test(refCookie||''))
  falha('FLUXO_CLIENTE_COOKIE_INDICACAO_INVALIDO');
 const titularB=await cadastro(nickB,senhaB,refCookie);
 const antes=(await req(BASE,'/staging/minha-equipe',{sessao:sessaoA})).data;
 if(antes.total!==1||antes.indicacoesQualificadas!==0||
    antes.cadastros?.[0]?.indicadoId!==titularB)
  falha('FLUXO_CLIENTE_CONVITE_NAO_GRAVADO');
 const sessaoB=await entrar(nickB,senhaB);
 const clienteB=await criarClienteAsaas(nickB);
 const posicaoB=await vincularPix(nickB,sessaoB,clienteB);
 if(posicaoB===posicaoA)falha('FLUXO_CLIENTE_POSICOES_DUPLICADAS');
 const promovida=await req(BASE,
  '/staging/minha-equipe/indicacoes/qualificar-ensaio',{
   method:'POST',sessao:sessaoA,
   body:{indicadoId:titularB,posicaoAlvoId:posicaoA}
  });
 if(promovida.data.qualificada!==true||
    promovida.data.promovidaParaFilaA!==true||
    promovida.data.comissaoRealCentavos!==0)
  falha('FLUXO_CLIENTE_FILA_A_NAO_PROMOVIDA');
 contar.indicacoes++;
 const repetido=await req(BASE,
  '/staging/minha-equipe/indicacoes/qualificar-ensaio',{
   method:'POST',sessao:sessaoA,
   body:{indicadoId:titularB,posicaoAlvoId:posicaoA}
  });
 if(repetido.data.repetido!==true)
  falha('FLUXO_CLIENTE_INDICACAO_DUPLICADA');
 const fila=(await req(BASE,'/staging/motor/estado',{sessao:sessaoA})).data;
 if(fila.filaA?.filter(p=>p.numero===posicaoA).length!==1||
    fila.minhasPosicoes?.find(p=>p.numero===posicaoA)?.indicacoesVinculadas!==1)
  falha('FLUXO_CLIENTE_FILA_A_DIVERGENTE');
 const equipe=(await req(BASE,'/staging/minha-equipe',{sessao:sessaoA})).data;
 if(equipe.indicacoesQualificadas!==1||
    equipe.cadastros?.[0]?.posicaoAlvoId!==posicaoA)
  falha('FLUXO_CLIENTE_EQUIPE_DIVERGENTE');
 // Somente o operador do LABORATORIO autoriza montagem do tabuleiro,
 // respeitando restricoes de dois por titular. Nenhum giro ou credito.
 const montagem=await req(BASE,'/staging/escritorio-unificado/motor/preparar',{
  method:'POST',body:{}
 });
 if(montagem.data.preparado!==true)
  falha('FLUXO_CLIENTE_TABULEIRO_NAO_PREPARADO');
 const tab=(await req(BASE,'/staging/motor/estado',{sessao:sessaoA})).data;
 const ocupacao=[tab.tabuleiro.centro,...tab.tabuleiro.vagas].filter(Boolean);
 if(ocupacao.filter(p=>p.numero===posicaoA).length!==1||
    tab.catraca.giros!==0||tab.dinheiroReal!==false||
    tab.saldoRealCentavos!==null)
  falha('FLUXO_CLIENTE_TABULEIRO_DIVERGENTE');
 return Object.freeze({
  ambiente:'ASAAS_SANDBOX_HOMOLOGACAO',
  contasFicticiasCriadas:contar.clientes,
  pedidosFicticios:contar.pedidos,
  pixSimuladosConfirmados:contar.pix,
  posicoesAceitasEmLaboratorio:contar.posicoesConfirmadas,
  indicacoesComCompraValidada:contar.indicacoes,
  mesmaIndicacaoSemDuplicacao:true,
  filaAPromovida:true,posicaoNoTabuleiro:true,
  giroReal:0,creditosReais:0,saquesReais:0,
  identidadeExternaValidada:false,
  cadastroPublicoLiberado:false
 });
}
if(require.main===module){
 homologarClienteConviteTabuleiro().then(x=>{
  process.stdout.write('LOOP_CLIENTE_COMPRA_CONVITE_TABULEIRO='+JSON.stringify(x)+'\n');
 }).catch(e=>{
  process.stderr.write('LOOP_CLIENTE_COMPRA_CONVITE_TABULEIRO='+
   String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'').slice(0,95)+'\n');
  process.exitCode=1;
 });
}
module.exports={validarAmbiente,homologarClienteConviteTabuleiro};