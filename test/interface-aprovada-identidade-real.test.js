'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://contas.example.invalid';
const TEXTO='Termos e informações de privacidade para uma conta real separada '+
 'do laboratório. Esta conta identifica o titular na Loja AKITEMM e no '+
 'Escritório LOOP, sem autorizar compras, posições, bonificações ou saques.';
function contas(t){
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 return new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),
  chaveCifra:randomBytes(32),chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026-v1',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-v1',texto:TEXTO},
  enviarEmail:async()=>true
 });
}
test('HTML original do cliente é reaproveitado sem script LAB, nova tela ou CPF fictício',()=>{
 const html=renderizarInterfaceAprovada();
 assert.match(html,/id="formLogin"/);
 assert.match(html,/id="formCadastro"/);
 assert.match(html,/id="painelConta"/);
 assert.match(html,/id="loop03ShellIntegrado"/);
 assert.match(html,/id="conteudoConta"/);
 assert.match(html,/id="cadastroPrivacidade"/);
 assert.match(html,/id="termosCadastroDetalhes"/);
 assert.match(html,/id="privacidadeCadastroDetalhes"/);
 assert.match(html,/minlength="12" maxlength="128"/);
 assert.match(html,/src="\/identidade\/assets\/cliente.js"/);
 assert.doesNotMatch(html,/src="\/staging\/assets\/cliente.js"/);
 assert.doesNotMatch(html,/<script[^>]*>[^<]*fetch/);
 assert.doesNotMatch(html,/Criar conta de homologação/);
 assert.doesNotMatch(html,/Nome fictício/);
 assert.doesNotMatch(html,/E-mail fictício/);
});
test('interface aprovada e identidade real servidas da mesma origem protegida',async t=>{
 const app=criarAppIdentidadeLoop({
  contas:contas(t),origemHttps:ORIGEM,permitirCadastro:true
 });
 const s=app.listen(0,'127.0.0.1');await once(s,'listening');
 t.after(()=>new Promise(resolve=>s.close(resolve)));
 const base='http://127.0.0.1:'+s.address().port;
 const get=(path)=>fetch(base+path);
 const page=await get('/escritorio');
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-type'),/text\/html/);
 assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
 assert.match(await page.text(),/src="\/identidade\/assets\/cliente.js"/);
 assert.equal((await get('/minha-conta')).status,200);
 const js=await get('/identidade/assets/cliente.js');
 assert.equal(js.status,200);
 assert.match(js.headers.get('content-type'),/javascript/);
 const script=await js.text();
 assert.match(script,/\/api\/contas/);
 assert.doesNotMatch(script,/fetch\('\/staging/);
 for(const p of ['cliente.css','loop03-aprovado.css','cliente-integrado.css']){
  const res=await get('/identidade/assets/'+p);
  assert.equal(res.status,200,p);
  assert.match(res.headers.get('content-type'),/text\/css/);
 }
 const loja=await get('/loja');
 assert.equal(loja.status,503,'não ativar loja real sem catálogo/fornecedor');
 assert.equal((await loja.json()).checkoutReal,false);
 assert.equal((await get('/api/contas/me')).status,401);
 assert.equal((await get('/api/checkout/finalizar')).status,503);
 assert.equal((await get('/api/saques/solicitar')).status,503);
});
