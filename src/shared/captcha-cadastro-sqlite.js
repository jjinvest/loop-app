'use strict';
// CAPTCHA textual com prova no servidor, uso único e curta validade.
// Mitigação inicial contra automação simples: NÃO é garantia contra IA/OCR.
// Integração futura com Turnstile pode reforçar segurança sem alterar aceite.
const {randomBytes,randomInt,createHmac,timingSafeEqual}=require('node:crypto');
const ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function falhar(){const e=new Error('CAPTCHA_INVALIDO');e.codigo='CAPTCHA_INVALIDO';throw e;}
class CaptchaCadastroSQLite{
 constructor({banco,segredo,contexto='CADASTRO',agora=()=>Date.now()}={}){
  if(!banco||typeof banco.prepare!=='function'||
     !Buffer.isBuffer(segredo)||segredo.length!==32||
     typeof contexto!=='string'||!/^[A-Z]{3,20}$/.test(contexto))
   throw Error('CAPTCHA_CONFIGURACAO_INVALIDA');
  this.db=banco;this.segredo=segredo;this.contexto=contexto;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_captcha_cadastro_v1(',
   'id_hmac TEXT PRIMARY KEY,codigo_hmac TEXT NOT NULL,',
   'contexto TEXT NOT NULL,expira_em INTEGER NOT NULL,',
   'criado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS loop_captcha_cadastro_expira',
   'ON loop_captcha_cadastro_v1(expira_em);'
  ].join(' '));
 }
 _assinar(prefixo,valor){
  return createHmac('sha256',this.segredo).update(prefixo+':'+this.contexto+':'+valor).digest('hex');
 }
 emitir(){
  const now=this.agora(),id=randomBytes(24).toString('hex');
  const codigo=Array.from({length:6},()=>ABC[randomInt(ABC.length)]).join('');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('DELETE FROM loop_captcha_cadastro_v1 WHERE expira_em<?').run(now);
   const count=this.db.prepare('SELECT COUNT(*) AS n FROM loop_captcha_cadastro_v1').get().n;
   if(count>=6000){const e=new Error('CAPTCHA_OCUPADO');e.codigo='CAPTCHA_OCUPADO';throw e;}
   this.db.prepare([
    'INSERT INTO loop_captcha_cadastro_v1',
    '(id_hmac,codigo_hmac,contexto,expira_em,criado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(this._assinar('ID',id),
    this._assinar('CODIGO',id+':'+codigo),this.contexto,now+150000,now);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  const tracos=Array.from({length:9},()=>{
   const x1=randomInt(10,255),y1=randomInt(5,65),
         x2=randomInt(10,255),y2=randomInt(5,65);
   return '<path d="M'+x1+' '+y1+' L'+x2+' '+y2+
    '" stroke="#68788f" stroke-width="1" opacity=".45"/>';
  }).join('');
  const chars=[...codigo].map((a,i)=>
   '<text x="'+(24+i*41)+'" y="'+randomInt(42,55)+
   '" fill="#fff4d9" font-family="monospace" font-size="34" font-weight="700"'+
   ' transform="rotate('+randomInt(-11,12)+' '+(24+i*41)+' 37)">'+a+'</text>'
  ).join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="268" height="72" viewBox="0 0 268 72" role="img" aria-label="Código CAPTCHA de seis caracteres" >'+
   '<rect width="268" height="72" rx="8" fill="#222c3a"/>'+
   tracos+chars+'</svg>';
  return {captchaId:id,captchaImagem:'data:image/svg+xml;base64,'+
   Buffer.from(svg).toString('base64'),captchaExpiraSegundos:150};
 }
 verificar({captchaId,captchaResposta}={}){
  if(typeof captchaId!=='string'||!/^[a-f0-9]{48}$/.test(captchaId)||
     typeof captchaResposta!=='string'||
     !/^[A-Za-z2-9]{6}$/.test(captchaResposta))falhar();
  const now=this.agora();
  let row;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   row=this.db.prepare([
    'SELECT codigo_hmac,expira_em,contexto',
    'FROM loop_captcha_cadastro_v1 WHERE id_hmac=?'
   ].join(' ')).get(this._assinar('ID',captchaId));
   // Uma única tentativa, válida ou não. Nunca reutilizar ID.
   this.db.prepare('DELETE FROM loop_captcha_cadastro_v1 WHERE id_hmac=?')
    .run(this._assinar('ID',captchaId));
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  if(!row||row.contexto!==this.contexto||row.expira_em<now)falhar();
  const esperado=Buffer.from(row.codigo_hmac,'hex'),
        respondido=Buffer.from(this._assinar('CODIGO',captchaId+':'+
          captchaResposta.toUpperCase()),'hex');
  if(esperado.length!==respondido.length||
     !timingSafeEqual(esperado,respondido))falhar();
  return true;
 }
}
module.exports={CaptchaCadastroSQLite};
