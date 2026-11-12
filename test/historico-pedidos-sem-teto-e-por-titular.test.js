'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes,createCipheriv}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {criarLeituraComercialSegura}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://contas.example.invalid';
const TEXTO='Termos e privacidade de ensaio da conta cliente do LOOP 3.0. '+
 'Este teste não cria dinheiro, compras reais, direitos financeiros nem '+
 'envia informações a prestadores externos. A verificação é isolada.';
function criptografar(chave,payload){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',chave,iv);
 c.setAAD(Buffer.from('AKITEMM-PEDIDO-REAL-V1'));
 const ct=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);
 return {iv:iv.toString('hex'),ct:ct.toString('hex'),
  tag:c.getAuthTag().toString('hex')};
}
test('histórico de 73 pedidos atravessa páginas sem vazamento entre titulares',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026-v1',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-v1',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const key=randomBytes(32);
 const pedidos=new PedidosComerciaisSQLite({
  banco,chavePedidos:key,consultarCotacaoConfiavel:async()=>null,
  consultarPagamentoPsp:async()=>null
 });
 const facade=criarLeituraComercialSegura({banco,pedidos});
 const documentos=contas.documentos();
 async function registrar(nome,nick,email){
  return contas.cadastrar({
   nome,nick,email,senha:'SenhaFicticia2026!',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:documentos.termos.versao,
   hashTermos:documentos.termos.hash,
   versaoPrivacidade:documentos.privacidade.versao,
   hashPrivacidade:documentos.privacidade.hash
  });
 }
 const alice=await registrar('Alice de Ensaio','Alice','alice@example.invalid');
 const bob=await registrar('Bob de Ensaio','Bob','bob@example.invalid');
 const add=banco.prepare([
  'INSERT INTO loja_real_pedidos(',
  'pedido_id,titular_id,fornecedor_id,cotacao_id,idempotencia_hmac,',
  'payload_iv,payload_ct,payload_tag,frete_centavos,valor_total_centavos,',
  'status,criado_em,atualizado_em)',
  "VALUES(?,?,?,?,?,?,?,?,?,?,'AGUARDANDO_PAGAMENTO',?,?)"
 ].join(' '));
 const payload={grupos:[{fornecedorId:'DIST_UNICO',
  itens:[{sku:'SKU_TESTE',precoUnitCentavos:25000,quantidade:1}],
  freteCentavos:0}]};
 function inserir(titular,grupo,n,i){
  const id='PEDIDO_'+grupo+'_'+String(i).padStart(4,'0');
  const c=criptografar(key,payload),ts=1700000000000+Math.floor(i/5);
  add.run(id,titular,'DIST_UNICO','COTACAO_'+grupo+'_'+i,
   'CHAVE_'+grupo+'_'+i,c.iv,c.ct,c.tag,0,25000,ts,ts);
 }
 for(let i=0;i<73;i++){
  inserir(alice.titularId,'A',73,i);
  if(i%6===0)inserir(bob.titularId,'B',13,i);
 }
 assert.equal(pedidos.contarDoTitular({titularId:alice.titularId}),73);
 assert.equal(pedidos.contarDoTitular({titularId:bob.titularId}),13);
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:true,
  pedidosComerciais:facade.leituraPedidos,
  remessasOutbox:facade.leituraRemessas
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 async function entrar(nick){
  const resposta=await fetch(base+'/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:'SenhaFicticia2026!'})
  });
  assert.equal(resposta.status,200);
  return resposta.headers.get('set-cookie').split(';')[0];
 }
 const cookieA=await entrar('Alice'),cookieB=await entrar('Bob');
 async function get(pagina,cookie){
  const r=await fetch(base+'/api/loja/pedidos?pagina='+pagina,{
   headers:{Cookie:cookie}
  });
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const json=await r.json();
  assert.equal(json.fonte,'PEDIDOS_COMERCIAIS_DO_TITULAR');
  assert.equal(json.checkoutRealHabilitadoPorEstaConsulta,false);
  return json;
 }
 const idA=[];
 for(let pagina=0;pagina<4;pagina++){
  const d=await get(pagina,cookieA);
  assert.equal(d.paginacao.pagina,pagina);
  assert.equal(d.paginacao.tamanho,20);
  assert.equal(d.paginacao.total,73);
  assert.equal(d.paginacao.haAnterior,pagina>0);
  assert.equal(d.paginacao.haMais,pagina<3);
  assert.equal(d.pedidos.length,pagina===3?13:20);
  for(const p of d.pedidos){
   assert.match(p.pedidoId,/^PEDIDO_A_/);
   assert.equal(p.valorTotalCentavos,25000);
   assert.equal(p.remessas.length,1);
   assert.equal(p.remessas[0].estado,'AGUARDANDO_SEPARACAO');
   idA.push(p.pedidoId);
  }
 }
 assert.equal(new Set(idA).size,73);
 const pessoaB=await get(0,cookieB);
 assert.equal(pessoaB.paginacao.total,13);
 assert.equal(pessoaB.pedidos.length,13);
 assert.equal(pessoaB.paginacao.haMais,false);
 assert.ok(pessoaB.pedidos.every(x=>x.pedidoId.startsWith('PEDIDO_B_')));
 const vazio=await get(4,cookieA);
 assert.equal(vazio.pedidos.length,0);
 assert.equal(vazio.paginacao.total,73);
 assert.equal(vazio.paginacao.haMais,false);
 for(const input of ['-1','01','1.5','1e9','999999999999999999999999999']){
  const r=await fetch(base+'/api/loja/pedidos?pagina='+input,{
   headers:{Cookie:cookieA}
  });
  assert.equal(r.status,400,input);
 }
 const semSessao=await fetch(base+'/api/loja/pedidos');
 assert.equal(semSessao.status,401);
 const proibido=await fetch(base+'/api/loja/pedidos',{
  method:'POST',headers:{Cookie:cookieA,Origin:ORIGEM}
 });
 assert.equal(proibido.status,503);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
