# Homologacao externa — Asaas Sandbox + Railway — 06/11/2026

## Prova real concluida, escopo estrito

- Ambiente Railway: projeto `loop-asaas-homologacao`, ambiente `homologacao`, servico `akitemm-escritorio-preview`.
- Implantada no GitHub a sonda `scripts/verificar-acesso-asaas-sandbox-preview.js`, com testes de fail-closed em `test/verificar-acesso-asaas-sandbox-preview.test.js`.
- A sonda usa exclusivamente a chave de homologacao armazenada no Railway, em **GET** para `https://api-sandbox.asaas.com/v3/payments?limit=1`, sem emitir cobranca ou divulgar token/PSP IDs.
- A sonda esta configurada no **pre-deploy** do servico: `node scripts/verificar-acesso-asaas-sandbox-preview.js`; o comando termina com erro se nao houver resposta valida do PSP. Nao altera a autorizacao de saque.
- Logs do Railway no deploy `9dbf90e5-325c-412e-a4ab-d39928ff2d29` (06/11/2026 18:34:58 UTC): `LOOP_ASAAS_SANDBOX_GET_REMOTO=CONFIRMADO_SEM_COBRANCA`; deploy **SUCCESS** e healthcheck aprovado.
- Repeticao no deploy `676b3143-116b-4f3e-8ebb-b1d98a84ca8b` (06/11/2026 18:36:14 UTC): mesma confirmacao remota e deploy **SUCCESS**.
- Origem do Railway fixada no commit `d342a106295e1c1b67d8b3a1c8526d3ff5993477` da branch `feature/unificar-escritorio-real-20261105`. Isso impede cair silenciosamente no `main` ao alterar variaveis, enquanto preserva um candidato homologado estavel. Para testar novas mudancas, atualizar o commit fixado deliberadamente apos validar.
- PR #1 continua DRAFT na branch `fix/teste-escrita-catraca-20261014`. Nenhum merge ou liberacao comercial.

## O que esta prova NAO demonstra

Esta execucao atesta somente que **a chave do Sandbox e valida para consulta HTTP autenticada**, que o Railway consegue alcancar o ambiente externo e que o servico sobe com a configuracao. Nao houve POST de pagamento, QR code, liquidacao Pix, callback real, criacao de posicao por PSP externo, pagamento real ou saque.

## Gates P0 ainda pendentes

1. Prova ponta a ponta com **pedido ficticio em conta de ensaio isolada + cobranca Pix exclusivamente no Asaas Sandbox + resposta PSP + webhook assinado + reconciliacao idempotente no mesmo SQLite + criacao de posicao para o titular correto + prova de retry, restart e ausencia de duplicidade**.
2. Comprovacao externa de cargas, RPO/RTO e restauracao independente, com medicao.
3. Parecer juridico/consumerista independente e demonstracao documental de sustentabilidade financeira/cobertura de obrigacoes condicionais, antes de publicidade com expectativa de retorno.
4. Integracao de fornecedor, checkout e infraestrutura comercial ainda nao autorizada.

NENHUMA conclusao de Marco Zero pode ser inferida de um deploy SUCCESS ou da autenticacao remota isolada. Nao expor os segredos nem simular recebimento real.
