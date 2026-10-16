'use strict';

// Ponte EXCLUSIVA de laboratorio: a resposta de compra vem de um
// verificador INJETADO NO SERVIDOR, nunca de um corpo HTTP. Nao e PSP.
const { SimuladorLoop }=require('./simulador-loop');
const { STATUS_CONFIRMADO }=require('./processador-pedidos-simulados');
const {ConfiguracaoValorLoopDemoSQLite}=require('./configuracao-valor-loop-demo-sqlite');
const {IndicacoesLinksComissoesDemoSQLite}=require('./indicacoes-links-comissoes-demo-sqlite');

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
  .filter(p=>p&&p.participanteId===contaId&&p.statusAdesao!=='PRAZO_ENCERRADO').length;
}
class PonteComprasConvitesDemoSQLite{
 constructor({banco,contas,consultarPagamentoConfiavel,pedidosIdentificados=null,configuracaoValor=null,relogio=()=>new Date().toISOString()}={}){
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
   CREATE TABLE IF NOT EXISTS admin_ponte_compras_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    produto_id TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
    confirmado_em TEXT NOT NULL,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0)
   );
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
  if(!linha)return new SimuladorLoop({relogio:this.relogio});
  let snapshot;
  try{snapshot=JSON.parse(linha.snapshot_json);}
  catch{throw new Error('Snapshot de laboratorio corrompido');}
  return SimuladorLoop.restaurarSnapshot(snapshot,{relogio:this.relogio});
 }
 _aplicarConvites(simulador,indicadorId){
  if(!simulador.filas.participantesConhecidos.has(indicadorId))return 0;
  const disponiveis=this.banco.prepare(`
   SELECT v.convidado_id,v.confirmado_em
   FROM admin_ponte_convites_validados_demo v
   LEFT JOIN admin_ponte_convites_aplicados_demo a ON a.convidado_id=v.convidado_id
   WHERE v.indicador_id=? AND a.convidado_id IS NULL
   ORDER BY v.confirmado_em,v.pedido_id
  `).all(indicadorId);
  for(const v of disponiveis){
   const resposta=simulador.registrarIndicacaoSimulada({
    indicadorId,eventoId:'convite-demo-'+v.convidado_id,
    convidouEm:v.confirmado_em
   });
   if(resposta.repetida)throw new Error('Convite aplicado sem registro consistente no ledger');
   this.banco.prepare(`
    INSERT INTO admin_ponte_convites_aplicados_demo(convidado_id,aplicado_em)
    VALUES (?,?)
   `).run(v.convidado_id,this.relogio());
  }
  return disponiveis.length;
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
     posicaoId:anterior.posicao_id,indicacaoNova:false,
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
   const conta=this.contas.buscar(comprovante.contaId);
   if(!conta)throw falha('CONTA_DESCONHECIDA','Conta ficticia nao cadastrada');
   if(comprovante.valorElegivelLoopCentavos<referenciaVigente.valorCentavos){
    // Compra valida da LOJA, sem mexer no snapshot, nas filas ou em convites.
    // A regra de cinco posicoes so se aplica a pedidos elegiveis ao LOOP.
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
     movimentouCatraca:false,registrouPagamentoReal:false};
   }
   const simulador=this._restaurar();
   if(posicoesAtivas(simulador,conta.contaId)>=5){
    throw falha('LIMITE_ATIVO','Limite de cinco posicoes ativas no teste');
   }
   // A promocao exige uma posicao PRÓPRIA do indicador, ainda na fila
   // ou no tabuleiro e comprada ate a confirmacao do indicado.
   // CPF e aceite alteram apenas a cor; nao definem ingresso no LOOP.
   let posicaoAtivaIndicadorId=null;
   if(conta.indicadoPorId){
    const candidatas=[
     ...simulador.filas.filaA,...simulador.filas.filaB,
     simulador.tabuleiro.centro,...simulador.tabuleiro.vagas
    ].filter(p=>p&&p.participanteId===conta.indicadoPorId&&
     p.statusAdesao!=='PRAZO_ENCERRADO'&&p.empresa!==true);
    for(const p of candidatas){
     const adquirida=this.banco.prepare(`
      SELECT 1 FROM admin_ponte_compras_demo
      WHERE conta_id=? AND posicao_id=? AND confirmado_em<=?
     `).get(conta.indicadoPorId,p.id,comprovante.confirmadoEm);
     if(adquirida){posicaoAtivaIndicadorId=p.id;break;}
    }
   }
   const posicao=simulador.registrarPosicaoSimulada({
    nome:conta.nome,participanteId:conta.contaId,
    vendaId:'compra-demo-'+pedidoId,adesaoPendente:true
   });
   if(posicao.repetida)throw new Error('Estado simulado e comprovantes divergentes');
   this.banco.prepare(`
    INSERT INTO admin_ponte_compras_demo
    (pedido_id,conta_id,produto_id,valor_centavos,confirmado_em,posicao_id)
    VALUES (?,?,?,?,?,?)
   `).run(
    pedidoId,conta.contaId,comprovante.produtoId,
    comprovante.valorCentavos,comprovante.confirmadoEm,posicao.posicao.id
   );
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
    posicaoId:posicao.posicao.id,indicacaoNova,
    linkDivulgacaoLiberado:true,
    comissaoSimuladaCentavos:comissao?.valorComissaoCentavos??0,
    percentualBonusAplicado:comissao?.taxaPercentual??null,
    indicadorElegivelBonusExtra:comissao?.elegivelBonusExtra??false,
    filaAtual:simulador.filas.filaA.some(p=>p.id===posicao.posicao.id)?'A':'B',
    compraElegivelLoop:true,posicaoCriada:true,vendaLojaRegistrada:true,
    valorElegivelLoopCentavos:comprovante.valorElegivelLoopCentavos,
    statusAdesao:'PENDENTE',
     valorReferenciaPosicaoCentavos:referenciaVigente.valorCentavos,
    revisaoValorPosicao:referenciaVigente.revisao,
    movimentouCatraca:false,registrouPagamentoReal:false
   };
  }catch(erro){this.banco.exec('ROLLBACK');throw erro;}
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
