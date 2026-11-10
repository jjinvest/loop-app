'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('../src/producao/classificacao-comercial-loop-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {PromocaoPedidoMotorEnsaioSQLite}=
 require('../src/producao/promocao-pedido-motor-ensaio-sqlite');
const {SincronizadorComercialLoopEnsaioSQLite}=
 require('../src/producao/sincronizador-comercial-loop-ensaio-sqlite');
const {OperacaoCatracaAdminSQLite}=
 require('../src/producao/operacao-catraca-admin-sqlite');
const {validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {once}=require('node:events');

const ORIGEM={destinatario:'Pessoa de Ensaio',cep:'27250010',
 logradouro:'Rua de Ensaio',numero:'2',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};
const DOC='Termos de consentimento para laboratorio isolado de teste, '+
 'sem pagamentos, saques, direitos remunerados ou posicoes reais. '+
 'Este contrato e apenas uma simulacao computacional.';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-promocao-'));
 const arquivo=path.join(dir,'clientes.sqlite');
 const db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 const chaves={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const contas=new IdentidadeClienteLoopReal({banco:db,...chaves,
  termos:{versao:'LOOP-TERMOS-ENSAIO',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-ENSAIO',texto:DOC},
  enviarEmail:async()=>true
 });
 const doc=contas.documentos();
 async function cadastrar(nick){
  const r=await contas.cadastrar({
   nome:'Pessoa Ensaio',nick,email:nick.toLowerCase()+'@example.invalid',
   senha:'SenhaDeEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:doc.termos.versao,hashTermos:doc.termos.hash,
   versaoPrivacidade:doc.privacidade.versao,hashPrivacidade:doc.privacidade.hash
  });
  db.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
   .run(Date.now(),r.titularId);
  return r;
 }
 const titular=await cadastrar('Comprador');
 const outro=await cadastrar('Outro');
 const auditoria=new AuditoriaOperacionalSQLite({banco:db,
  chaveAuditoria:randomBytes(32)});
 const manutencao=new ManutencaoComercialSQLite({banco:db,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 const controle=new ControleEconomicoLojaSQLite({banco:db,auditoria,manutencao});
 const sessoes=new SessaoAdminComercialSQLite({
  banco:db,chaveAdmin:randomBytes(32),
  credencialAdmin:'CredencialAdminSomenteEnsaios2026!Complexa'
 });
 const chavePedidos=randomBytes(32),cotacoes=new Map(),statusPsp=new Map();
 const base=()=>({banco:db,chavePedidos,
  consultarCotacaoConfiavel:async({cotacaoId})=>cotacoes.get(cotacaoId),
  consultarPagamentoPsp:async({pedidoId})=>{
   const e=statusPsp.get(pedidoId);
   return {pedidoId,status:e?.status||'CONFIRMADO',
    moeda:'BRL',pagamentoId:'PSP_'+pedidoId,
    valorCentavos:e?.valor??db.prepare(
     'SELECT valor_total_centavos FROM loja_real_pedidos WHERE pedido_id=?'
    ).get(pedidoId).valor_total_centavos};
  }});
 new PedidosComerciaisSQLite(base());
 const classificacao=new ClassificacaoComercialLoopSQLite({banco:db});
 const eventos=new EventosComerciaisLoopSQLite({
  banco:db,classificacaoLoop:classificacao
 });
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const pedidos=new PedidosComerciaisSQLite({...base(),eventosComerciais:eventos,
  classificacaoLoop:classificacao});
 const promocao=new PromocaoPedidoMotorEnsaioSQLite({
  banco:db,motor,classificacaoLoop:classificacao,
  chaveCpfEnsaio:randomBytes(32)
 });
 const integracao=new SincronizadorComercialLoopEnsaioSQLite({
  banco:db,motor,classificacaoLoop:classificacao,promocao
 });
 const pedidosIntegrados=new PedidosComerciaisSQLite({
  ...base(),eventosComerciais:eventos,classificacaoLoop:classificacao,
  integradorComercialEnsaio:integracao
 });
 const produtos=new Map();
 function produto({nome,preco,cor='VERDE'}){
  catalogo.criarProduto({produtoId:nome,titulo:'Produto '+nome});
  catalogo.vincularOferta({
   produtoId:nome,distribuidorId:'DISTRIBUIDOR_TESTE',
   sku:'SKU_'+nome,precoUnitCentavos:preco
  });
  if(cor!=='CINZA')classificacao.configurarProduto({
   produtoId:nome,cor,autorizado:true
  });
  produtos.set(nome,preco);
 }
 let seq=0;
 async function criarPedido({nome,preco,frete=1000,cliente=titular}){
  seq++;
  const cotacaoId='COTACAO_ENSAIO_'+seq;
  cotacoes.set(cotacaoId,{
   cotacaoId,titularId:cliente.titularId,cepDestino:ORIGEM.cep,
   status:'APROVADA',expiraEm:Date.now()+600000,
   grupos:[{fornecedorId:'DISTRIBUIDOR_TESTE',
    freteCentavos:frete,itens:[{
     sku:'SKU_'+nome,precoUnitCentavos:preco,quantidade:1
    }]}]
  });
  const novo=await pedidos.criarPedido({
   titularId:cliente.titularId,cotacaoId,
   chaveIdempotencia:'COMPRA_ENSAIO_'+seq,
   enderecoEntrega:ORIGEM
  });
  return {pedidoId:novo.pedidoId,
   pagamentoId:'PSP_'+novo.pedidoId,
   valorCentavos:preco+frete,produtosCentavos:preco,
   provaEnsaioId:'PROVA_ENSAIO_'+seq,
   autorizadoEnsaio:true};
 }
 async function confirmar(p){
  return pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 }
 return {db,arquivo,dir,contas,chaves,catalogo,classificacao,
  motor,producao:promocao,evento:eventos,pedidos,pedidosIntegrados,
  integracao,controle,sessoes,auditoria,manutencao,titular,outro,
  produto,criarPedido,confirmar,statusPsp};
}
test('compra verde R$250 sem frete promove uma posição em B no mesmo commit, uma unica vez',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verde250',preco:25000});
 const p=await x.criarPedido({nome:'verde250',preco:25000,frete:3500});
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(x.evento.verificar().eventos,0);
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio(p),
  {codigo:'PROMOCAO_SEM_EVENTO_COMERCIAL'});
 await x.confirmar(p);
 assert.equal(x.evento.verificar().pendentes,1);
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(x.producao.aprovarEEnfileirarEmEnsaio(p).repetida,false);
 const estado=x.motor.consultar({titularId:x.titular.titularId});
 assert.equal(estado.minhasPosicoes.length,1);
 assert.equal(estado.minhasPosicoes[0].local,'FILA_B');
 assert.equal(estado.filaB,1);
 assert.equal(estado.posicoesAzuisPendentes,1);
 assert.equal(estado.tabuleiro.eventosNoCiclo,0);
 assert.equal(estado.catraca.giros,0);
 assert.equal(estado.posicoesReais,0);
 assert.equal(x.db.prepare(
  'SELECT valor_centavos FROM loop_real_motor_compras WHERE pedido_id=?'
 ).get(p.pedidoId).valor_centavos,25000);
 assert.equal(x.producao.aprovarEEnfileirarEmEnsaio(p).repetida,true);
 assert.equal(x.producao.verificar().promocoesEnsaio,1);
 assert.equal(x.motor.verificar().compras,1);
 assert.equal(x.evento.verificar().pendentes,1,'continua pendente de prova financeira REAL');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
  ...p,provaEnsaioId:'PROVA_FORJADA'
 }),{codigo:'PROMOCAO_REPLAY_DIVERGENTE'});
 assert.equal(x.motor.verificar().compras,1);
});
test('regra cinza, verde abaixo de R$250 e frete excessivo nao criam posicao',async t=>{
 const x=await fixture(t);
 for(const [nome,preco,cor,frete] of [
  ['cinza300',30000,'CINZA',1000],
  ['quase249',24900,'VERDE',10000],
  ['cinza190',19000,'CINZA',7000]
 ]){
  x.produto({nome,preco,cor});
  const p=await x.criarPedido({nome,preco,frete});
  await x.confirmar(p);
  assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio(p),
   {codigo:preco<25000?'PROMOCAO_VALOR_PRODUTOS_INVALIDO':
    'PROMOCAO_COMPRA_NAO_QUALIFICADA_OU_REGRA_PENDENTE'});
  assert.equal(x.motor.verificar().compras,0);
 }
 assert.equal(x.evento.verificar().pendentes,3);
 assert.equal(x.producao.verificar().promocoesEnsaio,0);
});
test('autorizacao de ensaio, valor da captura, titular e comprovante unico sao obrigatorios',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeUnico',preco:25000});
 const p=await x.criarPedido({nome:'verdeUnico',preco:25000});
 await x.confirmar(p);
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
  ...p,autorizadoEnsaio:false
 }),{codigo:'PROMOCAO_ENSAIO_AUTORIZACAO_OU_PROVA_INVALIDA'});
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
  ...p,valorCentavos:26001
 }),{codigo:'PROMOCAO_PAGAMENTO_OU_TITULAR_DIVERGENTE'});
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
  ...p,pagamentoId:'PSP_OUTRO'
 }),{codigo:'PROMOCAO_PAGAMENTO_OU_TITULAR_DIVERGENTE'});
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(x.producao.aprovarEEnfileirarEmEnsaio(p).repetida,false);
 const second=await x.criarPedido({nome:'verdeUnico',preco:25000});
 await x.confirmar(second);
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
  ...second,provaEnsaioId:p.provaEnsaioId
 }),{codigo:'PROMOCAO_PROVA_DE_ENSAIO_REUTILIZADA'});
 assert.equal(x.motor.verificar().compras,1);
 assert.equal(x.producao.verificar().promocoesEnsaio,1);
});
test('estorno exige revisao individual, sem parar demais compras e controle da catraca',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeEstorno',preco:25000});
 x.produto({nome:'verdeNovo',preco:25000});
 const p=await x.criarPedido({nome:'verdeEstorno',preco:25000});
 await x.confirmar(p);
 x.producao.aprovarEEnfileirarEmEnsaio(p);
 x.statusPsp.set(p.pedidoId,{status:'ESTORNADO'});
 const r=await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(r.cancelado,true);
 assert.equal(x.producao.verificar().revisaoFinanceiraPendente,true);
 assert.equal(x.producao.verificar().motorBloqueadoPorEstorno,false);
 const controle=x.motor.controlarCatracaEnsaio({acao:'PAUSAR'});
 assert.equal(controle.aberta,false);
 const novo=await x.criarPedido({nome:'verdeNovo',preco:25000,cliente:x.outro});
 await x.confirmar(novo);
 const pos=x.producao.aprovarEEnfileirarEmEnsaio(novo);
 assert.equal(pos.repetida,false);
 assert.equal(x.motor.consultar({titularId:x.outro.titularId}).minhasPosicoes[0].local,'FILA_B');
 assert.equal(x.motor.consultar().catraca.estado,'PAUSADA');
 assert.equal(x.producao.suspenderPromocaoRevertidaEmEnsaio({
  pedidoId:p.pedidoId,autorizadoEnsaio:true
 }).estado,'REVISAR_PSP');
 assert.equal(x.motor.consultar().catraca.estado,'PAUSADA');
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'ABRIR'}).aberta,true);
 assert.equal(x.producao.verificar().reversoesEmQuarentena,1);
 assert.equal(x.motor.verificar().compras,2);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
test('estorno ANTES da aprovacao e replay de PSP nao geram posicao',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeCancelado',preco:25000});
 const p=await x.criarPedido({nome:'verdeCancelado',preco:25000});
 await x.confirmar(p);
 x.statusPsp.set(p.pedidoId,{status:'ESTORNADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio(p),
  {codigo:'PROMOCAO_EVENTO_CANCELADO_OU_NAO_CONFIRMADO'});
 assert.equal(x.producao.verificar().promocoesEnsaio,0);
 assert.equal(x.motor.verificar().compras,0);
});
test('capacidade maxima 10 impede decima primeira compra sem registro parcial',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeLimite',preco:25000});
 for(let i=0;i<10;i++){
  const p=await x.criarPedido({nome:'verdeLimite',preco:25000});
  await x.confirmar(p);
  assert.equal(x.producao.aprovarEEnfileirarEmEnsaio(p).repetida,false);
 }
 assert.equal(x.motor.consultar({
  titularId:x.titular.titularId
 }).minhasPosicoes.length,10);
 const p=await x.criarPedido({nome:'verdeLimite',preco:25000});
 await x.confirmar(p);
 assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio(p),
  {codigo:'LOOP_MAXIMO_DEZ_POSICOES'});
 assert.equal(x.producao.verificar().promocoesEnsaio,10);
 assert.equal(x.motor.verificar().compras,10);
 assert.equal(x.evento.verificar().pendentes,11);
});
test('backup/restauro preserva provas e posicoes sem transformar em saldo real',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeBackup',preco:25000});
 const p=await x.criarPedido({nome:'verdeBackup',preco:25000});
 await x.confirmar(p);
 x.producao.aprovarEEnfileirarEmEnsaio(p);
 const destino=path.join(x.dir,'comercial.looprealbak');
 const restaurado=path.join(x.dir,'restaurado.sqlite');
 const chave=randomBytes(32);
 await criarBackupIdentidadeReal({
  origem:x.arquivo,destino,chaveBackup:chave,autorizado:true
 });
 await restaurarBackupIdentidadeReal({
  origem:destino,destino:restaurado,chaveBackup:chave,autorizado:true
 });
 const b=new DatabaseSync(restaurado,{readOnly:true});
 try{
  const prova=Object.create(PromocaoPedidoMotorEnsaioSQLite.prototype);
  prova.db=b;
  assert.equal(prova.verificar().promocoesEnsaio,1);
  const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
  motor.banco=b;
  assert.equal(motor.verificar().compras,1);
  assert.equal(validarIdentidade(restaurado).integridade,'ok');
 }finally{b.close();}
});
test('producao e metodo interno sem transacao ficam fechados mesmo com dados de teste',async t=>{
 const x=await fixture(t);
 assert.throws(()=>x.motor.registrarCompraConciliadaEnsaioEmTransacao({
  titularId:x.titular.titularId,pedidoId:'pedidoNaoExiste',valorCentavos:25000
 }),{codigo:'LOOP_COMPRA_CONCILIADA_REQUER_TRANSACAO'});
 const old=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>x.producao.aprovarEEnfileirarEmEnsaio({
   pedidoId:'pedidoQualquer',pagamentoId:'pagamentoQualquer',
   provaEnsaioId:'provaQualquer',valorCentavos:25000,autorizadoEnsaio:true
  }),{codigo:'PROMOCAO_PRODUCAO_NAO_HOMOLOGADA'});
  assert.throws(()=>x.motor.registrarCompraConciliadaEnsaioEmTransacao({
   titularId:x.titular.titularId,pedidoId:'pedidoQualquer',valorCentavos:25000
  }),{codigo:'LOOP_MOTOR_SEM_COMPROVANTE_PRODUTIVO'});
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
 }
});

test('Escritorio HTTP aprovado enxerga automaticamente posicao de compra verde sem permitir criar ou girar',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeHTTP',preco:25000});
 const p=await x.criarPedido({nome:'verdeHTTP',preco:25000});
 await x.confirmar(p);
 x.producao.aprovarEEnfileirarEmEnsaio(p);
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,eventosComerciais:x.evento,
  origemHttps:'https://contas.example.invalid',permitirCadastro:true
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const cookies=[];
 for(const nick of ['Comprador','Outro']){
  const response=await fetch(base+'/api/contas/entrar',{
   method:'POST',
   headers:{Origin:'https://contas.example.invalid',
    'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha:'SenhaDeEnsaio2026!'})
  });
  assert.equal(response.status,200);
  cookies.push(response.headers.get('set-cookie').split(';')[0]);
 }
 const estado=await (await fetch(base+'/api/loop/estado',{
  headers:{Cookie:cookies[0]}
 })).json();
 assert.equal(estado.minhasPosicoes.length,1);
 assert.equal(estado.minhasPosicoes[0].local,'FILA_B');
 assert.equal(estado.filaB,1);
 assert.equal(estado.posicoesAzuisPendentes,1);
 assert.equal(estado.minhasPosicoes[0].pedidoDeOrigemEnsaio,p.pedidoId);
 assert.equal(estado.eventosComerciais.promovidasSomenteEmEnsaio,1);
 assert.equal(estado.eventosComerciais.aguardandoConciliacao,1);
 assert.equal(estado.eventosComerciais.liberadosParaLoop,0);
 assert.equal(estado.catracaClientePodeGirar,false);
 assert.equal(estado.financeiroReal,false);
 const outro=await (await fetch(base+'/api/loop/estado?titularId='+
  encodeURIComponent(x.titular.titularId),{
  headers:{Cookie:cookies[1]}
 })).json();
 assert.equal(outro.minhasPosicoes.length,0);
 assert.equal(outro.eventosComerciais.promovidasSomenteEmEnsaio,0);
 assert.equal(JSON.stringify(outro).includes(p.pedidoId),false);
 assert.equal((await fetch(base+'/api/loop/controlar-catraca',{
  method:'POST',headers:{Cookie:cookies[0],
   Origin:'https://contas.example.invalid',
   'Content-Type':'application/json'},
  body:JSON.stringify({acao:'GIRAR'})
 })).status,404);
 assert.equal((await fetch(base+'/api/loop/registrar-compra',{
  method:'POST',headers:{Cookie:cookies[0],
   Origin:'https://contas.example.invalid',
   'Content-Type':'application/json'},
  body:JSON.stringify({pedidoId:p.pedidoId})
 })).status,404);
 assert.equal(x.motor.verificar().compras,1);
});

test('azul pode ser confirmada enquanto aguarda na fila, sem impedir circulacao',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeAzul',preco:25000});
 const p=await x.criarPedido({nome:'verdeAzul',preco:25000});
 await x.confirmar(p);
 const r=x.producao.aprovarEEnfileirarEmEnsaio(p);
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).minhasPosicoes[0].estadoAdesao,'PENDENTE');
 const docs=x.contas.documentos();
 const a={titularId:x.titular.titularId,posicaoId:r.posicaoId,
  cpf:'52998224725',aceiteExplicito:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash};
 assert.throws(()=>x.producao.confirmarPosicaoAzulEmEnsaio({...a,cpf:'11111111111'}),
  {codigo:'AZUL_CPF_OU_ACEITE_INVALIDO'});
 assert.throws(()=>x.producao.confirmarPosicaoAzulEmEnsaio({...a,aceiteExplicito:false}),
  {codigo:'AZUL_CPF_OU_ACEITE_INVALIDO'});
 assert.throws(()=>x.producao.confirmarPosicaoAzulEmEnsaio({...a,titularId:x.outro.titularId}),
  {codigo:'AZUL_POSICAO_NAO_PERTENCE_A_CONTA'});
 assert.equal(x.producao.confirmarPosicaoAzulEmEnsaio(a).repetido,false);
 assert.equal(x.producao.confirmarPosicaoAzulEmEnsaio(a).repetido,true);
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).minhasPosicoes[0].estadoAdesao,'ACEITE_ENSAIO');
 assert.equal(x.producao.verificar().aceitesIndividuaisEnsaio,1);
 const preenchido=x.motor.prepararTabuleiroEnsaio();
 assert.equal(preenchido.centro.id,r.posicaoId);
 assert.equal(preenchido.centro.empresa,undefined);
 assert.equal(preenchido.centro.statusAdesao,'ACEITE_ENSAIO');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
test('reversao PSP coloca posicao aceita em quarentena sem apagar historico',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeReversao',preco:25000});
 const p=await x.criarPedido({nome:'verdeReversao',preco:25000});
 await x.confirmar(p);
 const r=x.producao.aprovarEEnfileirarEmEnsaio(p);
 const docs=x.contas.documentos();
 x.producao.confirmarPosicaoAzulEmEnsaio({titularId:x.titular.titularId,
  posicaoId:r.posicaoId,cpf:'52998224725',aceiteExplicito:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash});
 assert.throws(()=>x.producao.suspenderPromocaoRevertidaEmEnsaio({
  pedidoId:p.pedidoId,autorizadoEnsaio:true
 }),{codigo:'AZUL_REVERSAO_SEM_PSP'});
 x.statusPsp.set(p.pedidoId,{status:'ESTORNADO'});
 await x.pedidos.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(x.producao.suspenderPromocaoRevertidaEmEnsaio({
  pedidoId:p.pedidoId,autorizadoEnsaio:true}).repetido,false);
 assert.equal(x.producao.suspenderPromocaoRevertidaEmEnsaio({
  pedidoId:p.pedidoId,autorizadoEnsaio:true}).repetido,true);
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).minhasPosicoes[0].estadoAdesao,'REVISAR_PSP');
 assert.equal(x.producao.verificar().reversoesEmQuarentena,1);
 assert.equal(x.producao.verificar().aceitesIndividuaisEnsaio,1);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});

test('auditoria detecta aceite forjado diretamente no snapshot sem livro imutavel',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeAuditavel',preco:25000});
 const p=await x.criarPedido({nome:'verdeAuditavel',preco:25000});
 await x.confirmar(p);
 const result=x.producao.aprovarEEnfileirarEmEnsaio(p);
 const linha=x.db.prepare('SELECT snapshot FROM loop_real_motor_estado WHERE id=1').get();
 const s=JSON.parse(linha.snapshot);
 const fila=s.filas.filaB.find(x=>x.id===result.posicaoId);
 const idx=s.filas.vendasRegistradas.find(x=>x[0]===p.pedidoId)[1];
 fila.statusAdesao='ACEITE_ENSAIO';
 idx.statusAdesao='ACEITE_ENSAIO';
 x.db.prepare('UPDATE loop_real_motor_estado SET snapshot=? WHERE id=1')
  .run(JSON.stringify(s));
 assert.throws(()=>x.producao.verificar(),
  {codigo:'AZUL_SNAPSHOT_AUDITORIA_DIVERGENTE'});
 assert.throws(()=>validarIdentidade(x.arquivo),
  {codigo:'BACKUP_PROMOCAO_DIVERGENTE'});
});

test('compra azul circula e se torna dourada na entrada da vaga 6 sem bloquear catraca',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeAutoDourada',preco:25000});
 const p=await x.criarPedido({nome:'verdeAutoDourada',preco:25000});
 await x.confirmar(p);
 const a=x.producao.aprovarEEnfileirarEmEnsaio(p);
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).filaB,1);
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).posicoesAzuisPendentes,1);
 const entrada=x.motor.prepararTabuleiroEnsaio();
 assert.equal(entrada.centro.id,a.posicaoId);
 assert.equal(entrada.centro.empresa,true);
 assert.equal(entrada.centro.statusAdesao,'PRAZO_ENCERRADO');
 assert.equal(entrada.centro.titularOperacional,'LOOP_EMPRESA');
 assert.equal(entrada.centro.motivoAssuncao,'SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6');
 assert.equal(x.motor.consultar({titularId:x.titular.titularId}).minhasPosicoes.length,0,
  'posicao convertida nao pertence mais a carteira do titular');
 assert.equal(x.producao.consultarTitularEnsaio({titularId:x.titular.titularId})
  .promocoes[0].estadoAdesao,'PRAZO_ENCERRADO_DOURADA');
 const d=x.contas.documentos();
 assert.throws(()=>x.producao.confirmarPosicaoAzulEmEnsaio({
  titularId:x.titular.titularId,posicaoId:a.posicaoId,
  cpf:'52998224725',aceiteExplicito:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash
 }),{codigo:'AZUL_SNAPSHOT_DIVERGENTE'});
 assert.equal(x.producao.verificar().integridade,'OK');
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});

test('seis compras qualificadas ficam registradas na fila com catraca pausada; seis eventos exigem giro do operador',async t=>{
 const x=await fixture(t);
 x.produto({nome:'verdeFluxoSeis',preco:25000});
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'PAUSAR'}).aberta,false);
 const pedidos=[];
 for(let i=0;i<6;i++){
  const pedido=await x.criarPedido({nome:'verdeFluxoSeis',preco:25000});
  await x.confirmar(pedido);
  const promovida=x.producao.aprovarEEnfileirarEmEnsaio(pedido);
  assert.equal(promovida.repetida,false);
  pedidos.push(pedido);
 }
 const fila=x.motor.consultar({titularId:x.titular.titularId});
 assert.equal(fila.filaB,6);
 assert.equal(fila.posicoesAzuisPendentes,6);
 assert.equal(fila.catraca.estado,'PAUSADA');
 assert.equal(fila.catraca.giros,0);
 x.motor.prepararTabuleiroEnsaio();
 for(let i=0;i<6;i++){
  const evento=x.motor.registrarEventoEnsaio({pedidoId:pedidos[i].pedidoId});
  assert.equal(evento.repetida,false);
  assert.equal(evento.eventosNoCiclo,i+1);
 }
 assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,6);
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,false,
  'operador pausou somente a passagem, nao a chegada de compras');
 assert.equal(x.motor.consultar().catraca.giros,0);
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'ABRIR'}).aberta,true);
 assert.equal(x.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 assert.equal(x.motor.consultar().catraca.giros,1);
 assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});

test('compra confirmada aciona integracao interna automaticamente; cinza nao entra no LOOP, verdes geram posicoes e seis luzes',async t=>{
 const x=await fixture(t);
 x.produto({nome:'integracaoCinza',preco:30000,cor:'CINZA'});
 x.produto({nome:'integracaoVerde',preco:25000,cor:'VERDE'});
 const cinza=await x.criarPedido({nome:'integracaoCinza',preco:30000});
 const cinzaPsp=await x.pedidosIntegrados.confirmarPagamento({pedidoId:cinza.pedidoId});
 assert.equal(cinzaPsp.confirmado,true);
 assert.equal(cinzaPsp.integracaoInternaEnsaio.novasPosicoes,0);
 assert.equal(x.integracao.consultar().naoQualificadas,1);
 assert.equal(x.motor.verificar().compras,0);
 const pedidos=[];
 for(let i=0;i<7;i++){
  const p=await x.criarPedido({nome:'integracaoVerde',preco:25000});
  const confirmou=await x.pedidosIntegrados.confirmarPagamento({pedidoId:p.pedidoId});
  assert.equal(confirmou.confirmado,true);
  assert.equal(confirmou.integracaoInternaEnsaio.novasPosicoes,1);
  assert.equal(confirmou.integracaoInternaEnsaio.novosEventos,0);
  pedidos.push(p);
 }
 assert.equal(x.integracao.consultar().enfileiradas,7);
 assert.equal(x.motor.consultar().filaB,7);
 assert.equal(x.motor.consultar().posicoesAzuisPendentes,7);
 assert.equal(x.integracao.sincronizar().novasPosicoes,0);
 const preparado=x.integracao.prepararTabuleiro();
 assert.ok(preparado.centro>0);
 assert.equal(preparado.eventosNoCiclo,6);
 assert.equal(preparado.esperandoSeisEventos,1);
 assert.equal(x.integracao.sincronizar().novosEventos,0);
 const catraca=new OperacaoCatracaAdminSQLite({banco:x.db,motor:x.motor});
 assert.equal(catraca.executarGiro().girou,false);
 catraca.configurar({modo:'MANUAL',janelaInicio:'00:00',
  janelaFim:'00:00',limiteDiario:null,revisaoEsperada:1,
  motivo:'GIRO_AUDITADO_POR_VENDAS'});
 assert.equal(catraca.executarGiro().girou,true);
 const recarga=x.integracao.sincronizar();
 assert.equal(recarga.novosEventos,1);
 assert.equal(recarga.eventosNoCiclo,1);
 for(let i=0;i<5;i++){
  const p=await x.criarPedido({nome:'integracaoVerde',preco:25000,cliente:x.outro});
  const confirmado=await x.pedidosIntegrados.confirmarPagamento({pedidoId:p.pedidoId});
  assert.equal(confirmado.integracaoInternaEnsaio.novasPosicoes,1);
 }
 assert.equal(x.integracao.consultar().eventosNoCiclo,6);
 assert.equal(catraca.executarGiro().girou,true);
 assert.equal(x.motor.verificar().giros,2);
 assert.equal(x.producao.verificar().promocoesEnsaio,12);
 assert.equal(x.evento.verificar().eventos,13);
 assert.equal(x.integracao.sincronizar().novosEventos,0);
 assert.equal(x.integracao.sincronizar().novasPosicoes,0);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
test('admin usa botoes conectados de integracao, cliente ve mesmo SQLite mas nao consegue acionar a ponte',async t=>{
 const x=await fixture(t);
 const origin='https://contas.example.invalid';
 const app=criarAppIdentidadeLoop({contas:x.contas,motorLoop:x.motor,
  eventosComerciais:x.evento,origemHttps:origin,permitirCadastro:true,
  adminComercial:{catalogo:x.catalogo,controle:x.controle,sessoes:x.sessoes,
   auditoria:x.auditoria,manutencao:x.manutencao,
   classificacaoLoop:x.classificacao,integradorComercialEnsaio:x.integracao}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const url=base+'/api/admin/loop/integracao';
 assert.equal((await fetch(url)).status,401);
 const login=await fetch(base+'/administrador/entrar',{
  method:'POST',redirect:'manual',
  headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({senha:'CredencialAdminSomenteEnsaios2026!Complexa'})
 });
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const pagina=await (await fetch(base+'/administrador',{headers:{Cookie:cookie}})).text();
 assert.match(pagina,/id="sincronizarComprasLoop"/);
 assert.match(pagina,/id="prepararTabuleiroLoop"/);
 const estado=await fetch(url,{headers:{Cookie:cookie}});
 assert.equal(estado.status,200);
 assert.equal((await estado.json()).enfileiradas,0);
 const token=await (await fetch(base+'/api/admin/comercial/sessao',{
  headers:{Cookie:cookie}
 })).json();
 assert.equal((await fetch(url,{method:'POST',
  headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({acao:'SINCRONIZAR'})})).status,403);
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json',
  'X-Loop-Admin-Csrf':token.csrfToken};
 x.produto({nome:'conexaoHTTPVerde',preco:25000});
 const pedido=await x.criarPedido({nome:'conexaoHTTPVerde',preco:25000});
 await x.confirmar(pedido);
 const resposta=await fetch(url,{method:'POST',headers,
  body:JSON.stringify({acao:'SINCRONIZAR'})});
 assert.equal(resposta.status,200);
 assert.equal((await resposta.json()).novasPosicoes,1);
 assert.equal(x.motor.consultar().filaB,1);
 assert.equal((await fetch(url,{method:'POST',headers,
  body:JSON.stringify({acao:'INVENTAR_VENDA'})})).status,400);
 const cliente=await fetch(base+'/api/contas/entrar',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Comprador',senha:'SenhaDeEnsaio2026!'})
 });
 const cookieCliente=cliente.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(url,{headers:{Cookie:cookieCliente}})).status,401);
 assert.equal((await fetch(url,{method:'POST',
  headers:{Cookie:cookieCliente,Origin:origin,
   'Content-Type':'application/json','X-Loop-Admin-Csrf':token.csrfToken},
  body:JSON.stringify({acao:'SINCRONIZAR'})})).status,401);
 const escritorio=await (await fetch(base+'/api/loop/estado',{
  headers:{Cookie:cookieCliente}
 })).json();
 assert.equal(escritorio.minhasPosicoes[0].pedidoDeOrigemEnsaio,pedido.pedidoId);
 assert.equal(escritorio.minhasPosicoes[0].local,'FILA_B');
 assert.equal(escritorio.minhasPosicoes[0].estadoAdesao,'PENDENTE');
 assert.equal(escritorio.catracaClientePodeGirar,false);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
test('estorno PSP integrado fica registrado individualmente sem parar novas compras',async t=>{
 const x=await fixture(t);
 x.produto({nome:'integradoEstorno',preco:25000});
 const p=await x.criarPedido({nome:'integradoEstorno',preco:25000});
 await x.pedidosIntegrados.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(x.motor.consultar().filaB,1);
 x.statusPsp.set(p.pedidoId,{status:'ESTORNADO'});
 const cancelado=await x.pedidosIntegrados.confirmarPagamento({pedidoId:p.pedidoId});
 assert.equal(cancelado.cancelado,true);
 assert.equal(cancelado.estornoLoopSinalizado,true);
 assert.equal(x.producao.verificar().reversoesEmQuarentena,1);
 const novo=await x.criarPedido({nome:'integradoEstorno',preco:25000,cliente:x.outro});
 const resposta=await x.pedidosIntegrados.confirmarPagamento({pedidoId:novo.pedidoId});
 assert.equal(resposta.integracaoInternaEnsaio.novasPosicoes,1);
 assert.equal(x.motor.consultar().filaB,1);
 assert.equal(x.integracao.consultar().estornadas,1);
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
