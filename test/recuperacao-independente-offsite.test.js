'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const {provarRecuperacaoIndependente,validarManifesto}=
 require('../src/producao/recuperacao-independente-offsite');
const config={
 endpoint:'https://storage.example.invalid',bucket:'loop-clientes-dr-testes',
 accessKeyId:'CHAVE_TESTE_SOMENTE',secretAccessKey:'SegredoDeTesteInutil123456789012345',
 region:'auto'
};
const chaveObjeto=
 'clientes/2026-11-07/01234567-89ab-4cde-8fab-0123456789ab.looprealbak';
const DOC='Texto de teste para criar identidade isolada e confirmar o backup. '+
 'Sem cobranca, pagamento, distribuidor, ganhos ou uso comercial. '+
 'Conteudo exclusivamente ficticio de homologacao; nenhuma clausula e valida.';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-dr-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const banco=new DatabaseSync(path.join(dir,'clientes.sqlite'));
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const chaveEmail=randomBytes(32),chaveCifra=randomBytes(32),
  chaveCodigo=randomBytes(32),chaveBackup=randomBytes(32);
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail,chaveCifra,chaveCodigo,
  termos:{versao:'TERMOS-TESTE',texto:DOC},
  privacidade:{versao:'PRIVACIDADE-TESTE',texto:DOC},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos();
 await contas.cadastrar({
  nome:'Cliente Teste',nick:'Cliente',email:'teste@example.invalid',
  senha:'SenhaSomenteParaTeste2026!',aceiteTermos:true,
  aceitePrivacidade:true,versaoTermos:docs.termos.versao,
  hashTermos:docs.termos.hash,versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 await contas.entrar({nick:'Cliente',senha:'SenhaSomenteParaTeste2026!'});
 t.after(()=>banco.close());
 const backup=path.join(dir,'copia.looprealbak');
 const gerado=await criarBackupIdentidadeReal({
  origem:path.join(dir,'clientes.sqlite'),destino:backup,
  chaveBackup,autorizado:true
 });
 const objeto=fs.readFileSync(backup);
 const manifesto={
  chaveObjeto,sha256Cifrado:gerado.sha256Cifrado,
  bytes:gerado.tamanhoBytes,contas:gerado.contas,
  pedidos:gerado.pedidos,linhasCustos:gerado.linhasCustos,
  remessas:gerado.remessas,cotacoes:gerado.cotacoes,
  administracaoIncluida:gerado.administracaoIncluida,
  recuperacaoComercialIncluida:gerado.recuperacaoComercialIncluida
 };
 const chavesRecuperacao={chaveEmail,chaveCifra,chaveCodigo};
 return {banco,objeto,manifesto,chaveBackup,chavesRecuperacao};
}
const opts=(f,extra={})=>({
 config,manifesto:f.manifesto,chaveBackup:f.chaveBackup,
 chavesRecuperacao:f.chavesRecuperacao,
 agora:()=>new Date('2026-11-07T08:00:00Z'),
 buscar:async(url,opt)=>{
  assert.equal(opt.method,'GET');assert.equal(opt.redirect,'error');
  assert.equal(new URL(url).pathname,'/'+chaveObjeto);
  return new Response(f.objeto,{status:200,
   headers:{'Content-Length':String(f.objeto.length)}});
 },...extra
});
test('manifesto de outra conta, hash ausente ou contagem indefinida bloqueia DR',()=>{
 const valido={chaveObjeto,sha256Cifrado:'a'.repeat(64),bytes:400,
  contas:1,pedidos:0,linhasCustos:0,remessas:0,cotacoes:0,
  administracaoIncluida:false,recuperacaoComercialIncluida:false};
 assert.deepEqual(validarManifesto(valido),valido);
 for(const m of [
  {...valido,chaveObjeto:'../outra.sqlite'},
  {...valido,sha256Cifrado:undefined},
  {...valido,contas:undefined},
  {...valido,administracaoIncluida:'SIM'}
 ])assert.throws(()=>validarManifesto(m),{
  codigo:'RECUPERACAO_INDEPENDENTE_MANIFESTO_INVALIDO'
 });
});
test('GET independente reconstitui somente em pasta descartavel e valida custodia',async t=>{
 const f=await fixture(t);
 const antes=f.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_sessoes')
  .get().n;
 const prova=await provarRecuperacaoIndependente(opts(f));
 assert.equal(prova.estado,'OBJETO_CIFRADO_BAIXADO_RESTAURADO_E_LIDO');
 assert.equal(prova.contas,1);
 assert.equal(prova.chavesDeLeituraVerificadas,true);
 assert.equal(prova.recuperacaoOutraRegiaoComprovada,false);
 assert.equal(prova.custodiaExternaIndependenteComprovada,false);
 assert.equal(prova.conciliacaoPspBancoComprovada,false);
 assert.equal(prova.financeiroRealHabilitado,false);
 assert.equal(prova.remessasNaoReenviadas,true);
 assert.equal(f.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_sessoes')
  .get().n,antes,'banco original nao pode perder sessao');
 assert.equal(f.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('SHA conhecido do manifesto e conteudo adulterado sao rejeitados',async t=>{
 const f=await fixture(t);
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  manifesto:{...f.manifesto,sha256Cifrado:'f'.repeat(64)}
 })),{codigo:'RECUPERACAO_INDEPENDENTE_HASH_DIVERGENTE'});
 const mudado=Buffer.from(f.objeto);
 mudado[100]^=0x01;
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  buscar:async()=>new Response(mudado,{status:200})
 })),{codigo:'RECUPERACAO_INDEPENDENTE_HASH_DIVERGENTE'});
});
test('bytes, contas e chaves reais divergentes falham fechados',async t=>{
 const f=await fixture(t);
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  manifesto:{...f.manifesto,bytes:f.manifesto.bytes+1},
  buscar:async()=>new Response(f.objeto,{status:200})
 })),{codigo:'RECUPERACAO_INDEPENDENTE_TAMANHO_DIVERGENTE'});
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  manifesto:{...f.manifesto,contas:2}
 })),{codigo:'RECUPERACAO_INDEPENDENTE_DADOS_DIVERGENTES'});
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  chavesRecuperacao:{...f.chavesRecuperacao,chaveCifra:randomBytes(32)}
 })),{codigo:'RECUPERACAO_CUSTODIA_IDENTIDADE_DIVERGENTE'});
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  chaveBackup:randomBytes(32)
 })),{codigo:'RESTAURACAO_IDENTIDADE_REAL_FALHOU_OU_CHAVE_INVALIDA'});
});
test('erro remoto e objeto grande nao recebem aprovacao',async t=>{
 const f=await fixture(t);
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  buscar:async()=>new Response(null,{status:403})
 })),{codigo:'RECUPERACAO_INDEPENDENTE_GET_FALHOU'});
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  maxBytes:f.manifesto.bytes-1
 })),{codigo:'RECUPERACAO_INDEPENDENTE_CONFIG_INVALIDA'});
 await assert.rejects(provarRecuperacaoIndependente(opts(f,{
  buscar:async()=>{throw Error('SEGREDO_DE_TESTE_NAO_EXIBIR');}
 })),{codigo:'RECUPERACAO_INDEPENDENTE_GET_FALHOU'});
});