# 11 — Segurança e Permissões

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Separar visitante, cliente, operador e chamadas internas. Sessões, CSRF, limites de tentativas, captcha, cookies e chaves de serviço são controles do servidor. Interface escondida não é autorização. Clientes só consultam próprios pedidos, posições e financeiro; indicador direto consulta telefone conforme vínculo e política, sem CPF de terceiros.

Segredos não entram no Git, relatório, stdout ou backup em claro. Inventário registra somente nomes. Chaves de cifra, HMAC, e-mail/código/outbox e backup precisam custódia para restaurar dados; credenciais do bucket sozinhas não decifram contas. Não exportar valores por conveniência e não gerar substitutas esperando ler dados antigos.

Backup privado cifrado precisa autenticação, checksum, retenção e chave separada. A cópia independente de código não é cópia de identidades nem prova de independência da custódia. Restaurar em destino novo, sem rede financeira, sem reenvio de outbox e com sessões revogadas conforme mecanismos existentes.

Manter travas de revisão, imutabilidade financeira, idempotência e gates de produção. Falha deve ser visível com operação/erro; não contornar política de rede ou aprovação. Auditoria jurídica/LGPD e pentest independente não foram concluídos por esta documentação. Propostas de termos/privacidade não equivalem a aceite oficial.

## Fontes integrais preservadas

- [CONTINUIDADE_CREDENCIAIS_ISOLAMENTO_07 NOV2026.md](../CONTINUIDADE_CREDENCIAIS_ISOLAMENTO_07NOV2026.md)
- [RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07 NOV2026.md](../RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md)
- [TERMOS_CADASTRO_LOOP_2026_11_PARA_APROVACAO.md](../TERMOS_CADASTRO_LOOP_2026_11_PARA_APROVACAO.md)
- [POLITICA_PRIVACIDADE_LOOP_2026_11_PARA_APROVACAO.md](../POLITICA_PRIVACIDADE_LOOP_2026_11_PARA_APROVACAO.md)
- [Código: src/producao/sessao-admin-comercial-sqlite.js](../../src/producao/sessao-admin-comercial-sqlite.js)
- [Código: src/producao/recuperacao-independente-offsite.js](../../src/producao/recuperacao-independente-offsite.js)
- [Código: src/producao/prova-chaves-recuperacao.js](../../src/producao/prova-chaves-recuperacao.js)

[Voltar ao índice geral](README.md).
