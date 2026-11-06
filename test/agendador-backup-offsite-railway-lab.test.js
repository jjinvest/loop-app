'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {assinarObjetoS3Lab}=
 require('../src/domain/s3-url-assinada-backup-lab');
const {criarAgendadorBackupOffsiteLab}=
 require('../src/domain/agendador-backup-offsite-railway-lab');

const config={endpoint:'https://t3.storageapi.dev',bucket:'loop-backup-abcdef',
 accessKeyId:'BUCKETACCESSIDONLYTEST',secretAccessKey:'x'.repeat(50),region:'auto'};
const data=new Date('2026-11-06T01:00:00.000Z');
const uuid='01234567-89ab-4cde-8fab-0123456789ab';
const senha='ficticia-forte-para-cifrar-comprovacao-backup-2026-11-06';
function origem(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offsite-loop-unificado-'));
 const arquivo=path.join(dir,'escritorio.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 criarAppLojaEscritorioCandidato({banco,
  repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'OperadorBackupUnificado_'+('L'.repeat(48)),
  termosVersao:'LAB-backup-unificado-2026',
  termosTexto:'Somente laboratorio para backup em bucket privado.'});
 t.after(()=>{try{banco.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,arquivo,banco};
}
function options(f,extra={}){
 return {fonteSqlite:f.arquivo,raizVolume:f.dir,senha,config,
  agora:()=>data,uuid:()=>uuid,intervaloMs:24*60*60*1000,...extra};
}
test('URLs SigV4 S3 privadas sao deterministicas, distintos GET e PUT, sem chave secreta',()=>{
 const put=assinarObjetoS3Lab({config,
  method:'PUT',key:'staging/2026-11-06/'+uuid+'.loopbak',data});
 const get=assinarObjetoS3Lab({config,
  method:'GET',key:'staging/2026-11-06/'+uuid+'.loopbak',data});
 const p=new URL(put),g=new URL(get);
 assert.equal(p.host,'loop-backup-abcdef.t3.storageapi.dev');
 assert.equal(p.pathname,g.pathname);
 assert.equal(p.searchParams.get('X-Amz-Date'),'20261106T010000Z');
 assert.equal(p.searchParams.get('X-Amz-Expires'),'300');
 assert.match(p.searchParams.get('X-Amz-Signature'),/^[0-9a-f]{64}$/);
 assert.notEqual(p.searchParams.get('X-Amz-Signature'),
  g.searchParams.get('X-Amz-Signature'));
 assert.equal(put.includes(config.secretAccessKey),false);
 assert.equal(assinarObjetoS3Lab({config,method:'PUT',
  key:'staging/2026-11-06/'+uuid+'.loopbak',data}),put);
});
test('backup completo: SQLite WAL cifrado, PUT GET, RESTAURA sem alterar fonte',async t=>{
 const f=origem(t);let remoto=null,puts=0,gets=0;
 const buscar=async(url,req)=>{
  const u=new URL(url);
  assert.equal(u.host,'loop-backup-abcdef.t3.storageapi.dev');
  assert.equal(u.searchParams.get('X-Amz-SignedHeaders'),'host');
  if(req.method==='PUT'){
   puts++;
   const blocos=[];for await(const c of req.body)blocos.push(c);
   remoto=Buffer.concat(blocos);
   assert.equal(req.headers['If-None-Match'],'*');
   assert.equal(remoto.slice(0,8).toString(),'LOOPBKP1');
   assert.equal(remoto.includes(Buffer.from('CREATE TABLE')),false);
   return new Response(null,{status:200});
  }
  gets++;assert.equal(req.method,'GET');
  return new Response(remoto,{status:200});
 };
 const changes=f.banco.prepare('SELECT total_changes() AS n').get().n;
 const confirmacoes=[];
 const w=criarAgendadorBackupOffsiteLab(options(f,{buscar,
  onSucesso:codigo=>confirmacoes.push(codigo)}));
 const r=await w.executarUmaVez();
 assert.equal(r.estado,'OFFSITE_CIFRADO_LIDO_E_RESTAURADO');
 assert.equal(r.copiaOffsiteComprovada,true);
 assert.equal(r.restauracaoIsoladaComprovada,true);
 assert.equal(w.estado().copiasVerificadasNoProcesso,1);
 assert.equal(w.estado().backupAtualEmDia,true);
 assert.equal(w.estado().ultimaConfirmacao.integridadeCifradaSha256.length,64);
 assert.equal(puts,1);assert.equal(gets,1);
 assert.deepEqual(confirmacoes,['CIFRADO_ENVIADO_BAIXADO_E_RESTAURADO']);
 assert.equal(f.banco.prepare('SELECT total_changes() AS n').get().n,changes);
 assert.equal(f.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(f.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 await w.encerrar();
});
test('resposta GET adulterada bloqueia sucesso e nunca expõe segredo',async t=>{
 const f=origem(t);let remoto;
 const buscar=async(_url,req)=>{
  if(req.method==='PUT'){
   const partes=[];for await(const p of req.body)partes.push(p);
   remoto=Buffer.concat(partes);
   return new Response(null,{status:200});
  }
  const adulterado=Buffer.from(remoto);
  adulterado[adulterado.length-24]^=1;
  return new Response(adulterado,{status:200});
 };
 const avisos=[];
 const w=criarAgendadorBackupOffsiteLab(options(f,{
  buscar,onErro:msg=>avisos.push(msg)
 }));
 const r=await w.executarUmaVez();
 assert.equal(r.estado,'BACKUP_REQUER_VERIFICACAO');
 assert.equal(w.estado().copiasVerificadasNoProcesso,0);
 assert.equal(w.estado().falhasNoProcesso,1);
 assert.deepEqual(avisos,['BACKUP_OFFSITE_INTEGRO_NAO_COMPROVADO']);
 assert.equal(JSON.stringify(r).includes(senha),false);
 await w.encerrar();
});
test('sem chave, caminho fora do volume, intervalos curtos e modo producao falham fechado',t=>{
 const f=origem(t);
 assert.throws(()=>criarAgendadorBackupOffsiteLab(options(f,{senha:'fraca'})),
  /BACKUP_OFFSITE_CONFIG_INVALIDA/);
 assert.throws(()=>criarAgendadorBackupOffsiteLab(options(f,{intervaloMs:1000})),
  /BACKUP_OFFSITE_CONFIG_INVALIDA/);
 assert.throws(()=>criarAgendadorBackupOffsiteLab(options(f,{config:{
  ...config,endpoint:'http://127.0.0.1:8080'
 }})),/S3_CONFIG_INCOMPLETA/);
 assert.throws(()=>criarAgendadorBackupOffsiteLab(options(f,{fonteSqlite:'/tmp/outro.sqlite'})),
  /BACKUP_OFFSITE_CONFIG_INVALIDA/);
});
test('agendador não sobrepõe execuções; término aguarda última cópia',async t=>{
 const f=origem(t);let avancar,entrou,liberar;
 const pronto=new Promise(ok=>{entrou=ok;});
 const espera=new Promise(ok=>{liberar=ok;});
 let ticks=null,parou=0,puts=0;
 const buscar=async(_url,req)=>{
  if(req.method==='PUT'){
   puts++;
   entrou();
   await espera;
   const partes=[];for await(const p of req.body)partes.push(p);
   avancar=Buffer.concat(partes);
   return new Response(null,{status:200});
  }
  return new Response(avancar,{status:200});
 };
 const w=criarAgendadorBackupOffsiteLab(options(f,{
  buscar,agendar:cb=>{ticks=cb;return {unref(){}};},
  cancelar:()=>{parou++;}
 }));
 w.iniciar();await pronto;
 assert.equal((await w.executarUmaVez()).estado,'EM_ANDAMENTO');
 ticks();await Promise.resolve();
 assert.equal(puts,1);
 const fechar=w.encerrar();
 liberar();await fechar;
 assert.equal(parou,1);
 assert.equal(w.estado().habilitado,false);
 assert.equal(w.estado().copiasVerificadasNoProcesso,1);
 assert.equal((await w.executarUmaVez()).estado,'ENCERRADO');
});

test('backup antigo ou falha posterior nunca aparenta copia ATUAL saudavel',async t=>{
 const f=origem(t);let remoto,adulterar=false,horario=data;
 const buscar=async(_url,req)=>{
  if(req.method==='PUT'){
   const partes=[];for await(const p of req.body)partes.push(p);
   remoto=Buffer.concat(partes);
   return new Response(null,{status:200});
  }
  if(adulterar){
   const ruim=Buffer.from(remoto);ruim[ruim.length-24]^=1;
   return new Response(ruim,{status:200});
  }
  return new Response(remoto,{status:200});
 };
 const w=criarAgendadorBackupOffsiteLab(options(f,{
  buscar,agora:()=>horario
 }));
 assert.equal((await w.executarUmaVez()).copiaOffsiteComprovada,true);
 assert.equal(w.estado().backupAtualEmDia,true);
 horario=new Date('2026-11-07T04:00:01.000Z');
 assert.equal(w.estado().backupAtualEmDia,false);
 assert.equal(w.estado().copiaOffsiteHistoricaComprovada,true);
 horario=new Date('2026-11-06T03:00:00.000Z');
 adulterar=true;
 assert.equal((await w.executarUmaVez()).copiaOffsiteComprovada,false);
 assert.equal(w.estado().ultimaTentativaFalhou,true);
 assert.equal(w.estado().backupAtualEmDia,false);
 assert.equal(w.estado().copiasVerificadasNoProcesso,1);
 assert.equal(w.estado().copiaOffsiteHistoricaComprovada,true);
 await w.encerrar();
});
