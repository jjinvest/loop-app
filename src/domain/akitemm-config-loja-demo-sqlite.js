'use strict';
// Configuracoes da vitrine AKITEMM, administradas apenas no laboratorio local.
// Nada vem de produto inventado; links e banners exigem cadastro manual.
const URLS={
 instagram:/^https:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.\/-]+(?:\?.*)?$/,
 youtube:/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[a-zA-Z0-9_?=&.\/-]+$/,
 facebook:/^https:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.?=&\/-]+$/,
 whatsapp:/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\/[a-zA-Z0-9?=&\/-]+$/
};
const IMG=/^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/;
const ID=/^[a-z0-9-]{3,80}$/;
const DEFAULT=()=>({
 banners:[],redes:{instagram:'',youtube:'',facebook:'',whatsapp:''},
 informacoes:{sobre:'',privacidade:'',trocas:'',contato:'',suporte:''},
 ofertas:[]
});
function validar(dados){
 if(!dados||typeof dados!=='object'||Array.isArray(dados)||
  Object.keys(dados).sort().join(',')!=='banners,informacoes,ofertas,redes')
  throw Error('CONFIG_LOJA_INVALIDA');
 const {banners,redes,informacoes,ofertas}=dados;
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
  informacoes:{...informacoes},ofertas:[...ofertas]};
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
  `);
 }
 consultar(){
  const r=this.banco.prepare(
   'SELECT dados_json AS dados FROM admin_akitemm_config_loja_demo WHERE id=1'
  ).get();
  return r?JSON.parse(r.dados):DEFAULT();
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
