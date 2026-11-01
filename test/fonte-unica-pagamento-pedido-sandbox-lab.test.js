'use strict';
// Regressoes do fluxo unico: pagamento ficticio e Asaas Sandbox sao fontes
// MUTUAMENTE EXCLUSIVAS por pedido. Zero dinheiro, CPF ou cliente real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {PedidosPDFPagamentosDemoSQLite}=require('../src/domain/pedidos-pdf-pagamentos-demo-sqlite');
const {IntegracaoLojaPDFLoopDemo}=require('../src/domain/integracao-loja-pdf-loop-demo');
const AUTH={Authorization:'Bearer administrador-local-ficticio-2026-123456789','Content-Type':'application/json'};
const SENHA='senha-de-laboratorio-2026';
async function titular(m,nome,email){
 const conta=m.contas.cadastrar({nome,email,senha:SENHA});
 const {cookie}=await m.http('/entrar',{body:{nome,senha:SENHA}});
 return {conta,cookie};
}
function total(m,tabela){return m.banco.prepare('SELECT COUNT(*) AS n FROM '+tabela).get().n;}
test('carrinho: Pix reservado impede baixa ficticia e sincronizacao administrativa, sem travar a conciliacao Sandbox',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {cookie}=await titular(m,'Compra Fonte Unica','fonte-unica-a@example.invalid');
 const pedidoId=(await m.http('/loja/pedidos',{cookie,status:201,body:{
  itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 assert.equal(total(m,'lab_psp_http_fixture'),1);
 const url=m.base+'/api/admin/carrinho-loop-demo/'+pedidoId;
 const evento=await fetch(url+'/eventos',{method:'POST',headers:AUTH,
  body:JSON.stringify({eventoId:'evento-duplicado-sandbox',tipo:'CONFIRMAR_FICTICIO'})});
 assert.equal(evento.status,409);
 assert.equal((await evento.json()).erro,'CONFLITO');
 assert.equal(total(m,'admin_carrinho_loop_eventos_demo'),0);
 const sync=await fetch(url+'/sincronizar',{method:'POST',headers:AUTH,body:'{}'});
 assert.equal(sync.status,409);
 assert.equal((await sync.json()).erro,'CONFLITO');
 assert.equal(total(m,'admin_ponte_compras_demo'),0);
 m.confirmar(pedidoId);
 const a=await m.integracao.conciliador.processar(pedidoId);
 const b=await m.integracao.conciliador.processar(pedidoId);
 assert.equal(a.posicoesNoPedido,1);
 assert.equal(b.repetida,true);
 assert.deepEqual(b.posicaoIds,a.posicaoIds);
 assert.equal(total(m,'admin_ponte_compras_demo'),1);
 assert.equal(total(m,'lab_psp_http_fixture'),1);
 assert.equal(total(m,'admin_carrinho_loop_eventos_demo'),0);
 assert.equal(m.integracao.resumoConvergencia().fontesPagamentoDuplicadas,0);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('carrinho: evento ficticio reservado primeiro impede criar segunda cobranca e POST remoto',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const {conta}=await titular(m,'Compra Manual Primeiro','fonte-unica-b@example.invalid');
 const cart=new CarrinhoLojaLoopDemoSQLite({catalogo:m.repo,contas:m.contas,
  pedidosIdentificados:m.app.locals.titularidadeCompartilhadaLoop,ponte:m.ponte});
 const pedidoId='compra-manual-primeiro';
 cart.criar({pedidoId,contaId:conta.contaId,participarLoop:true,
  itens:[{produtoId:'curso-lab-250',quantidade:1}]});
 cart.registrarEvento({pedidoId,eventoId:'evento-manual-primeiro',tipo:'CONFIRMAR_FICTICIO'});
 const antes=total(m,'lab_psp_http_fixture');
 await assert.rejects(m.integracao.cobrancas.criar({pedidoId,origem:'CARRINHO',
  clienteAsaasId:'cus_testeManual1234'}),{codigo:'FONTE_PAGAMENTO_FICTICIA_JA_INICIADA'});
 assert.equal(total(m,'lab_psp_http_fixture'),antes);
 assert.equal(m.integracao.cobrancas.consultar(pedidoId).encontrado,false);
 assert.equal(total(m,'admin_ponte_compras_demo'),0);
 assert.equal(cart.buscar(pedidoId).situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});
test('PDF: reserva ficticia ou Sandbox impede outra fonte, inclusive em repeticao',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const pdf=new PedidosPDFPagamentosDemoSQLite({repositorioCatalogo:m.repo});
 const pix=m.integracao.cobrancas;
 const antes=total(m,'lab_psp_http_fixture');
 pdf.criar({pedidoId:'pdf-primeiro-manual',produtoId:'curso-lab-250'});
 pdf.registrarEvento({pedidoId:'pdf-primeiro-manual',eventoId:'evento-pdf-primeiro',tipo:'CONFIRMAR_FICTICIO'});
 await assert.rejects(pix.criar({pedidoId:'pdf-primeiro-manual',origem:'PDF',
  clienteAsaasId:'cus_pdfPrimeiro2026'}),{codigo:'FONTE_PAGAMENTO_FICTICIA_JA_INICIADA'});
 assert.equal(total(m,'lab_psp_http_fixture'),antes);
 pdf.criar({pedidoId:'pdf-primeiro-asaas',produtoId:'curso-lab-250'});
 const a=await pix.criar({pedidoId:'pdf-primeiro-asaas',origem:'PDF',clienteAsaasId:'cus_pdfAsaas2026'});
 assert.equal(a.status,'PENDENTE_SANDBOX');
 const replay=await pix.criar({pedidoId:'pdf-primeiro-asaas',origem:'PDF',clienteAsaasId:'cus_pdfAsaas2026'});
 assert.equal(replay.repetida,true);
 assert.equal(total(m,'lab_psp_http_fixture'),antes+1);
 assert.throws(()=>pdf.registrarEvento({pedidoId:'pdf-primeiro-asaas',eventoId:'evento-indevido-pdf',tipo:'CONFIRMAR_FICTICIO'}),{codigo:'CONFLITO'});
 assert.equal(pdf.status('pdf-primeiro-asaas').habilitacaoDownloadFicticia,false);
 assert.equal(total(m,'admin_pdf_demo_eventos'),1);
 // Simula legado indevido: verificador e entrega PDF devem continuar bloqueados.
 m.banco.prepare("INSERT INTO admin_pdf_demo_eventos(evento_id,pedido_id,tipo,registrado_em) VALUES(?,?,'CONFIRMAR_FICTICIO',?)")
  .run('evento-legado-cruzado','pdf-primeiro-asaas','2026-11-01T12:00:00.000Z');
 assert.equal(pdf.status('pdf-primeiro-asaas').habilitacaoDownloadFicticia,false);
 assert.equal(pdf.buscar('pdf-primeiro-asaas').materialTesteBaixavel,false);
 assert.throws(()=>pdf.registrarSolicitacaoMaterialTeste('pdf-primeiro-asaas'),{codigo:'SEM_DIREITO'});
 const verificador=new IntegracaoLojaPDFLoopDemo({pedidosPDF:pdf,
  pedidosIdentificados:m.app.locals.titularidadeCompartilhadaLoop,ponte:m.ponte});
 const {conta}=await titular(m,'Pdf Mix Legado','pdf-mix@example.invalid');
 m.app.locals.titularidadeCompartilhadaLoop.preparar({pedidoId:'pdf-primeiro-asaas',
  contaId:conta.contaId,produtoId:'curso-lab-250',valorCentavos:25000});
 assert.throws(()=>verificador.comprovanteConfirmado('pdf-primeiro-asaas'),{codigo:'FONTE_PAGAMENTO_DUPLA'});
 const revisao=m.integracao.resumoConvergencia();
 assert.equal(revisao.fontesPagamentoDuplicadas,1);
 assert.equal(revisao.revisaoManualIndicada,true);
 assert.equal(revisao.pagamentosReais,false);
 assert.equal(total(m,'admin_ponte_compras_demo'),0);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
