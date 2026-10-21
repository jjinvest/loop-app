'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {SessoesParticipanteDemo}=require('../src/domain/sessoes-participante-demo');

test('Meu Perfil: três campos de senha visíveis, não são enviados no formulário de contatos',()=>{
 const src=readFileSync(path.join(__dirname,'../src/laboratorio/loop-03-shell.js'),'utf8');
 const bloco=src.slice(src.indexOf('<details id="loop03TrocarSenha"'),src.indexOf('<div class="loop03-cpf-travado"'));
 assert.match(bloco,/<details id="loop03TrocarSenha"[^>]* open>/);
 assert.match(bloco,/<summary>Alterar senha /);
 for(const [id,autocomplete] of [['loop03SenhaAtual','current-password'],
  ['loop03SenhaNova','new-password'],['loop03SenhaConfirma','new-password']]){
  assert.match(bloco,new RegExp('id="'+id+'" type="password" autocomplete="'+autocomplete+'"'));
 }
 assert.ok(bloco.indexOf('loop03SalvarSenha')<bloco.indexOf('loop03Sair'));
 const perfil=src.slice(src.indexOf('<form id="loop03FormPerfil"'),src.indexOf('</form>',src.indexOf('<form id="loop03FormPerfil"')));
 assert.doesNotMatch(perfil,/loop03SenhaAtual|loop03SenhaNova|loop03SenhaConfirma/);
 assert.match(src,/\/api\/laboratorio\/participante\/alterar-senha/);
});
test('Senha atual é obrigatória, senha nova não pode ser igual e sessões antigas são revogáveis',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const a=contas.cadastrar({nome:'Participante Seguro Demo',email:'seguro@exemplo.invalid',
  senha:'senha-antiga-segura-2026'});
 const b=contas.cadastrar({nome:'Outra Pessoa Demo',email:'outra@exemplo.invalid',
  senha:'senha-terceiro-segura-2026'});
 const sessoes=new SessoesParticipanteDemo({contas});
 const sessao1=sessoes.entrar({nome:a.nome,senha:'senha-antiga-segura-2026',origem:'teste1'}).token;
 const sessao2=sessoes.entrar({nome:a.nome,senha:'senha-antiga-segura-2026',origem:'teste2'}).token;
 const sessaoOutro=sessoes.entrar({nome:b.nome,senha:'senha-terceiro-segura-2026',origem:'teste3'}).token;
 assert.throws(()=>contas.alterarSenha({
  contaId:a.contaId,senhaAtual:'senha-errada-segura-2026',novaSenha:'senha-nova-segura-2026'
 }),/CREDENCIAIS_INVALIDAS/);
 assert.throws(()=>contas.alterarSenha({
  contaId:a.contaId,senhaAtual:'senha-antiga-segura-2026',novaSenha:'senha-antiga-segura-2026'
 }),/SENHA_REPETIDA/);
 assert.throws(()=>contas.alterarSenha({
  contaId:a.contaId,senhaAtual:'senha-antiga-segura-2026',novaSenha:'fraca'
 }),/INVALIDO/);
 assert.equal(contas.alterarSenha({contaId:a.contaId,
  senhaAtual:'senha-antiga-segura-2026',novaSenha:'senha-nova-segura-2026'}).senhaAlterada,true);
 assert.equal(sessoes.revogarTodasDaConta(a.contaId),2);
 assert.equal(sessoes.identificar(sessao1),null);
 assert.equal(sessoes.identificar(sessao2),null);
 assert.equal(sessoes.identificar(sessaoOutro),b.contaId);
 assert.throws(()=>contas.autenticar({nome:a.nome,senha:'senha-antiga-segura-2026'}),/CREDENCIAIS_INVALIDAS/);
 assert.equal(contas.autenticar({nome:a.nome,senha:'senha-nova-segura-2026'}).conta.contaId,a.contaId);
 const senhaBanco=repo.banco.prepare('SELECT senha_hash_hex AS h FROM admin_contas_participantes_demo WHERE id=?')
  .get(a.contaId).h;
 assert.doesNotMatch(senhaBanco,/senha-nova-segura-2026/);
 assert.equal(senhaBanco.length,128);
});
