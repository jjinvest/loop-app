'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');
const {abrirLaboratorio}=require('./lib/laboratorio-http-asaas');
async function validarSaques(pasta){
 let m=await abrirLaboratorio(path.join(pasta,'laboratorio.sqlite'));
 const senha='senha-ficticia-ensaio-sequencial-2026';
 const bonus={solicitacaoId:'saque-11111111-2222-4333-8444-555555555555',
  tipo:'BONUS',valorSolicitadoCentavos:2500};
 const centro={solicitacaoId:'saque-centro-ensaio-http-00000001',valorCentavos:2500};
 let indicadorId,centroId;
 try{
  indicadorId=m.banco.prepare('SELECT indicador_id id FROM admin_loop_vinculos_indicacao_posicao_demo ORDER BY registrado_em DESC LIMIT 1').get().id;
  centroId=m.banco.prepare('SELECT conta_id id FROM loop_v6_provisoes_ciclos WHERE conta_id IS NOT NULL ORDER BY giro LIMIT 1').get().id;
  const logar=async id=>(await m.http('/entrar',{body:{nome:m.contas.buscar(id).nome,senha}})).cookie;
  const cookie=await logar(indicadorId);
  await m.http('/saques-simulados',{cookie,body:{...bonus,valorSolicitadoCentavos:2499},status:400});
  const primeira=(await m.http('/saques-simulados',{cookie,body:bonus})).data;
  const repetida=(await m.http('/saques-simulados',{cookie,body:bonus})).data;
  assert.equal(primeira.valorLiquidoCentavos,2500);assert.equal(primeira.taxaPercentual,0);
  assert.equal(repetida.repetida,true);assert.equal(primeira.transferenciaExecutada,false);
  const outro=m.banco.prepare('SELECT id FROM admin_contas_participantes_demo WHERE id<>? ORDER BY criado_em DESC LIMIT 1').get(indicadorId).id;
  await m.http('/saques-simulados',{cookie:await logar(outro),body:bonus,status:409});
  const cookieCentro=await logar(centroId);
  await m.http('/saque-centro-v6-demo',{cookie:cookieCentro,
   body:{...centro,valorCentavos:2499},status:400});
  await m.http('/saque-centro-v6-demo',{cookie:cookieCentro,body:centro,status:201});
  const replay=(await m.http('/saque-centro-v6-demo',{cookie:cookieCentro,body:centro,status:201})).data;
  assert.equal(replay.repetida,true);
  assert.equal((await m.http('/saque-centro-v6-demo',{cookie:cookieCentro})).data.disponivelParaSaqueRealCentavos,0);
  await m.fechar();m=await abrirLaboratorio(path.join(pasta,'laboratorio.sqlite'));
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_solicitacoes_saque_demo WHERE solicitacao_id=?').get(bonus.solicitacaoId).n,1);
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM loop_v6_saques_centro_teste WHERE solicitacao_id=?').get(centro.solicitacaoId).n,1);
  const headers={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
  for(const [id,campo] of [[indicadorId,'saquesBonus'],[centroId,'saquesCentro']]){
   const r=await fetch(m.base+'/api/admin/escritorio-demo/clientes/'+id+'/operacao',{headers});
   assert.equal(r.status,200);const dados=await r.json();assert.equal(dados[campo].total,1);
  }
  const resultado={estado:'APROVADO_APENAS_LABORATORIO',bonusSolicitadoCentavos:2500,
   bonusLiquidoCentavos:2500,taxaParticipantePercentual:0,
   centroReservadoFicticioCentavos:2500,minimo25VerificadoNosDoisFluxos:true,
   replaySemDuplicacao:true,trocaTitularRecusada:true,persistenciaReaberta:true,
   consultasAdminMesmoSQLite:true,transferenciasReais:0,saldoRealLiberadoCentavos:0};
  fs.writeFileSync(path.join(pasta,'saques-verificados.json'),JSON.stringify(resultado,null,2));
  return resultado;
 }finally{await m.fechar();}
}
if(require.main===module)validarSaques(path.resolve(process.argv[2]||'artifacts/ensaio-10000-http'))
 .then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={validarSaques};
