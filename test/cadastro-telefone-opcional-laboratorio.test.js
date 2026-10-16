'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite,telefoneNormalizado}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('cadastro com telefone ficticio valido sem CPF e privacidade dos dados',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 assert.equal(telefoneNormalizado('(24) 99999-1234'),'+5524999991234');
 assert.equal(telefoneNormalizado('+55 (24) 99999-1234'),'+5524999991234');
 assert.equal(telefoneNormalizado('(24) 3333-1234'),'+552433331234');
 for(const inv of ['123','01999991234','(24) 11111-1111','+1 555 777 9911','99999999999','abc']){
  assert.throws(()=>telefoneNormalizado(inv),e=>e.codigo==='INVALIDO');
 }
 const a=contas.cadastrar({nome:'Teste Ficticio Com Telefone',
  email:'telefone@exemplo.invalid',telefone:'(24) 99999-1234',senha:'senha-ficticia-forte-2026'});
 assert.equal(a.telefoneInformadoNoTeste,true);
 assert.equal(a.cpfColetado,false);
 assert.equal(contas.buscar(a.contaId).telefoneInformadoNoTeste,true);
 assert.equal(contas.autenticar({nome:a.nome,senha:'senha-ficticia-forte-2026'}).conta.telefoneInformadoNoTeste,true);
 const armazenado=repo.banco.prepare('SELECT telefone_normalizado FROM admin_contas_telefones_demo').get();
 assert.equal(armazenado.telefone_normalizado,'+5524999991234');
 assert.doesNotMatch(JSON.stringify(contas.listar()),/5524999991234|99999-1234|telefone@exemplo.invalid/);
 assert.doesNotMatch(JSON.stringify(a),/5524999991234|99999-1234/);
 assert.throws(()=>contas.cadastrar({nome:'Telefone Duplicado',
  email:'segundo@exemplo.invalid',telefone:'+55 24 99999-1234',senha:'senha-ficticia-forte-2026'}),
  e=>e.codigo==='CONFLITO');
 assert.equal(contas.listar().contas.length,1);
 assert.throws(()=>repo.banco.exec("UPDATE admin_contas_telefones_demo SET telefone_normalizado='+5524999981234'"),/imutavel/);
 // Compatibilidade: contas antigas no laboratorio continuam carregando.
 const legado=contas.cadastrar({nome:'Conta Antiga Demo',email:'antiga@exemplo.invalid',senha:'senha-ficticia-forte-2026'});
 assert.equal(legado.telefoneInformadoNoTeste,false);
 assert.equal(legado.cpfColetado,false);
});

test('painel envia telefone opcional de legado mas exige formato valido, sem expor CPF',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const chave='chave-admin-laboratorio-telefone-2026';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:chave});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const url=base+'/api/admin/contas-participantes-demo/cadastrar';
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+chave};
 const dados={nome:'Teste com Telefone',email:'tel-web@exemplo.invalid',
  senha:'senha-ficticia-123456',telefone:'(24) 99999-4321'};
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...dados,cpf:'11144477735'})})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...dados,telefone:'0800-alguma-coisa'})})).status,400);
 const cadastrado=await fetch(url,{method:'POST',headers,body:JSON.stringify(dados)});
 assert.equal(cadastrado.status,201);
 const resposta=await cadastrado.json();
 assert.equal(resposta.conta.telefoneInformadoNoTeste,true);
 assert.doesNotMatch(JSON.stringify(resposta),/99999-4321|5524999994321/);
 const pagina=await(await fetch(base+'/admin/cadastro-participantes-demo')).text();
 assert.match(pagina,/id="telefoneContaDemo"/);
 assert.match(pagina,/id="telefoneContaDemo"[^>]+required/);
 const script=await(await fetch(base+'/admin/cadastro-participantes-demo.js')).text();
 assert.match(script,/telefone:el\('telefoneContaDemo'\)/);
 const publico=require('../src/server');
 const srv2=publico.listen(0,'127.0.0.1');await once(srv2,'listening');
 t.after(()=>new Promise(resolve=>srv2.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+srv2.address().port+'/admin/cadastro-participantes-demo')).status,404);
});
