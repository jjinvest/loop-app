'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('API da ponte exige admin local, rejeita pedido inventado e nao existe no publico',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const chave='chave-completa-laboratorio-ponte-v6-2026';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:chave}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const uri='/api/admin/circuit-break-v6-demo/ponte';
 assert.equal((await fetch(base+uri)).status,401);
 const cabecalho={Authorization:'Bearer '+chave,'Content-Type':'application/json'};
 const leitura=await fetch(base+uri,{headers:cabecalho});
 assert.equal(leitura.status,200);
 const estado=await leitura.json();
 assert.equal(estado.comprasElegiveis,0);
 assert.equal(estado.catraca,'PAUSADA');
 const recursoLivro=base+uri+'/provisoes';
 assert.equal((await fetch(recursoLivro)).status,401);
 const livro=await fetch(recursoLivro,{headers:cabecalho});
 assert.equal(livro.status,200);
 const vazio=await livro.json();
 assert.equal(vazio.ciclosRegistrados,0);
 assert.equal(vazio.eventosDocumentados,0);
 assert.equal(vazio.centroDisponivelParaSaqueCentavos,0);
 assert.equal(vazio.valorRealLiquidadoCentavos,0);
 assert.equal((await fetch(recursoLivro,{method:'POST',headers:cabecalho,
   body:JSON.stringify({saldoSacavel:75000})})).status,404);
 const enviar=async body=>{
   const r=await fetch(base+uri+'/liberar',{method:'POST',headers:cabecalho,
    body:JSON.stringify(body)});
   return {status:r.status,data:await r.json()};
 };
 const pedido={comandoId:'cb-ponte-http001',quantidade:1,revisaoEsperada:0};
 assert.equal((await enviar({...pedido,pedidoId:'inventado'})).status,400);
 assert.equal((await enviar({...pedido,valorCentavos:250000})).status,400);
 assert.equal((await enviar(pedido)).status,409);
 assert.equal((await enviar(pedido)).data.erro,'CATRACA_PAUSADA');
 const pagina=await fetch(base+'/admin/circuit-break-v6');
 assert.equal(pagina.status,200);
 assert.match(await pagina.text(),/compras fictícias cadastradas/i);
 const publico=require('../src/server').listen(0,'127.0.0.1');
 await once(publico,'listening');
 t.after(()=>new Promise(resolve=>publico.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publico.address().port+uri)).status,404);
 assert.equal((await fetch('http://127.0.0.1:'+publico.address().port+uri+'/provisoes')).status,404);
});
