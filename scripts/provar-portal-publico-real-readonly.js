'use strict';
// PROVA EXTERNA, SOMENTE GET, da entrada publica ja publicada no Railway.
// Nao importa fixture, nao cria conta, nao autentica operador, nao
// acessa volumes, nao altera pedido, estoque, posicao, pagamento ou saque.
// Retorna apenas estados HTTP e indicadores sem dados pessoais.
const assert=require('node:assert/strict');
const ORIGEM='https://akitemmloop.com.br';
function falha(codigo){
 const e=new Error(codigo);e.codigo=codigo;throw e;
}
function json(t){
 try{return JSON.parse(t||'{}');}catch{return {};}
}
function conferir(resultado){
 if(typeof resultado!=='object'||resultado===null||
    typeof resultado.status!=='number'||typeof resultado.body!=='string'||
    typeof resultado.location!=='string')
  falha('PROVA_PUBLICA_RESPOSTA_INVALIDA');
 return resultado;
}
function resultadoHttp(res,body){
 return {status:res.status,body,location:res.headers.get('location')||''};
}
async function buscarPublico(path,{origem=ORIGEM,timeoutMs=12000}={}){
 if(origem!==ORIGEM||
    typeof path!=='string'||!path.startsWith('/')||
    path.startsWith('//')||path.includes('#')||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
  falha('PROVA_PUBLICA_ENDERECO_INVALIDO');
 const url=new URL(path,origem);
 if(url.origin!==origem)falha('PROVA_PUBLICA_DESTINO_EXTERNO');
 // Sem Cookie, Authorization ou mutacoes. Nunca seguir redirecionamentos.
 const res=await fetch(url,{method:'GET',redirect:'manual',
  cache:'no-store',headers:{Accept:'text/html, application/json, */*'},
  signal:AbortSignal.timeout(timeoutMs)});
 const body=await res.text();
 if(body.length>500000)falha('PROVA_PUBLICA_CORPO_EXCESSIVO');
 return resultadoHttp(res,body);
}
async function provarPortalPublicoReal({buscar=buscarPublico}={}){
 if(typeof buscar!=='function')falha('PROVA_PUBLICA_TRANSPORTE_INVALIDO');
 const obter=async path=>conferir(await buscar(path));
 let r=await obter('/');
 if(r.status!==302||r.location!=='/minha-conta')
  falha('PROVA_PUBLICA_ENTRADA_PRINCIPAL_INCORRETA');
 r=await obter('/healthz');
 const health=json(r.body);
 if(r.status!==200||health.estado!=='SERVICO_IDENTIDADE_SEPARADO'||
    health.financeiroReal!==false)
  falha('PROVA_PUBLICA_NAO_E_IDENTIDADE_DEFINITIVA');
 r=await obter('/readyz');
 const read=json(r.body);
 const fechado=r.status===503&&read.estado==='CADASTRO_REAL_INATIVO'&&
  read.financeiroReal===false;
 const liberado=r.status===200&&
  read.estado==='CADASTRO_REAL_PRONTO_SEM_FINANCEIRO'&&
  read.financeiroReal===false&&read.cadastroAtivo===true;
 if(!fechado&&!liberado)
  falha('PROVA_PUBLICA_ESTADO_CADASTRO_INCONSISTENTE');
 r=await obter('/minha-conta');
 if(r.status!==200||!r.body.includes('id="formLogin"')||
    !r.body.includes('id="formCadastro"')||
    r.body.includes('/staging/assets/'))
  falha('PROVA_PUBLICA_LOGIN_DEFINITIVO_AUSENTE');
 r=await obter('/escritorio');
 if(r.status!==200||
    !r.body.includes('/identidade/assets/tabuleiro-visual.js')||
    r.body.includes('/staging/assets/'))
  falha('PROVA_PUBLICA_ESCRITORIO_DEFINITIVO_AUSENTE');
 r=await obter('/identidade/assets/operador-fotos.js');
 if(r.status!==200||!r.body.includes('X-Foto-Versao-Esperada'))
  falha('PROVA_PUBLICA_OPERADOR_FOTOS_INACESSIVEL');
 r=await obter('/identidade/assets/vitrine-horizontal.css');
 if(r.status!==200||!r.body.includes('ak-faixa-horizontal'))
  falha('PROVA_PUBLICA_VITRINE_APROVADA_AUSENTE');
 for(const [path,codigo] of [
  ['/api/contas/me','PROVA_PUBLICA_SESSAO_CLIENTE_EXPOSTA'],
  ['/loja','PROVA_PUBLICA_LOJA_SEM_LOGIN'],
  ['/api/loja/catalogo','PROVA_PUBLICA_CATALOGO_SEM_LOGIN']
 ]){
  r=await obter(path);
  if(r.status!==401)falha(codigo);
 }
 r=await obter('/api/operador/estado');
 if(r.status!==200||json(r.body).operador!==false)
  falha('PROVA_PUBLICA_OPERADOR_ANONIMO_PRIVILEGIADO');
 for(const path of ['/staging/contas/me','/laboratorio/loja',
  '/api/loop/tesouraria-ensaio']){
  r=await obter(path);
  if(r.status!==410)falha('PROVA_PUBLICA_LABORATORIO_AINDA_ATIVO');
 }
 // Consulta de convite existente, SEM login ou cadastro. A primeira
 // identidade original foi comprovada pelo inventario da custodia.
 r=await obter('/loja/VILELA');
 if(r.status!==303||
    r.location!=='/escritorio?ref=vilela&origem=loja')
  falha('PROVA_PUBLICA_LINK_INDICACAO_NAO_CONECTADO');
 return Object.freeze({
  gateway:'REAL_SEM_LABORATORIO',identidade:'DEFINITIVA',
  paginaCliente:true,paginaEscritorio:true,
  navegadorOperadorFotos:true,vitrineHorizontal:true,
  acessoAnonimoBloqueado:true,rotasLaboratorioBloqueadas:true,
  indicacaoVilelaAtiva:true,
  cadastroPublico:fechado?'FECHADO':'LIBERADO',
  dinheiroRealHabilitado:false,
  contasAlteradas:0,produtosAlterados:0,pedidosAlterados:0,
  dadosFinanceirosAlterados:0
 });
}
if(require.main===module){
 provarPortalPublicoReal().then(resultado=>{
  process.stdout.write('LOOP_PORTAL_PUBLICO_READONLY='+
   JSON.stringify(resultado)+'\n');
 }).catch(e=>{
  // Nunca imprimir HTML, URLs, cookies ou segredos em logs.
  const codigo=typeof e?.codigo==='string'?e.codigo:
   'PROVA_PUBLICA_REDE_OU_RESPOSTA_INDISPONIVEL';
  process.stderr.write(codigo+'\n');
  process.exitCode=1;
 });
}
module.exports={provarPortalPublicoReal,buscarPublico};
