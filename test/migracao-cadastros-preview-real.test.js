'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const {ContaUnicaCandidataSQLite}=require('../src/domain/conta-unica-candidata-sqlite');
const {EquipeCandidataSQLite}=require('../src/domain/equipe-candidata-sqlite');
const {IdentidadeClienteLoopReal,prepararEstruturaIdentidadeReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {exportarPreview,empacotar,desempacotar,importarNoReal}=
 require('../src/producao/migracao-cadastros-preview-real');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const termos='Termos de cadastro de ensaio com vínculo de indicação, senha de acesso, dados cifrados e contato do indicador vinculado.';
const doc='Termos e Política de Privacidade de ensaio de integração. Nenhuma operação financeira existe neste teste; todas as transações continuam fechadas.';
test('migrar duas contas reais de ensaio para identidade definitiva conserva senha e indicação, sem dinheiro',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'loop-migracao-'));
 t.after(()=>rmSync(dir,{force:true,recursive:true}));
 const src=new DatabaseSync(path.join(dir,'preview.sqlite'));
 const dst=new DatabaseSync(path.join(dir,'clientes.sqlite'));
 t.after(()=>{src.close();dst.close();});
 src.exec('PRAGMA foreign_keys=ON');
 dst.exec('PRAGMA foreign_keys=ON');
 const emailSrc=randomBytes(32),cipherSrc=randomBytes(32),
  emailReal=randomBytes(32),cipherReal=randomBytes(32),codeReal=randomBytes(32);
 const previa=new ContaUnicaCandidataSQLite({
  banco:src,chaveEmail:emailSrc,chaveCifra:cipherSrc
 });
 const equipe=new EquipeCandidataSQLite({
  banco:src,consultarTelefoneAutorizado:args=>
   previa.telefoneAutorizadoParaIndicador(args)
 });
 const dados=(nick,telefone)=>({
  nome:'Pessoa '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
  telefone,senha:'Senha123456',confirmarSenha:'Senha123456',
  aceiteExplicito:true,termosVersao:'LAB-TESTE-2026',termosTexto:termos
 });
 const pai=await previa.cadastrar(dados('Indica','21999998888'));
 const filha=await previa.cadastrar({...dados('Filha','11988887777'),
  onCriada:({titularId})=>equipe.registrarCadastro({
   indicadoId:titularId,indicadorNick:'Indica'
  })
 });
 const token=randomBytes(32).toString('hex');
 const snap=exportarPreview({banco:src,contas:previa});
 assert.equal(snap.contas.length,2);assert.equal(snap.vinculos.length,1);
 const pacote=empacotar(snap,token);
 assert.ok(!JSON.stringify(pacote).includes('11988887777'));
 assert.throws(()=>desempacotar(pacote,randomBytes(32).toString('hex')),
  /MIGRACAO_ASSINATURA_INVALIDA/);
 const payload=desempacotar(pacote,token);
 prepararEstruturaIdentidadeReal({
  banco:dst,chaveEmail:emailReal,chaveCifra:cipherReal,chaveCodigo:codeReal
 });
 const resultado=importarNoReal({
  banco:dst,payload,chaveEmail:emailReal,chaveCifra:cipherReal
 });
 assert.equal(resultado.contasImportadas,2);
 assert.equal(resultado.vinculosImportados,1);
 assert.equal(resultado.documentosDefinitivosAindaPendentes,true);
 assert.equal(resultado.pagamentosLiberados,false);
 assert.equal(importarNoReal({
  banco:dst,payload,chaveEmail:emailReal,chaveCifra:cipherReal
 }).adicionadas,0);
 const real=new IdentidadeClienteLoopReal({
  banco:dst,chaveEmail:emailReal,chaveCifra:cipherReal,chaveCodigo:codeReal,
  termos:{versao:'LOOP-TERMOS-TESTE2026',texto:doc},
  privacidade:{versao:'LOOP-PRIV-TESTE2026',texto:doc},
  enviarEmail:async()=>true
 });
 assert.equal((await real.entrar({nick:'Indica',senha:'Senha123456'})).titularId,pai.titularId);
 assert.equal(real.telefoneIndicadoVinculado({
  indicadoId:filha.titularId,indicadorId:pai.titularId
 }),'11988887777');
 assert.equal(real.telefoneIndicadoVinculado({
  indicadoId:filha.titularId,indicadorId:filha.titularId
 }),null);
 assert.equal(real.listarIndicados(pai.titularId).indicados[0].numeroCadastro,1);
 assert.equal(real.listarIndicados(pai.titularId).indicados[0].telefone,'11988887777');
 assert.equal(real.dadosTitular(filha.titularId).aceiteDocumentosDefinitivosPendente,true);
 assert.equal(real.dadosTitular(filha.titularId).cpfRecebido,false);
 assert.equal(dst.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(validarIdentidade(path.join(dir,'clientes.sqlite')).contas,2);
 const serialized=JSON.stringify(dst.prepare('SELECT * FROM loop_real_contas').all());
 assert.ok(!serialized.includes('11988887777'));
 assert.ok(!serialized.includes('filha@example.invalid'));
 assert.ok(!serialized.includes('Senha123456'));
});
