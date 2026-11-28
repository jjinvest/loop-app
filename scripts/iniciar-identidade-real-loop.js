'use strict';
// Serviço REAL isolado. Não importar o app de homologação; não permitir
// primeiro cadastro sem documentação/Resend/volume próprios e GO humano.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {DatabaseSync}=require('node:sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {migrarHistoricoV2Protegido}=
 require('../src/producao/migracao-historico-v2-protegida');
const {OperacaoCatracaAdminSQLite}=
 require('../src/producao/operacao-catraca-admin-sqlite');
const {PreflightCapacidadeCheckoutSQLite}=
 require('../src/producao/preflight-capacidade-checkout-sqlite');
const {RecuperacaoReservasCheckoutSQLite}=
 require('../src/producao/recuperacao-reservas-checkout-sqlite');
const {auditarAcervoReal}=
 require('../src/producao/auditoria-acervo-real-sqlite');
const {emitirAuditoriaCustodiaReadOnly}=
 require('../src/producao/emitir-auditoria-custodia-readonly');
const {planejarSaneamentoLegados,aplicarSaneamentoLegados}=
 require('../src/producao/saneamento-sete-contas-legadas-sqlite');
const {atenderMigracaoIdentidadeReal}=
 require('../src/producao/receber-migracao-identidade-real');
const {criarCatalogoMercadoriasReal}=
 require('../src/producao/catalogo-mercadorias-real');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {BancadaModulosLoopSQLite}=
 require('../src/producao/bancada-modulos-loop-sqlite');
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
const {provarBackupMidiaOffsite}=
 require('../src/producao/backup-midia-offsite');
const {criarAgendadorBackupMidiaReal}=
 require('../src/producao/agendador-backup-midia-real');
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
function configurar(ambiente=process.env,{cadastroPublico=true}={}){
 const autorizacaoCadastro=ambiente.LOOP_REAL_CADASTRO_GO==='SIM'&&
  ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS==='SIM';
 const autorizacaoInterna=cadastroPublico===false&&
  ambiente.LOOP_REAL_OPERACAO_INTERNA==='SIM'&&
  ambiente.LOOP_REAL_PREPARACAO_INTERNA==='SIM'&&
  ambiente.LOOP_REAL_NUCLEO_COMERCIAL_INTERNO==='SIM'&&
  ambiente.LOOP_REAL_CADASTRO_GO==='NAO'&&
  ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS==='NAO';
 if(ambiente.NODE_ENV!=='production'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    !(cadastroPublico===true&&autorizacaoCadastro||autorizacaoInterna))
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
 // Documentos integrais versionados no repositorio; variaveis explicitas prevalecem.
 // A leitura nao altera os gates de aprovacao ou de abertura do cadastro.
 const documento=(nome,versao,arquivo)=>({
  versao:ambiente[nome+'_VERSAO']===undefined?versao:ambiente[nome+'_VERSAO'],
  texto:ambiente[nome+'_TEXTO']===undefined?fs.readFileSync(path.join(__dirname,'../docs',arquivo),'utf8'):ambiente[nome+'_TEXTO']
 });
 const termos=documento('LOOP_REAL_TERMOS','LOOP-TERMOS-CADASTRO-2026-11-V2','TERMOS_CADASTRO_LOOP_2026_11_PARA_APROVACAO.md');
 const privacidade=documento('LOOP_REAL_PRIVACIDADE','LOOP-PRIVACIDADE-CADASTRO-2026-11-V2','POLITICA_PRIVACIDADE_LOOP_2026_11_PARA_APROVACAO.md');
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
  chaveAdmin,chaveAuditoria,credencialAdmin,chaveCotacoes,chavePedidos,chaveOutbox,
  chavesRecuperacao:{chaveEmail,chaveCifra,chaveCodigo,chaveAuditoria,
   chaveCotacoes,chavePedidos,chaveOutbox}};
}
async function iniciar(ambiente=process.env,opcoes={}){
 const config=configurar(ambiente,opcoes);
 const banco=new DatabaseSync(config.arquivo);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 let agendador=null,agendadorMidia=null,catalogoMidia=null,bancoTeste=null;
 try{
  const contas=new IdentidadeClienteLoopReal({...config,banco});
  const motorLoop=new MotorLoopIntegradoSQLite({banco});
  const operacaoCatraca=new OperacaoCatracaAdminSQLite({banco,motor:motorLoop});
  // SQLite proprio dos testes no MESMO volume persistente: nunca introduzir
  // tabelas de ensaio no banco de identidade, pedidos ou posicoes reais.
  bancoTeste=new DatabaseSync('/dados-reais/testes-modulos.sqlite');
  bancoTeste.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
  const bancadaOperacional=new BancadaModulosLoopSQLite({
   banco:bancoTeste,consultarAgenda:()=>operacaoCatraca.consultar()
  });
  // Demonstração única expressamente solicitada, no SQLite isolado.
  // A operação é idempotente; fila já utilizada nunca é reiniciada.
  if(ambiente.LOOP_DEMONSTRAR_TAISA==='1'){
   try{
    const demo=bancadaOperacional.comandar({idOperacao:'demo-taisa-20261124',
     acao:'FILA_DEMONSTRAR_TAISA'});
    console.info('LOOP_DEMO_TAISA_POSICAO='+demo.posicaoId);
   }catch(e){
    if(e.codigo!=='BANCADA_FILA_JA_UTILIZADA')throw e;
    console.warn('LOOP_DEMO_TAISA_FILA_JA_UTILIZADA');
   }
  }
  // Lote autorizado de 24/11: prepara uma única vez, sem START e
  // exclusivamente no arquivo testes-modulos.sqlite. Não muda contas reais.
  if(ambiente.LOOP_PREPARAR_FLUXO_100==='1'&&ambiente.LOOP_PREPARAR_FLUXO_1000!=='1'){
   try{
    const lote=bancadaOperacional.comandar({idOperacao:'fluxo-100-20261124',
     acao:'CATRACA_PREPARAR_100'});
    console.info('LOOP_FLUXO_100_PREPARADO='+Boolean(lote.preparado));
   }catch(e){console.error('LOOP_FLUXO_100_NAO_PREPARADO',e.codigo||'ERRO');}
  }
  // Lote de mil autorizado em 26/11; conserva o lote anterior e não executa START.
  if(ambiente.LOOP_PREPARAR_FLUXO_1000==='1'){
   bancadaOperacional.comandar({idOperacao:'fluxo-1000-20261126',
    acao:'CATRACA_PREPARAR_1000'});
   bancadaOperacional.comandar({idOperacao:'bonus-confirmados-1000-20261126',
    acao:'CATRACA_CONCILIAR_BONUS'});
   const x=bancadaOperacional.consultar().catraca;
   const resumo={posicoes:x.filaA.length+x.filaB.length,
    amarelas:x.filaA.length,douradas:x.filaB.filter(p=>p.dourada).length,
    azuis:x.filaB.filter(p=>p.pendente).length,
    brancas:x.filaB.filter(p=>!p.dourada&&!p.pendente).length,
    recebidoCentavos:x.financeiro.recebidoCentavos,saldoCentavos:x.financeiro.saldoCentavos,
    indicadores:x.financeiro.indicadores,indicacoes:x.financeiro.comissoes,
    bonusCentavos:x.financeiro.destinos.BONUS,participacaoCentavos:x.financeiro.destinos.LOOP_CENTRO,
    totalPagoCentavos:x.financeiro.destinos.BONUS+x.financeiro.destinos.LOOP_CENTRO,
    bonusPendentesCentavos:x.financeiro.comissoesPendentesCentavos,
    eventos:x.financeiro.eventos,giros:x.tabuleiro.giros,
    catracaAtiva:x.catracaAtiva,porteiraAberta:x.porteiraAberta};
   console.info('LOOP_FLUXO_1000_VERIFICADO='+JSON.stringify(resumo));
  }
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
  // Migrar o formato V1 para V2 SOMENTE em operação interna fechada,
  // depois de cópia offsite restaurada. Nunca converter ao iniciar por padrão.
  const migracaoV2=ambiente.LOOP_REAL_SNAPSHOT_V2_MIGRAR||'NAO';
  if(!['NAO','SIM'].includes(migracaoV2))
   throw Error('HISTORICO_V2_MODO_INVALIDO');
  if(migracaoV2==='SIM'){
   const interno=opcoes.cadastroPublico===false&&
    ambiente.LOOP_REAL_CADASTRO_GO==='NAO'&&
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS==='NAO'&&
    ambiente.LOOP_REAL_OPERACAO_INTERNA==='SIM'&&
    ['NAO','AUDITAR'].includes(ambiente.LOOP_REAL_SANEAMENTO_LEGADOS||'NAO');
   const resultado=await migrarHistoricoV2Protegido({
    motor:motorLoop,agendador,autorizacaoInterna:interno
   });
   console.log('LOOP_SNAPSHOT_HISTORICO_V2='+JSON.stringify(resultado));
  }
  // Janela de depuracao pre-lancamento: SOMENTE duas identidades
  // reconhecidas podem continuar. Backup unico restaurado antes de entrar.
  // Default NAO nunca modifica contas; AUDITAR so calcula; EXECUTAR exige
  // modo de operacao interna, sinal duplo do proprietario e backup de
  // antes e depois. Nenhum erro pode abrir um banco parcialmente limpo.
  const modo=ambiente.LOOP_REAL_SANEAMENTO_LEGADOS||'NAO';
  if(!['NAO','AUDITAR','EXECUTAR'].includes(modo))
   throw Error('SANEAMENTO_MODO_DESCONHECIDO');
  if(modo!=='NAO'){
   const fechado=opcoes.cadastroPublico===false&&
    ambiente.LOOP_REAL_CADASTRO_GO==='NAO'&&
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS==='NAO'&&
    ambiente.LOOP_REAL_OPERACAO_INTERNA==='SIM';
   if(!fechado)throw Error('SANEAMENTO_CADASTRO_PRECISA_ESTAR_FECHADO');
   const plano=planejarSaneamentoLegados({banco});
   if(modo==='AUDITAR'){
    console.log('LOOP_SANEAMENTO_PRELANCAMENTO='+
     JSON.stringify({estado:plano.estado,remover:plano.remover,
      vinculos:plano.vinculos,migracoes:plano.migracoes,
      aplicou:false}));
   }else{
    if(ambiente.LOOP_REAL_SANEAMENTO_ACK!==
       'VILELA_TAISA_SETE_PRELANCAMENTO_20261118')
     throw Error('SANEAMENTO_REQUER_ACK_EXATO');
    const statusBackup=agendador.estado();
    if(statusBackup.backupAtualEmDia!==true||
       statusBackup.chavesDeLeituraVerificadas!==true||
       statusBackup.emExecucao===true)
     throw Error('SANEAMENTO_BACKUP_ANTES_NAO_COMPROVADO');
    const resultado=aplicarSaneamentoLegados({banco,
     autorizacaoOperador:true,backupAnteriorComprovado:true});
    // Objeto PRE-DEPURACAO possui UUID unico, nunca e sobrescrito.
    // Esta chamada cria novo UUID imutavel e RESTAURA o banco depurado.
    const pos=await agendador.executarUmaVez();
    if(pos.copiaExternaConfirmada!==true||
       pos.restauracaoIsoladaConfirmada!==true||
       agendador.estado().chavesDeLeituraVerificadas!==true)
     throw Error('SANEAMENTO_BACKUP_DEPOIS_NAO_COMPROVADO');
    const fim=planejarSaneamentoLegados({banco});
    if(fim.estado!=='JA_SANEADO')
     throw Error('SANEAMENTO_FINAL_NAO_COMPROVADO');
    console.log('LOOP_SANEAMENTO_PRELANCAMENTO='+
     JSON.stringify({estado:resultado.estado,removidas:resultado.remover,
      contasAtuais:2,primeiraIndicacaoPreservada:true,
      backupsAntesDepoisRestaurados:true,exclusaoConcluida:true}));
   }
  }
  // Mesmo livro do checkout para a tela aprovada "Meus Pedidos".
  // A fachada nao expõe criarPedido/confirmarPagamento/despachar.
  const pedidosComerciais=comercial?.leituraPedidos||null;
  const remessasOutbox=comercial?.leituraRemessas||null;
  const catalogoVitrine=comercial?.leituraCatalogo||
   criarLeituraCatalogoSeguro({banco,catalogo});
  // Catálogo de mídia e conta usam o mesmo serviço e volume persistente,
  // mas bancos separados por finalidade. Nenhuma conta é duplicada.
  if(ambiente.LOOP_REAL_CATALOGO_EDITAVEL==='SIM')
   catalogoMidia=criarCatalogoMercadoriasReal({
    arquivo:'/dados-reais/catalogo-produtos.sqlite',
    tokenRaiz:ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN,
    buscarProdutoCompartilhado:id=>catalogo.buscarProdutoAdministrativo({
     produtoId:id
    })
   });
  // A cópia da conta não inclui o SQLite separado das fotos/PDFs.
  // Quando a custódia da mídia estiver habilitada, exigir PUT, GET,
  // hash e restauração ANTES de subir o listener real.
  const backupMidiaAtivo=
   ambiente.LOOP_REAL_BACKUP_MIDIA_OFFSITE_AUTO==='SIM';
  if(backupMidiaAtivo){
   if(!catalogoMidia)
    throw Error('BACKUP_MIDIA_CATALOGO_REAL_OBRIGATORIO');
   agendadorMidia=criarAgendadorBackupMidiaReal({
    executar:()=>provarBackupMidiaOffsite({
     fonteSqlite:'/dados-reais/catalogo-produtos.sqlite',
     chaveBackup:config.chaveBackup,config:config.configS3
    })
   });
   await agendadorMidia.iniciar();
   console.log('LOOP_BACKUP_MIDIA_OFFSITE=COMPROVADO;'+
    'PUT_GET_HASH_RESTORE=SIM;SEM_DINHEIRO=SIM');
  }
  const catalogoMidiaLeitura=catalogoMidia?Object.freeze({
   banco:catalogoMidia.repo.banco,
   listarVitrinePreparacao:args=>catalogoMidia.listarVitrinePreparacao(args),
   listarFotosProdutoCompartilhado:args=>
    catalogoMidia.listarFotosProdutoCompartilhado(args),
   abrirFotoPublicada:args=>catalogoMidia.abrirFotoPublicada(args),
   listarVideoProdutoCompartilhado:args=>catalogoMidia.listarVideoProdutoCompartilhado(args),
   abrirVideoPublicado:args=>catalogoMidia.abrirVideoPublicado(args)
  }):null;
  const app=criarAppIdentidadeLoop({
   contas,motorLoop,eventosComerciais,preflightCapacidade,
   divulgadorInstitucionalNick:ambiente.LOOP_REAL_DIVULGADOR_INSTITUCIONAL??null,
   pedidosComerciais,remessasOutbox,catalogoVitrine,catalogoMidiaLeitura,
   origemHttps:config.origemHttps,permitirCadastro:opcoes.cadastroPublico!==false,
   captchaCadastroObrigatorio:true,
   backupEstado:()=>agendador.estado(),
   adminComercial:{catalogo,controle,sessoes,auditoria,manutencao,
    catalogoMidia,classificacaoLoop,operacaoCatraca,recuperacaoReservas,
    bancadaOperacional,
    // Futuro adaptador bancário, injetado somente pelo servidor.
    consultarSaldosCofres:opcoes.consultarSaldosCofres??null}
  });
  // Sonda informativa de somente leitura: nenhum dado pessoal ou produto
  // aparece no log. Falha não modifica contas, fotos nem reinicia o banco.
  // Integridade local NÃO comprova backup offsite do banco de imagens.
  try{
   const acervo=auditarAcervoReal({
    bancoIdentidade:banco,bancoMidia:catalogoMidia?.repo?.banco||null
   });
   console.log('LOOP_ACERVO_REAL='+acervo.estado+
    ';CONTAS='+acervo.contas+';VINCULOS='+acervo.vinculos+
    ';PRODUTOS_PRINCIPAIS='+acervo.produtosPrincipais+
    ';PRODUTOS_MIDIA='+(acervo.produtosMidia??0)+
    ';QUADRADINHOS='+acervo.quadradinhos+
    ';FOTOS_ATUAIS='+acervo.fotosAtuais+
    ';FOTOS_VERIFICADAS='+acervo.fotosVerificadas+
    ';FOTOS_PENDENTES='+acervo.fotosPendentes+
    ';BACKUP_MIDIA_OFFSITE='+(agendadorMidia?.estado().backupAtualEmDia?
     'COMPROVADO':'NAO_COMPROVADO'));
  }catch{
   console.error('LOOP_ACERVO_REAL=INVENTARIO_NAO_COMPROVADO');
  }
  // O backup restauravel foi comprovado antes deste ponto.
  // Auditoria SOMENTE LEITURA para identificar, sem expor PII,
  // a origem e as dependencias das sete contas fora das duas reconhecidas.
  // Uma falha na auditoria nao altera nem elimina clientes e nao transforma
  // um numero de registros em uma autorizacao de exclusao.
  emitirAuditoriaCustodiaReadOnly({banco});
  const porta=Number(ambiente.PORT||3000);
  if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
   throw Error('PORTA_INVALIDA');
  // Private Networking Railway: IPv6 + IPv4 para health/load balancer.
  const server=http.createServer((req,res)=>{
   // A migração autenticada usa o banco REAL já aberto, o mesmo receptor
   // da preparação e o mesmo backup offsite com restauração comprovada.
   // Não cria outro SQLite nem aceita contas fora do pacote autenticado.
   if(req.url==='/internal/loop/migracao-identidade'){
    void atenderMigracaoIdentidadeReal(req,res,{ambiente,banco}).catch(()=>{
     if(!res.writableEnded){res.writeHead(503);res.end();}
    });return;
   }
   if(req.url?.startsWith('/internal/catalogo/')){
    if(!catalogoMidia){res.writeHead(503);res.end();return;}
    void Promise.resolve(catalogoMidia.atender(req,res)).catch(()=>{
     if(!res.writableEnded){res.writeHead(503);res.end();}
    });return;
   }
   app(req,res);
  });
  server.listen({port:porta,host:'::',ipv6Only:false});
  // Agenda executa somente quando o operador habilitou AUTOMATICA, e apenas em ensaio.
  const timer=ambiente.NODE_ENV==='production'?null:setInterval(()=>{
   try{operacaoCatraca.processarAgenda();}
   catch(e){console.error('CATRACA_AGENDA_ENSAIO_FALHOU',e.codigo||'ERRO');}
  },60000);
  timer?.unref?.();
  // O servidor, nao o navegador, comanda os pulsos da bancada de teste.
  // Cada marco e aplicado no mesmo motor do LOOP, com idempotencia SQLite.
  // A porteira permanece independente e fechada por padrao.
  const timerBancada=setInterval(()=>{
   try{bancadaOperacional.processarRelogio();}
   catch(e){console.error('BANCADA_CATRACA_RELOGIO_FALHOU',
    e.codigo||'ERRO_OPERACIONAL');}
  },1000);
  timerBancada.unref?.();
  const encerrar=()=>{
   clearInterval(timerBancada);
   if(timer)clearInterval(timer);
   server.close(async()=>{
    try{await agendadorMidia?.encerrar();}catch{}
    try{await agendador.encerrar();}catch{}
    try{catalogoMidia?.fechar();}catch{}
    try{bancoTeste?.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}
    bancoTeste?.close();
    try{banco.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}
    banco.close();
   });
  };
  process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
  return {server,banco,agendador,agendadorMidia};
 }catch(e){
  if(agendadorMidia)await agendadorMidia.encerrar();
  if(agendador)await agendador.encerrar();
  catalogoMidia?.fechar();
  bancoTeste?.close();
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
