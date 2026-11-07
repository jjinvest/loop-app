'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
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
const {validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const TEXTO='Consentimento fictício somente para prova técnica de recuperação. '+
 'Cadastro de identidade do Escritório LOOP e AKITEMM sem dinheiro nem posições reais.';
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-backup-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const backup=path.join(pasta,'identidade.looprealbak');
 const restauro=path.join(pasta,'restaurado.sqlite');
 const segredos={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const chaveBackup=randomBytes(32);
 const emails=[];
 const opcoes={...segredos,
  termos:{versao:'LOOP-TESTE-CONSENT-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-TESTE-PRIV-2026',texto:TEXTO},
  enviarEmail:async x=>{emails.push(x);return true;}
 };
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON');
 const identidade=new IdentidadeClienteLoopReal({...opcoes,banco});
 return {pasta,arquivo,backup,restauro,chaveBackup,opcoes,banco,
  identidade,emails};
}
async function cadastrar(x,nick,email){
 const d=x.identidade.documentos();
 return x.identidade.cadastrar({
  nome:nick+' Exemplo',nick,email,senha:'SenhaFicticiaRobusta2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,
  hashPrivacidade:d.privacidade.hash
 });
}
test('snapshot cifrado do SQLite WAL e restauração isolada preservam contas e revogam cookies',async t=>{
 const x=fixture(t);
 const a=await cadastrar(x,'Ana','ana@example.invalid');
 await cadastrar(x,'Bia','bia@example.invalid');
 const sessao=await x.identidade.entrar({
  nick:'Ana',senha:'SenhaFicticiaRobusta2026!'
 });
 assert.equal(sessao.titularId,a.titularId);
 await x.identidade.solicitarCodigo({
  titularId:a.titularId,finalidade:'EMAIL'
 });
 assert.equal(x.emails.length,1);
 const relatorio=await criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(relatorio.estado,'IDENTIDADE_REAL_BACKUP_LOCAL_CIFRADO');
 assert.equal(relatorio.contas,2);
 assert.equal(relatorio.copiaOffsiteConfirmada,false);
 assert.equal(relatorio.backupFinanceiroConfirmado,false);
 assert.equal(fs.statSync(x.backup).mode&0o777,0o600);
 const bin=fs.readFileSync(x.backup);
 assert.equal(bin.includes(Buffer.from('ana@example.invalid')),false);
 assert.equal(bin.includes(Buffer.from('SQLite format 3')),false);
 assert.equal(bin.includes(Buffer.from('SenhaFicticiaRobusta2026!')),false);
 const restaurado=await restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,chaveBackup:x.chaveBackup,
  autorizado:true
 });
 assert.equal(restaurado.contas,2);
 assert.equal(restaurado.sessoesRevogadas,1);
 assert.equal(restaurado.codigosInvalidados,1);
 assert.equal(restaurado.comprovacaoOffsite,false);
 assert.equal(fs.statSync(x.restauro).mode&0o777,0o600);
 const banco2=new DatabaseSync(x.restauro);
 banco2.exec('PRAGMA foreign_keys=ON');
 const conta2=new IdentidadeClienteLoopReal({...x.opcoes,banco:banco2});
 assert.equal(conta2.sessao(sessao.token),null);
 await assert.rejects(conta2.confirmarCodigo({
  titularId:a.titularId,finalidade:'EMAIL',codigo:x.emails[0].codigo
 }),{codigo:'CODIGO_INVALIDO'});
 const login2=await conta2.entrar({nick:'Ana',senha:'SenhaFicticiaRobusta2026!'});
 assert.equal(login2.titularId,a.titularId);
 assert.equal(conta2.dadosTitular(a.titularId).email,'ana@example.invalid');
 assert.equal(validarIdentidade(x.restauro).integridade,'ok');
 banco2.close();
 x.banco.close();
});
test('backup não sobrescreve arquivo; segredo errado ou conteúdo adulterado não gera restauração',async t=>{
 const x=fixture(t);
 await cadastrar(x,'Ana','ana@example.invalid');
 const opts={origem:x.arquivo,destino:x.backup,
  chaveBackup:x.chaveBackup,autorizado:true};
 await criarBackupIdentidadeReal(opts);
 await assert.rejects(criarBackupIdentidadeReal(opts),
  {codigo:'DESTINO_BACKUP_REAL_JA_EXISTE'});
 const errado=path.join(x.pasta,'segredo-invalido.sqlite');
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:x.backup,destino:errado,chaveBackup:randomBytes(32),autorizado:true
 }),{codigo:'RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA'});
 assert.equal(fs.existsSync(errado),false);
 const bad=path.join(x.pasta,'corrompido.looprealbak');
 const buf=fs.readFileSync(x.backup);
 buf[Math.floor(buf.length/2)]^=0x7f;
 fs.writeFileSync(bad,buf);
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:bad,destino:errado,chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA'});
 assert.equal(fs.existsSync(errado),false);
 fs.writeFileSync(x.restauro,'NAO_APAGAR');
 await assert.rejects(restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,
  chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'DESTINO_BACKUP_REAL_JA_EXISTE'});
 assert.equal(fs.readFileSync(x.restauro,'utf8'),'NAO_APAGAR');
 x.banco.close();
});
test('não executar backup de identidade isolado se contém tabelas de pedidos comerciais',async t=>{
 const x=fixture(t);
 await cadastrar(x,'Ana','ana@example.invalid');
 x.banco.exec('CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY)');
 assert.throws(()=>validarIdentidade(x.arquivo),
  {codigo:'BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS'});
 await assert.rejects(criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS'});
 assert.equal(fs.existsSync(x.backup),false);
 x.banco.close();
});

test('backup preserva catálogo, custos e auditoria íntegra, mas revoga sessão do admin',async t=>{
 const x=fixture(t);
 await cadastrar(x,'Ana','ana@example.invalid');
 const chaveAuditoria=randomBytes(32),chaveAdmin=randomBytes(32);
 const credencialAdmin='CredencialAdminForteSomenteTeste2026!NaoUsar';
 const trilha=new AuditoriaOperacionalSQLite({
  banco:x.banco,chaveAuditoria
 });
 const manutencao=new ManutencaoComercialSQLite({
  banco:x.banco,auditoria:trilha
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:x.banco,distribuidorHomologado:()=>false,
  auditoria:trilha,manutencao
 });
 const custos=new ControleEconomicoLojaSQLite({
  banco:x.banco,auditoria:trilha,manutencao
 });
 const sessoes=new SessaoAdminComercialSQLite({
  banco:x.banco,chaveAdmin,credencialAdmin
 });
 const sessao=sessoes.autenticar(credencialAdmin);
 catalogo.criarProduto({produtoId:'p01',titulo:'Produto um'});
 catalogo.vincularOferta({produtoId:'p01',distribuidorId:'dist01',
  sku:'SKU01',precoUnitCentavos:19000});
 custos.definirCusto({produtoId:'p01',distribuidorId:'dist01',
  custoUnitCentavos:12500});
 custos.atualizarPrecoVenda({produtoId:'p01',distribuidorId:'dist01',
  precoAnteriorCentavos:19000,precoVendaCentavos:19900,
  revisaoPrecoEsperada:0});
 assert.equal(trilha.verificar().total,4);
 manutencao.alterar({suspensa:true,revisaoEsperada:0,
  motivo:'CORRECAO_TECNICA'});
 assert.equal(trilha.verificar().total,5);
 assert.equal(validarIdentidade(x.arquivo).administracaoIncluida,true);
 const feito=await criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,
  chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(feito.administracaoIncluida,true);
 const restore=await restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,
  chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(restore.sessoesAdminRevogadas,1);
 assert.equal(validarIdentidade(x.restauro).administracaoIncluida,true);
 const bd=new DatabaseSync(x.restauro);
 bd.exec('PRAGMA foreign_keys=ON');
 const reaberta=new AuditoriaOperacionalSQLite({
  banco:bd,chaveAuditoria
 });
 assert.equal(reaberta.verificar().total,5);
 const restaurada=new ManutencaoComercialSQLite({
  banco:bd,auditoria:reaberta
 });
 assert.equal(restaurada.estado().suspensa,true);
 assert.equal(restaurada.estado().revisao,1);
 const c=new ControleEconomicoLojaSQLite({
  banco:bd,auditoria:reaberta,manutencao:restaurada
 });
 const item=c.consultarOferta({produtoId:'p01',distribuidorId:'dist01'});
 assert.equal(item.precoVendaCentavos,19900);
 assert.equal(item.custoFornecedorCentavos,12500);
 assert.throws(()=>c.definirCusto({
  produtoId:'p01',distribuidorId:'dist01',
  custoUnitCentavos:11000,revisaoEsperada:1
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 const admin2=new SessaoAdminComercialSQLite({
  banco:bd,chaveAdmin,credencialAdmin
 });
 assert.equal(admin2.sessao(sessao.token),null);
 bd.close();
 x.banco.close();
});


const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {PedidosFornecedorOutbox}=
 require('../src/producao/pedidos-fornecedor-outbox');
const ENDERECO_BACKUP={destinatario:'Cliente Homologacao',cep:'27250010',
 logradouro:'Rua Teste',numero:'10',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};
async function montarPedidoComRemessa(x){
 const ana=await cadastrar(x,'Ana','ana@backup.invalid');
 // Teste restrito ao SQLite, simulando e-mail já verificado.
 x.banco.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
  .run(Date.now(),ana.titularId);
 const chavePedidos=randomBytes(32),chaveOutbox=randomBytes(32);
 const cotacao={cotacaoId:'COT_BACKUP_01',titularId:ana.titularId,
  cepDestino:ENDERECO_BACKUP.cep,status:'APROVADA',
  expiraEm:Date.now()+600000,
  grupos:[{fornecedorId:'DISTRIBUIDOR_A',freteCentavos:700,
   itens:[{sku:'SKU_BACKUP',quantidade:1,precoUnitCentavos:25000}]}]};
 const prova=({pedidoId})=>({pedidoId,status:'CONFIRMADO',moeda:'BRL',
  pagamentoId:'PAGAMENTO_BACKUP_01',valorCentavos:25700});
 const pedidos=new PedidosComerciaisSQLite({
  banco:x.banco,chavePedidos,
  consultarCotacaoConfiavel:async()=>cotacao,
  consultarPagamentoPsp:async args=>prova(args)
 });
 const pedido=await pedidos.criarPedido({
  titularId:ana.titularId,cotacaoId:cotacao.cotacaoId,
  chaveIdempotencia:'BACKUP_IDEMPOTENTE_01',
  enderecoEntrega:ENDERECO_BACKUP
 });
 await pedidos.confirmarPagamento({pedidoId:pedido.pedidoId});
 const outbox=new PedidosFornecedorOutbox({
  banco:x.banco,chavePedidos:chaveOutbox,
  registro:{obter:()=>({
   enviarPedidoIdempotente:async()=>{throw Error('NAO_ENVIAR');},
   consultarPedidoPorChave:async()=>({encontrado:false})
  })},
  consultarPagamentoConciliado:async args=>prova(args),
  consultarPedidoAprovado:args=>pedidos.consultarPedidoAprovado(args),
  consultarLiberacaoCustoFornecedor:async()=>null
 });
 await outbox.registrarPagamentoConciliado({
  pedidoId:pedido.pedidoId,fornecedorId:'DISTRIBUIDOR_A'
 });
 x.banco.prepare([
  "UPDATE loja_real_outbox_fornecedor SET estado='INDETERMINADO'",
  'WHERE pedido_id=?'
 ].join(' ')).run(pedido.pedidoId);
 return {ana,pedido,pedidos,outbox,chavePedidos,chaveOutbox,
  cotacao,prova};
}
test('backup único restaura pedido, custo congelado e outbox indeterminada sem reenviar fornecedor',async t=>{
 const x=fixture(t),m=await montarPedidoComRemessa(x);
 const antes=validarIdentidade(x.arquivo);
 assert.equal(antes.recuperacaoComercialIncluida,true);
 assert.equal(antes.pedidos,1);
 assert.equal(antes.linhasCustos,1);
 assert.equal(antes.remessas,1);
 const backup=await criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,
  chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(backup.pedidos,1);
 assert.equal(backup.remessas,1);
 assert.equal(backup.backupFinanceiroConfirmado,false);
 const restaurado=await restaurarBackupIdentidadeReal({
  origem:x.backup,destino:x.restauro,
  chaveBackup:x.chaveBackup,autorizado:true
 });
 assert.equal(restaurado.recuperacaoComercialIncluida,true);
 assert.equal(restaurado.pedidos,1);
 assert.equal(restaurado.remessas,1);
 const db=new DatabaseSync(x.restauro);
 db.exec('PRAGMA foreign_keys=ON');
 const reabertos=new PedidosComerciaisSQLite({
  banco:db,chavePedidos:m.chavePedidos,
  consultarCotacaoConfiavel:async()=>m.cotacao,
  consultarPagamentoPsp:async args=>m.prova(args)
 });
 const r=reabertos.consultarDoTitular({
  pedidoId:m.pedido.pedidoId,titularId:m.ana.titularId
 });
 assert.equal(r.status,'APROVADO_PARA_EXPEDICAO');
 assert.equal(r.valorTotalCentavos,25700);
 assert.equal(reabertos.listarResumoContabil()[0].receitaProdutosCentavos,25000);
 const pendente=db.prepare(
  'SELECT estado FROM loja_real_outbox_fornecedor WHERE pedido_id=?'
 ).get(m.pedido.pedidoId);
 assert.equal(pendente.estado,'INDETERMINADO');
 const outbox=new PedidosFornecedorOutbox({
  banco:db,chavePedidos:m.chaveOutbox,
  registro:{obter:()=>({consultarPedidoPorChave:async()=>({encontrado:false})})},
  consultarPagamentoConciliado:async args=>m.prova(args),
  consultarPedidoAprovado:args=>reabertos.consultarPedidoAprovado(args),
  consultarLiberacaoCustoFornecedor:async()=>null
 });
 const revisao=await outbox.reconciliar({
  pedidoId:m.pedido.pedidoId,fornecedorId:'DISTRIBUIDOR_A'
 });
 assert.equal(revisao.estado,'INDETERMINADO',
  'uma falha anterior não dispara POST durante recuperação');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 db.close();x.banco.close();
});
test('backup bloqueia pedido com valor histórico adulterado mesmo com SQLite íntegro',async t=>{
 const x=fixture(t),m=await montarPedidoComRemessa(x);
 x.banco.exec('DROP TRIGGER loja_real_custos_pedido_inalteravel_u');
 x.banco.prepare([
  'UPDATE loja_real_custos_pedido SET preco_unit_centavos=100',
  'WHERE pedido_id=?'
 ].join(' ')).run(m.pedido.pedidoId);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(x.banco.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>validarIdentidade(x.arquivo),
  {codigo:'BACKUP_COMERCIAL_PEDIDO_CUSTO_DIVERGENTE'});
 await assert.rejects(criarBackupIdentidadeReal({
  origem:x.arquivo,destino:x.backup,
  chaveBackup:x.chaveBackup,autorizado:true
 }),{codigo:'BACKUP_COMERCIAL_PEDIDO_CUSTO_DIVERGENTE'});
 assert.equal(fs.existsSync(x.backup),false);
 x.banco.close();
});
test('backup rejeita outbox vinculada a pagamento de outro pedido e preserva revisão manual',async t=>{
 const x=fixture(t),m=await montarPedidoComRemessa(x);
 x.banco.prepare('UPDATE loja_real_outbox_fornecedor SET pagamento_id=? WHERE pedido_id=?')
  .run('PAGAMENTO_FALSO',m.pedido.pedidoId);
 assert.equal(x.banco.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.throws(()=>validarIdentidade(x.arquivo),
  {codigo:'BACKUP_COMERCIAL_OUTBOX_DIVERGENTE'});
 assert.equal(fs.existsSync(x.backup),false);
 x.banco.close();
});

const {enviarBackupOffsiteIdentidade}=
 require('../src/producao/backup-identidade-offsite');
test('offsite comercial só confirma restauração quando as chaves leem pedido e remessa',async t=>{
 const x=fixture(t),m=await montarPedidoComRemessa(x);
 const config={endpoint:'https://bucket.storageapi.dev',
  bucket:'loop-clientes-private-2026',accessKeyId:'CHAVE_DE_TESTE_PUBLICA',
  secretAccessKey:'SegredoFicticioNaoUsarEmProducao1234567890',region:'auto'};
 const chaves={chaveEmail:x.opcoes.chaveEmail,
  chaveCifra:x.opcoes.chaveCifra,chaveCodigo:x.opcoes.chaveCodigo,
  chavePedidos:m.chavePedidos,chaveOutbox:m.chaveOutbox};
 let remoto=null,puts=0,gets=0;
 const buscar=async(_url,args)=>{
  if(args.method==='PUT'){
   puts++;const b=[];for await(const p of args.body)b.push(p);
   remoto=Buffer.concat(b);return new Response(null,{status:200});
  }
  gets++;
  return new Response(remoto,{status:200});
 };
 const opts={fonteSqlite:x.arquivo,chaveBackup:x.chaveBackup,config,
  buscar,agora:()=>new Date('2026-11-07T08:00:00Z'),
  id:()=>'01234567-89ab-4cde-8fab-0123456789ab',
  exigirProvaChaves:true,chavesRecuperacao:chaves};
 await assert.rejects(enviarBackupOffsiteIdentidade({
  ...opts,chavesRecuperacao:{...chaves,chaveOutbox:null}
 }),{codigo:'RECUPERACAO_CHAVE_COMERCIAL_AUSENTE'});
 await assert.rejects(enviarBackupOffsiteIdentidade({
  ...opts,chavesRecuperacao:{...chaves,chavePedidos:randomBytes(32)}
 }),{codigo:'RECUPERACAO_CIFRA_DIVERGENTE'});
 const prova=await enviarBackupOffsiteIdentidade(opts);
 assert.equal(prova.chavesDeLeituraVerificadas,true);
 assert.equal(prova.recuperacaoComercialIncluida,true);
 assert.equal(prova.pedidos,1);
 assert.equal(prova.linhasCustos,1);
 assert.equal(prova.remessas,1);
 assert.equal(prova.conciliacaoPspBancoComprovada,false);
 assert.equal(prova.custodiaExternaIndependenteComprovada,false);
 assert.equal(prova.backupFinanceiro,false);
 assert.equal(puts,3);assert.equal(gets,3);
 assert.equal(x.banco.prepare(
  'SELECT estado FROM loja_real_outbox_fornecedor WHERE pedido_id=?'
 ).get(m.pedido.pedidoId).estado,'INDETERMINADO');
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 x.banco.close();
});
