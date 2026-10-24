'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AkitemmConfigLojaDemoSQLite}=require('../src/domain/akitemm-config-loja-demo-sqlite');

test('AKITEMM só publica banners e redes autorizados pelo administrador, persistidos no SQLite',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const admin=new AkitemmConfigLojaDemoSQLite({banco:db});
  assert.deepEqual(admin.consultar().banners,[]);
  assert.equal(admin.consultar().redes.whatsapp,'');
  const cfg=admin.consultar();
  cfg.banners=[{titulo:'Curso publicado',descricao:'Confira os detalhes na loja',
    imagemCaminho:'/imagens/catalogo/curso01.webp',produtoId:'curso-teste-01'}];
  cfg.ofertas=['curso-teste-01'];
  cfg.redes.instagram='https://www.instagram.com/akitemm';
  cfg.informacoes.contato='Canal autorizado, a ser configurado pela operação.';
  admin.salvar(cfg);
  const retomada=new AkitemmConfigLojaDemoSQLite({banco:db});
  assert.deepEqual(retomada.consultar(),cfg);
  assert.throws(()=>admin.salvar({...cfg,redes:{...cfg.redes,instagram:'javascript:alert(1)'}}),
   /REDE_SOCIAL_INVALIDA/);
  assert.throws(()=>admin.salvar({...cfg,banners:[{...cfg.banners[0],imagemCaminho:'https://outro.exemplo/inseguro.png'}]}),
   /BANNER_INVALIDO/);
  assert.deepEqual(retomada.consultar(),cfg,'Erro não apaga publicação anterior');
 }finally{db.close();}
});
test('loja AKITEMM independente do LOOP e dados de entrega não incluem informações fictícias padrão',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../src/laboratorio/loja-cliente-demo.html'),'utf8');
 assert.match(html,/class="akitemm-voltar"/);
 assert.match(html,/href="\/escritorio"/);
 assert.doesNotMatch(html,/class="loop03-sidebar"/);
 for(const id of ['akitemmBusca','akitemmFormEntrega','akitemmBannerConteudo',
  'akitemmModalDetalhes','registrarPedidoLoja','akitemmFotoTitular','akitemmNomeTitular']){
  assert.ok(html.includes('id="'+id+'"'),id+' está funcional no layout');
 }
 assert.match(html,/name="logradouro"/);
 assert.match(html,/name="bairro"/);
 assert.match(html,/name="cep"/);
 assert.match(html,/name="numero"/);
 assert.match(html,/name="uf"/);
 assert.match(html,/name="cidade"/);
});
