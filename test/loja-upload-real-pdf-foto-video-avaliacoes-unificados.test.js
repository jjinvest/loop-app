'use strict';
// Prova efetiva de A a Z: painel cadastra foto/video/PDF, mesma vitrine
// mostra as midias, comprador baixa PDF so apos GET PSP, e cliente de
// fisico entregue envia nota/fotos/video para moderacao. Sem pagamentos reais.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {criarMaterialPDFTeste}=require('../src/domain/material-pdf-teste');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='admin-produto-midias-'+('P'.repeat(48));
const TOKEN='token-webhook-midias-'+('Z'.repeat(48));
const SENHA='SenhaProdutoPdfFicticio2026';
const ROOT='/staging/escritorio-unificado';
function jpeg(){
 const exif=Buffer.from('Exif GPS_SEGREDO_DO_COMPRADOR');
 const app=Buffer.alloc(4);app[0]=255;app[1]=225;app.writeUInt16BE(exif.length+2,2);
 return Buffer.concat([Buffer.from([255,216]),app,exif,
  Buffer.from([255,192,0,11,8,0,2,0,2,1,1,17,0]),
  Buffer.from([255,218,0,8,1,1,0,0,63,0]),Buffer.alloc(200,0x71),
  Buffer.from([255,217])]);
}
function box(tipo,dados){
 const h=Buffer.alloc(8);h.writeUInt32BE(dados.length+8,0);h.write(tipo,4);
 return Buffer.concat([h,dados]);
}
function video(duracao){
 const mdia=Buffer.alloc(12);mdia.write('vide',8);
 const tempo=Buffer.alloc(20);tempo.writeUInt32BE(1000,12);
 tempo.writeUInt32BE(duracao*1000,16);
 return Buffer.concat([box('ftyp',Buffer.from('isom0000iso2')),
  box('moov',Buffer.concat([
   box('mvhd',tempo),box('trak',box('mdia',box('hdlr',mdia)))
  ])),box('mdat',Buffer.alloc(2048,0x6b))]);
}
const produto=(id,tipo)=>({
 id,nome:'Curso ou produto '+id,tipo,estado:'PUBLICADO',
 descricao:'Produto de ensaio com arquivos enviados pelo operador.',
 precoCentavos:25000,
 entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
 fotos:[],detalhes:[],videoApresentacaoUrl:null
});
test('produto completo com foto PDF e video 30s; download e reviews isolados por compra',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let posts=0,gets=0;const pagamentos=new Map(),porPedido=new Map();
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({pedidoId,clienteAsaasId,valorCentavos}){
   const id='pay_produto_'+String(++posts).padStart(4,'0');
   const info={pedidoId,pagamentoId:id,clienteAsaasId,valorCentavos};
   porPedido.set(pedidoId,info);pagamentos.set(id,info);
   return {ambiente:this.ambiente,pagamentoId:id,valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(id){
   gets++;const x=pagamentos.get(id);assert.ok(x);
   return {pagamentoId:id,status:'RECEIVED',valorCentavos:x.valorCentavos,
    billingType:'PIX',clienteAsaasId:x.clienteAsaasId,
    externalReference:'LOOPLAB-'+x.pedidoId};
  }
 };
 const ctx=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,segredoOperador:ADMIN,
  termosVersao:'LAB-produto-integral-2026',
  termosTexto:'Simulacao de itens, entrega e arquivos, sem dinheiro de verdade ou despacho comercial.'
 });
 const srv=ctx.app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(async()=>{await new Promise(resolve=>srv.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 async function call(rota,{method='GET',body,cookie,csrf,admin=false,key,bin,mime,extra={}}={}){
  const response=await fetch(base+rota,{method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(bin?{'Content-Type':mime}:{}),
   ...extra
  },...(body?{body:JSON.stringify(body)}:bin?{body:bin}:{})});
  const type=response.headers.get('content-type')||'';
  return {status:response.status,
   data:type.includes('json')?await response.json():await response.arrayBuffer(),
   setCookie:response.headers.get('set-cookie'),
   headers:response.headers};
 }
 const cad=async nick=>{
  const c=await call('/staging/contas/cadastrar',{method:'POST',body:{
   nome:nick+' Cliente',nick,email:nick+'@example.invalid',
   senha:SENHA,aceiteExplicito:true
  }});
  assert.equal(c.status,201,JSON.stringify(c.data));
  const l=await call('/staging/contas/entrar',{method:'POST',
   body:{nick,senha:SENHA}});
  assert.equal(l.status,200);
  return {titularId:c.data.titularId,
   cookie:l.setCookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],
   csrf:l.data.csrf};
 };
 const a=await cad('Tita'),b=await cad('Mila');
 const prefix=ROOT+'/produtos';
 for(const [id,tipo] of [['curso-arquivo-real-lab','PDF'],
  ['produto-fisico-foto-lab','FISICO']]){
  const r=await call(prefix,{admin:true,method:'POST',
   key:'produto-real-'+id,body:{produto:produto(id,tipo)}});
  assert.equal(r.status,201,JSON.stringify(r.data));
 }
 const pdfid='curso-arquivo-real-lab',fisico='produto-fisico-foto-lab';
 const pdf=criarMaterialPDFTeste();
 assert.equal((await call(prefix+'/'+pdfid+'/pdf',{
  method:'POST',admin:false,bin:pdf,mime:'application/pdf',
  extra:{'X-PDF-Versao-Esperada':'0'}
 })).status,401);
 const semArquivo=await call('/staging/vitrine/loja/pedidos',{
  method:'POST',cookie:a.cookie,csrf:a.csrf,
  key:'produto-pdf-sem-arquivo-0001',
  extra:{'X-LOOP-LAB':'participante'},
  body:{itens:[{produtoId:pdfid,quantidade:1}]}
 });
 assert.equal(semArquivo.status,400,JSON.stringify(semArquivo.data));
 assert.equal(semArquivo.data.erro,'PDF_PRODUTO_SEM_ARQUIVO');
 const primeiro=await call(prefix+'/'+pdfid+'/pdf',{
  method:'POST',admin:true,bin:pdf,mime:'application/pdf',
  extra:{'X-PDF-Versao-Esperada':'0'}
 });
 assert.equal(primeiro.status,201,JSON.stringify(primeiro.data));
 assert.equal(primeiro.data.versao,1);
 const foto=jpeg(),mp4=video(30);
 assert.equal((await call(prefix+'/'+fisico+'/fotos/1',{
  method:'POST',admin:false,bin:foto,mime:'image/jpeg',
  extra:{'X-Foto-Versao-Esperada':'0'}
 })).status,401);
 const upFoto=await call(prefix+'/'+fisico+'/fotos/1',{
  method:'POST',admin:true,bin:foto,mime:'image/jpeg',
  extra:{'X-Foto-Versao-Esperada':'0'}
 });
 assert.equal(upFoto.status,201,JSON.stringify(upFoto.data));
 const long=await call(prefix+'/'+fisico+'/video',{
  method:'POST',admin:true,bin:video(31),mime:'video/mp4',
  extra:{'X-Video-Versao-Esperada':'0'}
 });
 assert.equal(long.status,400,JSON.stringify(long.data));
 const upVideo=await call(prefix+'/'+fisico+'/video',{
  method:'POST',admin:true,bin:mp4,mime:'video/mp4',
  extra:{'X-Video-Versao-Esperada':'0'}
 });
 assert.equal(upVideo.status,201,JSON.stringify(upVideo.data));
 assert.equal(upVideo.data.duracaoMs,30000);
 const lista=await call('/staging/vitrine/loja/catalogo',{cookie:a.cookie});
 assert.equal(lista.status,200);
 const produtoFisico=lista.data.produtos.find(x=>x.produtoId===fisico);
 assert.equal(produtoFisico.videoApresentacaoLocal,true);
 assert.ok(produtoFisico.fotos.some(x=>x.includes('/foto/1')));
 const fotoUrl=produtoFisico.fotos[0];
 // Foto de produto PUBLICADO e vitrine publica, nao dado da conta.
 // Antes o teste exigia 401 por engano; isso quebraria as fotos para visitantes.
 const visitante=await call(fotoUrl);
 assert.equal(visitante.status,200,'foto publicada acessivel sem login');
 assert.match(visitante.headers.get('content-type')||'',/^image\/jpeg/);
 assert.equal(visitante.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.equal(visitante.headers.get('cache-control'),'private, no-store');
 assert.equal(Buffer.from(visitante.data).includes(Buffer.from('GPS_SEGREDO')),false,
  'metadados EXIF/GPS nunca chegam ao visitante');
 const visual=await call(fotoUrl,{cookie:a.cookie});
 assert.equal(visual.status,200);
 assert.deepEqual(Buffer.from(visual.data),Buffer.from(visitante.data),
  'visitante e titular recebem a mesma foto higienizada');
 const fotoInexistente=await call(
  '/staging/vitrine/loja/produtos/produto-inexistente/foto/1');
 assert.equal(fotoInexistente.status,404,
  'foto de produto não publicado não pode ser exibida');
 const posicaoInvalida=await call(
  '/staging/vitrine/loja/produtos/'+fisico+'/foto/99');
 assert.equal(posicaoInvalida.status,404);
 const vidUrl='/staging/vitrine/loja/produtos/'+fisico+'/video';
 const faixa=await call(vidUrl,{extra:{Range:'bytes=0-99'}});
 assert.equal(faixa.status,206,
  'video de demonstracao publicado pode ser visualizado sem login');
 assert.match(faixa.headers.get('content-type')||'',/^video\/mp4/);
 assert.equal(faixa.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.equal(Buffer.from(faixa.data).length,100);
 const faixaInvalida=await call(vidUrl,{extra:{Range:'bytes=999999999-'}});
 assert.equal(faixaInvalida.status,416,'limite da faixa de vídeo validado');
 const endereco={destinatario:'Pessoa destinatária fictícia',cep:'27260000',
  logradouro:'Rua Exemplo',numero:'12',complemento:'',
  bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',
  telefone:'21999999999',referencia:''};
 assert.equal((await call('/staging/vitrine/loja/entrega',{
  method:'POST',cookie:a.cookie,csrf:a.csrf,extra:{'X-LOOP-LAB':'participante'},
  body:endereco
 })).status,200);
 async function compra(produtoId,key){
  const r=await call('/staging/vitrine/loja/pedidos',{
   method:'POST',cookie:a.cookie,csrf:a.csrf,extra:{'X-LOOP-LAB':'participante'},
   key,body:{itens:[{produtoId,quantidade:1}]}
  });
  assert.equal(r.status,201,JSON.stringify(r.data));
  return r.data.pedido.pedidoId;
 }
 async function pagar(id,indice){
  const clienteAsaasId='cus_ProdutoMock_'+indice;
  ctx.ponte.preparar({titularId:a.titularId,prepedidoId:id,clienteAsaasId});
  await ctx.ponte.enviarUmaVez({titularId:a.titularId,prepedidoId:id,
   provedor,execucaoLiberada:true});
  const pagamentoId=porPedido.get(id).pagamentoId,eventoId='evt_ProdutoMock_'+indice;
  const aviso=await call('/staging/asaas/webhook-unificado',{
   method:'POST',bin:Buffer.from(JSON.stringify({
    id:eventoId,event:'PAYMENT_RECEIVED',payment:{
     id:pagamentoId,value:250,billingType:'PIX',
     externalReference:'LOOPLAB-'+id
    }
   })),mime:'application/json',
   extra:{'asaas-access-token':TOKEN}
  });
  assert.equal(aviso.status,200,JSON.stringify(aviso.data));
  const confirm=await call(ROOT+'/reconsultar-psp',{
   method:'POST',admin:true,body:{eventoId}
  });
  assert.equal(confirm.status,200,JSON.stringify(confirm.data));
  assert.equal(confirm.data.estado,'CONCLUIDO');
 }
 const pedidoPdf=await compra(pdfid,'pedido-pdf-completo-0001');
 const bloqueado=await call('/staging/meus-pedidos/'+pedidoPdf+'/pdf/'+pdfid,
  {cookie:a.cookie});
 assert.equal(bloqueado.status,403);
 await pagar(pedidoPdf,1);
 const meus=await call('/staging/meus-pedidos',{cookie:a.cookie});
 assert.equal(meus.status,200);
 assert.ok(meus.data.pedidos.find(x=>x.prepedidoId===pedidoPdf)
  .pdfProdutosDisponiveis.includes(pdfid));
 const url='/staging/meus-pedidos/'+pedidoPdf+'/pdf/'+pdfid;
 assert.equal((await call(url,{cookie:b.cookie})).status,404);
 const dl=await call(url,{cookie:a.cookie});
 assert.equal(dl.status,200);
 assert.deepEqual(Buffer.from(dl.data),pdf);
 const repetido=await call(prefix+'/'+pdfid+'/pdf',{
  method:'POST',admin:true,bin:pdf,mime:'application/pdf',
  extra:{'X-PDF-Versao-Esperada':'1'}
 });
 assert.equal(repetido.status,200);
 assert.equal(repetido.data.repetido,true);
 const novo=Buffer.concat([pdf.subarray(0,-6),Buffer.from('\n%%EOF\n')]);
 const versao2=await call(prefix+'/'+pdfid+'/pdf',{
  method:'POST',admin:true,bin:novo,mime:'application/pdf',
  extra:{'X-PDF-Versao-Esperada':'1'}
 });
 assert.equal(versao2.status,201,JSON.stringify(versao2.data));
 assert.equal(versao2.data.versao,2);
 assert.deepEqual(Buffer.from((await call(url,{cookie:a.cookie})).data),pdf,
  'o pedido antigo conserva versão um do curso');
 const pedidoFisico=await compra(fisico,'pedido-fisico-completo-0002');
 const avalBody={pedidoId:pedidoFisico,produtoId:fisico,nota:5,
  comentario:'Recebi este produto fictício e gostei da apresentação.'};
 const endpoint='/staging/vitrine/loja/avaliacoes';
 const tentarAvaliacao=async titular=>call(endpoint,{
  method:'POST',cookie:titular.cookie,csrf:titular.csrf,
  extra:{'X-LOOP-LAB':'participante'},body:avalBody
 });
 assert.equal((await tentarAvaliacao(a)).status,409);
 assert.equal((await call(ROOT+'/avaliacoes/entregas',{
  method:'POST',admin:true,body:{prepedidoId:pedidoFisico}
 })).status,409);
 await pagar(pedidoFisico,2);
 assert.equal((await call(ROOT+'/avaliacoes/entregas',{
  method:'POST',admin:true,body:{prepedidoId:pedidoFisico}
 })).status,200);
 assert.equal((await tentarAvaliacao(b)).status,409);
 assert.equal((await tentarAvaliacao(a)).status,201);
 const pend=await call(endpoint+'/pendentes',{cookie:a.cookie});
 assert.equal(pend.status,200);
 assert.equal(pend.data.itens.length,1);
 assert.equal(pend.data.itens[0].statusAvaliacao,'PENDENTE');
 async function anexo(titular,tipo,mime,bytes){
  return call(endpoint+'/'+pedidoFisico+'/'+fisico+'/midias',{
   method:'POST',cookie:titular.cookie,csrf:titular.csrf,
   bin:bytes,mime,extra:{'X-LOOP-LAB':'participante',
    'X-AKITEMM-MIDIA-TIPO':tipo}
  });
 }
 assert.equal((await anexo(b,'FOTO','image/jpeg',foto)).status,409);
 const anexFoto=await anexo(a,'FOTO','image/jpeg',foto);
 assert.equal(anexFoto.status,201,JSON.stringify(anexFoto.data));
 const anexVideo=await anexo(a,'VIDEO','video/mp4',mp4);
 assert.equal(anexVideo.status,201,JSON.stringify(anexVideo.data));
 const midia=endpoint+'/midias/'+anexFoto.data.id;
 assert.equal((await call(midia,{cookie:b.cookie})).status,404);
 assert.equal((await call(midia,{cookie:a.cookie})).status,200);
 const resAntes=await call(endpoint+'/'+fisico,{cookie:b.cookie});
 assert.equal(resAntes.data.avaliacoes.length,0);
 const adminPend=await call(ROOT+'/avaliacoes',{admin:true});
 assert.equal(adminPend.status,200);
 assert.equal(adminPend.data.pendentes.length,1);
 assert.equal(adminPend.data.pendentes[0].midias.length,2);
 const aprovar=await call(ROOT+'/avaliacoes/'+adminPend.data.pendentes[0].id+'/moderar',{
  method:'POST',admin:true,body:{status:'APROVADA'}
 });
 assert.equal(aprovar.status,200);
 const publicas=await call(endpoint+'/'+fisico,{cookie:b.cookie});
 assert.equal(publicas.status,200);
 assert.equal(publicas.data.avaliacoes.length,1);
 assert.equal(publicas.data.avaliacoes[0].midias.length,2);
 assert.equal((await call(midia,{cookie:b.cookie})).status,200);
 assert.equal((await anexo(a,'FOTO','image/jpeg',foto)).status,409);
 // Produto fisico ROXO da mesma loja: 5 tenis em UM pedido = UMA posicao.
 const configuracao=await call(ROOT+'/sinalizacao/'+fisico,{
  method:'PATCH',admin:true,body:{
   classificacao:'ROXO',quantidadeMinimaLoop:1,revisaoEsperada:0,
   modoRoxo:'POR_PEDIDO',quantidadeMinimaRoxo:5,posicoesPorPedidoRoxo:1
  }
 });
 assert.equal(configuracao.status,200,JSON.stringify(configuracao.data));
 assert.equal(configuracao.data.modoRoxo,'POR_PEDIDO');
 const produtoLoja=(await call('/staging/vitrine/loja/catalogo',{cookie:a.cookie}))
  .data.produtos.find(p=>p.produtoId===fisico);
 assert.equal(produtoLoja.quantidadeMinimaRoxo,5);
 assert.equal(produtoLoja.modoRoxo,'POR_PEDIDO');
 const novoPedidoTenis=(n,key)=>call('/staging/vitrine/loja/pedidos',{
  method:'POST',cookie:a.cookie,csrf:a.csrf,
  extra:{'X-LOOP-LAB':'participante'},key,
  body:{itens:[{produtoId:fisico,quantidade:n}]}
 });
 const quatro=await novoPedidoTenis(4,'roxo-fisico-4-tenis-0001');
 const cinco=await novoPedidoTenis(5,'roxo-fisico-5-tenis-0001');
 const dez=await novoPedidoTenis(10,'roxo-fisico-10-tenis-0001');
 for(const x of [quatro,cinco,dez])assert.equal(x.status,201,JSON.stringify(x.data));
 const fotografia=id=>ctx.sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:id});
 const id4=quatro.data.pedido.pedidoId,id5=cinco.data.pedido.pedidoId,
  id10=dez.data.pedido.pedidoId;
 assert.equal(fotografia(id4).planejamentoPosicoes.quantidadePosicoesPrevistas,0);
 assert.equal(fotografia(id5).planejamentoPosicoes.quantidadePosicoesPrevistas,1);
 assert.equal(fotografia(id10).planejamentoPosicoes.quantidadePosicoesPrevistas,1);
 const vinculo=await call(ROOT+'/motor/vincular-pedido',{
  method:'POST',admin:true,body:{prepedidoId:id5,aceiteEnsaio:true}
 });
 assert.equal(vinculo.status,201,JSON.stringify(vinculo.data));
 assert.equal(vinculo.data.quantidadePosicoes,1);
 const replay=await call(ROOT+'/motor/vincular-pedido',{
  method:'POST',admin:true,body:{prepedidoId:id5,aceiteEnsaio:true}
 });
 assert.equal(replay.status,200);
 assert.deepEqual(replay.data.posicoesIds,vinculo.data.posicoesIds);
 const novaRegra=await call(ROOT+'/sinalizacao/'+fisico,{
  method:'PATCH',admin:true,body:{classificacao:'ROXO',
   quantidadeMinimaLoop:1,revisaoEsperada:1,posicoesPorUnidadeRoxo:3}
 });
 assert.equal(novaRegra.status,200,JSON.stringify(novaRegra.data));
 assert.equal(novaRegra.data.modoRoxo,'POR_UNIDADE');
 assert.equal(fotografia(id5).planejamentoPosicoes.quantidadePosicoesPrevistas,1);
 assert.equal(fotografia(id10).planejamentoPosicoes.quantidadePosicoesPrevistas,1);
  assert.equal(posts,2);assert.equal(gets,2);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});