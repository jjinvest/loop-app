'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {RecebimentosPSPDemoSQLite,TIPOS}=require('../src/domain/recebimentos-psp-demo-sqlite');
const {COFRES}=require('../src/domain/financeiro-admin-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='psp-simulado-teste-admin-local-1234567890123456789';
const auth={Authorization:'Bearer '+TOKEN};
const quantia=(livro,id)=>livro.caixas.find(c=>c.id===id).saldoProjetadoCentavos;
function montar(nome=':memory:'){
  const banco=new RepositorioCatalogoSQLite({caminho:nome});
  const razao=new RazaoFinanceiroDemoSQLite({banco:banco.banco});
  const recebimentos=new RecebimentosPSPDemoSQLite({banco:banco.banco,razao});
  return {banco,razao,recebimentos};
}
function temporario(t){
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-receb-demo-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  return path.join(pasta,'catalogo.sqlite');
}
async function iniciar(t,banco){
  const app=criarAppAdminLaboratorio({repositorio:banco,segredo:TOKEN});
  const s=app.listen(0,'127.0.0.1');
  await once(s,'listening');
  t.after(()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:'+s.address().port;
}
function post(url,body,headers=auth){
  return fetch(url,{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
}

test('10 pagamentos sao fixtures pendentes e nao originam saldo, fila ou recebimento real',()=>{
  const {banco,razao,recebimentos}=montar();
  try{
    const l=recebimentos.listar();
    assert.equal(l.pagamentos.length,10);
    assert.equal(l.modo,'CONFIRMACOES_TOTALMENTE_FICTICIAS');
    assert.equal(l.pagamentosReais,false);
    assert.equal(l.webhookExternoAtivo,false);
    assert.equal(l.posicoesCriadas,false);
    assert.equal(l.catracaMovimentada,false);
    assert.ok(l.pagamentos.every(p=>p.situacao==='AGUARDANDO_FICTICIO'));
    assert.ok(l.pagamentos.every(p=>p.valorCentavos===60000));
    assert.ok(l.pagamentos.every(p=>p.fornecedorCentavos+p.parcelaLoopCentavos+p.sobraBrutaCentavos===p.valorCentavos));
    assert.equal(razao.consultar().lancamentosRegistrados,0);
  }finally{banco.fechar();}
});

test('confirmacao atomica split registra so LOJA e cofre do LOOP, nunca fornecedor interno',()=>{
  const {banco,razao,recebimentos}=montar();
  try{
    const p=recebimentos.registrarEvento({pagamentoId:'pag-split-01',eventoId:'evt-primeiro',tipo:TIPOS.CONFIRMAR});
    assert.equal(p.repetido,false);
    assert.equal(p.lancamentosRegistrados,2);
    assert.equal(p.situacao,'CONFIRMADO_FICTICIO');
    assert.equal(quantia(razao.consultar(),COFRES.CENTRO),10000);
    assert.equal(quantia(razao.consultar(),COFRES.COMERCIAL),20000);
    assert.equal(quantia(razao.consultar(),COFRES.DISTRIBUIDOR),0);
    const l=razao.consultar();
    assert.equal(l.lotesRegistrados,1);
    assert.equal(l.lancamentosRegistrados,2);
    assert.equal(l.historicoRecente[0].referencia,'pag-split-01');
    assert.equal(recebimentos.registrarEvento({
      pagamentoId:'pag-split-01',eventoId:'evt-primeiro',tipo:TIPOS.CONFIRMAR
    }).repetido,true);
    assert.equal(razao.consultar().lancamentosRegistrados,2);
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-split-01',eventoId:'evt-outro',tipo:TIPOS.CONFIRMAR
    }),e=>e.codigo==='TRANSICAO');
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-split-02',eventoId:'evt-primeiro',tipo:TIPOS.CONFIRMAR
    }),e=>e.codigo==='CONFLITO');
    assert.equal(recebimentos.historico('pag-split-01').length,1);
    assert.equal(recebimentos.listar().pagamentos.find(p=>p.pagamentoId==='pag-split-01').situacao,'CONFIRMADO_FICTICIO');
    assert.equal(banco.listar().length,0);
  }finally{banco.fechar();}
});

test('estorno so apos confirmacao e gera saidas sem apagar entradas ou simular recuperacao do fornecedor',()=>{
  const {banco,razao,recebimentos}=montar();
  try{
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-estorno-cedo',tipo:TIPOS.ESTORNAR
    }),e=>e.codigo==='TRANSICAO');
    assert.equal(razao.consultar().lancamentosRegistrados,0);
    recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-conf-reserva',tipo:TIPOS.CONFIRMAR
    });
    assert.equal(quantia(razao.consultar(),COFRES.ESQUERDA),10000);
    assert.equal(quantia(razao.consultar(),COFRES.COMERCIAL),20000);
    assert.equal(quantia(razao.consultar(),COFRES.DISTRIBUIDOR),30000);
    const estorno=recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-est-reserva',tipo:TIPOS.ESTORNAR
    });
    assert.equal(estorno.lancamentosRegistrados,3);
    const l=razao.consultar();
    assert.equal(l.lancamentosRegistrados,6);
    assert.equal(quantia(l,COFRES.ESQUERDA),0);
    assert.equal(quantia(l,COFRES.COMERCIAL),0);
    assert.equal(quantia(l,COFRES.DISTRIBUIDOR),0);
    assert.equal(l.caixas.find(x=>x.id===COFRES.ESQUERDA).entradasAcumuladasCentavos,10000);
    assert.equal(l.caixas.find(x=>x.id===COFRES.ESQUERDA).saidasAcumuladasCentavos,10000);
    assert.equal(recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-est-reserva',tipo:TIPOS.ESTORNAR
    }).repetido,true);
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-est-outro',tipo:TIPOS.ESTORNAR
    }),e=>e.codigo==='TRANSICAO');
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-reserva-02',eventoId:'evt-conf-outra',tipo:TIPOS.CONFIRMAR
    }),e=>e.codigo==='TRANSICAO');
    assert.equal(recebimentos.listar().pagamentos.find(p=>p.pagamentoId==='pag-reserva-02').situacao,'ESTORNADO_FICTICIO');
    assert.equal(recebimentos.historico('pag-reserva-02').length,2);
    assert.throws(()=>banco.banco.exec('DELETE FROM admin_receb_demo_eventos'),/imutaveis/);
    assert.throws(()=>banco.banco.exec("UPDATE admin_receb_demo_eventos SET tipo='OUTRO'"),/imutaveis/);
    assert.equal(razao.consultar().lancamentosRegistrados,6);
  }finally{banco.fechar();}
});

test('IDs e ordem de destino seguem tabuleiro; outras vendas nao sao processadas',()=>{
  const {banco,razao,recebimentos}=montar();
  try{
    for(let i=1;i<=5;i++){
      const id='pag-split-'+String(i).padStart(2,'0');
      recebimentos.registrarEvento({pagamentoId:id,eventoId:'confirmar-ciclo-'+i,tipo:TIPOS.CONFIRMAR});
    }
    const l=razao.consultar();
    assert.equal(l.lancamentosRegistrados,10);
    assert.equal(quantia(l,COFRES.CENTRO),30000);
    assert.equal(quantia(l,COFRES.ESQUERDA),10000);
    assert.equal(quantia(l,COFRES.DIREITA),10000);
    assert.equal(quantia(l,COFRES.COMERCIAL),100000);
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pagamento-inventado',eventoId:'evt-qualquer',tipo:TIPOS.CONFIRMAR
    }),e=>e.codigo==='NAO_ENCONTRADO');
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-split-01',eventoId:'evento-mau',tipo:'PAGUE_AGORA'
    }),e=>e.codigo==='VALIDACAO');
    assert.equal(l.pagamentosReais,false);
  }finally{banco.fechar();}
});

test('falha no livro causa rollback simultaneo dos eventos de PSP e dos lancamentos',()=>{
  const {banco,razao,recebimentos}=montar();
  try{
    // Colisao proposital de ID de lote: o recebimento deve falhar inteiro.
    razao.registrarLote({loteId:'receb-evt-bloqueado',eventos:[{
      eventoId:'evento-manual-preexistente',
      tipo:'AJUSTE_FICTICIO',
      referencia:'simulacao',descricao:'registro de teste anterior',
      lancamentos:[{cofreId:COFRES.DIREITA,natureza:'ENTRADA',valorCentavos:100}]
    }]});
    assert.throws(()=>recebimentos.registrarEvento({
      pagamentoId:'pag-split-04',eventoId:'evt-bloqueado',tipo:TIPOS.CONFIRMAR
    }),e=>e.codigo==='CONFLITO_IDEMPOTENCIA');
    assert.equal(razao.consultar().lancamentosRegistrados,1);
    assert.equal(recebimentos.historico('pag-split-04').length,0);
    assert.equal(recebimentos.listar().pagamentos.find(p=>p.pagamentoId==='pag-split-04').situacao,'AGUARDANDO_FICTICIO');
    assert.equal(recebimentos.registrarEvento({
      pagamentoId:'pag-split-04',eventoId:'evt-libero',tipo:TIPOS.CONFIRMAR
    }).repetido,false);
    assert.equal(razao.consultar().lancamentosRegistrados,3);
  }finally{banco.fechar();}
});

test('confirmacoes e estornos ficticios persistem apos reabrir SQLite',()=>{
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-receb-reabrir-'));
  const arquivo=path.join(pasta,'teste.sqlite');
  try{
    const um=montar(arquivo);
    try{
      um.recebimentos.registrarEvento({pagamentoId:'pag-split-05',eventoId:'evento-persistido',tipo:TIPOS.CONFIRMAR});
    }finally{um.banco.fechar();}
    const dois=montar(arquivo);
    try{
      assert.equal(dois.recebimentos.listar().pagamentos.length,10);
      assert.equal(dois.recebimentos.listar().pagamentos.find(p=>p.pagamentoId==='pag-split-05').situacao,'CONFIRMADO_FICTICIO');
      assert.equal(dois.razao.consultar().lancamentosRegistrados,2);
      dois.recebimentos.registrarEvento({pagamentoId:'pag-split-05',eventoId:'estorno-persistido',tipo:TIPOS.ESTORNAR});
      assert.equal(dois.razao.consultar().lancamentosRegistrados,4);
      assert.equal(quantia(dois.razao.consultar(),COFRES.CENTRO),0);
    }finally{dois.banco.fechar();}
  }finally{fs.rmSync(pasta,{recursive:true,force:true});}
});

test('rotas de confirmacao ficticia exigem chave e nao ficam no app publico',async t=>{
  const arquivo=temporario(t);
  const db=new RepositorioCatalogoSQLite({caminho:arquivo});
  t.after(()=>db.fechar());
  const base=await iniciar(t,db);
  const uri=base+'/api/admin/recebimentos-psp-demo';
  assert.equal((await fetch(uri)).status,401);
  assert.equal((await fetch(uri,{headers:{...auth,Origin:'https://externo.invalid'}})).status,403);
  assert.equal((await post(uri+'/pag-split-01/eventos',{eventoId:'evt-a',tipo:TIPOS.CONFIRMAR},{})).status,401);
  const listado=await fetch(uri,{headers:auth});
  assert.equal(listado.status,200);
  assert.equal(listado.headers.get('cache-control'),'no-store');
  assert.equal((await listado.json()).pagamentos.length,10);
  assert.equal((await post(uri+'/pag-split-01/eventos',{eventoId:'evt-a',tipo:TIPOS.CONFIRMAR,dinheiro:5000})).status,400);
  assert.equal((await post(uri+'/pag-split-01/eventos',{eventoId:'evento-api-01',tipo:TIPOS.ESTORNAR})).status,409);
  const confirmado=await post(uri+'/pag-split-01/eventos',{eventoId:'evento-api-01',tipo:TIPOS.CONFIRMAR});
  assert.equal(confirmado.status,200);
  assert.equal((await confirmado.json()).resultado.repetido,false);
  assert.equal((await post(uri+'/pag-split-01/eventos',{eventoId:'evento-api-01',tipo:TIPOS.CONFIRMAR})).status,200);
  assert.equal((await post(uri+'/pag-split-02/eventos',{eventoId:'evento-api-01',tipo:TIPOS.CONFIRMAR})).status,409);
  const hist=await (await fetch(uri+'/pag-split-01/historico',{headers:auth})).json();
  assert.equal(hist.eventos.length,1);
  assert.equal((await post(uri+'/pag-inventado/eventos',{eventoId:'evt-new',tipo:TIPOS.CONFIRMAR})).status,404);
  assert.equal((await fetch(base+'/api/admin/livro-financeiro-demo',{headers:auth})).status,200);
  const pagina=await (await fetch(base+'/admin/financeiro-demo')).text();
  assert.match(pagina,/id="formEventoPSPDemo"/);
  assert.match(pagina,/Nenhuma cobrança/);
  const script=await (await fetch(base+'/admin/financeiro-demo.js')).text();
  assert.match(script,/carregarRecebimentos/);
  assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
  const publicApp=require('../src/server');
  const server=publicApp.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const pub='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(pub+'/api/admin/recebimentos-psp-demo')).status,404);
  assert.equal((await post(pub+'/api/admin/recebimentos-psp-demo/pag-split-01/eventos',{eventoId:'teste-x',tipo:TIPOS.CONFIRMAR})).status,404);
});
