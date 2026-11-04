'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const ADMIN='operador-departamentos-'+('V'.repeat(48));
test('departamentos, filtros, paginação, triagem idempotente e bloqueio financeiro',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const catalogo=catalogoFicticioCheckout();
 const ctx=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogo,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-departamentos-2026',
  termosTexto:'Ensaio técnico não comercial, sem vendas, saques ou pagamentos reais.'
 });
 const srv=ctx.app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(async()=>{await new Promise(done=>srv.close(done));banco.close()});
 const base='http://127.0.0.1:'+srv.address().port;
 const request=async(p,{method='GET',token=ADMIN,body}={})=>{
  const r=await fetch(base+p,{method,headers:{
   ...(token?{Authorization:'Bearer '+token}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,payload:await r.json().catch(()=>({}))};
 };
 const root='/staging/escritorio-unificado';
 assert.equal((await request(root+'/posicoes-historico',{token:null})).status,401);
 assert.equal((await request(root+'/posicoes-historico?cursor=invalido')).status,400);
 assert.equal((await request(root+'/posicoes-historico?cursor=a&cursor=b')).status,400);
 const historico=await request(root+'/posicoes-historico');
 assert.equal(historico.status,200);assert.deepEqual(historico.payload.itens,[]);
 assert.equal(historico.payload.posicoesReaisCriadas,0);
 assert.equal((await request(root+'/departamentos',{token:null})).status,401);
 assert.equal((await request(root+'/alertas',{token:null})).status,401);
 assert.equal((await request(root+'/alertas/qualquer/abrir-missao',{method:'POST',body:{},token:null})).status,401);
 const inicial=await request(root+'/departamentos');
 assert.equal(inicial.status,200,JSON.stringify(inicial.payload));
 assert.equal(inicial.payload.departamentos.length,12);
 assert.equal(inicial.payload.administracaoFinanceiraRealHabilitada,false);
 assert.equal(inicial.payload.departamentos.find(x=>x.codigo==='COFRES').quantidadeDadosLaboratorio,null);
 assert.equal(inicial.payload.departamentos.find(x=>x.codigo==='SAQUES').dadosComerciaisConectados,false);
 assert.equal(inicial.payload.departamentos.find(x=>x.codigo==='CLIENTES').quantidadeDadosLaboratorio,0);
 const pessoa=await ctx.contas.cadastrar({
  nome:'Ana de Ensaio',nick:'Ana',email:'ana-admin@example.invalid',
  senha:'SenhaDeEnsaioComSeguranca2026!',aceiteExplicito:true,
  termosVersao:'LAB-departamentos-2026',
  termosTexto:'Ensaio técnico não comercial, sem vendas, saques ou pagamentos reais.'
 });
 const itens={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada:itens});
 const rascunho=ctx.intencoes.criar({
  titularId:pessoa.titularId,chaveIdempotencia:'departamentos-2026-rascunho-001',
  entrada:itens,cotacao
 });
 const pedido=await ctx.prePedidos.preparar({
  titularId:pessoa.titularId,rascunhoId:rascunho.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 const pid=pedido.prepedido.prepedidoId;
 assert.equal((await request(root+'/alertas/'+pid+'/abrir-missao',{
  method:'POST',body:{}})).status,409,'nenhum alerta deve ser inventado para um pedido limpo');
 ctx.ponte.preparar({
  titularId:pessoa.titularId,prepedidoId:pid,clienteAsaasId:'cus_CLIENTEFAKE2026'
 });
 await assert.rejects(ctx.ponte.enviarUmaVez({
  titularId:pessoa.titularId,prepedidoId:pid,
  provedor:{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   criarCobrancaPix:async()=>{throw Error('falha de rede simulada sem PSP');}},
  execucaoLiberada:true
 }),/falha de rede simulada/);
 const alertas=await request(root+'/alertas?pagina=0');
 assert.equal(alertas.status,200);
 assert.equal(alertas.payload.alertas.length,1);
 assert.equal(alertas.payload.alertas[0].prepedidoId,pid);
 assert.equal(alertas.payload.alertas[0].prioridade,'CRITICA');
 assert.equal((await request(root+'/alertas?pagina=-1')).status,400);
 assert.equal((await request(root+'/alertas?pagina=0&outro=1')).status,400);
 const rota=root+'/alertas/'+pid+'/abrir-missao';
 const criado=await request(rota,{method:'POST',body:{}});
 assert.equal(criado.status,201,JSON.stringify(criado.payload));
 const repetido=await request(rota,{method:'POST',body:{}});
 assert.equal(repetido.status,200);
 assert.equal(repetido.payload.id,criado.payload.id);
 const departamentos=await request(root+'/departamentos');
 assert.equal(departamentos.payload.departamentos.find(x=>x.codigo==='PEDIDOS').missoesPendentes,1);
 const filtrado=await request(root+'/missoes?departamento=PEDIDOS&situacao=ABERTA&pagina=0');
 assert.equal(filtrado.status,200);
 assert.equal(filtrado.payload.total,1);
 assert.equal(filtrado.payload.missoes[0].id,criado.payload.id);
 assert.equal((await request(root+'/missoes?departamento=COFRES')).payload.total,0);
 assert.equal((await request(root+'/missoes?departamento=INJECAO')).status,400);
 assert.equal((await request(root+'/missoes?pagina=1.2')).status,400);
 assert.equal((await request(root+'/missoes?outro=1')).status,400);
 assert.equal((await request(root+'/alertas/'+pid+'/abrir-missao',{
  method:'POST',body:{erro:true}})).status,400);
 assert.equal((await request(root+'/missoes/'+criado.payload.id+'/historico')).payload.historico.length,1);
 assert.equal((await request('/staging/checkout/finalizar',{method:'POST',body:{}})).status,503);
 assert.equal((await request('/readyz')).status,200);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('pagination por departamento não mistura tarefas ou devolve mais do que a página',()=>{
 const {MissoesOperacionaisCandidatoSQLite}=require('../src/domain/missoes-operacionais-candidato-sqlite');
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 try{
  const repo=new MissoesOperacionaisCandidatoSQLite({banco});
  for(let i=0;i<29;i++)repo.criar({
   departamento:i%2?'PRODUTOS':'SEGURANCA',prioridade:'NORMAL',
   titulo:'Conferência operacional '+i,
   descricao:'Acompanhamento administrativo de homologação: '+i,
   prepedidoId:null,mensagemCliente:null
  },'depto-loop-missao-'+String(i).padStart(5,'0'));
  const a=repo.listar({departamento:'SEGURANCA',pagina:0});
  assert.equal(a.total,15);
  assert.equal(a.haMais,false);
  assert.equal(a.missoes.length,15);
  const p=repo.listar({pagina:0});
  assert.equal(p.total,29);assert.equal(p.haMais,true);
  assert.equal(p.missoes.length,25);
  const q=repo.listar({pagina:1});
  assert.equal(q.total,29);assert.equal(q.missoes.length,4);
  assert.deepEqual(new Set([...p.missoes,...q.missoes].map(x=>x.id)).size,29);
  assert.throws(()=>repo.listar({situacao:'INJETADO'}),/SITUACAO_INVALIDA/);
  assert.throws(()=>repo.listar({pagina:-1}),/PAGINA_INVALIDA/);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});
test('diagnóstico departamental recusa produção',()=>{
 const {DepartamentosAdministradorCandidato}=require('../src/domain/escritorio-admin-departamentos-candidato');
 const original=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{assert.throws(()=>new DepartamentosAdministradorCandidato(),/ADMIN_DEPARTAMENTOS_NAO_HOMOLOGADO/);}
 finally{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
});
