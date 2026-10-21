'use strict';
// Laboratorio isolado: processos Node independentes disputam um unico arquivo WAL.
// Nenhum PSP, Pix, CPF real, saldo bancario ou publicacao em producao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const AGORA='2036-09-20T12:00:00.000Z';
const SEGREDO='senha-segura-de-laboratorio-2026';
const ID_COMPARTILHADO='saque-11111111-2222-4333-8444-555555555555';
const sqlN=(db,sql,...v)=>db.prepare(sql).get(...v).n;
function abrir(caminho){
 const repositorio=new RepositorioCatalogoSQLite({caminho});
 const banco=repositorio.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>AGORA});
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:pedidos,atribuicaoManualPorPosicao:true,
  relogio:()=>AGORA,
  consultarPagamentoConfiavel:async id=>{
   const p=pedidos.buscar(id);
   return p&&{...p,status:STATUS_CONFIRMADO,confirmadoEm:AGORA};
  }
 });
 return {repositorio,banco,contas,pedidos,ponte,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>AGORA}),
  saques:new SolicitacoesSaqueDemoSQLite({banco,contas,links:ponte.linksComissoes,relogio:()=>AGORA})};
}
function pedido(m,conta,id,pdf){
 m.pedidos.preparar({pedidoId:id,contaId:conta.contaId,
  produtoId:pdf?'pdf-referencia-250':'produto-fisico-190',
  valorCentavos:pdf?25000:19000});
}
function cpfArtificial(base){
 const a=[...base].map(Number);
 const digito=limite=>{
  const n=a.slice(0,limite).reduce((s,d,i)=>s+d*(limite+1-i),0);
  return n%11<2?0:11-n%11;
 };
 a.push(digito(9));a.push(digito(10));
 return a.join('');
}
function contar(m){
 const b=m.banco;
 return {
  pdf:sqlN(b,'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'),
  fisicos:sqlN(b,'SELECT COUNT(*) AS n FROM admin_ponte_vendas_loja_sem_loop_demo'),
  posicoes:sqlN(b,'SELECT COUNT(DISTINCT posicao_id) AS n FROM admin_ponte_compras_demo'),
  bonus:sqlN(b,'SELECT COALESCE(SUM(valor_centavos),0) AS n FROM admin_comissoes_reserva_v2_demo'),
  saques:sqlN(b,'SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo')
 };
}
function verificarBanco(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
}
function executarTrabalhador(modo,arquivo){
 const child=spawn(process.execPath,[__filename,'--worker',modo,arquivo],{
  stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,LOOP_TESTE_ISOLADO:'1'}
 });
 let stderr='';
 child.stderr.on('data',b=>{stderr+=String(b).slice(0,2000)});
 child.stdout.on('data',()=>{});
 return {child,pronto:once(child,'message'),fim:once(child,'exit'),erro:()=>stderr.slice(-1000)};
}
async function rodada(trabalhadores,payloads){
 const recebidos=trabalhadores.map(w=>once(w.child,'message'));
 trabalhadores.forEach((w,i)=>w.child.send(payloads[i]));
 const mensagens=(await Promise.all(recebidos)).map(a=>a[0]);
 for(let i=0;i<mensagens.length;i++)
  assert.equal(mensagens[i].kind,'DONE',
   'Falha no processo '+i+': '+JSON.stringify(mensagens[i])+' '+trabalhadores[i].erro());
 const finais=await Promise.all(trabalhadores.map(w=>w.fim));
 finais.forEach((f,i)=>assert.equal(f[0],0,'Processo '+i+': '+trabalhadores[i].erro()));
 return mensagens;
}
if(process.argv[2]==='--worker'){
 const modo=process.argv[3],arquivo=process.argv[4];
 let m;
 try{
  m=abrir(arquivo);
  process.on('message',async instrucao=>{
   try{
    if(modo==='hold'){
     m.banco.exec('BEGIN IMMEDIATE');
     m.banco.prepare('INSERT INTO stress_rollback_probe(id,valor_centavos) VALUES(?,?)')
      .run('nao-confirmado',25000);
     process.send({kind:'HELD'});
     // Mantem a transacao pendente ate o pai enviar SIGKILL.
     return;
    }
    if(modo==='orders'){
     let criados=0,repetidos=0,erros=0;
     for(const pedidoId of instrucao.pedidos){
      const r=await m.ponte.processar({pedidoId});
      if(r.criado)criados++;
      if(r.repetido)repetidos++;
      if(!r.criado&&!r.repetido)erros++;
     }
     process.send({kind:'DONE',criados,repetidos,erros},()=>{
      m.repositorio.fechar();process.disconnect();
     });
     return;
    }
    if(modo==='withdraw'){
     const id=instrucao.contaId,idx=instrucao.indice;
     const comum=m.saques.registrar({contaId:id,solicitacaoId:ID_COMPARTILHADO,
      tipo:'BONUS',valorSolicitadoCentavos:2500});
     const idUnico='saque-aaaaaaaa-0000-4000-8000-'+String(idx).padStart(12,'0');
     let distinto;
     try{
      const r=m.saques.registrar({contaId:id,solicitacaoId:idUnico,
       tipo:'BONUS',valorSolicitadoCentavos:2500});
      distinto={ok:true,repetida:r.repetida};
     }catch(e){distinto={ok:false,codigo:e.codigo||e.message};}
     let conflito=null;
     try{
      m.saques.registrar({contaId:id,solicitacaoId:ID_COMPARTILHADO,
       tipo:'BONUS',valorSolicitadoCentavos:5000});
     }catch(e){conflito=e.codigo||e.message;}
     process.send({kind:'DONE',comumRepetido:comum.repetida,distinto,conflito},()=>{
      m.repositorio.fechar();process.disconnect();
     });
     return;
    }
    throw new Error('Modo de trabalhador invalido');
   }catch(e){
    process.send({kind:'FAIL',erro:e.message,codigo:e.codigo,stack:e.stack},()=>{
     try{m.repositorio.fechar()}catch{}
     process.exit(1);
    });
   }
  });
  process.send({kind:'READY'});
 }catch(e){
  process.send?.({kind:'FAIL',erro:e.message,stack:e.stack},()=>process.exit(1));
  if(!process.send)process.exit(1);
 }
}else{
 test('4 processos SQLite WAL: 640 pedidos e 2560 entregas, checkpoint, interrupcao e auditoria', {timeout:240000},async t=>{
  const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-wal-processos-'));
  t.after(()=>rmSync(pasta,{recursive:true,force:true}));
  const arquivo=path.join(pasta,'operacao.sqlite');
  let m=abrir(arquivo);
  t.after(()=>{try{m.repositorio.fechar()}catch{}});
  const ids=[];
  for(let i=1;i<=320;i++){
   const num=String(i).padStart(4,'0');
   const conta=m.contas.cadastrar({
    nome:'Cliente Paralelo '+num,
    email:'multiprocesso-'+num+'@exemplo.invalid',senha:SEGREDO
   });
   const pdf='wal-'+num+'-pdf',fisico='wal-'+num+'-fisico';
   pedido(m,conta,pdf,true);pedido(m,conta,fisico,false);
   ids.push(pdf,fisico);
  }
  m.banco.exec('CREATE TABLE stress_rollback_probe(id TEXT PRIMARY KEY,valor_centavos INTEGER)');
  m.repositorio.fechar();
  const w=Array.from({length:4},()=>executarTrabalhador('orders',arquivo));
  t.after(()=>w.forEach(x=>{try{x.child.kill()}catch{}}));
  const ready=(await Promise.all(w.map(x=>x.pronto))).map(x=>x[0]);
  ready.forEach((x,i)=>assert.equal(x.kind,'READY','Inicializacao '+i+': '+JSON.stringify(x)));
  const variacoes=w.map((_,i)=>{
   const deslocamento=(i*113)%ids.length;
   let a=ids.slice(deslocamento).concat(ids.slice(0,deslocamento));
   if(i%2)a=a.reverse();
   return {pedidos:a};
  });
  const resultados=await rodada(w,variacoes);
  assert.equal(resultados.reduce((s,r)=>s+r.criados,0),640);
  assert.equal(resultados.reduce((s,r)=>s+r.repetidos,0),1920);
  assert.equal(resultados.reduce((s,r)=>s+r.erros,0),0);
  m=abrir(arquivo);
  assert.deepEqual(contar(m),{pdf:320,fisicos:320,posicoes:320,bonus:0,saques:0});
  assert.equal(sqlN(m.banco,'SELECT COUNT(*) AS n FROM admin_pedidos_titularidade_demo'),640);
  assert.equal(sqlN(m.banco,'SELECT COUNT(DISTINCT conta_id) AS n FROM admin_ponte_compras_demo'),320);
  assert.equal(sqlN(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo'),0);
  const auditoria=auditarIntegridadeOperacionalDemo(m.ponte);
  assert.equal(auditoria.totalAlertas,0,JSON.stringify(auditoria.alertas));
  verificarBanco(m);
  m.repositorio.fechar();
  const crash=executarTrabalhador('hold',arquivo);
  t.after(()=>{try{crash.child.kill('SIGKILL')}catch{}});
  assert.equal((await crash.pronto)[0].kind,'READY');
  const segurou=once(crash.child,'message');
  crash.child.send({iniciar:true});
  assert.equal((await segurou)[0].kind,'HELD');
  crash.child.kill('SIGKILL');
  const fimCrash=await crash.fim;
  assert.equal(fimCrash[1],'SIGKILL');
  m=abrir(arquivo);
  assert.equal(sqlN(m.banco,'SELECT COUNT(*) AS n FROM stress_rollback_probe'),0);
  assert.deepEqual(contar(m),{pdf:320,fisicos:320,posicoes:320,bonus:0,saques:0});
  assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
  verificarBanco(m);
  m.banco.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all();
  m.repositorio.fechar();
  m=abrir(arquivo);
  assert.deepEqual(contar(m),{pdf:320,fisicos:320,posicoes:320,bonus:0,saques:0});
  verificarBanco(m);
  console.log('LOOP_WAL_MULTIPROCESSO='+JSON.stringify({
   processosEscritores:4,compradores:320,pedidosConfirmados:640,
   entregasConcorrentes:2560,duplicatasIgnoradas:1920,
   posicoesUnicas:320,rollbackAposSigkill:true,
   auditoriaOperacional:'SEM_DIVERGENCIAS_DETECTADAS',
   checkpointWal:true,integridade:'ok',pspReal:false
  }));
 });
 test('4 processos SQLite: disputa de 3 saques simulados, idempotencia e reserva sem duplo debito',{timeout:120000},async t=>{
  const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-wal-financeiro-'));
  t.after(()=>rmSync(pasta,{recursive:true,force:true}));
  const arquivo=path.join(pasta,'financeiro.sqlite');
  let m=abrir(arquivo);
  t.after(()=>{try{m.repositorio.fechar()}catch{}});
  const titular=m.contas.cadastrar({nome:'Titular Estresse Financeiro',
   email:'titular-estresse@exemplo.invalid',senha:SEGREDO});
  pedido(m,titular,'titular-saque-processos',true);
  const posicao=(await m.ponte.processar({pedidoId:'titular-saque-processos'})).posicaoId;
  m.adesoes.ativar({contaId:titular.contaId,posicaoId:posicao,
   cpfFicticio:cpfArtificial('357951246'),aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
  const bases=['123456789','529982247','111444777'];
  for(let i=0;i<3;i++){
   const conta=m.contas.cadastrar({nome:'Convidado Financeiro '+(i+1),
    email:'convidado-fin-'+i+'@exemplo.invalid',senha:SEGREDO,
    codigoIndicador:titular.codigoConvite});
   const id='financeiro-verde-'+(i+1);
   pedido(m,conta,id,true);
   const pos=(await m.ponte.processar({pedidoId:id})).posicaoId;
   m.adesoes.ativar({contaId:conta.contaId,posicaoId:pos,
    cpfFicticio:cpfArtificial(bases[i]),aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
  }
  assert.equal(contar(m).bonus,7500);
  assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,7500);
  const disponibilidade=()=>disponibilidadeCofreDemo(m.banco,{
   cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000});
  assert.equal(disponibilidade().saldoLivreDemonstrativoCentavos,42500);
  m.repositorio.fechar();
  const w=Array.from({length:4},()=>executarTrabalhador('withdraw',arquivo));
  t.after(()=>w.forEach(x=>{try{x.child.kill()}catch{}}));
  const rdy=(await Promise.all(w.map(x=>x.pronto))).map(x=>x[0]);
  rdy.forEach(x=>assert.equal(x.kind,'READY',JSON.stringify(x)));
  const respostas=await rodada(w,w.map((_,i)=>({contaId:titular.contaId,indice:i})));
  assert.equal(respostas.filter(x=>x.comumRepetido===false).length,1);
  assert.equal(respostas.filter(x=>x.comumRepetido===true).length,3);
  assert.equal(respostas.filter(x=>x.distinto.ok).length,2);
  assert.equal(respostas.filter(x=>!x.distinto.ok&&x.distinto.codigo==='SALDO_SIMULADO_INSUFICIENTE').length,2);
  respostas.forEach(x=>assert.equal(x.conflito,'CONFLITO_IDEMPOTENCIA'));
  m=abrir(arquivo);
  const resumo=m.saques.consultar(titular.contaId);
  assert.equal(resumo.historico.length,3);
  assert.equal(resumo.bonusBrutoHistoricoCentavos,7500);
  assert.equal(resumo.bonusSolicitadoSimuladoCentavos,7500);
  assert.equal(resumo.bonusDisponivelSimuladoCentavos,0);
  assert.equal(sqlN(m.banco,'SELECT COALESCE(SUM(taxa_centavos),0) AS n FROM admin_solicitacoes_saque_demo'),225);
  assert.equal(sqlN(m.banco,'SELECT COALESCE(SUM(valor_liquido_centavos),0) AS n FROM admin_solicitacoes_saque_demo'),7275);
  assert.equal(disponibilidade().compromissoBonificacoesCentavos,7500);
  assert.equal(disponibilidade().saldoLivreDemonstrativoCentavos,42500);
  verificarBanco(m);
  m.repositorio.fechar();
  m=abrir(arquivo);
  assert.equal(m.saques.consultar(titular.contaId).historico.length,3);
  assert.equal(disponibilidade().saldoLivreDemonstrativoCentavos,42500);
  verificarBanco(m);
  console.log('LOOP_WAL_FINANCEIRO='+JSON.stringify({
   processos:4,bonificacoesVerdesCentavos:7500,
   saqueCompartilhadoUnico:1,duplicatasSaque:3,
   saquesAdicionaisAceitos:2,saquesBloqueadosSemSaldo:2,
   saquesPersistidos:3,totalBrutoCentavos:7500,
   taxasCentavos:225,liquidoCentavos:7275,
   reservaLivreCentavos:42500,debitoReservaDuplicado:false,
   financeiroReal:false,integridade:'ok'
  }));
 });
}