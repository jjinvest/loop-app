'use strict';
// Serviço REAL isolado. Não importar o app de homologação; não permitir
// primeiro cadastro sem documentação/Resend/volume próprios e GO humano.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {OperacaoCatracaAdminSQLite}=
 require('../src/producao/operacao-catraca-admin-sqlite');
const {PreflightCapacidadeCheckoutSQLite}=
 require('../src/producao/preflight-capacidade-checkout-sqlite');
const {RecuperacaoReservasCheckoutSQLite}=
 require('../src/producao/recuperacao-reservas-checkout-sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {criarTransporteEmailVerificacaoResend}=
 require('../src/adapters/email-verificacao-resend');
const {criarTransporteRecuperacaoResend}=
 require('../src/adapters/email-recuperacao-resend');
const {validarConfig:validarBackupS3,enviarBackupOffsiteIdentidade}=
 require('../src/producao/backup-identidade-offsite');
const {criarAgendadorBackupIdentidadeReal}=
 require('../src/producao/agendador-backup-identidade-real');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {montarComercialSemHomologacao,
 exigirChaveParaHistoricoComercial,criarLeituraCatalogoSeguro}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
function configurar(ambiente=process.env){
 if(ambiente.NODE_ENV!=='production'||ambiente.LOOP_REAL_CADASTRO_GO!=='SIM'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='SIM')
  throw Error('CADASTRO_REAL_BLOQUEADO_ATE_GO_FORMAL');
 if(ambiente.LOOP_CLIENTES_LAB==='SIM'||ambiente.LOOP_MODO_SIMULACAO==='1'||
    ambiente.LOOP_PREVIEW_EXCLUSIVO==='SIM')
  throw Error('LABORATORIO_INCOMPATIVEL_COM_CADASTRO_REAL');
 const arquivo=ambiente.LOOP_REAL_SQLITE;
 if(arquivo!=='/dados-reais/clientes.sqlite'||
    !fs.existsSync('/dados-reais')||
    fs.realpathSync('/dados-reais')!=='/dados-reais')
  throw Error('VOLUME_SQLITE_REAL_DEDICADO_OBRIGATORIO');
 const key=n=>{
  const s=ambiente[n];
  if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))
   throw Error('SEGREDO_REAL_NAO_CONFIGURADO_'+n);
  return Buffer.from(s,'hex');
 };
 const chaveEmail=key('LOOP_REAL_CHAVE_EMAIL');
 const chaveCifra=key('LOOP_REAL_CHAVE_CIFRA');
 const chaveCodigo=key('LOOP_REAL_CHAVE_CODIGO');
 // Não aceitar cadastro permanente sem cópia OFFSITE cifrada e restore
 // comprovado. Segredo do arquivo diferente das três chaves da conta.
 if(ambiente.LOOP_REAL_BACKUP_OFFSITE_AUTO!=='SIM')
  throw Error('BACKUP_OFFSITE_REAL_OBRIGATORIO');
 const chaveBackup=key('LOOP_REAL_CHAVE_BACKUP');
 // Operador real tem credencial independente, nunca reutiliza senha
 // do cliente ou o segredo da homologação.
 const chaveAdmin=key('LOOP_REAL_CHAVE_ADMIN');
 const chaveAuditoria=key('LOOP_REAL_CHAVE_AUDITORIA');
 // Chaves próprias para payloads comerciais: opcionais enquanto a respectiva
 // tabela está vazia; obrigatórias na prova do restore se houver registros.
 const keyComercial=n=>ambiente[n]===undefined?null:key(n);
 const chaveCotacoes=keyComercial('LOOP_REAL_CHAVE_COTACOES');
 const chavePedidos=keyComercial('LOOP_REAL_CHAVE_PEDIDOS');
 const chaveOutbox=keyComercial('LOOP_REAL_CHAVE_OUTBOX');
 const credencialAdmin=ambiente.LOOP_REAL_ADMIN_CREDENCIAL;
 if(typeof credencialAdmin!=='string'||
    credencialAdmin.length<24||credencialAdmin.length>256)
  throw Error('ADMIN_REAL_CREDENCIAL_NAO_CONFIGURADA');
 const separadas=[chaveEmail,chaveCifra,chaveCodigo,chaveBackup,
  chaveAdmin,chaveAuditoria,chaveCotacoes,chavePedidos,chaveOutbox]
  .filter(Boolean);
 for(let i=0;i<separadas.length;i++){
  for(let j=i+1;j<separadas.length;j++){
   if(separadas[i].equals(separadas[j]))
    throw Error('CHAVES_REAIS_DEVEM_SER_INDEPENDENTES');
  }
 }
 const configS3={
  endpoint:ambiente.LOOP_REAL_S3_ENDPOINT,
  bucket:ambiente.LOOP_REAL_S3_BUCKET,
  accessKeyId:ambiente.LOOP_REAL_S3_ACCESS_KEY_ID,
  secretAccessKey:ambiente.LOOP_REAL_S3_SECRET_ACCESS_KEY,
  region:ambiente.LOOP_REAL_S3_REGION||'auto'
 };
 validarBackupS3(configS3);
 const termos={
  versao:ambiente.LOOP_REAL_TERMOS_VERSAO,
  texto:ambiente.LOOP_REAL_TERMOS_TEXTO
 };
 const privacidade={
  versao:ambiente.LOOP_REAL_PRIVACIDADE_VERSAO,
  texto:ambiente.LOOP_REAL_PRIVACIDADE_TEXTO
 };
 const origemHttps=ambiente.LOOP_REAL_ORIGEM;
 if(typeof origemHttps!=='string'||!/^https:\/\/[^/]+\/?$/.test(origemHttps))
  throw Error('DOMINIO_REAL_HTTPS_OBRIGATORIO');
 const remetente=ambiente.RESEND_FROM_EMAIL;
 const apiKey=ambiente.RESEND_API_KEY;
 const confirmar=criarTransporteEmailVerificacaoResend({apiKey,remetente});
 const recuperar=criarTransporteRecuperacaoResend({apiKey,remetente});
 const enviarEmail=async({finalidade,...args})=>
  (finalidade==='SENHA'?recuperar:confirmar)(args);
 return {arquivo,chaveEmail,chaveCifra,chaveCodigo,termos,privacidade,
  origemHttps,enviarEmail,chaveBackup,configS3,
  chaveAdmin,chaveAuditoria,credencialAdmin,
  chavesRecuperacao:{chaveEmail,chaveCifra,chaveCodigo,chaveAuditoria,
   chaveCotacoes,chavePedidos,chaveOutbox}};
}
async function iniciar(ambiente=process.env){
 const config=configurar(ambiente);
 const banco=new DatabaseSync(config.arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 let agendador=null;
 try{
  const contas=new IdentidadeClienteLoopReal({...config,banco});
  const motorLoop=new MotorLoopIntegradoSQLite({banco});
  const operacaoCatraca=new OperacaoCatracaAdminSQLite({banco,motor:motorLoop});
  // Tabelas comerciais administrativas criadas ANTES do primeiro snapshot.
  // Nenhum fornecedor é homologado automaticamente.
  const auditoria=new AuditoriaOperacionalSQLite({
   banco,chaveAuditoria:config.chaveAuditoria
  });
  // Corrupção ou perda da chave da auditoria impede iniciar aplicação.
  auditoria.verificar();
  const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
  const catalogo=new CatalogoMultiDistribuidoresSQLite({
   banco,distribuidorHomologado:()=>false,auditoria,manutencao
  });
  const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
  const sessoes=new SessaoAdminComercialSQLite({
   banco,chaveAdmin:config.chaveAdmin,
   credencialAdmin:config.credencialAdmin
  });
  // Configurações de cores no mesmo banco. Nenhuma prova externa de PSP,
  // compra ou ativação é disponibilizada por este serviço.
  exigirChaveParaHistoricoComercial({
   banco,chavePedidos:config.chavePedidos
  });
  const comercial=config.chavePedidos?montarComercialSemHomologacao({
   banco,chavePedidos:config.chavePedidos,auditoria,manutencao,
   catalogoLeitura:catalogo
  }):null;
  const classificacaoLoop=comercial?.classificacaoLoop||null;
  const eventosComerciais=comercial?.eventosComerciais||null;
  // Consultas de vagas no servidor definitivo usam o mesmo motor e
  // fotografia das regras comerciais; PSP/checkout continuam fechados.
  const preflightCapacidade=classificacaoLoop?
   new PreflightCapacidadeCheckoutSQLite({
    banco,motor:motorLoop,classificacaoLoop
   }):null;
  preflightCapacidade?.verificar();
  // Painel real somente leitura: sem PSP/fornecedor homologado,
  // nada e cancelado ou reconsultado automaticamente.
  const recuperacaoReservas=preflightCapacidade?
   new RecuperacaoReservasCheckoutSQLite({
    banco,preflight:preflightCapacidade
   }):null;
  recuperacaoReservas?.verificar();
  agendador=criarAgendadorBackupIdentidadeReal({
   exigirProvaChaves:true,
   executar:()=>enviarBackupOffsiteIdentidade({
    fonteSqlite:config.arquivo,chaveBackup:config.chaveBackup,
    config:config.configS3,exigirProvaChaves:true,
    chavesRecuperacao:config.chavesRecuperacao
   })
  });
  // Falha de rede, segredo, bucket, restauração ou dados bloqueia o
  // listener; nenhuma conta real é criada sem prova de recuperação.
  await agendador.iniciar();
  // Mesmo livro do checkout para a tela aprovada "Meus Pedidos".
  // A fachada nao expõe criarPedido/confirmarPagamento/despachar.
  const pedidosComerciais=comercial?.leituraPedidos||null;
  const remessasOutbox=comercial?.leituraRemessas||null;
  const catalogoVitrine=comercial?.leituraCatalogo||
   criarLeituraCatalogoSeguro({banco,catalogo});
  const app=criarAppIdentidadeLoop({
   contas,motorLoop,eventosComerciais,preflightCapacidade,
   pedidosComerciais,remessasOutbox,catalogoVitrine,
   origemHttps:config.origemHttps,permitirCadastro:true,
   backupEstado:()=>agendador.estado(),
   adminComercial:{catalogo,controle,sessoes,auditoria,manutencao,
    classificacaoLoop,operacaoCatraca,recuperacaoReservas}
  });
  const porta=Number(ambiente.PORT||3000);
  if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
   throw Error('PORTA_INVALIDA');
  const server=app.listen(porta,'0.0.0.0');
  // Agenda executa somente quando o operador habilitou AUTOMATICA, e apenas em ensaio.
  const timer=ambiente.NODE_ENV==='production'?null:setInterval(()=>{
   try{operacaoCatraca.processarAgenda();}
   catch(e){console.error('CATRACA_AGENDA_ENSAIO_FALHOU',e.codigo||'ERRO');}
  },60000);
  timer?.unref?.();
  const encerrar=()=>{
   if(timer)clearInterval(timer);
   server.close(async()=>{
    try{await agendador.encerrar();}catch{}
    try{banco.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}
    banco.close();
   });
  };
  process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
  return {server,banco,agendador};
 }catch(e){
  if(agendador)await agendador.encerrar();
  banco.close();
  throw e;
 }
}
if(require.main===module){
 iniciar().catch(e=>{
  // Nunca imprimir token do provedor, URL assinada, e-mail ou dados reais.
  const codigo=typeof e?.codigo==='string'&&
   /^[A-Z0-9_]{5,80}$/.test(e.codigo)?e.codigo:
   'CONFIGURACAO_OU_BACKUP_NAO_PROVADOS';
  console.error('IDENTIDADE_REAL_NAO_INICIOU='+codigo);
  process.exitCode=1;
 });
}
module.exports={configurar,iniciar};
