'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const ORIGEM='https://loja.example.invalid';
const SENHA='CredencialPrivadaSomenteTeste2026!Segredo';
const DOC='Texto de termos e privacidade necessário para ensaio isolado '+
 'de contas e catálogo real sem pagamentos, sem benefício e sem compra.';

test('400 fixtures tecnicas em banco descartavel, 10 abas x 40 e operador isolado',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false
 });
 const controle=new ControleEconomicoLojaSQLite({banco:db});
 const sessoes=new SessaoAdminComercialSQLite({
  banco:db,chaveAdmin:randomBytes(32),credencialAdmin:SENHA
 });
 const agora=Date.now();
 // Volume artificial EXCLUSIVAMENTE deste teste, NAO catalogo publicado do proprietario.
 const produtos=Array.from({length:400},(_,i)=>({
  produtoId:'produto-'+String(i+1).padStart(3,'0'),
  titulo:'Produto '+(i+1),descricao:'Mercadoria em catálogo',
  tipo:'FISICO',cor:'CINZA',criadoEm:agora,
  novidade:true,unidadesConfirmadas:0,
  precoCentavos:null,estoqueConfirmado:false,
  compravel:false,checkoutReal:false,fotos:[]
 }));
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false,
  catalogoVitrine:{
   banco:db,listarVitrinePreparacao:({limite})=>{
    assert.equal(limite,400);return produtos;
   }
  },
  adminComercial:{sessoes,catalogo,controle}
 });
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(ok=>servidor.close(ok)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const get=(p,h={})=>fetch(base+p,{headers:h,redirect:'manual'});
 assert.equal((await get('/loja')).status,200);
 const vitrinePublica=await get('/api/loja/catalogo');
 assert.equal(vitrinePublica.status,200);
 assert.equal((await vitrinePublica.json()).total,400);
 assert.equal((await get('/api/loja/pedidos')).status,401);
 assert.equal((await get('/api/contas/me')).status,401);
 const login=await fetch(base+'/api/operador/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'OPERADOR',senha:SENHA})
 });
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const loja=await get('/loja',{Cookie:cookie});
 assert.equal(loja.status,200);
 const htmlLoja=await loja.text();
 assert.equal(htmlLoja,renderizarLojaAprovada());
 assert.doesNotMatch(htmlLoja,/id="akitemmOperadorMais"/);
 assert.match(htmlLoja,/class="akitemm-acesso-operador" hidden/);
 const api=await get('/api/loja/catalogo',{Cookie:cookie});
 assert.equal(api.status,200);
 const resposta=await api.json();
 assert.equal(resposta.produtos.length,400);
 assert.equal(resposta.total,400);
 assert.equal(resposta.checkoutReal,false);
 assert.equal(resposta.produtos[399].produtoId,'produto-400');
 assert.ok(resposta.produtos.every(x=>x.compravel===false&&x.precoCentavos===null));
 assert.equal((await get('/api/loja/pedidos',{Cookie:cookie})).status,401);
 assert.equal((await get('/api/contas/me',{Cookie:cookie})).status,401);
 assert.equal((await get('/api/loja/capacidade',{Cookie:cookie})).status,401);
 const css=await get('/identidade/assets/vitrine-horizontal.css');
 assert.equal(css.status,200);
 assert.match(await css.text(),/ak-faixa-horizontal/);
 const js=await get('/identidade/assets/operador-fotos.js');
 assert.equal(js.status,200);
 assert.match(await js.text(),/X-Foto-Versao-Esperada/);
 const fonte=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-loja.js'),'utf8');
 assert.match(fonte,/const totalAbas=filtrada\?Math.max\(1,Math.ceil\(slotsVisiveis.length\/40\)\):10/);
 assert.match(fonte,/const linhas=expandida\?4:2/);
 assert.match(fonte,/abaVitrine\*40/);
 assert.match(fonte,/data.*akitemmSlot|dataset.akitemmSlot/);
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
});

test('destaques PC lado a lado, celular em coluna, sem aviso redundante de ofertas',()=>{
 const js=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-loja.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../src/candidato/vitrine-horizontal.css'),'utf8');
 assert.doesNotMatch(js,/Nenhuma oferta publicada neste filtro\./);
 assert.match(js,/filtroOfertas\?'':/);
 assert.match(css,/@media \(min-width:901px\)/);
 assert.match(css,/flex:0 0 calc\(25% - 9\.75px\)/);
 assert.match(css,/@media \(max-width:900px\)/);
 assert.match(css,/flex-direction:column!important/);
 assert.match(css,/grid-template-columns:minmax\(100px,38%\) minmax\(0,1fr\)/);
 for(const cor of ['roxo','dourado','verde','cinza'])
  assert.match(css,new RegExp('akitemm-slot-'+cor));
 // Apenas a aparência: continuam dez abas, com até quarenta espaços por aba.
 assert.match(js,/const linhas=expandida\?4:2/);
 assert.match(js,/const slotsVisiveis=Array\.from\(\{length:400\}/);
});
