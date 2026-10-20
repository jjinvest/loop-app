'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
test('API de saque exige sessao, valida origem, reserva uma vez e nao revela saldo alheio',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-ficticia-somente-teste-saque';
 const a=contas.cadastrar({nome:'Indicador Saque Protegido',
  email:'saque-indicador@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Convidado Compra Um',
  email:'saque-convidado-um@exemplo.invalid',senha,codigoIndicador:a.codigoConvite});
 const c=contas.cadastrar({nome:'Convidado Compra Dois',
  email:'saque-convidado-dois@exemplo.invalid',senha,codigoIndicador:a.codigoConvite});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async pedidoId=>comprovantes.get(pedidoId)});
 const compra=async(pedidoId,conta,valorCentavos,dia)=>{
  comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,produtoId:'pdf-laboratorio',
   valorCentavos,confirmadoEm:'2030-05-'+dia+'T12:00:00.000Z',
   status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId});
 };
 assert.equal((await compra('base-compra-50',a,5000,'01')).posicaoCriada,false);
 new AdesoesPosicoesDemoSQLite({ponte}).ativar({
  contaId:a.contaId,cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
 });
 assert.equal((await compra('primeiro-indicado-250',b,25000,'02')).comissaoSimuladaCentavos,0);
 assert.equal((await compra('segundo-indicado-250',c,25000,'03')).comissaoSimuladaCentavos,0);
 const ativarVerde=new AdesoesPosicoesDemoSQLite({ponte,
  relogio:()=> '2030-05-03T12:30:00.000Z'});
 assert.equal(ativarVerde.ativar({contaId:b.contaId,
  cpfFicticio:'12345678909',aceitaTermos:true,
  versaoTermos:'LOOP-DEMO-V1'}).bonificacoes[0].valorComissaoCentavos,2500);
 assert.equal(ativarVerde.ativar({contaId:c.contaId,
  cpfFicticio:'52998224725',aceitaTermos:true,
  versaoTermos:'LOOP-DEMO-V1'}).bonificacoes[0].valorComissaoCentavos,2500);
 const segredo='chave-testes-api-saques-2026-123456789';
 const servidor=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const url='http://127.0.0.1:'+servidor.address().port+'/api/laboratorio/participante';
 const cabeca={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 async function chamar(caminho,{method='GET',cookie=null,body=null,header=cabeca}={}){
  const res=await fetch(url+caminho,{method,headers:{...header,...(cookie?{Cookie:cookie}:{})},
   ...(body===null?{}:{body:JSON.stringify(body)})});
  return {status:res.status,body:await res.json(),headers:res.headers};
 }
 async function entrar(nome){
  const resposta=await chamar('/entrar',{method:'POST',body:{nome,senha}});
  assert.equal(resposta.status,200);
  return resposta.headers.get('set-cookie').split(';')[0];
 }
 const cookieA=await entrar(a.nome);
 const cookieB=await entrar(b.nome);
 const id1='saque-11111111-2222-4333-8444-555555555555';
 const id2='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 const body={solicitacaoId:id1,tipo:'BONUS',valorSolicitadoCentavos:2500};
 assert.equal((await chamar('/saques-simulados')).status,401);
 assert.equal((await chamar('/saques-simulados',{method:'POST',body})).status,401);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,body,
  header:{'Content-Type':'application/json'}})).status,403);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,body,
  header:{...cabeca,'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,contaId:b.contaId}})).status,400);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,saldoSimuladoCentavos:9999999}})).status,400);
 const resumoInicial=await chamar('/saques-simulados',{cookie:cookieA});
 assert.equal(resumoInicial.status,200);
 assert.equal(resumoInicial.body.bonusDisponivelSimuladoCentavos,5000);
 assert.equal(resumoInicial.body.transferenciasExecutadas,false);
 const primeira=await chamar('/saques-simulados',{method:'POST',cookie:cookieA,body});
 assert.equal(primeira.status,200);
 assert.equal(primeira.body.taxaSaqueCentavos,75);
 assert.equal(primeira.body.valorLiquidoCentavos,2425);
 assert.equal(primeira.body.origemExclusiva,'LOOP_DIREITA');
 assert.equal(primeira.body.repetida,false);
 assert.equal(primeira.body.transferenciaExecutada,false);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,body})).body.repetida,true);
 const depois=await chamar('/saques-simulados',{cookie:cookieA});
 assert.equal(depois.body.bonusDisponivelSimuladoCentavos,2500);
 assert.equal(depois.body.historico.length,1);
 assert.equal(depois.body.historico[0].solicitacaoId,id1);
 assert.equal(depois.body.historico[0].transferenciaExecutada,false);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieB,body})).status,409);
 assert.equal((await chamar('/saques-simulados',{cookie:cookieB})).body.historico.length,0);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,valorSolicitadoCentavos:5000}})).status,409);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,solicitacaoId:id2,valorSolicitadoCentavos:2499}})).status,400);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,solicitacaoId:id2,tipo:'PARTICIPACAO_LUCRO'}})).status,409);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,solicitacaoId:id2,tipo:'PIX_REAL'}})).status,400);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,solicitacaoId:id2}})).status,200);
 assert.equal((await chamar('/saques-simulados',{method:'POST',cookie:cookieA,
  body:{...body,solicitacaoId:'saque-00000000-1111-4333-8444-aaaaaaaaaaaa'}})).status,409);
 const final=await chamar('/saques-simulados',{cookie:cookieA});
 assert.equal(final.body.bonusDisponivelSimuladoCentavos,0);
 assert.equal(final.body.bonusSolicitadoSimuladoCentavos,5000);
 assert.equal(final.body.historico.length,2);
 assert.equal(final.body.pagamentosReais,false);
 // Livro de pedidos nao registra dinheiro nem cria eventos PSP, somente reserva ficticia.
 const n=repo.banco.prepare('SELECT count(*) AS n FROM admin_solicitacoes_saque_demo').get().n;
 assert.equal(n,2);
 const real=repo.banco.prepare('SELECT count(*) AS n FROM admin_fin_demo_lancamentos').get().n;
 assert.equal(real,0);
});
