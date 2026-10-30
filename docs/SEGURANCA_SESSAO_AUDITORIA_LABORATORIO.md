# LOOP V5 — protecao de sessao e auditoria no laboratorio

> Implementado somente para contas ficticias no servidor local, em 15/10/2026.
> **Nao autoriza cadastro externo, pagamentos reais ou publicacao do sistema.**

## Alteracoes desta etapa

- Acesso ao escritorio individual continua por **nome + senha**, com identidade derivada da sessao; o navegador nao escolhe conta por ID.
- Operacoes POST de entrar/sair exigem JSON, cabecalho `X-LOOP-LAB: participante` e, quando presente, o Fetch Metadata `Sec-Fetch-Site` precisa indicar mesma origem ou `none`. O servidor local tambem verifica socket, Host e Origin. Nao habilitamos CORS.
- Cookie `HttpOnly`, `SameSite=Strict`, expiracao de 20 minutos e escopo apenas das APIs individuais. Token aleatorio de 256 bits e guardado somente como hash SHA-256 no backend RAM.
- Login subsequente no mesmo navegador **revoga a sessao anterior** para evitar reaproveitamento do cookie antigo.
- Ate cinco senhas invalidas por IP de loopback na janela de quinze minutos; bloqueios adicionais sao registrados uma vez por janela, evitando inflar a auditoria.
- `src/domain/auditoria-acesso-participante-demo-sqlite.js` registra tipos fechados de eventos: `LOGIN_SUCESSO`, `LOGIN_INVALIDO`, `LOGIN_BLOQUEADO`, `SESSAO_REVOGADA`, `SESSAO_ENCERRADA`. O log grava tipo, timestamp e ID interno da conta apenas para eventos autenticados.
- **Nao grava senhas, nome, email, CPF, IP, cookie, token ou cabeçalho Authorization.** O relatorio admin elimina inclusive o ID interno e mostra somente eventos genericos e contadores.
- Banco SQLite com triggers de bloqueio de UPDATE e DELETE sobre os eventos de acesso. Uma falha no registro de sucesso impede a abertura de nova sessao.
- `GET /api/admin/auditoria-acessos-participante-demo` exige token de admin local e aceita apenas `?limite=1..100`. Sem POST para editar a auditoria.
- Painel local `/admin/cadastro-participantes-demo` agora exibe contadores de tentativas de senha, bloqueios, logins e sessoes finalizadas, sem listas de usuarios na secao de auditoria.

## Testes

`test/auditoria-acessos-participante-demo.test.js` valida a imutabilidade, ausencia de segredos, limitação de bloqueios por janela, falha fechada de auditoria, rejeicao de CSRF, rotacao de sessao, privacidade do relatorio e isolamento do servidor publico.

`test/escritorio-individual-sessoes-demo.test.js` inclui as verificacoes de cabecalho nas chamadas POST e um caso onde falta a protecao.

## Limitacoes antes de usuarios reais

A protecao aqui e **apenas um prototipo local**. O cookie nao tem flag Secure por ser usado em HTTP no loopback; nenhum destes mecanismos deve ser colocado no dominio de producao como esta. Ainda precisamos:

- identidade unica/CPF validado conforme base legal, retenção minimizada e LGPD;
- HTTPS, cookies `Secure`, gestao persistente/distribuida de sessoes, rate limiter externo e CSRF para origem publica real;
- confirmacao de email, recuperacao segura de senha, termos e politicas documentados;
- plano de incidentes, backups, observabilidade, revisao independente e testes de penetracao;
- integracao real de PSP, comprovacao antifraude, chargebacks e conciliação juridico-financeira;
- homologacao do fluxo completo de pedidos, fornecedores, filas, tabuleiro e operacao.

**Progresso de codigo e testes automatizados nao equivale a liberacao para operar comercialmente.**
