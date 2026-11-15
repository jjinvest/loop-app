'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {CaptchaLoginSQLite}=require('../src/shared/captcha-login-sqlite');

test('login sem desafio na primeira tentativa, exige na segunda e limpa após sucesso',()=>{
 const db=new DatabaseSync(':memory:');
 let agora=1763241000000;
 try{
  const segredo=randomBytes(32);
  const login=new CaptchaLoginSQLite({
   banco:db,segredo,contexto:'REAL',agora:()=>agora
  });
  assert.equal(login.exigir('VILELA'),false);
  assert.equal(login.verificarAntes('VILELA',{}),true);
  login.registrarErro('VILELA');
  assert.equal(login.exigir('vilela'),true);
  assert.throws(()=>login.verificarAntes('vilela',{}),
   /CAPTCHA_LOGIN_OBRIGATORIO/);
  const desafio=login.emitir();
  assert.match(desafio.captchaId,/^[a-f0-9]{48}$/);
  assert.ok(!JSON.stringify(desafio).includes(segredo.toString('hex')));
  const imagem=Buffer.from(desafio.captchaImagem.split(',')[1],'base64')
   .toString('utf8');
  const letras=[...imagem.matchAll(/<text\s[^>]*>([A-Z0-9])<\/text>/g)]
   .map(x=>x[1]).join('');
  assert.equal(letras.length,6);
  assert.equal(login.verificarAntes('VILELA',{
   captchaId:desafio.captchaId,captchaResposta:letras.toLowerCase()
  }),true);
  assert.throws(()=>login.verificarAntes('vilela',{
   captchaId:desafio.captchaId,captchaResposta:letras
  }),/CAPTCHA_INVALIDO/,'não reutilizar CAPTCHA');
  login.concluirSucesso('vilela');
  assert.equal(login.exigir('VILELA'),false);
  login.registrarErro('vilela');
  agora+=900001;
  assert.equal(login.exigir('vilela'),false,'falha vence em 15 minutos');
 }finally{db.close();}
});

test('não revelar nickname, senha ou IP na tabela de falhas',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const login=new CaptchaLoginSQLite({
   banco:db,segredo:randomBytes(32),contexto:'PREVIA'
  });
  assert.equal(login.registrarErro('Taisaassi'),true);
  const row=db.prepare('SELECT * FROM loop_captcha_login_falhas_v1').get();
  assert.ok(row);
  assert.match(row.nick_hmac,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes('Taisaassi'));
  assert.equal(login.exigir('Taisaassi'),true);
 }finally{db.close();}
});
