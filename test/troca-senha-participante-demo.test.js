'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {SessoesParticipanteDemo}=require('../src/domain/sessoes-participante-demo');

test('mudar senha exige senha atual, impede repeticao e nao altera posicoes/CPF/identidade',t=>{
 const banco=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>banco.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:banco.banco});
 const conta=contas.cadastrar({nome:'Cliente Teste Senha',email:'senha@exemplo.invalid',
  telefone:'21987654321',senha:'senha-antiga-segura-2026'});
 const identidade=contas.buscar(conta.contaId);
 const sessoes=new SessoesParticipanteDemo({contas});
 const s1=sessoes.entrar({nome:conta.nome,senha:'senha-antiga-segura-2026'});
 const s2=sessoes.entrar({nome:conta.nome,senha:'senha-antiga-segura-2026'});
 assert.throws(()=>contas.alterarSenha({contaId:conta.contaId,
  senhaAtual:'errada-123456789',novaSenha:'senha-nova-segura-2026'}),/CREDENCIAIS_INVALIDAS/);
 assert.throws(()=>contas.alterarSenha({contaId:conta.contaId,
  senhaAtual:'senha-antiga-segura-2026',novaSenha:'senha-antiga-segura-2026'}),/SENHA_REPETIDA/);
 assert.equal(contas.alterarSenha({contaId:conta.contaId,
  senhaAtual:'senha-antiga-segura-2026',novaSenha:'senha-nova-segura-2026'}).senhaAlterada,true);
 assert.throws(()=>contas.autenticar({nome:conta.nome,senha:'senha-antiga-segura-2026'}),/CREDENCIAIS_INVALIDAS/);
 assert.equal(contas.autenticar({nome:conta.nome,senha:'senha-nova-segura-2026'}).conta.contaId,conta.contaId);
 assert.equal(sessoes.revogarTodasDaConta(conta.contaId),2);
 assert.equal(sessoes.identificar(s1.token),null);
 assert.equal(sessoes.identificar(s2.token),null);
 assert.deepEqual(contas.buscar(conta.contaId),identidade);
 assert.equal(banco.banco.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='admin_loop_adesoes_contas_demo'").get().n,0);
});
