'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('Circuit Break V6: painel local, API autenticada, giro de verdade no motor ficticio',async t=>{
  const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
  t.after(()=>repo.fechar());
  const segredo='segredo-administrativo-seguro-de-laboratorio-2026';
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo});
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const get=(path,auth=true)=>fetch(base+path,auth?
    {headers:{Authorization:'Bearer '+segredo}}:{});
  const semChave=await get('/api/admin/circuit-break-v6-demo',false);
  assert.equal(semChave.status,401);
  const pagina=await get('/admin/circuit-break-v6',false);
  assert.equal(pagina.status,200);
  assert.match(await pagina.text(),/Gerar 30 compras fictícias/);
  const script=await get('/admin/circuit-break-v6.js',false);
  assert.equal(script.status,200);
  assert.match(await script.text(),/LIBERAR_LOTE/);
  let quadro=await (await get('/api/admin/circuit-break-v6-demo')).json();
  assert.equal(quadro.girosConcluidos,0);
  const post=async(tipo,valor,comandoId)=>{
    const request={tipo,comandoId,revisaoEsperada:quadro.revisao};
    if(valor!==undefined)request.valor=valor;
    const res=await fetch(base+'/api/admin/circuit-break-v6-demo/comandos',{
      method:'POST',
      headers:{Authorization:'Bearer '+segredo,'Content-Type':'application/json'},
      body:JSON.stringify(request)
    });
    const data=await res.json();
    if(res.ok)quadro=data.resumo;
    return {code:res.status,data};
  };
  assert.equal((await post('LIBERAR_LOTE',1,'cb-http-pausada-0001')).code,409);
  assert.equal((await post('ABRIR',undefined,'cb-http-abrir-0002')).code,200);
  assert.equal((await post('LIBERAR_LOTE',1,'cb-http-faltam-0003')).code,409);
  assert.equal((await post('GERAR_30_COMPRAS',undefined,'cb-http-criar-0004')).code,200);
  assert.equal(quadro.girosProntos,5);
  assert.equal((await post('LIBERAR_LOTE',5,'cb-http-girar-0005')).code,200);
  assert.equal(quadro.girosConcluidos,5);
  assert.equal(quadro.comprasFicticiasProcessadas,30);
  assert.equal(quadro.financeiroFicticio.investimentoCentavos,250000);
  const hist=await (await get('/api/admin/circuit-break-v6-demo/historico')).json();
  assert.equal(hist.historico.length,3);
  assert.equal(hist.historico[0].tipo,'LIBERAR_LOTE');
  assert.equal((await post('LIBERAR_LOTE',1,'cb-http-girar-de-novo')).code,409);
  const semJson=await fetch(base+'/api/admin/circuit-break-v6-demo/comandos',{
    method:'POST',headers:{Authorization:'Bearer '+segredo,'Content-Type':'text/plain'},
    body:'texto'
  });
  assert.equal(semJson.status,415);
  const publico=require('../src/server').listen(0,'127.0.0.1');
  await once(publico,'listening');
  t.after(()=>new Promise(resolve=>publico.close(resolve)));
  assert.equal((await fetch('http://127.0.0.1:'+
    publico.address().port+'/api/admin/circuit-break-v6-demo')).status,404);
});
