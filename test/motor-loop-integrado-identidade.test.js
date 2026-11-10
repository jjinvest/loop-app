'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {CatalogoMultiDistribuidoresSQLite}=require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=require('../src/producao/manutencao-comercial-sqlite');
const ORIGEM='https://contas.example.invalid';
const DOC='Termos técnicos para ensaio isolado da Loja AKITEMM e Escritório LOOP. '+
 'Nenhuma transação financeira, posição remunerada ou promessa de ganho real existe aqui.';
const SENHA='SenhaDeEnsaioReal2026!';
const config=()=>({
 chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
 chaveCodigo:randomBytes(32),
 termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
 privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
 enviarEmail:async()=>true
});
async function criarTitulares(contas,total,{vincularSegundoAoPrimeiro=false}={}){
 const doc=contas.documentos(),ids=[];
 for(let i=0;i<total;i++){
  const nick='User'+String.fromCharCode(65+i);
  const r=await contas.cadastrar({
   nome:'Pessoa de Ensaio',nick,email:'user'+i+'@example.invalid',
   ...(vincularSegundoAoPrimeiro&&i===1?{indicadorNick:'UserA'}:{}),
   senha:SENHA,aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:doc.termos.versao,hashTermos:doc.termos.hash,
   versaoPrivacidade:doc.privacidade.versao,
   hashPrivacidade:doc.privacidade.hash
  });
  ids.push({...r,nick});
 }
 return ids;
}
test('compra, indicação, seis eventos e giro sobrevivem ao reinício, sem dinheiro',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-motor-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'clientes.sqlite'),cfg=config();
 let db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 let contas=new IdentidadeClienteLoopReal({...cfg,banco:db});
 let motor=new MotorLoopIntegradoSQLite({banco:db});
 const ids=await criarTitulares(contas,8,{vincularSegundoAoPrimeiro:true});
 for(let i=0;i<8;i++){
  assert.equal(motor.registrarCompraEnsaio({
   titularId:ids[i].titularId,pedidoId:'pedido-'+(i+1)
  }).repetida,false);
 }
 assert.equal(motor.registrarCompraEnsaio({
  titularId:ids[0].titularId,pedidoId:'pedido-1'
 }).repetida,true);
 assert.throws(()=>motor.registrarCompraEnsaio({
  titularId:ids[1].titularId,pedidoId:'pedido-1'
 }),/LOOP_PEDIDO_DIVERGENTE/);
 const convite={indicadorId:ids[0].titularId,indicadoId:ids[1].titularId,
  posicaoId:1,pedidoIndicado:'pedido-2',eventoId:'convite-1'};
 assert.equal(motor.registrarIndicacaoEnsaio(convite).repetida,false);
 assert.equal(motor.registrarIndicacaoEnsaio(convite).repetida,true);
 assert.equal(motor.consultar({titularId:ids[0].titularId}).filaA,1);
 motor.prepararTabuleiroEnsaio();
 for(let i=1;i<=5;i++){
  assert.equal(motor.registrarEventoEnsaio({pedidoId:'pedido-'+i}).eventosNoCiclo,i);
 }
 assert.equal(motor.registrarEventoEnsaio({pedidoId:'pedido-1'}).repetida,true);
 assert.equal(motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,false);
 assert.equal(motor.verificar().eventos,5);
 db.close();
 db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 contas=new IdentidadeClienteLoopReal({...cfg,banco:db});
 motor=new MotorLoopIntegradoSQLite({banco:db});
 assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,5);
 motor.registrarEventoEnsaio({pedidoId:'pedido-6'});
 motor.controlarCatracaEnsaio({acao:'ABRIR'});
 assert.equal(motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 assert.equal(motor.verificar().giros,1);
 assert.equal(motor.registrarEventoEnsaio({pedidoId:'pedido-6'}).repetida,true);
 assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(validarIdentidade(file).integridade,'ok');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'akitemm_%'"
 ).get().n,0);
 const env=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>motor.registrarCompraEnsaio({
   titularId:ids[0].titularId,pedidoId:'pedido-produ'
  }),/LOOP_MOTOR_SEM_COMPROVANTE_PRODUTIVO/);
  assert.throws(()=>motor.verificar(),/LOOP_MOTOR_ENSAIO_PROIBIDO_PRODUCAO/);
 }finally{
  if(env===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=env;
 }
 db.close();
});
test('três contas e administrador veem o mesmo motor, sem acesso cruzado',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const contas=new IdentidadeClienteLoopReal({...config(),banco:db});
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const ids=await criarTitulares(contas,3);
 for(let i=0;i<3;i++)motor.registrarCompraEnsaio({
  titularId:ids[i].titularId,pedidoId:'pedido-'+(i+1)
 });
 const auditoria=new AuditoriaOperacionalSQLite({banco:db,
  chaveAuditoria:randomBytes(32)});
 const manutencao=new ManutencaoComercialSQLite({banco:db,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 const controle=new ControleEconomicoLojaSQLite({banco:db,auditoria,manutencao});
 const senhaAdmin='CredencialSeparadaSomenteTeste2026!segura';
 const sessoes=new SessaoAdminComercialSQLite({banco:db,
  chaveAdmin:randomBytes(32),credencialAdmin:senhaAdmin});
 const app=criarAppIdentidadeLoop({
  contas,motorLoop:motor,origemHttps:ORIGEM,permitirCadastro:true,
  adminComercial:{catalogo,controle,sessoes,auditoria,manutencao}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/loop/estado')).status,401);
 assert.equal((await fetch(base+'/api/admin/loop/estado')).status,401);
 const cookies=[];
 for(const id of ids){
  const r=await fetch(base+'/api/contas/entrar',{method:'POST',headers:{
   Origin:ORIGEM,'Content-Type':'application/json'
  },body:JSON.stringify({nick:id.nick,senha:SENHA})});
  assert.equal(r.status,200);
  assert.equal((await r.json()).motorLoopInterno,true);
  cookies.push(r.headers.get('set-cookie').split(';')[0]);
 }
 for(let i=0;i<3;i++){
  const headers={Cookie:cookies[i]};
  const r=await fetch(base+'/api/loop/estado?titularId='+ids[(i+1)%3].titularId,{headers});
  assert.equal(r.status,200);
  const m=await r.json();
  assert.equal(m.fonte,'IDENTIDADE_E_MOTOR_MESMO_SQLITE');
  assert.equal(m.minhasPosicoes.length,1);
  assert.equal(m.minhasPosicoes[0].numero,i+1);
  assert.equal(m.posicoesReais,0);
  assert.equal((await fetch(base+'/loja',{headers})).status,200);
  assert.equal((await fetch(base+'/api/admin/loop/estado',{headers})).status,401);
  assert.equal((await fetch(base+'/api/loop/registrar-compra',{
   method:'POST',headers:{...headers,Origin:ORIGEM,'Content-Type':'application/json'},
   body:JSON.stringify({pedidoId:'forjado'})
  })).status,404);
  assert.equal((await fetch(base+'/api/checkout/finalizar',{headers})).status,503);
 }
 const r=await fetch(base+'/administrador/entrar',{
  method:'POST',redirect:'manual',headers:{Origin:ORIGEM,
   'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({senha:senhaAdmin})
 });
 assert.equal(r.status,303);
 const adminCookie=r.headers.get('set-cookie').split(';')[0];
 const total=await fetch(base+'/api/admin/loop/estado',{headers:{Cookie:adminCookie}});
 assert.equal(total.status,200);
 assert.equal((await total.json()).filaB,3);
 assert.equal((await fetch(base+'/api/loop/estado',{
  headers:{Cookie:adminCookie}})).status,401);
 const html=await fetch(base+'/administrador',{headers:{Cookie:adminCookie}});
 const pagina=await html.text();
 assert.match(pagina,/id="loopAdminEstado"/);
 for(const id of ['modoCatracaAdmin','limiteCatracaAdmin','inicioCatracaAdmin',
  'fimCatracaAdmin','pausarCatracaAdmin','liberarCatracaAdmin',
  'salvarCatracaAdmin','girarCatracaAdmin','estadoCatracaAdmin'])
  assert.match(pagina,new RegExp('id="'+id+'"'));
 const ctrl='/api/admin/loop/controle';
 assert.equal((await fetch(base+ctrl)).status,401);
 assert.equal((await fetch(base+ctrl,{headers:{Cookie:cookies[0]}})).status,401);
 const inicial=await fetch(base+ctrl,{headers:{Cookie:adminCookie}});
 assert.equal(inicial.status,200);
 const estado=await inicial.json();
 assert.equal(estado.modo,'PAUSADA');
 assert.equal(estado.financeiroReal,false);
 const ses=await (await fetch(base+'/api/admin/comercial/sessao',{
  headers:{Cookie:adminCookie}
 })).json();
 const requisicao={acao:'CONFIGURAR',modo:'MANUAL',janelaInicio:'00:00',
  janelaFim:'00:00',limiteDiario:3,revisaoEsperada:estado.revisao,
  motivo:'CONTROLE_EXCLUSIVO_DO_OPERADOR'};
 const url=base+ctrl;
 const chamada=(body,headers)=>fetch(url,{method:'POST',headers,
  body:JSON.stringify(body)});
 assert.equal((await chamada(requisicao,{Cookie:adminCookie,
  Origin:ORIGEM,'Content-Type':'application/json'})).status,403);
 assert.equal((await chamada(requisicao,{Cookie:cookies[0],
  Origin:ORIGEM,'Content-Type':'application/json',
  'X-Loop-Admin-Csrf':ses.csrfToken})).status,401);
 const cab={Cookie:adminCookie,Origin:ORIGEM,
  'Content-Type':'application/json','X-Loop-Admin-Csrf':ses.csrfToken};
 const mudou=await chamada(requisicao,cab);
 assert.equal(mudou.status,200);
 assert.equal((await mudou.json()).modo,'MANUAL');
 assert.equal((await chamada(requisicao,cab)).status,409);
 const naoGira=await chamada({acao:'GIRAR'},cab);
 assert.equal(naoGira.status,200);
 assert.equal((await naoGira.json()).girou,false);
 assert.equal(motor.consultar().catraca.giros,0);
 assert.equal(motor.verificar().compras,3);
});

test('agenda, limite diario e pausas controlam giros; filas entram mesmo pausada e resistem ao reinicio',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-catraca-admin-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'contas.sqlite');
 let banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const contas=new IdentidadeClienteLoopReal({...config(),banco});
 let motor=new MotorLoopIntegradoSQLite({banco});
 const ids=await criarTitulares(contas,12);
 let agora=new Date('2026-11-10T12:00:00Z'); // 09:00 America/Sao_Paulo
 let catraca=new OperacaoCatracaAdminSQLite({banco,motor,agora:()=>agora});
 assert.equal(catraca.consultar().modo,'PAUSADA');
 for(let i=0;i<12;i++){
  motor.registrarCompraEnsaio({titularId:ids[i].titularId,pedidoId:'compra-'+i});
 }
 assert.equal(motor.consultar().filaB,12);
 assert.equal(catraca.consultar().filaB,12,'a fila nao depende da catraca');
 motor.prepararTabuleiroEnsaio();
 for(let i=0;i<6;i++)
  assert.equal(motor.registrarEventoEnsaio({pedidoId:'compra-'+i}).eventosNoCiclo,i+1);
 assert.equal(catraca.executarGiro().motivo,'PAUSADA_PELO_ADMINISTRADOR');
 assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,6);
 const atual=catraca.consultar();
 assert.throws(()=>catraca.configurar({modo:'MANUAL',
  janelaInicio:'08:00',janelaFim:'10:00',limiteDiario:1,
  revisaoEsperada:999,motivo:'CONFLITO_ESPERADO'}),
  {codigo:'CATRACA_ADMIN_REVISAO_DESATUALIZADA'});
 assert.equal(catraca.consultar().revisao,atual.revisao);
 catraca.configurar({modo:'MANUAL',janelaInicio:'08:00',janelaFim:'10:00',
  limiteDiario:1,revisaoEsperada:atual.revisao,motivo:'LIBERAR_GIROS_DO_DIA'});
 assert.equal(catraca.executarGiro().girou,true);
 assert.equal(motor.consultar().catraca.giros,1);
 for(let i=6;i<12;i++)
  assert.equal(motor.registrarEventoEnsaio({pedidoId:'compra-'+i}).eventosNoCiclo,i-5);
 assert.equal(catraca.executarGiro().motivo,'LIMITE_DIARIO_DEFINIDO_PELO_ADMINISTRADOR');
 assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,6);
 assert.equal(catraca.verificar().integridade,'OK');
 assert.equal(validarIdentidade(arquivo).integridade,'ok');
 catraca.configurar({modo:'AUTOMATICA',janelaInicio:'08:00',janelaFim:'10:00',
  limiteDiario:1,revisaoEsperada:2,motivo:'AGENDA_SEM_GIRO_FORA_DO_LIMITE'});
 assert.equal(catraca.processarAgenda().girou,false);
 agora=new Date('2026-11-11T12:00:00Z');
 assert.equal(catraca.consultar().girosHoje,0);
 assert.equal(catraca.processarAgenda().girou,true);
 assert.equal(catraca.consultar().girosHoje,1);
 assert.equal(catraca.processarAgenda().girou,false);
 assert.equal(motor.verificar().giros,2);
 banco.close();
 banco=new DatabaseSync(arquivo);banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 motor=new MotorLoopIntegradoSQLite({banco});
 catraca=new OperacaoCatracaAdminSQLite({banco,motor,agora:()=>agora});
 assert.equal(catraca.consultar().modo,'AUTOMATICA');
 assert.equal(catraca.consultar().girosHoje,1);
 assert.equal(catraca.verificar().girosAuditados,2);
 assert.equal(validarIdentidade(arquivo).integridade,'ok');
});
