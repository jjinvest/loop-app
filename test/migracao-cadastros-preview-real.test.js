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
 // Cadastros desconectados do vínculo legítimo não podem entrar sem revisão.
 const avulsa=await previa.cadastrar(dados('Avulsa','21988887766'));
 const token=randomBytes(32).toString('hex');
 const snap=exportarPreview({
  banco:src,contas:previa,raizNick:'Indica',primeiroNick:'Filha'
 });
 assert.equal(snap.contas.length,2);assert.equal(snap.vinculos.length,1);
 assert.equal(snap.conferencias.contasAvulsasIgnoradas,1);
 assert.deepEqual(snap.conferencias.perfilAvulsas,{
  nickCompativelReal:1,nickIncompativelReal:0,
  indicacaoForaDaRedeValidada:0,semIndicacaoRegistrada:1
 });
 assert.ok(!snap.contas.some(c=>c.id===avulsa.titularId),
  'conta sem proveniencia de convite fica preservada na origem');
 assert.equal(src.prepare('SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata').get().n,3);
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
 const dc=real.documentos();
 assert.throws(()=>real.aceitarDocumentos({
  titularId:filha.titularId,aceiteTermos:true,aceitePrivacidade:false,
  versaoTermos:dc.termos.versao,hashTermos:dc.termos.hash,
  versaoPrivacidade:dc.privacidade.versao,hashPrivacidade:dc.privacidade.hash
 }),/DOCUMENTOS_ALTERADOS_RELER/);
 assert.equal(real.aceitarDocumentos({
  titularId:filha.titularId,aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:dc.termos.versao,hashTermos:dc.termos.hash,
  versaoPrivacidade:dc.privacidade.versao,hashPrivacidade:dc.privacidade.hash
 }).documentosConfirmados,true);
 assert.equal(real.dadosTitular(filha.titularId).aceiteDocumentosDefinitivosPendente,false);
 assert.equal(dst.prepare('SELECT COUNT(*) AS n FROM loop_real_aceites_documentos').get().n,1);
 assert.equal(dst.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(validarIdentidade(path.join(dir,'clientes.sqlite')).contas,2);
 const serialized=JSON.stringify(dst.prepare('SELECT * FROM loop_real_contas').all());
 assert.ok(!serialized.includes('11988887777'));
 assert.ok(!serialized.includes('filha@example.invalid'));
 assert.ok(!serialized.includes('Senha123456'));
 // Reconciliacao ampliada: uma identidade antiga sem indicacao permanece
 // a MESMA conta no definitivo, mas nunca ganha indicador, pedido ou saldo.
 const todas=exportarPreview({banco:src,contas:previa,
  raizNick:'Indica',primeiroNick:'Filha',
  incluirContasRegistradasSemRede:true});
 assert.equal(todas.contas.length,3);
 assert.equal(todas.vinculos.length,1);
 assert.equal(todas.conferencias.contasNaRedeComprovada,2);
 assert.equal(todas.conferencias.contasAvulsasOrigem,1);
 assert.equal(todas.conferencias.contasAvulsasIgnoradas,0);
 const ampliacao=importarNoReal({
  banco:dst,payload:todas,chaveEmail:emailReal,chaveCifra:cipherReal
 });
 assert.equal(ampliacao.contasImportadas,3);
 assert.equal(ampliacao.vinculosImportados,1);
 assert.equal(ampliacao.adicionadas,1);
 assert.equal((await real.entrar({
  nick:'Avulsa',senha:'Senha123456'
 })).titularId,avulsa.titularId);
 assert.equal(dst.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao WHERE indicado_id=?'
 ).get(avulsa.titularId).n,0);
 assert.equal(real.dadosTitular(avulsa.titularId)
  .aceiteDocumentosDefinitivosPendente,true);
 assert.equal(importarNoReal({
  banco:dst,payload:todas,chaveEmail:emailReal,chaveCifra:cipherReal
 }).adicionadas,0);
 assert.equal(src.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
 ).get().n,3,'origem intacta depois da migracao');
 assert.equal(validarIdentidade(path.join(dir,'clientes.sqlite')).contas,3);
});
