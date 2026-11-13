'use strict';
// Ofertas compostas SOMENTE no laboratorio: o carrinho continua composto
// por SKUs reais, com precos, fornecedores e remessas individualizados.
// Nenhum pacote cria pagamento, estoque, posicao ou credito comercial.
const ID=/^[a-z0-9-]{3,80}$/;
const CORES=new Set(['CINZA','VERDE','DOURADO','ROXO']);
const ESTADOS=new Set(['RASCUNHO','PUBLICADO']);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validar(id,x){
 if(typeof id!=='string'||!ID.test(id)||!x||typeof x!=='object'||
    Array.isArray(x)||Object.keys(x).sort().join(',')!==
    'cor,estado,itens,nome,posicoesPorPedido,revisaoEsperada')
  erro('OFERTA_COMPOSTA_CAMPOS_INVALIDOS');
 if(typeof x.nome!=='string'||x.nome.trim().length<3||
    x.nome.trim().length>120||/[<>\u0000-\u001f]/.test(x.nome)||
    !CORES.has(x.cor)||!ESTADOS.has(x.estado)||
    !Number.isSafeInteger(x.revisaoEsperada)||x.revisaoEsperada<0||
    !Number.isSafeInteger(x.posicoesPorPedido)||x.posicoesPorPedido<0||
    x.posicoesPorPedido>10||
    (x.cor==='CINZA'&&x.posicoesPorPedido!==0)||
    (x.cor==='VERDE'&&x.posicoesPorPedido!==1))
  erro('OFERTA_COMPOSTA_REGRA_INVALIDA');
 if(!Array.isArray(x.itens)||x.itens.length<2||x.itens.length>20)
  erro('OFERTA_COMPOSTA_ITENS_INVALIDOS');
 const vistos=new Set(),itens=[];
 for(const item of x.itens){
  if(!item||typeof item!=='object'||Array.isArray(item)||
     Object.keys(item).sort().join(',')!=='produtoId,quantidade'||
     typeof item.produtoId!=='string'||!ID.test(item.produtoId)||
     !Number.isSafeInteger(item.quantidade)||item.quantidade<1||
     item.quantidade>50||vistos.has(item.produtoId))
   erro('OFERTA_COMPOSTA_ITENS_INVALIDOS');
  vistos.add(item.produtoId);
  itens.push({produtoId:item.produtoId,quantidade:item.quantidade});
 }
 return {id,nome:x.nome.trim(),cor:x.cor,estado:x.estado,
  posicoesPorPedido:x.posicoesPorPedido,itens};
}
class OfertasCompostasCandidatoSQLite{
 constructor({banco,catalogo}={}){
  if(process.env.NODE_ENV==='production')erro('OFERTAS_COMPOSTAS_LAB_PROIBIDAS_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     catalogo?.db!==banco||typeof catalogo?.buscar!=='function')
   erro('OFERTAS_COMPOSTAS_FONTE_SQLITE_INVALIDA');
  this.db=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_ofertas_compostas_staging(',
   'id TEXT PRIMARY KEY,dados_json TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_ofertas_compostas_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,oferta_id TEXT NOT NULL',
   'REFERENCES akitemm_ofertas_compostas_staging(id) ON DELETE RESTRICT,',
   'revisao INTEGER NOT NULL,antes_json TEXT,depois_json TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,UNIQUE(oferta_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS ofertas_compostas_hist_no_update',
   'BEFORE UPDATE ON akitemm_ofertas_compostas_historico',
   "BEGIN SELECT RAISE(ABORT,'historico de ofertas imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS ofertas_compostas_hist_no_delete',
   'BEFORE DELETE ON akitemm_ofertas_compostas_historico',
   "BEGIN SELECT RAISE(ABORT,'historico de ofertas imutavel'); END;"
  ].join(' '));
 }
 _registro(row){
  if(!row)return null;
  const dados=JSON.parse(row.dados_json);
  return {...dados,revisao:row.revisao,atualizadoEm:row.atualizado_em};
 }
 consultar(id){
  if(typeof id!=='string'||!ID.test(id))erro('OFERTA_COMPOSTA_ID_INVALIDO');
  const r=this.db.prepare(
   'SELECT * FROM akitemm_ofertas_compostas_staging WHERE id=?'
  ).get(id);
  return this._registro(r);
 }
 listar({publicadas=false}={}){
  return this.db.prepare(
   'SELECT * FROM akitemm_ofertas_compostas_staging ORDER BY id'
  ).all().map(r=>this._registro(r)).filter(r=>
   !publicadas||r.estado==='PUBLICADO');
 }
 historico(id){
  if(typeof id!=='string'||!ID.test(id))erro('OFERTA_COMPOSTA_ID_INVALIDO');
  return this.db.prepare([
   'SELECT revisao,antes_json AS antesJson,depois_json AS depoisJson,',
   'criado_em AS criadoEm FROM akitemm_ofertas_compostas_historico',
   'WHERE oferta_id=? ORDER BY revisao DESC LIMIT 100'
  ].join(' ')).all(id).map(x=>({revisao:x.revisao,criadoEm:x.criadoEm,
   antes:x.antesJson?JSON.parse(x.antesJson):null,
   depois:JSON.parse(x.depoisJson)}));
 }
 async salvar(id,entrada){
  const dados=validar(id,entrada);
  let precoMinimo=0;
  for(const item of dados.itens){
   const p=await this.catalogo.buscar(item.produtoId);
   if(!p||!['PDF','FISICO'].includes(p.tipo)||
      !Number.isSafeInteger(p.precoCentavos)||p.precoCentavos<=0||
      (dados.estado==='PUBLICADO'&&p.estado!=='PUBLICADO'))
    erro('OFERTA_COMPOSTA_PRODUTO_INDISPONIVEL');
   precoMinimo+=p.precoCentavos*item.quantidade;
   if(!Number.isSafeInteger(precoMinimo)||precoMinimo>100000000)
    erro('OFERTA_COMPOSTA_VALOR_EXCEDIDO');
  }
  if(dados.estado==='PUBLICADO'&&dados.cor==='DOURADO'&&
     dados.posicoesPorPedido>0&&precoMinimo<25000)
   erro('OFERTA_COMPOSTA_DOURADA_SEM_PISO');
  const db=this.db;db.exec('BEGIN IMMEDIATE');
  try{
   const antiga=this.consultar(id),revisao=antiga?.revisao||0;
   if(revisao!==entrada.revisaoEsperada)erro('CONFLITO_REVISAO');
   const agora=Date.now(),nova=revisao+1;
   db.prepare([
    'INSERT INTO akitemm_ofertas_compostas_staging',
    '(id,dados_json,revisao,atualizado_em) VALUES(?,?,?,?)',
    'ON CONFLICT(id) DO UPDATE SET dados_json=excluded.dados_json,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(id,JSON.stringify(dados),nova,agora);
   db.prepare([
    'INSERT INTO akitemm_ofertas_compostas_historico',
    '(oferta_id,revisao,antes_json,depois_json,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(id,nova,antiga?JSON.stringify(antiga):null,
    JSON.stringify(dados),agora);
   db.exec('COMMIT');
   return this.consultar(id);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 async publicas(){
  const resultado=[];
  for(const oferta of this.listar({publicadas:true})){
   let total=0,valida=true;
   const itens=[];
   for(const componente of oferta.itens){
    const p=await this.catalogo.buscar(componente.produtoId);
    if(!p||p.estado!=='PUBLICADO'){valida=false;break;}
    total+=p.precoCentavos*componente.quantidade;
    if(!Number.isSafeInteger(total)||total>100000000){
     valida=false;break;
    }
    itens.push({...componente,nome:p.nome,
     precoUnitarioCentavos:p.precoCentavos});
   }
   if(!valida||(oferta.cor==='DOURADO'&&
      oferta.posicoesPorPedido>0&&total<25000))continue;
   resultado.push({id:oferta.id,nome:oferta.nome,cor:oferta.cor,
    posicoesPorPedido:oferta.posicoesPorPedido,itens,
    precoPacoteCentavos:total,revisao:oferta.revisao,
    apenasEnsaio:true});
  }
  return resultado;
 }
 // Chamado dentro da transacao IMEDIATA do prepedido.
 // Usa apenas os itens ja cotados; nunca confia em precos do navegador.
 fotografar(itens,{ofertaId=undefined,revisaoEsperada=null}={}){
  if(!Array.isArray(itens))erro('OFERTA_COMPOSTA_PEDIDO_INVALIDO');
  if(ofertaId!==undefined&&ofertaId!==null&&
     (typeof ofertaId!=='string'||!ID.test(ofertaId)))
   erro('OFERTA_COMPOSTA_ID_INVALIDO');
  if(revisaoEsperada!==null&&(!Number.isSafeInteger(revisaoEsperada)||
    revisaoEsperada<1||ofertaId===undefined||ofertaId===null))
   erro('OFERTA_COMPOSTA_REVISAO_INVALIDA');
  // null = carrinho normal, nao aplica kit; undefined = compatibilidade
  // com API antiga: unico pacote elegivel aplica automaticamente.
  if(ofertaId===null)return [];
  const mapa=new Map(itens.map(i=>[i.produtoId,i]));
  const candidatas=this.listar({publicadas:true}).filter(o=>
   (ofertaId===undefined||o.id===ofertaId)&&
   o.itens.every(x=>mapa.has(x.produtoId)&&
    mapa.get(x.produtoId).quantidade>=x.quantidade));
  if(ofertaId!==undefined&&candidatas.length!==1)
   erro('OFERTA_COMPOSTA_NAO_DISPONIVEL_NO_CARRINHO');
  if(ofertaId===undefined&&candidatas.length>1)return [];
  const pacotes=[];
  for(const oferta of candidatas){
   if(revisaoEsperada!==null&&oferta.revisao!==revisaoEsperada)
    erro('OFERTA_COMPOSTA_ALTERADA_REFAZER_COTACAO');
   const componentes=oferta.itens.map(x=>{
    const item=mapa.get(x.produtoId);
    if(!Number.isSafeInteger(item.precoUnitarioCentavos)||item.precoUnitarioCentavos<=0)
     erro('OFERTA_COMPOSTA_COTACAO_INVALIDA');
    return {...x,precoUnitarioCentavos:item.precoUnitarioCentavos,
     subtotalCentavos:x.quantidade*item.precoUnitarioCentavos};
   });
   const total=componentes.reduce((s,x)=>s+x.subtotalCentavos,0);
   if(!Number.isSafeInteger(total)||total<=0||
      (oferta.cor==='DOURADO'&&oferta.posicoesPorPedido>0&&total<25000))
    erro('OFERTA_COMPOSTA_VALOR_INVALIDO');
   pacotes.push({id:oferta.id,nome:oferta.nome,cor:oferta.cor,
    revisao:oferta.revisao,posicoesPorPedido:oferta.posicoesPorPedido,
    itens:componentes,totalPacoteCentavos:total});
  }
  return pacotes;
 }
}
module.exports={OfertasCompostasCandidatoSQLite};
