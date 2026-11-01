'use strict';
// Ensaio sequencial reproduzivel: HTTP local real, SQLite em arquivo,
// Asaas SIMULADO. Nao le secrets, nao chama a internet, nao move dinheiro.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {abrirLaboratorio}=require('./lib/laboratorio-http-asaas');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {auditarSeisPedidosDoCicloLab}=require('../src/domain/auditoria-seis-pedidos-ciclo-lab');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
function cpfFixture(n){
 let s=String(700000000+n).padStart(9,'0');
 for(const tamanho of [9,10]){
  const soma=[...s].reduce((a,x,i)=>a+Number(x)*(tamanho+1-i),0);
  s+=String((soma*10%11)%10);
 }return s;
}
async function executar({total=10000,pasta=path.resolve('artifacts/ensaio-10000-http'),retomar=false}={}){
 assert.ok(Number.isSafeInteger(total)&&total>=12&&total<=10000);
 fs.mkdirSync(pasta,{recursive:true});
 const arquivo=path.join(pasta,'laboratorio.sqlite');
 assert.ok(!fs.existsSync(arquivo)||retomar,'Use uma pasta nova ou --retomar');
 let m=await abrirLaboratorio(arquivo),controle,circuito;
 const inicio=performance.now(),latencias=[];
 const progresso=path.join(pasta,'progresso.json');
 const checkpoints=retomar&&fs.existsSync(progresso)?JSON.parse(fs.readFileSync(progresso,'utf8')):[];
 const senha='senha-ficticia-ensaio-sequencial-2026';
 let giros=m.ponte._restaurar().giros,indicacoes=0,anterior=null,amostra=null;
 const agora=()=>new Date(Date.UTC(2036,8,20+Math.floor(giros/300),12)).toISOString();
 const montarCircuito=()=>{
  controle=new CircuitBreakV6DemoSQLite({banco:m.banco,agora});
  circuito=new CircuitBreakPonteV6DemoSQLite({banco:m.banco,ponte:m.ponte,controle,agora});
 };
 montarCircuito();
 if(!retomar){
  circuito.preLancamento.habilitar({valorFixoLoopCentavos:25000});
  controle.executar({tipo:'LIMITE_DIARIO',valor:300,comandoId:'cb-carga-limite-001',revisaoEsperada:controle.resumo().revisao});
  controle.executar({tipo:'ABRIR',comandoId:'cb-carga-abrir-001',revisaoEsperada:controle.resumo().revisao});
 }
 let iniciou=retomar;
 const contasExistentes=m.banco.prepare('SELECT COUNT(*) n FROM admin_contas_participantes_demo').get().n;
 const primeiro=retomar?Math.max(1,contasExistentes):1;
 const inicioCivil=m.banco.prepare('SELECT MIN(criado_em) data FROM admin_contas_participantes_demo').get().data;
 const tempoAnterior=retomar&&inicioCivil?Math.max(0,Date.now()-Date.parse(inicioCivil)):0;
 const contaNumero=n=>{
  const r=m.banco.prepare('SELECT id FROM admin_contas_participantes_demo WHERE nome=?').get('Cliente Sequencial '+n);
  if(!r)return null;
  const p=m.banco.prepare('SELECT posicao_id id FROM admin_ponte_compras_demo WHERE conta_id=?').get(r.id);
  return {...m.contas.buscar(r.id),posicaoId:p?.id};
 };
 if(primeiro>1)anterior=contaNumero(primeiro-1);
 if(retomar)indicacoes=m.banco.prepare('SELECT COUNT(*) n FROM admin_loop_vinculos_indicacao_posicao_demo').get().n;
 try{
  for(let i=primeiro;i<=total;i++){
   const t0=performance.now();
   const indicador=i%10===0?anterior:null;
   const conta=contaNumero(i)||m.contas.cadastrar({nome:'Cliente Sequencial '+i,
    email:'sequencial-'+i+'@example.invalid',senha,
    ...(indicador?{codigoIndicador:indicador.codigoConvite}:{})});
   const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha}});
   const existente=m.banco.prepare('SELECT pedido_id id FROM admin_carrinho_loop_demo WHERE conta_id=?').get(conta.contaId);
   let pedidoId=existente?.id;
   if(!pedidoId){
    const {data}=await m.http('/loja/pedidos',{cookie,status:201,
     body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}});
    pedidoId=data.pedido.pedidoId;assert.equal(data.pedido.posicaoCriada,false);
   }
   const amostrar=i===primeiro||i%500===0||i===total;
   m.confirmar(pedidoId);
   const resultado=await m.integracao.conciliador.processar(pedidoId);
   assert.equal(m.banco.prepare('SELECT posicao_id id FROM admin_ponte_compras_demo WHERE pedido_id=?').get(pedidoId).id,resultado.posicaoId);
   if(amostrar){
    const visao=(await m.http('/minha-conta',{cookie})).data;
    assert.equal(visao.posicoes.length,1);
    assert.equal(visao.posicoes[0].posicaoId,resultado.posicaoId);
   }
   if(!m.banco.prepare('SELECT 1 FROM admin_loop_adesoes_posicoes_demo WHERE posicao_id=?').get(resultado.posicaoId))
    await m.http('/ativar-posicoes',{cookie,body:{posicaoId:resultado.posicaoId,
     cpfFicticio:cpfFixture(i),aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}});
   if(indicador){
    const link=m.ponte.atribuirIndicacao({contaId:indicador.contaId,
     convidadoId:conta.contaId,posicaoId:indicador.posicaoId});if(!link.repetida)indicacoes++;
   }
   anterior={...conta,posicaoId:resultado.posicaoId};
   circuito.preLancamento.registrarAporteFicticio({aporteId:'aporte-http-'+i,
    pedidoId,valorLoopCentavos:25000});
   if(i>=12&&!iniciou){circuito.preLancamento.iniciar();iniciou=true;}
   // Dez giros por bloco de sessenta compras, seis pedidos distintos por giro.
   if(i%60===0&&giros<i/6){
    const r=circuito.liberar({quantidade:10,comandoId:'cb-http-lote-'+i,
     revisaoEsperada:controle.resumo().revisao});
    assert.equal(r.girosLiberados.length,10);giros+=10;
   }
   if(i%500===0||i===total){
    const replays=await Promise.all([m.integracao.conciliador.processar(pedidoId),
     m.integracao.conciliador.processar(pedidoId)]);
    assert.ok(replays.every(r=>r.repetida&&r.posicaoId===resultado.posicaoId));
    const n=m.banco.prepare('SELECT COUNT(*) n,COUNT(DISTINCT posicao_id) unicas FROM admin_ponte_compras_demo').get();
    assert.equal(n.n,i);assert.equal(n.unicas,i);
    checkpoints.push({clientes:i,giros,segundos:Number(((tempoAnterior+performance.now()-inicio)/1000).toFixed(2))});
    fs.writeFileSync(path.join(pasta,'progresso.json'),JSON.stringify(checkpoints,null,2));
    console.log(JSON.stringify(checkpoints.at(-1)));
   }
   await m.http('/sair',{cookie,body:{}});
   if(i===Math.floor(total/2)){
    amostra={pedidoId,contaId:conta.contaId,posicaoId:resultado.posicaoId};
    await m.fechar();m=await abrirLaboratorio(arquivo);montarCircuito();
    const r=await m.integracao.conciliador.processar(pedidoId);
    assert.equal(r.repetida,true);assert.equal(r.posicaoId,amostra.posicaoId);
   }
   latencias.push(performance.now()-t0);
  }
  // Consome os ultimos blocos completos sem inventar compras.
  let restantes=Math.floor(total/6)-giros;
  while(restantes>0){
   const quantidade=restantes>=10?10:restantes>=5?5:restantes>=3?3:1;
   if(giros%300+quantidade>300){throw Error('Bloco excede dia ficticio');}
   circuito.liberar({quantidade,comandoId:'cb-http-final-'+giros,
    revisaoEsperada:controle.resumo().revisao});giros+=quantidade;restantes-=quantidade;
  }
  const rastreio=auditarSeisPedidosDoCicloLab({banco:m.banco,ponte:m.ponte});
  assert.deepEqual(rastreio.alertas,[]);assert.equal(rastreio.eventosDocumentados,giros*6);
  assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
  const cofres=circuito.conciliacao.conferir();assert.equal(cofres.quantidadeDivergencias,0);
  assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
  assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
  const motor=m.ponte._restaurar();
  const ativos=motor.filas.filaA.length+motor.filas.filaB.length+
   [motor.tabuleiro.centro,...motor.tabuleiro.vagas].filter(Boolean).length;
  assert.equal(ativos+motor.tabuleiro.ciclosConcluidos.length,total);
  const psp=m.banco.prepare('SELECT COUNT(*) n,SUM(valor)*100 bruto FROM lab_psp_http_fixture').get();
  assert.equal(psp.n,total);assert.equal(psp.bruto,total*25000);
  latencias.sort((a,b)=>a-b);
  const percentil=p=>Number(latencias[Math.min(latencias.length-1,Math.floor(latencias.length*p))].toFixed(2));
  const relatorio={estado:'APROVADO_NO_LABORATORIO',clientesSequenciais:total,
   transporteHttpLocalReal:true,transporteAsaas:'SIMULADO_SEM_API_REMOTA',
   pedidos:psp.n,posicoes:total,ativacoesIndividuais:total,indicacoes,
   giros,eventosDocumentados:rastreio.eventosDocumentados,pedidosNaoConsumidos:total-giros*6,
   filaA:motor.filas.filaA.length,filaB:motor.filas.filaB.length,posicoesAtivas:ativos,
   faturamentoBrutoFicticioCentavos:psp.bruto,
   conciliacaoCofres:cofres,persistenciaReaberta:true,replaysConcorrentesSemDuplicacao:true,
   tempoSegundos:Number(((tempoAnterior+performance.now()-inicio)/1000).toFixed(2)),
   latenciaJornadaMs:{escopo:retomar?'SEGMENTO_APOS_RETOMADA':'ENSAIO_COMPLETO',
    p50:percentil(.5),p95:percentil(.95),p99:percentil(.99)},
   consultasCompletasEscritorio:'AMOSTRAS_500_CLIENTES_E_REINICIO',
   comprasEAtivacoesHttpPorCliente:true,retomadaDeProcesso:retomar,
   checkpoints,clientesSimultaneos:1,pagamentosReais:0,saquesReais:0,
   lucroLiquidoCalculado:false,producaoHomologada:false};
  fs.writeFileSync(path.join(pasta,'relatorio.json'),JSON.stringify(relatorio,null,2));
  console.log('RELATORIO_HTTP_SQLITE='+JSON.stringify(relatorio));
  return relatorio;
 }finally{await m.fechar();}
}
if(require.main===module)executar({total:Number(process.argv[2]||10000),
 ...(process.argv[3]?{pasta:path.resolve(process.argv[3])}:{}),retomar:process.argv.includes('--retomar')})
 .catch(e=>{console.error(e);process.exitCode=1;});
module.exports={executar};
