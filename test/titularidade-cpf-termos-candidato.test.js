'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizarCpf}=require('../src/domain/titularidade-cpf-termos-candidato');
test('rejeita CPF invalido e repetido no ensaio',()=>{
 assert.throws(()=>normalizarCpf('00000000000'),/CPF_INVALIDO/);
 assert.throws(()=>normalizarCpf('12345678900'),/CPF_INVALIDO/);
 assert.throws(()=>normalizarCpf(''),/CPF_INVALIDO/);
});

const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {AutenticacaoCheckoutStagingSQLite}=require('../src/domain/autenticacao-checkout-staging-sqlite');
const {TitularidadeCpfTermosCandidato}=require('../src/domain/titularidade-cpf-termos-candidato');
test('custodia cifrada, termo imutavel, consentimento e identidade sem privilegios',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const auth=new AutenticacaoCheckoutStagingSQLite({banco:db});
 const a=await auth.provisionarConta({nomeLogin:'cadastro-candidato-a',senha:'SenhaSeguraCandidata2026!'});
 const b=await auth.provisionarConta({nomeLogin:'cadastro-candidato-b',senha:'OutraSenhaSegura2026!'});
 const hmac=randomBytes(32),key=randomBytes(32);
 const cad=new TitularidadeCpfTermosCandidato({banco:db,chaveHmac:hmac,chaveCifra:key});
 const params={titularId:a.titularId,cpf:'529.982.247-25',
  termosVersao:'LAB-revisao-2026',
  termosTexto:'Termos de laboratorio sem compras, saques, remuneracoes ou direitos reais.',
  aceiteExplicito:true,autorizado:true};
 assert.throws(()=>cad.registrar({...params,aceiteExplicito:false}),/TERMOS_NAO_ACEITOS/);
 assert.throws(()=>cad.registrar({...params,autorizado:false}),/NAO_AUTORIZADO/);
 const one=cad.registrar(params);
 assert.equal(one.estado,'NAO_VERIFICADA_EXTERNAMENTE');
 assert.equal(one.permitidoCriarPosicoes,false);
 assert.equal(one.permitidoSacar,false);
 assert.equal(cad.registrar(params).repetido,true);
 assert.equal(cad.consultar({titularId:a.titularId}).identidadeExternaVerificada,false);
 assert.equal(cad.consultar({titularId:b.titularId}),null);
 assert.throws(()=>cad.registrar({...params,titularId:b.titularId}),/CPF_OU_TITULAR_JA_VINCULADO/);
 const raw=db.prepare('SELECT * FROM akitemm_candidato_titularidade_laboratorio').get();
 assert.doesNotMatch(JSON.stringify(raw),/52998224725/);
 assert.equal(raw.cpf_hmac.length,64);
 assert.throws(()=>db.prepare(
  "UPDATE akitemm_candidato_titularidade_laboratorio SET termos_versao='LAB-2'"
 ).run(),/imutavel/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
