'use strict';
// Catálogo comercial AKITEMM real e segregado do banco de clientes.
// CRUD somente interserviços autenticados; nenhum checkout, PIX ou posição.
const fs=require('node:fs');
const path=require('node:path');
const {createHmac,timingSafeEqual}=require('node:crypto');
const {RepositorioCatalogoSQLite}=require('../domain/repositorio-catalogo-sqlite');
const {FotosProdutoCandidatoSQLite}=require('../domain/fotos-produto-candidato-sqlite');
const {VideoProdutoRealSQLite}=require('./video-produto-real-sqlite');
const {AkitemmConfigLojaDemoSQLite}=require('../domain/akitemm-config-loja-demo-sqlite');
const {MaterialPdfCursosReal}=require('./material-pdf-cursos-real');
const ID=/^[a-z0-9-]{3,80}$/;
const ID_COMERCIAL=/^[A-Za-z0-9_-]{1,80}$/;
const FOTO_MIME=new Set(['image/jpeg','image/png','image/webp']);
const CAMPOS=new Set(['nome','descricao','estado','precoCentavos','detalhes','entrega']);
const MAX_JSON=16*1024,MAX_FOTO=3*1024*1024,MAX_PDF=5*1024*1024;

function tokenCatalogo(tokenRaiz){
 if(typeof tokenRaiz!=='string'||!/^[a-f0-9]{64}$/.test(tokenRaiz))
  throw Error('CATALOGO_CHAVE_INTERSERVICO_AUSENTE');
 return createHmac('sha256',Buffer.from(tokenRaiz,'hex'))
  .update('AKITEMM_CATALOGO_REAL_V1','utf8').digest('hex');
}
function validarToken(recebido,esperado){
 if(typeof recebido!=='string'||!/^[a-f0-9]{64}$/.test(recebido))return false;
 return timingSafeEqual(Buffer.from(recebido,'hex'),Buffer.from(esperado,'hex'));
}
function corpo(req,limite){
 return new Promise((resolve,reject)=>{
  let total=0;
  const chunks=[];
  req.on('data',chunk=>{
   total+=chunk.length;
   if(total>limite){reject(Error('CORPO_GRANDE_DEMAIS'));req.destroy();return;}
   chunks.push(chunk);
  });
  req.on('end',()=>resolve(Buffer.concat(chunks)));
  req.on('error',reject);
 });
}
function exato(obj,chaves){
 return !!obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).sort().join(',')===[...chaves].sort().join(',');
}
function lerJson(bytes){
 try{return JSON.parse(bytes.toString('utf8'));}
 catch{throw Error('JSON_INVALIDO');}
}
function responder(res,status,obj){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 return res.end(JSON.stringify(obj));
}
function erroCodigo(e){
 return typeof e?.codigo==='string'?e.codigo:
  typeof e?.message==='string'&&/^[A-Z0-9_]+$/.test(e.message)?
   e.message:'REQUISICAO_INVALIDA';
}
function criarCatalogoMercadoriasReal({
 arquivo,tokenRaiz,buscarProdutoCompartilhado=null
}={}){
 if(buscarProdutoCompartilhado!==null&&
    typeof buscarProdutoCompartilhado!=='function')
  throw Error('CATALOGO_PRODUTO_COMPARTILHADO_INVALIDO');
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo))
  throw Error('CATALOGO_ARQUIVO_REAL_OBRIGATORIO');
 const esperado=tokenCatalogo(tokenRaiz);
 if(!fs.existsSync(path.dirname(arquivo))||
    !fs.statSync(path.dirname(arquivo)).isDirectory())
  throw Error('CATALOGO_VOLUME_REAL_AUSENTE');
 const repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const buscarProduto=id=>(ID.test(id)?repo.buscar(id):null)||
  (buscarProdutoCompartilhado?buscarProdutoCompartilhado(id):null);
 const fotos=new FotosProdutoCandidatoSQLite({
  banco:repo.banco,catalogo:{buscar:async id=>buscarProduto(id)},
  permitirIdComercial:true
 });
 const video=new VideoProdutoRealSQLite({banco:repo.banco,catalogo:{buscar:async id=>buscarProduto(id)}});
 const config=new AkitemmConfigLojaDemoSQLite({banco:repo.banco});
 const pdf=new MaterialPdfCursosReal({banco:repo.banco,catalogo:repo});
 function listarPublicos(){
  return repo.listar().filter(p=>p.estado==='PUBLICADO').map(p=>({
   produtoId:p.id,nome:p.nome,descricao:p.descricao,tipo:p.tipo,
   precoCentavos:p.precoCentavos,entrega:p.entrega,
   detalhes:p.detalhes,estado:'PUBLICADO',classeVisual:'CINZA',
   elegivelLoop:false,quantidadeMinimaLoop:1,
   posicoesPorPedidoLoop:0,quantidadeMaxima:50,
   fotos:fotos.listar(p.id).fotos.map(x=>
    '/staging/vitrine/loja/produtos/'+p.id+'/foto/'+x.posicao),
   videoApresentacaoLocal:false
  }));
 }
 // A loja definitiva consulta esta fonte pelo MESMO processo, sem
 // trocar o banco de clientes e sem passar por qualquer rota de ensaio.
 // Apenas produtos fisicos explicitamente publicados, sem preco/checkout.
 function listarVitrinePreparacao({limite=100}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>400)
   throw Error('CATALOGO_REAL_LIMITE_INVALIDO');
  const publicos=repo.listar().filter(p=>
   p.estado==='PUBLICADO'&&p.tipo==='FISICO');
  // Nao truncar silenciosamente produtos visiveis no acervo real.
  if(publicos.length>limite)throw Error('CATALOGO_REAL_PAGINACAO_NECESSARIA');
  const agora=Date.now();
  return publicos.map(p=>{
   const primeiro=repo.historico(p.id)[0]?.ocorridoEm;
   const criadoEm=Date.parse(primeiro||'');
   if(!Number.isSafeInteger(criadoEm)||criadoEm<1||criadoEm>agora+86400000)
    throw Error('CATALOGO_REAL_HISTORICO_INVALIDO');
   return Object.freeze({
    produtoId:p.id,titulo:p.nome,descricao:p.descricao||'',
    tipo:'FISICO',cor:'CINZA',criadoEm,
    novidade:criadoEm>=agora-30*86400000,unidadesConfirmadas:0,
    // Referencia apenas fotos persistidas deste produto publicado.
    // Nao trafega BLOB nem credenciais de catalogo para o cliente.
    fotos:fotos.listar(p.id).fotos.map(x=>Object.freeze({
     posicao:x.posicao,versao:x.versao,
     url:'/api/loja/produtos/'+p.id+'/foto/'+x.posicao
    })),
    videoUrl:video.estado(p.id).arquivoAnexado?'/api/loja/produtos/'+p.id+'/video':null,
    precoCentavos:null,estoqueConfirmado:false,
    compravel:false,checkoutReal:false,
    estado:'AGUARDANDO_HOMOLOGACAO_FORNECEDOR'
   });
  });
 }
 // A origem publica nunca aceita ID de arquivo, URLs externas ou
 // caminhos do disco fornecidos pelo cliente. Somente foto publicada.
 function abrirFotoPublicada({produtoId,posicao}={}){
  if(typeof produtoId!=='string'||!ID_COMERCIAL.test(produtoId)||
     !Number.isSafeInteger(posicao)||posicao<1||posicao>10)
   throw Error('FOTO_PUBLICA_IDENTIFICADOR_INVALIDO');
  const local=ID.test(produtoId)?repo.buscar(produtoId):null;
  if(local){
   if(local.estado!=='PUBLICADO'||local.tipo!=='FISICO')
    throw Error('FOTO_NAO_PUBLICADA');
  }else{
   // Foto de produto do catalogo comercial principal: produto ativo
   // e tipo fisico, sem gravar uma segunda copia de seu cadastro.
   const outro=buscarProdutoCompartilhado?.(produtoId);
   if(!outro||outro.ativo!==true||outro.tipo!=='FISICO')
    throw Error('FOTO_NAO_PUBLICADA');
  }
  const imagem=fotos.abrir(produtoId,posicao);
  if(!FOTO_MIME.has(imagem.mime)||!Buffer.isBuffer(imagem.dados))
   throw Error('FOTO_INTEGRIDADE_INVALIDA');
  return imagem;
 }
 function listarFotosProdutoCompartilhado({produtoId}={}){
  // IDs do cadastro comercial principal são preservados sem normalizar,
  // migrar, duplicar ou alterar os produtos que já existem.
  if(typeof produtoId!=='string'||!ID_COMERCIAL.test(produtoId))return [];
  return fotos.listar(produtoId).fotos.map(x=>Object.freeze({
   posicao:x.posicao,versao:x.versao,
   url:'/api/loja/produtos/'+produtoId+'/foto/'+x.posicao
  }));
 }
 function listarVideoProdutoCompartilhado({produtoId}={}){
  if(typeof produtoId!=='string'||!ID_COMERCIAL.test(produtoId))return null;
  return video.estado(produtoId).arquivoAnexado?'/api/loja/produtos/'+produtoId+'/video':null;
 }
 function abrirVideoPublicado({produtoId}={}){
  if(typeof produtoId!=='string'||!ID_COMERCIAL.test(produtoId))throw Error('VIDEO_NAO_PUBLICADO');
  const local=ID.test(produtoId)?repo.buscar(produtoId):null;
  if(local){
   if(local.estado!=='PUBLICADO'||local.tipo!=='FISICO')throw Error('VIDEO_NAO_PUBLICADO');
  }else{
   const outro=buscarProdutoCompartilhado?.(produtoId);
   if(!outro||outro.ativo!==true||outro.tipo!=='FISICO')throw Error('VIDEO_NAO_PUBLICADO');
  }
  return video.abrir(produtoId);
 }
 async function atender(req,res){
  const url=new URL(req.url,'http://internal.catalogo');
  if(!url.pathname.startsWith('/internal/catalogo/'))return false;
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  if(!validarToken(req.headers['x-loop-catalogo-token'],esperado)){
   responder(res,401,{erro:'ACESSO_INTERSERVICO_NEGADO'});return true;
  }
  if(url.search&&url.pathname!=='/internal/catalogo/produtos'){
   responder(res,400,{erro:'QUERY_INVALIDA'});return true;
  }
  const rota=url.pathname.slice('/internal/catalogo'.length);
  try{
   if(rota==='/status'&&req.method==='GET'){
    const chk=repo.banco.prepare('PRAGMA quick_check').get().quick_check;
    if(chk!=='ok')throw Error('CATALOGO_SQLITE_INCONSISTENTE');
    responder(res,200,{
     estado:'CATALOGO_REAL_PERSISTENTE',sqliteIntegro:true,
     quantidadeProdutos:repo.listar().length,
     cursosPdfArmazenados:repo.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_curso_pdf_atual_real').get().n,
     checkoutReal:false,
     pagamentoReal:false,semItensInseridosAutomaticamente:true
    });return true;
   }
   if(rota==='/loja/config'){
    if(req.method==='GET'){
     responder(res,200,config.consultarComRevisao());return true;
    }
    if(req.method==='PUT'){
     const dados=lerJson(await corpo(req,MAX_JSON));
     if(!exato(dados,['config','revisaoEsperada']))
      throw Error('CONFIG_CAMPOS_INVALIDOS');
     responder(res,200,config.salvarComRevisao(dados));return true;
    }
   }
   if(rota==='/vitrine'&&req.method==='GET'){
    responder(res,200,{
     produtos:listarPublicos(),ofertasCompostas:[],
     referenciaLoopCentavos:25000,
     conviteLoopCheckoutAtivo:false,
     catalogoComercialReal:true,checkoutReal:false,pagamentosReais:false
    });return true;
   }
   if(rota==='/produtos'){
    if(req.method==='GET'){
     const pagina=url.searchParams.size===0?0:Number(url.searchParams.get('pagina'));
     if(url.searchParams.size>1||
        (url.searchParams.size===1&&!url.searchParams.has('pagina'))||
        !Number.isSafeInteger(pagina)||pagina<0||pagina>10000)
      throw Error('PAGINACAO_INVALIDA');
     const lista=repo.listar(),limite=25;
     const registros=lista.slice(pagina*limite,(pagina+1)*limite)
      .map(p=>repo.buscarRegistro(p.id));
     responder(res,200,{registros,pagina,total:lista.length,
      haMais:(pagina+1)*limite<lista.length,origem:'SQLITE_COMERCIAL_REAL',
      checkoutReal:false});return true;
    }
    if(req.method==='POST'){
     const dados=lerJson(await corpo(req,MAX_JSON));
     if(!exato(dados,['produto'])||!dados.produto||
        typeof dados.produto.id!=='string'||!ID.test(dados.produto.id))
      throw Error('PRODUTO_INVALIDO');
     const anterior=repo.buscarRegistro(dados.produto.id);
     if(anterior){
      responder(res,409,{erro:'PRODUTO_JA_EXISTE'});return true;
     }
     if(dados.produto.estado!=='RASCUNHO')
      throw Error('PUBLICACAO_EXIGE_FOTO');
     const salvo=repo.salvar({produto:dados.produto,revisaoEsperada:0});
     responder(res,201,{...repo.buscarRegistro(salvo.id),repetida:false});return true;
    }
   }
   const pr=rota.match(/^\/produtos\/([a-z0-9-]{3,80})$/);
   if(pr){
    const id=pr[1];
    if(req.method==='GET'){
     const reg=repo.buscarRegistro(id);
     responder(res,reg?200:404,reg||{erro:'PRODUTO_NAO_ENCONTRADO'});
     return true;
    }
    if(req.method==='PATCH'){
     const d=lerJson(await corpo(req,MAX_JSON));
     if(!exato(d,['revisaoEsperada','alteracoes'])||!d.alteracoes||
       typeof d.alteracoes!=='object'||Array.isArray(d.alteracoes)||
       !Object.keys(d.alteracoes).length||
       Object.keys(d.alteracoes).some(k=>!CAMPOS.has(k)))
      throw Error('ALTERACOES_INVALIDAS');
     const atual=repo.buscarRegistro(id);
     if(!atual){responder(res,404,{erro:'PRODUTO_NAO_ENCONTRADO'});return true;}
     if(atual.revisao!==d.revisaoEsperada){
      responder(res,409,{erro:'CONFLITO_REVISAO'});return true;
     }
     if(d.alteracoes.estado==='PUBLICADO'){
      if(atual.produto.tipo==='PDF'&&!pdf.estado(id).arquivoAnexado){
       responder(res,409,{erro:'PUBLICACAO_EXIGE_PDF'});return true;
      }
      if(atual.produto.tipo==='FISICO'&&!fotos.listar(id).fotos.length){
       responder(res,409,{erro:'PUBLICACAO_EXIGE_FOTO'});return true;
      }
     }
     repo.atualizar({id,revisaoEsperada:d.revisaoEsperada,alteracoes:d.alteracoes});
     responder(res,200,repo.buscarRegistro(id));return true;
    }
   }
   const pdfRota=rota.match(/^\/produtos\/([a-z0-9-]{3,80})\/pdf$/);
   if(pdfRota){
    const id=pdfRota[1],item=repo.buscar(id);
    if(!item){responder(res,404,{erro:'PDF_PRODUTO_NAO_ENCONTRADO'});return true;}
    if(item.tipo!=='PDF'){responder(res,409,{erro:'PDF_PRODUTO_NAO_DIGITAL'});return true;}
    if(req.method==='GET'){
     responder(res,200,pdf.estado(id));return true;
    }
    if(req.method==='POST'){
     const revisao=req.headers['x-pdf-versao-esperada'];
     if(req.headers['content-type']!=='application/pdf'||
        typeof revisao!=='string'||!/^(0|[1-9][0-9]{0,8})$/.test(revisao)){
      responder(res,415,{erro:'PDF_PARAMETROS_INVALIDOS'});return true;
     }
     const bytes=await corpo(req,MAX_PDF);
     const salvo=await pdf.salvar({produtoId:id,bytes,revisaoEsperada:Number(revisao)});
     responder(res,salvo.repetido?200:201,salvo);return true;
    }
   }
   const galeria=rota.match(/^\/produtos\/([a-z0-9-]{3,80})\/fotos$/);
   if(galeria&&req.method==='GET'){
    if(!buscarProduto(galeria[1])){
     responder(res,404,{erro:'PRODUTO_NAO_ENCONTRADO'});return true;
    }
    const dados=fotos.listar(galeria[1]);
    responder(res,200,{...dados,fotos:dados.fotos.map(x=>({
     posicao:x.posicao,versao:x.versao,bytes:x.bytes
    }))});return true;
   }
   const arquivoFoto=rota.match(/^\/produtos\/([a-z0-9-]{3,80})\/fotos\/(10|[1-9])$/);
   if(arquivoFoto&&req.method==='POST'){
    const mime=req.headers['content-type'];
    const versao=req.headers['x-foto-versao-esperada'];
    if(!FOTO_MIME.has(mime)||typeof versao!=='string'||
      !/^(0|[1-9][0-9]{0,8})$/.test(versao))
     throw Error('FOTO_PARAMETROS_INVALIDOS');
    const bytes=await corpo(req,MAX_FOTO);
    const salvo=await fotos.salvar({produtoId:arquivoFoto[1],
     posicao:Number(arquivoFoto[2]),bytes,mime,
     revisaoEsperada:Number(versao)});
    responder(res,salvo.repetido?200:201,salvo);return true;
   }
   const publicada=rota.match(/^\/foto\/([a-z0-9-]{3,80})\/(10|[1-9])$/);
   if(publicada&&req.method==='GET'){
    let img;
    try{img=abrirFotoPublicada({
     produtoId:publicada[1],posicao:Number(publicada[2])
    });}catch{
     responder(res,404,{erro:'FOTO_NAO_PUBLICADA'});return true;
    }
    res.statusCode=200;res.setHeader('Content-Type',img.mime);
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.end(img.dados);return true;
   }
   responder(res,405,{erro:'ROTA_OU_METODO_NAO_PERMITIDO'});return true;
  }catch(e){
   const erro=erroCodigo(e);
   const status=erro==='CORPO_GRANDE_DEMAIS'?413:
    ['CONFLITO_REVISAO','CONFIG_CONFLITO_REVISAO','PDF_CONFLITO_REVISAO'].includes(erro)?409:
    /INTEGRIDADE|SQLITE/.test(erro)?503:400;
   if(!res.headersSent&&!res.writableEnded)responder(res,status,{erro});
   return true;
  }
 }
 return {atender,repo,fotos,video,config,pdf,listarVitrinePreparacao,
  buscarProdutoCompartilhado,listarFotosProdutoCompartilhado,
  abrirFotoPublicada,listarVideoProdutoCompartilhado,abrirVideoPublicado,fechar:()=>repo.fechar()};
}
module.exports={criarCatalogoMercadoriasReal,tokenCatalogo};
