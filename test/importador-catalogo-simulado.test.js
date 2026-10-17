'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RegistroFornecedores, CONTRATO_FORNECEDOR } =
  require('../src/integracoes/registro-fornecedores');
const { RepositorioCatalogoSQLite } =
  require('../src/domain/repositorio-catalogo-sqlite');
const { ImportadorCatalogoSimulado, MARCADOR_CONFIRMACAO, MAX_ITENS } =
  require('../src/integracoes/importador-catalogo-simulado');

function item(sku, nome='Mercadoria demonstrativa') {
  return {
    sku, nome, descricao: 'Produto fornecido por distribuidor de testes',
    precoCustoCentavos: 999999,
    token: 'NAO-COPIAR-TOKEN-DO-FORNECEDOR',
    imagens: ['https://terceiros.invalid/foto.jpg'],
    enderecoCliente: 'NAO-COPIAR-ENDERECO'
  };
}
function adaptador(listarProdutos) {
  return {
    versaoContrato: CONTRATO_FORNECEDOR,
    consultarEstoque: async () => ({ quantidade: 5 }),
    consultarStatus: async () => ({ status: 'PENDENTE' }),
    listarProdutos
  };
}
function iniciar(t, produtos = [item('sku-a'),item('sku-b')]) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(),'loop-importacao-parceiro-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const caminho = path.join(pasta,'catalogo.sqlite');
  const repositorio = new RepositorioCatalogoSQLite({ caminho });
  t.after(() => repositorio.fechar());
  let resposta = produtos;
  const registro = new RegistroFornecedores();
  registro.registrar({ fornecedorId: 'franquia-teste', adaptador: adaptador(async () => resposta) });
  const importador = new ImportadorCatalogoSimulado({
    registroFornecedores: registro,
    repositorioCatalogo: repositorio
  });
  return { repositorio, caminho, registro, importador, mudar: p => { resposta = p; } };
}

test('previa nao altera banco nem publica produtos ou precos do distribuidor', async t => {
  const { importador, repositorio } = iniciar(t);
  const plano = await importador.preparar({ fornecedorId:'franquia-teste' });
  assert.equal(plano.itens.length,2);
  assert.ok(plano.itens.every(p => p.situacao === 'NOVO_RASCUNHO'));
  assert.match(plano.revisaoLote,/^[a-f0-9]{64}$/);
  assert.deepEqual(repositorio.listar(),[]);
  assert.equal(plano.itens[0].nomeSugerido,'Mercadoria demonstrativa');
  assert.equal(JSON.stringify(plano).includes('NAO-COPIAR'),false);
  assert.equal(JSON.stringify(plano).includes('999999'),false);
});

test('importacao aprovada cria somente rascunhos sem preco ou fotos nao validadas', async t => {
  const { importador, repositorio } = iniciar(t);
  const plano = await importador.preparar({ fornecedorId:'franquia-teste' });
  await assert.rejects(
    importador.aplicar({ fornecedorId:'franquia-teste',revisaoLote:plano.revisaoLote }),
    /Confirmacao/
  );
  assert.equal(repositorio.listar().length,0);
  const r = await importador.aplicar({
    fornecedorId:'franquia-teste', revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  });
  assert.deepEqual({criados:r.criados,ignorados:r.ignorados}, {criados:2,ignorados:0});
  assert.equal(r.publicados,0);
  assert.equal(r.comprasHabilitadas,false);
  const itens=repositorio.listar();
  assert.equal(itens.length,2);
  assert.ok(itens.every(p => p.estado==='RASCUNHO' && p.precoCentavos===null));
  assert.ok(itens.every(p => p.tipo==='FISICO' && p.entrega==='FORNECEDOR_INTEGRADO'));
  assert.ok(itens.every(p => p.fotos.length===0 && p.videoApresentacaoUrl===null));
  assert.ok(itens.every(p => p.compraDisponivel===false));
  assert.ok(itens.every(p => repositorio.historico(p.id).length===1));
  assert.doesNotMatch(JSON.stringify(itens),/NAO-COPIAR|999999|terceiros.invalid/);
});

test('reimportacao nao duplica nem substitui nome e preco alterados pelo administrador', async t => {
  const { importador, repositorio, mudar } = iniciar(t);
  const plano = await importador.preparar({ fornecedorId:'franquia-teste' });
  await importador.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:plano.revisaoLote,confirmacao:MARCADOR_CONFIRMACAO
  });
  const id=plano.itens[0].produtoId;
  repositorio.atualizar({ id, revisaoEsperada:1, alteracoes:{
    nome:'Titulo definido pelo LOOP',precoCentavos:15990,estado:'PUBLICADO'
  } });
  mudar([item('sku-a','Nome alterado pelo parceiro'),item('sku-b')]);
  const novoPlano=await importador.preparar({ fornecedorId:'franquia-teste' });
  assert.equal(novoPlano.itens.filter(p=>p.situacao==='JA_CADASTRADO').length,2);
  const novo=await importador.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:novoPlano.revisaoLote,confirmacao:MARCADOR_CONFIRMACAO
  });
  assert.deepEqual({criados:novo.criados,ignorados:novo.ignorados},{criados:0,ignorados:2});
  assert.equal(repositorio.buscar(id).nome,'Titulo definido pelo LOOP');
  assert.equal(repositorio.buscar(id).precoCentavos,15990);
  assert.equal(repositorio.buscar(id).estado,'PUBLICADO');
  assert.equal(repositorio.buscarRegistro(id).revisao,2);
  assert.equal(repositorio.historico(id).length,2);
});

test('lote modificado depois da previa exige nova autorizacao', async t => {
  const { importador, repositorio, mudar }=iniciar(t,[item('sku-x')]);
  const plano=await importador.preparar({ fornecedorId:'franquia-teste' });
  mudar([item('sku-x'),item('sku-y')]);
  await assert.rejects(importador.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  }),/Lote mudou/);
  assert.deepEqual(repositorio.listar(),[]);
  const novo=await importador.preparar({ fornecedorId:'franquia-teste' });
  assert.notEqual(novo.revisaoLote,plano.revisaoLote);
  assert.equal((await importador.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:novo.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  })).criados,2);
});

test('itens invalidos e repetidos rejeitam lote inteiro antes de salvar', async t => {
  const { importador, repositorio, mudar }=iniciar(t);
  const ruins=[
    [item('ok'),item('../../config')],
    [item('mesmo'),item('mesmo')],
    [item('ok'),{...item('incompleto'),descricao:''}],
    Array.from({length:MAX_ITENS+1},(_,i)=>item('item-'+i)),
    { itens:[item('ok')] },
    [item('ok'),null]
  ];
  for(const lote of ruins) {
    mudar(lote);
    await assert.rejects(importador.preparar({fornecedorId:'franquia-teste'}));
    await assert.rejects(importador.aplicar({
      fornecedorId:'franquia-teste',
      revisaoLote:'0'.repeat(64),confirmacao:MARCADOR_CONFIRMACAO
    }));
    assert.equal(repositorio.listar().length,0);
  }
});

test('mesma SKU de fornecedores diferentes gera IDs distintos e adaptador pode ser trocado', async t => {
  const { registro, importador, repositorio }=iniciar(t,[item('comum')]);
  registro.registrar({ fornecedorId:'outro-distribuidor',adaptador:adaptador(async()=>[item('comum')]) });
  const a=await importador.preparar({ fornecedorId:'franquia-teste' });
  const b=await importador.preparar({ fornecedorId:'outro-distribuidor' });
  assert.notEqual(a.itens[0].produtoId,b.itens[0].produtoId);
  for (const plano of [a,b]) {
    await importador.aplicar({
      fornecedorId:plano.fornecedorId,revisaoLote:plano.revisaoLote,
      confirmacao:MARCADOR_CONFIRMACAO
    });
  }
  assert.equal(repositorio.listar().length,2);
  registro.substituir({fornecedorId:'franquia-teste',adaptador:adaptador(async()=>[item('novo-sku')])});
  const outro=await importador.preparar({fornecedorId:'franquia-teste'});
  assert.equal(outro.itens[0].situacao,'NOVO_RASCUNHO');
  assert.equal(repositorio.listar().length,2);
});

test('apos reabertura do SQLite a mesma importacao nao repete registros', async t => {
  const { repositorio, caminho, registro, importador }=iniciar(t,[item('sku-a')]);
  const plano=await importador.preparar({ fornecedorId:'franquia-teste' });
  await importador.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  });
  const segundoBanco=new RepositorioCatalogoSQLite({ caminho });
  t.after(()=>segundoBanco.fechar());
  const segundo=new ImportadorCatalogoSimulado({
    registroFornecedores:registro,repositorioCatalogo:segundoBanco
  });
  const repetido=await segundo.aplicar({
    fornecedorId:'franquia-teste',revisaoLote:plano.revisaoLote,
    confirmacao:MARCADOR_CONFIRMACAO
  });
  assert.equal(repetido.criados,0);
  assert.equal(repetido.ignorados,1);
  assert.equal(segundoBanco.listar().length,1);
});

test('adaptador antigo sem listarProdutos continua operando para estoque e status', async t => {
  const { registro, importador }=iniciar(t);
  registro.registrar({fornecedorId:'legado',adaptador:{
    versaoContrato:CONTRATO_FORNECEDOR,
    consultarEstoque:async()=>({quantidade:2}),
    consultarStatus:async()=>({status:'PENDENTE'})
  }});
  assert.equal((await registro.consultarEstoque({fornecedorId:'legado',sku:'abc'})).disponivel,true);
  await assert.rejects(importador.preparar({fornecedorId:'legado'}),/nao oferece listagem/);
});
