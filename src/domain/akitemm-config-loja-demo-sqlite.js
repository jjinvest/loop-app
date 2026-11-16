'use strict';
const {randomBytes}=require('node:crypto');
const {dimensoesImagem}=require('./novidades-loja-candidato-sqlite');
// Configuracoes da vitrine AKITEMM, administradas apenas no laboratorio local.
// Nada vem de produto inventado; links e banners exigem cadastro manual.
const URLS={
 instagram:/^https:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.\/-]+(?:\?.*)?$/,
 youtube:/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[a-zA-Z0-9_?=&.\/-]+$/,
 facebook:/^https:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.?=&\/-]+$/,
 whatsapp:/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\/[a-zA-Z0-9?=&\/-]+$/
};
const IMG=/^(?:\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)|\/staging\/vitrine\/loja\/banner-arquivo\/[a-f0-9]{32})$/;
const ID=/^[a-z0-9-]{3,80}$/;
const CORES_VITRINE=['ROXO','DOURADO','VERDE','CINZA'];
const PADRAO_VITRINE=['ROXO','DOURADO','VERDE','CINZA','CINZA','VERDE','DOURADO','ROXO'];
const DEFAULT=()=>({
 banners:[],redes:{instagram:'',youtube:'',facebook:'',whatsapp:''},
 informacoes:{sobre:'',privacidade:'',trocas:'',contato:'',suporte:''},
 ofertas:[],vitrineSlots:Array.from({length:200},(_,i)=>PADRAO_VITRINE[i%8])
});
function validar(dados){
 if(!dados||typeof dados!=='object'||Array.isArray(dados)||
  !['banners,informacoes,ofertas,redes',
    'banners,informacoes,ofertas,redes,vitrineSlots'].includes(
      Object.keys(dados).sort().join(',')))
  throw Error('CONFIG_LOJA_INVALIDA');
 const {banners,redes,informacoes,ofertas}=dados;
 const slots=dados.vitrineSlots===undefined?[...PADRAO_VITRINE]:dados.vitrineSlots;
 if(!Array.isArray(slots)||![8,200].includes(slots.length)||
    !slots.every(cor=>CORES_VITRINE.includes(cor)))
  throw Error('VITRINE_SLOTS_INVALIDOS');
 if(!Array.isArray(banners)||banners.length>8||!Array.isArray(ofertas)||ofertas.length>50||
   !redes||!informacoes||Object.keys(redes).sort().join(',')!=='facebook,instagram,whatsapp,youtube'||
   Object.keys(informacoes).sort().join(',')!=='contato,privacidade,sobre,suporte,trocas')
  throw Error('CONFIG_LOJA_INVALIDA');
 for(const [key,regex] of Object.entries(URLS))
  if(typeof redes[key]!=='string'||redes[key].length>250||
    (redes[key]&&!regex.test(redes[key])))throw Error('REDE_SOCIAL_INVALIDA');
 for(const valor of Object.values(informacoes))
  if(typeof valor!=='string'||valor.length>2500||/[\u0000-\u0008\u000b-\u001f]/.test(valor))
   throw Error('TEXTO_LOJA_INVALIDO');
 if(!ofertas.every(v=>typeof v==='string'&&ID.test(v))||new Set(ofertas).size!==ofertas.length)
  throw Error('OFERTAS_INVALIDAS');
 for(const b of banners){
  if(!b||typeof b!=='object'||Array.isArray(b)||
    Object.keys(b).sort().join(',')!=='descricao,imagemCaminho,produtoId,titulo'||
    typeof b.titulo!=='string'||b.titulo.trim().length<3||b.titulo.length>90||
    typeof b.descricao!=='string'||b.descricao.length>250||
    typeof b.imagemCaminho!=='string'||(b.imagemCaminho&&!IMG.test(b.imagemCaminho))||
    typeof b.produtoId!=='string'||(b.produtoId&&!ID.test(b.produtoId)))
    throw Error('BANNER_INVALIDO');
 }
 return {banners:banners.map(b=>({...b})),redes:{...redes},
  informacoes:{...informacoes},ofertas:[...ofertas],vitrineSlots:Array.from({length:200},(_,i)=>slots[i]||slots[i%8])};
}
class AkitemmConfigLojaDemoSQLite{
 constructor({banco}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw TypeError('SQLite obrigatório');
  this.banco=banco;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_akitemm_config_loja_demo(
    id INTEGER PRIMARY KEY CHECK(id=1),
    dados_json TEXT NOT NULL,atualizado_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_akitemm_config_loja_versoes(
    id INTEGER PRIMARY KEY CHECK(id=1),
    revisao INTEGER NOT NULL CHECK(revisao>0)
   );
   CREATE TABLE IF NOT EXISTS admin_akitemm_config_loja_auditoria(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revisao INTEGER NOT NULL UNIQUE CHECK(revisao>0),
    antes_json TEXT NOT NULL,depois_json TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_akitemm_config_audit_no_update
    BEFORE UPDATE ON admin_akitemm_config_loja_auditoria
    BEGIN SELECT RAISE(ABORT,'historico configuracao imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_akitemm_config_audit_no_delete
    BEFORE DELETE ON admin_akitemm_config_loja_auditoria
    BEGIN SELECT RAISE(ABORT,'historico configuracao imutavel'); END;
   CREATE TABLE IF NOT EXISTS admin_akitemm_banner_arquivos_v1(
    id TEXT PRIMARY KEY CHECK(length(id)=32),
    mime TEXT NOT NULL,
    imagem BLOB NOT NULL,
    criado_em INTEGER NOT NULL
   );
  `);
 }
 salvarImagemBanner({mime,bytes}={}){
  if(!['image/jpeg','image/png','image/webp'].includes(mime)||
     !Buffer.isBuffer(bytes)||bytes.length<40||bytes.length>4*1024*1024||
     !dimensoesImagem(bytes,mime))
   throw Error('BANNER_IMAGEM_INVALIDA');
  const png=mime==='image/png'&&bytes.subarray(0,8).equals(
   Buffer.from('89504e470d0a1a0a','hex'));
  const jpg=mime==='image/jpeg'&&
   bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))&&
   bytes.subarray(-2).equals(Buffer.from('ffd9','hex'));
  const webp=mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&
   bytes.toString('ascii',8,12)==='WEBP'&&
   bytes.readUInt32LE(4)===bytes.length-8;
  if(!png&&!jpg&&!webp)throw Error('BANNER_IMAGEM_INVALIDA');
  const id=randomBytes(16).toString('hex');
  this.banco.prepare([
   'INSERT INTO admin_akitemm_banner_arquivos_v1',
   '(id,mime,imagem,criado_em) VALUES(?,?,?,?)'
  ].join(' ')).run(id,mime,bytes,Date.now());
  return {id,imagemCaminho:'/staging/vitrine/loja/banner-arquivo/'+id};
 }
 abrirImagemBanner(id,{publico=false}={}){
  if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))
   throw Error('BANNER_IMAGEM_INVALIDA');
  const caminho='/staging/vitrine/loja/banner-arquivo/'+id;
  if(publico&&!this.consultar().banners.some(b=>b.imagemCaminho===caminho))
   throw Error('BANNER_NAO_PUBLICADO');
  const img=this.banco.prepare(
   'SELECT mime,imagem FROM admin_akitemm_banner_arquivos_v1 WHERE id=?'
  ).get(id);
  if(!img?.imagem)throw Error('BANNER_IMAGEM_INEXISTENTE');
  return {mime:img.mime,bytes:Buffer.from(img.imagem)};
 }
 consultar(){
  const r=this.banco.prepare(
   'SELECT dados_json AS dados FROM admin_akitemm_config_loja_demo WHERE id=1'
  ).get();
  const dados=r?JSON.parse(r.dados):DEFAULT();
  // Bancos anteriores não tinham disposição de cartões: migração sem perda.
  const anteriores=Array.isArray(dados.vitrineSlots)?dados.vitrineSlots:PADRAO_VITRINE;
  return {...dados,vitrineSlots:Array.from({length:200},(_,i)=>anteriores[i]||anteriores[i%8]||PADRAO_VITRINE[i%8])};
 }
 revisao(){
  return this.banco.prepare(
   'SELECT revisao FROM admin_akitemm_config_loja_versoes WHERE id=1'
  ).get()?.revisao||0;
 }
 consultarComRevisao(){
  return {config:this.consultar(),revisao:this.revisao(),apenasEnsaio:true};
 }
 salvarComRevisao({config,revisaoEsperada}={}){
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   throw Error('CONFIG_REVISAO_INVALIDA');
  const correto=validar(config);
  const banco=this.banco;
  banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.revisao();
   if(atual!==revisaoEsperada)throw Error('CONFIG_CONFLITO_REVISAO');
   const anterior=this.consultar();
   const agora=new Date().toISOString();
   const proxima=atual+1;
   banco.prepare(`INSERT INTO admin_akitemm_config_loja_demo
    (id,dados_json,atualizado_em) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET dados_json=excluded.dados_json,
     atualizado_em=excluded.atualizado_em`
   ).run(JSON.stringify(correto),agora);
   banco.prepare(`INSERT INTO admin_akitemm_config_loja_versoes
    (id,revisao) VALUES(1,?)
    ON CONFLICT(id) DO UPDATE SET revisao=excluded.revisao`).run(proxima);
   banco.prepare(`INSERT INTO admin_akitemm_config_loja_auditoria
    (revisao,antes_json,depois_json,atualizado_em) VALUES(?,?,?,?)`
   ).run(proxima,JSON.stringify(anterior),JSON.stringify(correto),agora);
   banco.exec('COMMIT');
   return {config:correto,revisao:proxima,apenasEnsaio:true};
  }catch(e){banco.exec('ROLLBACK');throw e;}
 }
 // Compatibilidade com os antigos testes locais: a escrita passa pelo mesmo
 // mecanismo transacional, histórico e incrementos de revisão.
 salvar(dados){
  return this.salvarComRevisao({
   config:dados,revisaoEsperada:this.revisao()
  }).config;
 }
}
module.exports={AkitemmConfigLojaDemoSQLite};
