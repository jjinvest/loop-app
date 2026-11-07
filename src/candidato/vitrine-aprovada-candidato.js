'use strict';
// Vitrine visual APROVADA servida no candidato LOCAL, não no servidor comercial.
// Código original de loja preservado; apenas a cópia de laboratório usa SQLite
// das mesmas contas, produtos, pré-pedidos e Escritórios.
const fs=require('node:fs'),path=require('node:path');
const {entradaValida,cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
const {SinalizacaoVitrineCandidatoSQLite}=require('../domain/sinalizacao-vitrine-candidato-sqlite');
const {CustosProdutoAdminCandidatoSQLite}=require('../domain/custos-produtos-admin-candidato-sqlite');
const {LivroLuzesFinanceirasCandidatoSQLite}=require('../domain/livro-luzes-financeiras-candidato-sqlite');
const {simularQualificacaoCandidato}=require('../domain/simulador-qualificacao-carrinho-candidato');
const {consultarPedido}=require('../domain/relatorio-homologacao-checkout-staging');
const DIR=path.join(__dirname,'../laboratorio');
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function createVitrineCandidata({app,banco,catalogo,contas,intencoes,prePedidos,autorizarOperador,novidades,enderecoEntrega,configLoja}={}){
 if(process.env.NODE_ENV==='production')fail('VITRINE_LAB_NAO_HOMOLOGADA');
 if(!app?.get||!app?.post||!app?.patch||catalogo?.db!==banco||
    typeof contas?.sessao!=='function'||typeof prePedidos?.preparar!=='function'||
    typeof intencoes?.criar!=='function'||typeof autorizarOperador!=='function'||
    novidades?.banco!==banco||enderecoEntrega?.banco!==banco||
    configLoja?.banco!==banco)
  fail('INTEGRACAO_VITRINE_INCOMPLETA');
 const sinalizacao=new SinalizacaoVitrineCandidatoSQLite({banco,catalogo});
 // Mesma base de checkout, catálogo, custos internos, fila e escritorio.
 const custosProduto=new CustosProdutoAdminCandidatoSQLite({banco,catalogo,sinalizacao});
 const livroLuzes=new LivroLuzesFinanceirasCandidatoSQLite({banco});
 sinalizacao.custosProduto=custosProduto;
 sinalizacao.livroLuzes=livroLuzes;
 // Todas as novas rotas de pré-pedido usam o mesmo registro transacional.
 prePedidos.definirFotografiaClassificacao(args=>{
  // Mesmo COMMIT do prepedido: classificação + endereço físico cifrado.
  const fotografia=sinalizacao.gravarFotografiaPrepedido(args);
  enderecoEntrega.vincularPrepedido(args);
  // Congela custos e referencia das posicoes no MESMO COMMIT do checkout.
  // Mudancas futuras do cadastro nao reescrevem pedidos antigos.
  livroLuzes.congelarCustosPedido({...args,fotografia});
  return fotografia;
 });
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
   '<main class="loja-loop"><p class="akitemm-estado">PRÉVIA LOCAL: sem pagamentos, posições, bônus, entregas ou giros reais. As cores são demonstrativas.</p>')
  .replace('<p id="orientacaoMinimoLoop" role="status"></p>',
   '<p id="orientacaoMinimoLoop" role="status"></p><p id="akitemmAnaliseQualificacao" role="status" class="akitemm-regra-referencia">Simulação sem benefícios financeiros; adicione itens para conferir.</p>');
 if(original===html||html.includes('src="/laboratorio/loja.js"'))
  fail('MARCADOR_HTML_VITRINE_DESATUALIZADO');
 const origemJs=fs.readFileSync(path.join(DIR,'loja-cliente-demo.js'),'utf8');
 const ant="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},";
 const novo="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante',\n   'X-Checkout-Csrf':csrfCandidato||'',...(caminho==='loja/pedidos'?{\n   'Idempotency-Key':chavePedidoCandidato||(chavePedidoCandidato='vitrine-'+crypto.randomUUID())}:{})},";
 const marcador="adicional.textContent=(p.eventoTitulo||'Evento')+' · De '+(p.dataInicio||'—')+' até '+(p.dataFim||'—')+' · '+p.posicoesPorPedidoLoop+' posições';";
 if(!origemJs.includes(ant)||!origemJs.includes(marcador)||
    !origemJs.includes('const catalogo=[],carrinho=new Map();')||
    !origemJs.includes('const data=await response.json();')||
    !origemJs.includes("const classe=corDoProduto(p),especial=classe==='ROXO';"))
  fail('CONTRATO_JS_VITRINE_MUDOU_REVISAR_ADAPTADOR');
 const js=origemJs
  .replace("fetch('/api/laboratorio/participante/'+caminho,{",
   "fetch('/staging/vitrine/'+caminho,{")
  .replace('const catalogo=[],carrinho=new Map();',
   'const catalogo=[],carrinho=new Map();let csrfCandidato=null,chavePedidoCandidato=null;')
  .replace(ant,novo)
  .replace('const data=await response.json();',
   "const data=await response.json();\n  if(caminho==='minha-conta'&&response.ok){csrfCandidato=data.csrf||null;atualizarPreviaQualificacao();}\n  if(caminho==='loja/pedidos'&&(response.ok||[400,409].includes(response.status)))chavePedidoCandidato=null;")
  .replace('function atualizarCarrinho(){',"let seqPrevia=0;\n async function atualizarPreviaQualificacao(){\n  const id=++seqPrevia;\n  const campo=el('akitemmAnaliseQualificacao');\n  if(!campo)return;\n  if(!carrinho.size){campo.textContent='Prévia de laboratório. Adicione produtos; nenhuma posição será criada.';return;}\n  if(!csrfCandidato){campo.textContent='Conferindo sessão para simulação...';return;}\n  try{\n   const response=await fetch('/staging/vitrine/simular-qualificacao',{\n    method:'POST',credentials:'same-origin',cache:'no-store',\n    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante',\n     'X-Checkout-Csrf':csrfCandidato},\n    body:JSON.stringify({itens:[...carrinho].map(([produtoId,quantidade])=>({produtoId,quantidade}))})\n   });\n   const dados=await response.json();\n   if(id!==seqPrevia)return;\n   campo.textContent=response.ok?dados.mensagem:\n    'Prévia não disponível: '+(dados.erro||response.status)+'. Nenhum benefício foi criado.';\n  }catch{if(id===seqPrevia)campo.textContent='Prévia temporariamente indisponível. Nenhum benefício foi criado.';}\n }\n function atualizarCarrinho(){atualizarPreviaQualificacao();")
  .replace('if(quantidade<100)','if(quantidade<50)')
  .replace('if(qtd>=100)','if(qtd>=50)')
  .replace('Máximo de 100 unidades por produto.','Máximo de 50 unidades por produto neste laboratório.')
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
 // Mesmo site original. Publicações opcionais da seção Novidades.
 app.get('/staging/vitrine/novidades',autorizarCliente,(_req,res)=>{
  try{return res.json({itens:novidades.listar({publicadas:true}),
   semBeneficioAutomatico:true});}
  catch(e){return res.status(503).json({erro:e.codigo||'NOVIDADES_INDISPONIVEIS'});}
 });
 app.get('/staging/vitrine/novidades/:id/imagem',autorizarCliente,(req,res)=>{
  try{
   const r=novidades.imagem({id:Number(req.params.id),publicada:true});
   return res.type(r.mime).set('Cache-Control','private, no-store').send(r.bytes);
  }catch(e){return res.status(404).json({erro:'NOVIDADE_IMAGEM_INDISPONIVEL'});}
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
 const simular=async(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  try{return res.json(await simularQualificacaoCandidato({
   entrada:req.body,catalogo,sinalizacao}));
  }catch(e){return res.status(e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO'?404:400)
   .json({erro:e.codigo||'SIMULACAO_INVALIDA'});}
 };
 app.post('/staging/vitrine/simular-qualificacao',autorizarCliente,(req,res,next)=>{
  if(req.get('x-loop-lab')!=='participante'||!csrf(req))
   return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
  next();
 },simular);
 app.post('/staging/escritorio-unificado/simular-qualificacao',
  autorizarOperador,simular);
 app.get('/staging/vitrine/loja/pedidos',autorizarCliente,(req,res)=>{
  try{
   const titularId=req.titularVitrine;
   const pedidos=prePedidos.listar({titularId}).map(p=>{
    // Mesmo estado SQLite lido pelo Escritório e pelo administrador.
    // Leitura não chama o Asaas nem gera posição, bônus ou pagamento.
    const estado=consultarPedido({banco,prepedidoId:p.prepedidoId,titularId});
    if(!estado)fail('PREPEDIDO_SEM_ESTADO_PSP');
    return {
     pedidoId:p.prepedidoId,prepedidoId:p.prepedidoId,itens:p.itens,
     totalCentavos:p.totalCentavos,
     estadoOperacional:estado.estadoOperacional,
     estadoSandbox:estado.estadoSandbox,
     conferenciaPSPConcluida:estado.conferenciaPSPConcluida,
     exigeRevisaoManual:estado.exigeRevisaoManual,
     ultimoStatusPSP:estado.ultimoStatusPSP,
     ultimoGETPSPPersistidoEm:estado.ultimoGETPSPPersistidoEm,
     posicoesPendentesFicticias:estado.posicoesPendentesFicticias,
     posicoesMotorEnsaio:estado.posicoesMotorEnsaio,
     consultaPSPExecutadaNestaLeitura:false,
     posicaoCriada:false,vendaSomenteLoja:true,semCompraReal:true
    };
   });
   return res.json({pedidos,laboratorio:true,pagamentoReal:false});
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
 app.get('/staging/vitrine/loja/entrega',autorizarCliente,(req,res)=>{
  try{return res.json(enderecoEntrega.consultar(req.titularVitrine));}
  catch{return res.status(503).json({erro:'ENDERECO_CONSULTA_INDISPONIVEL'});}
 });
 app.post('/staging/vitrine/loja/entrega',autorizarCliente,(req,res)=>{
  if(req.get('x-loop-lab')!=='participante'||!csrf(req))
   return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  try{return res.json(enderecoEntrega.salvar(req.titularVitrine,req.body));}
  catch(e){return res.status(400).json({erro:e.codigo||'ENDERECO_INVALIDO'});}
 });
 app.get('/staging/vitrine/meus-links',autorizarCliente,(req,res)=>{
  // Fonte unica de identidade: o link da loja usa o mesmo nick do Escritório.
  // Só atribui cadastros de LAB pelo gateway assinado, nunca bonificação real.
  try{
   const perfil=contas.perfil(req.titularVitrine);
   return res.json({ativo:true,linkLoja:'/loja/'+perfil.nick,
    linkEscritorio:'/escritorio/'+perfil.nick,apelido:perfil.nick,
    apenasEnsaio:true,indicadoQualificado:false,semComissaoReal:true});
  }catch{return res.status(503).json({erro:'LINK_INDICACAO_INDISPONIVEL'});}
 });
 app.get('/staging/vitrine/loja/config',autorizarCliente,(_req,res)=>{
  try{
   const c=configLoja.consultarComRevisao();
   return res.json({config:c.config,revisao:c.revisao,
    apenasEnsaio:true,semOfertasComerciais:true});
  }catch{return res.status(503).json({erro:'CONFIG_LOJA_INDISPONIVEL'});}
 });
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
