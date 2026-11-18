'use strict';
// Edicao de fotos do catalogo persistente REAL pela mesma sessao
// administrativa do escritorio. Nenhum HTML, CSS, simulado ou checkout.
const express=require('express');
const ID=/^[a-z0-9-]{3,80}$/;
const POS=/^(?:10|[1-9])$/;
const MIME=new Set(['image/jpeg','image/png','image/webp']);
function montarRotasCatalogoMidiaOperador({
 app,catalogoMidia,catalogoPrincipal=null,posicoesVitrine=null,
 autorizarOperador,validarCsrf
}={}){
 if(typeof app?.get!=='function'||typeof app?.post!=='function'||
    !catalogoMidia||typeof catalogoMidia.repo?.buscar!=='function'||
    typeof catalogoMidia.repo?.listar!=='function'||
    typeof catalogoMidia.fotos?.salvar!=='function'||
    typeof catalogoMidia.fotos?.listar!=='function'||
    typeof catalogoMidia.fotos?.abrir!=='function'||
    catalogoMidia.fotos.banco!==catalogoMidia.repo.banco||
    (catalogoPrincipal!==null&&(
     typeof catalogoPrincipal?.listarProdutosAdministrativos!=='function'||
     typeof catalogoPrincipal?.buscarProdutoAdministrativo!=='function'||
     typeof catalogoPrincipal?.atualizarDescricaoProduto!=='function'))||
    (posicoesVitrine!==null&&(
     typeof posicoesVitrine?.listar!=='function'||
     typeof posicoesVitrine?.atribuir!=='function'))||
    typeof autorizarOperador!=='function'||typeof validarCsrf!=='function')
  throw Error('OPERADOR_CATALOGO_REAL_NAO_INTEGRADO');
 const urlFoto=(id,posicao)=>'/api/admin/catalogo-midia/produtos/'+
  id+'/foto/'+posicao;
 const existe=id=>catalogoMidia.repo.buscar(id)||
  catalogoMidia.buscarProdutoCompartilhado?.(id);
 const corpoImagem=express.raw({
  type:['image/jpeg','image/png','image/webp'],
  limit:'3mb',inflate:false
 });
 const verificarId=(req,res,next)=>{
  if(!ID.test(req.params.produtoId||''))
   return res.status(404).json({erro:'PRODUTO_INVALIDO'});
  if(req.params.posicao!==undefined&&!POS.test(req.params.posicao))
   return res.status(404).json({erro:'FOTO_POSICAO_INVALIDA'});
  next();
 };
 // O operador escolhe em qual dos 400 quadradinhos guardar o
 // produto, independentemente de foto, preço ou publicação.
 if(posicoesVitrine!==null){
  app.get('/api/admin/catalogo-midia/slots',
   autorizarOperador,(_req,res)=>{
    try{return res.json({total:400,slots:posicoesVitrine.listar(),
     checkoutReal:false});}
    catch{return res.status(503).json({erro:'SLOTS_REAIS_INDISPONIVEIS'});}
   });
  app.post('/api/admin/catalogo-midia/slots/:posicao',
   autorizarOperador,validarCsrf,(req,res)=>{
    const n=Number(req.params.posicao),b=req.body;
    if(!/^(?:[1-9][0-9]{0,2})$/.test(req.params.posicao)||
       !Number.isSafeInteger(n)||n<1||n>400||
       !req.is('application/json')||!b||Array.isArray(b)||
       typeof b!=='object'||
       Object.keys(b).sort().join(',')!=='produtoId,revisaoEsperada'||
       typeof b.produtoId!=='string'||
       !Number.isSafeInteger(b.revisaoEsperada)||b.revisaoEsperada<0)
     return res.status(400).json({erro:'SLOT_ATRIBUICAO_INVALIDA'});
    try{
     const local=ID.test(b.produtoId)?
      catalogoMidia.repo.buscar(b.produtoId):null;
     const central=catalogoPrincipal?.
      buscarProdutoAdministrativo({produtoId:b.produtoId});
     if(local&&central)
      return res.status(409).json({erro:'CATALOGO_IDS_DUPLICADOS'});
     const resultado=posicoesVitrine.atribuir({
      posicao:n,produtoId:b.produtoId,
      revisaoEsperada:b.revisaoEsperada,
      produtoExiste:()=>!!(local||central)
     });
     return res.status(resultado.jaVinculado?200:201).json({
      ...resultado,checkoutReal:false
     });
    }catch(e){
     const erro=e?.codigo||e?.message||'SLOT_REAL_INDISPONIVEL';
     const status=erro.includes('CONCORRENTE')||
      erro.includes('OCUPADO')||erro.includes('JA_POSICIONADO')?409:
      erro.includes('NAO_ENCONTRADO')?404:
      erro.includes('INVALIDA')?400:503;
     return res.status(status).json({erro:status===503?
      'SLOT_REAL_INDISPONIVEL':erro});
    }
   });
 }
 app.get('/api/admin/catalogo-midia/produtos',autorizarOperador,(_req,res)=>{
  try{
   const locais=catalogoMidia.repo.listar();
   const central=catalogoPrincipal?
    catalogoPrincipal.listarProdutosAdministrativos({limite:500}):[];
   if(!Array.isArray(locais)||!Array.isArray(central)||
      locais.length+central.length>10000)
    throw Error('CATALOGO_INCONSISTENTE');
   const combinados=[
    ...locais.map(p=>({produtoId:p.id,nome:p.nome,
     descricao:p.descricao||'',tipo:p.tipo,estado:p.estado,
     fonte:'MIDIA_REAL'})),
    ...central.map(p=>({produtoId:p.produtoId,nome:p.titulo,
     descricao:p.descricao||'',tipo:p.tipo,
     estado:p.ativo?'PUBLICADO':'RASCUNHO',fonte:'COMERCIAL_PRINCIPAL'}))
   ];
   if(new Set(combinados.map(p=>p.produtoId)).size!==combinados.length)
    return res.status(409).json({erro:'CATALOGO_IDS_DUPLICADOS'});
   return res.json({produtos:combinados.map(p=>({
    ...p,quantidadeFotos:ID.test(p.produtoId)?
     catalogoMidia.fotos.listar(p.produtoId).fotos.length:0
   })),origem:'CATALOGO_REAL_PERSISTENTE',checkoutReal:false});
  }catch{return res.status(503).json({erro:'CATALOGO_REAL_INDISPONIVEL'});}
 });
 // Nome e descrição do quadrinho continuam no cadastro primário.
 // Não edita custos, preço, fornecedor, cor nem status de publicação.
 app.get('/api/admin/catalogo-midia/produtos/:produtoId',
  autorizarOperador,verificarId,(req,res)=>{
   const id=req.params.produtoId;
   try{
    const local=catalogoMidia.repo.buscarRegistro(id);
    const principal=catalogoPrincipal?.
     buscarProdutoAdministrativo({produtoId:id});
    if(local&&principal)
     return res.status(409).json({erro:'CATALOGO_IDS_DUPLICADOS'});
    if(!local&&!principal)
     return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
    return res.json(local?{
     produtoId:id,nome:local.produto.nome,
     descricao:local.produto.descricao||'',
     estado:local.produto.estado,revisao:local.revisao,
     fonte:'MIDIA_REAL'
    }:{
     produtoId:id,nome:principal.titulo,
     descricao:principal.descricao||'',
     estado:principal.ativo?'PUBLICADO':'RASCUNHO',
     revisao:principal.revisao,fonte:'COMERCIAL_PRINCIPAL'
    });
   }catch{return res.status(503).json({erro:'PRODUTO_REAL_INDISPONIVEL'});}
  });
 app.patch('/api/admin/catalogo-midia/produtos/:produtoId',
  autorizarOperador,validarCsrf,verificarId,async(req,res)=>{
   if(!req.is('application/json')||!req.body||
      Array.isArray(req.body)||typeof req.body!=='object')
    return res.status(415).json({erro:'PRODUTO_JSON_OBRIGATORIO'});
   const b=req.body,id=req.params.produtoId;
   if(Object.keys(b).sort().join(',')!=='descricao,revisaoEsperada,titulo'||
      typeof b.titulo!=='string'||b.titulo.trim().length<2||
      b.titulo.length>150||typeof b.descricao!=='string'||
      b.descricao.length>2000||!Number.isSafeInteger(b.revisaoEsperada)||
      b.revisaoEsperada<1)
    return res.status(400).json({erro:'PRODUTO_CAMPOS_INVALIDOS'});
   try{
    const local=catalogoMidia.repo.buscarRegistro(id);
    const principal=catalogoPrincipal?.
     buscarProdutoAdministrativo({produtoId:id});
    if(local&&principal)
     return res.status(409).json({erro:'CATALOGO_IDS_DUPLICADOS'});
    if(!local&&!principal)
     return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
    let novo;
    if(local){
     await catalogoMidia.repo.atualizar({
      id,revisaoEsperada:b.revisaoEsperada,
      alteracoes:{nome:b.titulo.trim(),descricao:b.descricao.trim()}
     });
     const x=catalogoMidia.repo.buscarRegistro(id);
     novo={produtoId:id,nome:x.produto.nome,
      descricao:x.produto.descricao,revisao:x.revisao};
    }else{
     const x=catalogoPrincipal.atualizarDescricaoProduto({
      produtoId:id,titulo:b.titulo,descricao:b.descricao,
      revisaoEsperada:b.revisaoEsperada
     });
     novo={produtoId:id,nome:x.titulo,
      descricao:x.descricao,revisao:x.revisao};
    }
    return res.json({...novo,checkoutReal:false});
   }catch(e){
    const erro=e?.codigo||e?.message||'PRODUTO_REAL_INDISPONIVEL';
    const status=erro.includes('CONFLITO')?409:
     erro.includes('NAO_EXISTE')?404:
     erro.includes('MANUTENCAO')?423:
     erro.includes('INVALID')?400:503;
    return res.status(status).json({erro:status===503?
     'PRODUTO_REAL_INDISPONIVEL':erro});
   }
  });
 app.get('/api/admin/catalogo-midia/produtos/:produtoId/fotos',
  autorizarOperador,verificarId,(req,res)=>{
   const id=req.params.produtoId;
   try{
    if(!existe(id))
     return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
    const atual=catalogoMidia.fotos.listar(id);
    return res.json({
     produtoId:id,limite:10,
     fotos:atual.fotos.map(f=>({
      posicao:f.posicao,versao:f.versao,
      mime:f.mime,bytes:f.bytes,url:urlFoto(id,f.posicao)
     }))
    });
   }catch{return res.status(503).json({erro:'FOTOS_REAIS_INDISPONIVEIS'});}
  });
 app.get('/api/admin/catalogo-midia/produtos/:produtoId/foto/:posicao',
  autorizarOperador,verificarId,(req,res)=>{
   try{
    if(!existe(req.params.produtoId))
     return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
    const imagem=catalogoMidia.fotos.abrir(req.params.produtoId,
     Number(req.params.posicao));
    if(!MIME.has(imagem.mime)||!Buffer.isBuffer(imagem.dados))
     throw Error('FOTO_INTEGRIDADE_INVALIDA');
    return res.type(imagem.mime).set('Cache-Control','private, no-store')
     .send(imagem.dados);
   }catch{return res.status(404).json({erro:'FOTO_NAO_ENCONTRADA'});}
  });
 app.post('/api/admin/catalogo-midia/produtos/:produtoId/fotos/:posicao',
  autorizarOperador,validarCsrf,verificarId,corpoImagem,async(req,res)=>{
   const id=req.params.produtoId,posicao=Number(req.params.posicao);
   const mime=req.get('content-type');
   const revisao=req.get('x-foto-versao-esperada');
   if(!MIME.has(mime)||!Buffer.isBuffer(req.body)||
      req.body.length<1||req.body.length>3145728||
      typeof revisao!=='string'||!/^(?:0|[1-9][0-9]{0,8})$/.test(revisao))
    return res.status(415).json({erro:'FOTO_PARAMETROS_INVALIDOS'});
   try{
    if(!existe(id))
     return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
    const salva=await catalogoMidia.fotos.salvar({
     produtoId:id,posicao,bytes:req.body,mime,
     revisaoEsperada:Number(revisao)
    });
    return res.status(salva.repetido?200:201).json({
     produtoId:id,posicao,versao:salva.versao,
     repetida:salva.repetido,url:urlFoto(id,posicao),
     origem:'CATALOGO_REAL_PERSISTENTE',checkoutReal:false
    });
   }catch(e){
    const msg=e?.codigo||e?.message||'FOTO_INDISPONIVEL';
    const code=msg==='FOTO_CONFLITO_REVISAO'?409:
     msg==='FOTO_PRODUTO_NAO_ENCONTRADO'?404:
     /FOTO_.*INVALID|IMAGEM_|MIME_/.test(msg)?400:503;
    return res.status(code).json({erro:code===503?'FOTO_REAL_INDISPONIVEL':msg});
   }
  });
 return {ativo:true,origem:'CATALOGO_REAL_PERSISTENTE',
  escopo:'OPERADOR_AUTENTICADO',checkoutReal:false};
}
module.exports={montarRotasCatalogoMidiaOperador};
