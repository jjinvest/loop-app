'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {criarCatalogoMercadoriasReal}=
 require('../src/producao/catalogo-mercadorias-real');
const {renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const ORIGEM='https://contas.example.invalid';
const DOC='Termos de uso de conta unica LOOP AKITEMM com finalidade identificada '+
 'e restricao a recursos financeiros externos ate a homologacao oficial.';
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');

function boxVideo(tipo,dados){
 const h=Buffer.alloc(8);h.writeUInt32BE(dados.length+8);h.write(tipo,4);
 return Buffer.concat([h,dados]);
}
function videoReal(segundos){
 const mdia=Buffer.alloc(12);mdia.write('vide',8);
 const tempo=Buffer.alloc(20);tempo.writeUInt32BE(1000,12);tempo.writeUInt32BE(segundos*1000,16);
 return Buffer.concat([boxVideo('ftyp',Buffer.from('isom0000iso2')),boxVideo('moov',Buffer.concat([
  boxVideo('mvhd',tempo),boxVideo('trak',boxVideo('mdia',boxVideo('hdlr',mdia)))
 ])),boxVideo('mdat',Buffer.alloc(2048,0x6b))]);
}
test('entrada real exibe mercadoria publicada do acervo de fotos pelo mesmo login e nao habilita venda',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-vitrine-unica-'));
 const banco=new DatabaseSync(':memory:');
 let midia=criarCatalogoMercadoriasReal({
  arquivo:path.join(pasta,'catalogo.sqlite'),tokenRaiz:'a'.repeat(64)
 });
 t.after(()=>{
  try{midia.fechar()}catch{}
  banco.close();fs.rmSync(pasta,{recursive:true,force:true});
 });
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-ATUAL',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-ATUAL',texto:DOC},
  enviarEmail:async()=>true
 });
 const produto={
  id:'camiseta-preta',nome:'Camiseta Preta AKITEMM',
  tipo:'FISICO',estado:'RASCUNHO',descricao:'Produto real em preparação',
  precoCentavos:25000,entrega:'ESTOQUE_PROPRIO',
  fotos:[],detalhes:['Tamanho G'],videoApresentacaoUrl:null
 };
 midia.repo.salvar({produto,revisaoEsperada:0});
 await midia.fotos.salvar({produtoId:produto.id,posicao:1,bytes:PNG,
  mime:'image/png',revisaoEsperada:0});
 const mp4=videoReal(12);
 await midia.fotos.salvar({produtoId:produto.id,posicao:2,bytes:PNG,mime:'image/png',revisaoEsperada:0});
 await assert.rejects(midia.video.salvar({produtoId:produto.id,bytes:videoReal(31),revisaoEsperada:0}),/VIDEO_ACIMA_30_SEGUNDOS/);
 await midia.video.salvar({produtoId:produto.id,bytes:mp4,revisaoEsperada:0});
 assert.throws(()=>midia.abrirVideoPublicado({produtoId:produto.id}),/VIDEO_NAO_PUBLICADO/);
 midia.repo.atualizar({id:produto.id,revisaoEsperada:1,
  alteracoes:{estado:'PUBLICADO'}});
 assert.equal(midia.listarVitrinePreparacao({limite:100}).length,1);
 assert.equal(midia.listarVitrinePreparacao({limite:100})[0].compravel,false);
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false,
  catalogoMidiaLeitura:{
   banco:midia.repo.banco,
   listarVitrinePreparacao:opts=>midia.listarVitrinePreparacao(opts),
   listarFotosProdutoCompartilhado:opts=>
    midia.listarFotosProdutoCompartilhado(opts),
   abrirFotoPublicada:opts=>midia.abrirFotoPublicada(opts),
   listarVideoProdutoCompartilhado:opts=>midia.listarVideoProdutoCompartilhado(opts),
   abrirVideoPublicado:opts=>midia.abrirVideoPublicado(opts)
  }
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(ok=>server.close(ok)));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(p,headers={})=>fetch(base+p,{headers});
 // Loja e catalogo sao publicos; pedidos e identidade seguem privados.
 const catalogoPublico=await get('/api/loja/catalogo');
 assert.equal(catalogoPublico.status,200);
 assert.equal((await catalogoPublico.json()).checkoutReal,false);
 assert.equal((await get('/loja')).status,200);
 assert.equal((await get('/api/contas/me')).status,401);
 assert.equal((await get('/api/loja/pedidos')).status,401);
 assert.equal(await (await get('/escritorio')).status,200);
 const documentos=contas.documentos();
 await contas.cadastrar({
  nome:'Ana de Exemplo',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaDeEnsaioMuitoSegura2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
  versaoPrivacidade:documentos.privacidade.versao,
  hashPrivacidade:documentos.privacidade.hash
 });
 const entrar=await fetch(base+'/api/contas/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Ana',senha:'SenhaDeEnsaioMuitoSegura2026!'})
 });
 assert.equal(entrar.status,200);
 const cookie=entrar.headers.get('set-cookie').split(';')[0];
 const params={Cookie:cookie};
 const loja=await get('/loja',params);
 assert.equal(loja.status,200);
 assert.equal(await loja.text(),renderizarLojaAprovada(),
  'o contrato visual da loja nao foi alterado');
 const res=await get('/api/loja/catalogo',params);
 assert.equal(res.status,200);
 const d=await res.json();
 assert.equal(d.produtos.length,1);
 assert.equal(d.produtos[0].produtoId,'camiseta-preta');
 assert.equal(d.produtos[0].titulo,'Camiseta Preta AKITEMM');
 assert.equal(d.produtos[0].precoCentavos,null);
 assert.equal(d.produtos[0].cor,'CINZA');
 assert.equal(d.produtos[0].checkoutReal,false);
 assert.equal(d.checkoutReal,false);
 assert.equal(d.produtos[0].unidadesConfirmadas,0);
 assert.equal(d.produtos[0].compravel,false);
 assert.equal(d.produtos[0].fotos.length,2);
 const urlVideo='/api/loja/produtos/camiseta-preta/video';
 assert.equal(d.produtos[0].videoUrl,urlVideo);
 const v=await get(urlVideo);assert.equal(v.status,200);assert.deepEqual(Buffer.from(await v.arrayBuffer()),mp4);
 const faixa=await get(urlVideo,{Range:'bytes=0-99'});assert.equal(faixa.status,206);assert.deepEqual(Buffer.from(await faixa.arrayBuffer()),mp4.subarray(0,100));
 assert.equal((await get('/api/loja/produtos/nao-existe/video')).status,404);
 assert.equal(d.produtos[0].fotos[0].url,
  '/api/loja/produtos/camiseta-preta/foto/1');
 assert.equal((await get(d.produtos[0].fotos[0].url)).status,200,
  'foto publicada e publica; rascunhos administrativos seguem protegidos');
 const imagem=await get(d.produtos[0].fotos[0].url,params);
 assert.equal(imagem.status,200);
 assert.match(imagem.headers.get('content-type'),/^image\/png/);
 assert.ok((await imagem.arrayBuffer()).byteLength>60);
 assert.equal((await get('/api/loja/produtos/camiseta-preta/foto/11',params)).status,404);
 assert.equal(JSON.stringify(d).includes('STAGING'),false);
 assert.equal((await get('/api/loja/estado',params)).status,200);
 assert.equal((await get('/api/loja/pedidos',params)).status,503);
 assert.equal((await get('/api/checkout/finalizar',params)).status,503);
 assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
 assert.equal(midia.repo.banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
