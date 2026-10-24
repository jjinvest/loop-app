'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {PendenciasConciliacaoDemoSQLite}=require('../src/domain/pendencias-conciliacao-demo-sqlite');
const {auditarExtratoPspFicticioLoop}=require('../src/domain/auditoria-extrato-psp-ficticio-loop');
const {auditarPortaoPrelancamentoLoopLab}=require('../src/domain/auditoria-portao-prelancamento-loop-lab');
const NOW='2036-09-20T12:00:00.000Z';
function contexto(){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 repo.salvar({produto:{id:'pdf-250',nome:'PDF teste',
  tipo:'PDF',descricao:'Curso ficticio',estado:'PUBLICADO',precoCentavos:25000,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,
  detalhes:[]},revisaoEsperada:0});
 const banco=repo.banco,contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>NOW});
 let carrinhos;
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,pedidosIdentificados:pedidos,
  atribuicaoManualPorPosicao:true,relogio:()=>NOW,
  consultarPagamentoConfiavel:async id=>carrinhos.comprovanteConfirmado(id)});
 carrinhos=new CarrinhoLojaLoopDemoSQLite({catalogo:repo,contas,
  pedidosIdentificados:pedidos,ponte,relogio:()=>NOW});
 const pendencias=new PendenciasConciliacaoDemoSQLite({banco,relogio:()=>NOW});
 return {repo,banco,contas,pedidos,ponte,carrinhos,pendencias};
}
async function criar(m){
 const a=m.contas.cadastrar({nome:'Revisao',
  email:'auditoria-portao@exemplo.invalid',senha:'senha-ficticia-2026-longo'});
 const pedidoId='pedido-portao-001';
 m.carrinhos.criar({pedidoId,contaId:a.contaId,itens:[{produtoId:'pdf-250',quantidade:1}]});
 m.carrinhos.registrarEvento({pedidoId,eventoId:'conf-portao-local-001',tipo:'CONFIRMAR_FICTICIO'});
 assert.equal((await m.carrinhos.sincronizar(pedidoId)).posicaoCriada,true);
 const p=m.pedidos.buscar(pedidoId);
 return {pedidoId,eventoId:'extrato-portao-001',
  tipo:'CONFIRMACAO_FICTICIA',intentoPagamentoId:p.intentoPagamentoId,
  valorCentavos:p.valorCentavos};
}
const conferir=(m,e)=>auditarPortaoPrelancamentoLoopLab({
 ponte:m.ponte,carrinhos:m.carrinhos,eventosExternosFicticios:e
});
test('mesmo com laboratorio integro e 0% nao autoriza lancamento real',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 const evento=await criar(m);
 const antes=m.ponte._restaurar().exportarSnapshot();
 const r=conferir(m,[evento]);
 assert.equal(r.consistenciaLocalDaAmostra,true);
 assert.equal(r.integridadeSQLite,true);
 assert.equal(r.conciliacaoFicticia,'SEM_DIVERGENCIAS_NESTA_AMOSTRA');
 assert.equal(r.taxaSaqueParticipantePercentual,0);
 assert.equal(r.prontoParaProducao,false);
 assert.equal(r.dinheiroRealComprovado,false);
 assert.equal(r.publicacaoAutorizada,false);
 assert.equal(r.autorizacaoFinanceira,false);
 assert.ok(r.bloqueiosExternosObrigatorios.includes(
  'VALIDACAO_JURIDICA_DO_MODELO_COMERCIAL_PENDENTE'));
 assert.ok(r.bloqueiosExternosObrigatorios.includes(
  'PROVEDOR_PSP_BANCO_NAO_CONTRATADO_OU_HOMOLOGADO'));
 assert.deepEqual(m.ponte._restaurar().exportarSnapshot(),antes);
 console.log('LOOP_PORTAO_PRELANCAMENTO='+JSON.stringify({
  consistenciaLocal:true,taxaParticipantePercentual:0,
  pendenciasExternas:r.bloqueiosExternosObrigatorios.length,
  liberacaoFinanceiraReal:false,lancamentoAutorizado:false,
  integridade:'ok'}));
});
test('auditoria detecta extrato ausente e pendencia humana aberta sem fazer compensacao',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 const evento=await criar(m);
 const divergente=auditarExtratoPspFicticioLoop({
  carrinhos:m.carrinhos,eventosExternosFicticios:[]});
 m.pendencias.registrar({pedidoId:evento.pedidoId,eventoId:'abertura-portao-001',
  acao:'ABERTURA',observacao:'Aguardar documento externo para conciliacao',
  diagnostico:divergente});
 const r=conferir(m,[]);
 assert.equal(r.consistenciaLocalDaAmostra,false);
 assert.ok(r.riscosLocais.includes('DIVERGENCIA_DE_CONCILIACAO_FICTICIA'));
 assert.ok(r.riscosLocais.includes('PENDENCIAS_HUMANAS_NAO_ENCERRADAS'));
 assert.equal(r.pendenciasDeTriagemAbertas,1);
 const comExtrato=conferir(m,[evento]);
 assert.equal(comExtrato.conciliacaoFicticia,'SEM_DIVERGENCIAS_NESTA_AMOSTRA');
 assert.equal(comExtrato.consistenciaLocalDaAmostra,false,
  'A pendencia nao se apaga por simples extrato novo');
 assert.equal(comExtrato.prontoParaProducao,false);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
});

test('portao permanece bloqueado mesmo se as evidencias locais forem repetidas',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 const evento=await criar(m);
 const a=conferir(m,[evento]);
 const b=conferir(m,[evento]);
 assert.deepEqual(b,a,'Auditoria somente leitura deve ser deterministica');
 assert.equal(b.prontoParaProducao,false);
 assert.equal(b.autorizacaoFinanceira,false);
 assert.equal(b.publicacaoAutorizada,false);
 assert.equal(b.bloqueiosExternosObrigatorios.length>0,true);
 const pendentes=b.bloqueiosExternosObrigatorios;
 assert.equal(new Set(pendentes).size,pendentes.length);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
});

test('portao nao aceita extrato artificial omitido como conciliado',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 await criar(m);
 const r=auditarPortaoPrelancamentoLoopLab({ponte:m.ponte,carrinhos:m.carrinhos});
 assert.equal(r.conciliacaoFicticia,'NAO_EXECUTADA');
 assert.ok(r.riscosLocais.includes('EXTRATO_ARTIFICIAL_NAO_CONFERIDO'));
 assert.equal(r.consistenciaLocalDaAmostra,false);
 assert.equal(r.prontoParaProducao,false);
});

test('extrato divergente jamais habilita liberacao financeira',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 const evento=await criar(m);
 const alterado={...evento,valorCentavos:evento.valorCentavos+100};
 const r=conferir(m,[alterado]);
 assert.equal(r.consistenciaLocalDaAmostra,false);
 assert.ok(r.riscosLocais.includes('DIVERGENCIA_DE_CONCILIACAO_FICTICIA'));
 assert.equal(r.autorizacaoFinanceira,false);
 assert.equal(r.dinheiroRealComprovado,false);
 assert.equal(r.prontoParaProducao,false);
});

test('portao recusa extrato com valor divergente sem criar compensacao',async t=>{
 const m=contexto();t.after(()=>m.repo.fechar());
 const evento=await criar(m);
 const antes=m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n;
 const divergente={...evento,valorCentavos:evento.valorCentavos+1};
 const r=conferir(m,[divergente]);
 assert.equal(r.consistenciaLocalDaAmostra,false);
 assert.ok(r.riscosLocais.includes('DIVERGENCIA_DE_CONCILIACAO_FICTICIA'));
 assert.equal(r.prontoParaProducao,false);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,antes);
});
