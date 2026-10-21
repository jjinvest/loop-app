'use strict';

// Exclusivamente para demonstracao local. Um link carrega seu proprio
// codigo imutavel de rastreio; o apelido alteravel nao e a identidade.
const {randomUUID}=require('node:crypto');
const {ConfiguracaoTaxaIndicacaoDemoSQLite}=require('./configuracao-taxa-indicacao-demo-sqlite');
const {VERSAO_TERMOS_DEMO}=require('./adesoes-posicoes-demo-sqlite');
const TOKEN=/^lp-[a-f0-9]{20}$/;
const PATH=/^\/laboratorio\/convite\/(lp-[a-f0-9]{20})(?:\/([A-Za-z0-9](?:[A-Za-z0-9_-]{0,38}[A-Za-z0-9])?))?\/?$/;
// Os dois links publicaveis sao neutros; links Vilela antigos seguem validos.
const PATH_VILELA=/^\/(escritorio-vilela|loja-vilela|escritorio|loja)\/convite\/(lp-[a-f0-9]{20})(?:\/([A-Za-z0-9](?:[A-Za-z0-9_-]{0,38}[A-Za-z0-9])?))?\/?$/;
const PATH_CURTO=/^\/(escritorio|loja)\/([A-Za-z0-9](?:[A-Za-z0-9_-]{0,7}[A-Za-z0-9])?)\/?$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function apelidoSeguro(s){
 if(typeof s!=='string')throw falha('APELIDO_INVALIDO');
 const a=s.trim();
 // Igual ao cadastro: exclusivamente letras, entre 1 e 9.
 // A grafia original volta na URL e no nome sob o #ID.
 if(!/^[A-Za-z]{1,9}$/.test(a))
  throw falha('APELIDO_INVALIDO');
 return a;
}
function caminhoLink(token,apelido){
 if(!TOKEN.test(token))throw falha('LINK_INVALIDO');
 return '/laboratorio/convite/'+token+'/'+(apelido||'meu-loop');
}
// Endereço público curto não expõe código de indicação. O identificador
// continua associado ao nick no SQLite, sem depender do formato do domínio.
function caminhoLinkCurto(apelido,destino){
 if(!['escritorio','loja'].includes(destino)||typeof apelido!=='string'||
    !/^[A-Za-z]{1,9}$/.test(apelido))
  throw falha('LINK_INVALIDO');
 return '/'+destino+'/'+apelido;
}
// Dois destinos de divulgacao, sempre com o MESMO identificador de indicador.
function caminhoLinkDestino(token,apelido,destino){
 if(!['escritorio','loja'].includes(destino))throw falha('DESTINO_LINK_INVALIDO');
 if(!TOKEN.test(token))throw falha('LINK_INVALIDO');
 const nome=destino==='loja'?'loja':'escritorio';
 return '/'+nome+'/convite/'+token+'/'+(apelido||'meu-loop');
}
function extrairLink(url){
 if(typeof url!=='string'||url.length>500)throw falha('LINK_INVALIDO');
 let u;
 try{u=new URL(url,'http://localhost');}catch{throw falha('LINK_INVALIDO');}
 if(u.hash||u.username||u.password)throw falha('LINK_INVALIDO');
 const campos=[...u.searchParams.keys()];
 if(campos.some(c=>c!=='destino')||campos.length>1)
  throw falha('LINK_INVALIDO');
 const destino=u.searchParams.get('destino')||'escritorio';
 if(!['escritorio','loja'].includes(destino)||u.searchParams.has('destino')&&
  !u.searchParams.get('destino'))throw falha('LINK_INVALIDO');
 const antigo=PATH.exec(u.pathname);
 const branded=PATH_VILELA.exec(u.pathname);
 const curto=PATH_CURTO.exec(u.pathname);
 if(!antigo&&!branded&&!curto)throw falha('LINK_INVALIDO');
 if(curto){
  if(campos.length>0)throw falha('LINK_INVALIDO');
  return {token:null,apelido:curto[2],destino:curto[1]};
 }
 if(branded){
  const destinoDoCaminho=['loja','loja-vilela'].includes(branded[1])?'loja':'escritorio';
  if(campos.length>0)throw falha('LINK_INVALIDO');
  return {token:branded[2],apelido:branded[3]||null,destino:destinoDoCaminho};
 }
 return {token:antigo[1],apelido:antigo[2]||null,destino};
}
class IndicacoesLinksComissoesDemoSQLite{
 constructor({banco,contas}={}){
  if(!banco||contas?.banco!==banco)throw new TypeError('Contas e banco de laboratorio obrigatorios');
  this.banco=banco;this.contas=contas;
  this.taxas=new ConfiguracaoTaxaIndicacaoDemoSQLite({banco});
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_links_apelidos_demo(
    conta_id TEXT PRIMARY KEY REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    apelido TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_links_nicks_reservados_demo(
    nick_chave TEXT PRIMARY KEY,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT
   );
   CREATE TABLE IF NOT EXISTS admin_links_historico_demo(
    evento_id TEXT PRIMARY KEY,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    apelido TEXT NOT NULL,criado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_links_historico_sem_update
    BEFORE UPDATE ON admin_links_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico de link imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_links_historico_sem_delete
    BEFORE DELETE ON admin_links_historico_demo
    BEGIN SELECT RAISE(ABORT,'historico de link imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_comissoes_indicacoes_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    indicador_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    convidado_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
    revisao_valor INTEGER NOT NULL REFERENCES admin_valor_loop_versoes_demo(revisao) ON DELETE RESTRICT,
    valor_posicao_centavos INTEGER NOT NULL CHECK(valor_posicao_centavos>0),
    taxa_base_pontos INTEGER NOT NULL CHECK(taxa_base_pontos=1000),
    valor_comissao_centavos INTEGER NOT NULL CHECK(valor_comissao_centavos>=0),
    calculado_em TEXT NOT NULL,
    CHECK(indicador_id<>convidado_id)
   );
   CREATE TABLE IF NOT EXISTS admin_comissoes_reserva_demo(
    pedido_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_comissoes_indicacoes_demo(pedido_id) ON DELETE RESTRICT,
    cofre_origem TEXT NOT NULL DEFAULT 'LOOP_DIREITA' CHECK(cofre_origem='LOOP_DIREITA'),
    tipo TEXT NOT NULL DEFAULT 'RESERVA_COMPROMETIDA_FICTICIA' CHECK(tipo='RESERVA_COMPROMETIDA_FICTICIA'),
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
    criado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_reserva_no_update
    BEFORE UPDATE ON admin_comissoes_reserva_demo
    BEGIN SELECT RAISE(ABORT,'provisao de reserva imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_reserva_no_delete
    BEFORE DELETE ON admin_comissoes_reserva_demo
    BEGIN SELECT RAISE(ABORT,'provisao de reserva imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_comissoes_indicacoes_v2_demo(
    pedido_id TEXT PRIMARY KEY REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
    indicador_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    convidado_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
    revisao_valor INTEGER NOT NULL REFERENCES admin_valor_loop_versoes_demo(revisao) ON DELETE RESTRICT,
    revisao_taxa INTEGER NOT NULL REFERENCES admin_indicacao_taxas_demo(revisao) ON DELETE RESTRICT,
    valor_posicao_centavos INTEGER NOT NULL CHECK(valor_posicao_centavos>0),
    percentual INTEGER NOT NULL CHECK(percentual BETWEEN 1 AND 100),
    valor_comissao_centavos INTEGER NOT NULL CHECK(valor_comissao_centavos>=0),
    calculado_em TEXT NOT NULL,
    CHECK(indicador_id<>convidado_id)
   );
   -- Guarda a condicao do indicador no instante da geracao do bonus.
   -- Prova posicao propria para campanhas; CPF e aceite sao exigidos antes do credito.
   CREATE TABLE IF NOT EXISTS admin_comissoes_criterio_v2_demo(
    pedido_id TEXT PRIMARY KEY REFERENCES admin_comissoes_indicacoes_v2_demo(pedido_id) ON DELETE RESTRICT,
    indicador_posicao_id INTEGER,
    ativo_no_loop INTEGER NOT NULL CHECK(ativo_no_loop IN (0,1)),
    percentual_campanha INTEGER NOT NULL CHECK(percentual_campanha BETWEEN 10 AND 100),
    percentual_efetivo INTEGER NOT NULL CHECK(percentual_efetivo BETWEEN 10 AND 100),
    CHECK ((ativo_no_loop=1 AND indicador_posicao_id IS NOT NULL AND percentual_efetivo=percentual_campanha)
      OR (ativo_no_loop=0 AND indicador_posicao_id IS NULL AND percentual_efetivo=10))
   );
   CREATE TRIGGER IF NOT EXISTS admin_criterio_v2_sem_update
    BEFORE UPDATE ON admin_comissoes_criterio_v2_demo
    BEGIN SELECT RAISE(ABORT,'criterio de bonus imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_criterio_v2_sem_delete
    BEFORE DELETE ON admin_comissoes_criterio_v2_demo
    BEGIN SELECT RAISE(ABORT,'criterio de bonus imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_comissoes_reserva_v2_demo(
    pedido_id TEXT PRIMARY KEY REFERENCES admin_comissoes_indicacoes_v2_demo(pedido_id) ON DELETE RESTRICT,
    cofre_origem TEXT NOT NULL CHECK(cofre_origem='LOOP_DIREITA'),
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>=0),
    criado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_v2_no_update
    BEFORE UPDATE ON admin_comissoes_indicacoes_v2_demo
    BEGIN SELECT RAISE(ABORT,'comissao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_v2_no_delete
    BEFORE DELETE ON admin_comissoes_indicacoes_v2_demo
    BEGIN SELECT RAISE(ABORT,'comissao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_reserva_v2_no_update
    BEFORE UPDATE ON admin_comissoes_reserva_v2_demo
    BEGIN SELECT RAISE(ABORT,'provisao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_reserva_v2_no_delete
    BEFORE DELETE ON admin_comissoes_reserva_v2_demo
    BEGIN SELECT RAISE(ABORT,'provisao imutavel'); END;
   CREATE INDEX IF NOT EXISTS admin_comissoes_v2_indicador
    ON admin_comissoes_indicacoes_v2_demo(indicador_id,calculado_em);
   CREATE INDEX IF NOT EXISTS idx_comissoes_indicador_demo
    ON admin_comissoes_indicacoes_demo(indicador_id,calculado_em);
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_sem_update
    BEFORE UPDATE ON admin_comissoes_indicacoes_demo
    BEGIN SELECT RAISE(ABORT,'comissao simulada imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_comissoes_sem_delete
    BEFORE DELETE ON admin_comissoes_indicacoes_demo
    BEGIN SELECT RAISE(ABORT,'comissao simulada imutavel'); END;
  `);
  // Reservar nomes legados, nunca reatribuir códigos já usados.
  this.banco.prepare(`
   INSERT OR IGNORE INTO admin_links_nicks_reservados_demo(nick_chave,conta_id)
   SELECT lower(apelido),conta_id FROM admin_links_apelidos_demo ORDER BY conta_id
  `).run();
 }
 // A compra confirmada mais antiga libera o link para trabalhar com indicacoes.
 // Uma compra de qualquer valor serve; nao e necessario ter posicao LOOP.
 ativado(contaId,ate=null){
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  const rows=this.banco.prepare(`
   SELECT confirmado_em AS data FROM admin_ponte_compras_demo WHERE conta_id=?
   UNION ALL
   SELECT confirmado_em FROM admin_ponte_vendas_loja_sem_loop_demo WHERE conta_id=?
   UNION ALL
   SELECT confirmado_em FROM admin_ponte_vendas_loja_apos_reajuste_demo WHERE conta_id=?
  `).all(contaId,contaId,contaId);
  return rows.some(r=>!ate||r.data<=ate);
 }
 // A compra ativa o link; CPF e termos, em momento posterior, liberam bonus.
 adesaoVigente(contaId,ate=null){
  const tabela=this.banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_loop_adesoes_contas_demo'").get();
  if(!tabela)return false;
  const row=this.banco.prepare('SELECT termos_versao,aceito_em FROM admin_loop_adesoes_contas_demo WHERE conta_id=?').get(contaId);
  return !!row&&row.termos_versao===VERSAO_TERMOS_DEMO&&(!ate||row.aceito_em<=ate);
 }
 habilitadoBonificacoes(contaId,ate=null){
  return this.ativado(contaId,ate)&&this.adesaoVigente(contaId,ate);
 }
 linkDaConta(contaId){
  const conta=this.contas.buscar(contaId);
  if(!conta)throw falha('CONTA_INVALIDA');
  const apelido=this.banco.prepare(
   'SELECT apelido FROM admin_links_apelidos_demo WHERE conta_id=?'
  ).get(contaId)?.apelido||'meu-loop';
  // Campos legados mantidos para links antigos/integrações já existentes.
  // Campos curtos visíveis ao cliente ficam sem /convite/token.
  const nickAtivo=this.banco.prepare(
   'SELECT nick_chave FROM admin_links_nicks_reservados_demo WHERE nick_chave=? AND conta_id=?'
  ).get(apelido.toLowerCase(),contaId);
  const exibirCurto=!!nickAtivo&&/^[A-Za-z]{1,9}$/.test(apelido);
  return {link:caminhoLink(conta.codigoConvite,apelido),
   linkEscritorio:caminhoLinkDestino(conta.codigoConvite,apelido,'escritorio'),
   linkLoja:caminhoLinkDestino(conta.codigoConvite,apelido,'loja'),
   linkEscritorioCurto:exibirCurto?caminhoLinkCurto(apelido,'escritorio'):null,
   linkLojaCurto:exibirCurto?caminhoLinkCurto(apelido,'loja'):null,
   mesmoCodigoIndicador:true,apelido,
   ativo:this.ativado(contaId),podeDivulgar:this.ativado(contaId),
   bonificacoesHabilitadas:this.habilitadoBonificacoes(contaId),
   referencia:'CODIGO_DENTRO_DO_LINK',semComissaoReal:true};
 }
 personalizar({contaId,apelido}={}){
  const normalizado=apelidoSeguro(apelido);
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const antigo=this.banco.prepare(
    'SELECT conta_id AS id FROM admin_links_nicks_reservados_demo WHERE nick_chave=?'
   ).get(normalizado.toLowerCase());
   if(antigo&&antigo.id!==contaId)throw falha('APELIDO_DUPLICADO');
   if(!antigo)this.banco.prepare(
    'INSERT INTO admin_links_nicks_reservados_demo(nick_chave,conta_id) VALUES (?,?)'
   ).run(normalizado.toLowerCase(),contaId);
   this.banco.prepare(`
    INSERT INTO admin_links_apelidos_demo(conta_id,apelido) VALUES(?,?)
    ON CONFLICT(conta_id) DO UPDATE SET apelido=excluded.apelido
   `).run(contaId,normalizado);
   this.banco.prepare(`
    INSERT INTO admin_links_historico_demo(evento_id,conta_id,apelido,criado_em)
    VALUES (?,?,?,?)
   `).run(randomUUID(),contaId,normalizado,new Date().toISOString());
   this.banco.exec('COMMIT');
  }catch(err){this.banco.exec('ROLLBACK');throw err;}
  return this.linkDaConta(contaId);
 }
 resolver(link){
  const {token,apelido,destino}=extrairLink(link);
  let row;
  if(token){
   row=this.banco.prepare(
    'SELECT id,nome,codigo_convite FROM admin_contas_participantes_demo WHERE codigo_convite=?'
   ).get(token);
  }else{
   const reserva=this.banco.prepare(
    'SELECT conta_id AS id FROM admin_links_nicks_reservados_demo WHERE nick_chave=?'
   ).get(apelido.toLowerCase());
   if(reserva)row=this.banco.prepare(
    'SELECT id,nome,codigo_convite FROM admin_contas_participantes_demo WHERE id=?'
   ).get(reserva.id);
  }
  if(!row)throw falha('LINK_INVALIDO');
  return {indicadorId:row.id,nomeIndicador:row.nome,
   ativo:this.ativado(row.id),token:row.codigo_convite,destino};
 }
 comissaoDaPosicao({pedidoId,indicadorId,convidadoId,posicaoId,referencia,quando,
  posicaoAtivaIndicadorId=null}={}){
  if(!referencia||!Number.isSafeInteger(referencia.valorCentavos)||
   !Number.isSafeInteger(referencia.revisao))throw falha('REFERENCIA_INVALIDA');
  // O indicador AMARELO ou AZUL pode receber: basta link de divulgacao ativo.
  // O que AUTORIZA registrar a comissao e a posicao VERDE do comprador,
  // apos confirmacao individual de CPF e aceite dessa mesma posicao.
  if(!this.ativado(indicadorId,quando))return null;
  const temTabela=this.banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_loop_adesoes_posicoes_demo'"
  ).get();
  if(!temTabela)return null;
  const verde=this.banco.prepare(`
   SELECT 1 FROM admin_loop_adesoes_posicoes_demo
   WHERE conta_id=? AND posicao_id=? AND ativada_em<=?
  `).get(convidadoId,posicaoId,quando);
  if(!verde)return null;
  const taxa=this.taxas.vigenteEm(quando);
  // A compra pequena libera somente o LINK. O bonus superior a 10%
  // depende de posicao propria ativa na fila ou no tabuleiro.
  const elegivelExtra=Number.isSafeInteger(posicaoAtivaIndicadorId)&&
   posicaoAtivaIndicadorId>0;
  const percentualEfetivo=elegivelExtra?taxa.percentual:10;
  const valor=Math.round(referencia.valorCentavos*percentualEfetivo/100);
  if(!Number.isSafeInteger(valor))throw falha('VALOR_INVALIDO');
  // V2 permite 10%, 20%, 30% etc. Historico V1 continua inalterado.
  if(this.banco.prepare(
   'SELECT 1 FROM admin_comissoes_indicacoes_demo WHERE pedido_id=?'
  ).get(pedidoId))throw falha('COMISSAO_DUPLICADA');
  this.banco.prepare(`
   INSERT INTO admin_comissoes_indicacoes_v2_demo(
    pedido_id,indicador_id,convidado_id,posicao_id,revisao_valor,revisao_taxa,
    valor_posicao_centavos,percentual,valor_comissao_centavos,calculado_em)
   VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(pedidoId,indicadorId,convidadoId,posicaoId,
   referencia.revisao,taxa.revisao,referencia.valorCentavos,
   percentualEfetivo,valor,quando);
  this.banco.prepare(`
   INSERT INTO admin_comissoes_criterio_v2_demo
   (pedido_id,indicador_posicao_id,ativo_no_loop,percentual_campanha,percentual_efetivo)
   VALUES (?,?,?,?,?)
  `).run(pedidoId,elegivelExtra?posicaoAtivaIndicadorId:null,
   elegivelExtra?1:0,taxa.percentual,percentualEfetivo);
  this.banco.prepare(`
   INSERT INTO admin_comissoes_reserva_v2_demo
    (pedido_id,cofre_origem,valor_centavos,criado_em)
   VALUES (?,'LOOP_DIREITA',?,?)
  `).run(pedidoId,valor,quando);
  return {cofreOrigem:'LOOP_DIREITA',estadoReserva:'COMPROMISSO_FICTICIO_SEM_LIQUIDACAO',
   valorComissaoCentavos:valor,taxaPercentual:percentualEfetivo,
   percentualCampanha:taxa.percentual,elegivelBonusExtra:elegivelExtra,
   posicaoAtivaIndicadorId:elegivelExtra?posicaoAtivaIndicadorId:null,
   basePosicaoCentavos:referencia.valorCentavos,
   referenciaRevisao:referencia.revisao,taxaRevisao:taxa.revisao,
   registroFicticio:true};
 }
 comissoesDaConta(contaId){
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  const legados=this.banco.prepare(`
   SELECT c.pedido_id AS pedidoId,c.posicao_id AS posicaoId,
    c.valor_posicao_centavos AS valorBaseCentavos,
    c.valor_comissao_centavos AS valorCentavos,
    c.calculado_em AS calculadoEm,10 AS percentual,1 AS revisaoTaxa,
    r.cofre_origem AS cofreOrigem,
    r.valor_centavos AS valorComprometidoReservaCentavos
   FROM admin_comissoes_indicacoes_demo c
   JOIN admin_comissoes_reserva_demo r ON r.pedido_id=c.pedido_id
   WHERE c.indicador_id=?
  `).all(contaId);
  const novos=this.banco.prepare(`
   SELECT c.pedido_id AS pedidoId,c.posicao_id AS posicaoId,
    c.valor_posicao_centavos AS valorBaseCentavos,
    c.valor_comissao_centavos AS valorCentavos,
    c.calculado_em AS calculadoEm,c.percentual,
    c.revisao_taxa AS revisaoTaxa,r.cofre_origem AS cofreOrigem,
    r.valor_centavos AS valorComprometidoReservaCentavos,
    COALESCE(k.percentual_campanha,t.percentual) AS percentualCampanha,
    k.indicador_posicao_id AS posicaoIndicadorId,
    k.ativo_no_loop AS indicadorAtivoNoLoop
   FROM admin_comissoes_indicacoes_v2_demo c
   JOIN admin_comissoes_reserva_v2_demo r ON r.pedido_id=c.pedido_id
   JOIN admin_indicacao_taxas_demo t ON t.revisao=c.revisao_taxa
   LEFT JOIN admin_comissoes_criterio_v2_demo k ON k.pedido_id=c.pedido_id
   WHERE c.indicador_id=?
  `).all(contaId);
  const rows=[...legados,...novos].sort((a,b)=>
   a.calculadoEm.localeCompare(b.calculadoEm)||a.pedidoId.localeCompare(b.pedidoId));
  const c1=this.banco.prepare(
   'SELECT COUNT(*) AS total FROM admin_comissoes_indicacoes_demo WHERE indicador_id=?'
  ).get(contaId).total;
  const c2=this.banco.prepare(
   'SELECT COUNT(*) AS total FROM admin_comissoes_indicacoes_v2_demo WHERE indicador_id=?'
  ).get(contaId).total;
  if(rows.length!==c1+c2||rows.some(x=>x.cofreOrigem!=='LOOP_DIREITA'||
   x.valorCentavos!==x.valorComprometidoReservaCentavos))
   throw new Error('Conciliacao de bonificacao e caixa reserva divergente');
  const total=rows.reduce((v,x)=>v+x.valorCentavos,0);
  if(!Number.isSafeInteger(total))throw new Error('Total de comissao excede limite');
  const minimo=2500;
  const cpfTermosConfirmados=this.adesaoVigente(contaId);
  const bonificacoesHabilitadas=this.habilitadoBonificacoes(contaId);
  return {
   quantidade:rows.length,totalSimuladoCentavos:total,
   minimoSaqueCentavos:minimo,
   atingiuMinimoSaque:total>=minimo,
   faltaParaMinimoCentavos:Math.max(0,minimo-total),
   saqueDisponivelReal:false,
   solicitarSaqueSimuladoHabilitado:total>=minimo&&bonificacoesHabilitadas,
   cpfTermosConfirmados,bonificacoesHabilitadas,
   pagamentoReal:false,bonificacaoProvisionadaCentavos:total,
   origemExclusiva:'LOOP_DIREITA',caixaCentralIntocado:true,
   caixaInvestimentoIntocado:true,
   provisaoNaoComprovaSaldoDaReserva:true,
   porcentagemAtual:this.taxas.atual(),
   registros:rows,semPagamentoReal:true
  };
 }
}
function simularElegibilidadeSaque({saldoSimuladoCentavos,valorSolicitadoCentavos,cpfTermosConfirmados=false,tipo='BONUS'}={}){
 if(!Number.isSafeInteger(saldoSimuladoCentavos)||saldoSimuladoCentavos<0||
  !Number.isSafeInteger(valorSolicitadoCentavos)||valorSolicitadoCentavos<=0)
  throw falha('SAQUE_INVALIDO');
 if(cpfTermosConfirmados!==true)throw falha('CPF_E_TERMOS_OBRIGATORIOS');
 if(!['BONUS','PARTICIPACAO_LUCRO'].includes(tipo))throw falha('TIPO_SAQUE_INVALIDO');
 if(valorSolicitadoCentavos<2500)throw falha('MINIMO_SAQUE_25_REAIS');
 if(valorSolicitadoCentavos>saldoSimuladoCentavos)throw falha('SALDO_SIMULADO_INSUFICIENTE');
 const taxaSaqueCentavos=Math.round(valorSolicitadoCentavos*3/100);
 const valorLiquidoCentavos=valorSolicitadoCentavos-taxaSaqueCentavos;
 return {apenasSimulacao:true,atingiuMinimo:true,tipoSaque:tipo,
  valorSolicitadoCentavos,taxaPercentual:0,taxaSaqueCentavos,
  valorLiquidoCentavos,origemExclusiva:tipo==='BONUS'?'LOOP_DIREITA':'LOOP_CENTRO',
  transferenciaExecutada:false,necessitaSaldoRealReserva:true};
}
module.exports={IndicacoesLinksComissoesDemoSQLite,caminhoLink,caminhoLinkDestino,caminhoLinkCurto,extrairLink,apelidoSeguro,simularElegibilidadeSaque};
