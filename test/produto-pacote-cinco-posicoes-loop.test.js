'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function produto(id,valor){
 return {id,nome:'Produto de teste '+id,tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Produto apenas demonstrativo',precoCentavos:valor,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('produto especial cria seis posicoes atomicas, bloqueia sexta e libera uma apos ciclo concluido',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 repo.salvar({produto:produto('pacote-cinco',150000),revisaoEsperada:0});
 repo.salvar({produto:produto('produto-comum',25000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const usuario=contas.cadastrar({nome:'Cliente Pacote Cinco',
  email:'pacote-cinco@exemplo.invalid',senha:'senha-ficticia-123456'});
 const segundo=contas.cadastrar({nome:'Cliente Pacote Secundario',
  email:'pacote-secundario@exemplo.invalid',senha:'senha-ficticia-123456'});
 const segredo='admin-pacote-cinco-apenas-laboratorio-2026';
 const servidor=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(servidor,'listening');t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const cab={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const req=async(method,path,body,headers=cab)=>{
  const x=await fetch(base+'/api/admin/'+path,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:x.status,data:await x.json()};
 };
 const caminho='carrinho-loop-demo';
 const inicial=(await req('GET',caminho+'/elegibilidade')).data.produtos;
 assert.equal(inicial.find(p=>p.produtoId==='pacote-cinco').posicoesPorPedidoLoop,1);
 const evento={
  eventoId:'evento-pacote-6',produtoId:'pacote-cinco',
  titulo:'Evento Especial de Seis Posições',
  descricao:'Compre o produto especial e obtenha seis posições de teste',
  quantidadeMinimaLoop:1,posicoesPorPedidoLoop:6,
  dataInicio:new Date().toISOString().slice(0,10),
  dataFim:new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 };
 assert.equal((await req('POST',caminho+'/pacote-posicoes',{
  produtoId:'pacote-cinco',posicoesPorPedidoLoop:6,revisaoEsperada:1
 })).status,409); // pacote permanente nao pode mais ser configurado
 assert.equal((await req('POST',caminho+'/eventos-especiais',{
  ...evento,posicoesPorPedidoLoop:7
 })).status,400);
 assert.equal((await req('POST',caminho+'/eventos-especiais',evento,
  {'Content-Type':'application/json'})).status,401);
 const configurado=await req('POST',caminho+'/eventos-especiais',evento);
 assert.equal(configurado.status,201,JSON.stringify(configurado.data));
 assert.equal(configurado.data.evento.posicoesPorPedidoLoop,6);
 assert.equal((await req('GET',caminho+'/opcoes')).data.produtos
  .find(p=>p.produtoId==='pacote-cinco').eventoId,'evento-pacote-6');
 assert.equal((await req('POST',caminho+'/eventos-especiais',evento)).status,409);
 assert.equal((await req('GET','escritorio-demo/publicacoes')).data.publicacoes
  .some(p=>p.tipo==='EVENTO'),true);
 async function criar(id,contaId,produtoId){
  const r=await req('POST',caminho,{pedidoId:id,contaId,itens:[{produtoId,quantidade:1}]});
  assert.equal(r.status,201,JSON.stringify(r.data));
  return r.data.pedido;
 }
 async function pagar(id){
  const r=await req('POST',caminho+'/'+id+'/eventos',{
   eventoId:'evento-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(r.status,200,JSON.stringify(r.data));
  return r.data.integracao;
 }
 const pedido=await criar('compra-pacote',usuario.contaId,'pacote-cinco');
 assert.equal(pedido.posicoesSolicitadas,6);
 assert.equal(pedido.itens[0].posicoesPorPedidoLoop,6);
 const pagamento=await pagar('compra-pacote');
 assert.equal(pagamento.posicoesCriadas,6,JSON.stringify(pagamento));
 assert.equal(pagamento.posicaoIds.length,6);
 assert.equal(new Set(pagamento.posicaoIds).size,6);
 assert.equal((await req('GET','ponte-compras-convites-demo')).data.filas.B.quantidade,6);
 assert.equal((await req('POST',caminho+'/compra-pacote/sincronizar',{})).data.repetido,true);
 assert.equal(repo.banco.prepare(
  "SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id='compra-pacote'"
 ).get().n,5);
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>null});
 const escritorio=new EscritorioIndividualDemo({ponte,contas});
 assert.equal(escritorio.consultar(usuario.contaId).posicoes.length,6);
 assert.equal(escritorio.consultar(usuario.contaId).vagasLivres,4);
 assert.equal(escritorio.consultar(usuario.contaId).compras[0].posicaoIds.length,6);
 const rejeitado=await criar('sexta-vaga-bloqueada',usuario.contaId,'produto-comum');
 const integracao=await pagar('sexta-vaga-bloqueada');
 assert.equal(integracao.posicoesCriadas,1);
 assert.equal(escritorio.consultar(usuario.contaId).vagasLivres,3);
 // Um segundo titular continua tendo direito a suas proprias seis vagas.
 const normal=await criar('pedido-comum-outro',segundo.contaId,'produto-comum');
 assert.equal(normal.posicoesSolicitadas,1);
 assert.equal((await pagar('pedido-comum-outro')).posicoesCriadas,1);
 const pacoteParcial=await criar('pacote-sem-cinco-vagas',segundo.contaId,'pacote-cinco');
 assert.equal(pacoteParcial.posicoesSolicitadas,6);
 const naoParcial=await pagar('pacote-sem-cinco-vagas');
 assert.equal(naoParcial.situacao,'SINCRONIZACAO_PENDENTE');
 assert.equal(naoParcial.erro,'LIMITE_ATIVO');
 assert.equal(repo.banco.prepare(
  "SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id='pacote-sem-cinco-vagas'"
 ).get().n,0);
 // O CPF ficticio e termos continuam independentes do produto comprado.
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>new Date().toISOString()});
 assert.equal(adesoes.ativar({contaId:usuario.contaId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,6);
 const preparado=ponte.prepararTabuleiroDemo();
 assert.ok(preparado.tabuleiro.centro);
 assert.equal(preparado.tabuleiro.centro.participanteId,usuario.contaId);
 const sim=ponte._restaurar();
 for(let i=0;i<6;i++)sim.registrarVendaNoCicloSimulada({vendaId:'venda-do-ciclo-'+i});
 sim.abrirCatraca();
 assert.equal(sim.tentarGiro().girou,true);
 // Registra so o estado da simulacao, sem dinheiro nem saques.
 repo.banco.prepare(`
  UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1
 `).run(JSON.stringify(sim.exportarSnapshot()));
 assert.equal(escritorio.consultar(usuario.contaId).vagasLivres,1);
 // A compra comum anteriormente confirmada e em conferencia pode sincronizar agora.
 const retomado=await req('POST',caminho+'/sexta-vaga-bloqueada/sincronizar',{});
 assert.equal(retomado.status,200,JSON.stringify(retomado.data));
 assert.equal(retomado.data.posicoesCriadas,1);
 assert.equal(escritorio.consultar(usuario.contaId).vagasLivres,0);
 assert.equal(escritorio.consultar(usuario.contaId).posicoes.length,6);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,3);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo').get().n,5);
 assert.throws(()=>repo.banco.exec(
  "UPDATE loop_evento_especial_historico_demo SET acao='ENCERRADO'"
 ),/historico imutavel/);
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_carrinho_item_pacote_posicoes_demo SET posicoes_por_pedido=1'
 ),/pacote congelado no pedido/);
 const painel=await(await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(painel,/formEventoEspecialLoopDemo/);
 const codigo=await(await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(codigo,/criarEventoEspecialLoopDemo/);
});
