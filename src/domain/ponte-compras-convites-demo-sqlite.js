'use strict';

// Ponte EXCLUSIVA de laboratorio: a resposta de compra vem de um
// verificador INJETADO NO SERVIDOR, nunca de um corpo HTTP. Nao e PSP.
const { SimuladorLoop }=require('./simulador-loop');
const { STATUS_CONFIRMADO }=require('./processador-pedidos-simulados');
const {ConfiguracaoValorLoopDemoSQLite}=require('./configuracao-valor-loop-demo-sqlite');
const {IndicacoesLinksComissoesDemoSQLite}=require('./indicacoes-links-comissoes-demo-sqlite');
const {cofreDoEvento,origemDoCentro,centroDoLoop}=require('./destino-financeiro-centro-loop');
const {DESTINOS}=require('./tabuleiro-loop');
const {PreLancamentoCofresV6DemoSQLite}=require('./prelancamento-cofres-v6-demo-sqlite');
const {ConciliacaoCofresV6DemoSQLite}=require('./conciliacao-cofres-v6-demo-sqlite');
const {disponibilidadeCofreDemo}=require('./disponibilidade-cofres-v6-demo-sqlite');
const {ConfiguracaoTravaFilaADemoSQLite}=require('./configuracao-trava-fila-a-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('./auditoria-integridade-operacional-demo');

function falha(codigo,mensagem){
 const e=new Error(mensagem);e.codigo=codigo;return e;
}
function identificador(x,campo){
 if(typeof x!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(x)){
  throw falha('DADOS_INVALIDOS',campo+' invalido');
 }
 return x;
}
function uuid(x,campo){
 if(typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)){
  throw falha('DADOS_INVALIDOS',campo+' invalido');
 }
 return x;
}
function dataConfiavel(x){
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)||
  !Number.isFinite(Date.parse(x))){
  throw falha('DADOS_INVALIDOS','Horario confirmado do teste invalido');
 }
 return new Date(x).toISOString();
}
function validarComprovante(recebido,pedidoId){
 if(!recebido||typeof recebido!=='object'||Array.isArray(recebido)||
  recebido.pedidoId!==pedidoId||recebido.status!==STATUS_CONFIRMADO){
  throw falha('PAGAMENTO_NAO_CONFIRMADO','Somente verificacao interna confirmada pode gerar posicao');
 }
 uuid(recebido.contaId,'contaId');
 identificador(recebido.produtoId,'produtoId');
 if(!Number.isSafeInteger(recebido.valorCentavos)||recebido.valorCentavos<=0){
  throw falha('DADOS_INVALIDOS','Valor simulado invalido');
 }
 const valorElegivelLoopCentavos=recebido.valorElegivelLoopCentavos===undefined?
  recebido.valorCentavos:recebido.valorElegivelLoopCentavos;
 if(!Number.isSafeInteger(valorElegivelLoopCentavos)||
  valorElegivelLoopCentavos<0||valorElegivelLoopCentavos>recebido.valorCentavos)
  throw falha('DADOS_INVALIDOS','Subtotal LOOP invalido');
 return {
  pedidoId,contaId:recebido.contaId,produtoId:recebido.produtoId,
  valorCentavos:recebido.valorCentavos,valorElegivelLoopCentavos,
  confirmadoEm:dataConfiavel(recebido.confirmadoEm),
  intentoPagamentoId:recebido.intentoPagamentoId
 };
}
function posicoesAtivas(simulador,contaId){
 const f=simulador.filas,t=simulador.tabuleiro;
 return [...f.filaA,...f.filaB,t.centro,...t.vagas]
  .filter(p=>p&&p.participanteId===contaId&&p.empresa!==true&&
    !['PRAZO_ENCERRADO','DESISTENTE'].includes(p.statusAdesao)).length;
}
class PonteComprasConvitesDemoSQLite{
 constructor({banco,contas,consultarPagamentoConfiavel,pedidosIdentificados=null,configuracaoValor=null,relogio=()=>new Date().toISOString(),atribuicaoManualPorPosicao=false}={}){
  if(!banco||typeof banco.prepare!=='function'||!contas||
    typeof contas.buscar!=='function'){
   throw new TypeError('SQLite e cadastro de laboratorio sao obrigatorios');
  }
  if(typeof consultarPagamentoConfiavel!=='function'){
   throw new TypeError('Verificador interno de pagamentos simulados obrigatorio');
  }
  if(pedidosIdentificados!==null&&(
    pedidosIdentificados.banco!==banco||typeof pedidosIdentificados.conferir!=='function')){
   throw new TypeError('Pedidos identificados devem compartilhar SQLite com a ponte');
  }
  if(typeof relogio!=='function')throw new TypeError('Relogio de teste invalido');
  this.banco=banco;
  this.contas=contas;
  this.verificador=consultarPagamentoConfiavel;
  this.relogio=relogio;
  this.atribuicaoManualPorPosicao=atribuicaoManualPorPosicao===true;
  this.configuracaoTravaFilaA=new ConfiguracaoTravaFilaADemoSQLite({banco,relogio});
  this.pedidosIdentificados=pedidosIdentificados;
  this.configuracaoValor=configuracaoValor||new ConfiguracaoValorLoopDemoSQLite({banco});
  if(this.configuracaoValor.banco!==banco||
    typeof this.configuracaoValor.vigenteEm!=='function'){
   throw new TypeError('Configuracao de valor LOOP deve usar SQLite compartilhado');
  }
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_ponte_estado_demo(
    id INTEGER PRIMARY KEY CHECK(id=1),
    snapshot_json TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_loop_desistencias_vaga6_demo(
    posicao_id INTEGER PRIMARY KEY CHECK(posicao_id>0),
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    registrado_em TEXT NOT NULL,origem TEXT NOT NULL CHECK(origem='ACEITE_EXPRESSO')
   );
   CREATE TRIGGER IF NOT EXISTS admin_loop_desistencias_vaga6_no_update
    BEFORE UPDATE ON admin_loop_desistencias_vaga6_demo
    BEGIN SELECT RAISE(ABORT,'desistencia de teste imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_loop_desistencias_vaga6_no_delete
    BEFORE DELETE ON admin_loop_desistencias_vaga6_demo
    BEGIN SELECT RAISE(ABORT,'desistencia de teste imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_ponte_compras_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    produto_id TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
    confirmado_em TEXT NOT NULL,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0)
   );
   -- Um unico pedido qualificado pode ter ate seis posicoes se o produto
   -- de pacote foi explicitamente configurado antes do pedido. A posicao 1
   -- permanece no esquema anterior para nao quebrar o historico legado.
   CREATE TABLE IF NOT EXISTS admin_ponte_posicoes_adicionais_demo(
    pedido_id TEXT NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    ordem INTEGER NOT NULL CHECK(ordem BETWEEN 2 AND 6),
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
    PRIMARY KEY(pedido_id,ordem)
   );
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_adicionais_no_update
    BEFORE UPDATE ON admin_ponte_posicoes_adicionais_demo
    BEGIN SELECT RAISE(ABORT,'pacote de posicoes imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_adicionais_no_delete
    BEFORE DELETE ON admin_ponte_posicoes_adicionais_demo
    BEGIN SELECT RAISE(ABORT,'pacote de posicoes imutavel'); END;
   -- Compras de loja com total menor que R$250: sao vendas sem posicao.
   -- A loja e independente do motor de filas e convites.
   CREATE TABLE IF NOT EXISTS admin_ponte_vendas_loja_sem_loop_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    produto_id TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0 AND valor_centavos<25000),
    confirmado_em TEXT NOT NULL,
    intento_pagamento_id TEXT UNIQUE
   );
   CREATE INDEX IF NOT EXISTS idx_ponte_vendas_loja_conta_demo
    ON admin_ponte_vendas_loja_sem_loop_demo(conta_id,confirmado_em);
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vendas_loja_sem_loop_no_update
    BEFORE UPDATE ON admin_ponte_vendas_loja_sem_loop_demo
    BEGIN SELECT RAISE(ABORT,'venda de loja ficticia imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vendas_loja_sem_loop_no_delete
    BEFORE DELETE ON admin_ponte_vendas_loja_sem_loop_demo
    BEGIN SELECT RAISE(ABORT,'venda de loja ficticia imutavel'); END;
   -- Pedidos que ficaram abaixo de um novo padrao maior que R$250.
   -- A tabela de vendas pequenas anterior continua intocada.
   CREATE TABLE IF NOT EXISTS admin_ponte_vendas_loja_apos_reajuste_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    produto_id TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>=25000),
    confirmado_em TEXT NOT NULL,
    intento_pagamento_id TEXT UNIQUE
   );
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vendas_reajuste_no_update
    BEFORE UPDATE ON admin_ponte_vendas_loja_apos_reajuste_demo
    BEGIN SELECT RAISE(ABORT,'venda ficticia imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vendas_reajuste_no_delete
    BEFORE DELETE ON admin_ponte_vendas_loja_apos_reajuste_demo
    BEGIN SELECT RAISE(ABORT,'venda ficticia imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_ponte_posicoes_valores_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    revisao_valor INTEGER NOT NULL REFERENCES admin_valor_loop_versoes_demo(revisao) ON DELETE RESTRICT,
    valor_referencia_centavos INTEGER NOT NULL CHECK(valor_referencia_centavos>=100),
    criado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_valores_no_update
    BEFORE UPDATE ON admin_ponte_posicoes_valores_demo
    BEGIN SELECT RAISE(ABORT,'referencia da posicao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_valores_no_delete
    BEFORE DELETE ON admin_ponte_posicoes_valores_demo
    BEGIN SELECT RAISE(ABORT,'referencia da posicao imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_ponte_vinculos_identificados_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    intento_pagamento_id TEXT NOT NULL UNIQUE,
    verificado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vinculos_identificados_no_update
    BEFORE UPDATE ON admin_ponte_vinculos_identificados_demo
    BEGIN SELECT RAISE(ABORT,'vinculo pedido-pagamento ficticio imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_vinculos_identificados_no_delete
    BEFORE DELETE ON admin_ponte_vinculos_identificados_demo
    BEGIN SELECT RAISE(ABORT,'vinculo pedido-pagamento ficticio imutavel'); END;
   CREATE INDEX IF NOT EXISTS idx_ponte_compras_titular
    ON admin_ponte_compras_demo(conta_id);
   CREATE TABLE IF NOT EXISTS admin_ponte_convites_validados_demo(
    convidado_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    indicador_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    pedido_id TEXT NOT NULL UNIQUE REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    confirmado_em TEXT NOT NULL,
    CHECK(indicador_id<>convidado_id)
   );
   CREATE INDEX IF NOT EXISTS idx_ponte_convites_indicador
    ON admin_ponte_convites_validados_demo(indicador_id,confirmado_em);
   CREATE TABLE IF NOT EXISTS admin_ponte_convites_aplicados_demo(
    convidado_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_ponte_convites_validados_demo(convidado_id) ON DELETE RESTRICT,
    aplicado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_loop_vinculos_indicacao_posicao_demo(
    convidado_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_ponte_convites_validados_demo(convidado_id) ON DELETE RESTRICT,
    indicador_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    posicao_indicador_id INTEGER NOT NULL CHECK(posicao_indicador_id>0),
    registrado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_loop_vinculos_posicao_demo
    ON admin_loop_vinculos_indicacao_posicao_demo(indicador_id,posicao_indicador_id);
   CREATE TRIGGER IF NOT EXISTS admin_loop_vinculos_indicacao_posicao_no_update
    BEFORE UPDATE ON admin_loop_vinculos_indicacao_posicao_demo
    BEGIN SELECT RAISE(ABORT,'vinculo de indicacao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_loop_vinculos_indicacao_posicao_no_delete
    BEFORE DELETE ON admin_loop_vinculos_indicacao_posicao_demo
    BEGIN SELECT RAISE(ABORT,'vinculo de indicacao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_compras_sem_update
    BEFORE UPDATE ON admin_ponte_compras_demo
    BEGIN SELECT RAISE(ABORT,'compras demo imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_compras_sem_delete
    BEFORE DELETE ON admin_ponte_compras_demo
    BEGIN SELECT RAISE(ABORT,'compras demo imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_convites_sem_update
    BEFORE UPDATE ON admin_ponte_convites_validados_demo
    BEGIN SELECT RAISE(ABORT,'convites demo imutaveis'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_convites_sem_delete
    BEFORE DELETE ON admin_ponte_convites_validados_demo
    BEGIN SELECT RAISE(ABORT,'convites demo imutaveis'); END;
  `);
  // Bolas douradas criadas somente pelo administrador do laboratorio.
  // Sem CPF, pedido, pagamento, comissao, receita ou direito de saque.
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_ponte_douradas_manuais_demo(
    evento_id TEXT PRIMARY KEY NOT NULL,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
    criada_em TEXT NOT NULL,
    origem TEXT NOT NULL CHECK(origem='ADMIN_MANUAL_SEM_COMPRA')
   );
   CREATE TRIGGER IF NOT EXISTS admin_douradas_manuais_no_update
    BEFORE UPDATE ON admin_ponte_douradas_manuais_demo
    BEGIN SELECT RAISE(ABORT,'bola dourada imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_douradas_manuais_no_delete
    BEFORE DELETE ON admin_ponte_douradas_manuais_demo
    BEGIN SELECT RAISE(ABORT,'bola dourada imutavel'); END;
  `);
  // Douradas financiadas internamente em ledger separado e imutavel;
  // douradas antigas sem aporte permanecem historicas e nao sao replicadas.
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_ponte_douradas_financiadas_demo(
    evento_id TEXT PRIMARY KEY NOT NULL,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
    criada_em TEXT NOT NULL,
    cofre_origem TEXT NOT NULL CHECK(cofre_origem='LOOP_DIREITA'),
    valor_referencia_centavos INTEGER NOT NULL CHECK(valor_referencia_centavos>0),
    revisao_valor INTEGER NOT NULL REFERENCES admin_valor_loop_versoes_demo(revisao),
    reserva_bruta_antes_centavos INTEGER NOT NULL,
    reserva_livre_antes_centavos INTEGER NOT NULL,
    origem TEXT NOT NULL CHECK(origem='ADMIN_MANUAL_COM_APORTE_RESERVA_DEMO')
   );
   CREATE TRIGGER IF NOT EXISTS admin_ponte_douradas_financiadas_no_update
    BEFORE UPDATE ON admin_ponte_douradas_financiadas_demo
    BEGIN SELECT RAISE(ABORT,'aporte dourada imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_douradas_financiadas_no_delete
    BEFORE DELETE ON admin_ponte_douradas_financiadas_demo
    BEGIN SELECT RAISE(ABORT,'aporte dourada imutavel'); END;
  `);
  // Livro das posicoes adicionais: ampliar CHECK sem tocar os pedidos antigos.
  const antiga=this.banco.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_ponte_posicoes_adicionais_demo'").get()?.sql||'';
  if(antiga.includes('BETWEEN 2 AND 5')){
   this.banco.exec('BEGIN IMMEDIATE');
   try{
    this.banco.exec(`CREATE TABLE admin_ponte_posicoes_adicionais_demo_v6(
     pedido_id TEXT NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
     ordem INTEGER NOT NULL CHECK(ordem BETWEEN 2 AND 6),
     posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
     PRIMARY KEY(pedido_id,ordem))`);
    this.banco.exec('INSERT INTO admin_ponte_posicoes_adicionais_demo_v6 SELECT * FROM admin_ponte_posicoes_adicionais_demo');
    this.banco.exec('DROP TABLE admin_ponte_posicoes_adicionais_demo');
    this.banco.exec('ALTER TABLE admin_ponte_posicoes_adicionais_demo_v6 RENAME TO admin_ponte_posicoes_adicionais_demo');
    this.banco.exec('COMMIT');
   }catch(e){this.banco.exec('ROLLBACK');throw e;}
  }
  this.banco.exec(`
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_adicionais_no_update
    BEFORE UPDATE ON admin_ponte_posicoes_adicionais_demo
    BEGIN SELECT RAISE(ABORT,'pacote de posicoes imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_ponte_posicoes_adicionais_no_delete
    BEFORE DELETE ON admin_ponte_posicoes_adicionais_demo
    BEGIN SELECT RAISE(ABORT,'pacote de posicoes imutavel'); END;
  `);
  // Para bancos do laboratorio criados antes desta atualizacao:
  // atribui a referencia historica unica R$250, sem alterar pedidos.
  banco.prepare(`
   INSERT INTO admin_ponte_posicoes_valores_demo(
    pedido_id,revisao_valor,valor_referencia_centavos,criado_em)
   SELECT c.pedido_id,1,25000,c.confirmado_em
   FROM admin_ponte_compras_demo c
   WHERE NOT EXISTS (
    SELECT 1 FROM admin_ponte_posicoes_valores_demo v
    WHERE v.pedido_id=c.pedido_id
   )
  `).run();
  this.linksComissoes=new IndicacoesLinksComissoesDemoSQLite({banco,contas});
 }
 _restaurar(){
  const linha=this.banco.prepare(
   'SELECT snapshot_json FROM admin_ponte_estado_demo WHERE id=1'
  ).get();
  if(!linha){
    const sim=new SimuladorLoop({relogio:this.relogio});
    sim.filas.travaPromocaoAtiva=this.atribuicaoManualPorPosicao;
    sim.filas.vagaLiberacao=this.configuracaoTravaFilaA.consultar().vagaLiberacao;
    return sim;
  }
  let snapshot;
  try{snapshot=JSON.parse(linha.snapshot_json);}
  catch{throw new Error('Snapshot de laboratorio corrompido');}
  const sim=SimuladorLoop.restaurarSnapshot(snapshot,{relogio:this.relogio});
  sim.filas.travaPromocaoAtiva=this.atribuicaoManualPorPosicao;
  sim.filas.vagaLiberacao=this.configuracaoTravaFilaA.consultar().vagaLiberacao;
  if(this.atribuicaoManualPorPosicao&&!snapshot.filas.ultimaPromovidaPorTitular){
    // Snapshot antigo: nao desfazer promocao existente nem duplicar fila A.
    const ativas=[...sim.filas.filaA,...sim.tabuleiro.vagas,sim.tabuleiro.centro]
      .filter(p=>p&&(p.fila==='A'||p.origemFila==='A'));
    for(const p of ativas){
      if(!sim.filas.ultimaPromovidaPorTitular.has(p.participanteId))
        sim.filas.ultimaPromovidaPorTitular.set(p.participanteId,{posicaoId:p.id,menorVaga:7});
    }
  }
  return sim;
 }
 _aplicarConvites(simulador,indicadorId){
  if(!simulador.filas.participantesConhecidos.has(indicadorId))return 0;
  const disponiveis=this.banco.prepare(`
   SELECT v.convidado_id,v.confirmado_em,m.posicao_indicador_id AS posicaoIndicadorId
   FROM admin_ponte_convites_validados_demo v
   LEFT JOIN admin_ponte_convites_aplicados_demo a ON a.convidado_id=v.convidado_id
   LEFT JOIN admin_loop_vinculos_indicacao_posicao_demo m ON m.convidado_id=v.convidado_id
   WHERE v.indicador_id=? AND a.convidado_id IS NULL
    AND (?=0 OR m.posicao_indicador_id IS NOT NULL)
   ORDER BY v.confirmado_em,v.pedido_id
  `).all(indicadorId,this.atribuicaoManualPorPosicao?1:0);
  for(const v of disponiveis){
   const resposta=simulador.registrarIndicacaoSimulada({
    indicadorId,eventoId:'convite-demo-'+v.convidado_id,
    convidouEm:v.confirmado_em,
    ...(this.atribuicaoManualPorPosicao?{posicaoAlvoId:v.posicaoIndicadorId}:{})
   });
   if(resposta.repetida)throw new Error('Convite aplicado sem registro consistente no ledger');
   this.banco.prepare(`
    INSERT INTO admin_ponte_convites_aplicados_demo(convidado_id,aplicado_em)
    VALUES (?,?)
   `).run(v.convidado_id,this.relogio());
  }
  return disponiveis.length;
 }

 // Vínculo definitivo de um indicado confirmado com apenas uma posição ativa.
 atribuirIndicacao({contaId,convidadoId,posicaoId}={}){
  if(!this.atribuicaoManualPorPosicao)throw falha('ATRIBUICAO_MANUAL_INDISPONIVEL');
  if(typeof contaId!=='string'||typeof convidadoId!=='string'||
    !Number.isSafeInteger(posicaoId)||posicaoId<1)throw falha('DADOS_ATRIBUICAO_INVALIDOS');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const v=this.banco.prepare(`
    SELECT v.indicador_id AS indicadorId,m.posicao_indicador_id AS atribuida
    FROM admin_ponte_convites_validados_demo v
    LEFT JOIN admin_loop_vinculos_indicacao_posicao_demo m ON m.convidado_id=v.convidado_id
    WHERE v.convidado_id=?
   `).get(convidadoId);
   if(!v||v.indicadorId!==contaId)throw falha('INDICACAO_NAO_PERTENCE_A_CONTA');
   if(v.atribuida!==null){
    if(v.atribuida!==posicaoId)throw falha('INDICACAO_JA_VINCULADA');
    this.banco.exec('COMMIT');
    return {convidadoId,posicaoId,vinculada:true,repetida:true};
   }
   const sim=this._restaurar();
   const alvo=[...sim.filas.filaA,...sim.filas.filaB,
    sim.tabuleiro.centro,...sim.tabuleiro.vagas].find(p=>
    p&&p.id===posicaoId&&p.participanteId===contaId&&p.empresa!==true);
   if(!alvo)throw falha('POSICAO_NAO_ELEGIVEL');
   if(alvo.statusAdesao==='PENDENTE'||!this.banco.prepare(
    'SELECT 1 FROM admin_loop_adesoes_posicoes_demo WHERE posicao_id=? AND conta_id=?'
   ).get(posicaoId,contaId))throw falha('POSICAO_NAO_ATIVA');
   if(!this.banco.prepare(
    'SELECT 1 FROM admin_loop_adesoes_posicoes_demo WHERE conta_id=? LIMIT 1'
   ).get(convidadoId))throw falha('INDICADO_AGUARDANDO_ATIVACAO');
   if(this.banco.prepare(
    'SELECT 1 FROM admin_ponte_convites_aplicados_demo WHERE convidado_id=?'
   ).get(convidadoId))throw falha('INDICACAO_LEGADA_JA_APLICADA');
   this.banco.prepare(`
    INSERT INTO admin_loop_vinculos_indicacao_posicao_demo
    (convidado_id,indicador_id,posicao_indicador_id,registrado_em)
    VALUES(?,?,?,?)
   `).run(convidadoId,contaId,posicaoId,this.relogio());
   if(this._aplicarConvites(sim,contaId)!==1)
    throw new Error('Atribuicao deve gerar exatamente um evento');
   this.banco.prepare(`
    INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)
    ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
   `).run(JSON.stringify(sim.exportarSnapshot()));
   this.banco.exec('COMMIT');
   return {convidadoId,posicaoId,vinculada:true,repetida:false,semPagamentoReal:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 async processar({pedidoId}={}){
  identificador(pedidoId,'pedidoId');
  // Consulta a fonte interna antes da transacao. Usuario nao injeta
  // status, preco, titular ou horario em nenhuma rota publica.
  const comprovante=validarComprovante(
   await this.verificador(pedidoId),pedidoId
  );
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   // A identidade do pedido precisa existir ANTES da compra. O
   // comprovante so valida, nunca cria ou troca titularidade.
   const pedidoVinculado=this.pedidosIdentificados?
    this.pedidosIdentificados.conferir(comprovante):null;
   const anterior=this.banco.prepare(`
    SELECT pedido_id,conta_id,produto_id,valor_centavos,confirmado_em,posicao_id
    FROM admin_ponte_compras_demo WHERE pedido_id=?
   `).get(pedidoId);
   if(anterior){
    if(anterior.conta_id!==comprovante.contaId||
      anterior.produto_id!==comprovante.produtoId||
      anterior.valor_centavos!==comprovante.valorCentavos||
      anterior.confirmado_em!==comprovante.confirmadoEm){
     throw falha('PEDIDO_DIVERGENTE','Pedido ja registrado com dados diferentes');
    }
    if(pedidoVinculado){
     const vinculo=this.banco.prepare(
      'SELECT intento_pagamento_id AS intentoPagamentoId FROM admin_ponte_vinculos_identificados_demo WHERE pedido_id=?'
     ).get(pedidoId);
     if(!vinculo||vinculo.intentoPagamentoId!==pedidoVinculado.intentoPagamentoId){
      throw falha('VINCULO_DIVERGENTE','Compra anterior nao possui o mesmo pedido identificado');
     }
    }
    this.banco.exec('COMMIT');
    const anteriorValor=this.banco.prepare(`
     SELECT revisao_valor AS revisaoValor,
      valor_referencia_centavos AS valorReferenciaCentavos
     FROM admin_ponte_posicoes_valores_demo WHERE pedido_id=?
    `).get(pedidoId);
    return {
     repetido:true,criado:false,pedidoId,contaId:anterior.conta_id,
     posicaoId:anterior.posicao_id,
     posicaoIds:[anterior.posicao_id,...this.banco.prepare(
      'SELECT posicao_id AS id FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=? ORDER BY ordem'
     ).all(pedidoId).map(r=>r.id)],
     indicacaoNova:false,
     compraElegivelLoop:true,posicaoCriada:true,vendaLojaRegistrada:true,
     valorElegivelLoopCentavos:comprovante.valorElegivelLoopCentavos,
     revisaoValorPosicao:anteriorValor.revisaoValor,
     valorReferenciaPosicaoCentavos:anteriorValor.valorReferenciaCentavos
    };
   }
   const lojaAnterior=this.banco.prepare(`
    SELECT pedido_id,conta_id,produto_id,valor_centavos,
     confirmado_em,intento_pagamento_id
    FROM (
     SELECT * FROM admin_ponte_vendas_loja_sem_loop_demo
     UNION ALL
     SELECT * FROM admin_ponte_vendas_loja_apos_reajuste_demo
    ) WHERE pedido_id=?
   `).get(pedidoId);
   if(lojaAnterior){
    if(lojaAnterior.conta_id!==comprovante.contaId||
      lojaAnterior.produto_id!==comprovante.produtoId||
      lojaAnterior.valor_centavos!==comprovante.valorCentavos||
      lojaAnterior.confirmado_em!==comprovante.confirmadoEm||
      lojaAnterior.intento_pagamento_id!==(pedidoVinculado?.intentoPagamentoId??null)){
     throw falha('PEDIDO_DIVERGENTE','Venda de loja ja registrada com dados diferentes');
    }
    this.banco.exec('COMMIT');
    return {repetido:true,criado:false,pedidoId,contaId:lojaAnterior.conta_id,
     compraElegivelLoop:false,posicaoCriada:false,vendaLojaRegistrada:true,
     posicaoId:null,filaAtual:null,indicacaoNova:false};
   }
   const referenciaVigente=this.configuracaoValor.vigenteEm(comprovante.confirmadoEm);
   // Somente um pedido do carrinho, com regras congeladas no SQLite,
   // pode solicitar seis posicoes. Um campo externo nao pode forcar pacote.
   const pacoteTabela=comprovante.produtoId==='carrinho-loop-demo'&&
    !!this.banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_carrinho_item_pacote_posicoes_demo'").get();
   const pacote=pacoteTabela?this.banco.prepare(`
    SELECT k.posicoes_por_pedido AS quantidade,i.subtotal_centavos AS subtotal,
     e.subtotal_elegivel_centavos AS elegivel,
     i.quantidade AS unidades,q.quantidade_minima AS minima
    FROM admin_carrinho_item_pacote_posicoes_demo k
    JOIN admin_carrinho_loop_itens_demo i
     ON i.pedido_id=k.pedido_id AND i.ordem=k.ordem
    JOIN admin_carrinho_item_elegibilidade_demo e
     ON e.pedido_id=k.pedido_id AND e.ordem=k.ordem
    JOIN admin_carrinho_item_quantidade_minima_demo q
     ON q.pedido_id=k.pedido_id AND q.ordem=k.ordem
    WHERE k.pedido_id=? AND k.posicoes_por_pedido BETWEEN 2 AND 6
     AND e.elegivel_loop=1 AND i.quantidade>=q.quantidade_minima
   `).all(pedidoId):[];
   const quantidadePosicoes=pacote.length?Math.max(...pacote.map(p=>p.quantidade)):1;
   // Uma cadeira do pacote gera seu proprio ciclo; exigir ao menos seis
   // referencias no subtotal do(s) produto(s) ESPECIAIS, antes de custos.
   if(quantidadePosicoes>1&&
    pacote.reduce((v,p)=>v+p.elegivel,0)<quantidadePosicoes*referenciaVigente.valorCentavos)
    throw falha('PACOTE_VALOR_INSUFICIENTE','Pacote de posicoes abaixo do numero de referencias LOOP');
   const conta=this.contas.buscar(comprovante.contaId);
   if(!conta)throw falha('CONTA_DESCONHECIDA','Conta ficticia nao cadastrada');
   if(comprovante.valorElegivelLoopCentavos<referenciaVigente.valorCentavos){
    // Compra valida da LOJA, sem mexer no snapshot, nas filas ou em convites.
    // A regra de seis posicoes so se aplica a pedidos elegiveis ao LOOP.
    // As tabelas legadas separam pelo valor TOTAL efetivamente comprado,
    // nao pelo subtotal elegivel. A decisao de criar cadeira acima ja
    // usou somente valorElegivelLoopCentavos.
    const tabelaLoja=comprovante.valorCentavos<25000?
      'admin_ponte_vendas_loja_sem_loop_demo':
      'admin_ponte_vendas_loja_apos_reajuste_demo';
    this.banco.prepare(`
     INSERT INTO ${tabelaLoja}
     (pedido_id,conta_id,produto_id,valor_centavos,confirmado_em,intento_pagamento_id)
     VALUES (?,?,?,?,?,?)
    `).run(pedidoId,conta.contaId,comprovante.produtoId,
      comprovante.valorCentavos,comprovante.confirmadoEm,
      pedidoVinculado?.intentoPagamentoId??null);
    this.banco.exec('COMMIT');
    return {criado:true,repetido:false,pedidoId,contaId:conta.contaId,
     compraElegivelLoop:false,posicaoCriada:false,vendaLojaRegistrada:true,
     posicaoId:null,filaAtual:null,indicacaoNova:false,
     linkDivulgacaoLiberado:true,comissaoSimuladaCentavos:0,
     valorElegivelLoopCentavos:comprovante.valorElegivelLoopCentavos,
     movimentouCatraca:false,registrouPagamentoReal:false,
     motivoSemPosicao:'COMPRA_NAO_QUALIFICADA'};
   }
   const simulador=this._restaurar();
   if(posicoesAtivas(simulador,conta.contaId)+quantidadePosicoes>6)
    throw falha('LIMITE_ATIVO','Limite de seis posicoes ativas no teste');
   // A promocao exige uma posicao PRÓPRIA do indicador, ainda na fila
   // ou no tabuleiro e comprada ate a confirmacao do indicado.
   // CPF e aceite liberam bonus; cadeira propria determina percentual superior.
   let posicaoAtivaIndicadorId=null;
   if(conta.indicadoPorId){
    const candidatas=[
     ...simulador.filas.filaA,...simulador.filas.filaB,
     simulador.tabuleiro.centro,...simulador.tabuleiro.vagas
    ].filter(p=>p&&p.participanteId===conta.indicadoPorId&&
     p.statusAdesao!=='PRAZO_ENCERRADO'&&p.empresa!==true);
    for(const p of candidatas){
     const adquirida=this.banco.prepare(`
      SELECT 1 FROM admin_ponte_compras_demo c
      WHERE c.conta_id=? AND c.confirmado_em<=? AND
       (c.posicao_id=? OR EXISTS (
        SELECT 1 FROM admin_ponte_posicoes_adicionais_demo a
        WHERE a.pedido_id=c.pedido_id AND a.posicao_id=?
       ))
     `).get(conta.indicadoPorId,comprovante.confirmadoEm,p.id,p.id);
     if(adquirida){posicaoAtivaIndicadorId=p.id;break;}
    }
   }
   const aceiteAnterior=this.linksComissoes.adesaoVigente(conta.contaId,comprovante.confirmadoEm);
   const novasPosicoes=[];
   for(let ordem=1;ordem<=quantidadePosicoes;ordem++){
    const posicao=simulador.registrarPosicaoSimulada({
     nome:conta.nome,participanteId:conta.contaId,
     vendaId:'compra-demo-'+pedidoId+(ordem>1?'-'+ordem:''),
     adesaoPendente:this.atribuicaoManualPorPosicao||!aceiteAnterior
    });
    if(posicao.repetida)throw new Error('Estado simulado e comprovantes divergentes');
    if(aceiteAnterior&&!this.atribuicaoManualPorPosicao){
     const nova=simulador.filas.filaB.find(p=>p.id===posicao.posicao.id);
     nova.statusAdesao='ATIVA';nova.ativadaEm=comprovante.confirmadoEm;
     posicao.posicao.statusAdesao='ATIVA';posicao.posicao.ativadaEm=comprovante.confirmadoEm;
     this.banco.prepare(`
      INSERT INTO admin_loop_adesoes_posicoes_demo(posicao_id,conta_id,ativada_em)
      VALUES (?,?,?)
     `).run(nova.id,conta.contaId,comprovante.confirmadoEm);
    }
    novasPosicoes.push(posicao.posicao);
   }
   const posicao= {posicao:novasPosicoes[0]};
   this.banco.prepare(`
    INSERT INTO admin_ponte_compras_demo
    (pedido_id,conta_id,produto_id,valor_centavos,confirmado_em,posicao_id)
    VALUES (?,?,?,?,?,?)
   `).run(pedidoId,conta.contaId,comprovante.produtoId,
    comprovante.valorCentavos,comprovante.confirmadoEm,posicao.posicao.id);
   for(let ordem=2;ordem<=novasPosicoes.length;ordem++){
    this.banco.prepare(`
     INSERT INTO admin_ponte_posicoes_adicionais_demo(pedido_id,ordem,posicao_id)
     VALUES (?,?,?)
    `).run(pedidoId,ordem,novasPosicoes[ordem-1].id);
   }
   if(pedidoVinculado){
    this.banco.prepare(`
     INSERT INTO admin_ponte_vinculos_identificados_demo
     (pedido_id,intento_pagamento_id,verificado_em) VALUES(?,?,?)
    `).run(pedidoId,pedidoVinculado.intentoPagamentoId,comprovante.confirmadoEm);
   }
   this.banco.prepare(`
    INSERT INTO admin_ponte_posicoes_valores_demo
      (pedido_id,revisao_valor,valor_referencia_centavos,criado_em)
    VALUES (?,?,?,?)
   `).run(pedidoId,referenciaVigente.revisao,
     referenciaVigente.valorCentavos,comprovante.confirmadoEm);
   let indicacaoNova=false;
   if(conta.indicadoPorId){
    const conviteExistente=this.banco.prepare(`
     SELECT convidado_id FROM admin_ponte_convites_validados_demo
     WHERE convidado_id=?
    `).get(conta.contaId);
    if(!conviteExistente){
     this.banco.prepare(`
      INSERT INTO admin_ponte_convites_validados_demo
      (convidado_id,indicador_id,pedido_id,confirmado_em)
      VALUES (?,?,?,?)
     `).run(conta.contaId,conta.indicadoPorId,pedidoId,comprovante.confirmadoEm);
     indicacaoNova=true;
    }
   }
   // Uma comissao por POSICAO criada por indicado, nao sobre o total
   // da venda ou do cadastro. O indicador nao precisa ter cadeira.
   const comissao=conta.indicadoPorId?
    this.linksComissoes.comissaoDaPosicao({
     pedidoId,indicadorId:conta.indicadoPorId,
     convidadoId:conta.contaId,posicaoId:posicao.posicao.id,
     referencia:referenciaVigente,quando:comprovante.confirmadoEm,
     posicaoAtivaIndicadorId
    }):null;
   // O indicador sem compra ainda nao esta no motor: preservar sua
   // indicacao validada ate que ele tenha uma posicao propria.
   this._aplicarConvites(simulador,conta.contaId);
   if(conta.indicadoPorId){
    this._aplicarConvites(simulador,conta.indicadoPorId);
   }
   const estado=JSON.stringify(simulador.exportarSnapshot());
   this.banco.prepare(`
    INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES (1,?)
    ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
   `).run(estado);
   this.banco.exec('COMMIT');
   return {
    criado:true,repetido:false,pedidoId,contaId:conta.contaId,
    posicaoId:posicao.posicao.id,
    posicaoIds:novasPosicoes.map(p=>p.id),
    posicoesCriadas:novasPosicoes.length,indicacaoNova,
    linkDivulgacaoLiberado:true,
    comissaoSimuladaCentavos:comissao?.valorComissaoCentavos??0,
    percentualBonusAplicado:comissao?.taxaPercentual??null,
    indicadorElegivelBonusExtra:comissao?.elegivelBonusExtra??false,
    filaAtual:simulador.filas.filaA.some(p=>p.id===posicao.posicao.id)?'A':'B',
    compraElegivelLoop:true,posicaoCriada:true,vendaLojaRegistrada:true,
    valorElegivelLoopCentavos:comprovante.valorElegivelLoopCentavos,
    statusAdesao:aceiteAnterior?'ATIVA':'PENDENTE',
     valorReferenciaPosicaoCentavos:referenciaVigente.valorCentavos,
    revisaoValorPosicao:referenciaVigente.revisao,
    movimentouCatraca:false,registrouPagamentoReal:false
   };
  }catch(erro){this.banco.exec('ROLLBACK');throw erro;}
 }
 // Somente a DOURADA manual compromete a reserva de seguranca.
 // Azul que vira dourada ja veio de compra e nao sofre segunda cobranca.
 criarDouradaManualDemo({eventoId}={}){
  if(typeof eventoId!=='string'||!/^[a-z0-9-]{3,80}$/.test(eventoId))
   throw falha('EVENTO_DOURADA_INVALIDO','Identificador administrativo invalido');
  const banco=this.banco;banco.exec('BEGIN IMMEDIATE');
  try{
   const existente=banco.prepare(`
    SELECT evento_id AS eventoId,posicao_id AS posicaoId,
     criada_em AS criadaEm,valor_referencia_centavos AS valorReferenciaCentavos
    FROM admin_ponte_douradas_financiadas_demo WHERE evento_id=?
   `).get(eventoId);
   if(existente){
    banco.exec('COMMIT');return {...existente,repetida:true,
     origem:'ADMIN_MANUAL_COM_APORTE_RESERVA_DEMO',
     aporteRegistrado:true,semPagamentoReal:true};
   }
   if(banco.prepare('SELECT 1 FROM admin_ponte_douradas_manuais_demo WHERE evento_id=?').get(eventoId))
    throw falha('EVENTO_DOURADA_LEGADO','Id reservado em dourada antiga');
   const ref=this.configuracaoValor.atual();
   const pre=new PreLancamentoCofresV6DemoSQLite({banco,ponte:this});
   if(!pre.estado())throw falha('RESERVA_NAO_CONFIGURADA','Cofres demonstrativos nao configurados');
   const conciliado=new ConciliacaoCofresV6DemoSQLite({banco,preLancamento:pre,livro:pre.livro}).conferir();
   if(conciliado.quantidadeDivergencias||conciliado.fase==='INATIVO')
    throw falha('CONCILIACAO_COFRES_DIVERGENTE','Reserva demonstrativa inconsistente');
   const saldoBruto=conciliado.cofreDireitaSimuladoCentavos;
   // A mesma reserva de seguranca sustenta bonus e douradas: calcular
   // antes de liberar qualquer NOVA posicao, sem usar o caixa central.
   const disponivel=disponibilidadeCofreDemo(banco,{
    cofreId:'LOOP_DIREITA',saldoBrutoCentavos:saldoBruto
   });
   const livre=disponivel.saldoLivreDemonstrativoCentavos;
   if(!Number.isSafeInteger(livre)||livre<ref.valorCentavos)
    throw falha('SALDO_RESERVA_INSUFICIENTE','Saldo demonstrativo insuficiente');
   const sim=this._restaurar();
   const nova=sim.registrarPosicaoSimulada({
    nome:'Posição dourada LOOP',participanteId:'LOOP_EMPRESA'
   }).posicao;
   const p=sim.filas.filaB.find(x=>x.id===nova.id);
   p.empresa=true;p.titularOperacional='LOOP_EMPRESA';
   p.statusAdesao='POSICAO_LOOP';
   p.origemOperacional='ADMIN_MANUAL_COM_APORTE_RESERVA_DEMO';
   p.geradaSemCompra=false;p.aporteInternoCentavos=ref.valorCentavos;
   p.revisaoValorPosicao=ref.revisao;
   const data=this.relogio();
   banco.prepare(`
    INSERT INTO admin_ponte_douradas_financiadas_demo(
     evento_id,posicao_id,criada_em,cofre_origem,
     valor_referencia_centavos,revisao_valor,reserva_bruta_antes_centavos,
     reserva_livre_antes_centavos,origem)
    VALUES(?,?,?,'LOOP_DIREITA',?,?,?,?,'ADMIN_MANUAL_COM_APORTE_RESERVA_DEMO')
   `).run(eventoId,p.id,data,ref.valorCentavos,ref.revisao,saldoBruto,livre);
   banco.prepare(`
    INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)
    ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
   `).run(JSON.stringify(sim.exportarSnapshot()));
   banco.exec('COMMIT');
   return {eventoId,posicaoId:p.id,criadaEm:data,repetida:false,
    origem:p.origemOperacional,fila:'B',cor:'DOURADO',
    cofreOrigem:'LOOP_DIREITA',valorReferenciaCentavos:ref.valorCentavos,
    revisaoValor:ref.revisao,reservaBrutaAntesCentavos:saldoBruto,
    reservaDisponivelDepoisCentavos:livre-ref.valorCentavos,
    aporteRegistrado:true,receitaNovaCentavos:0,
    bancoConciliado:false,semPagamentoReal:true,semCPF:true,semComissao:true};
  }catch(e){banco.exec('ROLLBACK');throw e;}
 }
 // Preenchimento ADMINISTRATIVO local, sem criar pagamentos ou vendas.
 prepararTabuleiroDemo(){
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const sim=this._restaurar();
   const estado=sim.prepararTabuleiro();
   this.banco.prepare(`
    INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)
    ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
   `).run(JSON.stringify(sim.exportarSnapshot()));
   this.banco.exec('COMMIT');
   return {tabuleiro:estado,semPagamentoReal:true,
    operacao:'PREENCHIMENTO_MANUAL_FICTICIO'};
  }catch(err){this.banco.exec('ROLLBACK');throw err;}
 }
 // Auditoria de ponta a ponta dos destinos, sem registrar dinheiro inexistente.
 // As vendas do motor sao marcadores da SIMULACAO, nao comprovantes de PSP.
 auditarIntegridadeOperacionalDemo(){
  return auditarIntegridadeOperacionalDemo(this);
 }
 auditarCicloFinanceiroDemo({cicloNumero}={}){
  if(!Number.isSafeInteger(cicloNumero)||cicloNumero<1||cicloNumero>1000000)
   throw falha('CICLO_INVALIDO');
  const sim=this._restaurar();
  const t=sim.tabuleiro;
  const completos=t.ciclosConcluidos.length;
  let centro,vendas,concluido;
  if(cicloNumero<=completos){
   const c=t.ciclosConcluidos[cicloNumero-1];
   centro=c.centro;vendas=c.vendas;concluido=true;
  }else if(cicloNumero===completos+1){
   centro=t.centro;vendas=t.vendasDoCiclo;concluido=false;
  }else throw falha('CICLO_INEXISTENTE');
  if(!centro)throw falha('CENTRO_AUSENTE');
  const seisEventos=vendas.length===DESTINOS.length;
  const resultados=vendas.map((v,i)=>{
   const ordem=i+1;
   const cofrePrevisto=cofreDoEvento({posicaoCentro:centro,ordem});
   const correto=v.ordem===ordem&&v.posicaoCentroId===centro.id&&
    v.destinoPrevisto===DESTINOS[i]&&v.ciclo===cicloNumero&&
    v.destinoCofre===cofrePrevisto;
   return {ordem,cofrePrevisto,cofreRegistrado:v.destinoCofre||null,
    vendaId:v.vendaId,registroCoerente:correto,
    recebimentoPSPComprovado:false,valorLiquidadoCentavos:null};
  });
  const coerente=resultados.every(x=>x.registroCoerente)&&vendas.length<=DESTINOS.length;
  return {cicloNumero,centroPosicaoId:centro.id,
   centroTitular:'LOOP_EMPRESA'===centro.titularOperacional||centroDoLoop(centro)?'LOOP_EMPRESA':'PARTICIPANTE',
   origemCentro:origemDoCentro(centro),
   cofreParcelasCentro:centroDoLoop(centro)?'LOOP_DOURADAS':'LOOP_CENTRO',
   vendaEventoCount:vendas.length,concluidoNoTabuleiro:concluido,
   seisEventosRegistrados:seisEventos,
   destinosConferidos:coerente,
   aptoAConferirDestinos:seisEventos&&coerente,
   recebimentosFinanceirosComprovados:false,
   podeGerarCreditoFinanceiro:false,
   transferenciasReais:false,
   eventos:resultados};
 }
 // Desistencia EXPRESSA do titular na vaga 6, so em ambiente ficticio.
 desistirDaVaga6Demo({contaId,posicaoId,aceiteExpresso}={}){
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  if(!Number.isSafeInteger(posicaoId)||posicaoId<=0||aceiteExpresso!==true)
   throw falha('ACEITE_DESISTENCIA_OBRIGATORIO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare(
    'SELECT conta_id FROM admin_loop_desistencias_vaga6_demo WHERE posicao_id=?'
   ).get(posicaoId);
   if(anterior){
    if(anterior.conta_id!==contaId)throw falha('POSICAO_NAO_PERTENCE_A_CONTA');
    this.banco.exec('COMMIT');
    return {posicaoId,assumidaPeloLoop:true,repetida:true,
     caixaDasDouradas:'LOOP_DOURADAS',pagamentoReal:false};
   }
   const sim=this._restaurar();
   const pos=sim.tabuleiro.vagas[5];
   if(!pos||pos.id!==posicaoId||pos.participanteId!==contaId)
    throw falha('POSICAO_FORA_DA_VAGA_6');
   const resultado=sim.registrarDesistenciaNaVaga6Simulada({posicaoId,aceiteExpresso});
   this.banco.prepare(
    'INSERT INTO admin_loop_desistencias_vaga6_demo(posicao_id,conta_id,registrado_em,origem) VALUES(?,?,?,?)'
   ).run(posicaoId,contaId,resultado.registradaEm,'ACEITE_EXPRESSO');
   this.banco.prepare(
    'INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json'
   ).run(JSON.stringify(sim.exportarSnapshot()));
   this.banco.exec('COMMIT');
   return {...resultado,repetida:false,caixaDasDouradas:'LOOP_DOURADAS',
    semDevolucaoAutomatica:true,pagamentoReal:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 consultar(){
  const sim=this._restaurar();
  const compras=this.banco.prepare(`
   SELECT pedido_id AS pedidoId,conta_id AS contaId,
    produto_id AS produtoId,valor_centavos AS valorCentavos,
    confirmado_em AS confirmadoEm,posicao_id AS posicaoId
   FROM admin_ponte_compras_demo ORDER BY confirmado_em,pedido_id
  `).all();
  const convites=this.banco.prepare(`
   SELECT v.convidado_id AS convidadoId,
    v.indicador_id AS indicadorId,
    v.pedido_id AS pedidoId,v.confirmado_em AS confirmadoEm,
    CASE WHEN a.convidado_id IS NULL THEN 0 ELSE 1 END AS aplicadoNoMotor
   FROM admin_ponte_convites_validados_demo v
   LEFT JOIN admin_ponte_convites_aplicados_demo a ON a.convidado_id=v.convidado_id
   ORDER BY v.confirmado_em,v.pedido_id
  `).all().map(v=>({...v,aplicadoNoMotor:!!v.aplicadoNoMotor}));
  return {
   modo:'COMPRAS_E_CONVITES_EXCLUSIVAMENTE_SIMULADOS',
   semPagamentoReal:true,semCPF:true,semSessaoPublica:true,
   catracaMovimentada:false,compraNaoConfirmaBeneficioReal:true,
   compras,convites,
   douradasManuais:this.banco.prepare(`
    SELECT evento_id AS eventoId,posicao_id AS posicaoId,criada_em AS criadaEm,
     origem,0 AS valorReferenciaCentavos
    FROM admin_ponte_douradas_manuais_demo
    UNION ALL
    SELECT evento_id,posicao_id,criada_em,origem,valor_referencia_centavos
    FROM admin_ponte_douradas_financiadas_demo
    ORDER BY posicaoId
   `).all(),
   comissoesSimuladas:this.banco.prepare(`
    SELECT pedido_id AS pedidoId,indicador_id AS indicadorId,
     convidado_id AS convidadoId,posicao_id AS posicaoId,
     valor_posicao_centavos AS basePosicaoCentavos,
     10 AS percentual,taxa_base_pontos AS taxaBasePontos,
     valor_comissao_centavos AS valorComissaoCentavos,calculado_em AS calculadoEm
    FROM admin_comissoes_indicacoes_demo
    UNION ALL
    SELECT pedido_id,indicador_id,convidado_id,posicao_id,
     valor_posicao_centavos,percentual,percentual*100,
     valor_comissao_centavos,calculado_em
    FROM admin_comissoes_indicacoes_v2_demo
    ORDER BY calculadoEm,pedidoId
   `).all(),
   valoresDeCadaPosicao:this.banco.prepare(`
    SELECT c.pedido_id AS pedidoId,c.posicao_id AS posicaoId,
      v.revisao_valor AS revisaoValor,
      v.valor_referencia_centavos AS valorReferenciaCentavos,
      v.criado_em AS confirmadoEm
    FROM admin_ponte_compras_demo c
    JOIN admin_ponte_posicoes_valores_demo v ON v.pedido_id=c.pedido_id
    ORDER BY c.confirmado_em,c.pedido_id
   `).all(),
   referenciaAtualLoop:this.configuracaoValor.atual(),
   comprasLojaSemLoop:this.banco.prepare(`
    SELECT pedido_id AS pedidoId,conta_id AS contaId,
     produto_id AS produtoId,valor_centavos AS valorCentavos,
     confirmado_em AS confirmadoEm
    FROM (
     SELECT * FROM admin_ponte_vendas_loja_sem_loop_demo
     UNION ALL
     SELECT * FROM admin_ponte_vendas_loja_apos_reajuste_demo
    ) ORDER BY confirmado_em,pedido_id
   `).all(),
   pedidosIdentificadosObrigatorios:!!this.pedidosIdentificados,
   vinculosIdentificados:this.banco.prepare(
    'SELECT COUNT(*) AS quantidade FROM admin_ponte_vinculos_identificados_demo'
   ).get().quantidade,
   filas:sim.estado().filas,
   tabuleiro:sim.estado().tabuleiro
  };
 }
}
module.exports={PonteComprasConvitesDemoSQLite,validarComprovante,posicoesAtivas};
