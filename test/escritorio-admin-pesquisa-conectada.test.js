'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const token='operador-pesquisa-'+('K'.repeat(48)),raiz='/staging/escritorio-unificado/pesquisa';
test('pesquisa por pedidos, produtos e missões no SQLite, paginada e exclusiva do operador',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const catalogo=catalogoFicticioCheckout(),termosTexto='Ensaio técnico não comercial, sem vendas, saques ou pagamentos reais.';
 const ctx=criarAppLojaEscritorioCandidato({banco,repositorioCatalogo:catalogo,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:token,
  termosVersao:'LAB-pesquisa-2026',termosTexto});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 async function req(query,autenticado=true){
  const r=await fetch(base+raiz+'?'+query,{headers:autenticado?{Authorization:'Bearer '+token}:{}});
  return {status:r.status,data:await r.json()};
 }
 const pessoa=await ctx.contas.cadastrar({nome:'Marina de Ensaio',nick:'Marina',
  email:'marina-pesquisa@example.invalid',senha:'SenhaDeEnsaioSegura2026!',
  aceiteExplicito:true,termosVersao:'LAB-pesquisa-2026',termosTexto});
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const rascunho=ctx.intencoes.criar({titularId:pessoa.titularId,entrada,cotacao,
  chaveIdempotencia:'busca-admin-rascunho-0001'});
 const pedido=await ctx.prePedidos.preparar({titularId:pessoa.titularId,
  rascunhoId:rascunho.intencao.pedidoId,repositorioCatalogo:catalogo});
 const pid=pedido.prepedido.prepedidoId;
 for(let i=0;i<22;i++)ctx.missoes.criar({departamento:'PEDIDOS',prioridade:'NORMAL',
  titulo:'Conferência busca administrativa '+i,descricao:'Acompanhar processo de ensaio '+i,
  prepedidoId:i===0?pid:null,mensagemCliente:null},
  'busca-admin-missao-'+String(i).padStart(5,'0'));
 for(const tipo of ['pedidos','produtos','missoes'])
  assert.equal((await req('tipo='+tipo+'&termo=teste',false)).status,401);
 const a=await req('tipo=pedidos&termo=Marina');
 assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(a.data.total,1);
 assert.equal(a.data.resultados[0].id,pid);assert.equal(a.data.financeiroReal,false);
 assert.equal((await req('tipo=pedidos&termo='+encodeURIComponent(pid.slice(-14)))).data.total,1);
 const p=await req('tipo=produtos&termo=homologacao');
 assert.equal(p.status,200);assert.ok(p.data.resultados.some(x=>x.id==='curso-homologacao-250'));
 assert.equal((await req('tipo=produtos&termo=sem-produto-xyz')).data.total,0);
 const m0=await req('tipo=missoes&termo=Confer%C3%AAncia%20busca&pagina=0');
 const m1=await req('tipo=missoes&termo=Confer%C3%AAncia%20busca&pagina=1');
 assert.equal(m0.status,200,JSON.stringify(m0.data));assert.equal(m0.data.total,22);
 assert.equal(m0.data.resultados.length,20);assert.equal(m0.data.haMais,true);
 assert.equal(m1.data.resultados.length,2);assert.equal(m1.data.haMais,false);
 assert.equal(new Set([...m0.data.resultados,...m1.data.resultados].map(x=>x.id)).size,22);
 assert.equal((await req('tipo=missoes&termo='+encodeURIComponent(pid))).data.total,1);
 for(const invalid of ['tipo=nao&termo=teste','tipo=pedidos&termo=a',
  'tipo=pedidos&termo=teste&pagina=-1','tipo=pedidos&termo=teste&pagina=1.5',
  'tipo=pedidos&termo=teste&pagina=10001','tipo=pedidos&termo=teste&pagina=1&pagina=2',
  'tipo=pedidos&termo=teste&outro=1','tipo=pedidos&termo=%0Aabc'])
  assert.equal((await req(invalid)).status,400,invalid);
 const wildcard=await req('tipo=missoes&termo=%25%25');
 assert.equal(wildcard.status,200);assert.equal(wildcard.data.total,0);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_admin_missoes_staging').get().n,22);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('controles de pesquisa e navegação dos departamentos estão ligados',()=>{
 const root=path.join(__dirname,'..','src','candidato');
 const html=fs.readFileSync(path.join(root,'escritorio-admin-candidato-ui.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'escritorio-admin-candidato-ui.js'),'utf8');
 for(const id of ['formPesquisaAdmin','pesquisaTipoAdmin','pesquisaTermoAdmin',
  'pesquisaExecutarAdmin','pesquisaLimparAdmin','pesquisaResultadosAdmin',
  'pesquisaAnteriorAdmin','pesquisaProximoAdmin','pesquisaEstadoAdmin'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(js.includes("api('/pesquisa?'+q.toString())"));
 assert.ok(js.includes("panel.scrollIntoView({behavior:'smooth',block:'start'})"));
 assert.ok(js.includes("api('/departamentos/'+encodeURIComponent(codigo)"));
 assert.ok(js.includes('++sequenciaPesquisaAdmin;pesquisaAtualAdmin=null'));
});
