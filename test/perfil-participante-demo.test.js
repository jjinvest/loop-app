'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PerfilParticipanteDemoSQLite}=require('../src/domain/perfil-participante-demo-sqlite');
const {criarEntregadoresPerfilAmbiente}=require('../src/domain/entregadores-perfil-via-provedor');
const {createHash}=require('node:crypto');

test('perfil nao altera login, CPF, fila ou identidade protegida; foto persiste',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Cliente Laboratorio Perfil',email:'antigo@exemplo.invalid',
  telefone:'21988887777',senha:'senha-inventada-2026'});
 const data=()=>new Date('2026-10-19T12:00:00.000Z').toISOString();
 const p=new PerfilParticipanteDemoSQLite({banco:repo.banco,agora:data});
 const original=p.consultar(conta.contaId);
 assert.equal(original.nome,conta.nome);
 assert.equal(original.temFoto,false);
 assert.equal(original.revisao,0);
 await assert.rejects(p.solicitarCodigo(conta.contaId,{tipo:'EMAIL',valor:'novo@exemplo.invalid'}),
  /ENVIO_NAO_CONFIGURADO/);
 assert.throws(()=>p.atualizar(conta.contaId,{
  nome:'Nome Editavel',email:'novo@exemplo.invalid',telefone:original.telefone,
  foto:'MANTER',revisaoEsperada:0
 }),/CONTATO_EXIGE_CODIGO/);
 const foto=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(125),Buffer.from([0xff,0xd9])]);
 const p1=p.atualizar(conta.contaId,{nome:'Nome Editavel',email:original.email,
  telefone:original.telefone,foto:{mime:'image/jpeg',base64:foto.toString('base64')},revisaoEsperada:0});
 assert.equal(p1.nome,'Nome Editavel');
 assert.equal(p1.temFoto,true);
 assert.deepEqual(p.foto(conta.contaId).bytes,foto);
 assert.equal(contas.autenticar({nome:conta.nome,senha:'senha-inventada-2026'}).conta.contaId,conta.contaId);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_loop_adesoes_contas_demo').get().n,0);
 const p2=p.atualizar(conta.contaId,{nome:p1.nome,email:p1.email,telefone:p1.telefone,
  foto:'REMOVER',revisaoEsperada:1});
 assert.equal(p2.temFoto,false);
 assert.equal(p.foto(conta.contaId),null);
});
test('verificacao: 6 digitos, prazo, tentativa errada e codigo consumido apos gravar contato',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Cliente Com Codigo',email:'atual@exemplo.invalid',
  senha:'senha-segura-2026'});
 const recebidos=[];
 let relogio=Date.parse('2026-10-19T12:00:00.000Z');
 const p=new PerfilParticipanteDemoSQLite({banco:repo.banco,
  agora:()=>new Date(relogio).toISOString(),
  entregadores:{EMAIL:async x=>recebidos.push(x),TELEFONE:async x=>recebidos.push(x)}});
 const email='validado@exemplo.invalid',telefone='21987654321';
 const req=await p.solicitarCodigo(conta.contaId,{tipo:'EMAIL',valor:email});
 assert.equal(req.enviado,true);
 assert.equal(JSON.stringify(req).includes(recebidos[0].codigo),false);
 assert.match(recebidos[0].codigo,/^\d{6}$/);
 assert.throws(()=>p.confirmarCodigo(conta.contaId,{tipo:'EMAIL',codigo:'ABCDEF'}),/CODIGO_INVALIDO/);
 assert.throws(()=>p.confirmarCodigo(conta.contaId,{tipo:'EMAIL',codigo:'0000000'}),/CODIGO_INVALIDO/);
 assert.equal(p.confirmarCodigo(conta.contaId,{tipo:'EMAIL',codigo:recebidos[0].codigo}).confirmado,true);
 const emailAntigo=p.consultar(conta.contaId);
 assert.throws(()=>p.atualizar(conta.contaId,{
  nome:emailAntigo.nome,email,telefone,revisaoEsperada:0,foto:'MANTER'
 }),/./);
 const proxima=await p.solicitarCodigo(conta.contaId,{tipo:'TELEFONE',valor:telefone});
 assert.equal(proxima.enviado,true);
 p.confirmarCodigo(conta.contaId,{tipo:'TELEFONE',codigo:recebidos[1].codigo});
 const atualizado=p.atualizar(conta.contaId,{
  nome:emailAntigo.nome,email,telefone,revisaoEsperada:0,foto:'MANTER'
 });
 assert.equal(atualizado.email,email);
 assert.equal(atualizado.telefone,'+55'+telefone);
 assert.throws(()=>p.atualizar(conta.contaId,{
  nome:atualizado.nome,email:'mudado@exemplo.invalid',telefone:atualizado.telefone,
  foto:'MANTER',revisaoEsperada:1
 }),/CONTATO_EXIGE_CODIGO/);
 assert.throws(()=>p.atualizar(conta.contaId,{
  nome:atualizado.nome,email,telefone:atualizado.telefone,
  foto:'MANTER',revisaoEsperada:0
 }),/CONFLITO_REVISAO/);
 relogio+=601000;
 const proximo='prazo@exemplo.invalid';
 await p.solicitarCodigo(conta.contaId,{tipo:'EMAIL',valor:proximo});
 relogio+=601000;
 assert.throws(()=>p.confirmarCodigo(conta.contaId,{tipo:'EMAIL',codigo:recebidos[2].codigo}),/CODIGO_EXPIRADO_OU_BLOQUEADO/);
});
test('provedores de email e SMS so existem com credenciais, codigos nao vazam ao navegador',async()=>{
 assert.deepEqual(criarEntregadoresPerfilAmbiente({}),{});
 const pedidos=[];
 const env={LOOP_LAB_RESEND_API_KEY:'fake',LOOP_LAB_RESEND_FROM:'loop@exemplo.invalid',
  LOOP_LAB_TWILIO_ACCOUNT_SID:'AC'+'f'.repeat(32),
  LOOP_LAB_TWILIO_AUTH_TOKEN:'secret',LOOP_LAB_TWILIO_FROM:'+5511999999999'};
 const x=criarEntregadoresPerfilAmbiente(env,async(url,opt)=>{
  pedidos.push({url,opt});
  return {ok:true};
 });
 await x.EMAIL({destino:'alvo@exemplo.invalid',codigo:'123456'});
 await x.TELEFONE({destino:'+5521999999999',codigo:'111222'});
 assert.equal(pedidos.length,2);
 assert.equal(pedidos[0].url,'https://api.resend.com/emails');
 assert.match(pedidos[0].opt.body,/123456/);
 assert.equal(pedidos[1].url.endsWith('/Messages.json'),true);
});
