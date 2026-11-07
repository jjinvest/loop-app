'use strict';
// Conecta catálogo confiável + estoque + frete dos distribuidores ao pedido
// comercial. Sem parceiros homologados, não produz cotação vendável.
// Preview de frete não transmite nome/CPF/endereço, somente CEP e SKUs.
// O cliente não define preço, SKU do fornecedor nem valor do frete.
const {randomUUID,randomBytes,createCipheriv,createDecipheriv,
 createHash}=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function hash(a){return createHash('sha256').update(JSON.stringify(a)).digest('hex');}
function cifrar(k,dados){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);
 c.setAAD(Buffer.from('AKITEMM-REAL-COTACAO-V1'));
 const ct=Buffer.concat([c.update(JSON.stringify(dados)),c.final()]);
 return {iv:iv.toString('hex'),ct:ct.toString('hex'),tag:c.getAuthTag().toString('hex')};
}
function decifrar(k,r){
 const c=createDecipheriv('aes-256-gcm',k,Buffer.from(r.iv,'hex'));
 c.setAAD(Buffer.from('AKITEMM-REAL-COTACAO-V1'));
 c.setAuthTag(Buffer.from(r.tag,'hex'));
 return JSON.parse(Buffer.concat([
  c.update(Buffer.from(r.ct,'hex')),c.final()
 ]).toString('utf8'));
}
function itensValidos(itens){
 if(!Array.isArray(itens)||itens.length<1||itens.length>100)
  erro('CARRINHO_INVALIDO');
 const vistos=new Set();
 return itens.map(i=>{
  if(!i||typeof i!=='object'||Array.isArray(i)||
     Object.keys(i).sort().join(',')!=='produtoId,quantidade'||
     typeof i.produtoId!=='string'||!ID.test(i.produtoId)||
     !Number.isSafeInteger(i.quantidade)||i.quantidade<1||
     i.quantidade>50||vistos.has(i.produtoId))erro('CARRINHO_INVALIDO');
  vistos.add(i.produtoId);
  return {produtoId:i.produtoId,quantidade:i.quantidade};
 });
}
function cepValido(s){
 if(typeof s!=='string'||!/^[0-9]{5}-?[0-9]{3}$/.test(s))
  erro('CEP_INVALIDO');
 return s.replace('-','');
}
class CotacoesMultiDistribuidoresSQLite{
 constructor({banco,catalogo,registro,chaveCotacoes,
  agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof catalogo?.ofertasConfiaveis!=='function'||
     typeof registro?.consultarEstoque!=='function'||
     typeof registro?.cotarFrete!=='function'||
     !Buffer.isBuffer(chaveCotacoes)||chaveCotacoes.length!==32||
     typeof agora!=='function')erro('COTACAO_REAL_NAO_CONFIGURADA');
  this.db=banco;this.catalogo=catalogo;this.registro=registro;
  this.key=Buffer.from(chaveCotacoes);this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_cotacoes(',
   'cotacao_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'payload_iv TEXT NOT NULL,payload_ct TEXT NOT NULL,',
   'payload_tag TEXT NOT NULL,criado_em INTEGER NOT NULL,',
   'expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loja_real_cotacoes_titular',
   'ON loja_real_cotacoes(titular_id,expira_em);'
  ].join(' '));
 }
 async simular({itens,cepDestino}={}){
  const lista=itensValidos(itens),cep=cepValido(cepDestino);
  const grupos=new Map();
  for(const linha of lista){
   const produto=this.catalogo.ofertasConfiaveis({
    produtoId:linha.produtoId
   });
   if(!produto||produto.compravel!==true||
      !Array.isArray(produto.ofertas)||produto.ofertas.length===0)
    erro('PRODUTO_SEM_OFERTA_HOMOLOGADA');
   let escolhido=null;
   // A ordem é a prioridade que o administrador definiu na AKITEMM,
   // nunca a escolha arbitrária de um fornecedor pelo comprador.
   for(const oferta of produto.ofertas){
    const estoque=await this.registro.consultarEstoque({
     fornecedorId:oferta.distribuidorId,sku:oferta.sku
    });
    if(estoque.quantidade>=linha.quantidade){
     escolhido=oferta;break;
    }
   }
   if(!escolhido)erro('PRODUTO_SEM_ESTOQUE_CONFIRMADO');
   const fornecedorId=escolhido.distribuidorId;
   if(!grupos.has(fornecedorId))grupos.set(fornecedorId,[]);
   grupos.get(fornecedorId).push({
    produtoId:linha.produtoId,sku:escolhido.sku,
    quantidade:linha.quantidade,
    precoUnitCentavos:escolhido.precoUnitCentavos
   });
  }
  const gruposRes=[];
  for(const [fornecedorId,linhas] of grupos){
   const frete=await this.registro.cotarFrete({
    fornecedorId,cepDestino:cep,itens:linhas.map(x=>({
     sku:x.sku,quantidade:x.quantidade
    }))
   });
   gruposRes.push({fornecedorId,itens:linhas,opcoesFrete:frete.opcoes});
  }
  gruposRes.sort((a,b)=>a.fornecedorId.localeCompare(b.fornecedorId));
  let totalItens=0;
  for(const grupo of gruposRes){
   for(const i of grupo.itens){
    totalItens+=i.quantidade*i.precoUnitCentavos;
    if(!Number.isSafeInteger(totalItens)||totalItens>100000000)
     erro('CARRINHO_ACIMA_DO_LIMITE');
   }
  }
  const versao=gruposRes.map(g=>({
   fornecedorId:g.fornecedorId,itens:g.itens,
   fretes:g.opcoesFrete.map(f=>({
    servicoId:f.servicoId,valorCentavos:f.valorCentavos,
    prazoDiasUteis:f.prazoDiasUteis
   })).sort((a,b)=>a.servicoId.localeCompare(b.servicoId))
  }));
  return {cepDestino:cep,grupos:gruposRes,
   subtotalProdutosCentavos:totalItens,
   resumoHash:hash(versao),checkoutReal:false,
   origem:'PRECO_INTERNO_ESTOQUE_E_FRETE_DOS_DISTRIBUIDORES'};
 }
 async emitir({titularId,itens,cepDestino,
  servicosFrete,resumoAceito}={}){
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     typeof resumoAceito!=='string'||!/^[a-f0-9]{64}$/.test(resumoAceito))
   erro('COTACAO_INVALIDA');
  const titular=this.db.prepare(
   'SELECT email_confirmado_em FROM loop_real_contas WHERE id=?'
  ).get(titularId);
  if(!titular||titular.email_confirmado_em===null)
   erro('EMAIL_REAL_NAO_VERIFICADO');
  const previa=await this.simular({itens,cepDestino});
  if(previa.resumoHash!==resumoAceito)
   erro('PRECO_OU_FRETE_ALTERADO_CONFIRMAR');
  if(!Array.isArray(servicosFrete)||servicosFrete.length!==previa.grupos.length)
   erro('SERVICOS_FRETE_INVALIDOS');
  const escolhidos=new Map();
  for(const s of servicosFrete){
   if(!s||typeof s!=='object'||Array.isArray(s)||
      Object.keys(s).sort().join(',')!=='fornecedorId,servicoId'||
      typeof s.fornecedorId!=='string'||!ID.test(s.fornecedorId)||
      typeof s.servicoId!=='string'||!ID.test(s.servicoId)||
      escolhidos.has(s.fornecedorId))
    erro('SERVICOS_FRETE_INVALIDOS');
   escolhidos.set(s.fornecedorId,s.servicoId);
  }
  let total=previa.subtotalProdutosCentavos;
  let validade=this.agora()+15*60*1000;
  const grupos=previa.grupos.map(g=>{
   const servico=g.opcoesFrete.find(o=>
    o.servicoId===escolhidos.get(g.fornecedorId)
   );
   if(!servico)erro('SERVICOS_FRETE_INVALIDOS');
   validade=Math.min(validade,Date.parse(servico.expiraEm));
   total+=servico.valorCentavos;
   return {fornecedorId:g.fornecedorId,
    freteCentavos:servico.valorCentavos,
    itens:g.itens.map(i=>({
     sku:i.sku,quantidade:i.quantidade,
     precoUnitCentavos:i.precoUnitCentavos
    }))}
  });
  if(!Number.isSafeInteger(total)||total>100000000||
     !Number.isSafeInteger(validade)||validade<=this.agora())
   erro('COTACAO_COMERCIAL_INVALIDA');
  const cotacaoId='COTACAO_'+randomUUID().replaceAll('-','');
  const payload={cepDestino:previa.cepDestino,grupos,
   valorTotalCentavos:total};
  const c=cifrar(this.key,payload);
  this.db.prepare([
   'INSERT INTO loja_real_cotacoes(',
   'cotacao_id,titular_id,payload_iv,payload_ct,payload_tag,criado_em,expira_em)',
   'VALUES(?,?,?,?,?,?,?)'
  ].join(' ')).run(cotacaoId,titularId,c.iv,c.ct,c.tag,this.agora(),validade);
  return {cotacaoId,titularId,status:'APROVADA',
   distribuidores:grupos.map(x=>x.fornecedorId),
   totalCentavos:total,freteCentavos:total-previa.subtotalProdutosCentavos,
   expiraEm:validade,checkoutReal:false};
 }
 consultarCotacaoConfiavel({cotacaoId,titularId}={}){
  if(typeof cotacaoId!=='string'||!/^COTACAO_[a-f0-9]{32}$/.test(cotacaoId)||
     typeof titularId!=='string'||!TITULAR.test(titularId))
   return null;
  const r=this.db.prepare([
   'SELECT * FROM loja_real_cotacoes',
   'WHERE cotacao_id=? AND titular_id=? AND expira_em>?'
  ].join(' ')).get(cotacaoId,titularId,this.agora());
  if(!r)return null;
  const d=decifrar(this.key,{
   iv:r.payload_iv,ct:r.payload_ct,tag:r.payload_tag
  });
  return {cotacaoId,titularId,cepDestino:d.cepDestino,
   status:'APROVADA',expiraEm:r.expira_em,grupos:d.grupos};
 }
}
module.exports={CotacoesMultiDistribuidoresSQLite};
