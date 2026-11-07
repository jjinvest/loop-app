'use strict';
// Livro transacional das LUZES FINANCEIRAS, distinto dos GIROS FISICOS.
// Somente homologacao: nem provisao, nem cor, nem giro executa Pix ou saque.
// Toda luz nova vem de UMA compra vinculada no mesmo SQLite do motor.
const {PISO_VERDE}=require('./plano-posicoes-compra-akitemm');
const {planejarRecebimentoTresBancos}=require('./plano-roteamento-tres-bancos-lab');
const {cofreDoEvento,REGRA_DOURADA_LEGADA}=
 require('./destino-financeiro-centro-loop');
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
const COFRES=['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'];
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const dinheiro=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000000;
class LivroLuzesFinanceirasCandidatoSQLite{
 constructor({banco}={}){
  if(process.env.NODE_ENV==='production')falha('LIVRO_LUZES_LAB_PROIBIDO_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   falha('SQLITE_COMPARTILHADO_OBRIGATORIO');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_pedido_custos_fotografia_lab(',
   'prepedido_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'fotografia_json TEXT NOT NULL,criado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS pedido_custos_foto_no_update',
   'BEFORE UPDATE ON akitemm_pedido_custos_fotografia_lab',
   "BEGIN SELECT RAISE(ABORT,'custos de pedido imutaveis'); END;",
   'CREATE TRIGGER IF NOT EXISTS pedido_custos_foto_no_delete',
   'BEFORE DELETE ON akitemm_pedido_custos_fotografia_lab',
   "BEGIN SELECT RAISE(ABORT,'custos de pedido imutaveis'); END;",
   'CREATE TABLE IF NOT EXISTS akitemm_luzes_financeiras_eventos_lab(',
   'venda_id TEXT PRIMARY KEY,prepedido_id TEXT NOT NULL REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'ciclo INTEGER NOT NULL CHECK(ciclo>=1),',
   'ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 6),',
   'posicao_centro INTEGER NOT NULL CHECK(posicao_centro>0),',
   "papel_visual TEXT NOT NULL CHECK(papel_visual IN ('PARTICIPANTE','EMPRESA','EMPRESA_INVESTIMENTO')),",
   "cofre_destino TEXT NOT NULL CHECK(cofre_destino IN ('LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS')),",
   'referencia_centavos INTEGER NOT NULL CHECK(referencia_centavos=25000),',
   "origem TEXT NOT NULL CHECK(origem IN ('ENSAIO_SEM_PSP','PSP_SANDBOX_RECONSULTADO')),",
   "situacao TEXT NOT NULL CHECK(situacao='PROVISAO_NAO_LIQUIDADA'),",
   'criado_em INTEGER NOT NULL,UNIQUE(ciclo,ordem));',
   'CREATE TRIGGER IF NOT EXISTS luz_financeira_no_update',
   'BEFORE UPDATE ON akitemm_luzes_financeiras_eventos_lab',
   "BEGIN SELECT RAISE(ABORT,'luz financeira imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS luz_financeira_no_delete',
   'BEFORE DELETE ON akitemm_luzes_financeiras_eventos_lab',
   "BEGIN SELECT RAISE(ABORT,'luz financeira imutavel'); END;"
  ].join(' '));
 }
 // Deve ser chamado dentro do BEGIN IMMEDIATE do prepedido, nunca fora.
 congelarCustosPedido({prepedidoId,itens,totalCentavos,fotografia}={}){
  if(!PEDIDO.test(prepedidoId)||!Array.isArray(itens)||itens.length===0||
   !dinheiro(totalCentavos)||!fotografia?.planejamentoPosicoes)
   falha('FOTOGRAFIA_CUSTOS_INVALIDA');
  const foto=itens.map(item=>{
   const custo=this.banco.prepare([
    'SELECT custo_fornecedor_centavos AS fornecedor,',
    'frete_centavos AS frete,tarifa_psp_estimada_centavos AS tarifaPsp,',
    'reserva_tributaria_estimada_centavos AS tributos,revisao',
    'FROM akitemm_custos_produtos_admin_lab WHERE produto_id=?'
   ].join(' ')).get(item.produtoId);
   if(!Number.isSafeInteger(item.quantidade)||item.quantidade<1||
      !dinheiro(item.precoUnitarioCentavos)||!dinheiro(item.subtotalCentavos)||
      item.precoUnitarioCentavos*item.quantidade!==item.subtotalCentavos)
    falha('FOTOGRAFIA_CUSTO_ITEM_INVALIDO');
   return {produtoId:item.produtoId,quantidade:item.quantidade,
    precoUnitarioCentavos:item.precoUnitarioCentavos,
    subtotalCentavos:item.subtotalCentavos,
    fornecedorUnitarioCentavos:custo?.fornecedor??null,
    freteUnitarioCentavos:custo?.frete??null,
    tarifaPspUnitariaCentavos:custo?.tarifaPsp??null,
    tributosUnitariosEstimadosCentavos:custo?.tributos??null,
    revisaoCustos:custo?.revisao??null};
  });
  const totalItens=foto.reduce((s,x)=>s+x.subtotalCentavos,0);
  if(totalItens!==totalCentavos)falha('FOTOGRAFIA_CUSTOS_TOTAL_DIVERGENTE');
  const quantidade=fotografia.planejamentoPosicoes.quantidadePosicoesPrevistas;
  if(!Number.isSafeInteger(quantidade)||quantidade<0||quantidade>10)
   falha('FOTOGRAFIA_CUSTOS_POSICOES_INVALIDAS');
  const soma=chave=>foto.some(x=>x[chave]===null)?null:
   foto.reduce((acc,x)=>acc+x[chave]*x.quantidade,0);
  const fornecedor=soma('fornecedorUnitarioCentavos');
  const frete=soma('freteUnitarioCentavos');
  const tarifa=soma('tarifaPspUnitariaCentavos');
  const tributos=soma('tributosUnitariosEstimadosCentavos');
  const referencia=quantidade*PISO_VERDE;
  const valores=[fornecedor,frete,tarifa,tributos];
  const margem=valores.every(dinheiro)?
   totalCentavos-referencia-valores.reduce((s,x)=>s+x,0):null;
  const fotografiaPedido={
   prepedidoId,totalBrutoCotadoCentavos:totalCentavos,
   quantidadePosicoesPlanejadas:quantidade,
   referenciaLoopPrevistaCentavos:referencia,
   custoFornecedorPrevistoCentavos:fornecedor,
   fretePrevistoCentavos:frete,tarifaPspPrevistaCentavos:tarifa,
   reservaTributariaEstimadaCentavos:tributos,
   margemComercialEstimadaCentavos:margem,
   custosCompletos:valores.every(dinheiro),
   margemNegativa:margem!==null&&margem<0,
   itens:foto,estado:'PEDIDO_PREPARADO_SEM_RECEBIMENTO',
   fornecedorPagoCentavos:0,pagamentoFornecedorConfirmado:false,
   splitRealConfirmado:false,liberacaoBancariaCentavos:0
  };
  this.banco.prepare([
   'INSERT INTO akitemm_pedido_custos_fotografia_lab',
   '(prepedido_id,fotografia_json,criado_em) VALUES(?,?,?)'
  ].join(' ')).run(prepedidoId,JSON.stringify(fotografiaPedido),Date.now());
  return fotografiaPedido;
 }
 static vendas(sim){
  return [...sim.tabuleiro.ciclosConcluidos.flatMap(c=>c.vendas),
   ...sim.tabuleiro.vendasDoCiclo];
 }
 // Chamado pela transacao ORIGINAL de giro/temporizador. Nao abre transacao.
 // Antes e depois: giro fisico nao insere luz se luz ja existia.
 registrarNovasLuzes({antes,sim,indiceCiclosAntes=0,comPspSandbox=false}={}){
  if(!sim||!(antes instanceof Set)||!Number.isSafeInteger(indiceCiclosAntes)||
     indiceCiclosAntes<0)falha('MOTOR_LUZES_ORIGEM_OBRIGATORIA');
  let novas=0;
  // Somente novos eventos desta transacao. Historico nao e recriado
  // em cada pulso, impedindo quadratica e reinterpretacao retroativa.
  const rows=[...sim.tabuleiro.ciclosConcluidos
   .slice(indiceCiclosAntes).flatMap(c=>c.vendas),
   ...sim.tabuleiro.vendasDoCiclo];
  for(const venda of rows){
   if(antes.has(venda.vendaId))continue;
   if(typeof venda.vendaId!=='string'||!venda.vendaId.startsWith('ensaio:'))
    falha('LIVRO_EVENTO_SEM_COMPRA_VINCULADA');
   const prepedidoId=venda.vendaId.slice('ensaio:'.length);
   if(!PEDIDO.test(prepedidoId))falha('LIVRO_LUZ_PEDIDO_INVALIDO');
   const origem=this.banco.prepare([
    'SELECT 1 AS ok FROM akitemm_motor_conta_ensaio_operacoes',
    "WHERE prepedido_id=? AND tipo='VINCULAR_PEDIDO' LIMIT 1"
   ].join(' ')).get(prepedidoId);
   if(!origem)falha('LIVRO_LUZ_FORA_DO_MOTOR');
   const registrado=this.banco.prepare([
    'SELECT 1 AS ok FROM akitemm_luzes_financeiras_eventos_lab',
    'WHERE venda_id=?'
   ].join(' ')).get(venda.vendaId);
   if(registrado)continue;
   const cofre=cofreDoEvento({posicaoCentro:{
    empresa:venda.destinoCofre==='LOOP_DOURADAS'
   },ordem:venda.ordem,
    regraDourada:venda.regraDourada||REGRA_DOURADA_LEGADA});
   if(cofre!==venda.destinoCofre)
    falha('LIVRO_LUZ_DESTINO_NAO_CONCILIADO');
   this.banco.prepare([
    'INSERT INTO akitemm_luzes_financeiras_eventos_lab',
    '(venda_id,prepedido_id,ciclo,ordem,posicao_centro,',
    'papel_visual,cofre_destino,referencia_centavos,origem,situacao,criado_em)',
    "VALUES(?,?,?,?,?,?,?,?,?,'PROVISAO_NAO_LIQUIDADA',?)"
   ].join(' ')).run(venda.vendaId,prepedidoId,venda.ciclo,venda.ordem,
    venda.posicaoCentroId,venda.destinoPrevisto,venda.destinoCofre,
    PISO_VERDE,comPspSandbox?'PSP_SANDBOX_RECONSULTADO':'ENSAIO_SEM_PSP',
    Date.now());
   novas++;
  }
  return novas;
 }
 consultar({limite=20}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>50)
   falha('LIVRO_PAGINACAO_INVALIDA');
  const luzes=this.banco.prepare([
   'SELECT venda_id AS vendaId,prepedido_id AS prepedidoId,',
   'ciclo,ordem,posicao_centro AS posicaoCentroId,',
   'papel_visual AS papelVisual,cofre_destino AS cofreDestino,',
   'referencia_centavos AS referenciaCentavos,origem,situacao,',
   'criado_em AS criadoEm',
   'FROM akitemm_luzes_financeiras_eventos_lab',
   'ORDER BY criado_em DESC,venda_id DESC LIMIT ?'
  ].join(' ')).all(limite);
  const pedidos=this.banco.prepare([
   'SELECT prepedido_id AS prepedidoId,fotografia_json AS fotografia',
   'FROM akitemm_pedido_custos_fotografia_lab',
   'ORDER BY criado_em DESC,prepedido_id DESC LIMIT ?'
  ].join(' ')).all(limite).map(r=>JSON.parse(r.fotografia));
  const cofreRows=this.banco.prepare([
   'SELECT cofre_destino AS cofre,COUNT(*) AS eventos,',
   'SUM(referencia_centavos) AS previstoCentavos',
   'FROM akitemm_luzes_financeiras_eventos_lab GROUP BY cofre_destino'
  ].join(' ')).all();
  const cofres=COFRES.map(cofre=>{
   const r=cofreRows.find(x=>x.cofre===cofre);
   return {cofre,eventos:r?.eventos||0,valorPrevistoNaoSacavelCentavos:r?.previstoCentavos||0,
    saldoRealCentavos:null,transferenciaRealConfirmada:false};
  });
  const qtd=this.banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_luzes_financeiras_eventos_lab'
  ).get().n;
  const semCustos=pedidos.filter(p=>!p.custosCompletos).length;
  const roteamentoBancarioPlanejado=pedidos.map(fotografia=>
   planejarRecebimentoTresBancos({fotografia}));
  return {luzesFinanceirasRegistradas:qtd,luzes,cofres,
   pedidosFotografados:this.banco.prepare(
    'SELECT COUNT(*) AS n FROM akitemm_pedido_custos_fotografia_lab'
   ).get().n,pedidos,amostraPedidosSemCustos:semCustos,
   roteamentoBancarioPlanejado,
   bancosPlanejados:[
    {caixa:'LOJA',instituicaoSugerida:'Mercado Pago',conectado:false},
    {caixa:'LOOP_CENTRO',instituicaoSugerida:'Banco Inter',conectado:false},
    {caixa:'LOOP_LATERAIS_RESERVAS_DOURADAS',
     instituicaoSugerida:'Terceiro banco a definir',conectado:false}
   ],inicioConferenciaLocal:'09:00',fuso:'America/Sao_Paulo',
   fonte:'MESMO_SQLITE_MOTOR_LOJA_ESCRITORIO',
   valorRealRecebidoCentavos:null,valorDisponivelParaSaqueCentavos:0,
   pagamentosFornecedorRealizadosCentavos:0,transferenciasBancariasEfetuadas:0,
   dinheiroReal:false,splitReal:false,semCreditoAutomatico:true,
   status:'PROVISOES_POR_LUZ_SEM_LIQUIDACAO_COMERCIAL'};
 }
}
module.exports={LivroLuzesFinanceirasCandidatoSQLite};
