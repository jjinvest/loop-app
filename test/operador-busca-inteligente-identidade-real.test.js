'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {criarRelatorioClientesProdutosOperador}=
 require('../src/producao/relatorio-clientes-produtos-operador');
const TEXTO='Documento reservado aos testes de identificacao do cadastro real com '+
 'busca privada por nome, telefone e nick, sem ativacao de compra, posicao, '+
 'transferencia, recompensa ou movimentacao financeira.';
function montar(t){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const c=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-BUSCA-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-BUSCA-2026',texto:TEXTO},
  enviarEmail:async()=>true
 });
 return {db,c};
}
test('operador recebe sugestoes ao digitar uma letra, nome com acento, nick e telefone',async t=>{
 const {db,c}=montar(t),d=c.documentos();
 const criar=(nome,nick,email,cpf,telefone)=>c.cadastrar({
  nome,nick,email,cpf,telefone,senha:'SenhaMuitoLonga2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,hashPrivacidade:d.privacidade.hash
 });
 await criar('Thaísa Assis','taisaassi','taisa@example.invalid','529.982.247-25','11987654321');
 await criar('Teresa Gomes','teresa','teresa@example.invalid','111.444.777-35','21987654321');
 await criar('Ana Lima','ana','ana@example.invalid','390.533.447-05','31987654321');
 const t1=c.buscarCadastrosOperador({termo:'T'});
 assert.deepEqual(t1.resultados.map(x=>x.nick),['taisaassi','teresa']);
 assert.equal(t1.somenteOperador,true);
 assert.equal(t1.temMais,false);
 assert.ok(t1.resultados.every(x=>!JSON.stringify(x).includes('52998224725')));
 assert.deepEqual(c.buscarCadastrosOperador({termo:'thaisa'}).resultados.map(x=>x.nick),['taisaassi']);
 assert.deepEqual(c.buscarCadastrosOperador({termo:'TAISA'}).resultados.map(x=>x.nick),['taisaassi']);
 assert.deepEqual(c.buscarCadastrosOperador({termo:'987654321'}).resultados.map(x=>x.nick),
  ['ana','taisaassi','teresa']);
 assert.deepEqual(c.buscarCadastrosOperador({termo:'52998224725'}).resultados.map(x=>x.nick),
  ['taisaassi']);
 assert.deepEqual(c.buscarCadastrosOperador({termo:'teresa@example.invalid'}).resultados.map(x=>x.nick),
  ['teresa']);
 assert.equal(c.consultarCadastroOperador({nick:'taisaassi'}).telefone,'11987654321');
 assert.throws(()=>c.buscarCadastrosOperador({termo:'123'}),{codigo:'BUSCA_CADASTRO_INVALIDA'});
 assert.throws(()=>c.buscarCadastrosOperador({termo:'<script>'}),{codigo:'BUSCA_CADASTRO_INVALIDA'});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM loop_real_contas').get().n,3);
});
test('busca por letra devolve no maximo 20 sugestoes e avisa quando existem mais',async t=>{
 const {c}=montar(t),d=c.documentos();
 for(let i=0;i<22;i++){
  const nick='alfa'+String.fromCharCode(97+Math.floor(i/26))+String.fromCharCode(97+i%26);
  await c.cadastrar({nome:'Alfa Teste',nick,email:nick+'@example.invalid',
   senha:'SenhaMuitoLonga2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
   versaoPrivacidade:d.privacidade.versao,hashPrivacidade:d.privacidade.hash});
 }
 const r=c.buscarCadastrosOperador({termo:'A'});
 assert.equal(r.resultados.length,20);
 assert.equal(r.temMais,true);
});
test('interface oferece retorno, typeahead e dados de compras sem presumir metodo PSP',()=>{
 const ui=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
 const api=fs.readFileSync('src/producao/gateway-admin-comercial.js','utf8');
 const css=fs.readFileSync('src/producao/acabamento-botoes-real.css','utf8');
 assert.match(ui,/id="adminVoltarBuscaEquipe"/);
 assert.match(ui,/function voltarBuscaEquipe\(\)/);
 assert.match(ui,/addEventListener\('input'/);
 assert.match(ui,/aria-autocomplete="list"/);
 assert.match(ui,/setTimeout\(/);
 assert.match(ui,/\('adminNomeCadastro'\)\.value=x\.nome/);
 assert.match(ui,/Posições ativas:/);
 assert.match(ui,/Telefone: /);
 assert.match(ui,/Forma de pagamento:/);
 assert.match(api,/app\.post\('\/api\/admin\/contas\/pesquisar',proteger,validarCsrf/);
 assert.match(api,/motorLoop\.consultar\(\{titularId:titular\.id\}\)/);
 assert.match(css,/#adminCadastroResultados/);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL COLLATE NOCASE);"+
   "CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY,titular_id TEXT,status TEXT,pagamento_id TEXT,criado_em INTEGER);"+
   "CREATE TABLE loja_real_custos_pedido(pedido_id TEXT,fornecedor_id TEXT,sku TEXT,produto_id TEXT,quantidade INTEGER,preco_unit_centavos INTEGER);"+
   "CREATE TABLE loja_real_produtos(produto_id TEXT,titulo TEXT);");
  db.prepare('INSERT INTO loop_real_contas VALUES (?,?)').run('titular-a','alpha');
  db.prepare('INSERT INTO loja_real_pedidos VALUES (?,?,?,?,?)').run(
   'pedido-a','titular-a','APROVADO_PARA_EXPEDICAO','psp-a',1000);
  db.prepare('INSERT INTO loja_real_custos_pedido VALUES (?,?,?,?,?,?)').run(
   'pedido-a','fornecedor-a','sku-a','prod-a',1,25000);
  const dado=criarRelatorioClientesProdutosOperador({banco:db})
   .comprasDoCadastro({nick:'alpha'});
  assert.equal(dado.itens[0].statusPagamento,'APROVADO_PARA_EXPEDICAO');
  assert.equal(dado.itens[0].pagamentoId,'psp-a');
  assert.equal(dado.itens[0].formaPagamento,null);
 }finally{db.close();}
});
