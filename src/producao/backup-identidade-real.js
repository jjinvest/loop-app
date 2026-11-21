'use strict';
// Backup local cifrado da IDENTIDADE REAL, separado do laboratório.
// Não substitui upload offsite, retenção, prova de recuperação inter-regional,
// backup financeiro nem autorização para disponibilizar pagamentos.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {pipeline}=require('node:stream/promises');
const {createHash,createCipheriv,createDecipheriv,randomBytes,hkdfSync}=
 require('node:crypto');
const {TABELAS_OUTBOX_COMPRA}=require('./outbox-compra-loop-sqlite');
const {MotorLoopIntegradoSQLite,TABELAS_MOTOR}=require('./motor-loop-integrado-sqlite');
const {ProjecaoFilasRelacionalSQLite,TABELAS_PROJECAO}=
 require('./projecao-filas-relacional-sqlite');
const {HistoricoCiclosRelacionalSQLite,TABELAS_HISTORICO}=
 require('./historico-ciclos-relacional-sqlite');
const {LivroFinanceiroRealSQLite,TABELAS_LIVRO}=
 require('./livro-financeiro-real-sqlite');
const {PreflightCapacidadeCheckoutSQLite,TABELAS_PREFLIGHT}=
 require('./preflight-capacidade-checkout-sqlite');
const {RecuperacaoReservasCheckoutSQLite,TABELAS_RECUPERACAO}=
 require('./recuperacao-reservas-checkout-sqlite');
const {OperacaoCatracaAdminSQLite,TABELAS_CATRACA_ADMIN}=
 require('./operacao-catraca-admin-sqlite');
const {ControleCaixaCatracaLoopSQLite,TABELAS_CATRACA_CAIXA}=
 require('./controle-caixa-catraca-loop-sqlite');
const {TABELAS_POSICOES_VITRINE}=
 require('./posicoes-vitrine-real-sqlite');
const {TABELA_FOTO_PERFIL_REAL}=
 require('./foto-perfil-real-sqlite');
const {CarrinhoInternoRealSQLite}=require('./carrinho-interno-real-sqlite');
const {PromocaoPedidoMotorEnsaioSQLite,TABELAS_PROMOCAO_ENSAIO}=
 require('./promocao-pedido-motor-ensaio-sqlite');
const {PromocaoLotesEnsaioSQLite,TABELAS_LOTES_ENSAIO}=
 require('./promocao-lotes-ensaio-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('./classificacao-comercial-loop-sqlite');
const {TABELAS_COMERCIAIS,validarRecuperacaoComercial}=
 require('./validacao-recuperacao-comercial');
const {TABELAS_TESOURARIA_ENSAIO,TesourariaModularEnsaioSQLite}=
 require('./tesouraria-modular-ensaio-sqlite');
const TABELA_FOTO_OPERADOR_REAL='loop_real_operador_foto_perfil';
const MAGIC=Buffer.from('LOOPREALBKP1','ascii');
const HEADER=40,TAG=16;
const TABELAS=Object.freeze([
 'loop_real_contas','loop_real_sessoes','loop_real_codigos',
 'loop_real_custodia','loop_real_limites','loop_real_vinculos_indicacao'
]);
// Presente em cadastros novos; backups anteriores à migração permanecem recuperáveis.
const TABELAS_CONTATO=Object.freeze([
 'loop_real_contatos_cadastro','loop_real_telefones_legados',
 'loop_real_destinos_indicacao','loop_real_carrinho_itens',
 'loop_real_migracoes_preview','loop_real_aceites_documentos',
 'loop_captcha_login_falhas_v1','loop_captcha_cadastro_v1',
 TABELA_FOTO_PERFIL_REAL
]);
// Administração, cotações, pedidos, custo congelado e outbox são protegidos
// juntos quando coexistem no MESMO SQLite. Liquidação PSP/banco e tributos
// externos NÃO são cobertos nem autorizados por este backup.
const TABELAS_ADMIN=Object.freeze([
 'loja_real_produtos','loja_real_ofertas_distribuidores',
 'loja_real_custos_ofertas','loja_real_custos_historico',
 'loja_real_revisoes_preco','loja_real_precos_historico',
 'loja_real_sessoes_admin','loja_real_limite_login_admin',
 'loja_real_auditoria_admin','loja_real_manutencao_comercial'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function conferir({origem,destino,chaveBackup,autorizado,restaurar=false}){
 if(autorizado!==true||!Buffer.isBuffer(chaveBackup)||
    chaveBackup.length!==32)falha('CUSTODIA_BACKUP_REAL_NAO_AUTORIZADA');
 if(typeof origem!=='string'||!path.isAbsolute(origem)||
    typeof destino!=='string'||!path.isAbsolute(destino)||
    origem===destino||origem.includes('\0')||destino.includes('\0')||
    !origem.endsWith(restaurar?'.looprealbak':'.sqlite')||
    !destino.endsWith(restaurar?'.sqlite':'.looprealbak'))
  falha('CAMINHOS_BACKUP_REAL_INVALIDOS');
 const canonicalOrigem=path.resolve(origem),canonicalDestino=path.resolve(destino);
 if(!fs.existsSync(origem)||!fs.lstatSync(origem).isFile()||
    fs.lstatSync(origem).isSymbolicLink())
  falha('ORIGEM_BACKUP_REAL_INSEGURA');
 const destinoPai=path.dirname(canonicalDestino);
 if(!fs.existsSync(destinoPai)||
    !fs.statSync(destinoPai).isDirectory()||
    fs.lstatSync(destinoPai).isSymbolicLink())
  falha('DESTINO_BACKUP_REAL_INSEGURO');
 if(process.env.NODE_ENV==='production'){
  if(!restaurar){
   if(canonicalOrigem!=='/dados-reais/clientes.sqlite'||
      canonicalDestino.startsWith('/dados-reais/'))
    falha('BACKUP_REAL_VOLUME_OU_ORIGEM_INVALIDOS');
  }else if(canonicalDestino==='/dados-reais/clientes.sqlite'){
   // Recuperação somente em arquivo novo, com promoção offline controlada.
   falha('RESTAURACAO_NAO_PODE_ATINGIR_BANCO_ATIVO');
  }
 }
 if(fs.existsSync(canonicalDestino))falha('DESTINO_BACKUP_REAL_JA_EXISTE');
 return {origem:canonicalOrigem,destino:canonicalDestino,destinoPai};
}
function validarIdentidade(arquivo){
 const b=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const lista=b.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(x=>x.name);
  if(TABELAS.some(x=>!lista.includes(x)))falha('BACKUP_REAL_ESQUEMA_INCOMPLETO');
  const todos=[...TABELAS,...TABELAS_CONTATO,...TABELAS_ADMIN,...TABELAS_COMERCIAIS,
   ...TABELAS_MOTOR,...TABELAS_PROJECAO,...TABELAS_HISTORICO,...TABELAS_CATRACA_ADMIN,...TABELAS_CATRACA_CAIXA,
   ...TABELAS_POSICOES_VITRINE,
   ...TABELAS_TESOURARIA_ENSAIO,
   ...TABELAS_PROMOCAO_ENSAIO,...TABELAS_LOTES_ENSAIO,
   ...TABELAS_PREFLIGHT,...TABELAS_RECUPERACAO,...TABELAS_LIVRO,
   ...TABELAS_OUTBOX_COMPRA,TABELA_FOTO_OPERADOR_REAL];
  if(lista.some(x=>!todos.includes(x)))
   falha('BACKUP_IDENTIDADE_NAO_COBRE_TABELAS_COMERCIAIS');
  // A escolha de destino imutável também integra a mesma cópia cifrada.
  // Backups históricos sem essa tabela continuam recuperáveis.
  if(lista.includes('loop_real_destinos_indicacao')){
   const tabela=b.prepare('PRAGMA table_info(loop_real_destinos_indicacao)')
    .all().map(x=>x.name);
   if(['indicado_id','indicador_id','numero_posicao','registrado_em']
    .some(x=>!tabela.includes(x)))
    falha('BACKUP_DESTINO_ESQUEMA_INVALIDO');
   const invalido=b.prepare([
    'SELECT d.indicado_id FROM loop_real_destinos_indicacao d',
    'LEFT JOIN loop_real_vinculos_indicacao v ON v.indicado_id=d.indicado_id',
    'WHERE v.indicado_id IS NULL OR v.indicador_id<>d.indicador_id',
    'OR d.numero_posicao<1 OR d.numero_posicao>10 LIMIT 1'
   ].join(' ')).get();
   if(invalido)falha('BACKUP_DESTINO_INDICACAO_INCONSISTENTE');
  }
  // Carrinho pertence ao MESMO titular e ao MESMO backup cifrado.
  // A restauração recusa carrinhos adulterados, superlotados ou órfãos.
  if(lista.includes('loop_real_carrinho_itens')){
   const colunas=b.prepare('PRAGMA table_info(loop_real_carrinho_itens)')
    .all().map(x=>x.name);
   if(['titular_id','produto_id','quantidade','atualizado_em']
    .some(x=>!colunas.includes(x)))
    falha('BACKUP_CARRINHO_ESQUEMA_INVALIDO');
   try{
    const carrinho=Object.create(CarrinhoInternoRealSQLite.prototype);
    carrinho.banco=b;
    if(carrinho.verificar().integridade!=='OK')
     falha('BACKUP_CARRINHO_INTEGRIDADE_DIVERGENTE');
   }catch{falha('BACKUP_CARRINHO_INTEGRIDADE_DIVERGENTE');}
  }
  // A foto real integra o MESMO backup cifrado e não pode perder o titular.
  if(lista.includes(TABELA_FOTO_PERFIL_REAL)){
   const fotos=b.prepare(
    'SELECT f.titular_id,f.dados,f.sha256 FROM '+TABELA_FOTO_PERFIL_REAL+
    ' f LEFT JOIN loop_real_contas c ON c.id=f.titular_id'
   ).all();
   if(fotos.some(f=>!(f.dados instanceof Uint8Array)||!f.dados.length||
       f.dados.length>3*1024*1024||
       createHash('sha256').update(f.dados).digest('hex')!==f.sha256))
    falha('BACKUP_FOTO_PERFIL_REAL_DIVERGENTE');
   const semTitular=b.prepare(
    'SELECT COUNT(*) AS n FROM '+TABELA_FOTO_PERFIL_REAL+
    ' f LEFT JOIN loop_real_contas c ON c.id=f.titular_id WHERE c.id IS NULL'
   ).get().n;
   if(semTitular)falha('BACKUP_FOTO_PERFIL_REAL_TITULAR_INCONSISTENTE');
  }
  // Avatar do OPERADOR: registro proprio e opcional em backups antigos,
  // coberto pelo mesmo backup cifrado e validado por digest na restauracao.
  if(lista.includes(TABELA_FOTO_OPERADOR_REAL)){
   const fotos=b.prepare(
    'SELECT id,mime,dados,sha256,atualizado_em FROM '+TABELA_FOTO_OPERADOR_REAL
   ).all();
   if(fotos.length>1||fotos.some(f=>
     f.id!==1||!['image/jpeg','image/png','image/webp'].includes(f.mime)||
     !(f.dados instanceof Uint8Array)||f.dados.length<1||
     f.dados.length>3*1024*1024||
     !Number.isSafeInteger(f.atualizado_em)||f.atualizado_em<1||
     createHash('sha256').update(f.dados).digest('hex')!==f.sha256))
    falha('BACKUP_FOTO_OPERADOR_REAL_DIVERGENTE');
  }
  const temEnsaio=TABELAS_TESOURARIA_ENSAIO.some(x=>lista.includes(x));
  if(temEnsaio){
   // Jamais promover demonstrativo ficticio como saldo contabil real.
   if(process.env.NODE_ENV==='production')
    falha('BACKUP_TESOURARIA_ENSAIO_PROIBIDA_PRODUCAO');
   if(TABELAS_TESOURARIA_ENSAIO.some(x=>!lista.includes(x)))
    falha('BACKUP_TESOURARIA_ENSAIO_PARCIAL');
   try{
    const ensaio=Object.create(TesourariaModularEnsaioSQLite.prototype);
    ensaio.db=b;
    if(ensaio.verificar().integridade!=='OK')
     falha('BACKUP_TESOURARIA_ENSAIO_DIVERGENTE');
   }catch{falha('BACKUP_TESOURARIA_ENSAIO_DIVERGENTE');}
  }
  // O snapshot da fila, eventos e livro de compras pertencem ao mesmo backup.
  const temMotor=TABELAS_MOTOR.some(t=>lista.includes(t));
  if(temMotor){
   if(TABELAS_MOTOR.some(t=>!lista.includes(t)))
    falha('BACKUP_MOTOR_PARCIAL');
   try{
    const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
    motor.banco=b;motor.verificar();
   }catch{falha('BACKUP_MOTOR_INTEGRIDADE_DIVERGENTE');}
  }
  // Livro real pertence ao mesmo backup que identidade e motor.
  // Recusar tabela ausente e saldos negativos; nenhum ensaio vira saldo.
  const temLivro=TABELAS_LIVRO.some(x=>lista.includes(x));
  if(temLivro){
   if(!temMotor||TABELAS_LIVRO.some(x=>!lista.includes(x)))
    falha('BACKUP_LIVRO_FINANCEIRO_INCOMPLETO');
   try{
    const livro=Object.create(LivroFinanceiroRealSQLite.prototype);
    livro.banco=b;livro.provas=null;
    if(livro.verificar().integridade!=='OK')
     falha('BACKUP_LIVRO_FINANCEIRO_DIVERGENTE');
   }catch{falha('BACKUP_LIVRO_FINANCEIRO_DIVERGENTE');}
  }
  const temCatracaAdmin=TABELAS_CATRACA_ADMIN.some(x=>lista.includes(x));
  if(temCatracaAdmin){
   // Backups anteriores a programacao por meta tinham tres tabelas.
   // Conserva a recuperacao sem permitir um esquema novo incompleto.
   const legadas=TABELAS_CATRACA_ADMIN.filter(x=>
    x!=='loop_real_catraca_admin_meta');
   if(legadas.some(x=>!lista.includes(x))||
      (lista.includes('loop_real_catraca_admin_meta')&&
       TABELAS_CATRACA_ADMIN.some(x=>!lista.includes(x))))
    falha('BACKUP_CATRACA_ADMIN_ESQUEMA_PARCIAL');
   try{
    if(!temMotor)falha('BACKUP_CATRACA_ADMIN_SEM_MOTOR');
    const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
    motor.banco=b;
    const operacao=Object.create(OperacaoCatracaAdminSQLite.prototype);
    operacao.db=b;operacao.motor=motor;
    if(operacao.verificar().integridade!=='OK')
     falha('BACKUP_CATRACA_ADMIN_DIVERGENTE');
   }catch{falha('BACKUP_CATRACA_ADMIN_DIVERGENTE');}
  }
  // A posicao do produto no quadradinho integra o backup de
  // identidade/comercio. Backups anteriores à tabela continuam legíveis.
  if(lista.includes('loja_real_vitrine_posicoes')){
   const pos=b.prepare([
    'SELECT posicao,produto_id,revisao,atualizado_em',
    'FROM loja_real_vitrine_posicoes'
   ].join(' ')).all();
   const idValido=/^[A-Za-z0-9_-]{1,80}$/;
   if(pos.length>400||pos.some(x=>
      !Number.isSafeInteger(x.posicao)||x.posicao<1||x.posicao>400||
      !idValido.test(x.produto_id)||
      !Number.isSafeInteger(x.revisao)||x.revisao<1||
      !Number.isSafeInteger(x.atualizado_em)||x.atualizado_em<1)||
      new Set(pos.map(x=>x.produto_id)).size!==pos.length)
    falha('BACKUP_POSICOES_VITRINE_INCONSISTENTES');
  }
  // Reserva e autorizacoes do relogio devem sobreviver INTEGRAS ao backup.
  const temCaixaCatraca=TABELAS_CATRACA_CAIXA.some(x=>lista.includes(x));
  if(temCaixaCatraca){
   if(TABELAS_CATRACA_CAIXA.some(x=>!lista.includes(x)))
    falha('BACKUP_CATRACA_CAIXA_ESQUEMA_PARCIAL');
   try{
    const controle=Object.create(ControleCaixaCatracaLoopSQLite.prototype);
    controle.banco=b;
    if(controle.verificar().integridade!=='OK')
     falha('BACKUP_CATRACA_CAIXA_DIVERGENTE');
   }catch{falha('BACKUP_CATRACA_CAIXA_DIVERGENTE');}
  }
  // Programacao de caixa e autorizacoes de luz precisam viajar juntas
  // no backup. Nenhum saldo bancario e inferido do SQLite.
  const temCaixa=TABELAS_CATRACA_CAIXA.some(x=>lista.includes(x));
  if(temCaixa){
   if(TABELAS_CATRACA_CAIXA.some(x=>!lista.includes(x)))
    falha('BACKUP_CATRACA_CAIXA_PARCIAL');
   try{
    const controle=Object.create(ControleCaixaCatracaLoopSQLite.prototype);
    controle.banco=b;
    const dias=b.prepare(
     'SELECT dia FROM loop_real_catraca_caixa_programacao'
    ).all();
    for(const {dia} of dias){
     const p=controle.consultar({dia});
     if(!p.programada||!p.caixaComprovado||
        p.luzesAutorizadas>p.luzesPlanejadas||
        p.reservaTotalCentavos<1)
      falha('BACKUP_CATRACA_CAIXA_INCONSISTENTE');
    }
    const soltas=b.prepare([
     'SELECT COUNT(*) AS n FROM loop_real_catraca_caixa_autorizacoes a',
     'LEFT JOIN loop_real_catraca_caixa_programacao p ON p.dia=a.dia',
     'WHERE p.dia IS NULL OR a.indice_luz>p.meta_centros*6'
    ].join(' ')).get().n;
    if(soltas!==0)falha('BACKUP_CATRACA_CAIXA_INCONSISTENTE');
   }catch{falha('BACKUP_CATRACA_CAIXA_INCONSISTENTE');}
  }
  // A ativação fictícia qualificada exige o mesmo pedido, evento e motor.
  // Nunca promover ponte fictícia em um backup de produção.
  const temPromocao=TABELAS_PROMOCAO_ENSAIO.some(x=>lista.includes(x));
  if(temPromocao){
   if(process.env.NODE_ENV==='production')
    falha('BACKUP_PROMOCAO_ENSAIO_PROIBIDA_PRODUCAO');
   try{
    if(!temMotor)falha('BACKUP_PROMOCAO_SEM_MOTOR');
    const ponte=Object.create(PromocaoPedidoMotorEnsaioSQLite.prototype);
    ponte.db=b;
    if(ponte.verificar().integridade!=='OK')
     falha('BACKUP_PROMOCAO_DIVERGENTE');
   }catch{falha('BACKUP_PROMOCAO_DIVERGENTE');}
  }
  const temLotes=TABELAS_LOTES_ENSAIO.some(x=>lista.includes(x));
  if(temLotes){
   if(process.env.NODE_ENV==='production')
    falha('BACKUP_LOTES_ENSAIO_PROIBIDOS_PRODUCAO');
   if(TABELAS_LOTES_ENSAIO.some(x=>!lista.includes(x)))
    falha('BACKUP_LOTES_ENSAIO_ESQUEMA_PARCIAL');
   try{
    if(!temMotor||!temPromocao)falha('BACKUP_LOTE_MOTOR_OU_PROMOCAO_AUSENTE');
    const modulo=Object.create(PromocaoLotesEnsaioSQLite.prototype);
    modulo.db=b;
    const classificacao=Object.create(ClassificacaoComercialLoopSQLite.prototype);
    classificacao.db=b;
    modulo.classificacao=classificacao;
    if(modulo.verificar().integridade!=='OK')
     falha('BACKUP_LOTES_ENSAIO_DIVERGENTE');
   }catch{falha('BACKUP_LOTES_ENSAIO_DIVERGENTE');}
  }
  // O saldo de capacidade prometido antes da cobranca tambem e duravel.
  const temPreflight=TABELAS_PREFLIGHT.some(x=>lista.includes(x));
  if(temPreflight){
   if(TABELAS_PREFLIGHT.some(x=>!lista.includes(x)))
    falha('BACKUP_CAPACIDADE_ESQUEMA_PARCIAL');
   try{
    if(!temMotor)falha('BACKUP_CAPACIDADE_SEM_MOTOR');
    const preflight=Object.create(PreflightCapacidadeCheckoutSQLite.prototype);
    preflight.db=b;
    const motor=Object.create(MotorLoopIntegradoSQLite.prototype);
    motor.banco=b;
    preflight.motor=motor;
    const cor=Object.create(ClassificacaoComercialLoopSQLite.prototype);
    cor.db=b;
    preflight.classificacao=cor;
    if(preflight.verificar().integridade!=='OK')
     falha('BACKUP_CAPACIDADE_DIVERGENTE');
   }catch{falha('BACKUP_CAPACIDADE_DIVERGENTE');}
  }
  const existeRecuperacao=TABELAS_RECUPERACAO.some(x=>lista.includes(x));
  if(existeRecuperacao){
   if(TABELAS_RECUPERACAO.some(x=>!lista.includes(x)))
    falha('BACKUP_RECUPERACAO_RESERVAS_PARCIAL');
   if(!TABELAS_PREFLIGHT.every(x=>lista.includes(x)))
    falha('BACKUP_RECUPERACAO_SEM_PREFLIGHT');
   try{
    const recuperacao=Object.create(RecuperacaoReservasCheckoutSQLite.prototype);
    recuperacao.db=b;
    if(recuperacao.verificar().integridade!=='OK')
     falha('BACKUP_RECUPERACAO_RESERVAS_INTEGRA');
   }catch{falha('BACKUP_RECUPERACAO_RESERVAS_DIVERGENTE');}
  }
  // Não aceitar snapshot administrativo parcial. Pedidos e remessas
  // são conferidos semanticamente, sem inferir conciliação bancária.
  const adminPresente=TABELAS_ADMIN.some(x=>lista.includes(x));
  if(adminPresente&&TABELAS_ADMIN.some(x=>!lista.includes(x)))
   falha('BACKUP_ADMIN_PARCIAL');
  if(adminPresente){
   const ver=(t,colunas)=>{
    const encontrados=b.prepare('PRAGMA table_info('+t+')')
     .all().map(x=>x.name);
    if(colunas.some(x=>!encontrados.includes(x)))
     falha('BACKUP_ADMIN_ESQUEMA_INCOMPLETO');
   };
   ver('loja_real_produtos',['produto_id','titulo','ativo']);
   ver('loja_real_ofertas_distribuidores',
    ['produto_id','distribuidor_id','preco_centavos']);
   ver('loja_real_custos_ofertas',
    ['produto_id','distribuidor_id','custo_unit_centavos']);
   ver('loja_real_precos_historico',['id','revisao']);
   ver('loja_real_sessoes_admin',['token_hash','csrf','expira_em']);
   ver('loja_real_auditoria_admin',['id','hash_anterior','hash_atual']);
   ver('loja_real_manutencao_comercial',['id','suspensa','revisao']);
  }
  // O arquivo de ciclos e opcional em backups antigos. Quando existe,
  // exige cadeia inteira, seis eventos por giro e dados iguais ao motor.
  const temHistorico=TABELAS_HISTORICO.some(t=>lista.includes(t));
  if(temHistorico){
   if(!temMotor||TABELAS_HISTORICO.some(t=>!lista.includes(t)))
    falha('BACKUP_CICLOS_HISTORICO_INCOMPLETO');
   try{
    if(HistoricoCiclosRelacionalSQLite.verificarExistente({banco:b})
      .integridade!=='OK')
     falha('BACKUP_CICLOS_HISTORICO_DIVERGENTE');
   }catch{falha('BACKUP_CICLOS_HISTORICO_DIVERGENTE');}
  }
  // Espelho relacional e ADITIVO: snapshots históricos sem ele são válidos.
  // Se presente, deve estar completo e exatamente alinhado ao motor.
  const temProjecao=TABELAS_PROJECAO.some(t=>lista.includes(t));
  if(temProjecao){
   if(!temMotor||TABELAS_PROJECAO.some(t=>!lista.includes(t)))
    falha('BACKUP_FILA_PROJECAO_INCOMPLETA');
   try{
    if(ProjecaoFilasRelacionalSQLite.verificarExistente({banco:b})
      .integridade!=='OK')
     falha('BACKUP_FILA_PROJECAO_DIVERGENTE');
   }catch{falha('BACKUP_FILA_PROJECAO_DIVERGENTE');}
  }
  const integridade=b.prepare('PRAGMA integrity_check').all();
  if(integridade.length!==1||integridade[0].integrity_check!=='ok')
   falha('BACKUP_REAL_SQLITE_CORROMPIDO');
  if(b.prepare('PRAGMA foreign_key_check').all().length)
   falha('BACKUP_REAL_CHAVES_DIVERGENTES');
  if(!b.prepare('SELECT id FROM loop_real_custodia WHERE id=1').get())
   falha('BACKUP_REAL_SEM_CUSTODIA');
  const comercial=validarRecuperacaoComercial(b,lista);
  return {contas:b.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,
   administracaoIncluida:adminPresente,integridade:'ok',...comercial};
 }finally{b.close();}
}
function derivar(k,salt){return Buffer.from(hkdfSync(
 'sha256',k,salt,Buffer.from('LOOP-IDENTIDADE-REAL-BACKUP-V1'),32
));}
async function digest(arquivo){
 const sha=createHash('sha256');
 for await(const bloco of fs.createReadStream(arquivo))sha.update(bloco);
 return sha.digest('hex');
}
async function criarBackupIdentidadeReal({
 origem,destino,chaveBackup,autorizado=false
}={}){
 const p=conferir({origem,destino,chaveBackup,autorizado});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-backup-'));
 fs.chmodSync(tmp,0o700);
 const snapshot=path.join(tmp,'snapshot.sqlite');
 let b=null,fd=null,gerado=false,chave=null;
 try{
  validarIdentidade(p.origem);
  b=new DatabaseSync(p.origem,{readOnly:true});
  b.prepare('VACUUM INTO ?').run(snapshot);
  b.close();b=null;
  fs.chmodSync(snapshot,0o600);
  const prova=validarIdentidade(snapshot);
  const salt=randomBytes(16),iv=randomBytes(12);
  const header=Buffer.concat([MAGIC,salt,iv]);
  if(header.length!==HEADER)falha('BACKUP_CABECALHO_INVALIDO');
  chave=derivar(chaveBackup,salt);
  const cifra=createCipheriv('aes-256-gcm',chave,iv);
  cifra.setAAD(header);
  fd=fs.openSync(p.destino,'wx',0o600);
  gerado=true;
  fs.writeSync(fd,header);
  fs.closeSync(fd);fd=null;
  await pipeline(fs.createReadStream(snapshot),cifra,
   fs.createWriteStream(p.destino,{flags:'a',mode:0o600}));
  fs.appendFileSync(p.destino,cifra.getAuthTag());
  return {estado:'IDENTIDADE_REAL_BACKUP_LOCAL_CIFRADO',
   contas:prova.contas,integridadeSQLite:prova.integridade,
   administracaoIncluida:prova.administracaoIncluida,
   recuperacaoComercialIncluida:prova.recuperacaoComercialIncluida,
   pedidos:prova.pedidos,linhasCustos:prova.linhasCustos,
   remessas:prova.remessas,cotacoes:prova.cotacoes,
   sha256Cifrado:await digest(p.destino),
   tamanhoBytes:fs.statSync(p.destino).size,permissao:'0600',
   copiaOffsiteConfirmada:false,restauracaoOffsiteConfirmada:false,
   backupFinanceiroConfirmado:false};
 }catch(e){
  if(gerado)fs.rmSync(p.destino,{force:true});
  throw e.codigo?e:falha('BACKUP_IDENTIDADE_REAL_FALHOU');
 }finally{
  if(fd!==null)fs.closeSync(fd);
  if(b)try{b.close();}catch{}
  if(chave)chave.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
function bloquearAcessoRestaurado(arquivo){
 const db=new DatabaseSync(arquivo);
 try{
  db.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE;');
  try{
   const sessoes=db.prepare('DELETE FROM loop_real_sessoes').run().changes;
   const temAdmin=!!db.prepare([
    "SELECT 1 FROM sqlite_master WHERE type='table'",
    "AND name='loja_real_sessoes_admin'"
   ].join(' ')).get();
   const sessoesAdminRevogadas=temAdmin?db.prepare(
    'DELETE FROM loja_real_sessoes_admin'
   ).run().changes:0;
   const codigos=db.prepare([
    "UPDATE loop_real_codigos SET estado='BLOQUEADO'",
    "WHERE estado IN ('ENVIADO','RESERVADO')"
   ].join(' ')).run().changes;
   db.exec('COMMIT');
   return {sessoesRevogadas:sessoes,
    sessoesAdminRevogadas,codigosInvalidados:codigos};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.close();}
}
async function restaurarBackupIdentidadeReal({
 origem,destino,chaveBackup,autorizado=false
}={}){
 const p=conferir({origem,destino,chaveBackup,autorizado,restaurar:true});
 const tmp=fs.mkdtempSync(path.join(p.destinoPai,'.loop-real-restore-'));
 fs.chmodSync(tmp,0o700);
 const restaurado=path.join(tmp,'restaurado.sqlite');
 let chave=null;
 try{
  const tamanho=fs.statSync(p.origem).size;
  if(tamanho<=HEADER+TAG)falha('ARQUIVO_BACKUP_REAL_INVALIDO');
  const fd=fs.openSync(p.origem,'r');
  const header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
  try{
   if(fs.readSync(fd,header,0,HEADER,0)!==HEADER||
      fs.readSync(fd,tag,0,TAG,tamanho-TAG)!==TAG||
      !header.subarray(0,MAGIC.length).equals(MAGIC))
    falha('ARQUIVO_BACKUP_REAL_INVALIDO');
  }finally{fs.closeSync(fd);}
  const salt=header.subarray(MAGIC.length,MAGIC.length+16);
  const iv=header.subarray(MAGIC.length+16,HEADER);
  chave=derivar(chaveBackup,salt);
  const cifra=createDecipheriv('aes-256-gcm',chave,iv);
  cifra.setAAD(header);cifra.setAuthTag(tag);
  await pipeline(fs.createReadStream(p.origem,{
   start:HEADER,end:tamanho-TAG-1
  }),cifra,fs.createWriteStream(restaurado,{flags:'wx',mode:0o600}));
  const antes=validarIdentidade(restaurado);
  const invalidacao=bloquearAcessoRestaurado(restaurado);
  validarIdentidade(restaurado);
  // Nunca sobrescrever arquivo preexistente, nem mesmo após corrida.
  fs.linkSync(restaurado,p.destino);
  fs.chmodSync(p.destino,0o600);
  return {estado:'IDENTIDADE_RESTAURADA_EM_ARQUIVO_NOVO',
   contas:antes.contas,integridadeSQLite:'ok',...invalidacao,
   administracaoIncluida:antes.administracaoIncluida,
   recuperacaoComercialIncluida:antes.recuperacaoComercialIncluida,
   pedidos:antes.pedidos,linhasCustos:antes.linhasCustos,
   remessas:antes.remessas,cotacoes:antes.cotacoes,
   destinoExistenteNaoSobrescrito:true,financeiroRealAtivado:false,
   comprovacaoOffsite:false};
 }catch(e){
  if(e.code==='EEXIST')falha('DESTINO_BACKUP_REAL_JA_EXISTE');
  if(e.codigo)throw e;
  falha('RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA');
 }finally{
  if(chave)chave.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
module.exports={validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal};
