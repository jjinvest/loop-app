# AKITEMM / LOOP 3.0 — Aba Meus Pedidos no navegador de homologação

**Escopo:** ambiente de ensaio local com conta fictícia e SQLite persistente. Esta tela não é a loja pública nem substitui a interface definitiva aprovada. Não habilita compras, pagamentos, posições reais, bônus, giros ou saques.

## Funciona no mesmo servidor de ensaio

A interface HTML está em `src/laboratorio/checkout-staging-ui.html`, com estilos e lógica de navegador próprios. O servidor `src/laboratorio/servidor-checkout-staging-local.js` publica **apenas para loopback**, no endereço padrão `http://127.0.0.1:3108/staging/cliente`, e carrega os recursos da mesma origem. Os recursos não são montados no `src/server.js`. Há política CSP de scripts e estilos somente de mesma origem, cache desativado e `noindex`.

Para iniciar, provisionar **uma conta fictícia** por operação autorizada `LOOP_CHECKOUT_STAGING_ACAO=PROVISIONAR` com `LOOP_CHECKOUT_STAGING_PROVISIONAR=SIM`, `LOOP_CHECKOUT_STAGING_SQLITE` apontando para um arquivo SQLite privado, `LOOP_CHECKOUT_STAGING_LOGIN` e `LOOP_CHECKOUT_STAGING_SENHA`. Usar `npm run start:checkout-staging`; não compartilhar senhas nos chats ou no GitHub. Depois iniciar com `LOOP_CHECKOUT_STAGING_ACAO=SERVIR` e `LOOP_CHECKOUT_STAGING_SERVIR=SIM` usando a mesma base. O login cria sessão HTTP-only e CSRF, ambos do laboratório.

Na aba **Preparar pedido**, a conta faz cotação do produto fictício de R$ 250,00, prepara rascunho e pré-pedido. Ao concluir, a navegação passa para a aba independente **Meus Pedidos** (não abre popup). A listagem recupera os pedidos do titular e o último estado persistido de homologação, sem chamada automática ao PSP. A aba permanece disponível após atualizar o navegador. Status de pagamento do Sandbox e posição pendente *fictícia* aparecem quando o operador executou antes os procedimentos autorizados de homologação descritos em `ROTEIRO_HOMOLOGACAO_WEBHOOK_ASAAS_SANDBOX_EXTERN0.md`; não representam liquidação real nem direito financeiro.

O botão **Atualizar** consulta exclusivamente o SQLite do staging. A sessão encerra com logout. O cadastro de usuários pelo site continua inexistente e o checkout público continua HTTP 503.

## Evidência e limites

`test/checkout-staging-interface-local.test.js` verifica a política de conteúdo, caminhos permitidos e que o servidor público não disponibiliza esta UI. `scripts/validar-checkout-staging-browser.js` usa Playwright Chromium em computador e celular, conta fictícia, navegador real, pedido R$ 250, atualização/recarregamento e grava capturas sem senha nem cookie exibidos. O workflow `.github/workflows/validar-meus-pedidos.yml` executa a prova junto à regressão; **[CI aprovado em SHA exato](https://github.com/jjinvest/loop-app/actions/runs/41364262222)**: `d71c7b71b8ec7df79e44b5db228554d7dedc5e79`, PC/celular e teste HTTP de isolamento aprovados. Artifact `meus-pedidos-captura-real` com capturas novas; não comprova venda real ou webhook externo.

**Pendente para vender:** domínio e HTTPS externos, autenticação homologada de produção, titular/CPF e termos, integração remota do próprio Asaas, financeiro, backup externo/monitoramento, aprovação final do proprietário e parecer jurídico independente. Não abrir a UI de homologação na internet, não aceitar dinheiro real e não fazer merge/deploy sem autorização. PR #1 segue DRAFT.
