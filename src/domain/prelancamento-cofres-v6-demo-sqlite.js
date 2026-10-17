'use strict';

// Cofres de PRE-LANCAMENTO apenas de LABORATORIO.
// Nao e saldo de PSP/banco; nao transfere e nunca cria saldo sacavel.
// Registrar compras, dar START e autorizar giros sao 3 eventos separados.
const {centroDoLoop}=require('./destino-financeiro-centro-loop');
function erro(c){const e=new Error(c);e.codigo=c;return e;}
function valor(n){return Number.isSafeInteger(n)&&n>0&&n<=100000000;}
class PreLancamentoCofresV6DemoSQLite{
 constructor({banco,ponte}={}){
  if(!banco||!ponte||banco!==ponte.banco)throw new TypeError('Ponte e SQLite obrigatorios');
  this.banco=banco;this.ponte=ponte;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_config (',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   "fase TEXT NOT NULL CHECK(fase IN ('ARRECADACAO','EM_OPERACAO')),",
   'liquido_por_compra INTEGER NOT NULL CHECK(liquido_por_compra>0),',
   'iniciado_em TEXT, configurado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_receitas (',
   'pedido_id TEXT PRIMARY KEY, conta_id TEXT NOT NULL,',
   'bruto_centavos INTEGER NOT NULL, liquido_centavos INTEGER NOT NULL,',
   'centro_centavos INTEGER NOT NULL, esquerda_centavos INTEGER NOT NULL,',
   'direita_centavos INTEGER NOT NULL, registrado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_saidas (',
   'giro INTEGER PRIMARY KEY CHECK(giro>0),',
   'posicao_id INTEGER NOT NULL, beneficiario TEXT,',
   'destino TEXT NOT NULL, valor_centavos INTEGER NOT NULL,',
   'registrado_em TEXT NOT NULL);',
   ...['loop_v6_pre_receitas','loop_v6_pre_saidas'].flatMap(nome=>[
    'CREATE TRIGGER IF NOT EXISTS '+nome+'_no_update',
    'BEFORE UPDATE ON '+nome+" BEGIN SELECT RAISE(ABORT,'caixa-demo imutavel'); END;",
    'CREATE TRIGGER IF NOT EXISTS '+nome+'_no_delete',
    'BEFORE DELETE ON '+nome+" BEGIN SELECT RAISE(ABORT,'caixa-demo imutavel'); END;"
   ])
  ].join('\n'));
 }
 estado(){return this.banco.prepare('SELECT * FROM loop_v6_pre_config WHERE id=1').get()||null;}
 habilitar({liquidoPorCompraCentavos}={}){
  if(!valor(liquidoPorCompraCentavos))throw erro('LIQUIDO_INVALIDO');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   if(this.estado())throw erro('PRE_LANCAMENTO_JA_CONFIGURADO');
   if(this.ponte._restaurar().giros!==0)throw erro('PRE_LANCAMENTO_APOS_GIROS');
   b.prepare([
    'INSERT INTO loop_v6_pre_config',
    "(id,fase,liquido_por_compra,configurado_em) VALUES(1,'ARRECADACAO',?,?)"
   ].join(' ')).run(liquidoPorCompraCentavos,new Date().toISOString());
   this.sincronizar({transacaoAberta:true});
   b.exec('COMMIT');return this.resumo();
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 sincronizar({transacaoAberta=false}={}){
  const l=this.estado();if(!l)throw erro('PRE_LANCAMENTO_DESATIVADO');
  const b=this.banco;
  if(!transacaoAberta)b.exec('BEGIN IMMEDIATE');
  try{
   const compras=b.prepare([
    'SELECT pedido_id AS pedidoId,conta_id AS contaId,',
    'valor_centavos AS brutoCentavos',
    'FROM admin_ponte_compras_demo ORDER BY confirmado_em,pedido_id'
   ].join(' ')).all();
   const inserir=b.prepare([
    'INSERT OR IGNORE INTO loop_v6_pre_receitas',
    '(pedido_id,conta_id,bruto_centavos,liquido_centavos,',
    'centro_centavos,esquerda_centavos,direita_centavos,registrado_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' '));
   let novas=0;
   for(const compra of compras){
    if(compra.brutoCentavos<l.liquido_por_compra)
      throw erro('LIQUIDO_SUPERA_VENDA');
    const atual=b.prepare('SELECT * FROM loop_v6_pre_receitas WHERE pedido_id=?')
      .get(compra.pedidoId);
    if(atual){
     if(atual.conta_id!==compra.contaId||atual.bruto_centavos!==compra.brutoCentavos||
        atual.liquido_centavos!==l.liquido_por_compra)
      throw erro('COMPRA_DIVERGENTE_CAIXA');
     continue;
    }
    const net=l.liquido_por_compra;
    const centro=Math.floor(net/2);
    const esquerda=Math.floor(net/3);
    const direita=net-centro-esquerda;
    novas+=inserir.run(compra.pedidoId,compra.contaId,compra.brutoCentavos,
      net,centro,esquerda,direita,new Date().toISOString()).changes;
   }
   if(!transacaoAberta)b.exec('COMMIT');
   return {comprasNovas:novas,semDinheiroReal:true};
  }catch(e){if(!transacaoAberta)b.exec('ROLLBACK');throw e;}
 }
 iniciar(){
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const l=this.estado();
   if(!l)throw erro('PRE_LANCAMENTO_DESATIVADO');
   if(l.fase!=='ARRECADACAO')throw erro('START_JA_EXECUTADO');
   this.sincronizar({transacaoAberta:true});
   b.prepare("UPDATE loop_v6_pre_config SET fase='EM_OPERACAO',iniciado_em=? WHERE id=1")
    .run(new Date().toISOString());
   b.exec('COMMIT');return this.resumo();
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 registrarSaidas({sim,transacaoAberta=false}={}){
  const l=this.estado();
  if(!l)return {modo:'LEGADO_SEM_PRE_CAIXA',novas:0};
  if(l.fase!=='EM_OPERACAO')throw erro('AGUARDANDO_START');
  const b=this.banco;if(!transacaoAberta)b.exec('BEGIN IMMEDIATE');
  try{
   this.sincronizar({transacaoAberta:true});
   const inserir=b.prepare([
    'INSERT INTO loop_v6_pre_saidas',
    '(giro,posicao_id,beneficiario,destino,valor_centavos,registrado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' '));
   let atual=b.prepare([
    'SELECT COALESCE(SUM(centro_centavos),0) AS entradas',
    'FROM loop_v6_pre_receitas'
   ].join(' ')).get().entradas;
   atual-=b.prepare('SELECT COALESCE(SUM(valor_centavos),0) AS saidas FROM loop_v6_pre_saidas')
     .get().saidas;
   let novas=0;
   for(const ciclo of sim.tabuleiro.ciclosConcluidos){
    if(ciclo.vendas?.length!==6)continue;
    const existente=b.prepare('SELECT * FROM loop_v6_pre_saidas WHERE giro=?')
      .get(ciclo.ciclo);
    const centro=ciclo.centro;
    let valorSaida;
    if(centroDoLoop(centro)){
      // Um centro da empresa nao credita cliente, mas reserva em seu proprio destino.
      const livroPedidos=b.prepare([
        'SELECT v.valor_referencia_centavos AS valor',
        'FROM admin_ponte_posicoes_valores_demo v WHERE v.pedido_id=?'
      ].join(' '));
      valorSaida=0;
      for(const ordem of [1,3,5]){
       const id=ciclo.vendas[ordem-1]?.vendaId||'';
       if(!id.startsWith('compra-demo-'))throw erro('EVENTO_CENTRO_INVALIDO');
       const fonte=livroPedidos.get(id.slice('compra-demo-'.length));
       if(!fonte)throw erro('EVENTO_CENTRO_NAO_CONFIRMADO');
       valorSaida+=fonte.valor;
      }
    }else{
      const doc=this.ponte._restaurar();
      // Obrigacao individual registrada pelo livro de seis fontes.
      const livro=require('./livro-provisoes-v6-demo-sqlite');
      const obj=new livro.LivroProvisoesV6DemoSQLite({banco:b,ponte:this.ponte});
      const projetado=obj._documentar(ciclo);
      valorSaida=projetado.previstoCentroCentavos;
    }
    if(!valor(valorSaida))throw erro('OBRIGACAO_INVALIDA');
    const destino=centroDoLoop(centro)?'LOOP_DOURADAS':'ESCRITORIO_PREVISTO';
    const beneficiario=centroDoLoop(centro)?null:centro.participanteId;
    if(existente){
      if(existente.posicao_id!==centro.id||existente.valor_centavos!==valorSaida||
         existente.destino!==destino||existente.beneficiario!==beneficiario)
       throw erro('DIVERGENCIA_SAIDA');
      continue;
    }
    if(atual<valorSaida)throw erro('SALDO_CENTRAL_SIMULADO_INSUFICIENTE');
    inserir.run(ciclo.ciclo,centro.id,beneficiario,destino,
      valorSaida,new Date().toISOString());
    atual-=valorSaida;novas++;
   }
   if(!transacaoAberta)b.exec('COMMIT');
   return {novas,centroSimuladoRestanteCentavos:atual,transferenciasReais:false};
  }catch(e){if(!transacaoAberta)b.exec('ROLLBACK');throw e;}
 }
 resumo(){
  const l=this.estado();
  if(!l)return {configurado:false,fase:'INATIVO',
    valoresReaisConciliados:false,saldoRealCentavos:0,valorParaSaqueCentavos:0};
  const b=this.banco;
  const r=b.prepare([
   'SELECT COUNT(*) AS compras, COALESCE(SUM(liquido_centavos),0) AS total,',
   'COALESCE(SUM(centro_centavos),0) AS centro,',
   'COALESCE(SUM(esquerda_centavos),0) AS esquerda,',
   'COALESCE(SUM(direita_centavos),0) AS direita',
   'FROM loop_v6_pre_receitas'
  ].join(' ')).get();
  const s=b.prepare([
   'SELECT COUNT(*) AS giros, COALESCE(SUM(valor_centavos),0) AS total',
   'FROM loop_v6_pre_saidas'
  ].join(' ')).get();
  return {configurado:true,fase:l.fase,iniciadoEm:l.iniciado_em,
   liquidoHipoteticoPorCompraCentavos:l.liquido_por_compra,
   comprasConferidas:r.compras,totalHipoteticoCentavos:r.total,
   centroRecebidoSimuladoCentavos:r.centro,
   centroComprometidoSimuladoCentavos:s.total,
   centroRestanteSimuladoCentavos:r.centro-s.total,
   investimentoRestanteSimuladoCentavos:r.esquerda,
   reservaRestanteSimuladoCentavos:r.direita,
   girosRegistrados:s.giros,valoresReaisConciliados:false,
   saldoRealCentavos:0,valorParaSaqueCentavos:0,
   fluxoBancario:'NAO_CONECTADO',tipo:'PROJECAO_SEM_RECEITA_REAL'};
 }
}
module.exports={PreLancamentoCofresV6DemoSQLite};
