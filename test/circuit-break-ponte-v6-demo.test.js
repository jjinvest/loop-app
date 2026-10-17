'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {extratoCentrosPrevistosV6}=require('../src/domain/extrato-creditos-previstos-v6-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('ponte e Circuit Break compartilham limite e geram somente creditos previstos',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const recibos=new Map(),titulares=[];
 for(let i=1;i<=12;i++){
   const c=contas.cadastrar({nome:'Pessoa Teste Ponte '+i,
     email:'pessoa-ponte-'+i+'@exemplo.invalid',
     senha:'senha-ficticia-2026-ponte-segura'});
   titulares.push(c);
 }
 const ponte=new PonteComprasConvitesDemoSQLite({
   banco:repo.banco,contas,consultarPagamentoConfiavel:async id=>recibos.get(id)
 });
 for(let i=1;i<=12;i++){
   const pedidoId='pdfponte'+i;
   recibos.set(pedidoId,{pedidoId,contaId:titulares[i-1].contaId,
     produtoId:'curso-pdf-ficticio',valorCentavos:25000,
     status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-16T12:00:00.000Z'});
   await ponte.processar({pedidoId});
 }
 new AdesoesPosicoesDemoSQLite({ponte}).ativar({
    contaId:titulares[0].contaId,cpfFicticio:'11144477735',
    aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
 });
 let dia='2026-10-17T13:00:00.000Z';
 const agora=()=>dia;
 const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco,agora});
 const circuito=new CircuitBreakPonteV6DemoSQLite({
   banco:repo.banco,ponte,controle,agora});
 let n=0;
 const comando=(tipo,valor)=>controle.executar({
   tipo,valor,comandoId:'cb-ponte-comando-'+(++n),
   revisaoEsperada:controle.resumo().revisao
 });
 const girar=(valor,id)=>circuito.liberar({
   quantidade:valor,comandoId:id||'cb-ponte-lote-'+(++n),
   revisaoEsperada:controle.resumo().revisao
 });
 assert.equal(circuito.resumo().comprasPendentes,12);
 assert.throws(()=>girar(1),{codigo:'CATRACA_PAUSADA'});
 comando('ABRIR');
 comando('LIMITE_DIARIO',1);
 assert.throws(()=>girar(3),{codigo:'LIMITE_DIARIO_ATINGIDO'});
 const primeiro=girar(1,'cb-ponte-giro-primeiro');
 assert.equal(primeiro.girosLiberados.length,1);
 assert.equal(primeiro.girosLiberados[0].eventos.length,6);
 assert.equal(primeiro.girosLiberados[0].titularCentroId,titulares[0].contaId);
 const v=extratoCentrosPrevistosV6({ponte,contas,contaId:titulares[0].contaId});
 assert.equal(v.creditoPrevistoCentavos,75000);
 assert.equal(v.disponivelParaSaqueCentavos,0);
 assert.equal(extratoCentrosPrevistosV6({ponte,contas,
   contaId:titulares[1].contaId}).creditoPrevistoCentavos,0);
 assert.equal(circuito.resumo().comprasConsumidas,6);
 assert.equal(circuito.resumo().girosConcluidos,1);
 assert.equal(controle.resumo().girosHoje,1);
 assert.throws(()=>girar(1),{codigo:'LIMITE_DIARIO_ATINGIDO'});
 const duplicada=circuito.liberar({quantidade:1,comandoId:'cb-ponte-giro-primeiro',
   revisaoEsperada:0});
 assert.equal(duplicada.repetido,true);
 assert.equal(circuito.resumo().girosConcluidos,1);
 comando('GERAR_30_COMPRAS');
 assert.throws(()=>comando('LIBERAR_LOTE',1),{codigo:'LIMITE_DIARIO_ATINGIDO'});
 dia='2026-10-18T13:00:00.000Z';
 assert.equal(circuito.resumo().restantesHoje,1);
 const segundo=girar(1);
 assert.equal(segundo.girosLiberados.length,1);
 assert.equal(circuito.resumo().comprasPendentes,0);
 assert.equal(controle.historico().filter(x=>x.tipo==='LIBERAR_LOTE_PONTE').length,2);
});
