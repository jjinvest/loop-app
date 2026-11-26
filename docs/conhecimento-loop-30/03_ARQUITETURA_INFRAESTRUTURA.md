# 03 — Arquitetura e Infraestrutura

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

AKITEMM comercializa → qualificação/pagamento confirmado cria posição → fila mantém ordenação → porteira verifica autorização/caixa/horário → Distribuição executa eventos e ciclos → livro projeta os painéis. Cadastro, pedido, direito, crédito e pagamento são entidades distintas.

Domínio operacional observado: akitemmloop.com.br. Links do proprietário: /escritorio/VILELA e /loja/VILELA. AKITEMM é a marca; outros domínios citados no histórico não são certificados por este inventário.

Railway: projeto `8c1ab327-16f0-409a-90ac-8f02a3f5eae0`, ambiente `e5c30d7f-086f-4845-93ad-7d1a5ca5e31b` (nome técnico homologacao). Gateway akitemm-escritorio-preview serve o domínio e encaminha ao loop-identidade-real. O nome legado preview não determina a procedência dos dados. Terceiro serviço asaas-webhook-staging é isolado e usa revisão histórica.

A identidade usa /dados-reais/clientes.sqlite; catálogo/mídia /dados-reais/catalogo-produtos.sqlite; lote de conferência /dados-reais/testes-modulos.sqlite separado. Volumes /dados-preview e /loop-staging também existem. Não copiar SQLite aberto com simples cp: usar os mecanismos de snapshot consistente existentes. Não anexar volume real em testes.

Runtime Node 24, CommonJS, SQLite, Express. Inventário JSON captura configurações, comandos, âncoras de integridade, mounts, regiões e NOMES das variáveis. Valores secretos não foram exportados. O gateway tem pacote mínimo próprio; reconstruí-lo com toda a árvore reprovaria sua trava. Domínio verificado/TLS válido segundo Railway; DNS autoritativo completo e conta do registrador não foram exportados.

## Fontes integrais preservadas

- [LEIA_PRIMEIRO_ESSENCIA_UNICA_LOOP_AKITEMM_21 NOV2026.md](../LEIA_PRIMEIRO_ESSENCIA_UNICA_LOOP_AKITEMM_21NOV2026.md)
- [CONTINUIDADE_UNICA_REAL_LOOP_AKITEMM_17 NOV2026.md](../CONTINUIDADE_UNICA_REAL_LOOP_AKITEMM_17NOV2026.md)
- [Código: scripts/iniciar-gateway-publico-real-loop.js](../../scripts/iniciar-gateway-publico-real-loop.js)
- [Código: scripts/iniciar-cadastro-publico-release.js](../../scripts/iniciar-cadastro-publico-release.js)
- [Código: scripts/iniciar-identidade-real-loop.js](../../scripts/iniciar-identidade-real-loop.js)
- [Código: src/producao/servidor-identidade-loop.js](../../src/producao/servidor-identidade-loop.js)

[Voltar ao índice geral](README.md).
