'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const DOC='Termos técnicos da conta real para a Loja AKITEMM e Escritório LOOP. '+
 'Não representam venda comercial nem autorizam qualquer pagamento real.';
const ORIGEM='https://contas.example.invalid',SENHA='SenhaAprovadaTeste2026!';
test('Meus Pedidos usa o ID da sessão e nunca aceita pedido de outro titular',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos(),clientes={};
 for(const nick of ['Ana','Bia']){
  clientes[nick]=await contas.cadastrar({
   nome:nick+' Exemplo',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:SENHA,aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash
  });
 }
 const spy=[];
 const pedidosComerciais={
  contarDoTitular({titularId}){
   return Object.values(clientes).some(x=>x.titularId===titularId)?1:0;
  },
  listarDoTitular({titularId,limite,offset}){
   assert.equal(offset,0);
   spy.push({titularId,limite});
   const cliente=Object.values(clientes).find(x=>x.titularId===titularId);
   if(!cliente)return [];
   return [{
    pedidoId:'PEDIDO_'+cliente.nick,fornecedorId:'dist_01',
    fornecedores:['dist_01','dist_02'],
    valorTotalCentavos:25000,status:'APROVADO_PARA_EXPEDICAO',
    criadoEm:1_800_000_000_000
   }];
  }
 };
 const remessasOutbox={
  consultar({pedidoId,fornecedorId}){
   return {pedidoParceiroId:null,estado:fornecedorId==='dist_01'?
    'ENVIADO':'PENDENTE'};
  }
 };
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:true,
  pedidosComerciais,remessasOutbox
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/loja/pedidos')).status,401);
 const cookies={};
 for(const nick of ['Ana','Bia']){
  const login=await fetch(base+'/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:SENHA})
  });
  assert.equal(login.status,200);
  cookies[nick]=login.headers.get('set-cookie').split(';')[0];
 }
 const ana=await fetch(base+'/api/loja/pedidos?titularId='+clientes.Bia.titularId,{
  headers:{Cookie:cookies.Ana}
 });
 assert.equal(ana.status,200);
 const dadosAna=await ana.json();
 assert.equal(dadosAna.fonte,'PEDIDOS_COMERCIAIS_DO_TITULAR');
 assert.equal(dadosAna.checkoutRealHabilitadoPorEstaConsulta,false);
 assert.equal(dadosAna.pedidos.length,1);
 assert.equal(dadosAna.pedidos[0].pedidoId,'PEDIDO_ana');
 assert.equal(dadosAna.pedidos[0].remessas.length,2);
 assert.equal(dadosAna.pedidos[0].remessas[0].estado,'ENVIADO');
 assert.equal(dadosAna.pedidos[0].remessas[1].estado,'PENDENTE');
 assert.equal(JSON.stringify(dadosAna).includes('example.invalid'),false);
 const bia=await fetch(base+'/api/loja/pedidos?pedidoId=PEDIDO_ana',{
  headers:{Cookie:cookies.Bia}
 });
 assert.equal(bia.status,200);
 const dadosBia=await bia.json();
 assert.equal(dadosBia.pedidos[0].pedidoId,'PEDIDO_bia');
 assert.deepEqual(spy,[
  {titularId:clientes.Ana.titularId,limite:20},
  {titularId:clientes.Bia.titularId,limite:20}
 ]);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('sem módulo de pedidos integrado não mostrar catálogo, vendas ou dados simulados',async t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const cliente=await contas.cadastrar({
  nome:'Ana Exemplo',nick:'Ana',email:'ana@example.invalid',senha:SENHA,
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:contas.documentos().termos.versao,
  hashTermos:contas.documentos().termos.hash,
  versaoPrivacidade:contas.documentos().privacidade.versao,
  hashPrivacidade:contas.documentos().privacidade.hash
 });
 const login=await contas.entrar({nick:'Ana',senha:SENHA});
 const r=await fetch('http://127.0.0.1:'+server.address().port+
  '/api/loja/pedidos',{headers:{Cookie:'loop_real_s='+login.token}});
 assert.equal(r.status,503);
 assert.equal((await r.json()).erro,'PEDIDOS_REAIS_AINDA_NAO_INTEGRADOS');
});
