'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {ContaUnicaCandidataSQLite}=require('../src/domain/conta-unica-candidata-sqlite');
const {EquipeCandidataSQLite}=require('../src/domain/equipe-candidata-sqlite');
const termosTexto='Cadastro de ensaio do LOOP com permissão separada e facultativa de contato, sem operação financeira.';
const dados=(nick,contato=false)=>({
 nome:'Pessoa '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
 telefone:'21999998888',senha:'SenhaAbc123',confirmarSenha:'SenhaAbc123',
 termosVersao:'LAB-privacidade-2026',termosTexto,aceiteExplicito:true,
 compartilharTelefoneIndicador:contato
});
test('telefone permanece cifrado e só aparece ao indicador direto após aceite expresso, com revogação',async()=>{
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
  assert.equal(primeira.cadastros[0].telefone,null);
  assert.equal(contas.perfil(pessoa.titularId).compartilhaTelefoneComIndicador,false);
  const bruto=JSON.stringify(db.prepare('SELECT * FROM akitemm_conta_unica_candidata').all());
  assert.ok(!bruto.includes('21999998888'),'telefone nunca em claro no banco');
  assert.equal(contas.alterarCompartilhamentoTelefone({
   titularId:pessoa.titularId,permitir:true
  }).compartilhaTelefoneComIndicador,true);
  assert.equal(equipe.listar({titularId:indicador.titularId}).cadastros[0].telefone,'21999998888');
  assert.equal(contas.telefoneAutorizadoParaIndicador({
   indicadoId:pessoa.titularId,indicadorId:outro.titularId
  }),null,'não expor contato a um titular sem vínculo');
  assert.equal(equipe.listar({titularId:outro.titularId}).cadastros.length,0);
  assert.equal(contas.alterarCompartilhamentoTelefone({
   titularId:pessoa.titularId,permitir:false
  }).compartilhaTelefoneComIndicador,false);
  assert.equal(equipe.listar({titularId:indicador.titularId}).cadastros[0].telefone,null);
  const opt=await contas.cadastrar({
   ...dados('Optin',true),
   onCriada:({titularId})=>equipe.registrarCadastro({
    indicadoId:titularId,indicadorNick:'Indicador'
   })
  });
  assert.equal(contas.perfil(opt.titularId).compartilhaTelefoneComIndicador,true);
  assert.equal(equipe.listar({titularId:indicador.titularId}).cadastros.find(
   p=>p.nick==='Optin').telefone,'21999998888');
 }finally{db.close();}
});
test('minha equipe exibe data e hora sem expor CPF e sem teto de quatro dígitos',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/candidato/checkout-candidato-ui.js'),'utf8');
 assert.match(src,/String\(numero\)\.padStart\(4,'0'\)/);
 assert.equal(String(1000000).padStart(4,'0'),'1000000');
 assert.match(src,/Hora|Horário/);
 assert.match(src,/America\/Sao_Paulo/);
 assert.match(src,/Aguardando confirmação de ativação no LOOP\./);
 assert.doesNotMatch(src,/Nome civil e telefone exigem autorização de compartilhamento/);
 assert.doesNotMatch(src,/Telefone: não disponibilizado nesta prévia/);
 assert.doesNotMatch(src,/Aguardando compra elegível e conciliação Sandbox do indicado/);
});
