'use strict';
// Contrato permanente e executavel do modo OPERADOR do dominio real.
// Regressao de papel, senha, rodape ou acesso privado deve FALHAR no deploy.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {renderizarInterfaceAprovada,renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const {SessaoAdminComercialSQLite,COOKIE_ADMIN}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const codigo=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('nick e senha UNICOS: OPERADOR entra na MESMA tela LOOP e nao vai direto a outra central',()=>{
 const html=renderizarInterfaceAprovada();
 assert.equal((html.match(/id="formLogin"/g)||[]).length,1);
 assert.equal((html.match(/id="login"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="acessoAdminLogin"/);
 assert.match(html,/id="loopOperadorAcoes"[^>]*hidden/);
 assert.match(html,/id="loopAcessoAdminMenu"[^>]*href="\/administrador"[^>]*hidden/);
 assert.ok(html.indexOf('id="loop03NickIntegrado"')<
  html.indexOf('id="loopAcessoAdminMenu"'));
 assert.ok(html.indexOf('id="loopAcessoAdminMenu"')<
  html.indexOf('id="sair"'));
 const js=codigo('src/producao/interface-aprovada-contas.js');
 assert.match(js,/\.toLowerCase\(\)==='operador'/);
 assert.match(js,/await autenticarOperadorFormulario\(/);
 assert.match(js,/abrirPainelOperador\(\)/);
 assert.doesNotMatch(js,/location\.assign\('\/administrador'\)/);
 assert.match(js,/void atualizarAtalhoOperadorReal\(\)/);
 assert.match(js,/document\.body\.classList\.add\('loop03-logado','loop03-modo-operador'\)/);
 assert.match(js,/const estado=r\.ok\?await r\.json\(\):\{operador:false\}/);
 assert.match(js,/if\(estado\.operador===true\)\{abrirPainelOperador\(\);return;\}/);
 assert.match(js,/if\(modoOperadorAtual\)\{[\s\S]*?await terminarModoOperador\(\)/);
 // Nao inventar conta, posicoes nem permissoes de cliente para a sessao admin.
 assert.doesNotMatch(js,/painelConta\(\{nick:'OPERADOR'/);
 assert.match(js,/const indicadores=document\.querySelector\('\.loop03-indicadores'\)/);
 assert.match(js,/\$\('loop03AbrirPerfil'\)\.disabled=true/);
 assert.match(js,/\$\('loop03AlterarFotoTopo'\)\.disabled=true/);
});
test('link da central aparece no rodape de AMBOS os produtos, so para operador',()=>{
 const html=renderizarLojaAprovada();
 assert.match(html,/<footer class="akitemm-rodape">/);
 assert.match(html,/href="\/administrador" class="akitemm-acesso-operador" hidden/);
 const js=codigo('src/producao/interface-aprovada-loja.js');
 assert.match(js,/document\.querySelector\('\.akitemm-acesso-operador'\)/);
 assert.match(js,/const semCliente=res\.status===401\|\|operadorAtivo/);
 assert.match(js,/if\(!operadorAtivo\)try\{/);
 assert.match(js,/visitante=!operadorAtivo/);
 const login=codigo('src/producao/interface-aprovada-contas.js');
 assert.match(login,/const liberado=d\?\.operador===true/);
 assert.match(login,/atalho\.hidden=!liberado/);
 const back=codigo('src/producao/gateway-admin-comercial.js');
 assert.match(back,/app\.get\('\/api\/operador\/estado'/);
 assert.match(back,/app\.post\('\/api\/operador\/entrar'/);
 assert.match(back,/req\.body\.nick\.trim\(\)\.toLowerCase\(\)!=='operador'/);
 assert.match(back,/sessoes\.autenticar\(req\.body\.senha\)/);
 assert.match(back,/app\.get\('\/administrador\/entrar'/);
 assert.match(back,/montarAdminComercialAprovado/);
});
test('credencial e papeis nao se confundem no SQLite e nao dispensam autenticacao',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const chaveAdmin=randomBytes(32),credencial='SegredoDeOperadorValido!2026.Confirmado';
  const sessao=new SessaoAdminComercialSQLite({
   banco,chaveAdmin,credencialAdmin:credencial
  });
  assert.equal(sessao.sessao('f'.repeat(64)),null);
  assert.throws(()=>sessao.autenticar('SenhaDeClienteNaoAutoriza'),
   e=>e.codigo==='CREDENCIAL_ADMIN_INVALIDA');
  const real=sessao.autenticar(credencial);
  assert.equal(real.token.length,64);
  const d=sessao.sessao(real.token);
  assert.equal(d.role,'ADMIN_COMERCIAL');
  assert.equal(COOKIE_ADMIN,'akitemm_real_admin_v1');
  assert.equal(sessao.sair(real.token),true);
  assert.equal(sessao.sessao(real.token),null);
 }finally{banco.close();}
});
