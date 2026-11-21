'use strict';
// Entrega propria limitada por municipio. Configuracao administrativa;
// o endereco do cliente so entra na validacao do carrinho, nunca na vitrine.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const UF=/^[A-Z]{2}$/;
const NOME=/^[\p{L} .'-]{2,70}$/u;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function normalizar(x){
 return x.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
}
function cidadesValidas(lista){
 return Array.isArray(lista)&&lista.length>=1&&lista.length<=50&&
  lista.every(x=>typeof x==='string'&&NOME.test(x.trim()))&&
  new Set(lista.map(normalizar)).size===lista.length;
}
class EntregaLocalAkitemmSQLite{
 constructor({banco,auditoria=null,agora=()=>Date.now()}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
    typeof agora!=='function'||(auditoria&&auditoria.db!==banco))
   falha('ENTREGA_BANCO_INVALIDO');
  this.db=banco;this.auditoria=auditoria;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_entrega_local_produto(',
   'produto_id TEXT PRIMARY KEY REFERENCES loja_real_produtos(produto_id) ON DELETE RESTRICT,',
   "modo TEXT NOT NULL CHECK(modo IN ('NACIONAL','MUNICIPIOS')),",
   'uf TEXT NOT NULL,municipios_json TEXT NOT NULL,',
   'taxa_centavos INTEGER,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0),',
   "CHECK((modo='NACIONAL' AND uf='' AND municipios_json='[]' AND taxa_centavos IS NULL)",
   "OR (modo='MUNICIPIOS' AND length(uf)=2 AND",
   'taxa_centavos BETWEEN 0 AND 1000000)));'
  ].join(' '));
 }
 consultar(produtoId){
  if(typeof produtoId!=='string'||!ID.test(produtoId))
   falha('ENTREGA_PRODUTO_INVALIDO');
  const r=this.db.prepare([
   'SELECT modo,uf,municipios_json,taxa_centavos,revisao',
   'FROM loja_real_entrega_local_produto WHERE produto_id=?'
  ].join(' ')).get(produtoId);
  return r?Object.freeze({
   produtoId,modo:r.modo,uf:r.uf,
   municipios:JSON.parse(r.municipios_json),
   taxaCentavos:r.taxa_centavos,revisao:r.revisao
  }):Object.freeze({produtoId,modo:'NACIONAL',uf:'',
   municipios:[],taxaCentavos:null,revisao:0});
 }
 configurar({produtoId,modo,uf,municipios,taxaCentavos,
  revisaoEsperada}={}){
  if(!ID.test(produtoId)||!['NACIONAL','MUNICIPIOS'].includes(modo)||
    !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0||
    (modo==='NACIONAL'&&
     (uf!==''||!Array.isArray(municipios)||municipios.length!==0||
      taxaCentavos!==null))||
    (modo==='MUNICIPIOS'&&
     (!UF.test(uf)||!cidadesValidas(municipios)||
      !Number.isSafeInteger(taxaCentavos)||
      taxaCentavos<0||taxaCentavos>1000000)))
   falha('ENTREGA_REGRA_INVALIDA');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falha('ENTREGA_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(!this.db.prepare('SELECT 1 ok FROM loja_real_produtos WHERE produto_id=?')
    .get(produtoId))falha('ENTREGA_PRODUTO_NAO_ENCONTRADO');
   const anterior=this.consultar(produtoId);
   if(anterior.revisao!==revisaoEsperada)
    falha('ENTREGA_REVISAO_CONCORRENTE');
   const revisao=anterior.revisao+1;
   const nomes=municipios.map(x=>x.trim());
   this.db.prepare([
    'INSERT INTO loja_real_entrega_local_produto(',
    'produto_id,modo,uf,municipios_json,taxa_centavos,revisao,atualizado_em)',
    'VALUES(?,?,?,?,?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET modo=excluded.modo,',
    'uf=excluded.uf,municipios_json=excluded.municipios_json,',
    'taxa_centavos=excluded.taxa_centavos,revisao=excluded.revisao,',
    'atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,modo,uf,JSON.stringify(nomes),
    taxaCentavos,revisao,ts);
   if(this.auditoria)this.auditoria.registrar({
    acao:'ENTREGA_LOCAL_ALTERADA',ator:'ADMIN_COMERCIAL',
    entidade:'PRODUTO_'+produtoId,
    antes:{modo:anterior.modo,revisao:anterior.revisao},
    depois:{modo,uf,quantidadeMunicipios:nomes.length,revisao},
    revisaoAnterior:anterior.revisao,revisaoNova:revisao
   });
   this.db.exec('COMMIT');
   return this.consultar(produtoId);
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 validarCidade({produtoId,uf,cidade}={}){
  if(!ID.test(produtoId)||!UF.test(uf)||
     typeof cidade!=='string'||!NOME.test(cidade.trim()))
   falha('ENTREGA_ENDERECO_INVALIDO');
  const politica=this.consultar(produtoId);
  if(politica.modo==='NACIONAL')
   return {produtoId,permitido:true,entregaPropria:false,
    taxaCentavos:null};
  const permitido=uf===politica.uf&&
   politica.municipios.some(x=>normalizar(x)===normalizar(cidade));
  return {produtoId,permitido,entregaPropria:permitido,
   taxaCentavos:permitido?politica.taxaCentavos:null};
 }
 validarCarrinho({produtos,uf,cidade}={}){
  if(!Array.isArray(produtos)||produtos.length<1||
     produtos.length>400||new Set(produtos).size!==produtos.length)
   falha('ENTREGA_CARRINHO_INVALIDO');
  const itens=produtos.map(produtoId=>
   this.validarCidade({produtoId,uf,cidade}));
  const recusados=itens.filter(x=>!x.permitido).map(x=>x.produtoId);
  const locais=itens.filter(x=>x.entregaPropria);
  return {entregaDisponivel:recusados.length===0,
   produtosForaDaRegiao:recusados,
   // Uma unica entrega do mesmo operador: nunca soma a mesma rota várias vezes.
   taxaEntregaPropriaCentavos:recusados.length===0&&locais.length?
    Math.max(...locais.map(x=>x.taxaCentavos)):null,
   requerOutraCotacao:itens.some(x=>!x.entregaPropria),
   checkoutReal:false,autorizaCobranca:false};
 }
}
module.exports={EntregaLocalAkitemmSQLite};
