'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const {renderizarInterfaceAprovada}=require('../src/producao/interface-aprovada-loop');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');

test('operador e cliente compartilham o escritorio sem CSS inline bloqueado',()=>{
 const html=renderizarInterfaceAprovada();
 const css=fs.readFileSync('src/producao/acabamento-botoes-real.css','utf8');
 assert.match(html,/id="loopOperadorAtalhos"[^>]*hidden/);
 assert.match(html,/id="loopVoltarOperador"[^>]*hidden/);
 assert.match(html,/id="loopAcessoAdminMenu" href="\/administrador"/);
 assert.doesNotMatch(html,/<style(?:\s|>)/);
 assert.doesNotMatch(html,/Escritório Virtual · OPERADOR/);
 assert.match(css,/body\.loop03-modo-operador #conteudoEquipe/);
 assert.match(css,/#loopOperadorAtalhos\[hidden\]/);
});
test('correcao administrativa altera somente nome e telefone com auditoria',async t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const doc={versao:'LOOP-TERMOS-2026',texto:'Contrato de identidade e privacidade do exemplo para verificar a auditoria administrativa, com dados ficticios e testes internos.'};
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:doc,privacidade:doc,
  enviarEmail:async()=>true
 });
 const docs=contas.documentos();
 await contas.cadastrar({
  nome:'Nome Original',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaValidaInofensiva2026',cpf:'529.982.247-25',
  telefone:'11987654321',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const antes=contas.consultarCadastroOperador({nick:'ANA'});
 assert.equal(antes.nome,'Nome Original');
 assert.equal(antes.telefone,'11987654321');
 assert.throws(()=>contas.corrigirCadastroOperador({
  nick:'ANA',nome:'Nome Ajustado',telefone:'11991234567',motivo:'curto'
 }),{codigo:'MOTIVO_CORRECAO_OBRIGATORIO'});
 const x=contas.corrigirCadastroOperador({
  nick:'ANA',nome:'Nome Ajustado',telefone:'11991234567',
  motivo:'Correcao solicitada pelo atendimento'
 });
 assert.equal(x.corrigido,true);
 assert.equal(x.cadastro.nome,'Nome Ajustado');
 assert.equal(x.cadastro.telefone,'11991234567');
 assert.equal(x.cadastro.email,antes.email);
 assert.equal(x.cadastro.cpfExibicao,antes.cpfExibicao);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_auditoria_cadastros_operador').get().n,1);
 assert.throws(()=>contas.corrigirCadastroOperador({
  nick:'ANA',nome:'Nome Ajustado',telefone:'11991234567',
  motivo:'Tentativa de repetir a mesma correcao'
 }),{codigo:'NENHUMA_ALTERACAO'});
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_auditoria_cadastros_operador').get().n,1);
});
