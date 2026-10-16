'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const DATA_PEDIDO='2026-10-15T10:00:00.000Z';
const DATA_CONFIRMACAO='2026-10-15T10:05:00.000Z';
function montar(t){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({
  banco:repo.banco,contas,relogio:()=>DATA_PEDIDO
 });
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados:pedidos,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=>DATA_CONFIRMACAO
 });
 return {repo,contas,pedidos,comprovantes,ponte,
  escritorio:new EscritorioIndividualDemo({contas,ponte})};
}
function cadastro(m,nome,email,indicador){
 return m.contas.cadastrar({nome,email,senha:'laboratorio-ficticio-2026',codigoIndicador:indicador});
}
async function pagar(m,id,conta,valor,status=STATUS_CONFIRMADO){
 const pedido=m.pedidos.preparar({
  pedidoId:id,contaId:conta.contaId,
  produtoId:'produto-comercial-demo',valorCentavos:valor
 });
 m.comprovantes.set(id,{
  ...pedido,confirmadoEm:DATA_CONFIRMACAO,status
 });
 return m.ponte.processar({pedidoId:id});
}
test('loja aceita R$ 10, R$ 50 e R$ 249,99 sem reservar parcela LOOP nem criar posicao',async t=>{
 const m=montar(t);
 const cliente=cadastro(m,'Compradora Livre','livre@exemplo.invalid');
 for(const [i,valor] of [1000,5000,24999].entries()){
  const r=await pagar(m,'loja-'+i,cliente,valor);
  assert.equal(r.vendaLojaRegistrada,true);
  assert.equal(r.compraElegivelLoop,false);
  assert.equal(r.posicaoCriada,false);
  assert.equal(r.posicaoId,null);
  assert.equal(r.filaAtual,null);
  assert.equal(r.indicacaoNova,false);
 }
 const estado=m.ponte.consultar();
 assert.equal(estado.compras.length,0);
 assert.equal(estado.comprasLojaSemLoop.length,3);
 assert.deepEqual(estado.comprasLojaSemLoop.map(x=>x.valorCentavos),[1000,5000,24999]);
 assert.equal(estado.filas.B.quantidade,0);
 assert.equal(estado.filas.A.quantidade,0);
 assert.equal(estado.convites.length,0);
 assert.equal(estado.tabuleiro.centro,null);
 assert.equal(m.repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_estado_demo').get().n,0);
 const vis=m.escritorio.consultar(cliente.contaId);
 assert.equal(vis.compras.length,0);
 assert.equal(vis.posicoes.length,0);
 assert.equal(vis.comprasLojaSemLoop.length,3);
 assert.ok(vis.comprasLojaSemLoop.every(x=>x.posicaoCriada===false));
 assert.equal(vis.vagasLivres,6);
 assert.throws(()=>m.repo.banco.exec('DELETE FROM admin_ponte_vendas_loja_sem_loop_demo'),/imutavel/);
});
test('R$ 249,99 + R$ 0,01 em OUTRO pedido nao soma; pedido unico R$ 250 entra na B',async t=>{
 const m=montar(t),cliente=cadastro(m,'Cliente Somatorio','soma@exemplo.invalid');
 await pagar(m,'pedido-249',cliente,24999);
 await pagar(m,'pedido-centavo',cliente,1);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,2);
 assert.equal(m.ponte.consultar().compras.length,0);
 const qualificado=await pagar(m,'pedido-250',cliente,25000);
 assert.equal(qualificado.posicaoCriada,true);
 assert.equal(qualificado.compraElegivelLoop,true);
 assert.equal(qualificado.filaAtual,'B');
 assert.equal(m.ponte.consultar().compras.length,1);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,2);
 assert.equal(m.escritorio.consultar(cliente.contaId).posicoes.length,1);
});
test('convite so conta quando convidado atinge R$250 em UM pedido confirmado',async t=>{
 const m=montar(t);
 const indicador=cadastro(m,'Indicador Principal','principal@exemplo.invalid');
 const convidado=cadastro(m,'Convidada Cliente','convidada@exemplo.invalid',indicador.codigoConvite);
 await pagar(m,'principal-loop',indicador,25000);
 const loja=await pagar(m,'convidada-loja',convidado,5000);
 assert.equal(loja.indicacaoNova,false);
 assert.equal(m.ponte.consultar().convites.length,0);
 assert.equal(m.ponte.consultar().filas.A.quantidade,0);
 const r=await pagar(m,'convidada-loop',convidado,27000);
 assert.equal(r.indicacaoNova,true);
 assert.equal(r.filaAtual,'B');
 const fim=m.ponte.consultar();
 assert.equal(fim.convites.length,1);
 assert.equal(fim.filas.A.quantidade,1);
 assert.equal(fim.filas.B.quantidade,1);
 assert.equal(fim.comprasLojaSemLoop.length,1);
 const outro=await pagar(m,'convidada-outra-compra',convidado,7500);
 assert.equal(outro.indicacaoNova,false);
 assert.equal(fim.convites.length,m.ponte.consultar().convites.length);
});
test('setima posicao e bloqueada, mas compra comercial menor segue possivel',async t=>{
 const m=montar(t),cliente=cadastro(m,'Cliente Cinco','cinco@exemplo.invalid');
 for(let i=1;i<=6;i++){
  const r=await pagar(m,'loop-'+i,cliente,25000);
  assert.equal(r.posicaoCriada,true);
 }
 const venda=await pagar(m,'loja-setima-venda',cliente,4999);
 assert.equal(venda.vendaLojaRegistrada,true);
 assert.equal(venda.posicaoCriada,false);
 assert.equal(m.ponte.consultar().compras.length,6);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,1);
 await assert.rejects(pagar(m,'loop-setima-posicao',cliente,25000),
  e=>e.codigo==='LIMITE_ATIVO');
 assert.equal(m.ponte.consultar().compras.length,6);
});
test('repeticao da venda simples nao duplica e adulteracao de preco ou titular e recusada',async t=>{
 const m=montar(t);
 const cliente=cadastro(m,'Cliente Primeiro','primeiro@exemplo.invalid');
 const outro=cadastro(m,'Cliente Segundo','segundo@exemplo.invalid');
 const primeira=await pagar(m,'venda-pequena',cliente,5000);
 assert.equal(primeira.criado,true);
 const id='venda-pequena',original=m.comprovantes.get(id);
 const nova=await m.ponte.processar({pedidoId:id});
 assert.equal(nova.repetido,true);
 assert.equal(nova.posicaoCriada,false);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,1);
 m.comprovantes.set(id,{...original,valorCentavos:25000});
 await assert.rejects(m.ponte.processar({pedidoId:id}),
  e=>e.codigo==='VINCULO_DIVERGENTE');
 m.comprovantes.set(id,{...original,contaId:outro.contaId});
 await assert.rejects(m.ponte.processar({pedidoId:id}),
  e=>e.codigo==='VINCULO_DIVERGENTE');
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,1);
 assert.equal(m.ponte.consultar().compras.length,0);
});
test('compra ainda nao confirmada nao aparece nem na loja nem na fila',async t=>{
 const m=montar(t),cliente=cadastro(m,'Cliente Aguardo','aguardo@exemplo.invalid');
 await assert.rejects(pagar(m,'pedido-pendente',cliente,5000,'PENDENTE'),
  e=>e.codigo==='PAGAMENTO_NAO_CONFIRMADO');
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().comprasLojaSemLoop.length,0);
});
