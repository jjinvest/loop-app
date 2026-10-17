'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function criar(){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=> '2030-01-01T10:00:00.000Z'});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 async function comprar(id,conta,valor=25000){
  comprovantes.set(id,{pedidoId:id,contaId:conta.contaId,produtoId:'pdf-teste',
   valorCentavos:valor,confirmadoEm:'2030-01-01T12:00:00.000Z',status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId:id});
 }
 return {repo,contas,ponte,adesoes,comprar};
}
test('auditoria vazia e somente leitura nao inventa receita, cpf ou operacao',t=>{
 const {repo,ponte}=criar();t.after(()=>repo.fechar());
 const inicio=repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_douradas_manuais_demo').get().n;
 const diag=ponte.auditarIntegridadeOperacionalDemo();
 assert.equal(diag.integridade,'SEM_DIVERGENCIAS_DETECTADAS');
 assert.equal(diag.totalAlertas,0);
 assert.equal(diag.semMovimentacao,true);
 assert.equal(diag.comprovantesReaisVerificados,false);
 assert.equal(diag.auditoriaContabilIndependente,false);
 assert.equal(diag.indicadores.posicoesComOrigemContabil,0);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_douradas_manuais_demo').get().n,inicio);
 assert.equal(repo.banco.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='admin_fin_demo_lancamentos'`).get().n,0);
});
test('auditoria confere compra, posicao ativa, seis bolas douradas e desistente sem CPF',async t=>{
 const {repo,contas,ponte,adesoes,comprar}=criar();t.after(()=>repo.fechar());
 const a=contas.cadastrar({nome:'Conta Laboratorio',email:'audit-loja@exemplo.invalid',senha:'senha-ficticia-123'});
 assert.equal((await comprar('primeira-compra-simples',a,5000)).posicaoCriada,false);
 adesoes.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 for(let i=0;i<6;i++)ponte.criarDouradaManualDemo({eventoId:'gold-auditoria-'+i});
 const compra=await comprar('pedido-qualificado-audit',a);
 assert.equal(compra.posicaoCriada,true);
 const antes=ponte.auditarIntegridadeOperacionalDemo();
 assert.equal(antes.totalAlertas,0);
 assert.equal(antes.indicadores.comprasQualificadas,1);
 assert.equal(antes.indicadores.douradasManuais,6);
 assert.equal(antes.indicadores.posicoesAtivadasRegistradas,1);
 assert.equal(antes.indicadores.posicoesIdentificadasNoMotor,7);
 ponte.prepararTabuleiroDemo();
 const pos=ponte._restaurar().tabuleiro.vagas[5];
 assert.equal(pos.id,compra.posicaoId);
 assert.equal(pos.statusAdesao,'ATIVA');
 ponte.desistirDaVaga6Demo({contaId:a.contaId,posicaoId:pos.id,aceiteExpresso:true});
 const depois=ponte.auditarIntegridadeOperacionalDemo();
 assert.equal(depois.integridade,'SEM_DIVERGENCIAS_DETECTADAS');
 assert.equal(depois.totalAlertas,0);
 assert.equal(depois.indicadores.desistenciasExpressas,1);
 assert.equal(depois.indicadores.douradasManuais,6);
 assert.equal(depois.indicadores.posicoesIdentificadasNoMotor,7);
 assert.equal(repo.banco.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='admin_fin_demo_lancamentos'`).get().n,0);
 assert.doesNotMatch(JSON.stringify(depois),/11144477735|audit-loja@exemplo\.invalid|Conta Laboratorio|senha-ficticia/);
});
test('auditoria detecta empresa manual adulterada sem alterar banco ou motor',t=>{
 const {repo,ponte}=criar();t.after(()=>repo.fechar());
 const criada=ponte.criarDouradaManualDemo({eventoId:'dourada-inspecao'});
 assert.equal(ponte.auditarIntegridadeOperacionalDemo().totalAlertas,0);
 const registro=repo.banco.prepare('SELECT snapshot_json AS v FROM admin_ponte_estado_demo').get().v;
 const snapshot=JSON.parse(registro);
 snapshot.filas.filaB[0].empresa=false;
 repo.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=?').run(JSON.stringify(snapshot));
 const leitura=repo.banco.prepare('SELECT snapshot_json AS v FROM admin_ponte_estado_demo').get().v;
 const diagnostic=ponte.auditarIntegridadeOperacionalDemo();
 assert.equal(diagnostic.integridade,'DIVERGENCIAS_ENCONTRADAS');
 assert.ok(diagnostic.alertas.some(x=>x.codigo==='DOURADA_MANUAL_ALTERADA'&&x.posicaoId===criada.posicaoId));
 assert.equal(repo.banco.prepare('SELECT snapshot_json AS v FROM admin_ponte_estado_demo').get().v,leitura);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_douradas_manuais_demo').get().n,1);
});
test('auditoria detecta comprador sem titularidade original e posicao sem origem',async t=>{
 const {repo,contas,ponte,comprar}=criar();t.after(()=>repo.fechar());
 const c=contas.cadastrar({nome:'Comprador Audit',email:'comprador-audit@exemplo.invalid',senha:'senha-ficticia-123'});
 const pos=await comprar('pedido-auditar-dados',c);
 assert.equal(ponte.auditarIntegridadeOperacionalDemo().totalAlertas,0);
 const snapshot=JSON.parse(repo.banco.prepare(
  'SELECT snapshot_json AS v FROM admin_ponte_estado_demo').get().v);
 snapshot.filas.filaB[0].participanteId='simulador-invasor';
 snapshot.filas.participantesConhecidos.push('simulador-invasor');
 repo.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=?').run(JSON.stringify(snapshot));
 const audit=ponte.auditarIntegridadeOperacionalDemo();
 assert.ok(audit.alertas.some(x=>x.codigo==='TITULARIDADE_DA_COMPRA_DIVERGENTE'&&x.posicaoId===pos.posicaoId));
 // Uma nova posicao de simulador injetada, sem pedido nem registro de empresa,
 // tambem deve ser diagnosticada (nao e automaticamente uma receita).
 const sim=ponte._restaurar();
 sim.registrarPosicaoSimulada({participanteId:'extra-sem-compra',vendaId:'extra'});
 repo.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=?').run(JSON.stringify(sim.exportarSnapshot()));
 const outro=ponte.auditarIntegridadeOperacionalDemo();
 assert.ok(outro.alertas.some(x=>x.codigo==='POSICAO_SEM_ORIGEM_REGISTRADA'));
});
test('rota read-only de auditoria e administrativa, sem parametros ou vazamento de CPF',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const key='chave-estrita-admin-auditoria-v6';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo:key}).listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const url='http://127.0.0.1:'+srv.address().port+
  '/api/admin/ponte-compras-convites-demo/auditoria-integridade';
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+key}})).status,200);
 assert.equal((await fetch(url+'?altera=1',{headers:{Authorization:'Bearer '+key}})).status,400);
 const response=await (await fetch(url,{headers:{Authorization:'Bearer '+key}})).json();
 assert.equal(response.integridade,'SEM_DIVERGENCIAS_DETECTADAS');
 assert.equal(response.nenhumDadoPessoalExposto,true);
 assert.equal(response.semMovimentacao,true);
 assert.equal(response.indicadores.posicoesIdentificadasNoMotor,0);
});
