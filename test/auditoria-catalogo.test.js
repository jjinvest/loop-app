'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { RepositorioCatalogoSQLite } = require('../src/domain/repositorio-catalogo-sqlite');
const { criarAppAdminLaboratorio } = require('../src/laboratorio/servidor-catalogo');

const TOKEN='chave-de-teste-com-privilégio-local-123456789';
function modelo(id='produto-a') {
  return {
    id, nome:'Produto inicial', descricao:'Descricao de exemplo',
    tipo:'FISICO',estado:'RASCUNHO',precoCentavos:null,
    entrega:'FORNECEDOR_INTEGRADO',fotos:[],
    videoApresentacaoUrl:null,detalhes:['Envio pelo parceiro']
  };
}
function caminho(t) {
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-historico-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  return path.join(pasta,'catalogo.sqlite');
}

test('historico acompanha criacao e edicoes em ordem, inclusive rascunho', (t) => {
  const banco=new RepositorioCatalogoSQLite({caminho:caminho(t)});
  t.after(()=>banco.fechar());
  banco.salvar({produto:modelo(),revisaoEsperada:0});
  banco.atualizar({id:'produto-a',revisaoEsperada:1,alteracoes:{
    nome:'Novo nome', precoCentavos:10890
  }});
  banco.atualizar({id:'produto-a',revisaoEsperada:2,alteracoes:{
    estado:'PUBLICADO'
  }});
  const eventos=banco.historico('produto-a');
  assert.deepEqual(eventos.map(x=>x.revisao),[1,2,3]);
  assert.deepEqual(eventos.map(x=>x.tipo),['CRIADO','ATUALIZADO','ATUALIZADO']);
  assert.equal(eventos[0].depois.nome,'Produto inicial');
  assert.deepEqual(eventos[1].campos.sort(),['nome','precoCentavos']);
  assert.equal(eventos[1].antes.nome,'Produto inicial');
  assert.equal(eventos[1].depois.nome,'Novo nome');
  assert.equal(eventos[1].antes.precoCentavos,null);
  assert.equal(eventos[1].depois.precoCentavos,10890);
  assert.deepEqual(eventos[2].campos,['estado']);
  assert.equal(eventos[2].antes.estado,'RASCUNHO');
  assert.equal(eventos[2].depois.estado,'PUBLICADO');
  assert.equal(eventos[2].ocorridoEm.includes('T'),true);
});

test('revisoes concorrentes ou alteracoes invalidas nao deixam eventos fantasmas', (t) => {
  const banco=new RepositorioCatalogoSQLite({caminho:caminho(t)});
  t.after(()=>banco.fechar());
  banco.salvar({produto:modelo(),revisaoEsperada:0});
  assert.throws(()=>banco.atualizar({
    id:'produto-a',revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}
  }),/preco positivo/);
  assert.throws(()=>banco.atualizar({
    id:'produto-a',revisaoEsperada:0,alteracoes:{nome:'Invalido'}
  }),/Conflito de revisao|revisaoEsperada/);
  assert.throws(()=>banco.salvar({produto:modelo(),revisaoEsperada:0}),/Conflito de revisao/);
  assert.deepEqual(banco.historico('produto-a').map(x=>x.revisao),[1]);
  assert.equal(banco.buscarRegistro('produto-a').revisao,1);
});

test('trilha persistida resiste ao reinicio e bloqueia update/delete direto', (t) => {
  const arquivo=caminho(t);
  let repo=new RepositorioCatalogoSQLite({caminho:arquivo});
  repo.salvar({produto:modelo(),revisaoEsperada:0});
  repo.atualizar({id:'produto-a',revisaoEsperada:1,alteracoes:{nome:'Novo nome'}});
  repo.fechar();
  repo=new RepositorioCatalogoSQLite({caminho:arquivo});
  const eventos=repo.historico('produto-a');
  assert.deepEqual(eventos.map(x=>x.revisao),[1,2]);
  assert.equal(eventos[1].depois.nome,'Novo nome');
  repo.fechar();

  const db=new DatabaseSync(arquivo);
  assert.throws(()=>db.prepare('DELETE FROM catalogo_historico WHERE produto_id=?').run('produto-a'),/historico imutavel/);
  assert.throws(()=>db.prepare('UPDATE catalogo_historico SET tipo=? WHERE produto_id=?').run('CRIADO','produto-a'),/historico imutavel/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM catalogo_historico').get().n,2);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  db.close();
});

test('migra arquivo SQLite versao 1 sem inventar eventos historicos', (t) => {
  const arquivo=caminho(t);
  const antiga=new DatabaseSync(arquivo);
  antiga.exec(`CREATE TABLE catalogo_produtos (
    id TEXT PRIMARY KEY NOT NULL,
    revisao INTEGER NOT NULL CHECK (revisao >= 1),
    dados_json TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  ); PRAGMA user_version=1;`);
  antiga.prepare('INSERT INTO catalogo_produtos VALUES (?, ?, ?, ?)').run(
    'produto-antigo',4,JSON.stringify(modelo('produto-antigo')),'2026-10-14T06:00:00.000Z'
  );
  antiga.close();

  const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
  const eventos=repo.historico('produto-antigo');
  assert.equal(eventos.length,1);
  assert.equal(eventos[0].tipo,'IMPORTADO_V1');
  assert.equal(eventos[0].revisao,4);
  assert.deepEqual(eventos[0].campos,[]);
  assert.equal(eventos[0].depois.nome,'Produto inicial');
  repo.atualizar({id:'produto-antigo',revisaoEsperada:4,alteracoes:{nome:'Depois da migracao'}});
  assert.deepEqual(repo.historico('produto-antigo').map(x=>x.revisao),[4,5]);
  repo.fechar();

  const outra=new RepositorioCatalogoSQLite({caminho:arquivo});
  t.after(()=>outra.fechar());
  assert.equal(outra.historico('produto-antigo').length,2);
});

test('historico fica restrito ao admin local e nao aparece no catalogo publico', async(t) => {
  const repo=new RepositorioCatalogoSQLite({caminho:caminho(t)});
  t.after(()=>repo.fechar());
  repo.salvar({produto:modelo(),revisaoEsperada:0});
  const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const base='http://127.0.0.1:'+server.address().port;
  const rota='/api/admin/produtos/produto-a/historico';

  assert.equal((await fetch(base+rota)).status,401);
  assert.equal((await fetch(base+rota,{headers:{Authorization:'Bearer incorreta'}})).status,401);
  const permitido=await fetch(base+rota,{headers:{Authorization:'Bearer '+TOKEN}});
  assert.equal(permitido.status,200);
  assert.match(permitido.headers.get('cache-control'),/no-store/);
  assert.equal((await permitido.json()).eventos.length,1);
  assert.equal((await fetch(base+'/catalogo/produto-a/historico')).status,404);
  assert.equal((await fetch(base+'/catalogo')).status,200);
  assert.equal((await fetch(base+'/api/admin/produtos/nao-existe/historico',{headers:{Authorization:'Bearer '+TOKEN}})).status,404);
});
