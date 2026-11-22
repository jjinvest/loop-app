'use strict';
// Mosaico opcional por banner: 1 foto panorâmica, 2 ou 3 quadros.
// Os arquivos dos quatro banners originais permanecem intactos.
const CONFIGS={
 loop:{
  primeira:'loop_banner_escritorio_manual',
  extensao:'loop_banner_escritorio_extensao',
  prefixo:'loop_banner_mosaico'
 },
 akitemm:{
  primeira:'loja_real_banners_akitemm',
  extensao:'loja_real_banners_akitemm_extensao',
  prefixo:'akitemm_banner_mosaico'
 }
};
function falhar(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class BannerMosaicoSQLite{
 constructor({banco,area,validarImagem,agora=()=>Date.now()}={}){
  if(!CONFIGS[area]||typeof banco?.prepare!=='function'||
     typeof validarImagem!=='function')falhar('BANNER_MOSAICO_INVALIDO');
  this.banco=banco;this.cfg=CONFIGS[area];this.validarImagem=validarImagem;
  this.agora=agora;
  const p=this.cfg.prefixo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS '+p+'_layout(',
   'slot INTEGER PRIMARY KEY CHECK(slot>=1),',
   'colunas INTEGER NOT NULL CHECK(colunas IN (1,2,3)),',
   "modo TEXT NOT NULL DEFAULT 'PREENCHER' ",
   "CHECK(modo IN ('INTEIRA','PREENCHER')));",
   'CREATE TABLE IF NOT EXISTS '+p+'_foto(',
   'slot INTEGER NOT NULL CHECK(slot>=1),',
   'posicao INTEGER NOT NULL CHECK(posicao IN (2,3)),',
   'mime TEXT NOT NULL,imagem BLOB NOT NULL,',
   'PRIMARY KEY(slot,posicao));'
  ].join(' '));
 }
 _principal(slot){
  if(!Number.isSafeInteger(slot)||slot<1||slot>10000)
   falhar('BANNER_MOSAICO_SLOT_INVALIDO');
  return slot<=4?this.cfg.primeira:this.cfg.extensao;
 }
 _colunas(n){
  if(!Number.isInteger(n)||n<1||n>3)falhar('BANNER_MOSAICO_LAYOUT_INVALIDO');
  return n;
 }
 _revisao(n){
  if(!Number.isSafeInteger(n)||n<0)
   falhar('BANNER_MOSAICO_REVISAO_INVALIDA');
  return n;
 }
 listar(slots){
  const p=this.cfg.prefixo;
  const layouts=new Map(this.banco.prepare(
   'SELECT slot,colunas,modo FROM '+p+'_layout'
  ).all().map(x=>[x.slot,{colunas:x.colunas,modo:x.modo}]));
  const imagens=new Set(this.banco.prepare(
   'SELECT slot,posicao FROM '+p+'_foto'
  ).all().map(x=>x.slot+':'+x.posicao));
  return slots.map(s=>{
   const op=layouts.get(s.slot),colunas=op?.colunas||1;
   const modo=op?.modo||s.enquadramento||(colunas===1?'INTEIRA':'PREENCHER');
   const fotos=[{posicao:1,temImagem:s.temImagem},2,3].map((x,i)=>
    i===0?x:{posicao:i+1,temImagem:imagens.has(s.slot+':'+(i+1))});
   // Cada moldura é publicada ao receber a primeira foto; as demais são opcionais.
   const publicado=fotos.slice(0,colunas).some(x=>x.temImagem);
   return {...s,colunas,modo,fotos,publicado};
  });
 }
 _mutar(slot,revisaoEsperada,executar){
  const tabela=this._principal(slot),rev=this._revisao(revisaoEsperada);
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare(
    'SELECT revisao FROM '+tabela+' WHERE slot=?'
   ).get(slot);
   if(!anterior||anterior.revisao!==rev)
    falhar('BANNER_MOSAICO_CONFLITO_REVISAO');
   executar();
   const resultado=this.banco.prepare(
    'UPDATE '+tabela+' SET revisao=revisao+1,atualizado_em=? WHERE slot=? AND revisao=?'
   ).run(this.agora(),slot,rev);
   if(resultado.changes!==1)falhar('BANNER_MOSAICO_CONFLITO_REVISAO');
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 configurar({slot,colunas,modo='PREENCHER',revisaoEsperada}={}){
  const cols=this._colunas(colunas),p=this.cfg.prefixo;
  if(!['INTEIRA','PREENCHER'].includes(modo))
   falhar('BANNER_MOSAICO_MODO_INVALIDO');
  this._mutar(slot,revisaoEsperada,()=>{
   this.banco.prepare(
    'INSERT INTO '+p+'_layout(slot,colunas,modo) VALUES(?,?,?) '+
    'ON CONFLICT(slot) DO UPDATE SET colunas=excluded.colunas,modo=excluded.modo'
   ).run(slot,cols,modo);
  });
 }
 salvarFoto({slot,posicao,mime,bytes,revisaoEsperada}={}){
  if(![2,3].includes(posicao))falhar('BANNER_MOSAICO_POSICAO_INVALIDA');
  this.validarImagem(mime,bytes);
  const p=this.cfg.prefixo;
  this._mutar(slot,revisaoEsperada,()=>{
   this.banco.prepare(
    'INSERT INTO '+p+'_foto(slot,posicao,mime,imagem) VALUES(?,?,?,?) '+
    'ON CONFLICT(slot,posicao) DO UPDATE SET '+
    'mime=excluded.mime,imagem=excluded.imagem'
   ).run(slot,posicao,mime,bytes);
  });
 }
 removerFoto({slot,posicao,revisaoEsperada}={}){
  if(![2,3].includes(posicao))falhar('BANNER_MOSAICO_POSICAO_INVALIDA');
  const p=this.cfg.prefixo;
  this._mutar(slot,revisaoEsperada,()=>{
   this.banco.prepare('DELETE FROM '+p+'_foto WHERE slot=? AND posicao=?')
    .run(slot,posicao);
  });
 }
 trocarEmTransacao(origem,destino){
  this._principal(origem);this._principal(destino);
  if(origem===destino)falhar('BANNER_MOSAICO_TROCA_INVALIDA');
  const p=this.cfg.prefixo;
  const layouts=this.banco.prepare(
   'SELECT slot,colunas,modo FROM '+p+'_layout WHERE slot IN (?,?)'
  ).all(origem,destino);
  const fotos=this.banco.prepare(
   'SELECT slot,posicao,mime,imagem FROM '+p+'_foto WHERE slot IN (?,?)'
  ).all(origem,destino);
  this.banco.prepare('DELETE FROM '+p+'_layout WHERE slot IN (?,?)')
   .run(origem,destino);
  this.banco.prepare('DELETE FROM '+p+'_foto WHERE slot IN (?,?)')
   .run(origem,destino);
  const inserirLayout=this.banco.prepare(
   'INSERT INTO '+p+'_layout(slot,colunas,modo) VALUES(?,?,?)'
  );
  const inserirFoto=this.banco.prepare(
   'INSERT INTO '+p+'_foto(slot,posicao,mime,imagem) VALUES(?,?,?,?)'
  );
  const oposto=x=>x===origem?destino:origem;
  for(const l of layouts)inserirLayout.run(oposto(l.slot),l.colunas,l.modo);
  for(const f of fotos)inserirFoto.run(oposto(f.slot),f.posicao,f.mime,f.imagem);
 }
 imagem({slot,posicao}={}){
  this._principal(slot);
  if(![2,3].includes(posicao))falhar('BANNER_MOSAICO_POSICAO_INVALIDA');
  const r=this.banco.prepare(
   'SELECT mime,imagem FROM '+this.cfg.prefixo+'_foto WHERE slot=? AND posicao=?'
  ).get(slot,posicao);
  if(!r)falhar('BANNER_MOSAICO_SEM_IMAGEM');
  return {mime:r.mime,bytes:Buffer.from(r.imagem)};
 }
}
module.exports={BannerMosaicoSQLite};
