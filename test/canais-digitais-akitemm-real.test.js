'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {criarCatalogoMercadoriasReal,tokenCatalogo}=
 require('../src/producao/catalogo-mercadorias-real');
const {criarMaterialPDFTeste}=require('../src/domain/material-pdf-teste');
const {gerarPngTeste}=require('../scripts/fixtures/gerar-png-teste');
const raiz='e'.repeat(64),token=tokenCatalogo(raiz);
function produto(id,tipo,entrega){
 return {id,nome:'Material digital '+id,tipo,entrega,
  estado:'RASCUNHO',descricao:'Material digital cadastrado pelo operador',
  precoCentavos:25000,fotos:[],videoApresentacaoUrl:null,
  detalhes:['Acesso depende de confirmação externa autorizada']};
}
test('canais reais: PDF, curso próprio e afiliado, capas privadas e nenhuma venda liberada',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-digitais-'));
 const arquivo=path.join(pasta,'catalogo-produtos.sqlite');
 let ctx,servidor,base;
 async function iniciar(){
  ctx=criarCatalogoMercadoriasReal({arquivo,tokenRaiz:raiz});
  servidor=http.createServer((req,res)=>void ctx.atender(req,res));
  servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
  base='http://127.0.0.1:'+servidor.address().port+'/internal/catalogo';
 }
 async function fechar(){await new Promise(ok=>servidor.close(ok));ctx.fechar();}
 t.after(async()=>{if(servidor?.listening)await fechar();
  fs.rmSync(pasta,{recursive:true,force:true});});
 async function pedir(rota,{method='GET',body,mime,versao,auth=true}={}){
  const headers={'x-loop-catalogo-token':auth?token:'0'.repeat(64)};
  if(mime){
   headers['content-type']=mime;
   headers[mime==='application/pdf'?'x-pdf-versao-esperada':
    'x-foto-versao-esperada']=String(versao);
  }else if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(base+rota,{method,headers,body:mime?body:
   body!==undefined?JSON.stringify(body):undefined});
  const json=await res.json();
  return {status:res.status,data:json};
 }
 await iniciar();
 const pdf=produto('material-pdf','PDF','DOWNLOAD_APOS_CONFIRMACAO');
 const curso=produto('aulas-online','CURSO','ACESSO_CURSO_HOSPEDADO');
 const afiliado=produto('curso-parceiro','AFILIADO','COMPRA_PLATAFORMA_PARCEIRA');
 for(const item of [pdf,curso,afiliado]){
  assert.equal((await pedir('/produtos',{method:'POST',body:{produto:item}})).status,201);
 }
 const rota='/produtos/'+curso.id+'/canal-digital';
 const cursoConfig={modo:'HOTMART_CLUB',provedor:'HOTMART',
  referencia:'curso-do-operador',urlDestino:'https://hotmart.com/pt-br/club/curso'};
 assert.equal((await pedir(rota,{auth:false})).status,401);
 assert.equal((await pedir(rota)).data.configurado,false);
 assert.equal((await pedir(rota,{method:'PUT',auth:false,
  body:{config:cursoConfig,revisaoEsperada:0}})).status,401);
 for(const urlDestino of [
  'http://hotmart.com/curso','https://127.0.0.1/curso',
  'https://localhost/curso','https://hotmart.com/curso#token'
 ]){
  const resultado=await pedir(rota,{method:'PUT',
   body:{config:{...cursoConfig,urlDestino},revisaoEsperada:0}});
  assert.equal(resultado.status,400,urlDestino);
  assert.equal(resultado.data.erro,'DIGITAL_URL_INVALIDA');
 }
 const semCapa=await pedir('/produtos/'+curso.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(semCapa.status,409);
 assert.equal(semCapa.data.erro,'PUBLICACAO_EXIGE_CANAL_DIGITAL');
 const salvo=await pedir(rota,{method:'PUT',
  body:{config:cursoConfig,revisaoEsperada:0}});
 assert.equal(salvo.status,201,JSON.stringify(salvo.data));
 assert.equal(salvo.data.revisao,1);
 assert.equal(salvo.data.entregaAtiva,false);
 assert.equal(salvo.data.geraPosicaoLoop,false);
 assert.equal((await pedir(rota,{method:'PUT',
  body:{config:cursoConfig,revisaoEsperada:0}})).status,409);
 const semFoto=await pedir('/produtos/'+curso.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(semFoto.status,409);
 assert.equal(semFoto.data.erro,'PUBLICACAO_EXIGE_CAPA');
 const foto=gerarPngTeste();
 const env=await pedir('/produtos/'+curso.id+'/fotos/1',{
  method:'POST',body:foto,mime:'image/png',versao:0});
 assert.equal(env.status,201,JSON.stringify(env.data));
 const publicado=await pedir('/produtos/'+curso.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(publicado.status,200,JSON.stringify(publicado.data));
 const confAfiliado={modo:'HOTMART_AFILIADO',provedor:'HOTMART',
  referencia:'afiliacao-autorizada',urlDestino:'https://hotmart.com/pt-br?ap=abc'};
 assert.equal((await pedir('/produtos/'+afiliado.id+'/canal-digital',{
  method:'PUT',body:{config:confAfiliado,revisaoEsperada:0}})).status,201);
 const semCapaAfiliado=await pedir('/produtos/'+afiliado.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(semCapaAfiliado.status,409);
 assert.equal(semCapaAfiliado.data.erro,'PUBLICACAO_EXIGE_CAPA');
 assert.equal((await pedir('/produtos/'+afiliado.id+'/fotos/1',{
  method:'POST',body:foto,mime:'image/png',versao:0})).status,201);
 assert.equal((await pedir('/produtos/'+afiliado.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}})).status,200);
 const material=criarMaterialPDFTeste();
 assert.equal((await pedir('/produtos/'+pdf.id+'/pdf',{
  method:'POST',body:material,mime:'application/pdf',versao:0})).status,201);
 const pdfSemCapa=await pedir('/produtos/'+pdf.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(pdfSemCapa.status,409);
 assert.equal(pdfSemCapa.data.erro,'PUBLICACAO_EXIGE_CAPA');
 assert.equal((await pedir('/produtos/'+pdf.id+'/fotos/1',{
  method:'POST',body:foto,mime:'image/png',versao:0})).status,201);
 assert.equal((await pedir('/produtos/'+pdf.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}})).status,200);
 const pub=await pedir('/vitrine');
 assert.equal(pub.status,200);
 assert.equal(pub.data.checkoutReal,false);
 assert.equal(pub.data.pagamentosReais,false);
 assert.equal(pub.data.produtos.length,3);
 assert.ok(pub.data.produtos.some(p=>p.tipo==='CURSO'));
 assert.ok(pub.data.produtos.some(p=>p.tipo==='PDF'));
 assert.ok(!JSON.stringify(pub.data).includes('hotmart.com'));
 assert.ok(!JSON.stringify(pub.data).includes('afiliacao-autorizada'));
 const lista=ctx.listarVitrinePreparacao();
 assert.equal(lista.length,3);
 assert.ok(lista.every(p=>p.compravel===false&&p.checkoutReal===false));
 assert.ok(lista.some(p=>p.tipo==='CURSO'&&p.fotos[0].url===
  '/api/loja/produtos/aulas-online/foto/1'));
 assert.deepEqual(ctx.abrirFotoPublicada({
  produtoId:curso.id,posicao:1}).dados,foto);
 assert.equal(ctx.repo.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.throws(()=>ctx.repo.banco.exec(
  "DELETE FROM akitemm_canais_digitais_historico_real"),/DIGITAL_HISTORICO_IMUTAVEL/);
 await fechar();await iniciar();
 assert.equal((await pedir(rota)).data.revisao,1);
 assert.equal((await pedir(rota)).data.urlDestino,cursoConfig.urlDestino);
 assert.equal((await pedir('/status')).data.canaisDigitaisConfigurados,2);
 assert.equal((await pedir('/vitrine')).data.produtos.length,3);
});
