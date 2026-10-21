'use strict';
// Recuperacao interna e backup consistente apenas em bancos SQLite descartaveis.
// Falhas sao injetadas exclusivamente por triggers de teste, sem alterar o motor.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,copyFileSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const AGORA='2036-09-20T12:00:00.000Z';
const SENHA='senha-segura-de-laboratorio-2026';
const REF='LOOP-DEMO-V1';
const valor=(b,sql,...p)=>b.prepare(sql).get(...p).n;
function abrir(arquivo){
 const repositorio=new RepositorioCatalogoSQLite({caminho:arquivo});
 const banco=repositorio.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>AGORA});
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,
  relogio:()=>AGORA,consultarPagamentoConfiavel:async id=>{
   const p=pedidos.buscar(id);
   return p&&{...p,status:STATUS_CONFIRMADO,confirmadoEm:AGORA};
  }
 });
 return {repositorio,banco,contas,pedidos,ponte,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>AGORA}),
  saques:new SolicitacoesSaqueDemoSQLite({
   banco,contas,links:ponte.linksComissoes,relogio:()=>AGORA
  })};
}
function cadastrar(m,sufixo,codigoIndicador){
 return m.contas.cadastrar({
  nome:'Cliente Recuperacao '+sufixo,
  email:'recuperacao-'+sufixo+'@exemplo.invalid',
  senha:SENHA,...(codigoIndicador?{codigoIndicador}:{})
 });
}
function preparar(m,conta,id,qualificado=true){
 return m.pedidos.preparar({
  pedidoId:id,contaId:conta.contaId,
  produtoId:qualificado?'pdf-referencia-250':'produto-fisico-190',
  valorCentavos:qualificado?25000:19000
 });
}
function estado(m){
 const b=m.banco;
 return {
  pdf:valor(b,'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'),
  fisico:valor(b,'SELECT COUNT(*) AS n FROM admin_ponte_vendas_loja_sem_loop_demo'),
  vinculados:valor(b,'SELECT COUNT(*) AS n FROM admin_ponte_vinculos_identificados_demo'),
  referencias:valor(b,'SELECT COUNT(*) AS n FROM admin_ponte_posicoes_valores_demo'),
  posicoes:valor(b,'SELECT COUNT(DISTINCT posicao_id) AS n FROM admin_ponte_compras_demo'),
  bonificacoes:valor(b,'SELECT COALESCE(SUM(valor_centavos),0) AS n FROM admin_comissoes_reserva_v2_demo'),
  saques:valor(b,'SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo'),
  snapshot:m.banco.prepare('SELECT snapshot_json AS s FROM admin_ponte_estado_demo WHERE id=1').get()?.s??null
 };
}
function certificar(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const auditoria=auditarIntegridadeOperacionalDemo(m.ponte);
 assert.equal(auditoria.totalAlertas,0,JSON.stringify(auditoria.alertas));
}
function gatilho(m,nome,tabela,evento){
 m.banco.exec('CREATE TRIGGER '+nome+' BEFORE '+evento+' ON '+tabela+
  " BEGIN SELECT RAISE(ABORT,'FALHA_INTERNA_DE_TESTE'); END");
}
function tirarGatilho(m,nome){m.banco.exec('DROP TRIGGER IF EXISTS '+nome);}
function ativar(m,conta,posicaoId,cpf){
 return m.adesoes.ativar({
  contaId:conta.contaId,posicaoId,
  ...(cpf?{cpfFicticio:cpf,aceitaTermos:true,versaoTermos:REF}: {})
 });
}
function cofre(m){
 return disponibilidadeCofreDemo(m.banco,{
  cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000
 });
}

test('rollback dentro da compra PDF: vinculo, referencia e snapshot; recuperação após fechamento',{timeout:120000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-escritas-atomicas-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'compras.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const primeiro=cadastrar(m,'base');
 preparar(m,primeiro,'falha-base-pdf');
 assert.equal((await m.ponte.processar({pedidoId:'falha-base-pdf'})).criado,true);
 certificar(m);
 const pontos=[
  {nome:'injeta_vinculo_teste',tabela:'admin_ponte_vinculos_identificados_demo',evento:'INSERT',id:'falha-vinculo-pdf',pdf:true},
  {nome:'injeta_referencia_teste',tabela:'admin_ponte_posicoes_valores_demo',evento:'INSERT',id:'falha-referencia-pdf',pdf:true},
  {nome:'injeta_snapshot_teste',tabela:'admin_ponte_estado_demo',evento:'UPDATE',id:'falha-snapshot-pdf',pdf:true},
  {nome:'injeta_fisico_teste',tabela:'admin_ponte_vendas_loja_sem_loop_demo',evento:'INSERT',id:'falha-venda-fisica',pdf:false}
 ];
 let falhas=0,recuperadas=0;
 for(let i=0;i<pontos.length;i++){
  const ponto=pontos[i];
  const conta=cadastrar(m,'etapa-'+i);
  preparar(m,conta,ponto.id,ponto.pdf);
  const antes=estado(m);
  const comprasIdentificadas=valor(m.banco,
   'SELECT COUNT(*) AS n FROM admin_pedidos_titularidade_demo');
  gatilho(m,ponto.nome,ponto.tabela,ponto.evento);
  await assert.rejects(m.ponte.processar({pedidoId:ponto.id}),/FALHA_INTERNA_DE_TESTE/);
  falhas++;
  assert.deepEqual(estado(m),antes,'Rollback inteiro da ponte, inclusive snapshot');
  assert.equal(valor(m.banco,
   'SELECT COUNT(*) AS n FROM admin_pedidos_titularidade_demo'),comprasIdentificadas,
   'Pedido preparado antes da verificação permanece disponível para reprocessar');
  certificar(m);
  m.repositorio.fechar();
  m=abrir(arquivo);
  assert.deepEqual(estado(m),antes,'Falha não vira venda após reabrir banco');
  tirarGatilho(m,ponto.nome);
  assert.equal((await m.ponte.processar({pedidoId:ponto.id})).criado,true);
  assert.equal((await m.ponte.processar({pedidoId:ponto.id})).repetido,true);
  recuperadas++;
  certificar(m);
 }
 const fim=estado(m);
 assert.deepEqual([fim.pdf,fim.fisico,fim.posicoes,fim.vinculados,fim.referencias],
  [4,1,4,4,4]);
 console.log('LOOP_FALHAS_TRANSACAO='+JSON.stringify({
  injeçõesInternas:falhas,recuperacoesIdempotentes:recuperadas,
  comprasPDF:4,vendasFisicasSemPosicao:1,posicoes:4,
  integridade:'ok',saquesReais:false
 }));
});

test('saque: erro injetado no INSERT e posterior restauração sem débito adicional da reserva',{timeout:60000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-saque-rollback-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'financeiro.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const titular=cadastrar(m,'titular-saque');
 preparar(m,titular,'titular-pdf');
 const p=(await m.ponte.processar({pedidoId:'titular-pdf'})).posicaoId;
 ativar(m,titular,p,'11144477735');
 const indicado=cadastrar(m,'indicado-saque',titular.codigoConvite);
 preparar(m,indicado,'indicado-pdf');
 const q=(await m.ponte.processar({pedidoId:'indicado-pdf'})).posicaoId;
 ativar(m,indicado,q,'12345678909');
 assert.equal(estado(m).bonificacoes,2500);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,47500);
 const tentativa=()=>m.saques.registrar({
  contaId:titular.contaId,
  solicitacaoId:'saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  tipo:'BONUS',valorSolicitadoCentavos:2500
 });
 const antes=estado(m);
 gatilho(m,'injeta_saque_teste','admin_solicitacoes_saque_demo','INSERT');
 assert.throws(tentativa,/FALHA_INTERNA_DE_TESTE/);
 assert.deepEqual(estado(m),antes);
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,2500);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,47500);
 certificar(m);
 m.repositorio.fechar();
 m=abrir(arquivo);
 assert.deepEqual(estado(m),antes);
 tirarGatilho(m,'injeta_saque_teste');
 const solicitado=tentativa();
 assert.equal(solicitado.repetida,false);
 assert.equal(solicitado.valorLiquidoCentavos,2500);
 assert.equal(tentativa().repetida,true);
 assert.equal(estado(m).saques,1);
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,0);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,47500);
 certificar(m);
 console.log('LOOP_SAQUE_ROLLBACK='+JSON.stringify({
  solicitacoesConfirmadasNoLivro:1,duplicatasBloqueadas:1,
  saqueBrutoCentavos:2500,taxaCentavos:0,reservaLivreCentavos:47500,
  injeçõesDeFalha:1,integridade:'ok',transferenciaExecutada:false
 }));
});

test('VACUUM INTO em WAL: backup coerente durante escrita pendente, restauração e isolamento',{timeout:120000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-backup-wal-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const origem=path.join(pasta,'origem.sqlite');
 const backup=path.join(pasta,'backup-consistente.sqlite');
 const restaurado=path.join(pasta,'restaurado.sqlite');
 let m=abrir(origem);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const contas=[];
 for(let i=1;i<=24;i++){
  const conta=cadastrar(m,'backup-'+i);
  contas.push(conta);
  preparar(m,conta,'backup-'+i+'-pdf');
  preparar(m,conta,'backup-'+i+'-fisico',false);
  assert.equal((await m.ponte.processar({pedidoId:'backup-'+i+'-pdf'})).criado,true);
  assert.equal((await m.ponte.processar({pedidoId:'backup-'+i+'-fisico'})).criado,true);
 }
 const titular=cadastrar(m,'backup-titular');
 preparar(m,titular,'backup-titular-pdf');
 const p=(await m.ponte.processar({pedidoId:'backup-titular-pdf'})).posicaoId;
 ativar(m,titular,p,'11144477735');
 const indicado=cadastrar(m,'backup-indicado',titular.codigoConvite);
 preparar(m,indicado,'backup-indicado-pdf');
 const q=(await m.ponte.processar({pedidoId:'backup-indicado-pdf'})).posicaoId;
 ativar(m,indicado,q,'12345678909');
 const idSaque='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 assert.equal(m.saques.registrar({contaId:titular.contaId,
  solicitacaoId:idSaque,tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,false);
 assert.equal(cofre(m).saldoLivreDemonstrativoCentavos,47500);
 certificar(m);
 const antes=estado(m);
 assert.deepEqual([antes.pdf,antes.fisico,antes.posicoes,antes.bonificacoes,antes.saques],
  [26,24,26,2500,1]);
 // A segunda conexão tem uma escrita aberta; o backup deve conter apenas
 // registros COMMITados e nao pode incorporar a linha ainda pendente.
 m.banco.exec('CREATE TABLE IF NOT EXISTS stress_backup_probe(id TEXT PRIMARY KEY)');
 const concorrente=new DatabaseSync(origem);
 try{
  concorrente.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;');
  concorrente.prepare('INSERT INTO stress_backup_probe(id) VALUES(?)').run('nao-confirmada');
  m.banco.prepare('VACUUM INTO ?').run(backup);
  assert.equal(valor(m.banco,'SELECT COUNT(*) AS n FROM stress_backup_probe'),0);
  concorrente.exec('ROLLBACK');
 }finally{
  if(concorrente.isTransaction)concorrente.exec('ROLLBACK');
  concorrente.close();
 }
 // Copia offline SOMENTE do arquivo produzido por VACUUM INTO, nunca do DB vivo.
 copyFileSync(backup,restaurado);
 const r=abrir(restaurado);
 try{
  assert.deepEqual(estado(r),antes);
  assert.equal(valor(r.banco,'SELECT COUNT(*) AS n FROM stress_backup_probe'),0);
  assert.equal(r.saques.consultar(titular.contaId).historico.length,1);
  assert.equal(r.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,0);
  assert.equal(cofre(r).saldoLivreDemonstrativoCentavos,47500);
  certificar(r);
  assert.equal((await r.ponte.processar({pedidoId:'backup-1-pdf'})).repetido,true);
  assert.equal(r.saques.registrar({contaId:titular.contaId,
   solicitacaoId:idSaque,tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,true);
  assert.deepEqual(estado(r),antes,'Reprocessar eventos já persistidos não muda o backup');
 }finally{r.repositorio.fechar();}
 // Fonte continua aceitando pedidos: o backup segue um retrato, não espelho.
 const novo=cadastrar(m,'apos-backup');
 preparar(m,novo,'depois-backup-pdf');
 assert.equal((await m.ponte.processar({pedidoId:'depois-backup-pdf'})).criado,true);
 assert.equal(estado(m).pdf,27);
 m.repositorio.fechar();
 m=abrir(origem);
 assert.equal(estado(m).pdf,27);
 const r2=abrir(restaurado);
 try{
  assert.deepEqual(estado(r2),antes);
  certificar(r2);
  assert.equal(cofre(r2).saldoLivreDemonstrativoCentavos,47500);
 }finally{r2.repositorio.fechar();}
 certificar(m);
 console.log('LOOP_BACKUP_WAL='+JSON.stringify({
  vendasNoBackup:50,posicoesNoBackup:26,
  bonusProvisionadoCentavos:2500,saquesFicticiosNoBackup:1,
  restauracaoIntegra:true,escritaPendenteExcluida:true,
  posicoesNovasApenasNaOrigem:1,replayIdempotente:true,
  metodo:'VACUUM INTO',integridade:'ok',dadosBancariosReais:false
 }));
});
