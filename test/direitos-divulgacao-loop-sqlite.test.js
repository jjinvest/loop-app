'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {consultarDivulgacao,consultarComissoesDivulgacao,
 verificarNickDivulgador}=
 require('../src/producao/direitos-divulgacao-loop-sqlite');
const {LivroFinanceiroRealSQLite}=require('../src/producao/livro-financeiro-real-sqlite');
const id='titular-123e4567-e89b-12d3-a456-426614174000';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
 'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT UNIQUE COLLATE NOCASE);',
 'CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY,',
 'titular_id TEXT NOT NULL,status TEXT NOT NULL,',
 'pagamento_id TEXT,atualizado_em INTEGER NOT NULL);',
 'CREATE TABLE loop_real_fotos_regras_pedido(',
 'pedido_id TEXT NOT NULL,cor TEXT NOT NULL,revisao INTEGER NOT NULL);'
 ].join(' '));
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,'Vilela');
 const estado=()=>consultarDivulgacao({banco:db,titularId:id});
 const inserir=(pedido,cor,{status='APROVADO_PARA_EXPEDICAO',pagamento='PAG_A',
   revisao=1}={})=>{
  db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
   .run(pedido,id,status,pagamento,1700000000000);
  db.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?)')
   .run(pedido,cor,revisao);
 };
 return {db,estado,inserir};
}
test('conta cadastrada sem compra nao recebe link',t=>{
 const x=fixture(t);assert.equal(x.estado().linkLiberado,false);
 assert.equal(verificarNickDivulgador({banco:x.db,nick:'vilela'}),false);
});
test('cinza nao libera link mesmo custando caro; sem PSP nao libera',t=>{
 const x=fixture(t);
 x.inserir('CINZA1','CINZA');
 x.inserir('VERDE_PENDENTE','VERDE',{status:'AGUARDANDO_PAGAMENTO',
  pagamento:null});
 x.inserir('ROXO_SEM_FOTO','ROXO',{revisao:0});
 assert.equal(x.estado().linkLiberado,false);
});
test('verde comprado e confirmado libera divulgacao sem ativar LOOP',t=>{
 const x=fixture(t);x.inserir('VERDE_1','VERDE');
 assert.equal(x.estado().linkLiberado,true);
 assert.equal(x.estado().participacaoLoopAtiva,false);
 assert.equal(x.estado().financeiroReal,false);
 assert.equal(verificarNickDivulgador({banco:x.db,nick:'Vilela'}),true);
});
test('roxo dourado e laranja permitem link por comprovacao, nunca posicao',t=>{
 for(const cor of ['ROXO','DOURADO','LARANJA']){
  const x=fixture(t);
  x.inserir('COMPRA_'+cor,cor);
  assert.equal(x.estado().linkLiberado,true,cor);
  assert.equal(x.estado().participacaoLoopAtiva,false);
 }
});
test('estorno revoga direito se nao restar nenhuma compra qualificadora',t=>{
 const x=fixture(t);x.inserir('ROXO_1','ROXO');
 assert.equal(x.estado().linkLiberado,true);
 x.db.prepare("UPDATE loja_real_pedidos SET status='CANCELADO'").run();
 assert.equal(x.estado().linkLiberado,false);
});
test('sem tabelas de pedido nao inventa habilitacao',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT);');
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,'Vilela');
 assert.equal(consultarDivulgacao({banco:db,titularId:id}).linkLiberado,false);
});

test('verde de R$190 habilita link mas compra do indicado sem ativacao nao da bonus',t=>{
 const x=fixture(t),db=x.db;
 const indicado='titular-123e4567-e89b-12d3-a456-426614174001';
 db.exec([
  'CREATE TABLE loop_real_vinculos_indicacao(',
  'indicado_id TEXT PRIMARY KEY,indicador_id TEXT,registrado_em INTEGER);',
  'CREATE TABLE loop_real_confirmacoes_cadastro(',
  'titular_id TEXT PRIMARY KEY,confirmado_em INTEGER);',
  'CREATE TABLE loop_real_indicacoes_validas_financeiro(',
  'indicado_id TEXT PRIMARY KEY,indicador_id TEXT,pedido_id TEXT,',
  'pagamento_id TEXT,comprovante_bancario_id TEXT,',
  'valor_qualificado_centavos INTEGER,tipo TEXT,confirmado_em INTEGER);',
  'CREATE TABLE loop_real_motor_compras(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,posicao_id INTEGER,',
  'valor_centavos INTEGER);',
  'ALTER TABLE loop_real_fotos_regras_pedido',
  'ADD COLUMN preco_unit_centavos INTEGER DEFAULT 0;'
 ].join(' '));
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(indicado,'Thaisa');
 x.inserir('LINK_VERDE_190','VERDE');
 db.prepare('UPDATE loop_real_fotos_regras_pedido SET preco_unit_centavos=19000').run();
 assert.equal(x.estado().linkLiberado,true);
 assert.equal(x.estado().participacaoLoopAtiva,false);
 db.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?,?)')
  .run(indicado,id,1700000000500);
 const inserirVenda=(pedido,cor,preco,status='APROVADO_PARA_EXPEDICAO')=>{
  db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
   .run(pedido,indicado,status,'PSP_'+pedido,1700000001000);
  db.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?,?)')
   .run(pedido,cor,1,preco);
 };
 inserirVenda('COMPRA_INDICADO','VERDE',25000);
 inserirVenda('VENDA_CINZA','CINZA',15000);
 inserirVenda('VERDE_INSUFICIENTE','VERDE',10000);
 const consultar=()=>consultarComissoesDivulgacao({banco:db,titularId:id});
 assert.equal(consultar().fonteCompleta,true);
 assert.equal(consultar().comissaoAConferirCentavos,0,
  'compras sem posicao nao geram bonus nem que ultrapassem R$250');
 db.prepare('INSERT INTO loop_real_indicacoes_validas_financeiro VALUES(?,?,?,?,?,?,?,?)')
  .run(indicado,id,'COMPRA_INDICADO','PSP_COMPRA_INDICADO',
   'COMPROVANTE_1',25000,'COMPRA_250',1700000002000);
 assert.equal(consultar().comissaoAConferirCentavos,0,
  'prova da compra sem CPF/termos e sem posicao nao habilita');
 db.prepare('INSERT INTO loop_real_confirmacoes_cadastro VALUES(?,?)')
  .run(indicado,1700000001500);
 assert.equal(consultar().comissaoAConferirCentavos,0,
  'aceite e compra sem ingresso efetivo na fila nao habilitam bonus');
 db.prepare('INSERT INTO loop_real_motor_compras VALUES(?,?,?,?)')
  .run('COMPRA_INDICADO',indicado,1,25000);
 const r=consultar();
 assert.equal(r.percentual,10);
 assert.equal(r.basePorAtivacaoCentavos,25000);
 assert.equal(r.bonusPorAtivacaoCentavos,2500);
 assert.equal(r.ativacoesValidas,1);
 assert.equal(r.comissaoAConferirCentavos,2500);
 assert.equal(r.saldoLiberadoCentavos,0);
 assert.equal(r.podeSacar,false);
 assert.equal(r.financeiroReal,false);
 // Valor elevado ou CINZA adicional nao multiplica bonus.
 db.prepare('UPDATE loop_real_fotos_regras_pedido SET preco_unit_centavos=100000 WHERE pedido_id=?')
  .run('VENDA_CINZA');
 db.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?,?)')
  .run('COMPRA_INDICADO','CINZA',1,80000);
 assert.equal(consultar().comissaoAConferirCentavos,2500);
 db.prepare("UPDATE loja_real_pedidos SET status='CANCELADO' WHERE pedido_id=?")
  .run('COMPRA_INDICADO');
 assert.equal(consultar().comissaoAConferirCentavos,0,
  'estorno bloqueia comissao mesmo mantendo comprovante historico');
 db.prepare("UPDATE loja_real_pedidos SET status='APROVADO_PARA_EXPEDICAO' WHERE pedido_id=?")
  .run('COMPRA_INDICADO');
 assert.equal(consultar().comissaoAConferirCentavos,2500);
 db.exec('CREATE TABLE loop_real_motor_qualificacoes('+
  'indicado_id TEXT PRIMARY KEY,indicador_id TEXT,evento_id TEXT);');
 const livroSemProva=new LivroFinanceiroRealSQLite({banco:db});
 assert.throws(()=>livroSemProva.registrarBonusPorIndicadoVerde({indicadoId:indicado}),
  e=>e.codigo==='FIN_COMPROVACAO_EXTERNA_NAO_HOMOLOGADA');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_fin_lancamentos').get().n,0,
  'nada e creditado sem prova externa');
 const livroComProvaDeTeste=new LivroFinanceiroRealSQLite({banco:db,
  provas:{confirmarIndicacaoVerde:args=>{
   assert.equal(args.indicadoId,indicado);
   assert.equal(args.indicadorId,id);
   assert.equal(args.baseCentavos,25000);
   assert.equal(args.comprovanteQualificacaoId,'COMPROVANTE_1');
   return {ambiente:'PRODUCAO',estado:'PSP_LIQUIDADO_E_INDICADO_VERDE',
    comprovanteId:'PROVA_RECONCILIADA_DE_TESTE'};
  }}
 });
 const primeiro=livroComProvaDeTeste.registrarBonusPorIndicadoVerde({indicadoId:indicado});
 assert.equal(primeiro.repetido,false);
 assert.equal(livroComProvaDeTeste.consultar({titularId:id}).saldoBonusCentavos,2500);
 assert.equal(livroComProvaDeTeste.consultar({titularId:id}).minimoSaqueCentavos,2500);
 assert.equal(livroComProvaDeTeste.consultar({titularId:id}).taxaSaquePercentual,0);
 assert.equal(livroComProvaDeTeste.consultar({titularId:id}).saqueRealHabilitado,false);
 assert.equal(livroComProvaDeTeste.registrarBonusPorIndicadoVerde({indicadoId:indicado}).repetido,true,
  'reprocessamento nao credita duas vezes');
 assert.equal(livroComProvaDeTeste.consultar({titularId:id}).saldoBonusCentavos,2500);
 assert.equal(consultar().comissaoAConferirCentavos,0,
  'apos credito comprovado, o mesmo bonus deixa de estar pendente');
});
test('indicacao sem foto qualificada, comprovante ou posicao nao recebe 10%',t=>{
 const x=fixture(t),db=x.db;
 const indicado='titular-123e4567-e89b-12d3-a456-426614174002';
 x.inserir('VERDE_ORIGEM','VERDE');
 db.exec([
  'CREATE TABLE loop_real_vinculos_indicacao(',
  'indicado_id TEXT PRIMARY KEY,indicador_id TEXT,registrado_em INTEGER);',
  'CREATE TABLE loop_real_confirmacoes_cadastro(',
  'titular_id TEXT PRIMARY KEY,confirmado_em INTEGER);',
  'CREATE TABLE loop_real_indicacoes_validas_financeiro(',
  'indicado_id TEXT PRIMARY KEY,indicador_id TEXT,pedido_id TEXT,',
  'pagamento_id TEXT,comprovante_bancario_id TEXT,',
  'valor_qualificado_centavos INTEGER,tipo TEXT,confirmado_em INTEGER);',
  'CREATE TABLE loop_real_motor_compras(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,posicao_id INTEGER,',
  'valor_centavos INTEGER);'
 ].join(' '));
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(indicado,'Bruno');
 db.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?,?)')
  .run(indicado,id,1700000000500);
 db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
  .run('COMPRA_CINZA',indicado,'APROVADO_PARA_EXPEDICAO',
   'PAG_CINZA',1700000000600);
 db.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?)')
  .run('COMPRA_CINZA','CINZA',1);
 db.prepare('INSERT INTO loop_real_confirmacoes_cadastro VALUES(?,?)')
  .run(indicado,1700000000700);
 db.prepare('INSERT INTO loop_real_indicacoes_validas_financeiro VALUES(?,?,?,?,?,?,?,?)')
  .run(indicado,id,'COMPRA_CINZA','PAG_CINZA',
   'COMPROVANTE_CINZA',25000,'COMPRA_250',1700000000800);
 db.prepare('INSERT INTO loop_real_motor_compras VALUES(?,?,?,?)')
  .run('COMPRA_CINZA',indicado,10,25000);
 assert.equal(consultarComissoesDivulgacao({banco:db,titularId:id}).comissaoAConferirCentavos,0);
});
