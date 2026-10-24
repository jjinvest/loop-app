'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {ConfiguracaoValorLoopDemoSQLite,compararParcelaAntigaComNova}=
 require('../src/domain/configuracao-valor-loop-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const antes='2026-10-15T10:30:00.000Z';
const inicio='2026-10-15T11:00:00.000Z';
const depois='2026-10-15T11:30:00.000Z';
const TOKEN='admin-reajuste-valor-loop-laboratorio-2026-12345678';
function configurar(t){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conf=new ConfiguracaoValorLoopDemoSQLite({banco:repo.banco,agora:()=>inicio});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco:repo.banco,contas,
  relogio:()=> '2026-10-15T09:00:00.000Z'});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados:pedidos,configuracaoValor:conf,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=>depois
 });
 return {repo,contas,conf,pedidos,comprovantes,ponte};
}
function cadastrar(c,n,e,codigoIndicador){
 return c.cadastrar({nome:n,email:e,senha:'senha-ficticia-de-teste-2026',codigoIndicador});
}
async function venda(m,id,titular,valor,confirmadoEm=depois){
 const pedido=m.pedidos.preparar({pedidoId:id,contaId:titular.contaId,
  produtoId:'produto-vitrine-demo',valorCentavos:valor});
 m.comprovantes.set(id,{...pedido,status:STATUS_CONFIRMADO,confirmadoEm});
 return m.ponte.processar({pedidoId:id});
}
test('valor inicial R$250, historico imutavel e alteracao versionada para R$500',t=>{
 const m=configurar(t);
 assert.deepEqual(m.conf.historico().map(x=>x.valorCentavos),[25000]);
 const r=m.conf.alterar({valorCentavos:50000,revisaoEsperada:1});
 assert.equal(r.alterado,true);
 assert.equal(r.revisao,2);
 assert.equal(r.vigenteDesde,inicio);
 assert.deepEqual(m.conf.historico().map(x=>x.valorCentavos),[25000,50000]);
 assert.equal(m.conf.vigenteEm(antes).valorCentavos,25000);
 assert.equal(m.conf.vigenteEm(inicio).valorCentavos,50000);
 assert.equal(m.conf.vigenteEm(depois).valorCentavos,50000);
 assert.throws(()=>m.conf.alterar({valorCentavos:100000,revisaoEsperada:1}),
  e=>e.codigo==='CONFLITO_REVISAO');
 assert.equal(m.conf.alterar({valorCentavos:50000,revisaoEsperada:2}).alterado,false);
 assert.throws(()=>m.repo.banco.exec('DELETE FROM admin_valor_loop_versoes_demo'),/imutavel/);
 assert.throws(()=>m.repo.banco.exec(
  'UPDATE admin_valor_loop_versoes_demo SET valor_centavos=25000 WHERE revisao=2'
 ),/imutavel/);
 assert.deepEqual(m.conf.historico().map(x=>x.valorCentavos),[25000,50000]);
});
test('apos marco R$500, compradores R$250/R$300 seguem na loja sem ocupar fila; nova R$500 entra',async t=>{
 const m=configurar(t);
 const antiga=cadastrar(m.contas,'Cliente Antiga','antiga@exemplo.invalid');
 const atual=cadastrar(m.contas,'Cliente Nova','nova@exemplo.invalid');
 const previa=await venda(m,'compra-antiga',antiga,25000,antes);
 assert.equal(previa.posicaoCriada,true);
 assert.equal(previa.valorReferenciaPosicaoCentavos,25000);
 assert.equal(previa.revisaoValorPosicao,1);
 m.conf.alterar({valorCentavos:50000,revisaoEsperada:1});
 const pequenas=[];
 for(const [i,valor] of [25000,30000,49999].entries()){
  const x=await venda(m,'normal-'+i,atual,valor);
  pequenas.push(x);
  assert.equal(x.posicaoCriada,false);
  assert.equal(x.indicacaoNova,false);
  assert.equal(x.vendaLojaRegistrada,true);
 }
 const nova=await venda(m,'compra-nova',atual,50000);
 assert.equal(nova.posicaoCriada,true);
 assert.equal(nova.revisaoValorPosicao,2);
 assert.equal(nova.valorReferenciaPosicaoCentavos,50000);
 const s=m.ponte.consultar();
 assert.equal(s.compras.length,2);
 assert.equal(s.comprasLojaSemLoop.length,3);
 assert.equal(s.filas.B.quantidade,2);
 assert.equal(s.filas.A.quantidade,0);
 assert.deepEqual(s.valoresDeCadaPosicao.map(x=>x.valorReferenciaCentavos),[25000,50000]);
 assert.deepEqual(s.valoresDeCadaPosicao.map(x=>x.revisaoValor),[1,2]);
 assert.equal(s.referenciaAtualLoop.valorCentavos,50000);
 assert.equal((await m.ponte.processar({pedidoId:'compra-antiga'})).valorReferenciaPosicaoCentavos,25000);
 assert.equal((await m.ponte.processar({pedidoId:'normal-1'})).posicaoCriada,false);
 assert.equal(m.ponte.consultar().compras.length,2);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,3);
 const c=m.repo.banco.prepare('SELECT COUNT(*) AS total FROM admin_ponte_posicoes_valores_demo').get();
 assert.equal(c.total,2);
 assert.throws(()=>m.repo.banco.exec(
  'UPDATE admin_ponte_posicoes_valores_demo SET valor_referencia_centavos=50000'
 ),/imutavel/);
});
test('convidado com compra normal R$300 nao promove indicador antigo; R$500 valida convite',async t=>{
 const m=configurar(t);
 const raiz=cadastrar(m.contas,'Pessoa Indicadora','indicadora@exemplo.invalid');
 const convite=cadastrar(m.contas,'Pessoa Convidada','convidada@exemplo.invalid',raiz.codigoConvite);
 await venda(m,'raiz-250',raiz,25000,antes);
 m.conf.alterar({valorCentavos:50000,revisaoEsperada:1});
 const sem=await venda(m,'convite-loja-300',convite,30000);
 assert.equal(sem.indicacaoNova,false);
 assert.equal(m.ponte.consultar().convites.length,0);
 assert.equal(m.ponte.consultar().filas.A.quantidade,0);
 const com=await venda(m,'convite-loop-500',convite,50000);
 assert.equal(com.indicacaoNova,true);
 assert.equal(m.ponte.consultar().convites.length,1);
 assert.equal(m.ponte.consultar().filas.A.quantidade,1);
 assert.equal(m.ponte.consultar().filas.B.quantidade,1);
 assert.deepEqual(m.ponte.consultar().valoresDeCadaPosicao
  .map(p=>p.valorReferenciaCentavos),[25000,50000]);
});
test('comparacao de ciclo antigo so calcula hipotese sem mover um centavo',()=>{
 const a=compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:25000,valorNovaVendaLoopCentavos:50000,
  evento:'PARTICIPANTE'
 });
 assert.equal(a.valorParticipanteCentavos,25000);
 assert.equal(a.valorEmpresaPropostoCentavos,25000);
 assert.equal(a.diferencaDeReferenciaCentavos,25000);
 assert.equal(a.dinheiroMovimentado,false);
 assert.equal(a.obrigacaoRealDefinida,false);
 assert.equal(compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:50000,valorNovaVendaLoopCentavos:50000,
  evento:'PARTICIPANTE'
 }).valorParticipanteCentavos,50000);
 const empresa=compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:25000,valorNovaVendaLoopCentavos:50000,
  evento:'EMPRESA'
 });
 assert.equal(empresa.valorEmpresaPropostoCentavos,50000);
 assert.throws(()=>compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:-1,valorNovaVendaLoopCentavos:50000
 }),e=>e.codigo==='VALOR_INVALIDO');
});
test('admin local muda valor; acesso publico nao oferece configurar e rejeita extras',async t=>{
 const m=configurar(t);
 const app=criarAppAdminLaboratorio({repositorio:m.repo,segredo:TOKEN});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const path='/api/admin/valor-loop-demo';
 const auth={Authorization:'Bearer '+TOKEN};
 assert.equal((await fetch(base+path)).status,401);
 assert.equal((await fetch(base+path,{headers:{
  ...auth,Origin:'https://outro-site.invalid'
 }})).status,403);
 const prevSemPermissao=await fetch(base+path+'/impacto?novoValorCentavos=50000');
 assert.equal(prevSemPermissao.status,401);
 const prevOK=await fetch(base+path+'/impacto?novoValorCentavos=50000',{headers:auth});
 assert.equal(prevOK.status,200);
 const impact=await prevOK.json();
 assert.equal(impact.valorNovoCentavos,50000);
 assert.equal(impact.simulacaoSemSalvar,true);
 assert.equal(impact.filaUnica,true);
 assert.equal((await fetch(base+path+'/impacto?novoValorCentavos=0',{headers:auth})).status,400);
 assert.equal((await fetch(base+path+'/impacto?novoValorCentavos=50000&cpf=extra',{headers:auth})).status,400);
  const antesHttp=await(await fetch(base+path,{headers:auth})).json();
 assert.equal(antesHttp.atual.valorCentavos,25000);
 assert.equal(antesHttp.historico.length,1);
 const patch=async body=>fetch(base+path,{
  method:'PATCH',headers:{...auth,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
 assert.equal((await patch({valorCentavos:50000,revisaoEsperada:1,cpf:'falso'})).status,400);
 assert.equal((await patch({valorCentavos:0,revisaoEsperada:1})).status,400);
 assert.equal((await patch({valorCentavos:50000,revisaoEsperada:0})).status,400);
 const valido=await patch({valorCentavos:50000,revisaoEsperada:1});
 assert.equal(valido.status,200);
 const resposta=await valido.json();
 assert.equal(resposta.atual.valorCentavos,50000);
 const financeiroResp=await fetch(base+'/api/admin/financeiro-demo?modo=split',{headers:auth});
 assert.equal(financeiroResp.status,200);
 const financeiroNovo=await financeiroResp.json();
 assert.equal(financeiroNovo.parcelaReferenciaVigenteNoCenarioCentavos,50000);
 assert.equal(financeiroNovo.totalLoopCentavos,300000);
 assert.equal(financeiroNovo.totalFornecedorCentavos,180000);
 assert.equal(financeiroNovo.totalSobraBrutaCentavos,30000);
 assert.ok(financeiroNovo.vendas.every(v=>v.parcelaLoopCentavos===50000));
 assert.equal(financeiroNovo.simulacaoApenasProspectiva,true);
 assert.equal(resposta.historico.length,2);
 assert.equal(resposta.pagamentosReais,false);
 assert.equal((await patch({valorCentavos:75000,revisaoEsperada:1})).status,409);
 const preview=await(await fetch(base+path+'/comparacao'+
  '?evento=PARTICIPANTE&valorCentroOriginalCentavos=25000&valorNovaVendaLoopCentavos=50000',
  {headers:auth})).json();
 assert.equal(preview.valorEmpresaPropostoCentavos,25000);
 assert.equal(preview.dinheiroMovimentado,false);
 const pag=await(await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(pag,/formValorLoopDemo/);
 assert.match(pag,/simularImpactoValorLoopDemo/);
 const js=await(await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(js,/carregarValorLoop/);
 assert.match(js,/simularImpactoValorLoop/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
 const publico=require('../src/server');
 const open=publico.listen(0,'127.0.0.1');
 await once(open,'listening');
 t.after(()=>new Promise(resolve=>open.close(resolve)));
 const url='http://127.0.0.1:'+open.address().port;
 assert.equal((await fetch(url+path)).status,404);
 assert.equal((await fetch(url+path,{method:'PATCH',headers:{
  'Content-Type':'application/json'
 },body:'{}'})).status,404);
});

test('previa de R$500 mostra grupos historicos e nao altera posicoes ou configuracao',async t=>{
 const m=configurar(t);
 const pessoa=cadastrar(m.contas,'Cohort Antiga','cohort@exemplo.invalid');
 await venda(m,'compra-cohort-250',pessoa,25000,antes);
 const primeiro=m.conf.simularImpacto({novoValorCentavos:50000});
 assert.equal(primeiro.valorAtualCentavos,25000);
 assert.equal(primeiro.valorNovoCentavos,50000);
 assert.equal(primeiro.totalPosicoesRegistradas,1);
 assert.equal(primeiro.grupos.length,1);
 assert.equal(primeiro.grupos[0].posicoesRegistradas,1);
 assert.equal(primeiro.grupos[0].referenciaOriginalCentavos,25000);
 assert.equal(primeiro.grupos[0].comparacaoEventoParticipante.valorEmpresaPropostoCentavos,25000);
 assert.equal(primeiro.grupos[0].comparacaoEventoParticipante.dinheiroMovimentado,false);
 assert.equal(primeiro.diferencaNaoVaiAutomaticamenteParaEmpresa,true);
 assert.equal(m.conf.atual().valorCentavos,25000);
 assert.equal(m.ponte.consultar().filas.B.quantidade,1);
 m.conf.alterar({valorCentavos:50000,revisaoEsperada:1});
 await venda(m,'compra-cohort-500',pessoa,50000,depois);
 const segundo=m.conf.simularImpacto({novoValorCentavos:75000});
 assert.equal(segundo.totalPosicoesRegistradas,2);
 assert.deepEqual(segundo.grupos.map(g=>g.referenciaOriginalCentavos),[25000,50000]);
 assert.equal(segundo.grupos[0].comparacaoEventoParticipante.valorEmpresaPropostoCentavos,50000);
 assert.equal(segundo.grupos[1].comparacaoEventoParticipante.valorEmpresaPropostoCentavos,25000);
 assert.equal(m.ponte.consultar().filas.B.quantidade,2);
 assert.equal(m.conf.atual().valorCentavos,50000);
 assert.throws(()=>m.conf.simularImpacto({novoValorCentavos:-5}),
  e=>e.codigo==='VALOR_INVALIDO');
});
