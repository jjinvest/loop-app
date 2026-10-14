'use strict';
const assert = require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=require('../src/integracoes/registro-fornecedores');
const {ImportadorCatalogoSimulado,MARCADOR_CONFIRMACAO}=
  require('../src/integracoes/importador-catalogo-simulado');

function produto(sku,nome='Mercadoria de teste'){
  return {sku,nome,descricao:'Produto de distribuicao ficticia',
    custoCentavos:123456,tokenSecreto:'NUNCA_COPIAR',endereco:'NUNCA_COPIAR'};
}
function produtoManual(id){
  return {id,nome:'Produto editado no LOOP',tipo:'FISICO',
    estado:'PUBLICADO',descricao:'Produto que nao deve ser sobrescrito',
    precoCentavos:19990,entrega:'FORNECEDOR_INTEGRADO',
    fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function contexto(t,itens=[produto('sku-a'),produto('sku-b')]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-import-vinculos-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const banco=new RepositorioCatalogoSQLite({caminho:path.join(dir,'catalogo.sqlite')});
  t.after(()=>banco.fechar());
  const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:banco});
  let lote=itens;
  const adaptador={
    versaoContrato:CONTRATO_FORNECEDOR,
    consultarEstoque:async()=>({quantidade:1}),
    consultarStatus:async()=>({status:'PENDENTE'}),
    listarProdutos:async()=>lote
  };
  const fornecedores=new RegistroFornecedores();
  fornecedores.registrar({fornecedorId:'parceiro-a',adaptador});
  const importador=new ImportadorCatalogoSimulado({
    registroFornecedores:fornecedores,repositorioCatalogo:banco
  });
  return {banco,vinculos,fornecedores,importador,trocarLista:nova=>{lote=nova;}};
}
async function importar(importador) {
  const plano=await importador.preparar({fornecedorId:'parceiro-a'});
  const resultado=await importador.aplicar({fornecedorId:'parceiro-a',
    revisaoLote:plano.revisaoLote,confirmacao:MARCADOR_CONFIRMACAO});
  return {plano,resultado};
}

test('cada SKU importado fica associado ao fornecedor com historico atomico',async t=>{
  const {banco,vinculos,importador}=contexto(t);
  const {plano,resultado}=await importar(importador);
  assert.equal(resultado.criados,2);
  assert.equal(resultado.ignorados,0);
  assert.equal(resultado.pendentesVinculo,0);
  assert.equal(resultado.publicados,0);
  for(const item of plano.itens){
    const p=banco.buscar(item.produtoId);
    assert.equal(p.id,item.produtoId);
    assert.equal(p.estado,'RASCUNHO');
    assert.equal(p.precoCentavos,null);
    assert.equal(p.compraDisponivel,false);
    const vinculo=vinculos.consultar({produtoId:item.produtoId});
    assert.equal(vinculo.fornecedorId,'parceiro-a');
    assert.equal(vinculo.sku,item.sku);
    assert.equal(vinculo.revisao,1);
    assert.deepEqual(vinculos.historico({produtoId:p.id}).map(x=>x.acao),['VINCULADO']);
    assert.equal(banco.historico(p.id).length,1);
    assert.doesNotMatch(JSON.stringify(p),/NUNCA_COPIAR|123456/);
  }
});

test('reimportacao preserva alteracoes manuais e nao duplica vinculos',async t=>{
  const {banco,vinculos,importador,trocarLista}=contexto(t,[produto('sku-1')]);
  const primeiro=await importar(importador);
  const id=primeiro.plano.itens[0].produtoId;
  banco.atualizar({id,revisaoEsperada:1,alteracoes:{
    nome:'Nome aprovado pelo LOOP',precoCentavos:16790,estado:'PUBLICADO'
  }});
  trocarLista([produto('sku-1','Novo nome no parceiro')]);
  const repetido=await importar(importador);
  assert.equal(repetido.resultado.criados,0);
  assert.equal(repetido.resultado.ignorados,1);
  assert.equal(repetido.resultado.pendentesVinculo,0);
  assert.equal(banco.buscar(id).nome,'Nome aprovado pelo LOOP');
  assert.equal(banco.buscar(id).precoCentavos,16790);
  assert.equal(banco.buscarRegistro(id).revisao,2);
  assert.equal(banco.historico(id).length,2);
  assert.equal(vinculos.historico({produtoId:id}).length,1);
});

test('se um SKU conflita, toda a importacao e revertida e nenhum historico novo sobra',async t=>{
  const {banco,vinculos,importador}=contexto(t,[produto('sku-a'),produto('sku-z')]);
  banco.salvar({produto:produtoManual('produto-reservado'),revisaoEsperada:0});
  vinculos.vincular({produtoId:'produto-reservado',fornecedorId:'parceiro-a',
    sku:'sku-z',revisaoEsperada:0});
  const plano=await importador.preparar({fornecedorId:'parceiro-a'});
  await assert.rejects(importador.aplicar({
    fornecedorId:'parceiro-a',revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  }),/UNIQUE constraint failed/);
  assert.deepEqual(banco.listar().map(p=>p.id),['produto-reservado']);
  assert.equal(banco.historico('produto-reservado').length,1);
  assert.equal(vinculos.historico({produtoId:'produto-reservado'}).length,1);
  for(const p of plano.itens){
    assert.equal(banco.buscar(p.produtoId),null);
    assert.equal(vinculos.consultar({produtoId:p.produtoId}),null);
    assert.deepEqual(banco.historico(p.produtoId),[]);
  }
});

test('produto preexistente sem vinculo fica preservado e demanda revisao manual',async t=>{
  const {banco,vinculos,importador}=contexto(t,[produto('sku-a')]);
  const plano=await importador.preparar({fornecedorId:'parceiro-a'});
  const id=plano.itens[0].produtoId;
  banco.salvar({produto:produtoManual(id),revisaoEsperada:0});
  const novaPrevia=await importador.preparar({fornecedorId:'parceiro-a'});
  assert.equal(novaPrevia.itens[0].situacao,'VINCULO_PENDENTE');
  const resultado=await importador.aplicar({
    fornecedorId:'parceiro-a',revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  });
  assert.equal(resultado.criados,0);
  assert.equal(resultado.ignorados,1);
  assert.equal(resultado.pendentesVinculo,1);
  assert.equal(banco.buscar(id).nome,'Produto editado no LOOP');
  assert.equal(banco.buscar(id).precoCentavos,19990);
  assert.equal(vinculos.consultar({produtoId:id}),null);
  assert.equal(banco.historico(id).length,1);
});

test('vinculo existente trocado manualmente nao e restaurado pelo importador',async t=>{
  const {banco,vinculos,importador}=contexto(t,[produto('sku-a')]);
  const a=await importar(importador);
  const id=a.plano.itens[0].produtoId;
  vinculos.vincular({produtoId:id,fornecedorId:'novo-distribuidor',
    sku:'sku-substituto',revisaoEsperada:1});
  const previa=await importador.preparar({fornecedorId:'parceiro-a'});
  assert.equal(previa.itens[0].situacao,'VINCULO_PENDENTE');
  const novamente=await importar(importador);
  assert.equal(novamente.resultado.pendentesVinculo,1);
  assert.equal(vinculos.consultar({produtoId:id}).fornecedorId,'novo-distribuidor');
  assert.equal(vinculos.historico({produtoId:id}).length,2);
  assert.equal(banco.buscar(id).estado,'RASCUNHO');
});

test('lote alterado ou invalido nao cria cadastro nem vinculo',async t=>{
  const {banco,vinculos,importador,trocarLista}=contexto(t,[produto('sku-a')]);
  const plano=await importador.preparar({fornecedorId:'parceiro-a'});
  trocarLista([produto('sku-a'),produto('sku-b')]);
  await assert.rejects(importador.aplicar({fornecedorId:'parceiro-a',
    revisaoLote:plano.revisaoLote,confirmacao:MARCADOR_CONFIRMACAO}),/Lote mudou/);
  trocarLista([produto('sku-a'),produto('../../arquivo')]);
  await assert.rejects(importador.preparar({fornecedorId:'parceiro-a'}),/SKU invalido/);
  assert.deepEqual(banco.listar(),[]);
  assert.equal(vinculos.consultar({produtoId:plano.itens[0].produtoId}),null);
});

test('dois distribuidores com SKU igual nao dividem vinculo nem identificador',async t=>{
  const {banco,vinculos,importador,fornecedores}=contexto(t,[produto('MESMO_SKU')]);
  fornecedores.registrar({fornecedorId:'parceiro-b',adaptador:{
    versaoContrato:CONTRATO_FORNECEDOR,
    consultarEstoque:async()=>({quantidade:1}),
    consultarStatus:async()=>({status:'PENDENTE'}),
    listarProdutos:async()=>[produto('MESMO_SKU')]
  }});
  const planoA=await importador.preparar({fornecedorId:'parceiro-a'});
  const planoB=await importador.preparar({fornecedorId:'parceiro-b'});
  for(const plano of [planoA,planoB]){
    const r=await importador.aplicar({fornecedorId:plano.fornecedorId,
      revisaoLote:plano.revisaoLote,confirmacao:MARCADOR_CONFIRMACAO});
    assert.equal(r.criados,1);
  }
  assert.equal(banco.listar().length,2);
  assert.notEqual(planoA.itens[0].produtoId,planoB.itens[0].produtoId);
  assert.equal(vinculos.consultar({produtoId:planoA.itens[0].produtoId}).fornecedorId,'parceiro-a');
  assert.equal(vinculos.consultar({produtoId:planoB.itens[0].produtoId}).fornecedorId,'parceiro-b');
});
