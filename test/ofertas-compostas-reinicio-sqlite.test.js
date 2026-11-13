'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{randomBytes}=require('node:crypto');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {EnderecoEntregaEnsaioSQLite}=
 require('../src/domain/endereco-entrega-ensaio-sqlite');

const produto=(id,preco)=>({
 id,nome:'Produto ficticio '+id,tipo:'FISICO',estado:'PUBLICADO',
 descricao:'Componente fisico ficticio para restauracao sem pagamento.',
 precoCentavos:preco,entrega:'FORNECEDOR_INTEGRADO',fotos:[],
 detalhes:[],videoApresentacaoUrl:null
});
const endereco={destinatario:'Cliente de laboratório',cep:'27260-000',
 logradouro:'Rua de Ensaio',numero:'70',complemento:'',
 bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',
 telefone:'21999999999',referencia:''};

test('reiniciar e restaurar SQLite preserva multi-kits, revisoes, preco e pedido imutavel',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-kits-restart-'));
 const arquivo=path.join(dir,'dados.sqlite'),backup=path.join(dir,'copia.sqlite');
 const chaves={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)};
 const bancos=[];
 const criar=arquivoAtual=>{
  const banco=new DatabaseSync(arquivoAtual);
  bancos.push(banco);
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
  const app=criarAppLojaEscritorioCandidato({
   banco,repositorioCatalogo:catalogoFicticioCheckout(),
   ...chaves,segredoOperador:'laboratorio-reinicio-pacotes-'+('S'.repeat(50)),
   termosVersao:'LAB-pacotes-reinicio-2026',
   termosTexto:'Termos ficticios de integridade de pacotes e pedidos em restauracao sem cobranca.'
  });
  return {app,banco,ofertas:app.sinalizacaoVitrine.ofertasCompostas};
 };
 t.after(()=>{
  for(const banco of bancos){try{banco.close();}catch{}}
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const antes=criar(arquivo);
 const [a,b,c]=['kit-sku-tenis','kit-sku-camisa','kit-sku-livro'];
 for(const [id,preco] of [[a,30000],[b,10000],[c,4000]]){
  const r=await antes.app.catalogo.criar({produto:produto(id,preco),
   chaveIdempotencia:'reinicio-criar-'+id+'-001'});
  assert.equal(r.produto.id,id);
 }
 await antes.app.sinalizacaoVitrine.atualizar(a,{
  classificacao:'DOURADO',quantidadeMinimaLoop:1,revisaoEsperada:0});
 await antes.app.sinalizacaoVitrine.atualizar(b,{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0});
 const r1={nome:'Pacote misto um',cor:'ROXO',estado:'PUBLICADO',
  itens:[{produtoId:a,quantidade:1},{produtoId:b,quantidade:1}],
  posicoesPorPedido:1,revisaoEsperada:0};
 const r2={nome:'Pacote misto dois',cor:'DOURADO',estado:'PUBLICADO',
  itens:[{produtoId:a,quantidade:1},{produtoId:c,quantidade:1}],
  posicoesPorPedido:2,revisaoEsperada:0};
 assert.equal((await antes.ofertas.salvar('kit-reinicio-um',r1)).revisao,1);
 assert.equal((await antes.ofertas.salvar('kit-reinicio-dois',r2)).revisao,1);
 const cliente=await antes.app.contas.cadastrar({
  nome:'Pessoa de Ensaio',nick:'ReinicioKit',
  email:'reiniciokit@example.invalid',senha:'SenhaFicticiaTeste2026!',
  aceiteExplicito:true,termosVersao:'LAB-pacotes-reinicio-2026',
  termosTexto:'Termos ficticios de integridade de pacotes e pedidos em restauracao sem cobranca.'
 });
 const titularId=cliente.titularId;
 new EnderecoEntregaEnsaioSQLite({banco:antes.banco,
  chaveCifra:chaves.chaveCifra}).salvar(titularId,endereco);
 const entrada={itens:[{produtoId:a,quantidade:2},
  {produtoId:b,quantidade:1},{produtoId:c,quantidade:1}],
  ofertasCompostasSelecionadas:[
   {id:'kit-reinicio-um',revisao:1,quantidade:1},
   {id:'kit-reinicio-dois',revisao:1,quantidade:1}
  ]};
 const cotacao=await cotarCheckoutPublico({
  repositorio:antes.app.catalogo,entrada:{itens:entrada.itens}
 });
 const pacotes=antes.ofertas.fotografar(cotacao.itens,{
  selecoes:entrada.ofertasCompostasSelecionadas});
 const cotacaoComSelecao={...cotacao,
  ofertasCompostasCotadas:pacotes.map(p=>({
   id:p.id,revisao:p.revisao,quantidade:p.quantidadePacotes}))};
 const chaveIdempotencia='reinicio-pedido-multikits-2026';
 const intencao=antes.app.intencoes.criar({
  titularId,chaveIdempotencia,entrada,cotacao:cotacaoComSelecao
 });
 const criado=await antes.app.prePedidos.preparar({
  titularId,rascunhoId:intencao.intencao.pedidoId,
  repositorioCatalogo:antes.app.catalogo
 });
 const pedidoId=criado.prepedido.prepedidoId;
 const fotografia=antes.app.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:pedidoId,titularId});
 assert.equal(fotografia.ofertasCompostas.length,2);
 assert.equal(fotografia.planejamentoPosicoes.quantidadePosicoesPrevistas,3);
 assert.equal(fotografia.direitosCriados,0);
 assert.equal(fotografia.totalCentavos,74000);
 const historico=antes.ofertas.historico('kit-reinicio-um');
 assert.equal(historico.length,1);
 // Fechar antes da copia assegura checkpoint de qualquer WAL pendente.
 antes.banco.close();
 fs.copyFileSync(arquivo,backup);
 const depois=criar(arquivo);
 assert.equal(depois.ofertas.listar({publicadas:true}).length,2);
 assert.equal(depois.ofertas.consultar('kit-reinicio-um').revisao,1);
 assert.deepEqual(depois.ofertas.historico('kit-reinicio-um'),historico);
 assert.deepEqual(depois.app.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:pedidoId,titularId}),fotografia);
 assert.equal(depois.app.prePedidos.consultar({titularId,
  prepedidoId:pedidoId}).totalCentavos,74000);
 const repetida=depois.app.intencoes.consultarPorChave({
  titularId,chaveIdempotencia,entrada
 });
 assert.equal(repetida.pedidoId,intencao.intencao.pedidoId);
 assert.deepEqual(new EnderecoEntregaEnsaioSQLite({
  banco:depois.banco,chaveCifra:chaves.chaveCifra
 }).consultarPrepedido({titularId,prepedidoId:pedidoId}).endereco,
  endereco,'endereco cifrado continua recuperavel com a mesma custodia');
 const revisado=await depois.ofertas.salvar('kit-reinicio-um',{
  ...r1,cor:'CINZA',posicoesPorPedido:0,revisaoEsperada:1});
 assert.equal(revisado.revisao,2);
 assert.deepEqual(depois.app.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:pedidoId,titularId}),fotografia,
 'alteracao administrativa em funcionamento nao muda compra anterior');
 assert.throws(()=>depois.ofertas.fotografar(cotacao.itens,{
  selecoes:entrada.ofertasCompostasSelecionadas}),
  /OFERTA_COMPOSTA_ALTERADA_REFAZER_COTACAO/);
 assert.equal(depois.ofertas.historico('kit-reinicio-um').length,2);
 assert.equal(depois.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(depois.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 depois.banco.close();
 // Restauracao isolada preserva exatamente o estado anterior as edicoes.
 const restaurado=criar(backup);
 assert.equal(restaurado.ofertas.consultar('kit-reinicio-um').revisao,1);
 assert.equal(restaurado.ofertas.historico('kit-reinicio-um').length,1);
 assert.deepEqual(restaurado.app.sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:pedidoId,titularId}),fotografia);
 assert.equal(restaurado.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(restaurado.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(restaurado.banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
 ).get().n,1);
});
