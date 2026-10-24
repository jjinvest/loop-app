'use strict';
// Laboratorio: processo SIGKILL ocorre APOS a escrita real de cada etapa do
// dominio e ANTES de COMMIT, sem modificar o codigo do LOOP ou habilitar PSP.
// Backup so pode ser restaurado apos hash, tamanho e PRAGMA verificarem.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtempSync,rmSync,readFileSync,writeFileSync,copyFileSync,statSync}=require('node:fs');
const {createHash}=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const AGORA='2036-09-20T12:00:00.000Z';
const SENHA='senha-segura-de-laboratorio-2026';
const REFERENCIA='LOOP-DEMO-V1';
const ID_SAQUE='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const numero=(b,sql,...args)=>b.prepare(sql).get(...args).n;
function abrir(arquivo){
 const repositorio=new RepositorioCatalogoSQLite({caminho:arquivo});
 const banco=repositorio.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>AGORA});
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,pedidosIdentificados:pedidos,
  atribuicaoManualPorPosicao:true,relogio:()=>AGORA,
  consultarPagamentoConfiavel:async id=>{
   const pedido=pedidos.buscar(id);
   return pedido&&{...pedido,status:STATUS_CONFIRMADO,confirmadoEm:AGORA};
  }});
 return {repositorio,banco,contas,pedidos,ponte,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>AGORA}),
  saques:new SolicitacoesSaqueDemoSQLite({
   banco,contas,links:ponte.linksComissoes,relogio:()=>AGORA})};
}
function conta(m,n,indicador){
 return m.contas.cadastrar({
  nome:'Cliente SIGKILL '+n,email:'sigkill-'+n+'@exemplo.invalid',
  senha:SENHA,...(indicador?{codigoIndicador:indicador}:{})
 });
}
function preparar(m,titular,id){
 m.pedidos.preparar({pedidoId:id,contaId:titular.contaId,
  produtoId:'pdf-referencia-250',valorCentavos:25000});
}
function contagem(m){
 return {
  pedidos:numero(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'),
  vinculos:numero(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_vinculos_identificados_demo'),
  referencias:numero(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_posicoes_valores_demo'),
  saques:numero(m.banco,'SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo'),
  bonus:numero(m.banco,'SELECT COALESCE(SUM(valor_centavos),0) AS n FROM admin_comissoes_reserva_v2_demo'),
  snapshot:m.banco.prepare('SELECT snapshot_json AS j FROM admin_ponte_estado_demo WHERE id=1').get()?.j??null
 };
}
function integridade(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
}
function instalarInterrupcao(db,ponto){
 const frases={
  compra:'INSERT INTO ADMIN_PONTE_COMPRAS_DEMO',
  referencia:'INSERT INTO ADMIN_PONTE_POSICOES_VALORES_DEMO',
  snapshot:'INSERT INTO ADMIN_PONTE_ESTADO_DEMO',
  saque:'INSERT INTO ADMIN_SOLICITACOES_SAQUE_DEMO'
 };
 const alvo=frases[ponto];
 if(!alvo)throw new Error('Ponto de injecao desconhecido');
 const original=db.prepare.bind(db);
 db.prepare=function(sql){
  const st=original(sql);
  const normalizado=String(sql).replace(/\s+/g,' ').trim().toUpperCase();
  if(!normalizado.includes(alvo))return st;
  return new Proxy(st,{
   get(obj,chave){
    if(chave==='run')return (...args)=>{
     const retorno=obj.run(...args);
     // Escrita SQLite concluida dentro da transacao da ponte, SEM COMMIT.
     process.kill(process.pid,'SIGKILL');
     return retorno;
    };
    return Reflect.get(obj,chave,obj);
   }
  });
 };
}
if(process.argv[2]==='--kill-sqlite'){
 const [,,_,arquivo,ponto,pedidoId,contaId]=process.argv;
 try{
  const m=abrir(arquivo);
  instalarInterrupcao(m.banco,ponto);
  process.send({ready:true},async ()=>{
   try{
    if(ponto==='saque'){
     m.saques.registrar({contaId,solicitacaoId:ID_SAQUE,
      tipo:'BONUS',valorSolicitadoCentavos:2500});
    }else{
     await m.ponte.processar({pedidoId});
    }
    process.send({unexpectedCommit:true},()=>process.exit(2));
   }catch(e){
    process.send({error:e.message,stack:e.stack},()=>process.exit(1));
   }
  });
 }catch(e){
  process.send?.({error:e.message,stack:e.stack},()=>process.exit(1));
 }
}else{
 async function derrubar(arquivo,ponto,pedidoId='',contaId=''){
  const filho=spawn(process.execPath,[__filename,'--kill-sqlite',arquivo,ponto,pedidoId,contaId],{
   stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,LOOP_LAB_SIGKILL_SQLITE:'1'}
  });
  let erro='';
  filho.stderr.on('data',d=>{erro+=String(d).slice(0,1000)});
  filho.stdout.on('data',()=>{});
  const [sinal]=await once(filho,'message');
  assert.equal(sinal.ready,true,JSON.stringify(sinal)+' '+erro);
  const [codigo,signal]=await once(filho,'exit');
  assert.equal(codigo,null,erro);
  assert.equal(signal,'SIGKILL','A interrupcao ocorreu antes do COMMIT');
 }

 test('SIGKILL dentro da ponte: compra, referencia e snapshot reabrem sem registros parciais',
  {timeout:120000},async t=>{
   const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-sigkill-ponte-'));
   t.after(()=>rmSync(pasta,{recursive:true,force:true}));
   const arquivo=path.join(pasta,'compras.sqlite');
   let m=abrir(arquivo);
   t.after(()=>{try{m.repositorio.fechar()}catch{}});
   const inicial=conta(m,'inicial');
   preparar(m,inicial,'sigkill-base');
   assert.equal((await m.ponte.processar({pedidoId:'sigkill-base'})).criado,true);
   for(const [i,ponto] of ['compra','referencia','snapshot'].entries()){
    const p=conta(m,'interrompido-'+i);
    const pedidoId='sigkill-'+ponto;
    preparar(m,p,pedidoId);
    const anterior=contagem(m);
    m.repositorio.fechar();
    await derrubar(arquivo,ponto,pedidoId);
    m=abrir(arquivo);
    assert.deepEqual(contagem(m),anterior,'Nenhum lancamento parcial apos '+ponto);
    integridade(m);
    assert.equal((await m.ponte.processar({pedidoId})).criado,true);
    assert.equal((await m.ponte.processar({pedidoId})).repetido,true);
    integridade(m);
   }
   assert.equal(contagem(m).pedidos,4);
   assert.equal(contagem(m).vinculos,4);
   assert.equal(contagem(m).referencias,4);
   console.log('LOOP_SIGKILL_COMPRA='+JSON.stringify({
    interrupcoesInternas:3,pontos:['compra','referencia','snapshot'],
    pedidosRecuperados:3,pedidosNoFinal:4,posicoesNoFinal:4,
    vendasParciais:0,duplicacoes:0,sqliteIntegridade:'ok',pspReal:false
   }));
  });

 test('SIGKILL apos INSERT de saque e antes do COMMIT: bonus integral, taxa 0% e reserva intacta',
  {timeout:90000},async t=>{
   const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-sigkill-saque-'));
   t.after(()=>rmSync(pasta,{recursive:true,force:true}));
   const arquivo=path.join(pasta,'saques.sqlite');
   let m=abrir(arquivo);
   t.after(()=>{try{m.repositorio.fechar()}catch{}});
   const titular=conta(m,'saque-titular');
   preparar(m,titular,'sigkill-titular');
   const p=(await m.ponte.processar({pedidoId:'sigkill-titular'})).posicaoId;
   m.adesoes.ativar({contaId:titular.contaId,posicaoId:p,
    cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:REFERENCIA});
   const indicado=conta(m,'saque-indicado',titular.codigoConvite);
   preparar(m,indicado,'sigkill-indicado');
   const q=(await m.ponte.processar({pedidoId:'sigkill-indicado'})).posicaoId;
   m.adesoes.ativar({contaId:indicado.contaId,posicaoId:q,
    cpfFicticio:'12345678909',aceitaTermos:true,versaoTermos:REFERENCIA});
   const antes=contagem(m);
   assert.equal(antes.bonus,2500);
   m.repositorio.fechar();
   await derrubar(arquivo,'saque','',titular.contaId);
   m=abrir(arquivo);
   assert.deepEqual(contagem(m),antes);
   assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,2500);
   const registrar=()=>m.saques.registrar({contaId:titular.contaId,
    solicitacaoId:ID_SAQUE,tipo:'BONUS',valorSolicitadoCentavos:2500});
   const aceito=registrar();
   assert.equal(aceito.repetida,false);
   assert.equal(aceito.taxaPercentual,0);
   assert.equal(aceito.taxaSaqueCentavos,0);
   assert.equal(aceito.valorLiquidoCentavos,2500);
   assert.equal(registrar().repetida,true);
   assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,0);
   const caixa=disponibilidadeCofreDemo(m.banco,{
    cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000});
   assert.equal(caixa.compromissoBonificacoesCentavos,2500);
   assert.equal(caixa.saldoLivreDemonstrativoCentavos,47500);
   integridade(m);
   console.log('LOOP_SIGKILL_SAQUE='+JSON.stringify({
    interrupcoesDentroDoInsert:1,saquesPersistidos:1,
    brutoCentavos:2500,tarifaParticipanteCentavos:0,liquidoCentavos:2500,
    livreReservaSimuladaCentavos:47500,duplicacoes:0,sqliteIntegridade:'ok',
    transferenciaReal:false
   }));
  });

 const hash=arquivo=>createHash('sha256').update(readFileSync(arquivo)).digest('hex');
 function manifesto(arquivo){
  return {bytes:statSync(arquivo).size,sha256:hash(arquivo)};
 }
 function validarImagem(arquivo,esperado){
  if(!esperado||statSync(arquivo).size!==esperado.bytes||
   hash(arquivo)!==esperado.sha256)
   throw new Error('BACKUP_HASH_OU_TAMANHO_DIVERGENTE');
  const b=new DatabaseSync(arquivo,{readOnly:true});
  try{
   if(Object.values(b.prepare('PRAGMA integrity_check').get())[0]!=='ok'||
    b.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('BACKUP_SQLITE_INTEGRO_NAO_CONFIRMADO');
  }finally{b.close();}
 }
 test('backup com hash: recusa adulterado e truncado, restaura copia valida e preserva original',
  {timeout:90000},async t=>{
   const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-backup-hash-'));
   t.after(()=>rmSync(pasta,{recursive:true,force:true}));
   const origem=path.join(pasta,'origem.sqlite'),backup=path.join(pasta,'backup.sqlite');
   const restaurado=path.join(pasta,'restaurado.sqlite');
   let m=abrir(origem);
   t.after(()=>{try{m.repositorio.fechar()}catch{}});
   for(let i=0;i<12;i++){
    const cliente=conta(m,'backup-'+i);
    const pedidoId='backup-check-'+i;
    preparar(m,cliente,pedidoId);
    assert.equal((await m.ponte.processar({pedidoId})).criado,true);
   }
   const referencia=contagem(m);
   assert.equal(referencia.pedidos,12);
   m.banco.prepare('VACUUM INTO ?').run(backup);
   const selo=manifesto(backup);
   validarImagem(backup,selo);
   const dados=readFileSync(backup);
   const alterado=Buffer.from(dados);
   alterado[Math.floor(alterado.length/2)]^=0x55;
   const arquivoAdulterado=path.join(pasta,'adulterado.sqlite');
   writeFileSync(arquivoAdulterado,alterado);
   assert.throws(()=>validarImagem(arquivoAdulterado,selo),
    /BACKUP_HASH_OU_TAMANHO_DIVERGENTE/);
   const truncado=path.join(pasta,'truncado.sqlite');
   writeFileSync(truncado,dados.subarray(0,Math.floor(dados.length/2)));
   assert.throws(()=>validarImagem(truncado,selo),
    /BACKUP_HASH_OU_TAMANHO_DIVERGENTE/);
   // Restaurar somente imagem validada, nunca arquivo arbitrario.
   validarImagem(backup,selo);
   copyFileSync(backup,restaurado);
   validarImagem(restaurado,selo);
   const copia=abrir(restaurado);
   try{
    assert.deepEqual(contagem(copia),referencia);
    integridade(copia);
    assert.equal((await copia.ponte.processar({pedidoId:'backup-check-0'})).repetido,true);
    assert.deepEqual(contagem(copia),referencia);
   }finally{copia.repositorio.fechar();}
   assert.deepEqual(contagem(m),referencia);
   integridade(m);
   console.log('LOOP_BACKUP_HASH='+JSON.stringify({
    comprasRestauradas:12,imagensInvalidasRecusadas:2,
    copiaVerificadaAntesDeAbrir:true,hash:'SHA-256',
    originalIntacto:true,restauracaoConsistente:true,
    integridade:'ok',backupOffsite:false
   }));
  });
}