'use strict';
// Fluxo aprovado: saldo de indicacoes ativas e distribuicao +1 por posicao,
// com escritórios de participante e administrador lendo o mesmo SQLite.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const fs=require('node:fs');
const path=require('node:path');

test('botao +1 gasta indicacoes disponiveis reais com vinculos imutaveis e painel admin',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,atribuicaoManualPorPosicao:true,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)
 });
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 const escritorio=new EscritorioIndividualDemo({contas,ponte});
 const senha='senha-segura-ficticia-posicoes-2026';
 const titular=contas.cadastrar({nome:'Titular da Rede',email:'titular-rede@exemplo.invalid',senha});
 const convidados=['Ana','Bia','Carla'].map((nome,i)=>contas.cadastrar({
  nome,email:'convidado-rede-'+i+'@exemplo.invalid',
  senha,codigoIndicador:titular.codigoConvite
 }));
 async function comprar(conta,id){
  comprovantes.set(id,{pedidoId:id,contaId:conta.contaId,
   produtoId:'pdf-ativacao-loop',valorCentavos:25000,status:STATUS_CONFIRMADO,
   confirmadoEm:'2026-10-18T14:00:00.000Z'});
  return ponte.processar({pedidoId:id});
 }
 const p1=await comprar(titular,'titular-p1'),p2=await comprar(titular,'titular-p2');
 adesoes.ativar({contaId:titular.contaId,posicaoId:p1.posicaoId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 adesoes.ativar({contaId:titular.contaId,posicaoId:p2.posicaoId});
 const pedidos=[];
 for(let i=0;i<3;i++)pedidos.push(await comprar(convidados[i],'convite-pos-'+i));
 for(let i=0;i<2;i++)adesoes.ativar({
  contaId:convidados[i].contaId,posicaoId:pedidos[i].posicaoId,
  cpfFicticio:i===0?'12345678909':'52998224725',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
 });
 const saldo=()=>escritorio.consultar(titular.contaId);
 assert.equal(saldo().contadoresRede.totalPosicoes,2);
 assert.equal(saldo().contadoresRede.totalIndicacoesConfirmadas,2);
 assert.equal(saldo().contadoresRede.aDistribuir,2);
 assert.equal(saldo().contadoresRede.disponiveisParaVincular,2);
 assert.equal(saldo().contadoresRede.aguardandoAtivacao,1);
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:'chave-admin-ciclo-loop-de-testes-2026'});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const login=await fetch(base+'/api/laboratorio/participante/entrar',{
  method:'POST',headers,body:JSON.stringify({nome:titular.nome,senha})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const url=base+'/api/laboratorio/participante/atribuir-proxima-indicacao';
 const post=(body,extra={})=>fetch(url,{
  method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 assert.equal((await post({posicaoId:p1.posicaoId})).status,401);
 assert.equal((await post({posicaoId:p1.posicaoId},{Cookie:cookie,Origin:'https://outro.invalid'})).status,403);
 assert.equal((await post({posicaoId:p1.posicaoId,contaId:convidados[0].contaId},{Cookie:cookie})).status,400);
 const primeira=await post({posicaoId:p1.posicaoId},{Cookie:cookie});
 assert.equal(primeira.status,200);
 assert.equal((await primeira.json()).vinculada,true);
 assert.equal(saldo().contadoresRede.disponiveisParaVincular,1);
 assert.equal(saldo().posicoes.find(p=>p.posicaoId===p1.posicaoId).indicacoesRecebidas,1);
 assert.equal(saldo().posicoes.find(p=>p.posicaoId===p2.posicaoId).indicacoesRecebidas,0);
 assert.equal(ponte.atribuirProximaIndicacao({contaId:titular.contaId,posicaoId:p2.posicaoId}).repetida,false);
 assert.equal(saldo().contadoresRede.disponiveisParaVincular,0);
 assert.deepEqual(saldo().posicoes.map(p=>p.indicacoesRecebidas),[1,1]);
 assert.throws(()=>ponte.atribuirProximaIndicacao({
  contaId:titular.contaId,posicaoId:p1.posicaoId}),{codigo:'SEM_INDICADOS_ATIVOS_DISPONIVEIS'});
 assert.throws(()=>ponte.atribuirProximaIndicacao({
  contaId:convidados[0].contaId,posicaoId:p1.posicaoId}),
  {codigo:'SEM_INDICADOS_ATIVOS_DISPONIVEIS'});
 assert.equal(ponte._restaurar().filas.filaA.filter(p=>p.participanteId===titular.contaId).length,1);
 const httpAdmin=await fetch(base+'/api/admin/circuit-break-v6-demo/indicacoes',{
  headers:{Authorization:'Bearer chave-admin-ciclo-loop-de-testes-2026'}
 });
 assert.equal(httpAdmin.status,200);
 const admin=await httpAdmin.json();
 assert.deepEqual([admin.confirmadas,admin.vinculadas,admin.disponiveis,admin.aguardandoAtivacao],
  [3,2,0,1]);
 assert.equal(admin.regraGlobal,'3A/1B');
 assert.equal(admin.limiteFilaAPorTitular,1);
 const unauthorized=await fetch(base+'/api/admin/circuit-break-v6-demo/indicacoes');
 assert.notEqual(unauthorized.status,200);
 const shell=fs.readFileSync(path.join(__dirname,'../src/laboratorio/loop-03-shell.js'),'utf8');
 const adminHtml=fs.readFileSync(path.join(__dirname,'../src/laboratorio/admin-loop03.html'),'utf8');
 const adminJs=fs.readFileSync(path.join(__dirname,'../src/laboratorio/admin-loop03.js'),'utf8');
 assert.match(shell,/id="loop03PosicoesRedeTotalIndicacoes"/);
 assert.match(shell,/id="loop03PosicoesRedeADistribuir"/);
 assert.match(shell,/id="loop03PosicoesRedeUtilizadas"/);
 assert.doesNotMatch(shell,/id="loop03SaldoDisponivel"/);
 assert.match(shell,/loop03-adicionar-indicado/);
 assert.match(shell,/atribuir-proxima-indicacao/);
 assert.match(adminHtml,/indicacoesDisponiveisAdmin/);
 assert.match(adminJs,/api\('\/indicacoes'\)/);
});
