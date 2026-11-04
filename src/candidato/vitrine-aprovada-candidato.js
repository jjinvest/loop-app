'use strict';
// Vitrine visual APROVADA servida no candidato LOCAL, não no servidor comercial.
// Código original de loja preservado; apenas a cópia de laboratório usa SQLite
// das mesmas contas, produtos, pré-pedidos e Escritórios.
const fs=require('node:fs'),path=require('node:path');
const {entradaValida,cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
const {SinalizacaoVitrineCandidatoSQLite}=require('../domain/sinalizacao-vitrine-candidato-sqlite');
const DIR=path.join(__dirname,'../laboratorio');
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function createVitrineCandidata({app,banco,catalogo,contas,intencoes,prePedidos,autorizarOperador}={}){
 if(process.env.NODE_ENV==='production')fail('VITRINE_LAB_NAO_HOMOLOGADA');
 if(!app?.get||!app?.post||!app?.patch||catalogo?.db!==banco||
    typeof contas?.sessao!=='function'||typeof prePedidos?.preparar!=='function'||
    typeof intencoes?.criar!=='function'||typeof autorizarOperador!=='function')
  fail('INTEGRACAO_VITRINE_INCOMPLETA');
 const sinalizacao=new SinalizacaoVitrineCandidatoSQLite({banco,catalogo});
 const sessao=req=>contas.sessao(req);
 const csrf=req=>contas.autorizarMutacao(req);
 const autorizarCliente=(req,res,next)=>{
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'VITRINE_NAO_HOMOLOGADA'});
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  req.titularVitrine=s.titularId;next();
 };
 // Não altera HTML nem CSS do site comercial. URLs só da cópia de teste.
 const original=fs.readFileSync(path.join(DIR,'loja-cliente-demo.html'),'utf8');
 const html=original
  .replace('href="/escritorio"','href="/staging/cliente"')
  .replace('href="/laboratorio/loja.css"','href="/staging/assets/loja-aprovada.css"')
  .replace('src="/laboratorio/educacao-carrinho.js"',
   'src="/staging/assets/educacao-carrinho.js"')
  .replace('src="/laboratorio/loja.js"','src="/staging/assets/loja-aprovada.js"')
  .replace('<main class="loja-loop">',
   '<main class="loja-loop"><p class="akitemm-estado">PRÉVIA LOCAL: sem pagamentos, posições, bônus, entregas ou giros reais. As cores são demonstrativas.</p>');
 if(original===html||html.includes('src="/laboratorio/loja.js"'))
  fail('MARCADOR_HTML_VITRINE_DESATUALIZADO');
 const origemJs=fs.readFileSync(path.join(DIR,'loja-cliente-demo.js'),'utf8');
 const ant="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},";
 const novo="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante',\n   'X-Checkout-Csrf':csrfCandidato||'',...(caminho==='loja/pedidos'?{\n   'Idempotency-Key':chavePedidoCandidato||(chavePedidoCandidato='vitrine-'+crypto.randomUUID())}:{})},";
 const marcador="adicional.textContent=(p.eventoTitulo||'Evento')+' · De '+(p.dataInicio||'—')+' até '+(p.dataFim||'—')+' · '+p.posicoesPorPedidoLoop+' posições';";
 if(!origemJs.includes(ant)||!origemJs.includes(marcador)||
    !origemJs.includes('const catalogo=[],carrinho=new Map();')||
    !origemJs.includes('const data=await response.json();')||
    !origemJs.includes('const especial=!!p.eventoId&&p.posicoesPorPedidoLoop>1;'))
  fail('CONTRATO_JS_VITRINE_MUDOU_REVISAR_ADAPTADOR');
 const js=origemJs
  .replace("fetch('/api/laboratorio/participante/'+caminho,{",
   "fetch('/staging/vitrine/'+caminho,{")
  .replace('const catalogo=[],carrinho=new Map();',
   'const catalogo=[],carrinho=new Map();let csrfCandidato=null,chavePedidoCandidato=null;')
  .replace(ant,novo)
  .replace('const data=await response.json();',
   "const data=await response.json();\n  if(caminho==='minha-conta'&&response.ok)csrfCandidato=data.csrf||null;\n  if(caminho==='loja/pedidos'&&(response.ok||[400,409].includes(response.status)))chavePedidoCandidato=null;")
  .replace('const especial=!!p.eventoId&&p.posicoesPorPedidoLoop>1;',
   "const especial=p.classeVisual==='EVENTO';")
  .replace(marcador,
   "adicional.textContent='Evento visual de laboratório · sem posições ou benefícios reais';");
 app.get('/staging/loja',(req,res)=>{
  if(!sessao(req))return res.redirect(302,'/staging/cliente');
  return res.type('html').send(html);
 });
 app.get('/staging/assets/loja-aprovada.css',(_req,res)=>
  res.type('css').sendFile(path.join(DIR,'loja-cliente-demo.css')));
 app.get('/staging/assets/educacao-carrinho.js',(_req,res)=>
  res.type('js').sendFile(path.join(DIR,'educacao-carrinho-loop-v6.js')));
 app.get('/staging/assets/loja-aprovada.js',(_req,res)=>
  res.type('js').send(js));
 app.get('/staging/vitrine/minha-conta',autorizarCliente,(req,res)=>{
  const p=contas.perfil(req.titularVitrine);
  return res.json({perfil:{nome:p.nome,temFoto:false},
   conta:{nick:p.nick},csrf:sessao(req).csrf,laboratorio:true});
 });
 app.get('/staging/vitrine/loja/catalogo',autorizarCliente,
  async(req,res)=>{
   try{
    const lista=(await catalogo.listar()).filter(p=>p.estado==='PUBLICADO');
    return res.json({produtos:lista.map(p=>sinalizacao.decorar(p)),
     referenciaLoopCentavos:25000,conviteLoopCheckoutAtivo:false,
     laboratorio:true,posicoesReais:0});
   }catch{return res.status(503).json({erro:'VITRINE_INDISPONIVEL'});}
  });
 app.get('/staging/vitrine/loja/pedidos',autorizarCliente,(req,res)=>{
  try{
   return res.json({pedidos:prePedidos.listar({
    titularId:req.titularVitrine
   }).map(p=>({
    pedidoId:p.prepedidoId,prepedidoId:p.prepedidoId,itens:p.itens,
    totalCentavos:p.totalCentavos,
    situacaoPagamentoFicticio:'AGUARDANDO_FICTICIO',
    posicaoCriada:false,vendaSomenteLoja:true,semCompraReal:true
   })),laboratorio:true,pagamentoReal:false});
  }catch{return res.status(503).json({erro:'PEDIDOS_INDISPONIVEIS'});}
 });
 app.post('/staging/vitrine/loja/pedidos',autorizarCliente,
  async(req,res)=>{
   if(req.get('x-loop-lab')!=='participante'||!csrf(req))
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
      typeof req.body!=='object'||Object.keys(req.body).some(k=>k!=='itens'))
    return res.status(400).json({erro:'CORPO_PEDIDO_INVALIDO'});
   const key=req.get('idempotency-key');
   if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    return res.status(400).json({erro:'CHAVE_IDEMPOTENCIA_OBRIGATORIA'});
   try{
    const entrada={itens:entradaValida(req.body).map(x=>({
     produtoId:x.produtoId,quantidade:x.quantidade
    }))};
    let intent=intencoes.consultarPorChave({
     titularId:req.titularVitrine,chaveIdempotencia:key,entrada});
    if(!intent){
     const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
     intent=intencoes.criar({
      titularId:req.titularVitrine,chaveIdempotencia:key,
      entrada,cotacao
     }).intencao;
    }
    const r=await prePedidos.preparar({
     titularId:req.titularVitrine,rascunhoId:intent.pedidoId,
     repositorioCatalogo:catalogo});
    return res.status(r.repetido?200:201).json({
     pedido:{pedidoId:r.prepedido.prepedidoId,
      totalCentavos:r.prepedido.totalCentavos,participarLoop:false,
      posicoesReais:0},repetido:r.repetido,pagamentoReal:false,
     posicoesCriadas:0,semCompraReal:true});
   }catch(e){
    return res.status(['CHAVE_IDEMPOTENCIA_CONFLITANTE',
     'CATALOGO_ALTERADO_REFAZER_COTACAO'].includes(e.codigo)?409:
     e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO'?404:400)
     .json({erro:e.codigo||'PEDIDO_INVALIDO',pagamentoReal:false});
   }
  });
 app.get('/staging/vitrine/loja/avaliacoes/pendentes',
  autorizarCliente,(_req,res)=>res.json({itens:[]}));
 app.get('/staging/vitrine/loja/entrega',
  autorizarCliente,(_req,res)=>res.json({entrega:null,semEntregaReal:true}));
 app.post('/staging/vitrine/loja/entrega',
  autorizarCliente,(_req,res)=>res.status(409).json({erro:'ENTREGA_NAO_HOMOLOGADA'}));
 app.get('/staging/vitrine/meus-links',autorizarCliente,
  (_req,res)=>res.json({ativo:false,linkLoja:null,apelido:null}));
 app.get('/staging/vitrine/loja/config',autorizarCliente,
  (_req,res)=>res.json({config:{banners:[],redes:{},informacoes:{
   suporte:'Apenas prévia de laboratório; atendimento comercial indisponível.'
  }}}));
 app.post('/staging/vitrine/loja/avaliacoes',
  autorizarCliente,(_req,res)=>res.status(403).json({erro:'AVALIACOES_NAO_HOMOLOGADAS'}));
 app.get('/staging/escritorio-unificado/sinalizacao/:id',
  autorizarOperador,(req,res)=>{
   try{return res.json(sinalizacao.consultar(req.params.id));}
   catch(e){return res.status(400).json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 app.patch('/staging/escritorio-unificado/sinalizacao/:id',
  autorizarOperador,async(req,res)=>{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   try{return res.json(await sinalizacao.atualizar(req.params.id,req.body));}
   catch(e){return res.status(e.codigo==='CONFLITO_REVISAO'?409:
    e.codigo==='PRODUTO_NAO_ENCONTRADO'?404:400)
    .json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 app.get('/staging/escritorio-unificado/sinalizacao/:id/historico',
  autorizarOperador,(req,res)=>{
   try{return res.json({historico:sinalizacao.historico(req.params.id)});}
   catch(e){return res.status(400).json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 return sinalizacao;
}
module.exports={createVitrineCandidata};
