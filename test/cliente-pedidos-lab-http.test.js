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
  const cadastro=await fetch(base+'/cadastrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Novo Laboratorio',email:'novo@example.invalid',senha:'SenhaNova12345'})});
  assert.equal(cadastro.status,201);
  const repetido=await fetch(base+'/cadastrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Novo Laboratorio',email:'novo@example.invalid',senha:'SenhaNova12345'})});
  assert.equal(repetido.status,409);
  const novoLogin=await fetch(base+'/entrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Novo Laboratorio',senha:'SenhaNova12345'})});
  assert.equal(novoLogin.status,200);
  const novoToken=(await novoLogin.json()).token;
  const novosPedidos=await fetch(base+'/meus-pedidos',{headers:{Authorization:'Bearer '+novoToken}});
  assert.deepEqual((await novosPedidos.json()).pedidos,[]);
  const enviarPedido=(token,corpo)=>fetch(base+'/pedidos',{method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify(corpo)});
  const compra={pedidoId:'novo-pedido-250',produtoId:'curso-pdf',valorCentavos:25000};
  assert.equal((await enviarPedido(novoToken,{...compra,contaId:a.contaId})).status,400);
  assert.equal((await enviarPedido(novoToken,{...compra,valorCentavos:24999})).status,400);
  const criado=await enviarPedido(novoToken,compra);
  assert.equal(criado.status,201);
  const detalhe=await criado.json();
  assert.equal(detalhe.posicaoCriada,false);
  assert.equal(detalhe.cobrancaReal,false);
  assert.equal((await enviarPedido(novoToken,compra)).status,200);
  assert.equal((await enviarPedido(novoToken,{...compra,produtoId:'outro'})).status,409);
  const pedidosNovo=await fetch(base+'/meus-pedidos',{headers:{Authorization:'Bearer '+novoToken}});
  assert.deepEqual((await pedidosNovo.json()).pedidos.map(p=>p.pedidoId),['novo-pedido-250']);
  assert.equal((await enviarPedido('',compra)).status,401);
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

test('carrinho HTTP opcional exige sessao, ignora preco enviado e isola titular',async()=>{
 const banco=new DatabaseSync(':memory:');
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
 const registros=new Map();
 const carrinho={
  banco,
  criar({pedidoId,contaId,itens,participarLoop}){
   if(!Array.isArray(itens)||itens.length!==1||itens[0].produtoId!=='curso-teste'||
      itens[0].quantidade!==1||participarLoop!==true) {
    const e=new Error('INVALIDO');e.codigo='INVALIDO';throw e;
   }
   const anterior=registros.get(pedidoId);
   if(anterior){
    if(anterior.contaId!==contaId){const e=new Error('CONFLITO');e.codigo='CONFLITO';throw e;}
    return {...anterior,repetido:true};
   }
   const pedido={pedidoId,contaId,totalCentavos:25000,participarLoop};
   registros.set(pedidoId,pedido);
   return {...pedido,repetido:false};
  },
  buscarDaConta(id,contaId){
   const p=registros.get(id);return p?.contaId===contaId?p:null;
  }
 };
 const app=express();app.use(express.json());
 app.use('/api/cliente-lab',criarRouterClientePedidosLab({contas,pedidos,carrinho}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/cliente-lab';
  const login=async(nome,email)=>{
   await fetch(base+'/cadastrar',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nome,email,senha:'senha-segura-123'})});
   const r=await fetch(base+'/entrar',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nome,senha:'senha-segura-123'})});
   return (await r.json()).token;
  };
  const a=await login('Comprador A Teste','a-carrinho@example.invalid');
  const b=await login('Comprador B Teste','b-carrinho@example.invalid');
  const enviar=(token,body)=>fetch(base+'/carrinhos',{method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify(body)});
  const corpo={pedidoId:'pedido-carrinho-http',participarLoop:true,
   itens:[{produtoId:'curso-teste',quantidade:1}]};
  assert.equal((await enviar('',corpo)).status,401);
  assert.equal((await enviar(a,{...corpo,totalCentavos:1})).status,400);
  const criado=await enviar(a,corpo);
  assert.equal(criado.status,201);
  assert.equal((await criado.json()).totalCentavos,25000);
  assert.equal((await enviar(a,corpo)).status,200);
  assert.equal((await enviar(b,corpo)).status,409);
  const consultar=token=>fetch(base+'/carrinhos/'+corpo.pedidoId,
   {headers:{Authorization:'Bearer '+token}});
  assert.equal((await consultar(a)).status,200);
  assert.equal((await consultar(b)).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));banco.close();}
});
