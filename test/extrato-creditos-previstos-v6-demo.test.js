'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {extratoCentrosPrevistosV6}=require('../src/domain/extrato-creditos-previstos-v6-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const SENHA='senha-laboratorio-creditos-v6-muito-segura';
test('credito V6: seis vendas confirmadas, titular proprio, tres parcelas nao sacaveis e sessao privada',async t=>{
  const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
  t.after(()=>repo.fechar());
  const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
  const comprovantes=new Map();
  const ponte=new PonteComprasConvitesDemoSQLite({
    banco:repo.banco,contas,consultarPagamentoConfiavel:async id=>comprovantes.get(id)
  });
  const compradores=[];
  for(let i=1;i<=8;i++){
    const conta=contas.cadastrar({nome:'Comprador Ficticio '+i,
      email:'comprador-v6-'+i+'@exemplo.invalid',senha:SENHA});
    compradores.push(conta);
    const pedidoId='pdf-v6-'+i;
    comprovantes.set(pedidoId,{pedidoId,contaId:conta.contaId,
      produtoId:'pdf-ficticio',valorCentavos:25000,
      status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-16T12:00:00.000Z'});
    const resultado=await ponte.processar({pedidoId});
    assert.equal(resultado.posicaoCriada,true);
  }
  const quem=compradores[0];
  new AdesoesPosicoesDemoSQLite({ponte}).ativar({
    contaId:quem.contaId,cpfFicticio:'11144477735',
    aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
  });
  assert.equal(extratoCentrosPrevistosV6({ponte,contas,contaId:quem.contaId})
    .creditoPrevistoCentavos,0);
  ponte.prepararTabuleiroDemo();
  const sim=ponte._restaurar();
  assert.equal(sim.tabuleiro.centro.participanteId,quem.contaId);
  for(let i=1;i<=6;i++){
    const v=sim.registrarVendaNoCicloSimulada({vendaId:'compra-demo-pdf-v6-'+i});
    assert.equal(v.repetida,false);
  }
  assert.equal(sim.tentarGiro().motivo,'CATRACA_PAUSADA');
  sim.abrirCatraca();
  assert.equal(sim.tentarGiro().girou,true);
  // Apenas teste interno, sem POST/endpoint que aceite vendas do navegador.
  const save=snapshot=>repo.banco.prepare(
    'UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1'
  ).run(JSON.stringify(snapshot));
  save(sim.exportarSnapshot());
  const a=extratoCentrosPrevistosV6({ponte,contas,contaId:quem.contaId});
  assert.equal(a.creditoPrevistoCentavos,75000);
  assert.equal(a.quantidadeCiclos,1);
  assert.deepEqual(a.historico[0].parcelas.map(x=>x.ordem),[1,3,5]);
  assert.equal(a.historico[0].posicaoCentroId,1);
  assert.equal(a.disponivelParaSaqueCentavos,0);
  assert.equal(a.liquidadoCentavos,0);
  assert.equal(a.naoAutorizaSaque,true);
  assert.equal(extratoCentrosPrevistosV6({ponte,contas,contaId:quem.contaId})
    .creditoPrevistoCentavos,75000);
  assert.equal(extratoCentrosPrevistosV6({ponte,contas,contaId:compradores[1].contaId})
    .creditoPrevistoCentavos,0);
  const app=criarAppAdminLaboratorio({
    repositorio:repo,segredo:'segredo-laboratorio-credito-v6-2026-12345'
  });
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const url=base+'/api/laboratorio/participante';
  const entrar=async conta=>{
    const res=await fetch(url+'/entrar',{method:'POST',
      headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
      body:JSON.stringify({nome:conta.nome,senha:SENHA})});
    assert.equal(res.status,200);
    return res.headers.get('set-cookie').split(';')[0];
  };
  assert.equal((await fetch(url+'/minha-conta')).status,401);
  const cookieA=await entrar(quem);
  const cookieB=await entrar(compradores[1]);
  const ver=async cookie=>fetch(url+'/minha-conta',{headers:{Cookie:cookie}});
  const meu=(await (await ver(cookieA)).json()).creditosPrevistosV6;
  const outro=(await (await ver(cookieB)).json()).creditosPrevistosV6;
  assert.equal(meu.creditoPrevistoCentavos,75000);
  assert.equal(outro.creditoPrevistoCentavos,0);
  assert.equal(JSON.stringify(meu).includes(compradores[1].contaId),false);
  const arquivo=await fetch(base+'/escritorio-vilela');
  assert.equal(arquivo.status,200);
  assert.match(await arquivo.text(),/Meu extrato de contempla/);
  // Nenhum valor de participacao se converteu em saque habilitado.
  const saques=await fetch(url+'/saques-simulados',{headers:{Cookie:cookieA}});
  assert.equal((await saques.json()).pagamentosReais,false);
  const tentativa=await fetch(url+'/saques-simulados',{
    method:'POST',headers:{Cookie:cookieA,'Content-Type':'application/json',
      'X-LOOP-LAB':'participante'},
    body:JSON.stringify({
      solicitacaoId:'saque-11111111-2222-4333-8444-555555555555',
      tipo:'PARTICIPACAO_LUCRO',valorSolicitadoCentavos:75000
    })
  });
  assert.equal(tentativa.status,409);
  const anterior=sim.exportarSnapshot();
  const modificado=structuredClone(anterior);
  // Um evento que nao existe em compras confirmadas deve invalidar o extrato.
  modificado.tabuleiro.ciclosConcluidos[0].vendas[0].vendaId='compra-demo-pedido-inexistente';
  modificado.tabuleiro.vendasProcessadas[0]='compra-demo-pedido-inexistente';
  save(modificado);
  assert.throws(()=>extratoCentrosPrevistosV6({ponte,contas,contaId:quem.contaId}),
    /evento sem compra verificada/);
  save(anterior);
  assert.equal(extratoCentrosPrevistosV6({ponte,contas,contaId:quem.contaId})
    .creditoPrevistoCentavos,75000);
});
