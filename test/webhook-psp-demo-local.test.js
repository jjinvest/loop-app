'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {assinarMensagemDemo,verificarMensagemDemo,JANELA_SEGUNDOS}=
  require('../src/domain/verificador-webhook-psp-demo');
const {COFRES}=require('../src/domain/financeiro-admin-demo');

const TOKEN='webhook-psp-lab-admin-teste-1234567890';
const SECRET='somente-teste-local-hmac-nao-e-chave-real-1234567890';
const FIXO=1792030000; // timestamp de fixture arbitrario, sem dependencia do relogio local
const ROTA='/api/laboratorio/webhook-psp-demo';

function payload(pagamentoId='pag-split-01',eventoId='evt-webhook-001',tipo='CONFIRMAR_FICTICIO',valorCentavos=60000){
  return {eventoId,pagamentoId,tipo,valorCentavos,moeda:'BRL',ambiente:'laboratorio'};
}
function assinado(p,{secret=SECRET,timestamp=FIXO,assinarCorpo=true,assinaturaCustom}={}){
  const body=typeof p==='string'?p:JSON.stringify(p);
  const raw=Buffer.from(body);
  return {
    body,
    headers:{
      'Content-Type':'application/json',
      'x-loop-demo-timestamp':String(timestamp),
      'x-loop-demo-signature':assinaturaCustom||assinarMensagemDemo({
        segredo:secret,timestamp,corpoBruto:assinarCorpo?raw:Buffer.from('{}')
      })
    }
  };
}
function pastaTmp(t){
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-webhook-demo-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  return path.join(pasta,'bd.sqlite');
}
async function levantar(t,{habilitado=false,segredo=SECRET,agoraSegundos=()=>FIXO,arquivo}={}){
  const db=new RepositorioCatalogoSQLite({caminho:arquivo||pastaTmp(t)});
  t.after(()=>db.fechar());
  const app=criarAppAdminLaboratorio({
    repositorio:db,segredo:TOKEN,
    webhookDemo:{habilitado,segredo,agoraSegundos}
  });
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())));
  return {url:'http://127.0.0.1:'+server.address().port,db};
}
async function enviar(base,p,assinatura={}){
  return fetch(base+ROTA,{method:'POST',...assinado(p,assinatura)});
}
async function saldo(base){
  const r=await fetch(base+'/api/admin/livro-financeiro-demo',{
    headers:{Authorization:'Bearer '+TOKEN}
  });
  assert.equal(r.status,200);
  return r.json();
}
function cofre(s,id){return s.caixas.find(x=>x.id===id).saldoProjetadoCentavos;}

test('bytes do corpo e timestamp compoem assinatura HMAC da fixture',()=>{
  const p=payload();
  const body=Buffer.from(JSON.stringify(p));
  const assinatura=assinarMensagemDemo({
    segredo:SECRET,timestamp:FIXO,corpoBruto:body
  });
  assert.match(assinatura,/^sha256=[a-f0-9]{64}$/);
  assert.deepEqual(verificarMensagemDemo({
    segredo:SECRET,timestamp:String(FIXO),assinatura,corpoBruto:body,agoraSegundos:FIXO
  }),{
    eventoId:p.eventoId,pagamentoId:p.pagamentoId,
    tipo:p.tipo,valorCentavos:p.valorCentavos
  });
  assert.throws(()=>verificarMensagemDemo({
    segredo:SECRET,timestamp:String(FIXO),assinatura,
    corpoBruto:Buffer.from(JSON.stringify({...p,valorCentavos:1})),
    agoraSegundos:FIXO
  }),e=>e.codigo==='ASSINATURA_INVALIDA');
  assert.throws(()=>verificarMensagemDemo({
    segredo:SECRET,timestamp:String(FIXO-1000),assinatura,
    corpoBruto:body,agoraSegundos:FIXO
  }),e=>e.codigo==='ASSINATURA_INVALIDA');
  assert.throws(()=>verificarMensagemDemo({
    segredo:SECRET,timestamp:String(FIXO),assinatura,
    corpoBruto:body,agoraSegundos:FIXO+JANELA_SEGUNDOS+1
  }),e=>e.codigo==='ASSINATURA_INVALIDA');
  assert.throws(()=>verificarMensagemDemo({
    segredo:SECRET,timestamp:String(FIXO),assinatura:'sha256=zzzz',
    corpoBruto:body,agoraSegundos:FIXO
  }),e=>e.codigo==='ASSINATURA_INVALIDA');
});

test('contrato estrito recusa campos extras, dinheiro estranho e ambiente diferente',()=>{
  const base=payload();
  function verificar(p){
    const body=Buffer.from(JSON.stringify(p));
    return verificarMensagemDemo({
      segredo:SECRET,timestamp:String(FIXO),
      assinatura:assinarMensagemDemo({segredo:SECRET,timestamp:FIXO,corpoBruto:body}),
      corpoBruto:body,agoraSegundos:FIXO
    });
  }
  for(const p of [
    {...base,ambiente:'producao'},
    {...base,moeda:'USD'},
    {...base,valorCentavos:12.3},
    {...base,valorCentavos:-1},
    {...base,valorCentavos:'60000'},
    {...base,tipo:'TRANSFERIR'},
    {...base,senha:'inventada'},
    [base]
  ]){
    assert.throws(()=>verificar(p),e=>e.codigo==='CORPO_INVALIDO');
  }
});

test('webhook nao existe por padrao mesmo com assinatura correta',async t=>{
  const {url}=await levantar(t);
  const res=await enviar(url,payload());
  assert.equal(res.status,404);
  const livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,0);
  assert.equal(livro.pagamentosReais,false);
});

test('local opt-in: HMAC valida, deduplica e preserva historico no livro',async t=>{
  const {url}=await levantar(t,{habilitado:true});
  const p=payload();
  const confirmado=await enviar(url,p);
  assert.equal(confirmado.status,200);
  const json=await confirmado.json();
  assert.equal(json.modo,'WEBHOOK_APENAS_FICTICIO_LOCAL');
  assert.equal(json.registrado,true);
  assert.equal(json.movimentacaoBancariaReal,false);
  assert.equal(json.catracaMovimentada,false);
  let livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,2);
  assert.equal(cofre(livro,COFRES.CENTRO),10000);
  assert.equal(cofre(livro,COFRES.COMERCIAL),20000);
  assert.equal(cofre(livro,COFRES.DISTRIBUIDOR),0);
  const repetido=await enviar(url,p);
  assert.equal(repetido.status,200);
  assert.equal((await repetido.json()).repetido,true);
  livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,2);
  assert.equal((await enviar(url,payload('pag-split-01','outro-evento'))).status,409);
  assert.equal((await enviar(url,payload('pag-split-02','evt-webhook-001'))).status,409);
  assert.equal((await enviar(url,payload('pag-split-01','estorno-webhook-01','ESTORNAR_FICTICIO'))).status,200);
  livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,4);
  assert.equal(cofre(livro,COFRES.CENTRO),0);
  assert.equal(cofre(livro,COFRES.COMERCIAL),0);
  assert.equal((await enviar(url,payload('pag-split-01','outro-estorno','ESTORNAR_FICTICIO'))).status,409);
  assert.equal((await saldo(url)).lancamentosRegistrados,4);
});

test('corpo falsificado, HMAC errado, data velha e valor trocado nao lancam dinheiro',async t=>{
  const {url}=await levantar(t,{habilitado:true});
  assert.equal((await enviar(url,payload(),{assinaturaCustom:'sha256='+('a'.repeat(64))})).status,401);
  assert.equal((await enviar(url,payload(),{timestamp:FIXO-1000})).status,401);
  assert.equal((await enviar(url,payload(),{assinarCorpo:false})).status,401);
  assert.equal((await enviar(url,payload('pag-split-01','evt-invalido','CONFIRMAR_FICTICIO',59000))).status,409);
  assert.equal((await enviar(url,payload('pag-nao-existe','evt-novoo'))).status,404);
  const base=assinado(payload());
  const semHeaders=await fetch(url+ROTA,{method:'POST',headers:{'Content-Type':'application/json'},body:base.body});
  assert.equal(semHeaders.status,401);
  const tipo=await fetch(url+ROTA,{
    method:'POST',headers:{...base.headers,'Content-Type':'text/plain'},body:base.body
  });
  assert.equal(tipo.status,415);
  const host=await fetch(url+ROTA,{
    method:'POST',headers:{...base.headers,Origin:'https://externo.invalid'},body:base.body
  });
  assert.equal(host.status,403);
  const extra=await enviar(url,{...payload(),token:'segredo'});
  assert.equal(extra.status,400);
  const grande=await fetch(url+ROTA,{
    method:'POST',headers:base.headers,body:' '.repeat(4200)
  });
  assert.equal(grande.status,413);
  const livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,0);
});

test('cenario reserva: so o valor de fornecedor reservado entra no livro, sem split real',async t=>{
  const {url}=await levantar(t,{habilitado:true});
  const p=payload('pag-reserva-02','evt-reserva-02');
  assert.equal((await enviar(url,p)).status,200);
  const livro=await saldo(url);
  assert.equal(livro.lancamentosRegistrados,3);
  assert.equal(cofre(livro,COFRES.DISTRIBUIDOR),30000);
  assert.equal(cofre(livro,COFRES.ESQUERDA),10000);
  assert.equal(cofre(livro,COFRES.COMERCIAL),20000);
  assert.equal((await enviar(url,payload('pag-reserva-02','evt-estorno-reserva','ESTORNAR_FICTICIO'))).status,200);
  assert.equal((await saldo(url)).lancamentosRegistrados,6);
});

test('evento assinado persiste e nao duplica apos reiniciar SQLite',async t=>{
  const arquivo=pastaTmp(t);
  const um=await levantar(t,{habilitado:true,arquivo});
  assert.equal((await enviar(um.url,payload('pag-split-03','evt-restart-01'))).status,200);
  // Outro processo logico/servidor sobre mesmo SQLite demonstra deduplicacao.
  const dois=await levantar(t,{habilitado:true,arquivo});
  assert.equal((await enviar(dois.url,payload('pag-split-03','evt-restart-01'))).status,200);
  const livro=await saldo(dois.url);
  assert.equal(livro.lancamentosRegistrados,2);
});

test('webhook nao existe na aplicacao publica',async t=>{
  const publico=require('../src/server');
  const s=publico.listen(0,'127.0.0.1');
  await once(s,'listening');
  t.after(()=>new Promise(resolve=>s.close(resolve)));
  const url='http://127.0.0.1:'+s.address().port;
  assert.equal((await enviar(url,payload())).status,404);
});
