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
const TEXTO='Termos e privacidade do teste de navegação da AKITEMM e do LOOP. '+
 'As contas e pedidos são fictícios, sem autorização para compras, '+
 'pagamentos, saldo, saques ou ativação de posições reais.';
function cifrar(key,dados){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from('AKITEMM-PEDIDO-REAL-V1'));
 const ct=Buffer.concat([c.update(JSON.stringify(dados)),c.final()]);
 return [iv.toString('hex'),ct.toString('hex'),
  c.getAuthTag().toString('hex')];
}
test('cliente percorre 72 pedidos no mesmo SQLite, sem quota oculta nem vazamento',async t=>{
 const banco=new DatabaseSync(':memory:');
 const identidade=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026-v1',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-v1',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const documentos=identidade.documentos(),senha='SenhaFicticia2026!';
 const cadastrar=async(nick)=>{
  const resultado=await identidade.cadastrar({
   nome:'Titular de Teste '+nick,nick,
   email:nick.toLowerCase()+'@example.invalid',senha,
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
   versaoPrivacidade:documentos.privacidade.versao,
   hashPrivacidade:documentos.privacidade.hash
  });
  return resultado.titularId;
 };
 const primeiro=await cadastrar('TitularA');
 const segundo=await cadastrar('TitularB');
 const chave=randomBytes(32);
 const pedidos=new PedidosComerciaisSQLite({
  banco,chavePedidos:chave,
  consultarCotacaoConfiavel:async()=>null,
  consultarPagamentoPsp:async()=>null
 });
 const insert=banco.prepare([
  'INSERT INTO loja_real_pedidos(',
  'pedido_id,titular_id,fornecedor_id,cotacao_id,idempotencia_hmac,',
  'payload_iv,payload_ct,payload_tag,frete_centavos,valor_total_centavos,',
  'status,pagamento_id,criado_em,atualizado_em)',
  'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
 ].join(' '));
 const carga=(titular,prefixo,n)=>{
  for(let i=1;i<=n;i++){
   const id=prefixo+'_'+String(i).padStart(4,'0');
   const [iv,ct,tag]=cifrar(chave,{
    grupos:[{fornecedorId:'FORN_EXEMPLO',freteCentavos:0,
     itens:[{sku:'SKU_TESTE',quantidade:1,precoUnitCentavos:25000}]}]
   });
   insert.run(id,titular,'FORN_EXEMPLO','COT_'+id,'HMAC_'+id,
    iv,ct,tag,0,25000,'AGUARDANDO_PAGAMENTO',null,
    1730000000000,1730000000000);
  }
 };
 carga(primeiro,'A',72);carga(segundo,'B',3);
 assert.equal(pedidos.contarDoTitular({titularId:primeiro}),72);
 assert.equal(pedidos.contarDoTitular({titularId:segundo}),3);
 const segredos=criarLeituraComercialSegura({banco,pedidos});
 assert.equal(typeof segredos.leituraPedidos.criarPedido,'undefined');
 const app=criarAppIdentidadeLoop({
  contas:identidade,origemHttps:ORIGEM,permitirCadastro:true,
  pedidosComerciais:segredos.leituraPedidos,
  remessasOutbox:segredos.leituraRemessas
 });
 const servidor=app.listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(async()=>{
  await new Promise(ok=>servidor.close(ok));
  banco.close();
 });
 const base='http://127.0.0.1:'+servidor.address().port;
 const entrar=async(nick)=>{
  const r=await fetch(base+'/api/contas/entrar',{
   method:'POST',
   headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha})
  });
  assert.equal(r.status,200);
  return r.headers.get('set-cookie').split(';')[0];
 };
 const a=await entrar('TitularA'),b=await entrar('TitularB');
 const abrir=(cookie,pagina)=>fetch(base+'/api/loja/pedidos?pagina='+pagina,{
  headers:{Cookie:cookie},cache:'no-store'
 });
 const ids=new Set();
 for(let pagina=0;pagina<4;pagina++){
  const resposta=await abrir(a,pagina);
  assert.equal(resposta.status,200);
  const d=await resposta.json();
  const esperado=pagina===3?12:20;
  assert.equal(d.pedidos.length,esperado);
  assert.deepEqual(d.paginacao,{
   pagina,tamanho:20,total:72,
   haAnterior:pagina>0,haMais:pagina<3
  });
  assert.equal(d.checkoutRealHabilitadoPorEstaConsulta,false);
  assert.equal(d.fonte,'PEDIDOS_COMERCIAIS_DO_TITULAR');
  for(const pedido of d.pedidos){
   assert.match(pedido.pedidoId,/^A_/);
   assert.equal(ids.has(pedido.pedidoId),false);
   ids.add(pedido.pedidoId);
   assert.equal(pedido.valorTotalCentavos,25000);
   assert.equal(pedido.remessas[0].estado,'AGUARDANDO_SEPARACAO');
  }
 }
 assert.equal(ids.size,72);
 const ultima=await abrir(a,4);
 assert.equal(ultima.status,200);
 assert.equal((await ultima.json()).pedidos.length,0);
 const proprio=await abrir(b,0);
 assert.equal(proprio.status,200);
 const escopo=await proprio.json();
 assert.equal(escopo.paginacao.total,3);
 assert.equal(escopo.pedidos.length,3);
 assert.ok(escopo.pedidos.every(p=>p.pedidoId.startsWith('B_')));
 assert.equal((await fetch(base+'/api/loja/pedidos')).status,401);
 for(const pagina of ['-1','1e2','1.2','9007199254740991','0&pagina=1']){
  const r=await abrir(a,pagina);
  assert.equal(r.status,400,'parâmetro inválido '+pagina);
 }
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
