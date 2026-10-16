'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('somente admin local pode preparar tabuleiro ficticio; azul vira dourado',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pessoa=contas.cadastrar({nome:'Cliente Azul Tabuleiro',email:'tabuleiro@exemplo.invalid',
  senha:'senha-ficticia-teste-2026'});
 const comprovante={pedidoId:'compra-para-tabuleiro-demo',contaId:pessoa.contaId,
  produtoId:'pdf-curso-demo',valorCentavos:25000,
  status:STATUS_CONFIRMADO,confirmadoEm:'2026-10-15T13:00:00.000Z'};
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>comprovante});
 await ponte.processar({pedidoId:comprovante.pedidoId});
 const token='chave-local-teste-tabuleiro-2026-segura';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:token}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const url=base+'/api/admin/ponte-compras-convites-demo/preparar-tabuleiro';
 const opts={method:'POST',headers:{'Content-Type':'application/json',
  Authorization:'Bearer '+token},body:'{}'};
 assert.equal((await fetch(url,{...opts,headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(url,{...opts,body:'{"pago":true}'})).status,400);
 const resposta=await fetch(url,opts);
 assert.equal(resposta.status,200);
 const dado=await resposta.json();
 assert.equal(dado.tabuleiro.centro.statusAdesao,'PRAZO_ENCERRADO');
 assert.equal(dado.tabuleiro.centro.titularOperacional,'LOOP_EMPRESA');
 assert.equal(ponte.consultar().tabuleiro.centro.statusAdesao,'PRAZO_ENCERRADO');
 const pagina=await(await fetch(base+'/admin/cadastro-participantes-demo')).text();
 assert.match(pagina,/prepararTabuleiroCadastroDemo/);
 const script=await(await fetch(base+'/admin/cadastro-participantes-demo.js')).text();
 assert.match(script,/ponte-compras-convites-demo\/preparar-tabuleiro/);
 const publico=require('../src/server');
 const app=publico.listen(0,'127.0.0.1');
 await once(app,'listening');
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+app.address().port+
  '/api/admin/ponte-compras-convites-demo/preparar-tabuleiro',opts)).status,404);
});
