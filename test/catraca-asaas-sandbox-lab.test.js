'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CatracaAsaasSandboxLab}=require('../src/domain/catraca-asaas-sandbox-lab');
const pedidoId='pedido-lab-250';
const parecer={pedidoId,ambiente:'LABORATORIO_ASAAS_SANDBOX',
 titularId:'conta-a',valorCentavos:25000,elegivelParaTesteDeCatraca:true,
 catracaAutorizada:false,posicoesCriadas:0};
test('conecta parecer elegivel a ponte confiavel e preserva repeticao',async()=>{
 let chamadas=0;
 const adaptador=new CatracaAsaasSandboxLab({
  elegibilidade:{conferir:id=>{assert.equal(id,pedidoId);return parecer;}},
  ponte:{atribuicaoManualPorPosicao:true,verificador:async()=>({pedidoId,contaId:'conta-a',valorCentavos:25000}),processar:async({pedidoId:id})=>{
   assert.equal(id,pedidoId);chamadas++;
   return {contaId:'conta-a',posicaoId:7,posicaoIds:[7],
    compraElegivelLoop:true,posicaoCriada:true,
    criado:chamadas===1,repetido:chamadas>1};
  }}
 });
 const primeira=await adaptador.processar(pedidoId);
 const segunda=await adaptador.processar(pedidoId);
 assert.equal(primeira.criada,true);
 assert.equal(segunda.repetida,true);
 assert.equal(primeira.posicoesNoPedido,1);
 assert.equal(primeira.cpfConfirmadoAutomaticamente,false);
 assert.equal(chamadas,2);
});
test('bloqueia parecer sem pagamento elegivel antes da ponte',async()=>{
 for(const alteracao of [{valorCentavos:19000},{elegivelParaTesteDeCatraca:false},
  {titularId:null},{ambiente:'PRODUCAO'}]){
  let chamadas=0;
  const adaptador=new CatracaAsaasSandboxLab({
   elegibilidade:{conferir:()=>({...parecer,...alteracao})},
   ponte:{atribuicaoManualPorPosicao:true,verificador:async()=>({pedidoId,contaId:'conta-a',valorCentavos:25000}),processar:async()=>{chamadas++;}}
  });
  await assert.rejects(adaptador.processar(pedidoId),{codigo:'PAGAMENTO_SANDBOX_NAO_ELEGIVEL'});
  assert.equal(chamadas,0);
 }
});
test('detecta divergencia de titular e pacote inesperado',async()=>{
 for(const resposta of [
  {contaId:'conta-b',posicaoIds:[7]},
  {contaId:'conta-a',posicaoIds:[7,8]}
 ]){
  const adaptador=new CatracaAsaasSandboxLab({
   elegibilidade:{conferir:()=>parecer},
   ponte:{atribuicaoManualPorPosicao:true,verificador:async()=>({pedidoId,contaId:'conta-a',valorCentavos:25000}),processar:async()=>({
    compraElegivelLoop:true,posicaoCriada:true,...resposta
   })}
  });
  await assert.rejects(adaptador.processar(pedidoId));
 }
});

test('divergencia antes da gravacao nao invoca a ponte',async()=>{
 let gravacoes=0;
 const adaptador=new CatracaAsaasSandboxLab({
  elegibilidade:{conferir:()=>parecer},
  ponte:{atribuicaoManualPorPosicao:true,
   verificador:async()=>({pedidoId,contaId:'outra-conta',valorCentavos:25000}),
   processar:async()=>{gravacoes++;}}
 });
 await assert.rejects(adaptador.processar(pedidoId),
  {codigo:'COMPROVANTE_TITULAR_OU_VALOR_DIVERGENTE'});
 assert.equal(gravacoes,0);
});

test('integracao SQLite: uma posicao pendente, repeticao sem duplicar e titular preservado',async t=>{
 const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
 const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
 const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
 const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Titular Sandbox Lab',email:'titular-sandbox-lab@exemplo.invalid',senha:'senha-sandbox-lab-2026'});
 const comprovante={pedidoId,contaId:conta.contaId,produtoId:'pdf-laboratorio',
  valorCentavos:25000,status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-26T10:00:00.000Z'};
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>comprovante,atribuicaoManualPorPosicao:true});
 const elegibilidade={conferir:()=>({...parecer,titularId:conta.contaId})};
 const catraca=new CatracaAsaasSandboxLab({elegibilidade,ponte});
 const a=await catraca.processar(pedidoId);
 assert.equal(a.criada,true);
 assert.equal(a.confirmacaoIndividualObrigatoria,true);
 const b=await catraca.processar(pedidoId);
 assert.equal(b.repetida,true);
 assert.equal(b.posicaoId,a.posicaoId);
 assert.equal(ponte.consultarPosicoes(conta.contaId).length,1);
});
