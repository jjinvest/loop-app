'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const CRIADO_EM='2026-10-15T10:00:00.000Z';
const CONFIRMADO_EM='2026-10-15T10:01:00.000Z';
function local(t,caminho=null){
 const pasta=caminho?null:fs.mkdtempSync(path.join(os.tmpdir(),'loop-vinculo-comprador-'));
 if(pasta)t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const repo=new RepositorioCatalogoSQLite({caminho:caminho||path.join(pasta,'teste.sqlite')});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({
  banco:repo.banco,contas,relogio:()=>CRIADO_EM
 });
 const eventos=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados:pedidos,
  consultarPagamentoConfiavel:async id=>eventos.get(id),
  relogio:()=>CONFIRMADO_EM
 });
 return {repo,contas,pedidos,ponte,eventos};
}
function conta(m,nome,email,codigoIndicador){
 return m.contas.cadastrar({
  nome,email,senha:'senha-ficticia-segura-2026',codigoIndicador
 });
}
function preparar(m,{pedidoId,contaId,produtoId='curso-pdf-exemplo',
 valorCentavos=10000}){
 return m.pedidos.preparar({pedidoId,contaId,produtoId,valorCentavos});
}
function confirmar(m,pedido,alteracoes={}){
 m.eventos.set(pedido.pedidoId,{
  pedidoId:pedido.pedidoId,contaId:pedido.contaId,
  produtoId:pedido.produtoId,valorCentavos:pedido.valorCentavos,
  intentoPagamentoId:pedido.intentoPagamentoId,
  confirmadoEm:CONFIRMADO_EM,status:STATUS_CONFIRMADO,
  ...alteracoes
 });
 return m.ponte.processar({pedidoId:pedido.pedidoId});
}
test('pedido identificado registra titular e intento unico imutaveis antes do pagamento',t=>{
 const m=local(t);
 const a=conta(m,'Comprador Alfa','alfa@exemplo.invalid');
 const b=conta(m,'Comprador Beta','beta@exemplo.invalid');
 const p=preparar(m,{pedidoId:'pedido-a',contaId:a.contaId,valorCentavos:12500});
 assert.equal(p.repetido,false);
 assert.equal(p.contaId,a.contaId);
 assert.match(p.intentoPagamentoId,/^intent-demo-[a-f0-9-]{36}$/);
 const repetido=preparar(m,{pedidoId:'pedido-a',contaId:a.contaId,valorCentavos:12500});
 assert.equal(repetido.repetido,true);
 assert.equal(repetido.intentoPagamentoId,p.intentoPagamentoId);
 assert.throws(()=>preparar(m,{pedidoId:'pedido-a',contaId:b.contaId,valorCentavos:12500}),
  e=>e.codigo==='PEDIDO_IMUTAVEL');
 assert.throws(()=>preparar(m,{pedidoId:'pedido-a',contaId:a.contaId,valorCentavos:22500}),
  e=>e.codigo==='PEDIDO_IMUTAVEL');
 assert.throws(()=>preparar(m,{pedidoId:'pedido-a',contaId:a.contaId,produtoId:'outro-produto',valorCentavos:12500}),
  e=>e.codigo==='PEDIDO_IMUTAVEL');
 const p2=preparar(m,{pedidoId:'pedido-b',contaId:b.contaId,valorCentavos:23500});
 assert.notEqual(p2.intentoPagamentoId,p.intentoPagamentoId);
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().filas.B.quantidade,0);
 const resumo=m.pedidos.listarResumo();
 assert.equal(resumo.pedidos.length,2);
 assert.equal(resumo.dinheiroReal,false);
 assert.equal(JSON.stringify(resumo).includes(p.intentoPagamentoId),false);
 assert.throws(()=>m.repo.banco.exec(
  "UPDATE admin_pedidos_titularidade_demo SET valor_centavos=2"
 ),/imutavel/);
 assert.throws(()=>m.repo.banco.exec('DELETE FROM admin_pedidos_titularidade_demo'),/imutavel/);
});
test('pedido nao registrado previamente ou cadastrado com titular inexistente nao entra na fila',async t=>{
 const m=local(t);
 const a=conta(m,'Pessoa Alfa','pessoa@exemplo.invalid');
 const inexistente='11111111-1111-1111-1111-111111111111';
 assert.throws(()=>preparar(m,{pedidoId:'pedido-invalido',contaId:inexistente}),
  e=>e.codigo==='TITULAR_DESCONHECIDO');
 assert.throws(()=>preparar(m,{pedidoId:'pedido-invalido',contaId:a.contaId,valorCentavos:-1}),
  e=>e.codigo==='PEDIDO_INVALIDO');
 m.eventos.set('pedido-solto',{
  pedidoId:'pedido-solto',contaId:a.contaId,produtoId:'curso-pdf-exemplo',
  valorCentavos:12000,intentoPagamentoId:'intent-demo-qualquer',
  status:STATUS_CONFIRMADO,confirmadoEm:CONFIRMADO_EM
 });
 await assert.rejects(m.ponte.processar({pedidoId:'pedido-solto'}),
  e=>e.codigo==='PEDIDO_NAO_PREPARADO');
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().vinculosIdentificados,0);
});
test('confirmacao conferida cria exatamente uma posicao e registra vinculo unico',async t=>{
 const m=local(t);
 const a=conta(m,'Conta Compradora','compra@exemplo.invalid');
 const p=preparar(m,{pedidoId:'venda-001',contaId:a.contaId,valorCentavos:58000});
 const criada=await confirmar(m,p);
 assert.equal(criada.criado,true);
 assert.equal(criada.filaAtual,'B');
 const repetida=await confirmar(m,p);
 assert.equal(repetida.repetido,true);
 assert.equal(repetida.posicaoId,criada.posicaoId);
 const estado=m.ponte.consultar();
 assert.equal(estado.pedidosIdentificadosObrigatorios,true);
 assert.equal(estado.compras.length,1);
 assert.equal(estado.vinculosIdentificados,1);
 assert.equal(estado.filas.B.quantidade,1);
 assert.equal(estado.compras[0].valorCentavos,58000);
 assert.equal(estado.compras[0].contaId,a.contaId);
 assert.equal(m.repo.banco.prepare(
  'SELECT intento_pagamento_id AS id FROM admin_ponte_vinculos_identificados_demo'
 ).get().id,p.intentoPagamentoId);
 assert.throws(()=>m.repo.banco.exec(
  "UPDATE admin_ponte_vinculos_identificados_demo SET verificado_em='2025'"
 ),/imutavel/);
 assert.throws(()=>m.repo.banco.exec(
  'DELETE FROM admin_ponte_vinculos_identificados_demo'
 ),/imutavel/);
});
test('troca de titular, produto, preco ou intento nao altera fila nem aceite',async t=>{
 const m=local(t);
 const a=conta(m,'Pessoa A','a@exemplo.invalid');
 const b=conta(m,'Pessoa B','b@exemplo.invalid');
 const p=preparar(m,{pedidoId:'pedido-vinculado',contaId:a.contaId});
 for(const alteracoes of [
  {contaId:b.contaId},{produtoId:'outro-curso'},
  {valorCentavos:19000},{intentoPagamentoId:'intent-demo-fabricado'}
 ]){
  await assert.rejects(confirmar(m,p,alteracoes),
   e=>e.codigo==='VINCULO_DIVERGENTE');
 }
 const confirmacao=confirmar(m,p,{confirmadoEm:'2026-10-15T09:59:00.000Z'});
 await assert.rejects(confirmacao,e=>e.codigo==='DATA_DIVERGENTE');
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().vinculosIdentificados,0);
 assert.equal(m.ponte.consultar().filas.B.quantidade,0);
 assert.equal(m.pedidos.buscar('pedido-vinculado').contaId,a.contaId);
});
test('reaproveitar intento de outro pedido nao cria nova posicao',async t=>{
 const m=local(t);
 const a=conta(m,'Cliente Alfa','alfa@exemplo.invalid');
 const p1=preparar(m,{pedidoId:'pedido-001',contaId:a.contaId});
 const p2=preparar(m,{pedidoId:'pedido-002',contaId:a.contaId});
 await confirmar(m,p1);
 await assert.rejects(confirmar(m,p2,{intentoPagamentoId:p1.intentoPagamentoId}),
  e=>e.codigo==='VINCULO_DIVERGENTE');
 assert.equal(m.ponte.consultar().compras.length,1);
 assert.equal(m.ponte.consultar().vinculosIdentificados,1);
 assert.equal(m.ponte.consultar().filas.B.quantidade,1);
 await confirmar(m,p2);
 assert.equal(m.ponte.consultar().compras.length,2);
 assert.equal(m.ponte.consultar().vinculosIdentificados,2);
});
test('confirmar convidado valida convite apenas uma vez, mesmo com multiplos pedidos',async t=>{
 const m=local(t);
 const raiz=conta(m,'Indicador Principal','principal@exemplo.invalid');
 const c=conta(m,'Convidado Confirmado','convite@exemplo.invalid',raiz.codigoConvite);
 const pd=preparar(m,{pedidoId:'raiz-001',contaId:raiz.contaId});
 const p1=preparar(m,{pedidoId:'convidado-001',contaId:c.contaId});
 const p2=preparar(m,{pedidoId:'convidado-002',contaId:c.contaId,valorCentavos:27000});
 await confirmar(m,pd);
 await confirmar(m,p1);
 await confirmar(m,p2);
 const estado=m.ponte.consultar();
 assert.equal(estado.compras.length,3);
 assert.equal(estado.vinculosIdentificados,3);
 assert.equal(estado.convites.length,1);
 assert.equal(estado.convites[0].aplicadoNoMotor,true);
 assert.equal(estado.filas.A.quantidade,1);
 assert.equal(estado.filas.B.quantidade,2);
 assert.equal(estado.filas.A.pessoas[0].participanteId,raiz.contaId);
});
test('se falha insercao do vinculo a transacao desfaz compra e posicao',async t=>{
 const m=local(t);
 const a=conta(m,'Comprador Rollback','rollback@exemplo.invalid');
 const p=preparar(m,{pedidoId:'compra-rollback',contaId:a.contaId});
 m.repo.banco.exec(`
  CREATE TRIGGER falha_inspecao_vinculo_demo
  BEFORE INSERT ON admin_ponte_vinculos_identificados_demo
  BEGIN SELECT RAISE(ABORT,'falha intencional no vinculo'); END;
 `);
 await assert.rejects(confirmar(m,p),/falha intencional no vinculo/);
 assert.equal(m.ponte.consultar().compras.length,0);
 assert.equal(m.ponte.consultar().filas.B.quantidade,0);
 assert.equal(m.ponte.consultar().vinculosIdentificados,0);
 assert.equal(m.pedidos.buscar(p.pedidoId).contaId,a.contaId);
});
test('vinculos de pedidos, confirmacoes e posicoes sobrevivem a reinicio',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pedido-reinicio-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'teste.sqlite');
 const a=local(t,arquivo);
 const contaA=conta(a,'Cliente Reinicio','reinicio@exemplo.invalid');
 const p=preparar(a,{pedidoId:'venda-reiniciada',contaId:contaA.contaId});
 await confirmar(a,p);
 a.repo.fechar();
 // Evita duplo fechamento do mesmo objeto no teardown.
 a.repo.fechar=()=>{};
 const b=local(t,arquivo);
 assert.equal(b.pedidos.buscar(p.pedidoId).intentoPagamentoId,p.intentoPagamentoId);
 b.eventos.set(p.pedidoId,{
  ...p,confirmadoEm:CONFIRMADO_EM,status:STATUS_CONFIRMADO
 });
 const novamente=await b.ponte.processar({pedidoId:p.pedidoId});
 assert.equal(novamente.repetido,true);
 assert.equal(b.ponte.consultar().compras.length,1);
 assert.equal(b.ponte.consultar().vinculosIdentificados,1);
});
