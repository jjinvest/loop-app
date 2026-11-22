'use strict';
// Contrato permanente e executavel do modo OPERADOR do dominio real.
// Regressao de papel, senha, rodape ou acesso privado deve FALHAR no deploy.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
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
 assert.doesNotMatch(html,/id="loopOperadorAcoes"/);
 assert.match(html,/id="loopOperadorAtalhos"[^>]*hidden/);
 assert.match(html,/id="loopAcessoAdminMenu" href="\/administrador"/);
 assert.ok(html.indexOf('id="loopAcessoAdminMenu"')>
  html.indexOf('class="primario loop03-loja-prata"'));
 assert.ok(html.indexOf('id="loopAcessoAdminMenu"')<
  html.indexOf('id="conteudoResumo"'));
 assert.match(html,/id="loopVoltarOperador"[^>]*hidden/);
 const js=codigo('src/producao/interface-aprovada-contas.js');
 assert.match(js,/\.toLowerCase\(\)==='operador'/);
 assert.match(js,/await autenticarOperadorFormulario\(/);
 assert.match(js,/abrirPainelOperador\(\)/);
 assert.doesNotMatch(js,/location\.assign\('\/administrador'\)/);
 assert.match(js,/void atualizarAtalhoOperadorReal\(\)/);
 assert.match(js,/document\.body\.classList\.add\('loop03-logado','loop03-modo-operador'\)/);
 assert.match(js,/const estado=r\.ok\?await r\.json\(\):\{operador:false\}/);
 assert.match(js,/if\(estado\.operador===true&&visaoSolicitada!=='cliente'\)/);
 assert.match(js,/visaoSolicitada!=='cliente'\)await terminarModoOperador\(\)/);
 assert.match(js,/if\(modoOperadorAtual\)\{[\s\S]*?await terminarModoOperador\(\)/);
 // Nao inventar conta, posicoes nem permissoes de cliente para a sessao admin.
 assert.doesNotMatch(js,/painelConta\(\{nick:'OPERADOR'/);
 assert.match(js,/const indicadores=document\.querySelector\('\.loop03-indicadores'\)/);
 assert.match(js,/\$\('loop03AbrirPerfil'\)\.disabled=true/);
 assert.match(js,/\$\('loop03AlterarFotoTopo'\)\.disabled=false/);
});
test('OPERADOR abre tabuleiro existente com leitura propria e sem contas nem giros',()=>{
 const js=codigo('src/producao/interface-aprovada-contas.js');
 const backend=codigo('src/producao/gateway-admin-comercial.js');
 assert.match(js,/const habilitada=true/);
 assert.match(js,/prepararPaineisOperador\(\)/);
 assert.match(js,/fetch\('\/api\/admin\/contas\/cadastro\?nick='/);
 assert.match(js,/if\(modoOperadorAtual\)return carregarTabuleiroOperador\(\)/);
 assert.match(js,/fetch\('\/api\/admin\/loop\/estado'/);
 assert.match(js,/fetch\('\/api\/admin\/loop\/controle'/);
 assert.match(js,/controle\.autorizacaoFinanceiraDosGiros!==false/);
 assert.match(js,/!Array\.isArray\(d\.minhasPosicoes\)\|\|d\.minhasPosicoes\.length!==0/);
 assert.match(js,/visualTabuleiro\.preencherVaga\('tabuleiroMotorCentro'/);
 assert.match(backend,/app\.get\('\/api\/admin\/loop\/estado',proteger/);
 assert.match(backend,/app\.get\('\/api\/admin\/loop\/controle',proteger/);
 assert.doesNotMatch(js,/fetch\('\/api\/admin\/loop\/controle',\{method:'POST'/);
});

test('OPERADOR configura relogio pelo controle original, sem rota paralela',()=>{
 const html=renderizarInterfaceAprovada();
 const js=codigo('src/producao/interface-aprovada-contas.js');
 const api=codigo('src/producao/gateway-admin-comercial.js');
 const admin=codigo('src/producao/interface-admin-comercial-aprovada.js');
 assert.match(html,/id="atualizarTabuleiroIntegrado"/);
 assert.match(html,/id="relogioTabuleiroIntegrado"/);
 assert.doesNotMatch(js,/location\.assign\('\/administrador#tituloMotorInternoAdmin'\)/);
 assert.match(js,/abrirControleRelogioOperador\(\)/);
 assert.match(js,/modal\.showModal\(\)/);
 assert.match(js,/modal\.id='loopOperadorCatracaDialog'/);
 assert.match(js,/Cada luz: /);
 assert.match(js,/Cada centro: /);
 assert.match(js,/Próxima luz prevista:/);
 assert.match(js,/Programação salva e confirmada/);
 assert.match(js,/rodape\.prepend\(salvar\)/);
 const css=codigo('src/producao/acabamento-botoes-real.css');
 assert.match(css,/#loopOperadorCatracaDialog\[open\]/);
 assert.match(css,/grid-template-rows:auto auto auto minmax\(0,1fr\) auto/);
 assert.match(css,/\.loop-operador-catraca-rodape button/);
 assert.match(css,/overflow-y:auto/);
 assert.match(js,/metaCentrosDia:Number\(meta\.value\)/);
 assert.match(js,/fetch\('\/api\/admin\/loop\/controle',[\s\S]*?method:'POST'/);
 // A configuração é agora projetada UMA VEZ no servidor para ambas as visões.
 const agenda=codigo('src/producao/projecao-agenda-tabuleiro-compartilhada.js');
 const apiCliente=codigo('src/producao/servidor-identidade-loop.js');
 assert.match(js,/visorCatraca\.registrarAgenda\(controle\.agenda\)/);
 assert.match(js,/visorCatraca\.registrarAgenda\(d\.agenda\)/);
 assert.match(js,/controle\.agenda\.origem!=='CATRACA_REAL_MESMO_SQLITE'/);
 assert.match(agenda,/agoraServidorMs:estado\.agoraServidorMs/);
 assert.match(agenda,/proximaLuzPrevistaEmMs:estado\.proximaLuzPrevistaEmMs/);
 assert.match(agenda,/intervaloLuzSegundos:estado\.intervaloLuzSegundos/);
 assert.match(agenda,/exigeCaixaReal:true/);
 assert.match(apiCliente,/catracaCompartilhada\?\.consultar\(\)/);
 assert.match(apiCliente,/projetarAgendaTabuleiroCompartilhada\(controle\)/);
 assert.match(api,/projetarAgendaTabuleiroCompartilhada\(controle\)/);
 assert.match(api,/app\.get\('\/api\/admin\/loop\/controle',proteger/);
 assert.match(api,/app\.post\('\/api\/admin\/loop\/controle',proteger,validarCsrf/);
 assert.match(admin,/id="tituloMotorInternoAdmin"/);
 assert.match(admin,/id="metaCentrosDiaAdmin"/);
 assert.match(admin,/id="salvarCatracaAdmin"/);
});

test('link da central aparece no rodape de AMBOS os produtos, so para operador',()=>{
 const html=renderizarLojaAprovada();
 assert.match(html,/<footer class="akitemm-rodape">/);
 assert.match(html,/href="\/administrador" class="akitemm-acesso-operador" hidden/);
 assert.doesNotMatch(html,/id="akitemmOperadorMais"/);
 const js=codigo('src/producao/interface-aprovada-loja.js');
 assert.match(js,/document\.querySelector\('\.akitemm-acesso-operador'\)/);
 assert.match(js,/const semCliente=res\.status===401\|\|operadorAtivo/);
 assert.match(js,/if\(!operadorAtivo\)try\{/);
 assert.match(js,/visitante=!operadorAtivo/);
 const login=codigo('src/producao/interface-aprovada-contas.js');
 assert.match(login,/const ativo=d\?\.operador===true/);
 assert.match(login,/barra\.hidden=!ativo\|\|!modoOperadorAtual/);
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


test('foto do operador e olhinho sao controles reais sem confundir titular',()=>{
 const js=codigo('src/producao/interface-aprovada-contas.js');
 const gateway=codigo('src/producao/gateway-admin-comercial.js');
 const html=renderizarInterfaceAprovada();
 assert.match(html,/id="loop03ImagemFotoTopo"/);
 assert.match(html,/id="loop03AlterarFotoTopo"/);
 assert.match(html,/data-senha="senha"/);
 assert.match(js,/void atualizarFotoOperadorReal\(\)/);
 assert.match(js,/\$\('loop03AlterarFotoTopo'\)\.disabled=false/);
 assert.match(js,/fetch\('\/api\/admin\/operador\/foto-perfil'/);
 assert.match(js,/modoOperadorAtual\?salvarFotoOperadorReal\(ev\):salvarFotoPerfilReal\(ev\)/);
 assert.match(js,/botao\.setAttribute\('aria-label',mostrar\?'Ocultar senha':'Mostrar senha'\)/);
 assert.match(js,/campo\.type=mostrar\?'text':'password'/);
 assert.match(gateway,/loop_real_operador_foto_perfil/);
 assert.match(gateway,/app\.get\('\/api\/admin\/operador\/foto-perfil',proteger/);
 assert.match(gateway,/app\.post\('\/api\/admin\/operador\/foto-perfil',proteger,validarCsrf/);
 assert.doesNotMatch(gateway,/req\.conta\.titularId/);
});


test('olhinho instala antes das demais rotinas e responde no Android mesmo se outra rotina falhar',()=>{
 const js=codigo('src/producao/interface-aprovada-contas.js');
 const inicio=js.indexOf(" document.addEventListener('click',ev=>{");
 const fim=js.indexOf(' },true);',inicio);
 assert.ok(inicio>0&&fim>inicio);
 assert.ok(inicio<js.indexOf('void atualizarAtalhoOperadorReal()'),
  'olho deve ser instalado antes do sistema administrativo');
 assert.doesNotMatch(js,/document.querySelectorAll\('\[data-senha\]'\)/,
  'não duplicar o listener no final do arquivo');
 const atributos={};
 const input={tagName:'INPUT',type:'password',value:'SenhaPreservada123!'}; 
 const botao={disabled:false,dataset:{senha:'senha'},setAttribute(k,v){atributos[k]=v;}};
 const eventos=[];
 const doc={
  addEventListener(nome,fn,captura){eventos.push({nome,fn,captura});},
  getElementById(id){return id==='senha'?input:null;}
 };
 vm.runInNewContext('const $=id=>document.getElementById(id);\n'+
  js.slice(inicio,fim+' },true);'.length),{document:doc},{timeout:1000});
 assert.equal(eventos.length,1);
 assert.equal(eventos[0].nome,'click');
 assert.equal(eventos[0].captura,true);
 const ev={target:{closest:()=>botao},preventDefault(){this.bloqueou=true;}};
 // Falha em um modulo posterior nao remove o comando ja instalado.
 assert.throws(()=>{throw Error('FALHA_EM_OUTRA_ROTINA');},/FALHA_EM_OUTRA_ROTINA/);
 eventos[0].fn(ev);
 assert.equal(ev.bloqueou,true);
 assert.equal(input.type,'text');
 assert.equal(input.value,'SenhaPreservada123!');
 assert.equal(atributos['aria-pressed'],'true');
 assert.equal(atributos['aria-label'],'Ocultar senha');
 eventos[0].fn(ev);
 assert.equal(input.type,'password');
 assert.equal(input.value,'SenhaPreservada123!');
 assert.equal(atributos['aria-pressed'],'false');
});

test('JavaScript do login tem URL versionada para nao reutilizar script antigo no Android',()=>{
 const arquivo=fs.readFileSync(path.join(__dirname,'..',
  'src/producao/interface-aprovada-contas.js'));
 const rev=createHash('sha256').update(arquivo).digest('hex').slice(0,16);
 const html=renderizarInterfaceAprovada();
 assert.ok(html.includes('/identidade/assets/cliente.js?rev='+rev),
  'HTML deve requisitar a versão efetiva do arquivo de login');
 assert.doesNotMatch(html,/\/staging\/assets\/cliente\.js/);
 assert.match(html,/id="formLogin"/);
 assert.match(html,/data-senha="senha"/);
});
