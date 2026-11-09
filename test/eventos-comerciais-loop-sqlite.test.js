'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {validarIdentidade,criarBackupIdentidadeReal,restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const DOC='Termos para teste de cadastro, pedido, evento e recuperação. O ensaio '+
 'não cria posição financeira real, comissão, saque ou pagamento de fornecedor.';
const ORIGEM='https://contas.example.invalid';
const ENTREGA={destinatario:'Cliente de Ensaio',cep:'27250010',
 logradouro:'Rua Exemplo',numero:'10',bairro:'Centro',cidade:'Volta Redonda',
 uf:'RJ',complemento:''};
function preparar(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-eventos-comerciais-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'clientes.sqlite');
 const banco=new DatabaseSync(file);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 const chaves={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const cfg={...chaves,banco,
  termos:{versao:'TERMO-2026',texto:DOC},
  privacidade:{versao:'PRIV-2026',texto:DOC},
  enviarEmail:async()=>true};
 const contas=new IdentidadeClienteLoopReal(cfg);
 let provaStatus='PENDENTE',provaValor=25900,pagamentoId='PAGAMENTO_001';
 const chavePedidos=randomBytes(32),cotacoes=new Map();
 const consultarCotacaoConfiavel=async({cotacaoId})=>cotacoes.get(cotacaoId)||null;
 const consultarPagamentoPsp=async({pedidoId})=>({
  pedidoId,status:provaStatus,moeda:'BRL',
  pagamentoId,valorCentavos:provaValor
 });
 const opts={banco,chavePedidos,consultarCotacaoConfiavel,
  consultarPagamentoPsp};
 // O mesmo backend define pedido e evento, sem duplicar checkout.
 new PedidosComerciaisSQLite(opts);
 const eventos=new EventosComerciaisLoopSQLite({banco});
 const pedidos=new PedidosComerciaisSQLite({
  ...opts,eventosComerciais:eventos
 });
 const motor=new MotorLoopIntegradoSQLite({banco});
 async function cadastrar(nick){
  const docs=contas.documentos();
  const c=await contas.cadastrar({
   nome:'Pessoa Teste',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaDeEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  banco.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
   .run(Date.now(),c.titularId);
  return c;
 }
 async function pedido(titularId,cotacaoId='COTACAO_001'){
  cotacoes.set(cotacaoId,{
   cotacaoId,titularId,cepDestino:ENTREGA.cep,status:'APROVADA',
   expiraEm:Date.now()+900000,
   fornecedorId:'FORNECEDOR_001',freteCentavos:900,
   itens:[{sku:'SKU_001',quantidade:1,precoUnitCentavos:25000}]
  });
  return pedidos.criarPedido({
   titularId,cotacaoId,chaveIdempotencia:'IDEM_'+cotacaoId,
   enderecoEntrega:ENTREGA
  });
 }
 return {dir,file,banco,contas,pedidos,eventos,motor,opts,
  cadastrar,pedido,
  definirPsp:({status,valor,pagamento}={})=>{
   if(status!==undefined)provaStatus=status;
   if(valor!==undefined)provaValor=valor;
   if(pagamento!==undefined)pagamentoId=pagamento;
  }};
}
test('sem reconsulta PSP aprovada não há evento; confirmado grava somente 1, sem posição',async t=>{
 const x=preparar(t);t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha'),b=await x.cadastrar('Bravo');
 const p=await x.pedido(a.titularId);
 assert.equal(p.status,'AGUARDANDO_PAGAMENTO');
 assert.equal(x.eventos.verificar().eventos,0);
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:p.pedidoId}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 x.definirPsp({status:'CONFIRMADO',valor:25000});
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:p.pedidoId}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(x.eventos.verificar().eventos,0);
 x.definirPsp({valor:25900});
 assert.equal((await x.pedidos.confirmarPagamento({
  pedidoId:p.pedidoId
 })).status,'APROVADO_PARA_EXPEDICAO');
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId})).confirmado,true);
 assert.deepEqual(x.eventos.verificar(),{
  integridade:'OK',eventos:1,pendentes:1,cancelados:0,
  pedidosAprovadosSemEvento:0,direitosReaisCriados:0,girosAcionados:0,
  financeiroReal:false
 });
 assert.equal(x.eventos.consultarTitular({titularId:b.titularId}).eventos.length,0);
 const meus=x.eventos.consultarTitular({titularId:a.titularId});
 assert.equal(meus.eventos.length,1);
 assert.equal(meus.eventos[0].estado,'AGUARDANDO_CONCILIACAO');
 const e=x.banco.prepare(
  'SELECT * FROM loop_real_eventos_comerciais WHERE pedido_id=?'
 ).get(p.pedidoId);
 assert.equal(e.valor_total_centavos,25900);
 assert.equal(e.frete_centavos,900);
 assert.equal(e.valor_produtos_centavos,25000);
 assert.equal(x.motor.consultar({titularId:a.titularId}).minhasPosicoes.length,0);
 assert.equal(x.motor.verificar().eventos,0);
 assert.throws(()=>x.banco.prepare(
  'DELETE FROM loop_real_eventos_comerciais WHERE pedido_id=?'
 ).run(p.pedidoId),/imutavel/);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loop_real_eventos_comerciais SET pagamento_id=? WHERE pedido_id=?'
 ).run('FALSO',p.pedidoId),/imutavel/);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('estorno bloqueia registro, não apaga trilha, não reativa após reversão',async t=>{
 const x=preparar(t);t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const p=await x.pedido(a.titularId);
 x.definirPsp({status:'CONFIRMADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 x.definirPsp({status:'ESTORNADO',pagamento:'FALSO'});
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:p.pedidoId}),
  {codigo:'PAGAMENTO_DIVERGENTE'});
 assert.equal(x.eventos.verificar().pendentes,1);
 x.definirPsp({pagamento:'PAGAMENTO_001'});
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId})).cancelado,true);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId})).cancelado,true);
 assert.equal(x.eventos.verificar().cancelados,1);
 assert.equal(x.eventos.verificar().eventos,1);
 x.definirPsp({status:'CONFIRMADO'});
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:p.pedidoId}),
  {codigo:'PEDIDO_CANCELADO'});
 assert.equal(x.motor.verificar().compras,0);
});
test('se gravar evento falhar, pedido volta a AGUARDANDO_PAGAMENTO na transação',async t=>{
 const x=preparar(t);t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const p=await x.pedido(a.titularId);
 x.definirPsp({status:'CONFIRMADO'});
 const quebrado={db:x.banco,
  registrarPagamentoConciliadoEmTransacao:()=>{
   throw Error('FALHA_DE_DISCO_SIMULADA');
  },
  registrarCancelamentoEmTransacao:()=>{}};
 const pedidosFalhando=new PedidosComerciaisSQLite({
  ...x.opts,eventosComerciais:quebrado
 });
 await assert.rejects(pedidosFalhando.confirmarPagamento({
  pedidoId:p.pedidoId
 }),/FALHA_DE_DISCO_SIMULADA/);
 assert.equal(x.banco.prepare(
  'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
 ).get(p.pedidoId).status,'AGUARDANDO_PAGAMENTO');
 assert.equal(x.eventos.verificar().eventos,0);
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(x.eventos.verificar().pendentes,1);
});
test('mesmo ID de pagamento em dois pedidos não duplica entrada econômica',async t=>{
 const x=preparar(t);t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const p=await x.pedido(a.titularId,'COTACAO_001');
 const q=await x.pedido(a.titularId,'COTACAO_002');
 x.definirPsp({status:'CONFIRMADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:q.pedidoId}),
  /SQLITE_CONSTRAINT|UNIQUE/);
 assert.equal(x.eventos.verificar().eventos,1);
 assert.equal(x.banco.prepare(
  'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
 ).get(q.pedidoId).status,'AGUARDANDO_PAGAMENTO');
});
test('API consulta apenas eventos do próprio titular e bloqueia qualquer POST',async t=>{
 const x=preparar(t);t.after(()=>x.banco.close());
 const a=await x.cadastrar('Alpha');
 const b=await x.cadastrar('Bravo');
 const p=await x.pedido(a.titularId);
 x.definirPsp({status:'CONFIRMADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,eventosComerciais:x.eventos,
  origemHttps:ORIGEM,permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(url+'/api/loop/eventos-comerciais')).status,401);
 const logins={};
 for(const nick of ['Alpha','Bravo']){
  const resposta=await fetch(url+'/api/contas/entrar',{
   method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:'SenhaDeEnsaio2026!'})
  });
  assert.equal(resposta.status,200);
  logins[nick]=resposta.headers.get('set-cookie').split(';')[0];
 }
 const alpha=await fetch(url+'/api/loop/eventos-comerciais?titularId='+b.titularId,{
  headers:{Cookie:logins.Alpha}
 });
 const bravo=await fetch(url+'/api/loop/eventos-comerciais?titularId='+a.titularId,{
  headers:{Cookie:logins.Bravo}
 });
 assert.equal(alpha.status,200);
 assert.equal(bravo.status,200);
 assert.equal((await alpha.json()).eventos.length,1);
 assert.equal((await bravo.json()).eventos.length,0);
 assert.equal((await fetch(url+'/api/loop/eventos-comerciais',{
  method:'POST',headers:{Cookie:logins.Alpha,Origin:ORIGEM,
   'Content-Type':'application/json'},body:JSON.stringify({pedidoId:p.pedidoId})
 })).status,404);
 assert.equal((await fetch(url+'/api/checkout/finalizar',{
  method:'POST',headers:{Cookie:logins.Alpha,Origin:ORIGEM,
   'Content-Type':'application/json'},body:'{}'
 })).status,503);
});
test('backup cifrado e reinício preservam eventos e não fingem direito real',async t=>{
 const x=preparar(t);
 const a=await x.cadastrar('Alpha');
 const p=await x.pedido(a.titularId);
 x.definirPsp({status:'CONFIRMADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 const antes=validarIdentidade(x.file);
 assert.equal(antes.integridade,'ok');
 assert.equal(x.eventos.verificar().pendentes,1);
 const bkp=path.join(x.dir,'clientes.looprealbak');
 const restauro=path.join(x.dir,'restaurado.sqlite');
 const key=randomBytes(32);
 const feito=await criarBackupIdentidadeReal({
  origem:x.file,destino:bkp,chaveBackup:key,autorizado:true
 });
 assert.equal(feito.contas,1);
 await restaurarBackupIdentidadeReal({
  origem:bkp,destino:restauro,chaveBackup:key,autorizado:true
 });
 const db=new DatabaseSync(restauro);db.exec('PRAGMA foreign_keys=ON');
 try{
  const eventos=new EventosComerciaisLoopSQLite({banco:db});
  const motor=new MotorLoopIntegradoSQLite({banco:db});
  assert.equal(eventos.verificar().eventos,1);
  assert.equal(eventos.verificar().pendentes,1);
  assert.equal(eventos.verificar().direitosReaisCriados,0);
  assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,0);
  assert.equal(validarIdentidade(restauro).integridade,'ok');
 }finally{db.close();}
 x.banco.close();
});
