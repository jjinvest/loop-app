'use strict';

// Cofres de PRE-LANCAMENTO apenas de LABORATORIO.
// Nao e saldo de PSP/banco; nao transfere e nunca cria saldo sacavel.
// Registrar compras, dar START e autorizar giros sao 3 eventos separados.
const {centroDoLoop,REGRA_DOURADA_INTEGRAL}=require('./destino-financeiro-centro-loop');
const {LivroProvisoesV6DemoSQLite}=require('./livro-provisoes-v6-demo-sqlite');
function erro(c){const e=new Error(c);e.codigo=c;return e;}
function valor(n){return Number.isSafeInteger(n)&&n>0&&n<=100000000;}
class PreLancamentoCofresV6DemoSQLite{
 constructor({banco,ponte}={}){
  if(!banco||!ponte||banco!==ponte.banco)throw new TypeError('Ponte e SQLite obrigatorios');
  this.banco=banco;this.ponte=ponte;
  this.livro=new LivroProvisoesV6DemoSQLite({banco,ponte});
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_config (',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   "fase TEXT NOT NULL CHECK(fase IN ('ARRECADACAO','EM_OPERACAO')),",
   'liquido_por_compra INTEGER NOT NULL CHECK(liquido_por_compra=25000),',
   'iniciado_em TEXT, configurado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_aportes_demo (',
   'aporte_id TEXT PRIMARY KEY NOT NULL,',
   'pedido_id TEXT NOT NULL UNIQUE,',
   'valor_loop_centavos INTEGER NOT NULL CHECK(valor_loop_centavos=25000),',
   "origem TEXT NOT NULL CHECK(origem='APORTE_FICTICIO_ADMIN_LOCAL'),",
   'registrado_em TEXT NOT NULL);',
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
   // Reclassificacao imutavel de fontes para ciclos dourados integrais V2.
   'CREATE TABLE IF NOT EXISTS loop_v6_pre_douradas_integral_fontes (',
   'giro INTEGER NOT NULL REFERENCES loop_v6_pre_saidas(giro),',
   'ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 6),',
   'pedido_id TEXT NOT NULL UNIQUE REFERENCES loop_v6_pre_receitas(pedido_id),',
   'centro_centavos INTEGER NOT NULL CHECK(centro_centavos>=0),',
   'esquerda_centavos INTEGER NOT NULL CHECK(esquerda_centavos>=0),',
   'direita_centavos INTEGER NOT NULL CHECK(direita_centavos>=0),',
   'PRIMARY KEY(giro,ordem));',
   ...['loop_v6_pre_aportes_demo','loop_v6_pre_receitas','loop_v6_pre_saidas',
    'loop_v6_pre_douradas_integral_fontes'].flatMap(nome=>[
    'CREATE TRIGGER IF NOT EXISTS '+nome+'_no_update',
    'BEFORE UPDATE ON '+nome+" BEGIN SELECT RAISE(ABORT,'caixa-demo imutavel'); END;",
    'CREATE TRIGGER IF NOT EXISTS '+nome+'_no_delete',
    'BEFORE DELETE ON '+nome+" BEGIN SELECT RAISE(ABORT,'caixa-demo imutavel'); END;"
   ])
  ].join('\n'));
 }
 estado(){return this.banco.prepare('SELECT * FROM loop_v6_pre_config WHERE id=1').get()||null;}
 habilitar({valorFixoLoopCentavos}={}){
  if(valorFixoLoopCentavos!==25000)throw erro('VALOR_FIXO_LOOP_INVALIDO');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   if(this.estado())throw erro('PRE_LANCAMENTO_JA_CONFIGURADO');
   if(this.ponte._restaurar().giros!==0)throw erro('PRE_LANCAMENTO_APOS_GIROS');
   b.prepare([
    'INSERT INTO loop_v6_pre_config',
    "(id,fase,liquido_por_compra,configurado_em) VALUES(1,'ARRECADACAO',?,?)"
   ].join(' ')).run(25000,new Date().toISOString());
   this.sincronizar({transacaoAberta:true});
   b.exec('COMMIT');return this.resumo();
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 // Esta operacao simula um registro de aporte SEPARADO da compra.
 // Nao prova recebimento bancario. NUNCA expor como um PSP conciliado.
 registrarAporteFicticio({aporteId,pedidoId,valorLoopCentavos}={}){
  if(typeof aporteId!=='string'||!/^aporte-[a-z0-9-]{6,90}$/.test(aporteId)||
     typeof pedidoId!=='string'||pedidoId.length<3||pedidoId.length>120)
    throw erro('APORTE_ID_INVALIDO');
  if(valorLoopCentavos!==25000)throw erro('SOMENTE_250_REAIS_LOOP');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const config=this.estado();
   if(!config)throw erro('PRE_LANCAMENTO_DESATIVADO');
   const compra=b.prepare('SELECT pedido_id FROM admin_ponte_compras_demo WHERE pedido_id=?')
     .get(pedidoId);
   if(!compra)throw erro('COMPRA_VINCULADA_INEXISTENTE');
   const anterior=b.prepare(
     'SELECT aporte_id, pedido_id FROM loop_v6_pre_aportes_demo WHERE aporte_id=?'
   ).get(aporteId);
   if(anterior){
    if(anterior.pedido_id!==pedidoId)throw erro('CONFLITO_IDEMPOTENCIA');
    b.exec('COMMIT');return {registrado:true,repetido:true,
      valorLoopCentavos:25000,semPagamentoReal:true};
   }
   const duplicado=b.prepare(
     'SELECT aporte_id FROM loop_v6_pre_aportes_demo WHERE pedido_id=?'
   ).get(pedidoId);
   if(duplicado)throw erro('APORTE_JA_VINCULADO_A_COMPRA');
   b.prepare([
    'INSERT INTO loop_v6_pre_aportes_demo',
    '(aporte_id,pedido_id,valor_loop_centavos,origem,registrado_em)',
    "VALUES(?,?,?,'APORTE_FICTICIO_ADMIN_LOCAL',?)"
   ].join(' ')).run(aporteId,pedidoId,25000,new Date().toISOString());
   this.sincronizar({transacaoAberta:true});
   b.exec('COMMIT');
   return {registrado:true,repetido:false,valorLoopCentavos:25000,
     fonte:'APORTE_FICTICIO_ADMIN_LOCAL',semPagamentoReal:true};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 sincronizar({transacaoAberta=false}={}){
  const l=this.estado();if(!l)throw erro('PRE_LANCAMENTO_DESATIVADO');
  const b=this.banco;
  if(!transacaoAberta)b.exec('BEGIN IMMEDIATE');
  try{
   const compras=b.prepare([
    'SELECT c.pedido_id AS pedidoId,c.conta_id AS contaId,',
    'c.valor_centavos AS brutoCentavos',
    'FROM admin_ponte_compras_demo c JOIN loop_v6_pre_aportes_demo a',
    'ON a.pedido_id=c.pedido_id ORDER BY c.confirmado_em,c.pedido_id'
   ].join(' ')).all();
   const inserir=b.prepare([
    'INSERT OR IGNORE INTO loop_v6_pre_receitas',
    '(pedido_id,conta_id,bruto_centavos,liquido_centavos,',
    'centro_centavos,esquerda_centavos,direita_centavos,registrado_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' '));
   let novas=0;
   let numeroAportes=b.prepare('SELECT COUNT(*) AS n FROM loop_v6_pre_receitas').get().n;
   const consultarReceita=b.prepare('SELECT * FROM loop_v6_pre_receitas WHERE pedido_id=?');
   for(const compra of compras){
    // Aporte foi confirmado somente no LIVRO FICTICIO SEPARADO, nao pela venda.
    // Nao comparar bruto da loja com aporte distinto: fluxo comercial independente.
    const atual=consultarReceita.get(compra.pedidoId);
    if(atual){
     if(atual.conta_id!==compra.contaId||atual.bruto_centavos!==compra.brutoCentavos||
        atual.liquido_centavos!==l.liquido_por_compra)
      throw erro('COMPRA_DIVERGENTE_CAIXA');
     continue;
    }
    const net=l.liquido_por_compra;
    const centro=Math.floor(net/2);
    const esquerda=Math.floor((numeroAportes+1)*net/3)-
      Math.floor(numeroAportes*net/3);
    const direita=net-centro-esquerda;
    const feito=inserir.run(compra.pedidoId,compra.contaId,compra.brutoCentavos,
      net,centro,esquerda,direita,new Date().toISOString()).changes;
    novas+=feito;numeroAportes+=feito;
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
   // START nao pode habilitar operacao com lancamentos desencontrados.
   if(this.conciliacao?.conferir().quantidadeDivergencias)
    throw erro('CONCILIACAO_COFRES_DIVERGENTE');
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
   const inserirFonte=b.prepare([
    'INSERT INTO loop_v6_pre_douradas_integral_fontes',
    '(giro,ordem,pedido_id,centro_centavos,esquerda_centavos,direita_centavos)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' '));
   let novas=0;
   for(const ciclo of sim.tabuleiro.ciclosConcluidos){
    if(ciclo.vendas?.length!==6)continue;
    const existente=b.prepare('SELECT * FROM loop_v6_pre_saidas WHERE giro=?')
     .get(ciclo.ciclo);
    const centro=ciclo.centro,ouro=centroDoLoop(centro);
    const integral=ouro&&
     ciclo.vendas[0]?.regraDourada===REGRA_DOURADA_INTEGRAL;
    let valorSaida;
    const fontes=[];
    if(ouro){
     // V1 historica: so parcelas 1/3/5. V2: todas as seis, sem criar
     // receita nem debitar o valor integral de um unico cofre.
     const livroPedidos=b.prepare([
      'SELECT v.valor_referencia_centavos AS valor',
      'FROM admin_ponte_posicoes_valores_demo v WHERE v.pedido_id=?'
     ].join(' '));
     const receitas=b.prepare([
      'SELECT centro_centavos AS centro,esquerda_centavos AS esquerda,',
      'direita_centavos AS direita,liquido_centavos AS liquido',
      'FROM loop_v6_pre_receitas WHERE pedido_id=?'
     ].join(' '));
     valorSaida=0;
     const ids=new Set();
     for(const ordem of (integral?[1,2,3,4,5,6]:[1,3,5])){
      const id=ciclo.vendas[ordem-1]?.vendaId||'';
      if(!id.startsWith('compra-demo-'))throw erro('EVENTO_CENTRO_INVALIDO');
      const pedidoId=id.slice('compra-demo-'.length);
      if(ids.has(pedidoId))throw erro('DOURADA_FONTE_DUPLICADA');
      ids.add(pedidoId);
      const fonte=livroPedidos.get(pedidoId);
      if(!fonte||!valor(fonte.valor))throw erro('EVENTO_CENTRO_NAO_CONFIRMADO');
      valorSaida+=fonte.valor;
      if(integral){
       const receita=receitas.get(pedidoId);
       if(!receita||receita.liquido!==fonte.valor||
          receita.centro+receita.esquerda+receita.direita!==receita.liquido)
        throw erro('DOURADA_FONTE_NAO_CONCILIADA');
       fontes.push({ordem,pedidoId,...receita});
      }
     }
    }else{
     // Participantes nao sao afetados: continuam com tres parcelas.
     const projetado=this.livro._documentar(ciclo);
     valorSaida=projetado.previstoCentroCentavos;
    }
    if(!valor(valorSaida))throw erro('OBRIGACAO_INVALIDA');
    const destino=ouro?'LOOP_DOURADAS':'ESCRITORIO_PREVISTO';
    const beneficiario=ouro?null:centro.participanteId;
    if(existente){
     if(existente.posicao_id!==centro.id||existente.valor_centavos!==valorSaida||
        existente.destino!==destino||existente.beneficiario!==beneficiario)
      throw erro('DIVERGENCIA_SAIDA');
     if(integral&&b.prepare([
      'SELECT COUNT(*) AS n FROM loop_v6_pre_douradas_integral_fontes',
      'WHERE giro=?'
     ].join(' ')).get(ciclo.ciclo).n!==6)
      throw erro('DOURADA_FONTES_INCOMPLETAS');
     continue;
    }
    const saldo=this.resumo();
    if(integral){
     const por=campo=>fontes.reduce((acc,f)=>acc+f[campo],0);
     if(fontes.length!==6||
        por('centro')>saldo.centroRestanteSimuladoCentavos||
        por('esquerda')>saldo.investimentoRestanteSimuladoCentavos||
        por('direita')>saldo.reservaRestanteSimuladoCentavos)
      throw erro('SALDO_DOURADA_INTEGRAL_NAO_CONCILIADO');
     // Uma mesma receita nao pode alimentar dois centros dourados.
     for(const fonte of fontes)if(b.prepare([
      'SELECT 1 FROM loop_v6_pre_douradas_integral_fontes WHERE pedido_id=?'
     ].join(' ')).get(fonte.pedidoId))
      throw erro('DOURADA_FONTE_JA_COMPROMETIDA');
    }else if(saldo.centroRestanteSimuladoCentavos<valorSaida)
     throw erro('SALDO_CENTRAL_SIMULADO_INSUFICIENTE');
    inserir.run(ciclo.ciclo,centro.id,beneficiario,destino,
     valorSaida,new Date().toISOString());
    if(integral)for(const fonte of fontes)
     inserirFonte.run(ciclo.ciclo,fonte.ordem,fonte.pedidoId,
      fonte.centro,fonte.esquerda,fonte.direita);
    novas++;
   }
   if(!transacaoAberta)b.exec('COMMIT');
   return {novas,centroSimuladoRestanteCentavos:this.resumo().centroRestanteSimuladoCentavos,
    transferenciasReais:false};
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
   'SELECT COUNT(*) AS giros, COALESCE(SUM(valor_centavos),0) AS total,',
   "COALESCE(SUM(CASE WHEN destino='LOOP_DOURADAS' THEN valor_centavos ELSE 0 END),0) AS douradas,",
   "COALESCE(SUM(CASE WHEN destino='ESCRITORIO_PREVISTO' THEN valor_centavos ELSE 0 END),0) AS escritorios,",
   "COALESCE(SUM(CASE WHEN destino='LOOP_DOURADAS' THEN 1 ELSE 0 END),0) AS girosDouradas",
   'FROM loop_v6_pre_saidas'
  ].join(' ')).get();
  const reclass=b.prepare([
   'SELECT COALESCE(SUM(centro_centavos),0) AS centro,',
   'COALESCE(SUM(esquerda_centavos),0) AS esquerda,',
   'COALESCE(SUM(direita_centavos),0) AS direita',
   'FROM loop_v6_pre_douradas_integral_fontes'
  ].join(' ')).get();
  const integral=b.prepare([
   'SELECT COALESCE(SUM(valor_centavos),0) AS total',
   'FROM loop_v6_pre_saidas WHERE giro IN',
   '(SELECT giro FROM loop_v6_pre_douradas_integral_fontes)'
  ].join(' ')).get().total;
  const debitadoCentro=s.total-integral+reclass.centro;
  const centroRestante=r.centro-debitadoCentro;
  const esquerdaRestante=r.esquerda-reclass.esquerda;
  const direitaRestante=r.direita-reclass.direita;
  return {configurado:true,fase:l.fase,iniciadoEm:l.iniciado_em,
   valorFixoLoopCentavos:l.liquido_por_compra,
   aportesFicticiosConfirmados:r.compras,
   comprasConferidas:r.compras,totalHipoteticoCentavos:r.total,
   centroRecebidoSimuladoCentavos:r.centro,
   centroComprometidoSimuladoCentavos:debitadoCentro,
   centroRestanteSimuladoCentavos:centroRestante,
   // O quarto cofre nao e um pagamento nem volta automaticamente ao centro.
   douradasAcumuladoSimuladoCentavos:s.douradas,
   escritoriosPrevistosSimuladoCentavos:s.escritorios,
   girosComCentroDourado:s.girosDouradas,
   investimentoRestanteSimuladoCentavos:esquerdaRestante,
   reservaRestanteSimuladoCentavos:direitaRestante,
   reclassificacaoDouradasV2Centavos:integral,
   totalDemonstrativoConservadoCentavos:centroRestante+
     s.douradas+s.escritorios+esquerdaRestante+direitaRestante,
   girosRegistrados:s.giros,
   cofresDoLoop:['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'],
   caixaDaLojaSeparado:true,valoresReaisConciliados:false,
   saldoRealCentavos:0,valorParaSaqueCentavos:0,
   fluxoBancario:'NAO_CONECTADO',tipo:'PROJECAO_SEM_RECEITA_REAL'};
 }
}
module.exports={PreLancamentoCofresV6DemoSQLite};
