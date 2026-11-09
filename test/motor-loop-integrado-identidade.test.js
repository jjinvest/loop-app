'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
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
async function criarTitulares(contas,total){
 const doc=contas.documentos(),ids=[];
 for(let i=0;i<total;i++){
  const nick='User'+String.fromCharCode(65+i);
  const r=await contas.cadastrar({
   nome:'Pessoa de Ensaio',nick,email:'user'+i+'@example.invalid',
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
 const ids=await criarTitulares(contas,8);
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
 assert.match(await html.text(),/id="loopAdminEstado"/);
 assert.equal(motor.verificar().compras,3);
});
