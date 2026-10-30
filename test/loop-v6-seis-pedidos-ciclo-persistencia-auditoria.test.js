'use strict';
// Seis eventos por giro PERSISTIDOS no SQLite: fontes ligadas a pedidos
// previamente confirmados pelo VERIFICADOR FICTICIO (nao pelo PSP real).
// Nenhum direito financeiro liquidado ou transferencia real autorizados.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {auditarSeisPedidosDoCicloLab}=require('../src/domain/auditoria-seis-pedidos-ciclo-lab');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const NOW='2036-09-20T12:00:00.000Z',SENHA='somente-laboratorio-pdf-250-e-seis-eventos';
const idPedido=i=>'ciclo-fonte-pdf-'+String(i).padStart(3,'0');
function abrir(caminho,comprovantes){
 const repo=new RepositorioCatalogoSQLite({caminho});
 const banco=repo.banco,contas=new ContasParticipantesDemoSQLite({banco});
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,
  relogio:()=>NOW,consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>NOW});
 const controle=new CircuitBreakV6DemoSQLite({banco,agora:()=>NOW});
 const circuito=new CircuitBreakPonteV6DemoSQLite({banco,ponte,controle,agora:()=>NOW});
 return {repo,banco,contas,ponte,adesoes,controle,circuito};
}
function q(b,sql){return b.prepare(sql).get().n}
function snapshot(m){
 return {
  giros:m.ponte._restaurar().tabuleiro.ciclosConcluidos.length,
  eventos:q(m.banco,'SELECT COUNT(*) AS n FROM loop_v6_provisoes_eventos'),
  livro:q(m.banco,'SELECT COUNT(*) AS n FROM loop_v6_provisoes_ciclos'),
  saidas:q(m.banco,'SELECT COUNT(*) AS n FROM loop_v6_pre_saidas'),
  auditoria:q(m.banco,"SELECT COUNT(*) AS n FROM loop_cb_v6_auditoria WHERE tipo='LIBERAR_LOTE_PONTE'")
 };
}
test('6 pedidos distintos por giro: lastro ficticio, rollback, replays e reabertura SQLite',
 {timeout:120000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-seis-fontes-sqlite-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'livro.sqlite');
 const comprovantes=new Map();
 let m=abrir(arquivo,comprovantes);
 t.after(()=>{try{m.repo.fechar()}catch{}});
 for(let i=1;i<=14;i++){
  const c=m.contas.cadastrar({nome:'Comprador PDF '+i,
   email:'comprador-pdf-'+i+'@exemplo.invalid',senha:SENHA});
  const pedidoId=idPedido(i);
  comprovantes.set(pedidoId,{pedidoId,contaId:c.contaId,
   produtoId:'pdf-unico-250',valorCentavos:25000,status:STATUS_CONFIRMADO,
   confirmadoEm:NOW});
  const resposta=await m.ponte.processar({pedidoId});
  assert.equal(resposta.posicaoCriada,true);
  if(i===1){
   assert.equal(m.adesoes.ativar({contaId:c.contaId,
    posicaoId:resposta.posicaoId,cpfFicticio:'11144477735',
    aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,1);
  }
 }
 assert.equal(m.circuito.resumo().comprasPendentes,14);
 m.circuito.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 const aportar=i=>m.circuito.preLancamento.registrarAporteFicticio({
  aporteId:'aporte-fonte-pdf-'+String(i).padStart(3,'0'),
  pedidoId:idPedido(i),valorLoopCentavos:25000
 });
 for(let i=1;i<=5;i++)assert.equal(aportar(i).semPagamentoReal,true);
 m.circuito.preLancamento.iniciar();
 m.controle.executar({tipo:'ABRIR',comandoId:'cb-fontes-abrir-001',
  revisaoEsperada:m.controle.resumo().revisao});
 const ciclo=(id)=>m.circuito.liberar({comandoId:id,quantidade:1,
  revisaoEsperada:m.controle.resumo().revisao});
 const antes=snapshot(m);
 assert.throws(()=>ciclo('cb-fontes-sem-lastro-001'),
  x=>x.codigo==='SALDO_CENTRAL_SIMULADO_INSUFICIENTE');
 assert.deepEqual(snapshot(m),antes,'Falha nao grava giro parcial');
 for(let i=6;i<=14;i++)aportar(i);
 const a=ciclo('cb-fontes-primeiro-001');
 assert.equal(a.girosLiberados.length,1);
 const b=ciclo('cb-fontes-segundo-001');
 assert.equal(b.girosLiberados.length,1);
 const rastreio=auditarSeisPedidosDoCicloLab({banco:m.banco,ponte:m.ponte});
 assert.equal(rastreio.situacao,'CONSISTENTE_APENAS_NO_LABORATORIO');
 assert.equal(rastreio.girosDocumentados,2);
 assert.equal(rastreio.eventosDocumentados,12);
 assert.equal(rastreio.pedidosFicticiosDistintos,12);
 assert.deepEqual(rastreio.alertas,[]);
 assert.equal(rastreio.somenteLeitura,true);
 assert.equal(rastreio.liquidacaoPspComprovada,false);
 assert.deepEqual(rastreio.itens.map(x=>x.eventos),[6,6]);
 assert.deepEqual(rastreio.itens.map(x=>x.pedidosDistintos),[6,6]);
 assert.equal(m.circuito.resumo().comprasPendentes,2);
 assert.equal(m.circuito.livro.resumo().comprovantesBancariosReconciliados,0);
 assert.equal(m.circuito.livro.resumo().valorRealLiquidadoCentavos,0);
 assert.equal(m.circuito.conciliacao.conferir().quantidadeDivergencias,0);
 assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
 const depois=snapshot(m);
 assert.throws(()=>m.banco.exec(
  "UPDATE loop_v6_provisoes_eventos SET pedido_id='forjado' WHERE giro=1"),
  /provisao imutavel/);
 assert.throws(()=>m.banco.exec('DELETE FROM loop_v6_provisoes_eventos'),
  /provisao imutavel/);
 assert.deepEqual(snapshot(m),depois);
 assert.equal(m.circuito.liberar({comandoId:'cb-fontes-primeiro-001',
  quantidade:1,revisaoEsperada:0}).repetido,true);
 assert.deepEqual(snapshot(m),depois);
 m.repo.fechar();m=abrir(arquivo,comprovantes);
 assert.deepEqual(snapshot(m),depois);
 const pos=auditarSeisPedidosDoCicloLab({banco:m.banco,ponte:m.ponte});
 assert.equal(pos.situacao,'CONSISTENTE_APENAS_NO_LABORATORIO');
 assert.equal(pos.eventosDocumentados,12);
 assert.deepEqual(pos.alertas,[]);
 assert.deepEqual(pos.itens.map(x=>x.pedidosDistintos),[6,6]);
 assert.equal(m.circuito.resumo().girosConcluidos,2);
 assert.equal(m.circuito.conciliacao.conferir().quantidadeDivergencias,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('LOOP_SEIS_PEDIDOS_GIRO_PERSISTIDO='+JSON.stringify({
  comprasPdfFicticias:14,girosFicticiosPersistidos:2,
  eventosFicticiosContabilizados:12,eventosPorGiro:6,
  pedidosFicticiosDistintos:12,comprasPendentes:2,
  giroSemLastroSimuladoRejeitado:true,alteracaoLivroImutavelRecusada:true,
  replayDoComandoIdempotente:true,reaberturaSqliteIntegra:true,
  conciliacaoCofresFicticiaDivergencias:0,
  pagamentosReaisComprovados:0,liquidacaoOuSaqueReal:false,
  semMudancaDePrecoDeProduto:true}));
});
