'use strict';
// Dados comerciais informados pelo operador para anuncio, separados do preco
// confirmado pelo PSP ou fornecedor. Nao habilita compra, frete ou posicoes.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const {CanaisFornecedorAkitemmSQLite}=require('./canais-fornecedor-akitemm-sqlite');
const {RascunhosCadastroAkitemmSQLite}=require('./rascunhos-cadastro-akitemm-sqlite');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const limite=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const texto=(s,max)=>typeof s==='string'&&s.length<=max&&
 !/[\u0000-\u001f\u007f]/.test(s);
class AnunciosManuaisAkitemmSQLite{
 constructor({banco,auditoria=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    typeof agora!=='function'||(auditoria&&auditoria.db!==banco))
   falha('ANUNCIO_OPERADOR_BANCO_INVALIDO');
  this.banco=banco;this.auditoria=auditoria;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_anuncios_operador(',
   'produto_id TEXT PRIMARY KEY REFERENCES loja_real_produtos(produto_id) ON DELETE RESTRICT,',
   "origem TEXT NOT NULL CHECK(origem IN ('PROPRIO','API')),",
   'categoria TEXT NOT NULL,marca TEXT NOT NULL,',
   'preco_centavos INTEGER CHECK(preco_centavos BETWEEN 1 AND 100000000),',
   'promocao_centavos INTEGER CHECK(promocao_centavos BETWEEN 1 AND 100000000),',
   'quantidade INTEGER CHECK(quantidade BETWEEN 0 AND 1000000),',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0),',
   'CHECK(promocao_centavos IS NULL OR',
   '(preco_centavos IS NOT NULL AND promocao_centavos<preco_centavos)));'
  ].join(' '));
  // Migração aditiva: a cor física é texto livre, SEM substituir a
  // classificação comercial verde/dourado/roxo/cinza do LOOP.
  if(!banco.prepare('PRAGMA table_info(loja_real_anuncios_operador)')
     .all().some(x=>x.name==='cor_descricao'))
   banco.exec("ALTER TABLE loja_real_anuncios_operador "+
    "ADD COLUMN cor_descricao TEXT NOT NULL DEFAULT ''");
  this.rascunhos=new RascunhosCadastroAkitemmSQLite({banco,agora});
  // Canal separado: preserva o CHECK legado PROPRIO/API e seus registros.
  this.canais=new CanaisFornecedorAkitemmSQLite({banco,auditoria,agora});
 }
 consultar(produtoId){
  if(!ID.test(produtoId))falha('ANUNCIO_PRODUTO_INVALIDO');
  const r=this.banco.prepare([
   'SELECT origem,categoria,marca,cor_descricao,preco_centavos,promocao_centavos,',
   'quantidade,revisao FROM loja_real_anuncios_operador WHERE produto_id=?'
  ].join(' ')).get(produtoId);
  return r?Object.freeze({
   produtoId,origem:r.origem,categoria:r.categoria,marca:r.marca,
   corDescricao:r.cor_descricao,
   precoCentavos:r.preco_centavos,promocaoCentavos:r.promocao_centavos,
   quantidade:r.quantidade,revisao:r.revisao
  }):Object.freeze({produtoId,origem:'PROPRIO',categoria:'',marca:'',
   corDescricao:'',
   precoCentavos:null,promocaoCentavos:null,quantidade:null,revisao:0});
 }
 atualizar({produtoId,origem,categoria,marca,corDescricao='',precoCentavos,
  promocaoCentavos,quantidade,revisaoEsperada}={}){
  if(!ID.test(produtoId)||!['PROPRIO','API'].includes(origem)||
    !texto(categoria,70)||!texto(marca,70)||!texto(corDescricao,120)||
    (precoCentavos!==null&&!limite(precoCentavos,1,100000000))||
    (promocaoCentavos!==null&&!limite(promocaoCentavos,1,100000000))||
    (quantidade!==null&&!limite(quantidade,0,1000000))||
    (promocaoCentavos!==null&&
      (precoCentavos===null||promocaoCentavos>=precoCentavos))||
    !limite(revisaoEsperada,0,1000000000))
   falha('ANUNCIO_DADOS_INVALIDOS');
  const ts=this.agora();
  if(!limite(ts,1,Number.MAX_SAFE_INTEGER))falha('ANUNCIO_RELOGIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const produto=this.banco.prepare(
    'SELECT produto_id FROM loja_real_produtos WHERE produto_id=?'
   ).get(produtoId);
   if(!produto)falha('ANUNCIO_PRODUTO_NAO_ENCONTRADO');
   const anterior=this.consultar(produtoId);
   if(anterior.revisao!==revisaoEsperada)falha('ANUNCIO_REVISAO_CONCORRENTE');
   const proxima=anterior.revisao+1;
   this.banco.prepare([
    'INSERT INTO loja_real_anuncios_operador(',
    'produto_id,origem,categoria,marca,cor_descricao,preco_centavos,promocao_centavos,',
    'quantidade,revisao,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?)',
    'ON CONFLICT(produto_id) DO UPDATE SET origem=excluded.origem,',
    'categoria=excluded.categoria,marca=excluded.marca,',
    'cor_descricao=excluded.cor_descricao,',
    'preco_centavos=excluded.preco_centavos,',
    'promocao_centavos=excluded.promocao_centavos,',
    'quantidade=excluded.quantidade,revisao=excluded.revisao,',
    'atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(produtoId,origem,categoria.trim(),marca.trim(),
    corDescricao.trim(),precoCentavos,promocaoCentavos,quantidade,proxima,ts);
   if(this.auditoria)this.auditoria.registrar({
    acao:'ANUNCIO_MANUAL_ALTERADO',ator:'ADMIN_COMERCIAL',
    entidade:'PRODUTO_'+produtoId,
    antes:{revisao:anterior.revisao,precoCentavos:anterior.precoCentavos,
     promocaoCentavos:anterior.promocaoCentavos,quantidade:anterior.quantidade},
    depois:{revisao:proxima,precoCentavos,promocaoCentavos,quantidade},
    revisaoAnterior:anterior.revisao,revisaoNova:proxima
   });
   this.banco.exec('COMMIT');
   return this.consultar(produtoId);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 projetar(produtos){
  if(!Array.isArray(produtos)||produtos.length>400)
   falha('ANUNCIO_PROJECAO_INVALIDA');
  const rows=this.banco.prepare([
   'SELECT produto_id,origem,categoria,marca,cor_descricao,preco_centavos,',
   'promocao_centavos,quantidade FROM loja_real_anuncios_operador'
  ].join(' ')).all();
  const map=new Map(rows.map(r=>[r.produto_id,r]));
  return produtos.map(p=>{
   const a=map.get(p.produtoId);
   const v=a?{
    origemCadastro:a.origem,categoriaVitrine:a.categoria,
    marcaVitrine:a.marca,corDescricao:a.cor_descricao,
    precoAnunciadoCentavos:
     a.promocao_centavos??a.preco_centavos,
    precoOriginalAnunciadoCentavos:a.promocao_centavos!==null?
     a.preco_centavos:null,
    estoqueInformadoOperador:a.quantidade,
    promocaoAtiva:a.promocao_centavos!==null,
    ofertaAtiva:a.promocao_centavos!==null
   }:{
    origemCadastro:null,categoriaVitrine:'',marcaVitrine:'',corDescricao:'',
    precoAnunciadoCentavos:null,precoOriginalAnunciadoCentavos:null,
    estoqueInformadoOperador:null,promocaoAtiva:false,ofertaAtiva:false
   };
   return Object.freeze({...p,...v,precoCentavos:null,compravel:false,
    checkoutReal:false,estoqueConfirmado:false,freteCalculado:false});
  });
 }
}
module.exports={AnunciosManuaisAkitemmSQLite};
