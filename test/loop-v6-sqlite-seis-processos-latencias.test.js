'use strict';
// Medicao local e reproduzivel: seis processos disputam um arquivo SQLite WAL.
// Latencias variam por maquina/CI, portanto nao definem SLA de producao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const INSTANTE='2036-09-20T12:00:00.000Z';
const SENHA='senha-segura-de-laboratorio-2026';
const CLIENTES=144;
const ESCRITORES=6;
const N_PEDIDOS=CLIENTES*2;
const n=(b,sql)=>b.prepare(sql).get().n;
const percentile=(valores,percentual)=>{
 const copia=[...valores].sort((a,b)=>a-b);
 return Math.round(copia[Math.ceil(percentual*copia.length)-1]*100)/100;
};
function abrir(arquivo){
 const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const banco=repo.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>INSTANTE});
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,pedidosIdentificados:pedidos,
  atribuicaoManualPorPosicao:true,relogio:()=>INSTANTE,
  consultarPagamentoConfiavel:async id=>{
   const p=pedidos.buscar(id);
   return p&&{...p,status:STATUS_CONFIRMADO,confirmadoEm:INSTANTE};
  }});
 return {repo,banco,contas,pedidos,ponte};
}
if(process.argv[2]==='--worker'){
 const [,,,arquivo]=process.argv;
 try{
  const m=abrir(arquivo);
  process.on('message',async ({pedidos})=>{
   try{
    const latencias=[],inicio=performance.now();
    let criados=0,repetidos=0,busy=0;
    for(const pedidoId of pedidos){
     const inicioOperacao=performance.now();
     try{
      const r=await m.ponte.processar({pedidoId});
      if(r.criado)criados++;
      if(r.repetido)repetidos++;
     }catch(e){
      if(/SQLITE_BUSY|database is locked/i.test(String(e.code||e.message)))busy++;
      throw e;
     }finally{
      latencias.push(performance.now()-inicioOperacao);
     }
    }
    const decorrido=performance.now()-inicio;
    process.send({tipo:'CONCLUIDO',criados,repetidos,busy,latencias,decorrido},()=>{
     m.repo.fechar();process.disconnect();
    });
   }catch(e){
    process.send({tipo:'ERRO',mensagem:e.message,codigo:e.code,stack:e.stack},()=>{
     m.repo.fechar();process.exit(1);
    });
   }
  });
  process.send({tipo:'PRONTO'});
 }catch(e){
  process.send?.({tipo:'ERRO',mensagem:e.message,stack:e.stack},()=>process.exit(1));
 }
}else{
 test('seis processos WAL: metricas p50/p95/p99, duplicatas, zero divergencias e SQLITE_BUSY',
  {timeout:180000},async t=>{
   const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-6writers-wal-'));
   t.after(()=>rmSync(pasta,{recursive:true,force:true}));
   const arquivo=path.join(pasta,'medicoes.sqlite');
   let m=abrir(arquivo);
   const ids=[];
   for(let i=1;i<=CLIENTES;i++){
    const id=String(i).padStart(4,'0');
    const comprador=m.contas.cadastrar({
     nome:'Medicao Concorrente '+id,
     email:'metricas-'+id+'@exemplo.invalid',senha:SENHA
    });
    for(const tipo of ['pdf','fisico']){
     const pedidoId='medicao-'+id+'-'+tipo;
     m.pedidos.preparar({pedidoId,contaId:comprador.contaId,
      produtoId:tipo==='pdf'?'pdf-referencia-250':'produto-fisico-190',
      valorCentavos:tipo==='pdf'?25000:19000});
     ids.push(pedidoId);
    }
   }
   m.repo.fechar();
   const trabalhadores=[];
   t.after(()=>trabalhadores.forEach(w=>{try{w.child.kill('SIGKILL')}catch{}}));
   // Inicializar sequencialmente para isolar contention do experimento
   // da criacao de esquema e da migracao nao relacionada aos pedidos.
   for(let i=0;i<ESCRITORES;i++){
    const child=spawn(process.execPath,[__filename,'--worker',arquivo],{
     stdio:['ignore','pipe','pipe','ipc']
    });
    let stderr='';
    child.stderr.on('data',x=>{stderr+=String(x).slice(0,700)});
    child.stdout.on('data',()=>{});
    const fim=once(child,'exit');
    const [pronto]=await once(child,'message');
    assert.equal(pronto.tipo,'PRONTO',JSON.stringify(pronto)+' '+stderr);
    trabalhadores.push({child,fim,stderr:()=>stderr});
   }
   const respostas=trabalhadores.map(w=>once(w.child,'message'));
   const t0=performance.now();
   trabalhadores.forEach((w,i)=>{
    const offset=(i*37)%ids.length;
    const ordem=ids.slice(offset).concat(ids.slice(0,offset));
    w.child.send({pedidos:i%2?ordem.reverse():ordem});
   });
   const saidas=(await Promise.all(respostas)).map(x=>x[0]);
   const tempoGeralMs=performance.now()-t0;
   for(const [i,x] of saidas.entries()){
    assert.equal(x.tipo,'CONCLUIDO',JSON.stringify(x)+' '+trabalhadores[i].stderr());
    assert.equal(x.latencias.length,N_PEDIDOS);
    assert.equal(x.criados+x.repetidos,N_PEDIDOS);
   }
   const codigos=await Promise.all(trabalhadores.map(w=>w.fim));
   codigos.forEach(([exit,signal],i)=>assert.equal(exit,0,
    'worker '+i+': '+signal+' '+trabalhadores[i].stderr()));
   assert.equal(saidas.reduce((s,r)=>s+r.criados,0),N_PEDIDOS);
   assert.equal(saidas.reduce((s,r)=>s+r.repetidos,0),N_PEDIDOS*(ESCRITORES-1));
   assert.equal(saidas.reduce((s,r)=>s+r.busy,0),0);
   m=abrir(arquivo);
   try{
    assert.equal(n(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'),CLIENTES);
    assert.equal(n(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_vendas_loja_sem_loop_demo'),CLIENTES);
    assert.equal(n(m.banco,'SELECT COUNT(DISTINCT posicao_id) AS n FROM admin_ponte_compras_demo'),CLIENTES);
    assert.equal(n(m.banco,'SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo'),0);
    assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
    assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
    assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
   }finally{m.repo.fechar();}
   const tempos=saidas.flatMap(x=>x.latencias);
   const relatorio={
    escritoresIndependentes:ESCRITORES,clientesFicticios:CLIENTES,
    pedidosUnicos:N_PEDIDOS,tentativas:N_PEDIDOS*ESCRITORES,
    comprasCriadas:N_PEDIDOS,repeticoes:N_PEDIDOS*(ESCRITORES-1),
    posicoesUnicas:CLIENTES,errosSQLITE_BUSY:0,
    latenciaPorTentativaMs:{p50:percentile(tempos,.5),
     p95:percentile(tempos,.95),p99:percentile(tempos,.99),
     max:Math.round(Math.max(...tempos)*100)/100},
    decorridoLoteMs:Math.round(tempoGeralMs),
    taxaBrutaTentativasPorSegundo:
     Math.round(100*(N_PEDIDOS*ESCRITORES)/(tempoGeralMs/1000))/100,
    medicaoCIInfraVariavel:true,slaProducao:false,
    distribuicaoEntreServidores:false,integridade:'ok'
   };
   assert.ok(Number.isFinite(relatorio.latenciaPorTentativaMs.p95));
   assert.ok(relatorio.latenciaPorTentativaMs.p95>=relatorio.latenciaPorTentativaMs.p50);
   console.log('LOOP_LATENCIAS_6_PROCESSOS='+JSON.stringify(relatorio));
  });
}