'use strict';
// PDF real no mesmo volume persistente do catálogo; nenhuma compra habilitada.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {criarMaterialPDFTeste}=require('../src/domain/material-pdf-teste');
const {criarCatalogoMercadoriasReal,tokenCatalogo}=
 require('../src/producao/catalogo-mercadorias-real');
const token='d'.repeat(64),chave=tokenCatalogo(token);
const CURSO={id:'curso-pdf-proprietario',nome:'Curso digital da AKITEMM',
 tipo:'PDF',estado:'RASCUNHO',descricao:'Material digital do proprietário',
 precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
 fotos:[],detalhes:['Material em PDF'],videoApresentacaoUrl:null};

test('PDF real: upload autenticado, 2 versoes, bloqueio de publicacao e persistencia apos reinicio',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-curso-real-'));
 const arquivo=path.join(dir,'catalogo-produtos.sqlite');
 let ctx,srv,base;
 async function iniciar(){
  ctx=criarCatalogoMercadoriasReal({arquivo,tokenRaiz:token});
  srv=http.createServer((req,res)=>void ctx.atender(req,res));
  srv.listen(0,'127.0.0.1');await once(srv,'listening');
  base='http://127.0.0.1:'+srv.address().port+'/internal/catalogo';
 }
 async function fechar(){await new Promise(r=>srv.close(r));ctx.fechar();}
 t.after(async()=>{
  if(srv?.listening)await fechar();
  fs.rmSync(dir,{recursive:true,force:true});
 });
 async function call(rota,{method='GET',body,mime,versao,auth=true}={}){
  const r=await fetch(base+rota,{method,headers:{
   'x-loop-catalogo-token':auth?chave:'0'.repeat(64),
   ...(mime?{'content-type':mime,'x-pdf-versao-esperada':String(versao)}:
    body?{'content-type':'application/json'}:{})
  },body:mime?body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
 }
 await iniciar();
 const original=criarMaterialPDFTeste();
 assert.ok(Buffer.isBuffer(original));
 assert.equal((await call('/produtos',{method:'POST',body:{produto:CURSO}})).status,201);
 const semPdf=await call('/produtos/'+CURSO.id,{method:'PATCH',body:{
  revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}
 }});
 assert.equal(semPdf.status,409);
 assert.equal(semPdf.data.erro,'PUBLICACAO_EXIGE_PDF');
 assert.equal((await call('/produtos/'+CURSO.id+'/pdf',{method:'POST',
  mime:'application/pdf',versao:0,body:original,auth:false})).status,401);
 assert.equal((await call('/produtos/'+CURSO.id+'/pdf',{method:'POST',
  mime:'application/pdf',versao:0,body:Buffer.from('isto nao e pdf')})).status,400);
 const v1=await call('/produtos/'+CURSO.id+'/pdf',{method:'POST',
  mime:'application/pdf',versao:0,body:original});
 assert.equal(v1.status,201,JSON.stringify(v1.data));
 assert.equal(v1.data.versao,1);
 assert.equal(v1.data.bytes,original.length);
 assert.equal(v1.data.downloadPublico,false);
 assert.equal(v1.data.checkoutReal,false);
 assert.equal((await call('/produtos/'+CURSO.id+'/pdf',{method:'POST',
  mime:'application/pdf',versao:0,body:original})).status,409);
 const publicado=await call('/produtos/'+CURSO.id,{method:'PATCH',
  body:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}});
 assert.equal(publicado.status,200,JSON.stringify(publicado.data));
 assert.equal((await call('/vitrine')).data.produtos[0].tipo,'PDF');
 assert.equal((await call('/vitrine')).data.checkoutReal,false);
 assert.ok(!JSON.stringify((await call('/vitrine')).data).includes('%PDF-'));
 const v2Bytes=Buffer.concat([
  original.subarray(0,original.lastIndexOf(Buffer.from('%%EOF'))),
  Buffer.from('% nova edicao\n%%EOF\n')
 ]);
 const v2=await call('/produtos/'+CURSO.id+'/pdf',{method:'POST',
  mime:'application/pdf',versao:1,body:v2Bytes});
 assert.equal(v2.status,201,JSON.stringify(v2.data));
 assert.equal(v2.data.versao,2);
 assert.deepEqual(ctx.pdf.abrirVersao({produtoId:CURSO.id,versao:1}),original);
 assert.deepEqual(ctx.pdf.abrirVersao({produtoId:CURSO.id,versao:2}),v2Bytes);
 await fechar();await iniciar();
 assert.equal((await call('/status')).data.cursosPdfArmazenados,1);
 assert.equal((await call('/produtos/'+CURSO.id+'/pdf')).data.versao,2);
 assert.deepEqual(ctx.pdf.abrirVersao({produtoId:CURSO.id,versao:1}),original);
 assert.equal((await call('/vitrine')).data.produtos.length,1);
 assert.equal(ctx.repo.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(ctx.repo.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
