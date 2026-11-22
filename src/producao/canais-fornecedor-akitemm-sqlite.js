'use strict';
// Canal de fornecimento REAL do produto cadastrado na AKITEMM.
// Cadastro manual e importação CSV persistem no SQLite. NÃO ligam
// marketplace, ERP, API, estoque confirmado, cobrança ou expedição.
const {createHash}=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const CANAIS=new Set(['PROPRIO','FORNECEDOR_MANUAL','PLANILHA_CSV']);
const PENDENTES=new Set(['API_PENDENTE','ERP_PENDENTE','MARKETPLACE_PENDENTE']);
const TEXTO=/^[^\u0000-\u001f\u007f]*$/;
function falhar(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const valido=(s,max)=>typeof s==='string'&&s.length<=max&&TEXTO.test(s);
function linhasCsv(texto){
 if(typeof texto!=='string'||Buffer.byteLength(texto,'utf8')>131072||
    texto.length<25||texto.includes('\0'))falhar('PLANILHA_ARQUIVO_INVALIDO');
 const limpo=texto.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const linhas=[];let atual=[],campo='',aspas=false;
 for(let i=0;i<limpo.length;i++){
  const c=limpo[i];
  if(aspas){
   if(c==='"'&&limpo[i+1]==='"'){campo+='"';i++;}
   else if(c==='"')aspas=false;
   else campo+=c;
  }else if(c==='"'){
   if(campo!=='')falhar('PLANILHA_CSV_ASPAS_INVALIDAS');
   aspas=true;
  }else if(c===';'){atual.push(campo.trim());campo='';}
  else if(c==='\n'){
   atual.push(campo.trim());campo='';
   if(atual.some(x=>x!==''))linhas.push(atual);
   atual=[];
  }else campo+=c;
 }
 if(aspas)falhar('PLANILHA_CSV_ASPAS_INVALIDAS');
 atual.push(campo.trim());
 if(atual.some(x=>x!==''))linhas.push(atual);
 if(linhas.length<2||linhas.length>201)falhar('PLANILHA_QUANTIDADE_INVALIDA');
 const cab=['produto_id','fornecedor','sku_fornecedor','preco_vitrine','quantidade'];
 if(linhas[0].length!==cab.length||
    linhas[0].some((x,i)=>x.toLowerCase()!==cab[i]))
  falhar('PLANILHA_CABECALHO_INVALIDO');
 const vistos=new Set();
 return linhas.slice(1).map((a,i)=>{
  if(a.length!==5)falhar('PLANILHA_COLUNAS_INVALIDAS_LINHA_'+(i+2));
  const [produtoId,fornecedor,sku,preco,quantia]=a;
  if(!ID.test(produtoId)||vistos.has(produtoId)||
     !valido(fornecedor,90)||fornecedor.length<2||
     !ID.test(sku)||! /^(?:[1-9][0-9]{0,6})(?:,[0-9]{2})?$/.test(preco)||
     !/^(?:0|[1-9][0-9]{0,6})$/.test(quantia))
   falhar('PLANILHA_DADOS_INVALIDOS_LINHA_'+(i+2));
  vistos.add(produtoId);
  const centavos=preco.includes(',')?
   Number(preco.replace(',','')):Number(preco)*100;
  const quantidade=Number(quantia);
  if(!Number.isSafeInteger(centavos)||centavos<1||centavos>100000000||
     !Number.isSafeInteger(quantidade)||quantidade>1000000)
   falhar('PLANILHA_DADOS_INVALIDOS_LINHA_'+(i+2));
  return {produtoId,fornecedor,skuFornecedor:sku,
   precoCentavos:centavos,quantidade};
 });
}
class CanaisFornecedorAkitemmSQLite {
 constructor({banco,auditoria=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    typeof agora!=='function'||(auditoria&&auditoria.db!==banco))
   falhar('CANAL_BANCO_INVALIDO');
  this.db=banco;this.auditoria=auditoria;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_canais_fornecedor(',
   'produto_id TEXT PRIMARY KEY REFERENCES loja_real_produtos(produto_id) ON DELETE RESTRICT,',
   "canal TEXT NOT NULL CHECK(canal IN ('PROPRIO','FORNECEDOR_MANUAL','PLANILHA_CSV','API_PENDENTE','ERP_PENDENTE','MARKETPLACE_PENDENTE')),",
   'fornecedor_nome TEXT NOT NULL,fornecedor_sku TEXT NOT NULL,',
   'fornecedor_contato TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));'
  ].join(' '));
 }
 consultar(produtoId){
  if(typeof produtoId!=='string'||!ID.test(produtoId))
   falhar('CANAL_PRODUTO_INVALIDO');
  const r=this.db.prepare([
   'SELECT canal,fornecedor_nome,fornecedor_sku,fornecedor_contato,revisao',
   'FROM loja_real_canais_fornecedor WHERE produto_id=?'
  ].join(' ')).get(produtoId);
  return r?Object.freeze({
   canal:r.canal,fornecedorNome:r.fornecedor_nome,
   fornecedorSku:r.fornecedor_sku,fornecedorContato:r.fornecedor_contato,
   revisao:r.revisao,conectado:false,automatico:false
  }):Object.freeze({
   canal:'PROPRIO',fornecedorNome:'',fornecedorSku:'',
   fornecedorContato:'',revisao:0,conectado:false,automatico:false
  });
 }
 configurar({produtoId,canal,fornecedorNome='',fornecedorSku='',
  fornecedorContato='',revisaoEsperada}={}){
  if(typeof produtoId!=='string'||!ID.test(produtoId)||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0||
     !valido(fornecedorNome,90)||!valido(fornecedorContato,160)||
     (fornecedorSku!==''&&!ID.test(fornecedorSku)))
   falhar('CANAL_DADOS_INVALIDOS');
  if(!CANAIS.has(canal)){
   if(PENDENTES.has(canal))falhar('CANAL_CONEXAO_EXTERNA_PENDENTE');
   falhar('CANAL_DADOS_INVALIDOS');
  }
  if(canal!=='PROPRIO'&&
     (fornecedorNome.trim().length<2||fornecedorSku.trim().length<1))
   falhar('CANAL_FORNECEDOR_INCOMPLETO');
  if(canal==='FORNECEDOR_MANUAL'&&fornecedorContato.trim().length<5)
   falhar('CANAL_CONTATO_OBRIGATORIO');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falhar('CANAL_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const existe=this.db.prepare(
    'SELECT produto_id FROM loja_real_produtos WHERE produto_id=?'
   ).get(produtoId);
   if(!existe)falhar('CANAL_PRODUTO_NAO_ENCONTRADO');
   const anterior=this.consultar(produtoId);
   if(anterior.revisao!==revisaoEsperada)
    falhar('CANAL_REVISAO_CONCORRENTE');
   const proxima=revisaoEsperada+1;
   this.db.prepare([
    'INSERT INTO loja_real_canais_fornecedor',
    '(produto_id,canal,fornecedor_nome,fornecedor_sku,fornecedor_contato,revisao,atualizado_em)',
    'VALUES(?,?,?,?,?,?,?) ON CONFLICT(produto_id) DO UPDATE SET',
    'canal=excluded.canal,fornecedor_nome=excluded.fornecedor_nome,',
    'fornecedor_sku=excluded.fornecedor_sku,',
    'fornecedor_contato=excluded.fornecedor_contato,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,canal,canal==='PROPRIO'?'':fornecedorNome.trim(),
    canal==='PROPRIO'?'':fornecedorSku.trim(),
    canal==='PROPRIO'?'':fornecedorContato.trim(),proxima,ts);
   if(this.auditoria)this.auditoria.registrar({
    acao:'CANAL_FORNECEDOR_CONFIGURADO',ator:'ADMIN_COMERCIAL',
    entidade:'PRODUTO_'+produtoId,
    antes:{canal:anterior.canal,revisao:anterior.revisao},
    depois:{canal,revisao:proxima},
    revisaoAnterior:anterior.revisao,revisaoNova:proxima
   });
   this.db.exec('COMMIT');
   return this.consultar(produtoId);
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 // Preview sem mutação. Todos os SKUs precisam já existir no catálogo.
 preverCsv(texto){
  const dados=linhasCsv(texto);
  const consulta=this.db.prepare([
   'SELECT p.produto_id,a.revisao,a.preco_centavos,a.quantidade,',
   'c.revisao AS canal_revisao FROM loja_real_produtos p',
   'LEFT JOIN loja_real_anuncios_operador a ON a.produto_id=p.produto_id',
   'LEFT JOIN loja_real_canais_fornecedor c ON c.produto_id=p.produto_id',
   'WHERE p.produto_id=?'
  ].join(' '));
  const itens=dados.map(x=>{
   const r=consulta.get(x.produtoId);
   if(!r)falhar('PLANILHA_PRODUTO_NAO_CADASTRADO_'+x.produtoId);
   return {...x,revisaoAnuncio:r.revisao||0,
    revisaoCanal:r.canal_revisao||0,
    precoAnteriorCentavos:r.preco_centavos,
    quantidadeAnterior:r.quantidade};
  });
  const hash=createHash('sha256').update(texto).digest('hex');
  return {hash,itens,total:itens.length,gravou:false,
   pagamentoHabilitado:false,estoqueConfirmado:false};
 }
 importarCsv(texto,{hash,revisoes}={}){
  const previa=this.preverCsv(texto);
  if(previewMismatch(hash,previa.hash)||
     !Array.isArray(revisoes)||revisoes.length!==previa.total||
     revisoes.some((x,i)=>!Array.isArray(x)||x.length!==2||
      x[0]!==previa.itens[i].revisaoAnuncio||
      x[1]!==previa.itens[i].revisaoCanal))
   falhar('PLANILHA_PREVIA_DESATUALIZADA');
  const agora=this.agora();
  if(!Number.isSafeInteger(agora)||agora<1)falhar('PLANILHA_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   // Revalidar enquanto a escrita está bloqueada; não sobrescrever edição
   // de outro operador entre a prévia e a confirmação.
   const atual=this.preverCsv(texto);
   if(atual.itens.some((x,i)=>
      x.revisaoAnuncio!==revisoes[i][0]||
      x.revisaoCanal!==revisoes[i][1]))
    falhar('PLANILHA_PREVIA_DESATUALIZADA');
   const anuncio=this.db.prepare([
    'INSERT INTO loja_real_anuncios_operador',
    '(produto_id,origem,categoria,marca,preco_centavos,promocao_centavos,',
    'quantidade,revisao,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET',
    'origem=excluded.origem,preco_centavos=excluded.preco_centavos,',
    'promocao_centavos=NULL,quantidade=excluded.quantidade,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' '));
   const canal=this.db.prepare([
    'INSERT INTO loja_real_canais_fornecedor',
    '(produto_id,canal,fornecedor_nome,fornecedor_sku,',
    'fornecedor_contato,revisao,atualizado_em)',
    "VALUES(?,'PLANILHA_CSV',?,?,?, ?,?)",
    'ON CONFLICT(produto_id) DO UPDATE SET',
    "canal='PLANILHA_CSV',fornecedor_nome=excluded.fornecedor_nome,",
    'fornecedor_sku=excluded.fornecedor_sku,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' '));
   for(const x of atual.itens){
    // preço do CSV é rotulado PREÇO DE VITRINE, nunca custo do fornecedor.
    const registro=this.db.prepare(
     'SELECT categoria,marca FROM loja_real_anuncios_operador WHERE produto_id=?'
    ).get(x.produtoId);
    anuncio.run(x.produtoId,'API',registro?.categoria||'',
     registro?.marca||'',x.precoCentavos,null,x.quantidade,
     x.revisaoAnuncio+1,agora);
    const contato=this.db.prepare([
     'SELECT fornecedor_contato FROM loja_real_canais_fornecedor',
     'WHERE produto_id=?'
    ].join(' ')).get(x.produtoId);
    canal.run(x.produtoId,x.fornecedor,x.skuFornecedor,
     contato?.fornecedor_contato||'',x.revisaoCanal+1,agora);
    if(this.auditoria)this.auditoria.registrar({
     acao:'PLANILHA_FORNECEDOR_IMPORTADA',ator:'ADMIN_COMERCIAL',
     entidade:'PRODUTO_'+x.produtoId,
     antes:{revisao:x.revisaoAnuncio},
     depois:{revisao:x.revisaoAnuncio+1,canal:'PLANILHA_CSV'},
     revisaoAnterior:x.revisaoAnuncio,revisaoNova:x.revisaoAnuncio+1
    });
   }
   this.db.exec('COMMIT');
   return {gravou:true,total:atual.total,hash:previa.hash,
    pagamentoHabilitado:false,estoqueConfirmado:false};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
function previewMismatch(a,b){
 return typeof a!=='string'||!/^[a-f0-9]{64}$/.test(a)||a!==b;
}
module.exports={CanaisFornecedorAkitemmSQLite,linhasCsv};
