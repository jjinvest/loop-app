'use strict';

// APIs de cadastro e conferencia de senha exclusivamente em laboratorio local
// protegido por token de administrador. Nenhuma rota de autenticacao publica.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function corpoEstrito(corpo,camposObrigatorios,camposOpcionais=[]){
 if(!corpo||typeof corpo!=='object'||Array.isArray(corpo))return false;
 const permitido=new Set([...camposObrigatorios,...camposOpcionais]);
 const recebido=Object.keys(corpo);
 return recebido.every(k=>permitido.has(k))&&
  camposObrigatorios.every(k=>Object.hasOwn(corpo,k));
}
function erroHttp(erro,res,next){
 if(erro.codigo==='INVALIDO')return res.status(400).json({erro:'CADASTRO_DE_TESTE_INVALIDO'});
 if(erro.codigo==='CONFLITO')return res.status(409).json({erro:'CONTA_FICTICIA_DUPLICADA'});
 if(erro.codigo==='CONVITE_INVALIDO')return res.status(422).json({erro:'CONVITE_DE_TESTE_NAO_ENCONTRADO'});
 if(erro.codigo==='CREDENCIAIS_INVALIDAS')return res.status(401).json({erro:'LOGIN_DE_TESTE_INVALIDO'});
 return next(erro);
}
function criarRouterContasParticipantesDemo({segredo,contas}={}){
 if(!contas||typeof contas.cadastrar!=='function'||typeof contas.autenticar!=='function'){
  throw new TypeError('Contas demonstrativas obrigatorias');
 }
 const router=express.Router();
 router.use(criarAutorizacao({segredo}));
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.get('/contas-participantes-demo',(_req,res)=>res.json(contas.listar()));
 router.get('/contas-participantes-demo/convites/:codigo',(req,res,next)=>{
  try{
   const convite=contas.consultarConvite(req.params.codigo);
   return convite?res.json(convite):res.status(404).json({erro:'CONVITE_DE_TESTE_NAO_ENCONTRADO'});
  }catch(erro){return erroHttp(erro,res,next);}
 });
 router.get('/contas-participantes-demo/:id/historico',(req,res,next)=>{
  try{
   const historico=contas.historico(req.params.id);
   return historico?res.json(historico):res.status(404).json({erro:'CONTA_FICTICIA_NAO_ENCONTRADA'});
  }catch(erro){return erroHttp(erro,res,next);}
 });
 router.get('/contas-participantes-demo/:id',(req,res,next)=>{
  try{
   const conta=contas.buscar(req.params.id);
   return conta?res.json({modo:'CADASTRO_LOCAL_DE_TESTE',conta}):
    res.status(404).json({erro:'CONTA_FICTICIA_NAO_ENCONTRADA'});
  }catch(erro){return erroHttp(erro,res,next);}
 });
 router.post('/contas-participantes-demo/cadastrar',(req,res,next)=>{
  if(!corpoEstrito(req.body,['nome','email','senha'],['codigoIndicador'])){
   return res.status(400).json({erro:'CAMPOS_CADASTRO_DE_TESTE_INVALIDOS'});
  }
  try{
   const conta=contas.cadastrar(req.body);
   return res.status(201).json({
    modo:'CADASTRO_FICTICIO_PENDENTE_DE_COMPRA',
    conta,compraConfirmada:false,indicacaoValida:false,
    posicaoCriada:false,catracaMovimentada:false
   });
  }catch(erro){return erroHttp(erro,res,next);}
 });
 router.post('/contas-participantes-demo/login-teste',(req,res,next)=>{
  if(!corpoEstrito(req.body,['nome','senha'])){
   return res.status(400).json({erro:'CAMPOS_LOGIN_DE_TESTE_INVALIDOS'});
  }
  try{
   return res.json({modo:'VERIFICACAO_LOCAL_DE_SENHA_SEM_SESSAO_REAL',
    ...contas.autenticar(req.body)});
  }catch(erro){return erroHttp(erro,res,next);}
 });
 return router;
}
module.exports={criarRouterContasParticipantesDemo};
