'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto'),{once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-composicoes-'+('T'.repeat(48));
const senha='SenhaDeEnsaio2026!';
const endereco={destinatario:'Cliente de ensaio',cep:'27260-000',
 logradouro:'Rua dos Testes',numero:'20',complemento:'',
 bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',
 telefone:'21999999999',referencia:''};
const produto=(id,preco)=>({
 id,nome:'Produto de ensaio '+id,tipo:'FISICO',estado:'PUBLICADO',
 descricao:'Produto ficticio com SKU e remessa individual.',
 precoCentavos:preco,entrega:'FORNECEDOR_INTEGRADO',fotos:[],
 detalhes:[],videoApresentacaoUrl:null
});
test('kit multissku: admin salva, loja monta pedido, snapshot impede beneficio duplicado',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const {app,catalogo,sinalizacaoVitrine}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-kit-multissku-2026',
  termosTexto:'Pacotes ficticios sem financeiros, remessas ou posicoes reais.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,{method='GET',body,admin=false,cookie,csrf,key,lab=false}={})=>{
  const r=await fetch(base+path,{method,headers:{
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(lab?{'X-LOOP-LAB':'participante'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),headers:r.headers};
 };
 for(const [id,preco] of [['tenis-modelo-a',12000],['camiseta-modelo-b',18000]]){
  const r=await catalogo.criar({produto:produto(id,preco),
   chaveIdempotencia:'chave-criar-produto-'+id});
  assert.equal(r.produto.id,id);
 }
 const a='tenis-modelo-a',b='camiseta-modelo-b';
 // Sem pacote, o produto A teria duas posicoes ROXAS sozinho:
 // o pacote completo deve sobrepor esta regra individual.
 await sinalizacaoVitrine.atualizar(a,{
  classificacao:'ROXO',quantidadeMinimaLoop:1,
  posicoesPorUnidadeRoxo:2,revisaoEsperada:0});
 await sinalizacaoVitrine.atualizar(b,{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0});
 const prefix='/staging/escritorio-unificado/ofertas-compostas';
 const comprador='/staging/vitrine/loja';
 const itens=[{produtoId:a,quantidade:2},{produtoId:b,quantidade:1}];
 const regra={nome:'Conjunto tênis e camiseta',cor:'ROXO',
  estado:'PUBLICADO',itens,posicoesPorPedido:1,revisaoEsperada:0};
 assert.equal((await call(prefix)).status,401,'visitante nao lista contratos admin');
 assert.equal((await call(prefix+'/kit-misto-a',{method:'PUT',body:regra})).status,401);
 const salvo=await call(prefix+'/kit-misto-a',{method:'PUT',body:regra,admin:true});
 assert.equal(salvo.status,200,JSON.stringify(salvo.data));
 assert.equal(salvo.data.oferta.revisao,1);
 assert.equal(salvo.data.posicoesReais,0);
 const inventario=await call(prefix,{admin:true});
 assert.equal(inventario.data.ofertas.length,1);
 assert.equal(inventario.data.ofertas[0].itens.length,2);
 const conflito=await call(prefix+'/kit-misto-a',{method:'PUT',
  admin:true,body:regra});
 assert.equal(conflito.status,409,'revisao antiga nao sobrescreve a atual');
 const igual=await call(prefix+'/kit-concorrente',{method:'PUT',admin:true,
  body:{...regra,nome:'Outro kit com os mesmos itens',cor:'DOURADO',
   posicoesPorPedido:2,revisaoEsperada:0}});
 assert.equal(igual.status,200,JSON.stringify(igual.data));
 assert.equal(igual.data.oferta.revisao,1);
 assert.equal((await call(prefix,{admin:true})).data.ofertas.length,2,
  'os mesmos SKUs podem estar em varios kits');
 const criar=async nick=>{
  const registro=await call('/staging/contas/cadastrar',{method:'POST',body:{
   nome:'Cliente '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
   senha,aceiteExplicito:true}});
  assert.equal(registro.status,201,JSON.stringify(registro.data));
  const login=await call('/staging/contas/entrar',{method:'POST',body:{nick,senha}});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')
   .match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
  const usuario={cookie,csrf:login.data.csrf,titularId:login.data.titularId};
  const end=await call(comprador+'/entrega',{
   method:'POST',cookie,csrf:usuario.csrf,lab:true,body:endereco});
  assert.equal(end.status,200,JSON.stringify(end.data));
  return usuario;
 };
 const pessoa=await criar('KitAna'),outro=await criar('KitBia');
 const vitrine=await call(comprador+'/catalogo',{cookie:pessoa.cookie});
 assert.equal(vitrine.status,200);
 assert.equal(vitrine.data.ofertasCompostas.length,2);
 const publicado=vitrine.data.ofertasCompostas.find(o=>o.id==='kit-misto-a');
 assert.equal(publicado.precoPacoteCentavos,42000);
 assert.deepEqual(publicado.itens.map(x=>x.produtoId),[a,b]);
 const simulacao=await call('/staging/vitrine/simular-qualificacao',{
  method:'POST',body:{itens,ofertaCompostaId:'kit-misto-a',
   ofertaCompostaRevisao:1},
  cookie:pessoa.cookie,csrf:pessoa.csrf,lab:true});
 assert.equal(simulacao.status,200,JSON.stringify(simulacao.data));
 assert.equal(simulacao.data.planejamentoPosicoes.quantidadePosicoesPrevistas,1);
 assert.equal(simulacao.data.planejamentoPosicoes.posicoesRoxo,1);
 assert.equal(simulacao.data.planejamentoPosicoes.posicoesVerde,0);
 const parcial=await call('/staging/vitrine/simular-qualificacao',{
  method:'POST',body:{itens:[{produtoId:a,quantidade:1}]},
  cookie:pessoa.cookie,csrf:pessoa.csrf,lab:true});
 assert.equal(parcial.status,200);
 assert.equal(parcial.data.ofertasCompostas.length,0);
 const pedido=async (usuario,key,items,id='kit-misto-a',rev=1)=>
  call(comprador+'/pedidos',{
   method:'POST',body:{itens:items,ofertaCompostaId:id,
    ofertaCompostaRevisao:rev},
   cookie:usuario.cookie,csrf:usuario.csrf,key,lab:true});
 const primeiro=await pedido(pessoa,'kit-completo-primeiro-0001',itens);
 assert.equal(primeiro.status,201,JSON.stringify(primeiro.data));
 assert.equal(primeiro.data.pagamentoReal,false);
 assert.equal(primeiro.data.posicoesCriadas,0);
 const pedidoId=primeiro.data.pedido.pedidoId;
 const foto=sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:pedidoId});
 assert.equal(foto.totalCentavos,42000);
 assert.equal(foto.itens.length,2,'pedido registra produtos, nao pseudo-SKU');
 assert.equal(foto.ofertasCompostas.length,1);
 assert.equal(foto.ofertasCompostas[0].itens.length,2);
 assert.equal(foto.planejamentoPosicoes.quantidadePosicoesPrevistas,1);
 assert.equal(foto.planejamentoPosicoes.posicoesRoxo,1);
 assert.equal(foto.planejamentoPosicoes.posicoesVerde,0);
 assert.equal(foto.planejamentoPosicoes.direitosReaisCriados,0);
 assert.equal(foto.podeSimularFilaBAzul,true);
 const repetido=await pedido(pessoa,'kit-completo-primeiro-0001',itens);
 assert.equal(repetido.status,200);
 assert.equal(repetido.data.pedido.pedidoId,pedidoId);
 const conflitoEscolha=await pedido(pessoa,'kit-completo-primeiro-0001',
  itens,'kit-concorrente',1);
 assert.equal(conflitoEscolha.status,409,
  'chave idempotente nao pode aplicar outra oferta com SKUs iguais');
 assert.equal((await call(comprador+'/pedidos',{cookie:outro.cookie})).data.pedidos.length,0);
 const alternativa=await pedido(outro,'kit-dourado-alternativo-0003',
  itens,'kit-concorrente',1);
 assert.equal(alternativa.status,201,JSON.stringify(alternativa.data));
 const fotoAlternativa=sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:alternativa.data.pedido.pedidoId});
 assert.equal(fotoAlternativa.ofertasCompostas[0].id,'kit-concorrente');
 assert.equal(fotoAlternativa.planejamentoPosicoes.posicoesDourado,2);
 assert.equal(fotoAlternativa.planejamentoPosicoes.posicoesRoxo,0);
 assert.equal(fotoAlternativa.planejamentoPosicoes.quantidadePosicoesPrevistas,2);
 assert.equal(fotoAlternativa.direitosCriados,0);
 const substituido=await call(prefix+'/kit-misto-a',{method:'PUT',admin:true,
  body:{...regra,cor:'CINZA',posicoesPorPedido:0,revisaoEsperada:1}});
 assert.equal(substituido.status,200);
 const antiga=sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:pedidoId});
 assert.deepEqual(antiga,foto,'revisao nao muda fotografia anterior');
 const obsoleto=await pedido(outro,'kit-revisao-antiga-0004',itens,
  'kit-misto-a',1);
 assert.equal(obsoleto.status,409,'regra obsoleta nao gera pedido');
 const segundo=await pedido(outro,'kit-cinza-segundo-0002',itens,
  'kit-misto-a',2);
 assert.equal(segundo.status,201,JSON.stringify(segundo.data));
 const novaFoto=sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:segundo.data.pedido.pedidoId});
 assert.equal(novaFoto.planejamentoPosicoes.quantidadePosicoesPrevistas,0);
 assert.equal(novaFoto.ofertasCompostas[0].cor,'CINZA');
 const hist=await call(prefix+'/kit-misto-a/historico',{admin:true});
 assert.equal(hist.data.historico.length,2);
 assert.throws(()=>banco.exec('DELETE FROM akitemm_ofertas_compostas_historico'),
  /historico de ofertas imutavel/);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
 ).get().n,3);
});
test('controle de pacotes rejeita quantidades invalidas sem saldo real',async()=>{
 const {OfertasCompostasCandidatoSQLite}=require(
  '../src/domain/ofertas-compostas-candidato-sqlite');
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const cat={db:banco,buscar:async id=>({id,estado:'PUBLICADO',
  tipo:'FISICO',precoCentavos:10000})};
 const ofertas=new OfertasCompostasCandidatoSQLite({banco,catalogo:cat});
 const base={nome:'Dois produtos',cor:'ROXO',estado:'PUBLICADO',
  itens:[{produtoId:'produto-a',quantidade:1},{produtoId:'produto-b',quantidade:1}],
  posicoesPorPedido:1,revisaoEsperada:0};
 const invalidos=[
  {...base,itens:[base.itens[0],base.itens[0]]},
  {...base,itens:[{...base.itens[0],quantidade:51},base.itens[1]]},
  {...base,itens:[base.itens[0]]},
  {...base,cor:'CINZA',posicoesPorPedido:2},
  {...base,cor:'VERDE',posicoesPorPedido:5},
  {...base,cor:'DOURADO',posicoesPorPedido:1},
 ];
 try{
  for(const x of invalidos)await assert.rejects(
   ofertas.salvar('kit-errado',x),/OFERTA_COMPOSTA_/);
  assert.equal(ofertas.listar().length,0);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});

test('varios pacotes no mesmo pedido alocam SKUs compartilhados por unidade, multiplicidade e sobra',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const {app,catalogo,sinalizacaoVitrine}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-multipacotes-2026',
  termosTexto:'Pacotes ficticios, sem pagamento ou direitos financeiros.'
 });
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(async()=>{await new Promise(ok=>servidor.close(ok));banco.close();});
 const base='http://127.0.0.1:'+servidor.address().port;
 const call=async(rota,{method='GET',body,admin=false,cookie,csrf,key,lab=false}={})=>{
  const resposta=await fetch(base+rota,{method,headers:{
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(lab?{'X-LOOP-LAB':'participante'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:resposta.status,body:await resposta.json(),headers:resposta.headers};
 };
 const a='tenis-composto',b='camisa-composta',c='caderno-composto';
 for(const [id,preco] of [[a,30000],[b,10000],[c,3000]]){
  await catalogo.criar({produto:produto(id,preco),
   chaveIdempotencia:'criar-pacotes-multiplos-'+id});
 }
 await sinalizacaoVitrine.atualizar(a,{
  classificacao:'DOURADO',quantidadeMinimaLoop:1,revisaoEsperada:0});
 await sinalizacaoVitrine.atualizar(b,{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0});
 const rota='/staging/escritorio-unificado/ofertas-compostas';
 const oferta1={nome:'Tênis e camisa',cor:'ROXO',estado:'PUBLICADO',
  itens:[{produtoId:a,quantidade:1},{produtoId:b,quantidade:1}],
  posicoesPorPedido:1,revisaoEsperada:0};
 const oferta2={nome:'Tênis e caderno',cor:'DOURADO',estado:'PUBLICADO',
  itens:[{produtoId:a,quantidade:1},{produtoId:c,quantidade:1}],
  posicoesPorPedido:2,revisaoEsperada:0};
 for(const [id,regra] of [['kit-roxo-casa',oferta1],['kit-dourado-casa',oferta2]]){
  const salvo=await call(rota+'/'+id,{method:'PUT',admin:true,body:regra});
  assert.equal(salvo.status,200,JSON.stringify(salvo.body));
 }
 const loginName='MultiKitA';
 const registro=await call('/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Cliente Multikit',nick:loginName,email:'multikit@example.invalid',
  senha,aceiteExplicito:true}});
 assert.equal(registro.status,201,JSON.stringify(registro.body));
 const login=await call('/staging/contas/entrar',{method:'POST',
  body:{nick:loginName,senha}});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')
  .match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const csrf=login.body.csrf;
 const addr=await call('/staging/vitrine/loja/entrega',{
  method:'POST',body:endereco,cookie,csrf,lab:true});
 assert.equal(addr.status,200);
 const selections=[
  {id:'kit-roxo-casa',revisao:1,quantidade:1},
  {id:'kit-dourado-casa',revisao:1,quantidade:1}
 ];
 const itens=[{produtoId:a,quantidade:2},{produtoId:b,quantidade:1},
  {produtoId:c,quantidade:1}];
 const quote=async items=>call('/staging/vitrine/simular-qualificacao',{
  method:'POST',body:{itens:items,ofertasCompostasSelecionadas:selections},
  cookie,csrf,lab:true});
 const previa=await quote(itens);
 assert.equal(previa.status,200,JSON.stringify(previa.body));
 assert.equal(previa.body.planejamentoPosicoes.posicoesRoxo,1);
 assert.equal(previa.body.planejamentoPosicoes.posicoesDourado,2);
 assert.equal(previa.body.planejamentoPosicoes.posicoesVerde,0);
 assert.equal(previa.body.planejamentoPosicoes.quantidadePosicoesPrevistas,3);
 assert.equal(previa.body.planejamentoPosicoes.valorVerdeConsideradoCentavos,0);
 const enviar=async(key,body)=>call('/staging/vitrine/loja/pedidos',{
  method:'POST',body,cookie,csrf,key,lab:true});
 const body={itens,ofertasCompostasSelecionadas:selections};
 const p=await enviar('multikit-pedido-conjunto-0001',body);
 assert.equal(p.status,201,JSON.stringify(p.body));
 assert.equal(p.body.posicoesCriadas,0);
 const id=p.body.pedido.pedidoId;
 const foto=sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:id});
 assert.equal(foto.ofertasCompostas.length,2);
 assert.deepEqual(foto.ofertasCompostas.map(x=>x.id),
  ['kit-roxo-casa','kit-dourado-casa']);
 assert.equal(foto.planejamentoPosicoes.quantidadePosicoesPrevistas,3);
 assert.equal(foto.planejamentoPosicoes.posicoesDourado,2);
 assert.equal(foto.planejamentoPosicoes.posicoesRoxo,1);
 assert.equal(foto.planejamentoPosicoes.direitosReaisCriados,0);
 assert.equal((await enviar('multikit-pedido-conjunto-0001',body)).status,200);
 assert.equal((await enviar('multikit-pedido-conjunto-0001',{
  itens,ofertasCompostasSelecionadas:[selections[0]]})).status,409);
 const falta=await enviar('multikit-falta-unidades-0002',{
  itens:[{produtoId:a,quantidade:1},{produtoId:b,quantidade:1},
   {produtoId:c,quantidade:1}],ofertasCompostasSelecionadas:selections});
 assert.equal(falta.status,409,JSON.stringify(falta.body));
 assert.equal(falta.body.erro,'OFERTA_COMPOSTA_QUANTIDADE_EXCEDIDA');
 const repeticoes=[
  {id:'kit-roxo-casa',revisao:1,quantidade:2},
  {id:'kit-dourado-casa',revisao:1,quantidade:1}
 ];
 const q=await enviar('multikit-repeticao-00003',{
  itens:[{produtoId:a,quantidade:3},{produtoId:b,quantidade:2},
   {produtoId:c,quantidade:1}],
  ofertasCompostasSelecionadas:repeticoes});
 assert.equal(q.status,201,JSON.stringify(q.body));
 const fotoQ=sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:q.body.pedido.pedidoId});
 assert.equal(fotoQ.planejamentoPosicoes.quantidadePosicoesPrevistas,4);
 assert.equal(fotoQ.planejamentoPosicoes.posicoesRoxo,2);
 assert.equal(fotoQ.planejamentoPosicoes.posicoesDourado,2);
 assert.equal(fotoQ.ofertasCompostas[0].quantidadePacotes,2);
 assert.equal(fotoQ.ofertasCompostas[0].itens[0].quantidade,2);
 // Uma unidade adicional nao reservada por kits: aplica regra individual
 // do SKU uma vez, nao duplica as unidades ja usadas pelos kits.
 const sobra=await enviar('multikit-com-sobra-00004',{
  itens:[{produtoId:a,quantidade:3},{produtoId:b,quantidade:1},
   {produtoId:c,quantidade:1}],
  ofertasCompostasSelecionadas:selections});
 assert.equal(sobra.status,201,JSON.stringify(sobra.body));
 const fotoS=sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:sobra.body.pedido.pedidoId});
 assert.equal(fotoS.planejamentoPosicoes.quantidadePosicoesPrevistas,4);
 assert.equal(fotoS.planejamentoPosicoes.posicoesDourado,3,
  'duas previstas pelos kits e uma da unidade dourada livre');
 const trocar=await call(rota+'/kit-roxo-casa',{method:'PUT',admin:true,
  body:{...oferta1,cor:'CINZA',posicoesPorPedido:0,revisaoEsperada:1}});
 assert.equal(trocar.status,200);
 assert.deepEqual(sinalizacaoVitrine.consultarFotografiaPrepedido({
  prepedidoId:id}),foto,'fotografia historica imutavel');
 const stale=await enviar('multikit-versao-antiga-05',body);
 assert.equal(stale.status,409,'mudanca exige nova revisao do pacote');
 const cp=await enviar('multikit-corpo-duplicado-06',{
  itens,ofertasCompostasSelecionadas:[selections[0],selections[0]]});
 assert.equal(cp.status,400);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
 ).get().n,3);
});
