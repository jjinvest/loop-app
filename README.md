# LOOP V6 — Plataforma de loja e Escritório Virtual

O **LOOP é uma plataforma web**, acessível por navegador em **celular, tablet e computador**, com a mesma base de dados e as mesmas regras de operação. Não é um aplicativo móvel instalável nem existem versões separadas para Android, iOS e Windows.

## Módulos do laboratório

- **Vitrine pública:** `/` — apresentação e produtos, sem checkout real.
- **Loja do participante:** `/laboratorio/loja` — catálogo, carrinho, compras de teste e divulgação por link.
- **Escritório Virtual:** `/laboratorio/participante` — sessão fictícia, links de indicação, acompanhamento das filas A/B, tabuleiro, termos e histórico.
- **Administração:** `/admin`, `/admin/financeiro-demo` e demais painéis do laboratório — catálogo, pedidos e controles.
- **Catraca V6:** centro + seis vagas; novas entradas pela vaga 6; regra de prioridade 3A/1B; seis eventos por ciclo.
- **Caixa das douradas:** posições operacionais da empresa, criadas por botão administrativo sem CPF/pedido/receita, ou assumidas do fluxo original nas condições registradas.

## Testes de responsividade

A integração Playwright usa Chromium em dois contextos distintos: telefone com toque e computador sem emulação móvel. Verifica as telas de apresentação pública, produto, loja, Escritório Virtual, administração financeira, catálogo, escritório administrativo e contas de teste, em **320, 360, 390, 412, 768, 1024 e 1366 pixels**. O teste também exerce a criação de posição dourada pela interface administrativa e verifica ausência de overflow horizontal e de controles fora da viewport.

Veja `scripts/testar-loja-mobile-browser.js`, `.github/workflows/mobile-loop.yml` e `docs/RESPONSIVIDADE_PLATAFORMA_LOOP_V6.md`.

## Como executar localmente

Instale as dependências com `npm ci` e rode `npm test`. O laboratório administrativo usa o script `npm run start:admin-demo`, desde que as variáveis ambientais de laboratório estejam configuradas: `LOOP_ADMIN_CATALOGO_LOCAL=1`, `LOOP_CATALOGO_DB` apontando para arquivo SQLite **fora do repositório**, e `LOOP_ADMIN_TEST_TOKEN` com a chave fictícia local. O servidor administrativo escuta apenas em `127.0.0.1` e **não aceita execução em `NODE_ENV=production`**.

## Estado e cautelas

O código atual é um **protótipo de laboratório**, sem cobrança, split, transferência, saque, CPF real ou contemplação real. As projeções e os caixas não constituem saldos bancários. Antes de oferecer a plataforma publicamente com funções financeiras, serão necessários avaliação jurídica do modelo, viabilidade econômica, proteção ao consumidor e à LGPD, verificações de identidade, autenticação de produção, pagamentos reais, entregas, estornos e conciliação auditável.

O desenvolvimento ocorre na branch de trabalho e no PR; nenhuma alteração aqui significa publicação em produção ou merge autorizado.
