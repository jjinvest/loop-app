'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {projetarCaixaPrelancamentoV6}=require('../domain/projetar-caixa-prelancamento-v6');

function criarRouterCircuitBreakV6Demo({segredo,controle,ponteControle=null,programador=null,retornoSaqueCentroDemo=null,travaFilaA=null}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/circuit-break-v6-demo/trava-fila-a',(_req,res)=>{
    if(!travaFilaA)return res.status(501).json({erro:'TRAVA_INDISPONIVEL'});
    return res.json({configuracao:travaFilaA.consultar(),historico:travaFilaA.historico()});
  });
  router.post('/circuit-break-v6-demo/trava-fila-a',(req,res)=>{
    if(!travaFilaA)return res.status(501).json({erro:'TRAVA_INDISPONIVEL'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const p=req.body;
    if(!p||typeof p!=='object'||Array.isArray(p)||
      Object.keys(p).sort().join(',')!=='motivo,revisaoEsperada,vagaLiberacao')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json({configuracao:travaFilaA.alterar(p),historico:travaFilaA.historico()});}
    catch(e){if(e.codigo)return res.status(e.codigo==='CONFLITO_REVISAO'?409:400).json({erro:e.codigo});throw e;}
  });
  router.get('/circuit-break-v6-demo',(_req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    return res.json(controle.resumo());
  });
  router.get('/circuit-break-v6-demo/historico',(req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    const limite=req.query.limite===undefined?25:Number(req.query.limite);
    if(Object.keys(req.query).some(k=>k!=='limite')||
      !Number.isSafeInteger(limite)||limite<1||limite>100)
      return res.status(400).json({erro:'LIMITE_INVALIDO'});
    return res.json({modo:'SOMENTE_LABORATORIO',historico:controle.historico({limite})});
  });
  router.post('/circuit-break-v6-demo/projecao-prelancamento',(req,res)=>{
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const p=req.body;
    if(!p||typeof p!=='object'||Array.isArray(p)||
       Object.keys(p).sort().join(',')!=='compras,liquidoPorCompraCentavos')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json(projetarCaixaPrelancamentoV6(p));}
    catch(e){
      if(/INVALIDO|INVALIDAS|INVALIDO/.test(e.message))
        return res.status(400).json({erro:'PROJECAO_INVALIDA'});
      throw e;
    }
  });
  router.get('/circuit-break-v6-demo/programacoes',(_req,res)=>{
    if(!programador)return res.status(501).json({erro:'PROGRAMADOR_INDISPONIVEL'});
    return res.json(programador.listar());
  });
  router.post('/circuit-break-v6-demo/programacoes',(req,res)=>{
    if(!programador)return res.status(501).json({erro:'PROGRAMADOR_INDISPONIVEL'});
    const p=req.body;
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    if(!p||typeof p!=='object'||Array.isArray(p)||
       Object.keys(p).sort().join(',')!=='agendaId,fimEm,inicioEm,modo,quantidade')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.status(201).json(programador.criar(p));}
    catch(e){
      if(e.codigo)return res.status([
        'AGENDA_ID_REUTILIZADA','LIMITE_AGENDAMENTO_DIARIO'
      ].includes(e.codigo)?409:400).json({erro:e.codigo});
      throw e;
    }
  });
  router.post('/circuit-break-v6-demo/programacoes/:id/cancelar',(req,res)=>{
    if(!programador)return res.status(501).json({erro:'PROGRAMADOR_INDISPONIVEL'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length!==0)
      return res.status(400).json({erro:'SEM_PARAMETROS'});
    try{return res.json(programador.cancelar(req.params.id));}
    catch(e){
      if(e.codigo)return res.status(e.codigo==='AGENDA_INEXISTENTE_OU_FINALIZADA'?409:400)
        .json({erro:e.codigo});
      throw e;
    }
  });
  // Somente administrador pode injetar resposta SIMULADA de banco.
  // O participante nunca confirma o retorno ou o sucesso de seu proprio Pix.
  router.post('/circuit-break-v6-demo/saque-centro-v6-demo/eventos',(req,res)=>{
    if(!retornoSaqueCentroDemo)
      return res.status(501).json({erro:'SAQUE_CENTRO_DEMO_INDISPONIVEL'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       !['eventoId,solicitacaoId,tipo',
         'eventoId,motivo,solicitacaoId,tipo'].includes(Object.keys(body).sort().join(',')))
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json(retornoSaqueCentroDemo.evento(body));}
    catch(e){
      if(!e.codigo)throw e;
      return res.status(['CONFLITO_IDEMPOTENCIA','TRANSICAO_INVALIDA',
        'PEDIDO_NAO_ENCONTRADO'].includes(e.codigo)?409:400).json({erro:e.codigo});
    }
  });
  router.get('/circuit-break-v6-demo/ponte/provisoes',(_req,res)=>{
    if(!ponteControle||!ponteControle.livro)
      return res.status(501).json({erro:'LIVRO_PROVISOES_INDISPONIVEL'});
    return res.json(ponteControle.livro.resumo());
  });
  function responderPre(res,acao){
    if(!ponteControle?.preLancamento)return res.status(501).json({erro:'PRE_LANCAMENTO_INDISPONIVEL'});
    try{return res.json(acao());}
    catch(e){
      if(!e.codigo)throw e;
      return res.status([
        'PRE_LANCAMENTO_JA_CONFIGURADO','START_JA_EXECUTADO',
        'PRE_LANCAMENTO_APOS_GIROS','LIQUIDO_SUPERA_VENDA',
        'COMPRA_DIVERGENTE_CAIXA','CONCILIACAO_COFRES_DIVERGENTE'
      ].includes(e.codigo)?409:400).json({erro:e.codigo});
    }
  }
  router.get('/circuit-break-v6-demo/ponte/gestao-proprietario',(_req,res)=>{
    if(!ponteControle?.gestaoProprietario)
      return res.status(501).json({erro:'GESTAO_PROPRIETARIO_INDISPONIVEL'});
    return res.json(ponteControle.gestaoProprietario.listar());
  });
  router.post('/circuit-break-v6-demo/ponte/gestao-proprietario',(req,res)=>{
    if(!ponteControle?.gestaoProprietario)
      return res.status(501).json({erro:'GESTAO_PROPRIETARIO_INDISPONIVEL'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!==
         'cofreOrigem,destino,justificativa,movimentoId,valorCentavos')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.status(201).json(ponteControle.gestaoProprietario.solicitar(body));}
    catch(e){
      if(!e.codigo)throw e;
      return res.status(['CONFLITO_IDEMPOTENCIA','CONCILIACAO_COFRES_DIVERGENTE',
        'SALDO_DEMONSTRATIVO_INSUFICIENTE','COFRES_NAO_CONFIGURADOS']
        .includes(e.codigo)?409:400).json({erro:e.codigo});
    }
  });
  router.get('/circuit-break-v6-demo/ponte/conciliacao',(_req,res)=>{
    if(!ponteControle?.conciliacao)
      return res.status(501).json({erro:'CONCILIACAO_COFRES_INDISPONIVEL'});
    return res.json(ponteControle.conciliacao.conferir());
  });
  router.get('/circuit-break-v6-demo/ponte/prelancamento',(_req,res)=>
    responderPre(res,()=>ponteControle.preLancamento.resumo()));
  router.post('/circuit-break-v6-demo/ponte/prelancamento/configurar',(req,res)=>{
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).join(',')!=='valorFixoLoopCentavos')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    return responderPre(res,()=>ponteControle.preLancamento.habilitar(req.body));
  });
  router.post('/circuit-break-v6-demo/ponte/prelancamento/aporte-ficticio',(req,res)=>{
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!=='aporteId,pedidoId,valorLoopCentavos')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    return responderPre(res,()=>({
      registro:ponteControle.preLancamento.registrarAporteFicticio(body),
      caixa:ponteControle.preLancamento.resumo()
    }));
  });
  router.post('/circuit-break-v6-demo/ponte/prelancamento/sincronizar',(req,res)=>{
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length!==0)return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    return responderPre(res,()=>({
      sincronizacao:ponteControle.preLancamento.sincronizar(),
      caixa:ponteControle.preLancamento.resumo()
    }));
  });
  router.post('/circuit-break-v6-demo/ponte/prelancamento/start',(req,res)=>{
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length!==0)return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    return responderPre(res,()=>ponteControle.preLancamento.iniciar());
  });
  router.get('/circuit-break-v6-demo/ponte',(_req,res)=>{
    if(!ponteControle)return res.status(501).json({erro:'PONTE_INDISPONIVEL'});
    return res.json(ponteControle.resumo());
  });
  router.post('/circuit-break-v6-demo/ponte/liberar',(req,res)=>{
    if(!ponteControle)return res.status(501).json({erro:'PONTE_INDISPONIVEL'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!=='comandoId,quantidade,revisaoEsperada')
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json(ponteControle.liberar(body));}
    catch(e){
      if(e.codigo){
        return res.status([
          'CONFLITO_COMANDO_ID','CONFLITO_REVISAO','CATRACA_PAUSADA',
          'LIMITE_DIARIO_ATINGIDO','COMPRAS_CONFIRMADAS_INSUFICIENTES',
          'TABULEIRO_SEM_REPOSICAO','CICLO_PARCIAL_NAO_GERENCIADO',
          'CONCILIACAO_COFRES_DIVERGENTE','SALDO_CENTRAL_SIMULADO_INSUFICIENTE','AGUARDANDO_START'
        ].includes(e.codigo)?409:400).json({erro:e.codigo});
      }
      throw e;
    }
  });
  router.post('/circuit-break-v6-demo/comandos',(req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['tipo','comandoId','revisaoEsperada','valor'].includes(k))||
      !['tipo','comandoId','revisaoEsperada'].every(k=>Object.hasOwn(body,k)))
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{
      return res.json(controle.executar(body));
    }catch(e){
      if(e.codigo){
        const codigo=e.codigo;
        return res.status(['CONFLITO_REVISAO','CONFLITO_COMANDO_ID','CATRACA_PAUSADA',
          'LIMITE_DIARIO_ATINGIDO','COMPRAS_FICTICIAS_INSUFICIENTES','CENARIO_COMPLETO']
          .includes(codigo)?409:400).json({erro:codigo});
      }
      throw e;
    }
  });
  return router;
}
module.exports={criarRouterCircuitBreakV6Demo};
