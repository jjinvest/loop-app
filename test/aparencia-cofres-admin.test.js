'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {RepositorioAparenciaCofresSQLite,DEFINICOES}=
  require('../src/domain/repositorio-aparencia-cofres-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {COFRES}=require('../src/domain/financeiro-admin-demo');
const TOKEN='teste-configuracao-cofres-administrativos-0123456789';

function temporario(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-cofres-visual-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return path.join(dir,'catalogo.sqlite');
}
async function servidorLocal(t,banco){
  const app=criarAppAdminLaboratorio({repositorio:banco,segredo:TOKEN});
  const servidor=app.listen(0,'127.0.0.1');
  await once(servidor,'listening');
  t.after(()=>new Promise((resolve,reject)=>servidor.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:'+servidor.address().port;
}
async function pedir(url,opcoes={}){
  return fetch(url,{
    cache:'no-store',
    ...opcoes
  });
}
const autenticar={Authorization:'Bearer '+TOKEN};

test('cinco cofres recebem configuracoes visuais sem alterar estrutura ou transacoes',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const repo=new RepositorioAparenciaCofresSQLite({banco:db.banco});
    const list=repo.listar();
    assert.equal(list.length,5);
    assert.equal(DEFINICOES.length,5);
    assert.deepEqual(list.map(x=>x.id),[
      COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.COMERCIAL,COFRES.DISTRIBUIDOR
    ]);
    assert.ok(list.every(x=>x.revisao===0 && x.integracaoBancaria==='NAO_CONFIGURADA'));
    const editado=repo.salvar({
      id:COFRES.CENTRO,nome:'Cofre dos Participantes',cor:'#aabbcc',revisaoEsperada:0
    });
    assert.equal(editado.nome,'Cofre dos Participantes');
    assert.equal(editado.cor,'#AABBCC');
    assert.equal(editado.revisao,1);
    assert.equal(editado.posicao,'CENTRO');
    assert.equal(editado.finalidade,'PARTICIPANTES');
    assert.equal(repo.buscar(COFRES.ESQUERDA).revisao,0);
    assert.equal(repo.historico(COFRES.CENTRO).length,1);
    assert.equal(repo.salvar({id:COFRES.CENTRO,nome:'Cofre dos Participantes',cor:'#AABBCC',revisaoEsperada:1}).revisao,1);
    assert.equal(repo.historico(COFRES.CENTRO).length,1);
  }finally{db.fechar();}
});

test('alteracao visual e transacional com historico imutavel e controle de versao',()=>{
  const db=new RepositorioCatalogoSQLite({caminho:':memory:'});
  try{
    const r=new RepositorioAparenciaCofresSQLite({banco:db.banco});
    const args={id:COFRES.COMERCIAL,nome:'Meu ganho bruto',cor:'#001122',revisaoEsperada:0};
    assert.equal(r.salvar(args).revisao,1);
    assert.throws(()=>r.salvar({...args,nome:'Outro',revisaoEsperada:0}),/Conflito/);
    assert.equal(r.buscar(COFRES.COMERCIAL).nome,'Meu ganho bruto');
    assert.equal(r.salvar({...args,nome:'Meu caixa loja',revisaoEsperada:1}).revisao,2);
    const hist=r.historico(COFRES.COMERCIAL);
    assert.equal(hist.length,2);
    assert.equal(hist[0].antesNome,'Sobra bruta comercial');
    assert.equal(hist[1].depoisNome,'Meu caixa loja');
    assert.throws(()=>db.banco.exec('DELETE FROM admin_cofres_aparencia_historico'),/historico/);
    assert.throws(()=>db.banco.exec("UPDATE admin_cofres_aparencia_historico SET antes_nome='apagado'"),/historico/);
    assert.equal(r.historico(COFRES.COMERCIAL).length,2);
    assert.throws(()=>r.salvar({...args,cor:'red',revisaoEsperada:2}),/Cor/);
    assert.throws(()=>r.salvar({...args,nome:'<script>',revisaoEsperada:2}),/Nome/);
    assert.throws(()=>r.salvar({...args,nome:'',revisaoEsperada:2}),/Nome/);
    assert.throws(()=>r.salvar({...args,id:'COFRE_INVENTADO',revisaoEsperada:2}),/desconhecido/);
    assert.throws(()=>r.salvar({...args,revisaoEsperada:1.5}),/Revisao/);
    assert.equal(r.buscar(COFRES.COMERCIAL).revisao,2);
    assert.equal(db.banco.prepare('PRAGMA user_version').get().user_version,3);
  }finally{db.fechar();}
});

test('nome/cor sobrevivem ao reinicio da base local e nao mexem no catalogo',()=>{
  const arquivo=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'loop-cofre-restart-')),'catalogo.sqlite');
  try{
    let db=new RepositorioCatalogoSQLite({caminho:arquivo});
    try{
      const cfg=new RepositorioAparenciaCofresSQLite({banco:db.banco});
      cfg.salvar({id:COFRES.DIREITA,nome:'Reserva do projeto',cor:'#112233',revisaoEsperada:0});
      assert.equal(db.listar().length,0);
    }finally{db.fechar();}
    db=new RepositorioCatalogoSQLite({caminho:arquivo});
    try{
      const cfg=new RepositorioAparenciaCofresSQLite({banco:db.banco});
      assert.equal(cfg.buscar(COFRES.DIREITA).nome,'Reserva do projeto');
      assert.equal(cfg.buscar(COFRES.DIREITA).cor,'#112233');
      assert.equal(cfg.buscar(COFRES.DIREITA).revisao,1);
      assert.equal(cfg.historico(COFRES.DIREITA).length,1);
      assert.equal(db.listar().length,0);
    }finally{db.fechar();}
  }finally{fs.rmSync(path.dirname(arquivo),{recursive:true,force:true});}
});

test('rotas exclusivas do administrador alteram so aparencia, preservando valores calculados',async t=>{
  const caminho=temporario(t);
  const db=new RepositorioCatalogoSQLite({caminho});
  t.after(()=>db.fechar());
  const base=await servidorLocal(t,db);
  const config='/api/admin/cofres-demo/configuracoes';
  const edit='/api/admin/cofres-demo/LOOP_ESQUERDA';
  const finan='/api/admin/financeiro-demo?modo=split';
  assert.equal((await pedir(base+config)).status,401);
  assert.equal((await pedir(base+edit,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await pedir(base+config,{headers:{...autenticar,Origin:'https://site-externo.invalid'}})).status,403);
  const list=await (await pedir(base+config,{headers:autenticar})).json();
  assert.equal(list.cofres.length,5);
  assert.equal(list.cofres[0].revisao,0);
  const inicial=await (await pedir(base+finan,{headers:autenticar})).json();
  const patch=async(v)=>pedir(base+edit,{method:'PATCH',headers:{...autenticar,'Content-Type':'application/json'},body:JSON.stringify(v)});
  assert.equal((await patch({nome:'Teste',cor:'#abcdef',revisaoEsperada:0,valorCentavos:99999})).status,400);
  assert.equal((await patch({nome:'',cor:'#abcdef',revisaoEsperada:0})).status,400);
  assert.equal((await patch({nome:'Investimentos reais',cor:'#ABCDEF',revisaoEsperada:0})).status,200);
  assert.equal((await patch({nome:'Outra mudanca',cor:'#ABCDEF',revisaoEsperada:0})).status,409);
  const segundo=await (await pedir(base+finan,{headers:autenticar})).json();
  const cofre=segundo.caixas.find(c=>c.id===COFRES.ESQUERDA);
  assert.equal(cofre.nomeExibicao,'Investimentos reais');
  assert.equal(cofre.corExibicao,'#ABCDEF');
  assert.equal(cofre.revisaoAparencia,1);
  assert.equal(cofre.entradasAcumuladasCentavos,10000);
  assert.equal(segundo.totalVendasCentavos,inicial.totalVendasCentavos);
  assert.deepEqual(segundo.historico,inicial.historico);
  const historico=await (await pedir(base+edit+'/historico',{headers:autenticar})).json();
  assert.equal(historico.eventos.length,1);
  assert.equal((await pedir(base+'/api/admin/cofres-demo/INVENTADO/historico',{headers:autenticar})).status,404);
  assert.equal((await patch({nome:'Alteracao',cor:'#FF00FF',revisaoEsperada:1})).status,200);
  const repetida=await (await pedir(base+config,{headers:autenticar})).json();
  assert.equal(repetida.cofres[0].revisao,2);
  assert.equal(db.listar().length,0);
});

test('configuracoes nao aparecem em rotas publicas e UI usa DOM seguro',async t=>{
  const caminho=temporario(t);
  const db=new RepositorioCatalogoSQLite({caminho});
  t.after(()=>db.fechar());
  const base=await servidorLocal(t,db);
  const pagina=await (await pedir(base+'/admin/financeiro-demo')).text();
  assert.match(pagina,/id="formAparenciaCofreDemo"/);
  assert.match(pagina,/id="nomeCofreFinanceiroDemo"/);
  assert.match(pagina,/id="corCofreFinanceiroDemo"/);
  assert.match(pagina,/id="historicoAparenciaCofreDemo"/);
  const script=await (await pedir(base+'/admin/financeiro-demo.js')).text();
  assert.match(script,/textContent/);
  assert.match(script,/replaceChildren/);
  assert.match(script,/revisaoEsperada/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|innerHTML/);
  const appPublico=require('../src/server');
  const srv=appPublico.listen(0,'127.0.0.1');
  await once(srv,'listening');
  t.after(()=>new Promise(resolve=>srv.close(resolve)));
  const url='http://127.0.0.1:'+srv.address().port;
  assert.equal((await pedir(url+'/api/admin/cofres-demo/configuracoes')).status,404);
  assert.equal((await pedir(url+'/api/admin/cofres-demo/LOOP_ESQUERDA')).status,404);
  assert.equal((await pedir(url+'/admin/financeiro-demo')).status,404);
});
