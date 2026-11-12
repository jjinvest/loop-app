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
 assert.match(html,/id="seletorPosicaoMotor"/);
 assert.match(html,/id="posicoesPainel"/);
 assert.match(html,/id="listaEquipe"/);
 assert.match(html,/id="estadoTabuleiroIntegrado"/);
 assert.match(html,/id="atualizarTabuleiroIntegrado"/);
 assert.match(html,/id="relogioTabuleiroIntegrado"/);
 assert.match(html,/src="\/identidade\/assets\/catraca-visor.js"/);
 assert.equal((html.match(/src="\/identidade\/assets\/catraca-visor.js"/g)||[]).length,1);
 assert.doesNotMatch(html,/Mesmo motor V6 e mesmo SQLite da conta e da loja/);
 assert.equal((html.match(/id="seletorPosicaoMotor"/g)||[]).length,1);
 assert.equal((html.match(/id="posicoesPainel"/g)||[]).length,1);
 assert.match(html,/id="conteudoConta"/);
 assert.match(html,/id="cadastroPrivacidade"/);
 assert.match(html,/id="termosCadastroDetalhes"/);
 assert.match(html,/id="privacidadeCadastroDetalhes"/);
 assert.match(html,/minlength="12" maxlength="128"/);
 assert.match(html,/Nick \(1 a 12 letras\)/);
 assert.equal((html.match(/maxlength="12" pattern="\[A-Za-z\]\{1,12\}"/g)||[]).length,2);
 assert.equal((html.match(/href="\/loja"/g)||[]).length,2);
 assert.doesNotMatch(html,/href="\/staging\/loja"/);
 assert.match(html,/src="\/identidade\/assets\/cliente.js"/);
 assert.doesNotMatch(html,/src="\/staging\/assets\/cliente.js"/);
 assert.doesNotMatch(html,/<script[^>]*>[^<]*fetch/);
 assert.doesNotMatch(html,/Criar conta de homologação/);
 assert.doesNotMatch(html,/Nome fictício/);
 assert.doesNotMatch(html,/E-mail fictício/);
 assert.doesNotMatch(html,/Para uma venda real ainda são necessárias/);
 assert.match(html,/id="termosCpfTexto" class="subtexto" hidden/);
 assert.match(html,/id="cpfTeste"/);
 assert.match(html,/id="aceiteCpfTeste"/);
 assert.match(html,/id="formCpfTeste"/);
});
test('interface aprovada e identidade real servidas da mesma origem protegida',async t=>{
 const titular=contas(t);
 const app=criarAppIdentidadeLoop({
  contas:titular,origemHttps:ORIGEM,permitirCadastro:true
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
 assert.match(await page.text(),/src="\/identidade\/assets\/catraca-visor.js"/);
 assert.equal((await get('/minha-conta')).status,200);
 const visor=await get('/identidade/assets/catraca-visor.js');
 assert.equal(visor.status,200);
 const visorCode=await visor.text();
 assert.match(visorCode,/function festejarGiroCatraca/);
 assert.match(visorCode,/function atualizarMarcadorCatraca/);
 const js=await get('/identidade/assets/cliente.js');
 assert.equal(js.status,200);
 assert.match(js.headers.get('content-type'),/javascript/);
 const script=await js.text();
 assert.match(script,/\/api\/contas/);
 assert.match(script,/pedidoDeOrigemEnsaio/);
 assert.match(script,/indicacoesQualificadasEnsaio/);
 assert.match(script,/COMPRA_ENSAIO_SEM_QUALIFICACAO/);
 assert.match(script,/seletorPosicaoMotor/);
 assert.match(script,/catracaClientePodeGirar/);
 assert.match(script,/LoopVisorCatraca\.criar/);
 assert.doesNotMatch(script,/termosCpfTexto'\)\.textContent='Versão'/);
 assert.match(script,/\.loop03-atalho-loja, \.barra-conta a\.loop03-loja-prata/);
 assert.match(script,/setAttribute\('href','\/loja'\)/);
 assert.doesNotMatch(script,/removeAttribute\('href'\)/);
 assert.doesNotMatch(script,/fetch\('\/staging/);
 for(const p of ['cliente.css','loop03-aprovado.css','cliente-integrado.css']){
  const res=await get('/identidade/assets/'+p);
  assert.equal(res.status,200,p);
  assert.match(res.headers.get('content-type'),/text\/css/);
 }
 assert.equal((await get('/loja')).status,401,'a vitrine exige titular autenticado');
 assert.equal((await get('/api/loja/estado')).status,401);
 const documentos=titular.documentos();
 const nick='Ana',senha='SenhaFicticia2026!';
 await titular.cadastrar({
  nome:'Ana de Ensaio',nick,email:'ana@example.invalid',senha,
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
  versaoPrivacidade:documentos.privacidade.versao,
  hashPrivacidade:documentos.privacidade.hash
 });
 const login=await fetch(base+'/api/contas/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick,senha})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const loja=await fetch(base+'/loja',{headers:{Cookie:cookie}});
 assert.equal(loja.status,200,'o mesmo login deve abrir loja aprovada');
 const lojaHtml=await loja.text();
 assert.match(lojaHtml,/id="catalogoLojaLoop"/);
 assert.match(lojaHtml,/id="akitemmFormEntrega"/);
 assert.match(lojaHtml,/src="\/identidade\/assets\/loja.js"/);
 assert.doesNotMatch(lojaHtml,/src="\/laboratorio\/loja.js"/);
 const scriptLoja=await get('/identidade/assets/loja.js');
 assert.equal(scriptLoja.status,200);
 assert.match(await scriptLoja.text(),/loja conectada à sua conta LOOP/);
 const estado=await fetch(base+'/api/loja/estado',{
  headers:{Cookie:cookie}
 });
 assert.equal(estado.status,200);
 const descricao=await estado.json();
 assert.equal(descricao.contaUnica,true);
 assert.equal(descricao.catalogoComercialDisponivel,false);
 assert.equal(descricao.checkoutReal,false);
 assert.equal((await get('/api/contas/me')).status,401);
 const proibido=await fetch(base+'/api/loja/pedidos',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json',Cookie:cookie},
  body:JSON.stringify({produto:'fake'})
 });
 assert.equal(proibido.status,503);
 assert.equal((await get('/api/checkout/finalizar')).status,503);
 assert.equal((await get('/api/saques/solicitar')).status,503);
});

test('cadastro real fecha quando backup externo fica vencido',async t=>{
 let fresco=false;
 const app=criarAppIdentidadeLoop({
  contas:contas(t),origemHttps:ORIGEM,permitirCadastro:true,
  backupEstado:()=>({backupAtualEmDia:fresco})
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(url+'/readyz')).status,503);
 assert.equal((await fetch(url+'/api/contas/documentos')).status,503);
 const enviar=()=>fetch(url+'/api/contas/cadastrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Ana Exemplo',nick:'Ana'})
 });
 assert.equal((await enviar()).status,503,'sem restore offsite não cadastrar');
 fresco=true;
 assert.equal((await fetch(url+'/readyz')).status,200);
 const docs=await fetch(url+'/api/contas/documentos');
 assert.equal(docs.status,200);
 assert.equal((await docs.json()).financeiroReal,false);
 fresco=false;
 assert.equal((await enviar()).status,503,'falha posterior suspende o cadastro');
 assert.equal((await fetch(url+'/readyz')).status,503);
});
