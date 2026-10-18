'use strict';

// API de acesso individual SOMENTE no servidor de laboratorio local.
// Nenhuma rota recebe contaId do usuario. A identidade vem da sessao.
const express=require('express');
const {randomUUID}=require('node:crypto');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {SessoesParticipanteDemo,DURACAO}=require('../domain/sessoes-participante-demo');
const {EscritorioIndividualDemo}=require('../domain/escritorio-individual-demo');
const {montarHistoricoLojaDemo}=require('../domain/historico-loja-escritorio-demo');
const {extratoCentrosPrevistosV6}=require('../domain/extrato-creditos-previstos-v6-demo');
const COOKIE='loop_participante_demo';
const CAMINHO='/api/laboratorio/participante';
function lerCookie(req){
 const raw=req.get('cookie')||'';
 if(raw.length>4096)return null;
 const achados=raw.split(';').map(p=>p.trim())
  .filter(p=>p.startsWith(COOKIE+'='));
 if(achados.length!==1)return null;
 return achados[0].slice(COOKIE.length+1);
}
function setCookie(res,token,maxAge){
 // Prototipo em HTTP/localhost. Nao serve para deploy publico,
 // que exigira HTTPS e flag Secure.
 res.append('Set-Cookie',COOKIE+'='+token+'; HttpOnly; SameSite=Strict; Path='+CAMINHO+
  '; Max-Age='+maxAge);
}
function criarRouterParticipanteDemo({contas,ponte,sessoes=null,adesoes=null,carrinhos=null,saques=null,obterLivroProvisoesV6=null,obterRetornoSaqueCentroDemo=null}={}){
 if(!contas||!ponte)throw new TypeError('Cadastro e ponte do laboratorio obrigatorios');
 const gerenciador=sessoes||new SessoesParticipanteDemo({contas});
 const escritorio=new EscritorioIndividualDemo({contas,ponte});
 const router=express.Router();
 router.use((req,res,next)=>{
  if(process.env.NODE_ENV==='production'||!localSeguro(req)){
   return res.status(403).json({erro:'LABORATORIO_LOCAL_APENAS'});
  }
  res.set('Cache-Control','no-store');
  res.set('Pragma','no-cache');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 router.use((req,res,next)=>{
  if(req.method!=='POST')return next();
  // Uma pagina externa nao pode enviar cabecalho customizado com
  // cookies sem preflight CORS, nao habilitado no laboratorio.
  // SameSite=Strict e verificacao de Origin sao protecoes adicionais.
  const fetchSite=req.get('sec-fetch-site');
  if(req.get('x-loop-lab')!=='participante'||
    (fetchSite&&!['same-origin','none'].includes(fetchSite))){
   return res.status(403).json({erro:'OPERACAO_LOCAL_INDEVIDA'});
  }
  next();
 });
 router.post('/entrar',(req,res,next)=>{
  if(!req.is('application/json')){
   return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).sort().join(',')!=='nome,senha'){
   return res.status(400).json({erro:'CAMPOS_LOGIN_INVALIDOS'});
  }
  try{
   const sessao=gerenciador.entrar({
    nome:req.body.nome,senha:req.body.senha,origem:req.socket?.remoteAddress
   });
   const anterior=lerCookie(req);
   if(anterior&&anterior!==sessao.token){
    // Revoga a sessao anterior ao rotacionar login no mesmo navegador.
    gerenciador.sair(anterior,{motivo:'SESSAO_REVOGADA'});
   }
   setCookie(res,sessao.token,sessao.duracaoSegundos);
   return res.json({modo:'SESSAO_FICTICIA_LOCAL',autenticadoNoTeste:true,
    expiraEmSegundos:DURACAO/1000,
    clienteReal:false,pagamentoReal:false});
  }catch(erro){
   if(!['LIMITE_LOGIN_DE_TESTE','LOGIN_DE_TESTE_INVALIDO'].includes(erro.codigo)){
    return next(erro);
   }
   return res.status(erro.codigo==='LIMITE_LOGIN_DE_TESTE'?429:401)
    .json({erro:erro.codigo==='LIMITE_LOGIN_DE_TESTE'?
      'LIMITE_LOGIN_DE_TESTE':'CREDENCIAIS_INVALIDAS'});
  }
 });
 router.post('/sair',(req,res,next)=>{
  if(!req.is('application/json')){
   return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  }
  try{
   gerenciador.sair(lerCookie(req));
   setCookie(res,'',0);
   return res.json({sessaoEncerradaNoTeste:true});
  }catch(erro){return next(erro);}
 });
 router.post('/desistir-vaga-6',(req,res,next)=>{
  if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).sort().join(',')!=='aceiteExpresso,posicaoId')
    return res.status(400).json({erro:'CAMPOS_DESISTENCIA_INVALIDOS'});
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json(ponte.desistirDaVaga6Demo({...body,contaId}));
  }catch(e){
   if(['ACEITE_DESISTENCIA_OBRIGATORIO','POSICAO_FORA_DA_VAGA_6',
       'POSICAO_NAO_PERTENCE_A_CONTA'].includes(e.codigo))
    return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 router.post('/atribuir-indicacao',(req,res,next)=>{
  if(!ponte.atribuicaoManualPorPosicao)
   return res.status(501).json({erro:'ATRIBUICAO_INDISPONIVEL'});
  if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='convidadoId,posicaoId')
   return res.status(400).json({erro:'CAMPOS_ATRIBUICAO_INVALIDOS'});
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json(ponte.atribuirIndicacao({...body,contaId}));
  }catch(e){
   if(e.codigo)return res.status(
    ['DADOS_ATRIBUICAO_INVALIDOS'].includes(e.codigo)?400:409
   ).json({erro:e.codigo});
   return next(e);
  }
 });
 router.post('/ativar-posicoes',(req,res,next)=>{
  if(!adesoes)return res.status(501).json({erro:'ATIVACAO_NAO_CONFIGURADA'});
  if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
   !(ponte.atribuicaoManualPorPosicao?
     ['posicaoId','aceitaTermos,cpfFicticio,posicaoId,versaoTermos'].includes(Object.keys(body).sort().join(',')):
     Object.keys(body).sort().join(',')==='aceitaTermos,cpfFicticio,versaoTermos')){
   return res.status(400).json({erro:'CAMPOS_ATIVACAO_INVALIDOS'});
  }
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json(adesoes.ativar({...body,contaId}));
  }catch(err){
   if(['ACEITE_TERMOS_OBRIGATORIO','CPF_FICTICIO_INVALIDO','CONTA_INVALIDA','POSICAO_INVALIDA'].includes(err.codigo))
    return res.status(400).json({erro:err.codigo});
   if(['CPF_JA_FIXADO_NA_CONTA','CPF_JA_ASSOCIADO','COMPRA_INICIAL_OBRIGATORIA','ADESAO_JA_REALIZADA','POSICAO_NAO_PENDENTE'].includes(err.codigo))
    return res.status(409).json({erro:err.codigo});
   return next(err);
  }
 });
  // Cenario do centro: saldo AQUI e referencia ficticia, nunca credito sacavel.
  router.get('/saque-centro-v6-demo',(req,res,next)=>{
   const servico=obterRetornoSaqueCentroDemo?.();
   if(!servico)return res.status(501).json({erro:'SAQUE_CENTRO_TESTE_INDISPONIVEL'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(servico.consultar(contaId));
   }catch(e){return next(e);}
  });
  router.post('/saque-centro-v6-demo',(req,res,next)=>{
   const servico=obterRetornoSaqueCentroDemo?.();
   if(!servico)return res.status(501).json({erro:'SAQUE_CENTRO_TESTE_INDISPONIVEL'});
   if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).sort().join(',')!=='solicitacaoId,valorCentavos')
     return res.status(400).json({erro:'CAMPOS_SAQUE_CENTRO_INVALIDOS'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.status(201).json(servico.solicitar({...body,contaId}));
   }catch(e){
    if(e.codigo)return res.status(['CONFLITO_IDEMPOTENCIA',
     'REFERENCIA_CENTRO_TESTE_INSUFICIENTE'].includes(e.codigo)?409:400)
      .json({erro:e.codigo});
    return next(e);
   }
  });
  // Controle somente ficticio de solicitacoes; nunca aceita saldo do navegador.
  router.get('/saques-simulados',(req,res,next)=>{
   if(!saques)return res.status(501).json({erro:'SAQUES_SIMULADOS_NAO_CONFIGURADOS'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(saques.consultar(contaId));
   }catch(e){return next(e);}
  });
  router.post('/saques-simulados',(req,res,next)=>{
   if(!saques)return res.status(501).json({erro:'SAQUES_SIMULADOS_NAO_CONFIGURADOS'});
   if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='solicitacaoId,tipo,valorSolicitadoCentavos')
    return res.status(400).json({erro:'CAMPOS_SAQUE_INVALIDOS'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(saques.registrar({...body,contaId}));
   }catch(e){
    if(['SAQUE_INVALIDO','MINIMO_SAQUE_25_REAIS','TIPO_SAQUE_INVALIDO',
     'SOLICITACAO_ID_INVALIDO'].includes(e.codigo))return res.status(400).json({erro:e.codigo});
    if(['CPF_E_TERMOS_OBRIGATORIOS','SALDO_SIMULADO_INSUFICIENTE',
     'SALDO_PARTICIPACAO_INDISPONIVEL','CONFLITO_IDEMPOTENCIA'].includes(e.codigo))
     return res.status(409).json({erro:e.codigo});
    return next(e);
   }
  });
  // Loja acessada pelo proprio titular. O navegador NAO informa o CPF,
  // conta, preco, pedidoId nem estado do pagamento. Apenas os itens.
  router.get('/meus-links',(req,res,next)=>{
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(ponte.linksComissoes.linkDaConta(contaId));
   }catch(e){return next(e);}
  });
  router.post('/meu-link',(req,res,next)=>{
   if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).join(',')!=='apelido')
    return res.status(400).json({erro:'APELIDO_INVALIDO'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(ponte.linksComissoes.personalizar({
     contaId,apelido:req.body.apelido
    }));
   }catch(e){
    if(e.codigo==='APELIDO_INVALIDO')return res.status(400).json({erro:e.codigo});
    return next(e);
   }
  });
  router.get('/loja/catalogo',(req,res,next)=>{
   if(!carrinhos)return res.status(501).json({erro:'LOJA_NAO_CONFIGURADA'});
   try{
    if(!gerenciador.identificar(lerCookie(req)))
     return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json({...carrinhos.opcoes(),
     referenciaLoopCentavos:ponte.configuracaoValor.atual().valorCentavos,
     pedidoFicticio:true,pagamentoReal:false});
   }catch(e){return next(e);}
  });
  router.get('/loja/pedidos',(req,res,next)=>{
   if(!carrinhos)return res.status(501).json({erro:'LOJA_NAO_CONFIGURADA'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    return res.json(carrinhos.listarDaConta(contaId));
   }catch(e){return next(e);}
  });
  router.get('/loja/pedidos/:pedidoId',(req,res,next)=>{
   if(!carrinhos)return res.status(501).json({erro:'LOJA_NAO_CONFIGURADA'});
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    const pedido=carrinhos.buscarDaConta(req.params.pedidoId,contaId);
    return pedido?res.json({pedido,semPagamentoReal:true}):
     res.status(404).json({erro:'PEDIDO_NAO_ENCONTRADO'});
   }catch(e){
    if(e.codigo==='INVALIDO')return res.status(404).json({erro:'PEDIDO_NAO_ENCONTRADO'});
    return next(e);
   }
  });
  router.post('/loja/pedidos',(req,res,next)=>{
   if(!carrinhos)return res.status(501).json({erro:'LOJA_NAO_CONFIGURADA'});
   if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).join(',')!=='itens'){
    return res.status(400).json({erro:'SOMENTE_ITENS_PERMITIDOS'});
   }
   try{
    const contaId=gerenciador.identificar(lerCookie(req));
    if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
    const pendentes=carrinhos.banco.prepare(`
     SELECT COUNT(*) AS total FROM admin_carrinho_loop_demo c
     WHERE c.conta_id=? AND NOT EXISTS (
      SELECT 1 FROM admin_carrinho_loop_eventos_demo e
      WHERE e.pedido_id=c.pedido_id
     )
    `).get(contaId).total;
    if(pendentes>=20)return res.status(409).json({erro:'LIMITE_PEDIDOS_PENDENTES_DE_TESTE'});
    const pedido=carrinhos.criar({
     pedidoId:'carrinho-'+randomUUID(),contaId,itens:req.body.itens
    });
    return res.status(201).json({
     pedido,aguardandoPagamentoFicticio:true,
     posicaoCriada:false,pagamentoReal:false
    });
   }catch(e){
    if(['INVALIDO','VALOR_INVALIDO'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    if(e.codigo==='PRODUTO_INVALIDO')return res.status(409).json({erro:e.codigo});
    if(['LIMITE_ATIVO','CONFLITO'].includes(e.codigo))
     return res.status(409).json({erro:e.codigo});
    return next(e);
   }
  });
  router.get('/minha-conta',(req,res,next)=>{
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   const visao=escritorio.consultar(contaId);
   if(!visao)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   const historicoLoja=carrinhos?montarHistoricoLojaDemo({
    visao,carrinhos:carrinhos.listarDaConta(contaId).pedidos
   }):null;
   return res.json({...visao,
    historicoLoja,
    saquesSimulados:saques?saques.consultar(contaId):null,
    creditosPrevistosV6:extratoCentrosPrevistosV6({ponte,contas,contaId}),
    provisoesAuditadasV6:obterLivroProvisoesV6?.()?.extrato(contaId)||null,
    simulacaoRetornoSaqueCentroV6:obterRetornoSaqueCentroDemo?.()?.consultar(contaId)||null,
    adesao:adesoes?adesoes.consultarConta(contaId):null});
  }catch(erro){return next(erro);}
 });
 return router;
}
module.exports={criarRouterParticipanteDemo,COOKIE,CAMINHO,lerCookie};
