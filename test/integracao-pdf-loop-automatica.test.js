'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function produto(id,preco){
 return {id,nome:'PDF ficticio '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Somente simulacao de material digital',
  precoCentavos:preco,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('pedido PDF confirmado cria posicao azul, move indicador a A e ignora compra abaixo do minimo',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:produto('curso-loop-integrado',25000),revisaoEsperada:0});
 repo.salvar({produto:produto('curso-loja-barato',10000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const a=contas.cadastrar({nome:'Pessoa Indicadora Demo',email:'indicadora@exemplo.invalid',
  senha:'senha-ficticia-segura-2026'});
 const b=contas.cadastrar({nome:'Pessoa Convidada Demo',email:'convidada@exemplo.invalid',
  senha:'senha-ficticia-segura-2026',codigoIndicador:a.codigoConvite});
 const segredo='admin-pdf-loop-auto-teste-2026-seguro';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const h={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const get=async p=>{
  const resp=await fetch(base+'/api/admin/'+p,{headers:h});
  return {status:resp.status,body:await resp.json()};
 };
 const post=async(p,body)=>{
  const resp=await fetch(base+'/api/admin/'+p,{
   method:'POST',headers:h,body:JSON.stringify(body)
  });
  return {status:resp.status,body:await resp.json()};
 };
 const pdf='pedidos-pdf-demo';
 const ponte='ponte-compras-convites-demo';
 async function compra(id,produtoId,contaId,eventoId){
  assert.equal((await post(pdf,{pedidoId:id,produtoId})).status,200);
  const antes=await get(pdf+'/'+id+'/estado-loop');
  assert.equal(antes.body.vinculado,false);
  const vinculo=await post(pdf+'/'+id+'/vincular-loop',{contaId});
  assert.equal(vinculo.status,200);
  assert.equal(vinculo.body.titularFixado,true);
  const pendente=await post(pdf+'/'+id+'/sincronizar-loop',{});
  assert.equal(pendente.body.situacao,'AGUARDANDO_PAGAMENTO');
  const evento=await post(pdf+'/'+id+'/eventos',{
   eventoId,tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(evento.status,200);
  assert.equal(evento.body.integracaoLoop.integracao,'PDF_PARA_LOOP_FICTICIA');
  assert.equal(evento.body.integracaoLoop.repetido,false);
  return evento.body;
 }
 const indevido=await post(pdf,{pedidoId:'pdf-ainda-sem-titular',produtoId:'curso-loop-integrado'});
 assert.equal(indevido.status,200);
 const n=await post(pdf+'/pdf-ainda-sem-titular/eventos',{
  eventoId:'evt-sem-titular',tipo:'CONFIRMAR_FICTICIO'
 });
 assert.equal(n.status,200);
 assert.equal(n.body.integracaoLoop.situacao,'SEM_TITULAR_PREDEFINIDO');
 assert.equal((await post(pdf+'/pdf-ainda-sem-titular/vincular-loop',{contaId:a.contaId})).status,409);

 const ra=await compra('pedido-pdf-azul-a','curso-loop-integrado',a.contaId,'confirm-a');
 assert.equal(ra.integracaoLoop.posicaoCriada,true);
 assert.equal(ra.integracaoLoop.statusAdesao,'PENDENTE');
 let estado=(await get(ponte)).body;
 assert.equal(estado.compras.length,1);
 assert.equal(estado.filas.B.quantidade,1);
 assert.equal(estado.filas.A.quantidade,0);

 const barato=await compra('pedido-pdf-loja-barata','curso-loja-barato',b.contaId,'confirm-barato');
 assert.equal(barato.integracaoLoop.posicaoCriada,false);
 assert.equal(barato.integracaoLoop.compraElegivelLoop,false);
 estado=(await get(ponte)).body;
 assert.equal(estado.compras.length,1);
 assert.equal(estado.comprasLojaSemLoop.length,1);
 assert.equal(estado.convites.length,0);

 const rb=await compra('pedido-pdf-azul-b','curso-loop-integrado',b.contaId,'confirm-b');
 assert.equal(rb.integracaoLoop.posicaoCriada,true);
 assert.equal(rb.integracaoLoop.indicacaoNova,true);
 estado=(await get(ponte)).body;
 assert.equal(estado.compras.length,2);
 assert.equal(estado.convites.length,1);
 assert.equal(estado.filas.A.quantidade,1);
 assert.equal(estado.filas.B.quantidade,1);
 assert.equal(estado.filas.A.pessoas[0].participanteId,a.contaId);
 assert.equal(estado.filas.A.pessoas[0].statusAdesao,'PENDENTE');
 assert.equal(estado.filas.B.pessoas[0].participanteId,b.contaId);
 const repetido=await post(pdf+'/pedido-pdf-azul-b/eventos',{
  eventoId:'confirm-b',tipo:'CONFIRMAR_FICTICIO'
 });
 assert.equal(repetido.status,200);
 assert.equal(repetido.body.repetido,true);
 assert.equal(repetido.body.integracaoLoop.repetido,true);
 assert.equal((await get(ponte)).body.compras.length,2);

 const fraud=await post(pdf+'/pedido-pdf-azul-a/eventos',{
  eventoId:'fraude',tipo:'CONFIRMAR_FICTICIO',pago:true
 });
 assert.equal(fraud.status,400);
 const troca=await post(pdf+'/pedido-pdf-azul-a/vincular-loop',{contaId:b.contaId});
 assert.equal(troca.status,409);
 const estorno=await post(pdf+'/pedido-pdf-azul-b/eventos',{
  eventoId:'estorno-b',tipo:'ESTORNAR_FICTICIO'
 });
 assert.equal(estorno.status,200);
 assert.equal(estorno.body.integracaoLoop.situacao,'ESTORNADO_REQUER_CONFERENCIA');
 assert.equal((await get(ponte)).body.compras.length,2);
 // No servidor publico nenhuma destas rotas existe.
 const publicServer=require('../src/server').listen(0,'127.0.0.1');
 await once(publicServer,'listening');
 t.after(()=>new Promise(resolve=>publicServer.close(resolve)));
 const publ='http://127.0.0.1:'+publicServer.address().port;
 assert.equal((await fetch(publ+'/api/admin/pedidos-pdf-demo/pedido-pdf-azul-a/vincular-loop',{
  method:'POST',headers:h,body:JSON.stringify({contaId:a.contaId})
 })).status,404);
});
