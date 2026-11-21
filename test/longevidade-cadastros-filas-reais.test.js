'use strict';
// Carga de ESTRUTURA em banco temporario. Linhas sinteticas sao
// deliberadamente inseridas sem senhas ou dados pessoais verdadeiros.
// Nao simula 20 mil logins/PSP e nao credencia throughput de producao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');

const DOC='Termos para prova descartavel de longa duracao de registros. '+
 'A simulacao nao representa compradores ou pagamentos e nao gera '+
 'direito a posicao, bonus, saque ou participacao financeira.';
function letras(i){
 let x=i,s='';
 do{s=String.fromCharCode(97+x%26)+s;x=Math.floor(x/26);}
 while(x);
 return 'u'+s;
}
test('20 mil cadastros e 20 mil vinculos preservam ordem, paginacao e reinicio',
 {timeout:30000},async()=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-base-longeva-'));
 const file=path.join(pasta,'contas.sqlite');
 const chaves={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const cfg={...chaves,enviarEmail:async()=>true,
  termos:{versao:'ENSAIO-LONGEVIDADE-1',texto:DOC},
  privacidade:{versao:'PRIV-LONGEVIDADE-1',texto:DOC}};
 let db;
 try{
  const abrir=()=>{
   const banco=new DatabaseSync(file);
   banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
   const contas=new IdentidadeClienteLoopReal({...cfg,banco});
   const motor=new MotorLoopIntegradoSQLite({banco});
   return {banco,contas,motor};
  };
  let estado=abrir();
  db=estado.banco;
  const docs=estado.contas.documentos();
  const indicador=await estado.contas.cadastrar({
   nome:'Titular Indicado',nick:'Origem',
   email:'origem@example.invalid',senha:'TesteLongevidade2026!',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  const id=indicador.titularId;
  // Apenas carga de indices e relacionamentos em arquivo descartavel.
  const insConta=db.prepare([
   'INSERT INTO loop_real_contas',
   '(id,nick,email_hmac,nome_iv,nome_ct,nome_tag,',
   'email_iv,email_ct,email_tag,senha_salt,senha_hash,',
   'termos_versao,termos_hash,priv_versao,priv_hash,criado_em)',
   'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ].join(' '));
  const insVinculo=db.prepare([
   'INSERT INTO loop_real_vinculos_indicacao',
   '(indicado_id,indicador_id,registrado_em) VALUES(?,?,?)'
  ].join(' '));
  db.exec('BEGIN IMMEDIATE');
  try{
   for(let i=0;i<20000;i++){
    const pessoa='titular-'+i.toString(16).padStart(8,'0')+
     '-0000-4000-8000-000000000000';
    insConta.run(pessoa,letras(i),i.toString(16).padStart(64,'0'),
     'x','x','x','x','x','x','x','x',
     'T','hash','P','hash',1700000000000+i);
    insVinculo.run(pessoa,id,1700000000000+Math.floor(i/10));
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  const query=[
   'EXPLAIN QUERY PLAN SELECT indicado_id',
   'FROM loop_real_vinculos_indicacao WHERE indicador_id=?',
   'ORDER BY registrado_em ASC,indicado_id ASC LIMIT 50 OFFSET 19950'
  ].join(' ');
  const plano=db.prepare(query).all(id).map(x=>x.detail).join('; ');
  assert.match(plano,/idx_loop_real_vinculos_ordem/,
   'paginas deterministicas precisam do indice de desempate');
  const ultima=estado.contas.listarIndicados(id,{offset:19950,limite:50});
  assert.equal(ultima.total,20000);
  assert.equal(ultima.indicados.length,50);
  assert.equal(ultima.indicados[0].nick,letras(19950));
  assert.equal(ultima.indicados[49].nick,letras(19999));
  assert.equal(ultima.indicados[49].numeroCadastro,20000);
  assert.equal(ultima.temMais,false);
  assert.equal(ultima.financeiroReal,false);
  assert.equal(estado.motor.verificar().compras,0);
  db.close();db=null;
  estado=abrir();db=estado.banco;
  const reaberta=estado.contas.listarIndicados(id,{offset:19950,limite:50});
  assert.deepEqual(reaberta.indicados,ultima.indicados,
   'reinicio preserva os mesmos 50 ultimos indicados, sem reordenar');
  assert.equal(reaberta.total,20000);
  const destino=estado.contas.reservarDestinoIndicacao({
   indicadorId:id,numeroCadastro:20000,posicao:3
  });
  assert.equal(destino.posicaoDestinoReservada,3);
  assert.equal(estado.contas.reservarDestinoIndicacao({
   indicadorId:id,numeroCadastro:20000,posicao:3
  }).repetido,true);
  assert.equal(estado.motor.verificar().compras,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{
  try{db?.close();}catch{}
  fs.rmSync(pasta,{recursive:true,force:true});
 }
});
