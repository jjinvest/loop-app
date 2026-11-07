'use strict';
// Entrada de cliente real. É um serviço NOVO e isolado, não utiliza
// src/candidato e nunca monta as rotas de laboratório ou dinheiro.
const express=require('express');
const {COOKIE}=require('./identidade-cliente-loop-sqlite');
function criarAppIdentidadeLoop({contas,origemHttps,permitirCadastro=false}={}){
 if(!contas||typeof contas.entrar!=='function'||typeof contas.sessao!=='function')
  throw Error('IDENTIDADE_REAL_NAO_CONFIGURADA');
 let origem;
 try{
  const url=new URL(origemHttps);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
   throw Error('ORIGEM_HTTPS_INVALIDA');
  origem=url.origin;
 }catch{throw Error('ORIGEM_HTTPS_INVALIDA');}
 const app=express();
 app.disable('x-powered-by');app.disable('etag');app.set('trust proxy',false);
 app.use((req,res,next)=>{
  res.set({
   'Cache-Control':'no-store',
   'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
   'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
   'Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  });
  next();
 });
 app.use(express.json({limit:'12kb',strict:true}));
 const cookieValor=req=>{
  const raw=req.get('cookie')||'';
  if(raw.length>4096)return null;
  const encontrados=raw.split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(COOKIE+'='));
  if(encontrados.length!==1)return null;
  const token=encontrados[0].slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(token)?token:null;
 };
 const sessao=req=>contas.sessao(cookieValor(req));
 const cookie=(token,apagar=false)=>[
  COOKIE+'='+token,'HttpOnly','Secure','SameSite=Strict','Path=/api/contas',
  'Max-Age='+(apagar?'0':'3600')
 ].join('; ');
 const origemOk=req=>req.get('origin')===origem;
 const protegido=(req,res,next)=>{
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'LOGIN_OBRIGATORIO'});
  req.conta=s;next();
 };
 const mutation=(req,res,next)=>{
  if(!origemOk(req))return res.status(403).json({erro:'ORIGEM_INVALIDA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  next();
 };
 const csrf=(req,res,next)=>{
  if(req.get('x-loop-csrf')!==req.conta.csrf)
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  next();
 };
 const falha=(res,e)=>{
  const code=e?.codigo||'OPERACAO_INDISPONIVEL';
  if(code==='AUTENTICACAO_OCUPADA'||code==='CONTA_BLOQUEADA'||
     code==='ACESSO_TEMPORARIAMENTE_LIMITADO')
   return res.status(429).json({erro:code});
  if(code==='CADASTRO_EXISTENTE')return res.status(409).json({erro:code});
  if(code==='DOCUMENTOS_ALTERADOS_RELER'||
     code==='CREDENCIAL_ALTERADA_CONCORRENTEMENTE')
   return res.status(409).json({erro:code});
  if(['NOME_INVALIDO','EMAIL_INVALIDO','NICK_INVALIDO','SENHA_INVALIDA',
   'CODIGO_INVALIDO','SENHA_NOVA_DEVE_SER_DIFERENTE'].includes(code))
   return res.status(400).json({erro:code});
  if(code==='CREDENCIAIS_INVALIDAS'||code==='SENHA_ATUAL_INCORRETA')
   return res.status(401).json({erro:code});
  return res.status(503).json({erro:'OPERACAO_INDISPONIVEL'});
 };
 // Limites de operação são atômicos e compartilhados entre processos que
 // montam o mesmo volume SQLite. Nunca gravar IP, e-mail ou nick em claro.
 const limite=(res,acao,chave)=>{
  try{
   contas.limitar('global','*');
   contas.limitar(acao,String(chave??'-').slice(0,254));
   return true;
  }catch(e){falha(res,e);return false;}
 };
 app.get('/healthz',(_req,res)=>res.json({
  estado:'SERVICO_IDENTIDADE_SEPARADO',financeiroReal:false
 }));
 app.get('/readyz',(_req,res)=>{
  try{
   // Readiness é consultado repetidamente pelo Railway: quick_check
   // completo a cada GET custa O(tamanho do banco) e permite DoS.
   // Verificação integral do SQLite fica para o backup/auditoria.
   const check=contas.banco.prepare(
    'SELECT email_prova FROM loop_real_custodia WHERE id=1'
   ).get()?.email_prova;
   if(!check||!permitirCadastro)return res.status(503).json({
    estado:'CADASTRO_REAL_INATIVO',financeiroReal:false
   });
   return res.json({estado:'CADASTRO_REAL_PRONTO_SEM_FINANCEIRO',
    financeiroReal:false,cadastroAtivo:true});
  }catch{return res.status(503).json({
   estado:'IDENTIDADE_NAO_PRONTA',financeiroReal:false
  });}
 });
 app.get('/api/contas/documentos',(_req,res)=>{
  if(!permitirCadastro)return res.status(503).json({erro:'CADASTRO_INATIVO'});
  res.json(contas.documentos());
 });
 app.post('/api/contas/cadastrar',mutation,async(req,res)=>{
  if(!permitirCadastro)return res.status(503).json({erro:'CADASTRO_INATIVO'});
  const b=req.body;
  if(!b||Array.isArray(b)||Object.keys(b).sort().join(',')!==
    'aceitePrivacidade,aceiteTermos,email,hashPrivacidade,hashTermos,nick,nome,senha,versaoPrivacidade,versaoTermos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'cadastro',b.email))return;
  try{
   const result=await contas.cadastrar(b);
   return res.status(201).json(result);
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/entrar',mutation,async(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||Object.keys(b).sort().join(',')!=='nick,senha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'login',b.nick))return;
  try{
   const result=await contas.entrar(b);
   res.set('Set-Cookie',cookie(result.token));
   return res.json({
    titularId:result.titularId,nick:result.nick,csrf:result.csrf,
    expiraEm:result.expiraEm,emailVerificado:result.emailVerificado,
    pagamentoReal:false
   });
  }catch(e){return falha(res,e);}
 });
 app.get('/api/contas/me',protegido,(req,res)=>res.json({
  titularId:req.conta.titularId,nick:req.conta.nick,
  emailVerificado:req.conta.emailVerificado,
  csrf:req.conta.csrf,expiraEm:req.conta.expiraEm,
  lojaEEscritorioMesmaConta:true,financeiroReal:false
 }));
 // Direito de acesso: o titular consulta somente os seus próprios dados
 // e a versão dos documentos aceitos. Sem IDs escolhidos pelo navegador.
 app.get('/api/contas/meus-dados',protegido,(req,res)=>{
  try{return res.json(contas.dadosTitular(req.conta.titularId));}
  catch{return res.status(503).json({erro:'DADOS_INDISPONIVEIS'});}
 });
 app.post('/api/contas/sair',mutation,protegido,csrf,(req,res)=>{
  contas.sair(cookieValor(req));
  res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoEncerrada:true});
 });
 app.post('/api/contas/email/solicitar',mutation,protegido,csrf,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'solicitar',req.conta.titularId+':EMAIL'))return;
  try{
   return res.json(await contas.solicitarCodigo({
    titularId:req.conta.titularId,finalidade:'EMAIL'
   }));
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/email/confirmar',mutation,protegido,csrf,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='codigo')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'confirmar',req.conta.titularId+':EMAIL'))return;
  try{
   return res.json(await contas.confirmarCodigo({
    titularId:req.conta.titularId,finalidade:'EMAIL',codigo:req.body.codigo
   }));
  }catch(e){return falha(res,e);}
 });
 // A troca dentro da sessão não usa o e-mail como identificador e
 // revoga todos os dispositivos do titular, sem afetar outras contas.
 app.post('/api/contas/senha/trocar',mutation,protegido,csrf,async(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!=='novaSenha,senhaAtual')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'trocar',req.conta.titularId))return;
  try{
   const resultado=await contas.trocarSenha({
    titularId:req.conta.titularId,
    senhaAtual:b.senhaAtual,novaSenha:b.novaSenha
   });
   res.set('Set-Cookie',cookie('',true));
   return res.json(resultado);
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/senha/solicitar',mutation,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='email')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'solicitar',String(req.body.email)+':SENHA'))return;
  try{
   await contas.solicitarCodigo({email:req.body.email,finalidade:'SENHA'});
  }catch(e){
   // Não revelar se o e-mail existe nem se o provedor falhou.
   if(e.codigo==='EMAIL_INVALIDO')return res.status(400).json({erro:'EMAIL_INVALIDO'});
  }
  return res.status(202).json({solicitacaoRecebida:true,semRevelarCadastro:true});
 });
 app.post('/api/contas/senha/confirmar',mutation,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='codigo,email,novaSenha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'confirmar',String(req.body.email)+':SENHA'))return;
  try{return res.json(await contas.confirmarCodigo({
   email:req.body.email,codigo:req.body.codigo,
   novaSenha:req.body.novaSenha,finalidade:'SENHA'
  }));}catch(e){return falha(res,e);}
 });
 // As funcionalidades financeiras continuam fora deste serviço,
 // mesmo com a conta cadastrada e o e-mail confirmado.
 app.all(/^\/api\/(checkout|saques|posicoes|comissoes)(?:\/|$)/,(_req,res)=>
  res.status(503).json({erro:'OPERACAO_FINANCEIRA_NAO_HABILITADA'}));
 return app;
}
module.exports={criarAppIdentidadeLoop};
