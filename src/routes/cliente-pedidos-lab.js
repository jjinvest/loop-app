'use strict';
const express=require('express');
const {randomBytes,createHash}=require('node:crypto');
function criarRouterClientePedidosLab({contas,pedidos,carrinho=null}={}){
 if(!contas||!pedidos||contas.banco!==pedidos.banco||
    typeof contas.autenticar!=='function'||typeof pedidos.listarPorTitular!=='function')
  throw new TypeError('Dependencias de laboratorio invalidas');
 const router=express.Router(),sessoes=new Map(),tentativas=new Map();
 router.use((_q,res,next)=>{res.set('Cache-Control','no-store');next();});
 const chave=t=>createHash('sha256').update(t).digest('hex');
 function sessao(req,res,next){
  const token=req.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const registro=token&&sessoes.get(chave(token));
  if(!registro||registro.expira<=Date.now())return res.status(401).json({erro:'LOGIN_NECESSARIO'});
  req.contaId=registro.contaId;req.token=token;next();
 }
 router.post('/cadastrar',(req,res)=>{
  if(!req.is('application/json'))return res.sendStatus(415);
  const corpo=req.body;
  if(!corpo||typeof corpo!=='object'||Array.isArray(corpo)||
     Object.keys(corpo).sort().join(',')!=='email,nome,senha')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const conta=contas.cadastrar({nome:corpo.nome,email:corpo.email,senha:corpo.senha});
   return res.status(201).json({conta:{nome:conta.nome,apelido:conta.apelido},
     laboratorio:true,comprasReais:false});
  }catch(e){
   return res.status(e.codigo==='CONFLITO'?409:400).json({erro:e.codigo||'CADASTRO_INVALIDO'});
  }
 });
 router.post('/entrar',(req,res)=>{
  if(!req.is('application/json'))return res.sendStatus(415);
  const origem=req.socket.remoteAddress||'local';
  const agora=Date.now();
  const anterior=tentativas.get(origem);
  if(anterior&&anterior.ate>agora&&anterior.total>=5)return res.status(429).json({erro:'AGUARDE_PARA_TENTAR_NOVAMENTE'});
  if(!anterior||anterior.ate<=agora)tentativas.set(origem,{total:0,ate:agora+60000});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='nome,senha')return res.sendStatus(400);
  const {nome,senha}=req.body;
  if(typeof nome!=='string'||typeof senha!=='string')return res.sendStatus(400);
  try{
   const resultado=contas.autenticar({nome,senha});
   tentativas.delete(origem);
   const token=randomBytes(32).toString('hex');
   for(const [id,s] of sessoes)if(s.expira<=Date.now())sessoes.delete(id);
   sessoes.set(chave(token),{contaId:resultado.conta.contaId,expira:Date.now()+1800000});
   return res.json({token,expiraEmSegundos:1800,conta:{nome:resultado.conta.nome,apelido:resultado.conta.apelido},laboratorio:true});
  }catch(e){tentativas.get(origem).total++;return res.status(401).json({erro:'CREDENCIAIS_INVALIDAS'});}
 });
 router.post('/pedidos',sessao,(req,res)=>{
  if(!req.is('application/json'))return res.sendStatus(415);
  const dados=req.body;
  if(!dados||typeof dados!=='object'||Array.isArray(dados)||
     Object.keys(dados).sort().join(',')!=='pedidoId,produtoId,valorCentavos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(dados.valorCentavos!==25000)
   return res.status(400).json({erro:'VALOR_NAO_QUALIFICADO'});
  try{
   const pedido=pedidos.preparar({...dados,contaId:req.contaId});
   return res.status(pedido.repetido?200:201).json({
    pedidoId:pedido.pedidoId,produtoId:pedido.produtoId,
    valorCentavos:pedido.valorCentavos,repetido:pedido.repetido,
    estado:'AGUARDANDO_PAGAMENTO_SIMULADO',posicaoCriada:false,
    cobrancaReal:false,laboratorio:true
   });
  }catch(e){
   return res.status(e.codigo==='PEDIDO_IMUTAVEL'?409:400)
    .json({erro:e.codigo||'PEDIDO_INVALIDO'});
  }
 });
 // Carrinho opcional de laboratorio: precos e elegibilidade calculados no SQLite.
 // Nunca aceitar total ou contaId do navegador.
 if(carrinho){
  if(carrinho.banco!==contas.banco||
     typeof carrinho.criar!=='function'||typeof carrinho.buscarDaConta!=='function')
   throw new TypeError('Carrinho de laboratorio invalido');
  router.post('/carrinhos',sessao,(req,res)=>{
   if(!req.is('application/json'))return res.sendStatus(415);
   const dados=req.body;
   if(!dados||typeof dados!=='object'||Array.isArray(dados)||
      Object.keys(dados).sort().join(',')!=='itens,participarLoop,pedidoId')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    const pedido=carrinho.criar({pedidoId:dados.pedidoId,contaId:req.contaId,
      itens:dados.itens,participarLoop:dados.participarLoop});
    return res.status(pedido.repetido?200:201).json({
     pedidoId:pedido.pedidoId,totalCentavos:pedido.totalCentavos,
     repetido:pedido.repetido,participarLoop:pedido.participarLoop,
     estado:'AGUARDANDO_PAGAMENTO_SIMULADO',posicaoCriada:false,
     cobrancaReal:false,laboratorio:true
    });
   }catch(e){
    return res.status(e.codigo==='CONFLITO'?409:400)
     .json({erro:e.codigo||'CARRINHO_INVALIDO'});
   }
  });
  router.get('/carrinhos/:pedidoId',sessao,(req,res)=>{
   try{
    const pedido=carrinho.buscarDaConta(req.params.pedidoId,req.contaId);
    if(!pedido)return res.status(404).json({erro:'PEDIDO_NAO_ENCONTRADO'});
    return res.json({pedido,laboratorio:true,cobrancaReal:false});
   }catch(e){return res.status(400).json({erro:e.codigo||'PEDIDO_INVALIDO'});}
  });
 }
 router.get('/meus-pedidos',sessao,(req,res)=>{
  try{return res.json({pedidos:pedidos.listarPorTitular(req.contaId),laboratorio:true});}
  catch(e){return res.status(500).json({erro:'CONSULTA_INDISPONIVEL'});}
 });
 router.post('/sair',sessao,(req,res)=>{sessoes.delete(chave(req.token));res.sendStatus(204);});
 return router;
}
module.exports={criarRouterClientePedidosLab};
