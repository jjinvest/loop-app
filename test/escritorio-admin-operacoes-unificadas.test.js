'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const token='operador-unificado-'+('K'.repeat(48));
const raiz='/staging/escritorio-unificado';
const codigos=['CLIENTES','PEDIDOS','PRODUTOS','ENTREGAS','INDICACOES',
 'POSICOES','FILAS','TABULEIRO','COFRES','SAQUES','SEGURANCA','OUTROS'];

test('12 departamentos operam no SQLite compartilhado sem inventar dados comerciais',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const catalogo=catalogoFicticioCheckout(),termosTexto='Ensaio técnico não comercial, sem vendas, saques ou pagamentos reais.';
 const ctx=criarAppLojaEscritorioCandidato({banco,repositorioCatalogo:catalogo,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:token,
  termosVersao:'LAB-unificado-admin-2026',termosTexto});
 const server=ctx.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close()});
 const base='http://127.0.0.1:'+server.address().port;
 async function get(route,autorizado=true){
  const res=await fetch(base+route,{headers:autorizado?{Authorization:'Bearer '+token}:{}});
  return {status:res.status,data:await res.json()};
 }
 const cadastro=async (nome,nick,email)=>ctx.contas.cadastrar({
  nome,nick,email,senha:'SenhaLaboratorioSegura2026!',
  aceiteExplicito:true,termosVersao:'LAB-unificado-admin-2026',termosTexto
 });
 const ana=await cadastro('Ana Exemplo','Ana','ana-unificada@example.invalid');
 await cadastro('Beatriz Exemplo','Beatriz','beatriz-unificada@example.invalid');
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const rascunho=ctx.intencoes.criar({titularId:ana.titularId,entrada,cotacao,
  chaveIdempotencia:'operacao-unificada-rascunho-0001'});
 const pedido=await ctx.prePedidos.preparar({titularId:ana.titularId,
  rascunhoId:rascunho.intencao.pedidoId,repositorioCatalogo:catalogo});
 const pid=pedido.prepedido.prepedidoId;
 for(let i=0;i<22;i++)ctx.missoes.criar({
  departamento:'OUTROS',prioridade:'NORMAL',titulo:'Missão integrada '+i,
  descricao:'Conferência operacional sem movimentação financeira '+i,
  prepedidoId:null,mensagemCliente:null
 },'operacao-unificada-missao-'+String(i).padStart(5,'0'));
 const initial=await get(raiz+'/departamentos');
 assert.equal(initial.status,200);assert.equal(initial.data.departamentos.length,12);
 for(const codigo of codigos){
  const rota=raiz+'/departamentos/'+codigo+'/operacao?pagina=0';
  assert.equal((await get(rota,false)).status,401,'visitante acessou '+codigo);
  const resposta=await get(rota);
  assert.equal(resposta.status,200,codigo+': '+JSON.stringify(resposta.data));
  const d=resposta.data;
  assert.equal(d.codigo,codigo);assert.equal(d.laboratorio,true);
  assert.equal(d.financeiroReal,false);assert.ok(d.descricao);
  assert.ok(Array.isArray(d.metricas));assert.ok(d.metricas.length>0,codigo);
  assert.ok(Array.isArray(d.acoes));assert.ok(d.acoes.length>0,codigo);
  assert.ok(Array.isArray(d.registros));assert.ok(d.registros.length<=20);
  assert.equal(d.haMais,(d.pagina+1)*d.porPagina<d.total);
  assert.equal(d.registros.length,Math.min(20,d.total));
  if(['COFRES','SAQUES'].includes(codigo)){
   assert.equal(d.estado,'BLOQUEADO_COMERCIAL');
   assert.equal(d.total,0);assert.match(d.mensagem,/bloqueados/);
  }
 }
 const clientes=(await get(raiz+'/departamentos/CLIENTES/operacao')).data;
 assert.equal(clientes.total,2,'cliente sem compra tambem precisa aparecer');
 assert.deepEqual(new Set(clientes.registros.map(x=>x.titulo)),new Set(['Ana','Beatriz']));
 assert.equal(clientes.registros.some(x=>JSON.stringify(x).includes('example.invalid')),false);
 const pedidos=(await get(raiz+'/departamentos/PEDIDOS/operacao')).data;
 assert.equal(pedidos.total,1);assert.equal(pedidos.registros[0].prepedidoId,pid);
 assert.equal(pedidos.acoes.includes('CONFERIR_PSP'),true);
 const produtos=(await get(raiz+'/departamentos/PRODUTOS/operacao')).data;
 assert.ok(produtos.registros.some(x=>x.produtoId==='curso-homologacao-250'));
 const outras=(await get(raiz+'/departamentos/OUTROS/operacao?pagina=1')).data;
 assert.equal(outras.total,22);assert.equal(outras.registros.length,2);
 const primeiro=(await get(raiz+'/departamentos/OUTROS/operacao?pagina=0')).data;
 assert.equal(new Set([...primeiro.registros,...outras.registros].map(x=>x.id)).size,22);
 const clientesBusca=await get(raiz+'/pesquisa?tipo=clientes&termo=Beatriz');
 assert.equal(clientesBusca.status,200);assert.equal(clientesBusca.data.total,1);
 assert.equal(clientesBusca.data.resultados[0].titulo,'Beatriz');
 for(const invalid of [
  raiz+'/departamentos/NAO_EXISTE/operacao',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=-1',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=1.5',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=0&pagina=1',
  raiz+'/departamentos/PEDIDOS/operacao?forcarGiro=true',
  raiz+'/pesquisa?tipo=clientes&termo=Beatriz&pagina=10001'
 ])assert.equal((await get(invalid)).status,400,invalid);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await get('/readyz')).status,200);
});
