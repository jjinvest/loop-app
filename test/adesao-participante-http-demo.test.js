'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('botao de ativacao autenticado e rota privada, sem CPF na resposta',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-ficticia-bem-longa';
 const titular=contas.cadastrar({nome:'Ativacao Individual Demo',email:'ativacao@exemplo.invalid',senha});
 const evento={pedidoId:'compra-ativacao-web-1',contaId:titular.contaId,
  produtoId:'curso-simulado',valorCentavos:25000,status:STATUS_CONFIRMADO,
  confirmadoEm:'2026-10-15T10:00:00.000Z'};
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>evento});
 await ponte.processar({pedidoId:evento.pedidoId});
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:'chave-admin-apenas-teste-12345678'});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const api=base+'/api/laboratorio/participante';
 const headers={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const entrada=await fetch(api+'/entrar',{method:'POST',headers,body:JSON.stringify({
  nome:titular.nome,senha
 })});
 assert.equal(entrada.status,200);
 const cookie=entrada.headers.get('set-cookie').split(';')[0];
 const consultar=()=>fetch(api+'/minha-conta',{headers:{Cookie:cookie}});
 const antes=await(await consultar()).json();
 assert.equal(antes.mapaCores.filaB[0].cor,'AZUL');
 assert.equal(antes.adesao.cpfConfirmadoNoTeste,false);
 const ativar=(body,extra={})=>fetch(api+'/ativar-posicoes',{method:'POST',
  headers:{...headers,...extra},body:JSON.stringify(body)});
 const dados={cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'};
 assert.equal((await ativar(dados)).status,401);
 assert.equal((await ativar(dados,{Cookie:cookie,Origin:'https://fora.invalid'})).status,403);
 assert.equal((await ativar({...dados,contaId:'fabricado'},{Cookie:cookie})).status,400);
 assert.equal((await ativar({...dados,aceitaTermos:false},{Cookie:cookie})).status,400);
 const resposta=await ativar(dados,{Cookie:cookie});
 assert.equal(resposta.status,200);
 const ativado=await resposta.json();
 assert.equal(ativado.ativadas,1);
 assert.equal(JSON.stringify(ativado).includes(dados.cpfFicticio),false);
 const depois=await(await consultar()).json();
 assert.equal(depois.mapaCores.filaB[0].cor,'VERMELHO');
 assert.equal(depois.adesao.cpfConfirmadoNoTeste,true);
 assert.equal(JSON.stringify(depois).includes(dados.cpfFicticio),false);
 assert.equal((await ativar(dados,{Cookie:cookie})).status,409);
 const tela=await(await fetch(base+'/laboratorio/participante')).text();
 assert.match(tela,/formAtivacaoParticipante/);
 assert.match(tela,/mapaFilaAParticipante/);
 const script=await(await fetch(base+'/laboratorio/participante.js')).text();
 assert.match(script,/ativar-posicoes/);
 assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
});
