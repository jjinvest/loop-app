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
 assert.deepEqual(new Set(clientes.registros.map(x=>x.titulo)),new Set(['ana','beatriz']));
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
 assert.equal(clientesBusca.data.resultados[0].titulo,'beatriz');
 for(const invalid of [
  raiz+'/departamentos/NAO_EXISTE/operacao',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=-1',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=1.5',
  raiz+'/departamentos/PEDIDOS/operacao?pagina=0&pagina=1',
  raiz+'/departamentos/PEDIDOS/operacao?forcarGiro=true',
  raiz+'/pesquisa?tipo=clientes&termo=Beatriz&pagina=10001'
 ])assert.equal((await get(invalid)).status,400,invalid);
 // Fluxo real HTTP pelo MESMO gateway administrativo e mesmo motor.
 const urlDourada=raiz+'/motor/douradas/criar';
 const evento='dourada-api-operador-0001';
 async function postDourada(body,autorizado=true){
  const resp=await fetch(base+urlDourada,{
   method:'POST',headers:{'Content-Type':'application/json',
    ...(autorizado?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify(body)});
  return {status:resp.status,data:await resp.json()};
 }
 assert.equal((await postDourada({eventoId:evento,aceiteEnsaio:true},false)).status,401);
 assert.equal((await postDourada({eventoId:evento,aceiteEnsaio:false})).status,400);
 assert.equal((await postDourada({eventoId:evento,aceiteEnsaio:true,quantidade:100})).status,400);
 assert.equal((await postDourada({eventoId:evento,aceiteEnsaio:true})).status,201);
 const repetir=await postDourada({eventoId:evento,aceiteEnsaio:true});
 assert.equal(repetir.status,200);assert.equal(repetir.data.repetido,true);
 const estadoMotor=await get(raiz+'/motor/estado');
 assert.equal(estadoMotor.status,200);
 assert.equal(estadoMotor.data.douradasManuaisCriadas,1);
 assert.equal(estadoMotor.data.filaB.filter(x=>x.dourada).length,1);
 assert.equal(estadoMotor.data.catraca.giros,0);
 const depTabuleiro=(await get(raiz+'/departamentos/TABULEIRO/operacao')).data;
 assert.ok(depTabuleiro.acoes.includes('CRIAR_DOURADA'));
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_douradas_manuais_lab').get().n,1);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,0);

 // Cadastro interno por produto: custo/LOOP/margem somente no administrador.
 const produtoAlvo='curso-homologacao-250';
 async function putInterno(path,body,method='PUT',authorized=true){
  const res=await fetch(base+raiz+path,{method,
   headers:{'Content-Type':'application/json',
    ...(authorized?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 }
 assert.equal((await get(raiz+'/produtos/'+produtoAlvo+'/custos',false)).status,401);
 const ausente=(await get(raiz+'/produtos/'+produtoAlvo+'/custos')).data;
 assert.equal(ausente.situacao,'CUSTOS_NAO_CADASTRADOS');
 assert.equal(ausente.referenciaLoopCentavos,0,'cinza nao destina LOOP');
 assert.equal((await putInterno('/produtos/'+produtoAlvo,{revisaoEsperada:0,
  alteracoes:{precoCentavos:50000}},'PATCH')).status,200);
 assert.equal((await putInterno('/sinalizacao/'+produtoAlvo,{
  classificacao:'DOURADO',quantidadeMinimaLoop:1,revisaoEsperada:0
 },'PATCH')).status,200);
 const custoEnsaio={
  custoFornecedorCentavos:17500,freteCustoCentavos:1500,
  tarifaPspEstimadaCentavos:500,reservaTributariaEstimadaCentavos:500,
  revisaoEsperada:0
 };
 assert.equal((await putInterno('/produtos/'+produtoAlvo+'/custos',
  custoEnsaio,'PUT',false)).status,401);
 const salvo=await putInterno('/produtos/'+produtoAlvo+'/custos',custoEnsaio);
 assert.equal(salvo.status,200,JSON.stringify(salvo));
 assert.equal(salvo.data.referenciaLoopCentavos,25000);
 assert.equal(salvo.data.somaCustosEstimadosCentavos,20000);
 assert.equal(salvo.data.margemComercialEstimadaCentavos,5000);
 assert.equal(salvo.data.classificacao,'DOURADO');
 assert.equal(salvo.data.financeiroReal,false);
 assert.equal((await putInterno('/produtos/'+produtoAlvo+'/custos',
  custoEnsaio)).status,409,'revisao concorrente nao pode sobrescrever custos');
 assert.equal((await putInterno('/produtos/'+produtoAlvo+'/custos',
  {...custoEnsaio,custoFornecedorCentavos:-1,revisaoEsperada:1}
 )).status,400);
 const publico=await get('/staging/catalogo-produtos');
 // A privacidade vale independentemente da rota pública disponibilizada.
 if(publico.status===200){
  assert.equal(JSON.stringify(publico.data).includes('custoFornecedorCentavos'),false);
  assert.equal(JSON.stringify(publico.data).includes('margemComercialEstimadaCentavos'),false);
 }
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_custos_produtos_admin_historico_lab').get().n,1);
 assert.throws(()=>banco.exec('DELETE FROM akitemm_custos_produtos_admin_historico_lab'),
  /custo historico imutavel/);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await get('/readyz')).status,200);
});
