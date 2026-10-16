'use strict';

// Exclusivamente para demonstracao local. Um link carrega seu proprio
// codigo imutavel de rastreio; o apelido alteravel nao e a identidade.
const {randomUUID}=require('node:crypto');
const {ConfiguracaoTaxaIndicacaoDemoSQLite}=require('./configuracao-taxa-indicacao-demo-sqlite');
const TOKEN=/^lp-[a-f0-9]{20}$/;
const PATH=/^\/laboratorio\/convite\/(lp-[a-f0-9]{20})(?:\/([a-z0-9][a-z0-9-]{1,30}[a-z0-9]))?\/?$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function apelidoSeguro(s){
 if(typeof s!=='string'||s.length>80)throw falha('APELIDO_INVALIDO');
 const a=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .trim().toLowerCase().replace(/\s+/g,'-');
 if(!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(a)||
  a.includes('--'))throw falha('APELIDO_INVALIDO');
 return a;
}
function caminhoLink(token,apelido){
 if(!TOKEN.test(token))throw falha('LINK_INVALIDO');
 return '/laboratorio/convite/'+token+'/'+(apelido||'meu-loop');
}
function extrairLink(url){
 if(typeof url!=='string'||url.length>500)throw falha('LINK_INVALIDO');
 let u;
 try{u=new URL(url,'http://localhost');}catch{throw falha('LINK_INVALIDO');}
 if(u.search||u.hash||u.username||u.password)throw falha('LINK_INVALIDO');
 const m=PATH.exec(u.pathname);
 if(!m)throw falha('LINK_INVALIDO');
 return {token:m[1],apelido:m[2]||null};
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
 linkDaConta(contaId){
  const conta=this.contas.buscar(contaId);
  if(!conta)throw falha('CONTA_INVALIDA');
  const apelido=this.banco.prepare(
   'SELECT apelido FROM admin_links_apelidos_demo WHERE conta_id=?'
  ).get(contaId)?.apelido||'meu-loop';
  return {link:caminhoLink(conta.codigoConvite,apelido),apelido,
   ativo:this.ativado(contaId),podeDivulgar:this.ativado(contaId),
   referencia:'CODIGO_DENTRO_DO_LINK',semComissaoReal:true};
 }
 personalizar({contaId,apelido}={}){
  const normalizado=apelidoSeguro(apelido);
  if(!this.contas.buscar(contaId))throw falha('CONTA_INVALIDA');
  this.banco.prepare(`
   INSERT INTO admin_links_apelidos_demo(conta_id,apelido) VALUES(?,?)
   ON CONFLICT(conta_id) DO UPDATE SET apelido=excluded.apelido
  `).run(contaId,normalizado);
  this.banco.prepare(`
   INSERT INTO admin_links_historico_demo(evento_id,conta_id,apelido,criado_em)
   VALUES (?,?,?,?)
  `).run(randomUUID(),contaId,normalizado,new Date().toISOString());
  return this.linkDaConta(contaId);
 }
 resolver(link){
  const {token}=extrairLink(link);
  const row=this.banco.prepare(`
   SELECT id,nome FROM admin_contas_participantes_demo WHERE codigo_convite=?
  `).get(token);
  if(!row)throw falha('LINK_INVALIDO');
  return {indicadorId:row.id,nomeIndicador:row.nome,
   ativo:this.ativado(row.id),token};
 }
 comissaoDaPosicao({pedidoId,indicadorId,convidadoId,posicaoId,referencia,quando}={}){
  if(!referencia||!Number.isSafeInteger(referencia.valorCentavos)||
   !Number.isSafeInteger(referencia.revisao))throw falha('REFERENCIA_INVALIDA');
  if(!this.ativado(indicadorId,quando))return null;
  const taxa=this.taxas.vigenteEm(quando);
  const valor=Math.round(referencia.valorCentavos*taxa.percentual/100);
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
   referencia.revisao,taxa.revisao,referencia.valorCentavos,taxa.percentual,valor,quando);
  this.banco.prepare(`
   INSERT INTO admin_comissoes_reserva_v2_demo
    (pedido_id,cofre_origem,valor_centavos,criado_em)
   VALUES (?,'LOOP_DIREITA',?,?)
  `).run(pedidoId,valor,quando);
  return {cofreOrigem:'LOOP_DIREITA',estadoReserva:'COMPROMISSO_FICTICIO_SEM_LIQUIDACAO',
   valorComissaoCentavos:valor,taxaPercentual:taxa.percentual,
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
    r.valor_centavos AS valorComprometidoReservaCentavos
   FROM admin_comissoes_indicacoes_v2_demo c
   JOIN admin_comissoes_reserva_v2_demo r ON r.pedido_id=c.pedido_id
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
  const minimo=10000;
  return {
   quantidade:rows.length,totalSimuladoCentavos:total,
   minimoSaqueCentavos:minimo,
   atingiuMinimoSaque:total>=minimo,
   faltaParaMinimoCentavos:Math.max(0,minimo-total),
   saqueDisponivelReal:false,
   solicitarSaqueSimuladoHabilitado:total>=minimo,
   pagamentoReal:false,bonificacaoProvisionadaCentavos:total,
   origemExclusiva:'LOOP_DIREITA',caixaCentralIntocado:true,
   caixaInvestimentoIntocado:true,
   provisaoNaoComprovaSaldoDaReserva:true,
   porcentagemAtual:this.taxas.atual(),
   registros:rows,semPagamentoReal:true
  };
 }
}
function simularElegibilidadeSaque({saldoSimuladoCentavos,valorSolicitadoCentavos}={}){
 if(!Number.isSafeInteger(saldoSimuladoCentavos)||saldoSimuladoCentavos<0||
  !Number.isSafeInteger(valorSolicitadoCentavos)||valorSolicitadoCentavos<=0)
  throw falha('SAQUE_INVALIDO');
 if(valorSolicitadoCentavos<10000)throw falha('MINIMO_SAQUE_100_REAIS');
 if(valorSolicitadoCentavos>saldoSimuladoCentavos)throw falha('SALDO_SIMULADO_INSUFICIENTE');
 return {apenasSimulacao:true,atingiuMinimo:true,
  valorSolicitadoCentavos,origemExclusiva:'LOOP_DIREITA',
  transferenciaExecutada:false,necessitaSaldoRealReserva:true};
}
module.exports={IndicacoesLinksComissoesDemoSQLite,caminhoLink,extrairLink,apelidoSeguro,simularElegibilidadeSaque};
