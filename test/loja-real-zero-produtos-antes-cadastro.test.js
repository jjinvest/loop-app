'use strict';
// Contrato do lançamento: capacidade visual NÃO é catálogo publicado.
// Este teste usa SQLite descartável, nunca lê/escreve volumes Railway.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=require('../src/producao/sessao-admin-comercial-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://zero-produtos.example.invalid';
const CHAVE='CredencialAdministradorSoParaTesteDeRegressao2026';
const DOC='Documentos de ensaio descartáveis para a loja real vazia sem pagamentos, pedidos, saldo, posições ou produto publicado.';
test('loja real sem cadastro de produtos: zero catalogados e 400 espaços, sem compra fictícia',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false
 });
 const controle=new ControleEconomicoLojaSQLite({banco});
 const sessoes=new SessaoAdminComercialSQLite({
  banco,chaveAdmin:randomBytes(32),credencialAdmin:CHAVE
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false,
  catalogoVitrine:{
   banco,listarVitrinePreparacao:({limite})=>{
    assert.equal(limite,400);
    return []; // exatamente ZERO; não cria 'Curso Cinza' ou PDF fictício
   }
  },
  adminComercial:{sessoes,catalogo,controle}
 });
 const servidor=app.listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const requisitar=(rota,cookie)=>fetch(base+rota,{
  headers:cookie?{Cookie:cookie}:{},redirect:'manual'
 });
 assert.equal((await requisitar('/api/loja/catalogo')).status,401);
 const entrar=await fetch(base+'/api/operador/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'operador',senha:CHAVE})
 });
 assert.equal(entrar.status,200);
 const cookie=entrar.headers.get('set-cookie').split(';')[0];
 const resposta=await requisitar('/api/loja/catalogo',cookie);
 assert.equal(resposta.status,200);
 const estado=await resposta.json();
 assert.equal(estado.origem,'CATALOGO_ADMINISTRATIVO_PUBLICADO');
 assert.equal(estado.produtos.length,0);
 assert.equal(estado.total,0);
 assert.equal(estado.checkoutReal,false);
 assert.equal(estado.precosNaoHomologados,true);
 assert.equal(estado.estoqueConfirmado,false);
 // A vitrine já aprovada exibe 10 abas de 40 quadradinhos, sem itens inventados.
 const codigo=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-loja.js'),'utf8');
 assert.match(codigo,/const totalAbas=filtrada\?Math.max\(1,Math.ceil\(itens.length\/40\)\):10/);
 assert.match(codigo,/const linhas=expandida\?4:2/);
 assert.match(codigo,/for\(let indice=inicio;indice<ate;indice\+\+\)/);
 assert.match(codigo,/Aguardando produto cadastrado/);
 assert.match(codigo,/Nenhum produto publicado/);
 // Sessão de operador não representa comprador e não produz pedido/posição.
 assert.equal((await requisitar('/api/loja/pedidos',cookie)).status,401);
 assert.equal((await requisitar('/api/contas/me',cookie)).status,401);
 assert.equal((await requisitar('/api/loja/produtos/curso-ficticio/foto/1',cookie)).status,503,
  'sem banco de midia nao pode fabricar foto nem fingir disponibilidade');
 assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
