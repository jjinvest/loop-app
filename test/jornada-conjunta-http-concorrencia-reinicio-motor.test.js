'use strict';
// Ensaio diferencial da JORNADA CONJUNTA: varias sessoes HTTP em dois
// servidores, um SQLite WAL, webhook concorrente, reinicio, GET PSP mock
// e catraca. Nao usa provedor, segredo comercial ou dinheiro real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {auditarIntegridadeMotorCandidato}=
 require('../src/domain/auditoria-integridade-motor-candidato-sqlite');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const TOKEN='WebhookFluxoConjuntoMock'+('T'.repeat(44));
const ADMIN='OperadorFluxoConjuntoMock'+('A'.repeat(48));
const TERMOS='LAB-jornada-conjunta-2026';
const TERMO_TEXTO='Aceite ficticio da jornada integrada de ensaio, sem transferencia ou credito real.';
const SENHA='SenhaFicticiaJornada2026';
function gerarCpf(i){
 const digitos=String(100000000+i).split('').map(Number);
 for(let n=9;n<=10;n++){
  const soma=digitos.reduce((acc,d,j)=>acc+d*(n+1-j),0);
  const resto=soma*10%11;
  digitos.push(resto===10?0:resto);
 }
 return digitos.join('');
}
test('jornada HTTP concorrente em duas instancias: pedidos, callbacks, reinicio, motor e giro',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-jornada-conjunta-'));
 const arquivo=path.join(dir,'unico.sqlite');
 const chaves={
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32)
 };
 let posts=0,gets=0;
 const pagamentos=new Map(),porPedido=new Map();
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({pedidoId,clienteAsaasId,valorCentavos}){
   posts++;
   assert.equal(valorCentavos,25000);
   const pagamentoId='pay_ConjuntoMock_'+String(posts).padStart(3,'0');
   const info={pedidoId,pagamentoId,clienteAsaasId,valorCentavos};
   pagamentos.set(pagamentoId,info);porPedido.set(pedidoId,info);
   // A resposta chega depois que outras requisicoes tiveram chance de avançar.
   await new Promise(resolve=>setImmediate(resolve));
   return {ambiente:this.ambiente,pagamentoId,valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(pagamentoId){
   gets++;
   const info=pagamentos.get(pagamentoId);
   assert.ok(info,'nao consultar pagamento desconhecido');
   await new Promise(resolve=>setImmediate(resolve));
   return {pagamentoId,status:'RECEIVED',
    valorCentavos:info.valorCentavos,billingType:'PIX',
    clienteAsaasId:info.clienteAsaasId,
    externalReference:'LOOPLAB-'+info.pedidoId};
  }
 };
 const instancias=new Set();
 async function iniciar(){
  const banco=new DatabaseSync(arquivo);
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  const r=criarAppLojaEscritorioCandidato({
   banco,repositorioCatalogo:catalogoFicticioCheckout(),...chaves,
   webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
   operacoesSandboxAutorizadas:true,
   segredoOperador:ADMIN,termosVersao:TERMOS,termosTexto:TERMO_TEXTO
  });
  const servidor=r.app.listen(0,'127.0.0.1');
  await once(servidor,'listening');
  const i={banco,r,servidor,base:'http://127.0.0.1:'+servidor.address().port};
  instancias.add(i);
  return i;
 }
 async function parar(i){
  if(!instancias.has(i))return;
  await new Promise(resolve=>i.servidor.close(resolve));
  i.banco.close();instancias.delete(i);
 }
 async function req(i,rota,{method='GET',cookie,csrf,admin=false,data,key}={}){
  const response=await fetch(i.base+rota,{method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(data?{'Content-Type':'application/json','X-LOOP-LAB':'participante'}:{}),
   ...(key?{'Idempotency-Key':key}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:await response.json(),
   setCookie:response.headers.get('set-cookie')};
 }
 try{
  const a=await iniciar(),b=await iniciar();
  // Todas as compras sao verdes, com uma unica posicao por carrinho.
  const cor=await req(a,
   '/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',{
    method:'PATCH',admin:true,
    data:{classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0}
   });
  assert.equal(cor.status,200,JSON.stringify(cor.body));
  const nicks=['Vega','Lira','Mira','Nora','Dora','Elio','Luma','Cora'];
  const clientes=await Promise.all(nicks.map(async(nick,n)=>{
   const i=n%2?b:a;
   const cadastro=await req(i,'/staging/contas/cadastrar',{method:'POST',data:{
    nome:nick+' Cliente',nick,email:nick.toLowerCase()+'@example.invalid',
    senha:SENHA,aceiteExplicito:true
   }});
   assert.equal(cadastro.status,201,JSON.stringify(cadastro.body));
   const login=await req(i,'/staging/contas/entrar',{method:'POST',data:{
    nick,senha:SENHA
   }});
   assert.equal(login.status,200,JSON.stringify(login.body));
   const cookie=login.setCookie?.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))?.[1];
   assert.ok(cookie);
   return {n,nick,titularId:cadastro.body.titularId,
    cookie,csrf:login.body.csrf};
  }));
  // Oito clientes compram quase ao mesmo tempo em duas portas HTTP.
  await Promise.all(clientes.map(async c=>{
   const i=c.n%2?b:a;
   const r=await req(i,'/staging/vitrine/loja/pedidos',{
    method:'POST',cookie:c.cookie,csrf:c.csrf,
    key:'pedido-conjunto-'+c.nick.toLowerCase(),
    data:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
   });
   assert.equal(r.status,201,JSON.stringify(r.body));
   c.prepedidoId=r.body.pedido.pedidoId;
  }));
  assert.equal(new Set(clientes.map(c=>c.prepedidoId)).size,8);
  await Promise.all(clientes.map(async c=>{
   const app=(c.n%2?b:a).r;
   app.ponte.preparar({titularId:c.titularId,
    prepedidoId:c.prepedidoId,
    clienteAsaasId:'cus_ConjuntoMock_'+String(c.n).padStart(3,'0')});
   await app.ponte.enviarUmaVez({
    titularId:c.titularId,prepedidoId:c.prepedidoId,
    provedor,execucaoLiberada:true
   });
   c.pagamentoId=porPedido.get(c.prepedidoId).pagamentoId;
   c.eventoId='evt_ConjuntoRecebido_'+String(c.n).padStart(3,'0');
  }));
  assert.equal(posts,8);
  // Duplicatas concorrentes pelo receptor HTTP: 8 eventos, 16 entregas.
  await Promise.all(clientes.map(async c=>{
   const aviso={id:c.eventoId,event:'PAYMENT_RECEIVED',
    payment:{id:c.pagamentoId,billingType:'PIX',
     value:250,externalReference:'LOOPLAB-'+c.prepedidoId}};
   const enviar=async(i)=>{
    const r=await fetch(i.base+'/staging/asaas/webhook-unificado',{
     method:'POST',headers:{'Content-Type':'application/json',
      'asaas-access-token':TOKEN},body:JSON.stringify(aviso)
    });
    return {status:r.status,body:await r.json()};
   };
   const respostas=await Promise.all([enviar(a),enviar(b)]);
   assert.ok(respostas.every(r=>r.status===200),JSON.stringify(respostas));
   assert.equal(respostas.filter(r=>r.body.eventoRegistrado).length,1);
   assert.equal(respostas.filter(r=>r.body.repetido).length,1);
  }));
  assert.equal(a.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging').get().n,8);
  assert.equal(a.r.motorConta.consultar().posicoesReais,0);
  assert.equal(a.r.motorConta.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(gets,0,'aviso nao pode simular GET PSP');
  // Interrupcao controlada DE AMBOS OS SERVIDORES; fechar conexoes e
  // reconstruir runtime/contas/motor sobre exatamente o mesmo arquivo WAL.
  await parar(a);await parar(b);
  let c=await iniciar(),d=await iniciar();
  // Provocar falha uma unica vez ENTRE GET PSP confirmado e escrita no
  // motor; a reparacao precisa sobreviver a novo boot sem novo GET/POST.
  const original=c.r.motorConta.vincularPedidoConferidoSandbox
   .bind(c.r.motorConta);
  let falhouUmaVez=false;
  c.r.motorConta.vincularPedidoConferidoSandbox=(args)=>{
   if(args.prepedidoId===clientes[0].prepedidoId&&!falhouUmaVez){
    falhouUmaVez=true;
    throw Object.assign(new Error('falha ensaio entre PSP e motor'),
     {codigo:'INTERRUPCAO_ENTRE_PSP_E_MOTOR'});
   }
   return original(args);
  };
  // Reconsultas e motor atravessam duas instancias em paralelo.
  const reconciliados=await Promise.all(clientes.map((u,index)=>
   req(index%2?d:c,'/staging/escritorio-unificado/reconsultar-psp',{
    method:'POST',admin:true,data:{eventoId:u.eventoId}
   })));
  for(const [index,r] of reconciliados.entries()){
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.estado,'CONCLUIDO');
   assert.ok(index===0?r.body.vinculoMotorEnsaio?.estado==='BLOQUEADO':
    ['PENDENTES_GERADAS','JA_VINCULADO']
     .includes(r.body.vinculoMotorEnsaio?.estado),JSON.stringify(r.body));
  }
  assert.equal(falhouUmaVez,true);
  assert.equal(c.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,7);
  assert.equal(gets,8);
  assert.equal(posts,8);
  // Todos os servicos caem apos confirmar o PSP, mas antes de salvar
  // o oitavo lote no motor. Retomar usando unica fonte SQLite duravel.
  await parar(c);await parar(d);
  c=await iniciar();d=await iniciar();
  const reparo=await req(d,'/staging/escritorio-unificado/reconciliar-pendentes-sandbox',{
   method:'POST',admin:true,data:{limite:20}
  });
  assert.equal(reparo.status,200,JSON.stringify(reparo.body));
  assert.equal(reparo.body.lotesPendentesCriados,1,JSON.stringify(reparo.body));
  assert.equal(reparo.body.vinculosMotorAusentes,0,JSON.stringify(reparo.body));
  assert.equal(gets,8,'reparo do motor nao faz novo GET PSP concluido');
  assert.equal(posts,8,'reparo do motor nao gera nova cobranca');
  const m=c.r.motorConta.consultar();
  assert.equal(m.posicoesAtivasDoTitular??0,0,'visao admin nao assume titular');
  assert.equal(c.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,8);
  // Segredo da sessao conserva acesso individual mesmo apos reinicio.
  await Promise.all(clientes.map(async u=>{
   const own=await req(c,'/staging/motor/estado',{cookie:u.cookie});
   assert.equal(own.status,200,JSON.stringify(own.body));
   assert.equal(own.body.minhasPosicoes.length,1);
   u.posicaoId=own.body.minhasPosicoes[0].numero;
   const alheio=clientes[(u.n+1)%clientes.length];
   const pedidos=await req(d,'/staging/meus-pedidos',{cookie:u.cookie});
   assert.equal(pedidos.status,200,JSON.stringify(pedidos.body));
   assert.equal(pedidos.body.pedidos.length,1);
   assert.equal(pedidos.body.pedidos[0].prepedidoId,u.prepedidoId);
   const cruzado=await req(c,'/staging/meu-diagnostico-ativacao/'+alheio.prepedidoId,
    {cookie:u.cookie});
   assert.equal(cruzado.status,404);
  }));
  // Aceites do titular concorrem entre si mas cada posicao e unica.
  await Promise.all(clientes.map(async u=>{
   const identidade=await req(c,'/staging/contas/identidade',{
    method:'POST',cookie:u.cookie,csrf:u.csrf,
    data:{cpf:gerarCpf(u.n),aceiteExplicito:true}
   });
   assert.equal(identidade.status,201,JSON.stringify(identidade.body));
   const body={posicaoId:u.posicaoId,versaoTermos:TERMOS,aceiteExplicito:true};
   const [x,y]=await Promise.all([
    req(c,'/staging/motor/posicoes/confirmar-ensaio',{
     method:'POST',cookie:u.cookie,csrf:u.csrf,data:body}),
    req(d,'/staging/motor/posicoes/confirmar-ensaio',{
     method:'POST',cookie:u.cookie,csrf:u.csrf,data:body})
   ]);
   assert.deepEqual([x.status,y.status].sort((v,w)=>v-w),[200,201],
    JSON.stringify([x,y]));
  }));
  assert.equal(c.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,8);
  const preparar=await req(c,'/staging/escritorio-unificado/motor/preparar',{
   method:'POST',admin:true,data:{}
  });
  assert.equal(preparar.status,200,JSON.stringify(preparar.body));
  assert.equal(preparar.body.preparado,true);
  // Seis pedidos independentes alimentam um ciclo; replay nao duplica luz.
  await Promise.all(clientes.slice(0,6).map(async(u,i)=>{
   const r=await req(i%2?c:d,'/staging/escritorio-unificado/motor/evento',{
    method:'POST',admin:true,data:{prepedidoId:u.prepedidoId}
   });
   assert.equal(r.status,200,JSON.stringify(r.body));
  }));
  const replay=await req(d,'/staging/escritorio-unificado/motor/evento',{
   method:'POST',admin:true,data:{prepedidoId:clientes[0].prepedidoId}
  });
  assert.equal(replay.status,200,JSON.stringify(replay.body));
  assert.equal(replay.body.repetido,true);
  assert.equal(c.r.motorConta.consultar().tabuleiro.eventosNoCiclo,6);
  const abrir=await req(c,'/staging/escritorio-unificado/motor/catraca',{
   method:'POST',admin:true,data:{acao:'ABRIR'}
  });
  assert.equal(abrir.status,200);
  const giro=await req(d,'/staging/escritorio-unificado/motor/catraca',{
   method:'POST',admin:true,data:{acao:'GIRAR'}
  });
  assert.equal(giro.status,200,JSON.stringify(giro.body));
  assert.equal(giro.body.girou,true,JSON.stringify(giro.body));
  assert.equal(c.r.motorConta.consultar().catraca.giros,1);
  // Novo reboot apos giro: snapshot deve sobreviver e livros coerentes.
  await parar(c);await parar(d);
  const e=await iniciar();
  const audit=auditarIntegridadeMotorCandidato({
   banco:e.banco,exigirMotor:true
  });
  assert.equal(audit.totalInconsistencias,0);
  assert.equal(audit.snapshotValidado,true);
  assert.equal(e.r.motorConta.consultar().catraca.giros,1);
  assert.equal(e.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(e.banco.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(e.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging').get().n,8);
  assert.equal(e.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,8);
  assert.equal(e.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,8);
  const real=await req(e,'/staging/checkout/finalizar',{method:'POST'});
  assert.equal(real.status,503);
  assert.equal(e.r.motorConta.consultar().dinheiroReal,false);
  assert.equal(posts,8);
  assert.equal(gets,8);
 }finally{
  for(const i of [...instancias]){
   try{await parar(i);}catch(_e){i.banco.close();}
  }
  fs.rmSync(dir,{recursive:true,force:true});
 }
});