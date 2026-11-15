'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {ContaUnicaCandidataSQLite}=require('../src/domain/conta-unica-candidata-sqlite');
const {EquipeCandidataSQLite}=require('../src/domain/equipe-candidata-sqlite');

const termosTexto='O cadastro feito por link de indicação permite que o titular daquele link visualize somente o telefone do indicado na Minha Equipe, para contato sobre o LOOP; terceiros não têm acesso. Este ensaio não permite operação financeira.';
const dados=(nick,telefone='21999998888')=>({
 nome:'Pessoa '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
 telefone,senha:'SenhaAbc123',confirmarSenha:'SenhaAbc123',
 termosVersao:'LAB-contato-link-2026',termosTexto,aceiteExplicito:true
});

test('telefone aparece automaticamente somente ao indicador direto vinculado, sem cadastro novo',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 try{
  const contas=new ContaUnicaCandidataSQLite({
   banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)
  });
  const equipe=new EquipeCandidataSQLite({
   banco:db,consultarTelefoneAutorizado:args=>
    contas.telefoneAutorizadoParaIndicador(args)
  });
  const indicador=await contas.cadastrar(dados('Indicador'));
  const outro=await contas.cadastrar(dados('Outra'));
  const pessoa=await contas.cadastrar({
   ...dados('Indicado'),onCriada:({titularId})=>{
    assert.equal(equipe.registrarCadastro({
     indicadoId:titularId,indicadorNick:'Indicador'
    }).registrado,true);
   }
  });
  const primeira=equipe.listar({titularId:indicador.titularId});
  assert.equal(primeira.total,1);
  assert.equal(primeira.cadastros[0].numeroCadastro,1);
  assert.equal(primeira.cadastros[0].filaCadastro,'B');
  assert.equal(primeira.cadastros[0].filaMotorConfirmada,false);
  assert.equal(primeira.cadastros[0].telefone,'21999998888');
  assert.equal(primeira.cadastros[0].nick,'Indicado');
  const bruto=JSON.stringify(db.prepare('SELECT * FROM akitemm_conta_unica_candidata').all());
  assert.ok(!bruto.includes('21999998888'),'telefone nunca em claro no banco');
  assert.equal(contas.telefoneAutorizadoParaIndicador({
   indicadoId:pessoa.titularId,indicadorId:outro.titularId
  }),null,'outro titular não pode ler contato do indicado');
  assert.equal(equipe.listar({titularId:outro.titularId}).cadastros.length,0);
  assert.equal(contas.telefoneAutorizadoParaIndicador({
   indicadoId:pessoa.titularId,indicadorId:pessoa.titularId
  }),null,'indicado não pode falsificar vínculo');
  const segundo=await contas.cadastrar({
   ...dados('Segunda','11988887777'),
   onCriada:({titularId})=>equipe.registrarCadastro({
    indicadoId:titularId,indicadorNick:'Indicador'
   })
  });
  assert.equal(equipe.listar({titularId:indicador.titularId}).cadastros.find(
   p=>p.nick==='Segunda').telefone,'11988887777');
  assert.equal(contas.perfil(segundo.titularId).nick,'Segunda');
  assert.equal(equipe.listar({titularId:indicador.titularId}).total,2);
  // Simula cadastro antigo com telefone cifrado e convite, sem opt-in salvo.
  const permissaoAntiga=db.prepare(
   "SELECT name FROM sqlite_master WHERE name='akitemm_contato_indicador_permissoes'"
  ).get();
  assert.equal(permissaoAntiga,undefined);
  assert.equal(equipe.listar({titularId:indicador.titularId}).cadastros[1].telefone,
   '21999998888');
 }finally{db.close();}
});
test('ficha mostra data/hora, fila B e numeração aberta sem textos de laboratório',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/candidato/checkout-candidato-ui.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../src/candidato/checkout-candidato-ui.html'),'utf8');
 assert.match(src,/String\(numero\)\.padStart\(4,'0'\)/);
 assert.equal(String(1000000).padStart(4,'0'),'1000000');
 assert.match(src,/Horário/);
 assert.match(src,/America\/Sao_Paulo/);
 assert.match(src,/Aguardando confirmação de ativação no LOOP\./);
 assert.match(html,/Li e aceito os termos de cadastro/);
 assert.doesNotMatch(html,/cadastroCompartilharTelefoneIndicador|formCompartilharTelefoneIndicador/);
 assert.doesNotMatch(src,/Nome civil e telefone exigem autorização de compartilhamento/);
 assert.doesNotMatch(src,/Telefone: não disponibilizado nesta prévia/);
 assert.doesNotMatch(src,/Aguardando compra elegível e conciliação Sandbox do indicado/);
});
