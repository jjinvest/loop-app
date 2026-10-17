'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const TOKEN='chave-de-teste-local-de-pedidos-1234567890000';
async function lab(t) {
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pedidos-painel-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'catalogo.sqlite')});
  t.after(()=>repo.fechar());
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const srv=app.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve())));
  return {base:'http://127.0.0.1:'+srv.address().port,repo};
}
async function req(base,rota,{method='GET',body,token=TOKEN,headers={}}={}){
  const resp=await fetch(base+rota,{
    method,
    headers:{
      ...(token ? {Authorization:'Bearer '+token} : {}),
      ...(body ? {'Content-Type':'application/json'} : {}),
      ...headers
    },
    body:body ? JSON.stringify(body):undefined
  });
  const txt=await resp.text();
  let data=txt;try{data=JSON.parse(txt);}catch{}
  return {status:resp.status,data,headers:resp.headers};
}
async function estado(base) {
  const r=await req(base,'/api/admin/pedidos-demo');
  assert.equal(r.status,200);
  return r.data;
}
async function passo(base,id,tipo,revisaoEsperada){
  return req(base,'/api/admin/pedidos-demo/'+id+'/eventos',{
    method:'POST',body:{tipo,revisaoEsperada}
  });
}

test('lista mostra apenas dois pedidos totalmente ficticios sem CPF ou pagamento real',async t=>{
  const {base,repo}=await lab(t);
  const r=await estado(base);
  assert.equal(r.pedidos.length,2);
  assert.equal(r.modo,'PEDIDOS_E_PAGAMENTOS_TOTALMENTE_SIMULADOS');
  assert.equal(r.pagamentosReais,false);
  assert.equal(r.filasMovimentadas,false);
  assert.ok(r.pedidos.every(p=>p.status==='AGUARDANDO_CONFIRMACAO'));
  assert.ok(r.pedidos.every(p=>p.reembolso==='NAO_SOLICITADO'));
  assert.ok(r.pedidos.every(p=>p.revisao===1));
  assert.ok(r.acoesDisponiveis.includes('REGISTRAR_ENTREGA'));
  assert.doesNotMatch(JSON.stringify(r),/CPF|participanteId|endereco|valorCentavos|tokenSecreto/);
  assert.equal(repo.listar().length,0);
  assert.equal((await req(base,'/catalogo',{token:null})).status,200);
});

test('servidor recusa acesso anonimo, requests extras e pedidos nao demonstrativos',async t=>{
  const {base}=await lab(t);
  assert.equal((await req(base,'/api/admin/pedidos-demo',{token:null})).status,401);
  assert.equal((await req(base,'/api/admin/pedidos-demo',{token:'token-errado'})).status,401);
  assert.equal((await req(base,'/api/admin/pedidos-demo',{
    headers:{origin:'https://outro-site.invalid'}
  })).status,403);
  assert.equal((await req(base,'/api/admin/pedidos-demo/pedido-desconhecido/historico')).status,404);
  assert.equal((await passo(base,'pedido-desconhecido','CONFIRMAR_PAGAMENTO_SIMULADO',1)).status,404);
  assert.equal((await req(base,'/api/admin/pedidos-demo/pedido-demo-001/eventos',{
    method:'POST',body:{tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:1,pago:true}
  })).status,400);
  assert.equal((await req(base,'/api/admin/pedidos-demo/pedido-demo-001/eventos',{
    method:'POST',body:{tipo:'DEPOSITAR_DINHEIRO',revisaoEsperada:1}
  })).status,400);
  assert.equal((await req(base,'/api/admin/pedidos-demo/pedido-demo-001/eventos',{
    method:'POST',token:null,body:{tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:1}
  })).status,401);
  assert.equal((await req(base,'/api/admin/pedidos-demo/pedido-demo-001/eventos',{
    method:'POST',body:{tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:1},
    headers:{'Content-Type':'text/plain'}
  })).status,415);
  assert.equal((await estado(base)).pedidos[0].status,'AGUARDANDO_CONFIRMACAO');
});

test('painel acompanha entrega completa e registra historico separado da fila',async t=>{
  const {base,repo}=await lab(t);
  let rev=1;
  const id='pedido-demo-001';
  const comandos=[
    ['CONFIRMAR_PAGAMENTO_SIMULADO','CONFIRMADO_SIMULADO'],
    ['REPASSAR_PEDIDO_SIMULADO','ENVIADO_FORNECEDOR'],
    ['INICIAR_SEPARACAO','EM_SEPARACAO'],
    ['REGISTRAR_TRANSPORTE','EM_TRANSPORTE'],
    ['REGISTRAR_ENTREGA','ENTREGUE']
  ];
  for(const [tipo,status] of comandos) {
    const r=await passo(base,id,tipo,rev++);
    assert.equal(r.status,200);
    assert.equal(r.data.pedido.status,status);
    assert.equal(r.data.pedido.revisao,rev);
  }
  assert.equal((await passo(base,id,'SOLICITAR_CANCELAMENTO',rev)).status,409);
  const historico=await req(base,'/api/admin/pedidos-demo/'+id+'/historico');
  assert.equal(historico.status,200);
  assert.equal(historico.data.eventos.length,6);
  assert.equal(historico.data.eventos.at(-1).tipo,'REGISTRAR_ENTREGA');
  assert.equal(historico.headers.get('cache-control'),'no-store');
  assert.equal((await estado(base)).pedidos[1].status,'AGUARDANDO_CONFIRMACAO');
  assert.equal(repo.listar().length,0);
});

test('extravio e cancelamento simulados permitem registrar solicitacao sem dinheiro',async t=>{
  const {base}=await lab(t);
  let n=1;
  for(const tipo of ['CONFIRMAR_PAGAMENTO_SIMULADO','REPASSAR_PEDIDO_SIMULADO',
    'INICIAR_SEPARACAO','REGISTRAR_TRANSPORTE','REGISTRAR_OCORRENCIA',
    'SOLICITAR_REEMBOLSO_SIMULADO','SOLICITAR_CANCELAMENTO',
    'REGISTRAR_CANCELAMENTO','REGISTRAR_REEMBOLSO_SIMULADO']){
    const r=await passo(base,'pedido-demo-002',tipo,n++);
    assert.equal(r.status,200);
  }
  const pedido=(await estado(base)).pedidos.find(p=>p.pedidoId==='pedido-demo-002');
  assert.equal(pedido.status,'CANCELADO');
  assert.equal(pedido.reembolso,'REGISTRADO_SIMULADO');
  assert.equal('valorCentavos' in pedido,false);
  assert.equal('valorRetido' in pedido,false);
  assert.equal((await passo(base,'pedido-demo-002','REGISTRAR_REEMBOLSO_SIMULADO',n)).status,409);
});

test('interface inclui controle, historico e JS externo restrito ao laboratorio',async t=>{
  const {base}=await lab(t);
  const html=await req(base,'/admin',{token:null});
  assert.equal(html.status,200);
  assert.match(html.data,/id="areaPedidosDemo"/);
  assert.match(html.data,/id="listaPedidosDemo"/);
  assert.match(html.data,/id="eventoPedidoDemo"/);
  assert.match(html.data,/id="historicoPedidoDemo"/);
  assert.match(html.data,/\/admin\/pedidos-demo\.js/);
  const js=await req(base,'/admin/pedidos-demo.js',{token:null});
  assert.equal(js.status,200);
  assert.match(js.data,/REGISTRAR_OCORRENCIA/);
  assert.match(js.data,/limparPedidosDemo/);
  assert.match(js.data,/carregarPedidosDemo/);
  assert.match(js.headers.get('content-security-policy'),/script-src 'self'/);
  assert.doesNotMatch(js.data,/chave-de-teste-local-de-pedidos-1234567890000/);
  assert.equal((await req(base,'/pedidos-demo',{token:null})).status,404);
});

test('painel permite solicitar devolucao apos entrega ficticia',async t=>{
  const {base}=await lab(t);
  const id='pedido-demo-001';
  let rev=1;
  for(const tipo of [
    'CONFIRMAR_PAGAMENTO_SIMULADO','REPASSAR_PEDIDO_SIMULADO',
    'INICIAR_SEPARACAO','REGISTRAR_TRANSPORTE','REGISTRAR_ENTREGA',
    'SOLICITAR_DEVOLUCAO','SOLICITAR_REEMBOLSO_SIMULADO',
    'CONFIRMAR_DEVOLUCAO','REGISTRAR_REEMBOLSO_SIMULADO'
  ]) {
    const r=await passo(base,id,tipo,rev++);
    assert.equal(r.status,200);
  }
  const pedido=(await estado(base)).pedidos.find(x=>x.pedidoId===id);
  assert.equal(pedido.status,'DEVOLVIDO');
  assert.equal(pedido.reembolso,'REGISTRADO_SIMULADO');
  const historico=await req(base,'/api/admin/pedidos-demo/'+id+'/historico');
  assert.equal(historico.data.eventos.length,10);
  assert.equal((await passo(base,id,'CONFIRMAR_PAGAMENTO_SIMULADO',rev)).status,409);
});
