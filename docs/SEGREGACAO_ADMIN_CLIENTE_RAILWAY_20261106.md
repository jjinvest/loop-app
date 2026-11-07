# LOOP 3.0 / AKITEMM — segregação de acesso entre cliente e operador — 06/11/2026

**Correção P0 para a abertura técnica.** A interface era hospedada atrás de um mesmo HTTP Basic para clientes e operador. A primeira separação de cookies não bastava: a mesma senha Basic ainda podia ser aceita como autorização administrativa quando `LOOP_PREVIEW_SENHA_ADMIN` não estivesse configurada. **Não entregar senhas compartilhadas a usuários do piloto.**

## Medidas implementadas

1. Secret `LOOP_PREVIEW_SENHA_ADMIN` isolado configurado no serviço Railway protegido da homologação, **sem modificar a senha de acesso do cliente**; valor de segredo nunca publicado em GitHub, documentação ou logs.
2. O iniciador do gateway falha em modo fechado sem uma senha de administrador independente e forte, distinta da senha do visitante.
3. Conta Basic `acesso` (cliente) versus `operador` (administrador) são credenciais diferentes. O acesso cliente não habilita `/escritorio`, `/staging/escritorio-admin`, `/staging/escritorio-unificado/*`, nem os assets administrativos. O cabeçalho Bearer do backend só é injetado após a autenticação do operador.
4. Cookie do admin rotacionado para `akitemm_preview_admin_v2`, com assinatura renovada; os cookies anteriores não autorizam mais o painel. Cookie do visitante `akitemm_preview_access` não eleva privilégios.
5. A raiz `/` passa a apontar para o Escritório do Cliente, não para o painel de administração. Os atalhos `/loja` e `/minha-conta` continuam disponíveis ao visitante autenticado.
6. `/staging/asaas/*` interno é bloqueado no gateway; os webhooks Sandbox só entram pela rota externa exclusiva, com validação própria do token.

## Provas e limites

- O conjunto `test/isolamento-operador-gateway-preview.test.js` demonstra que o cookie de visitante é rejeitado nas rotas administrativas, que o token de operador não é aceito como token de cliente, que credenciais diferentes são exigidas e que tentativas de falsificar o cookie são bloqueadas.
- Implantação Railway `a511c477-ebd7-4a2b-8ccd-b4c7e8030d1b`: **SUCCESS**, verificação de prontidão e regressões do fluxo cliente/fila/catraca; nova configuração administrativa separada carregada no serviço.
- `scripts/provar-fronteira-admin-railway.js` prepara a prova HTTP GET na aplicação publicada, incluindo tentativa de cliente de ler rotas administrativas. **Conferir logs da implantação de prova posterior antes de declarar esta etapa concluída externamente.**

**Não é certificação abrangente de segurança:** permanecem revisão de autorização de cada rota, ameaça de sessão e CSRF, pentest, LGPD/privacidade, governança e separação definitiva da base do futuro piloto real. Nenhuma conta financeira comercial foi aberta; a PR #1 continua DRAFT.

O controle deve ser provado por ataques de visitante, e não apenas pela contagem de testes.
