'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {DatabaseSync}=require('node:sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {criarRouterClientePedidosLab}=require('../src/routes/cliente-pedidos-lab');
test('login e Meus Pedidos isolam contas via HTTP',async()=>{
 const banco=new DatabaseSync(':memory:');
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
 const a=contas.cadastrar({nome:'Cliente Um Teste',email:'cliente1@example.invalid',senha:'senha-segura-123'});
 const b=contas.cadastrar({nome:'Cliente Dois Teste',email:'cliente2@example.invalid',senha:'senha-segura-456'});
 pedidos.preparar({pedidoId:'um-250',contaId:a.contaId,produtoId:'pdf',valorCentavos:25000});
 pedidos.preparar({pedidoId:'dois-250',contaId:b.contaId,produtoId:'pdf',valorCentavos:25000});
 const app=express();app.use(express.json());app.use('/api/cliente-lab',criarRouterClientePedidosLab({contas,pedidos}));
 const servidor=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>servidor.once('listening',resolve));
  const base='http://127.0.0.1:'+servidor.address().port+'/api/cliente-lab';
  assert.equal((await fetch(base+'/meus-pedidos')).status,401);
  const login=await fetch(base+'/entrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Um Teste',senha:'senha-segura-123'})});
  assert.equal(login.status,200);
  const {token}=await login.json();
  const consulta=await fetch(base+'/meus-pedidos',{headers:{Authorization:'Bearer '+token}});
  assert.equal(consulta.status,200);
  assert.deepEqual((await consulta.json()).pedidos.map(p=>p.pedidoId),['um-250']);
  const sair=await fetch(base+'/sair',{method:'POST',headers:{Authorization:'Bearer '+token}});
  assert.equal(sair.status,204);
  assert.equal((await fetch(base+'/meus-pedidos',{headers:{Authorization:'Bearer '+token}})).status,401);
 }finally{await new Promise(resolve=>servidor.close(resolve));banco.close();}
});
