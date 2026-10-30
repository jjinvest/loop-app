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

test('antifraude SQL impede forjar titular, posicao e ativacao e preserva idempotencia',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pagamentos=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  atribuicaoManualPorPosicao:true,consultarPagamentoConfiavel:async id=>pagamentos.get(id)});
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte});
 const senha='senha-ficticia-de-teste-antifraude';
 const titular=contas.cadastrar({nome:'Titular Seg',email:'a-seg@exemplo.invalid',senha});
 const outro=contas.cadastrar({nome:'Outro Seg',email:'b-seg@exemplo.invalid',senha});
 const convidado=contas.cadastrar({nome:'Convidado Seg',email:'c-seg@exemplo.invalid',
  senha,codigoIndicador:titular.codigoConvite});
 const pendente=contas.cadastrar({nome:'Pendente Seg',email:'d-seg@exemplo.invalid',
  senha,codigoIndicador:titular.codigoConvite});
 async function comprar(conta,id){
  pagamentos.set(id,{pedidoId:id,contaId:conta.contaId,produtoId:'pdf-seguranca',
   valorCentavos:25000,status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-18T12:00:00.000Z'});
  return ponte.processar({pedidoId:id});
 }
 const p1=await comprar(titular,'antifraude-posicao-1');
 const p2=await comprar(titular,'antifraude-posicao-2');
 const pOutro=await comprar(outro,'antifraude-posicao-outra');
 const pConv=await comprar(convidado,'antifraude-convidado');
 await comprar(pendente,'antifraude-pendente');
 adesoes.ativar({contaId:titular.contaId,posicaoId:p1.posicaoId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 adesoes.ativar({contaId:outro.contaId,posicaoId:pOutro.posicaoId,
  cpfFicticio:'12345678909',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 adesoes.ativar({contaId:convidado.contaId,posicaoId:pConv.posicaoId,
  cpfFicticio:'52998224725',aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'});
 const inserir=repo.banco.prepare(`
  INSERT INTO admin_loop_vinculos_indicacao_posicao_demo
  (convidado_id,indicador_id,posicao_indicador_id,registrado_em)
  VALUES(?,?,?,'2026-10-18T12:30:00.000Z')`);
 const tentar=(id,indicador,alvo)=>inserir.run(id,indicador,alvo);
 assert.throws(()=>tentar(convidado.contaId,outro.contaId,pOutro.posicaoId),
  /INDICACAO_TITULAR_DIVERGENTE/);
 assert.throws(()=>tentar(convidado.contaId,titular.contaId,pOutro.posicaoId),
  /INDICACAO_POSICAO_NAO_ATIVA/);
 assert.throws(()=>tentar(convidado.contaId,titular.contaId,p2.posicaoId),
  /INDICACAO_POSICAO_NAO_ATIVA/);
 assert.throws(()=>tentar(pendente.contaId,titular.contaId,p1.posicaoId),
  /INDICADO_NAO_ATIVO/);
 assert.throws(()=>tentar(titular.contaId,titular.contaId,p1.posicaoId),
  /INDICACAO_TITULAR_DIVERGENTE/);
 assert.equal(repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_loop_vinculos_indicacao_posicao_demo').get().n,0);
 const v={contaId:titular.contaId,convidadoId:convidado.contaId,posicaoId:p1.posicaoId};
 assert.equal(ponte.atribuirIndicacao(v).repetida,false);
 assert.equal(ponte.atribuirIndicacao(v).repetida,true);
 assert.throws(()=>ponte.atribuirIndicacao({...v,posicaoId:p2.posicaoId}),
  {codigo:'INDICACAO_JA_VINCULADA'});
 assert.throws(()=>repo.banco.prepare(
  'UPDATE admin_loop_vinculos_indicacao_posicao_demo SET posicao_indicador_id=? WHERE convidado_id=?'
 ).run(p2.posicaoId,convidado.contaId),/imutavel/);
 assert.throws(()=>repo.banco.prepare(
  'DELETE FROM admin_loop_vinculos_indicacao_posicao_demo WHERE convidado_id=?'
 ).run(convidado.contaId),/imutavel/);
 const sim=ponte._restaurar();
 assert.equal(sim.filas.filaA.some(x=>x.id===p1.posicaoId),true);
 assert.equal(sim.filas.filaB.some(x=>x.id===p2.posicaoId),true);
 const app=criarAppAdminLaboratorio({repositorio:repo,
  segredo:'token-do-admin-antifraude-lab-2026-123456789'});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port+'/api/laboratorio/participante';
 const headers={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const login=await fetch(base+'/entrar',{method:'POST',headers,
  body:JSON.stringify({nome:outro.nome,senha})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const body={convidadoId:convidado.contaId,posicaoId:pOutro.posicaoId};
 const post=(dados,extra={})=>fetch(base+'/atribuir-indicacao',{method:'POST',
  headers:{...headers,...extra},body:JSON.stringify(dados)});
 assert.equal((await post(body)).status,401);
 assert.equal((await post(body,{Cookie:cookie,Origin:'https://externo.invalid'})).status,403);
 assert.equal((await post(body,{Cookie:cookie,'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await post({...body,contaId:titular.contaId},{Cookie:cookie})).status,400);
 const forjado=await post(body,{Cookie:cookie});
 assert.equal(forjado.status,409);
 assert.equal((await forjado.json()).erro,'INDICACAO_NAO_PERTENCE_A_CONTA');
 assert.equal(repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_loop_vinculos_indicacao_posicao_demo').get().n,1);
});
