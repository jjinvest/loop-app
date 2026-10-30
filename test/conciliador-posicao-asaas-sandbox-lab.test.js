'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliadorPosicaoAsaasSandboxLab}=require('../src/domain/conciliador-posicao-asaas-sandbox-lab');
const pedidoId='pedido-lab-250';
function montar({status='RECEBIMENTO_INFORMADO_SANDBOX',valorCentavos=25000}={}){
 const chamadas=[];
 const cobrancas={
  conferir:async id=>{chamadas.push('reconsulta');assert.equal(id,pedidoId);return {status};},
  consultar:id=>{chamadas.push('local');return {encontrado:true,pedidoId:id,pagamentoId:'pay_sandbox_123',status,valorCentavos};}
 };
 const catraca={processar:async id=>{
  chamadas.push('catraca');assert.equal(id,pedidoId);
  return {pedidoId:id,posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true,
   posicaoId:42,criada:true};
 }};
 return {conciliador:new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca}),chamadas};
}
test('reconsulta pagamento confirmado antes de criar posicao pendente',async()=>{
 const {conciliador,chamadas}=montar();
 const resultado=await conciliador.processar(pedidoId);
 assert.deepEqual(chamadas,['reconsulta','local','catraca']);
 assert.equal(resultado.posicaoId,42);
 assert.equal(resultado.reconsultaAsaasAntesDaCatraca,true);
});
test('nao aciona catraca para pagamento pendente ou abaixo de R$250',async()=>{
 for(const cenario of [{status:'PENDENTE_SANDBOX'},{valorCentavos:24999}]){
  const {conciliador,chamadas}=montar(cenario);
  await assert.rejects(conciliador.processar(pedidoId),{codigo:'COBRANCA_SANDBOX_NAO_CONFIRMADA'});
  assert.deepEqual(chamadas,['reconsulta','local']);
 }
});
test('nao aciona catraca se a reconsulta falhar',async()=>{
 let acionou=false;
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({
  cobrancas:{conferir:async()=>{throw Error('Asaas indisponivel');},consultar:()=>({})},
  catraca:{processar:async()=>{acionou=true;}}
 });
 await assert.rejects(conciliador.processar(pedidoId),/Asaas indisponivel/);
 assert.equal(acionou,false);
});

test('integracao: reconsulta confirmada cria uma posicao SQLite e repeticao nao duplica',async t=>{
 const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
 const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
 const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
 const {CatracaAsaasSandboxLab}=require('../src/domain/catraca-asaas-sandbox-lab');
 const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Titular Conciliacao',email:'titular-conciliacao@exemplo.invalid',senha:'senha-sandbox-lab-2026'});
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>({pedidoId,contaId:conta.contaId,
   produtoId:'pdf-laboratorio',valorCentavos:25000,status:STATUS_CONFIRMADO,
   confirmadoEm:'2026-10-26T10:00:00.000Z'}),atribuicaoManualPorPosicao:true});
 const catraca=new CatracaAsaasSandboxLab({
  elegibilidade:{conferir:()=>({pedidoId,ambiente:'LABORATORIO_ASAAS_SANDBOX',
   titularId:conta.contaId,valorCentavos:25000,elegivelParaTesteDeCatraca:true,
   catracaAutorizada:false,posicoesCriadas:0})},ponte});
 let consultas=0;
 const cobrancas={conferir:async()=>{consultas++;return {status:'RECEBIMENTO_INFORMADO_SANDBOX'};},
  consultar:()=>({encontrado:true,pedidoId,pagamentoId:'pay_sandbox_123',
   status:'RECEBIMENTO_INFORMADO_SANDBOX',valorCentavos:25000})};
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca});
 const a=await conciliador.processar(pedidoId);
 const b=await conciliador.processar(pedidoId);
 assert.equal(a.criada,true);
 assert.equal(b.repetida,true);
 assert.equal(a.posicaoId,b.posicaoId);
 assert.equal(a.contaId,conta.contaId);
 assert.equal(consultas,2);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo WHERE pedido_id=?').get(pedidoId).n,1);
});
