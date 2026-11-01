'use strict';
// Integrar a fila persistente do callback ao monitor geral do Escritorio.
// Tudo e sandbox local: nenhum PSP real, giro ou saque e executado.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
const TOKEN='TOKEN_CALLBACK_MONITOR_CONVERGENCIA_FICTICIO_2026';
const OPCOES={webhookAsaasSandbox:{habilitado:true,token:TOKEN}};
async function preparar(m,email){
 const nome='Cliente Callback Convergencia';
 const cliente=m.contas.cadastrar({nome,email,senha:'senha-ficticia-callback-convergencia'});
 const {cookie}=await m.http('/entrar',{body:{nome,senha:'senha-ficticia-callback-convergencia'}});
 const pedidoId=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 const pagamentoId=m.integracao.cobrancas.consultar(pedidoId).pagamentoId;
 return {pedidoId,pagamentoId,cookie};
}
async function enviar(m,{pedidoId,pagamentoId},eventoId){
 const evento={id:eventoId,event:'PAYMENT_RECEIVED',
  payment:{id:pagamentoId,billingType:'PIX',status:'RECEIVED',
   externalReference:'LOOPLAB-'+pedidoId,value:250}};
 const res=await fetch(m.base+'/api/laboratorio/webhook-asaas-sandbox',{
  method:'POST',headers:{'Content-Type':'application/json',
   'asaas-access-token':TOKEN},body:JSON.stringify(evento)});
 assert.equal(res.status,200);
}
async function resumo(m){
 const response=await fetch(m.base+'/api/admin/asaas-conciliacao-lab',{headers:ADMIN});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const before=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const data=await response.json();
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,before);
 assert.equal(JSON.stringify(data).includes(TOKEN),false);
 return data;
}
test('Escritorio unifica callback com tentativas esgotadas sem criar posicao',async t=>{
 const m=await abrirLaboratorio(':memory:',OPCOES);
 t.after(()=>m.fechar());
 const comprador=await preparar(m,'cb-revisao@example.invalid');
 await enviar(m,comprador,'evt_ConvergenciaManual001');
 const worker=m.integracao.callbacks;
 // Forcar uma unica tentativa sem confirmar PSP: revisao e obrigatoria.
 worker.maxTentativas=1;
 await worker.processarLote();
 assert.equal(worker.consultar('evt_ConvergenciaManual001').estado,'EXIGE_REVISAO');
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const monitor=await resumo(m);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal(monitor.callbacksHabilitados,true);
 assert.equal(monitor.callbacksExigemRevisao,1);
 assert.equal(monitor.callbacksConcluidos,0);
 assert.equal(monitor.revisaoManualIndicada,true);
 assert.equal(monitor.anomaliasContadasPorCriterio,1);
 assert.equal(monitor.pedidosComPosicao,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Escritorio apresenta callback conciliado sem alerta falso ou saldo real',async t=>{
 const m=await abrirLaboratorio(':memory:',OPCOES);
 t.after(()=>m.fechar());
 const comprador=await preparar(m,'cb-concluido@example.invalid');
 m.confirmar(comprador.pedidoId);
 await enviar(m,comprador,'evt_ConvergenciaConcluida002');
 await m.integracao.callbacks.processarLote();
 const monitor=await resumo(m);
 assert.equal(monitor.callbacksHabilitados,true);
 assert.equal(monitor.callbacksExigemRevisao,0);
 assert.equal(monitor.callbacksConcluidos,1);
 assert.equal(monitor.pedidosComPosicao,1);
 assert.equal(monitor.revisaoManualIndicada,false);
 assert.equal(monitor.pagamentosReais,false);
 assert.equal(monitor.caixaBancarioConciliado,false);
 assert.equal(monitor.saquesLiberados,0);
 assert.equal((await m.http('/minha-conta',{cookie:comprador.cookie})).data.posicoes.length,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Monitor sem webhook continua somente leitura e com contadores neutros',async t=>{
 const m=await abrirLaboratorio(':memory:');
 t.after(()=>m.fechar());
 const monitor=await resumo(m);
 assert.equal(monitor.callbacksHabilitados,false);
 assert.equal(monitor.callbacksExigemRevisao,0);
 assert.equal(monitor.callbacksConcluidos,0);
 assert.equal(monitor.callbacksSemJob,0);
 assert.equal(monitor.revisaoManualIndicada,false);
});
