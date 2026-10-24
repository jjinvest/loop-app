'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {ElegibilidadeProdutosLoopDemoSQLite}=require('../src/domain/elegibilidade-produtos-loop-demo-sqlite');

test('AKITEMM: 190 unitario nao qualifica; duas unidades qualificam exatamente uma posicao',async t=>{
 const catalogo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>catalogo.fechar());
 const banco=catalogo.banco;
 catalogo.salvar({produto:{id:'produto-190',nome:'Produto teste 190',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Produto de laboratorio',precoCentavos:19000,entrega:'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]},revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco});
 const conta=contas.cadastrar({nome:'Comprador Laboratorio',email:'comprador190@exemplo.invalid',senha:'senha-segura-de-laboratorio-2026'});
 const pedidosIdentificados=new PedidosTitularidadeDemoSQLite({banco,contas});
 let carrinho;
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,pedidosIdentificados,
  consultarPagamentoConfiavel:async id=>carrinho.comprovanteConfirmado(id)});
 carrinho=new CarrinhoLojaLoopDemoSQLite({catalogo,contas,pedidosIdentificados,ponte});
 const regras=new ElegibilidadeProdutosLoopDemoSQLite({catalogo});
 const atual=regras.consultar('produto-190');
 regras.alterarQuantidadeMinima({produtoId:'produto-190',quantidadeMinimaLoop:2,
  revisaoEsperada:atual.revisaoQuantidadeMinima});
 assert.throws(()=>carrinho.criar({pedidoId:'pedido-uma-unidade',contaId:conta.contaId,
  itens:[{produtoId:'produto-190',quantidade:1}],participarLoop:true}),
  e=>e.codigo==='OPCAO_LOOP_INELEGIVEL');
 const uma=carrinho.criar({pedidoId:'pedido-uma-sem-loop',contaId:conta.contaId,
  itens:[{produtoId:'produto-190',quantidade:1}],participarLoop:false});
 assert.equal(uma.totalCentavos,19000);
 carrinho.registrarEvento({pedidoId:'pedido-uma-sem-loop',eventoId:'confirmar-uma',tipo:'CONFIRMAR_FICTICIO'});
 const r1=await carrinho.sincronizar('pedido-uma-sem-loop');
 assert.equal(r1.posicaoCriada,false);
 const duas=carrinho.criar({pedidoId:'pedido-duas-unidades',contaId:conta.contaId,
  itens:[{produtoId:'produto-190',quantidade:2}],participarLoop:true});
 assert.equal(duas.totalCentavos,38000);
 assert.equal(duas.totalElegivelLoopCentavos,38000);
 assert.equal(duas.posicoesSolicitadas,1);
 const antes=await carrinho.sincronizar('pedido-duas-unidades');
 assert.equal(antes.posicaoCriada,false);
 carrinho.registrarEvento({pedidoId:'pedido-duas-unidades',eventoId:'confirmar-duas',tipo:'CONFIRMAR_FICTICIO'});
 const r2=await carrinho.sincronizar('pedido-duas-unidades');
 assert.equal(r2.posicaoCriada,true);
 const repetido=await carrinho.sincronizar('pedido-duas-unidades');
 assert.equal(repetido.repetido,true);
 assert.equal(carrinho.buscar('pedido-duas-unidades').posicaoIds.length,1);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log('RELATORIO_AKITEMM_190='+JSON.stringify({unitario:190,duasUnidades:380,
  posicoesCriadas:1,pedidoUnico:true,pagamentoReal:false}));
});
