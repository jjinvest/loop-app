# 12 — Integrações Externas

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Adaptadores são substituíveis; mudar PSP não pode duplicar obrigação. Contrato de porta não significa banco conectado. Asaas Sandbox, Celcoin, fornecedor e conta receptora aparecem em projetos e históricos com escopos distintos. Não presumir homologação produtiva a partir de testes ou e-mail enviado.

Cadeia externa a demonstrar: pedido com classificação/custos congelados → liquidação PSP reconsultada → pagamento fornecedor/custos → parcela LOOP conciliada e segregada → reserva/consumo do evento → beneficiário → pagamento/saque → conciliação. Estado desconhecido/INDETERMINADO exige revisão, não repetição cega. Um webhook não é prova independente de liquidação.

Integrações presentes incluem Resend para e-mail, S 3 compatível para backups, Railway para execução, domínio e conectores financeiros candidatos. Inventário lista NOMES necessários por serviço; nenhum segredo ou nova credencial foi criado. Não ligar ambiente sandbox a contas comerciais por semelhança de ID.

A confirmação de pagamentos reais, Pix, split, fornecedor, tributos e conformidade jurídica/contábil permanece sem certificação nesta captura. Não prometer que basta conectar chave bancária: há dependências internas/produtivas de consumo/reserva além de autenticação. Registrar novos comprovantes por SHA, ambiente, operação e limite da prova.

## Fontes integrais preservadas

- [INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26 NOV2026.md](../INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26NOV2026.md)
- [RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07 NOV2026.md](../RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md)
- [AKITEMM_LOOP_PIX_SANDBOX_V6.md](../AKITEMM_LOOP_PIX_SANDBOX_V6.md)
- [Código: src/producao/portas-financeiras-modulares.js](../../src/producao/portas-financeiras-modulares.js)
- [Código: src/producao/conciliacao-financeira-externa-readonly.js](../../src/producao/conciliacao-financeira-externa-readonly.js)
- [Código: src/producao/pedidos-fornecedor-outbox.js](../../src/producao/pedidos-fornecedor-outbox.js)
- [Código: src/adapters/email-recuperacao-resend.js](../../src/adapters/email-recuperacao-resend.js)

[Voltar ao índice geral](README.md).
