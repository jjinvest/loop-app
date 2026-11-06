# LOOP 3.0 / AKITEMM — prova E2E Pix no Asaas Sandbox — 06/11/2026

## Escopo e resultado externo (concluído)

**AMBIENTE EXCLUSIVO:** Railway `loop-asaas-homologacao`, ambiente `homologacao`, serviço `akitemm-escritorio-preview`, branch de desenvolvimento `feature/unificar-escritorio-real-20261105`. Não existe nenhuma cobrança comercial ou pagamento real nesta prova.

**Prova de webhook:** a auditoria de leitura `scripts/auditar-webhook-asaas-sandbox-preview.js` inicialmente confirmou `LOOP_ASAAS_WEBHOOK_CONFIG=AUSENTE_EXIGE_CADASTRO`. O provisionamento explícito e idempotente `scripts/provisionar-webhook-asaas-sandbox-preview.js` cadastrou **um** Webhook na API real do Asaas Sandbox, com eventos de recebimento e reversão, URL `https://akitemm-escritorio-preview-homologacao.up.railway.app/webhooks/asaas-sandbox-unificado`, envio sequencial e **authToken separado** da chave de API. Evidência Railway: deployment `c0799ab0-8921-445d-8fcc-459ac4c0444b` (18:50 UTC), `LOOP_ASAAS_WEBHOOK_PROVISIONADO=CADASTRADO_NO_SANDBOX`, seguido de `LOOP_ASAAS_WEBHOOK_CONFIG=CONFIGURADA_SEM_ENTREGA_COMPROVADA`. Esta última frase foi corretamente conservadora ANTES do evento real.

**Prova ponta a ponta:** execução de uso único `scripts/homologar-pix-ponta-a-ponta-asaas-preview.js`, deployment `36fa95ff-8890-47a0-a230-b660a9dba992` (18:57–18:58 UTC), com 12 testes de segurança de predeploy aprovados e os seguintes passos externos verificados:
1. Cadastro de **conta fictícia exclusiva de laboratório** no mesmo Escritório SQLite; autenticação e cookie de titular com CSRF.
2. Uma compra de **R$ 250 de teste**, da SKU `curso-homologacao-250`, fotografia de qualificação **VERDE** e pré-pedido vinculado ao titular.
3. Cliente de teste criado exclusivamente no Asaas Sandbox, sem e-mail de terceiro nem notificação; preparação da cobrança com **uma** posição reservada no mesmo SQLite.
4. Cobrança Pix gerada pela API real do **Asaas Sandbox**, localizada uma única vez por `externalReference`, conferida quanto a cliente, modalidade e R$ 250. A confirmação usou **somente** o endpoint de SIMULAÇÃO `POST /v3/sandbox/payment/{id}/confirm`.
5. **POST do Webhook externo** recebido em `/webhooks/asaas-sandbox-unificado` com HTTP **200** às 18:58:07 UTC (log HTTP do Railway). O sistema aplicou a reconsulta e a conciliação até a conta fictícia apresentar exatamente **uma posição de ensaio pendente**.
6. Segunda leitura do estado do mesmo titular continuou exibindo **uma única** posição, sem duplicação por leitura.
7. Registro de sucesso: `LOOP_E2E_SANDBOX=PIX_CONFIRMADO_WEBHOOK_E_POSICAO_UNICA`; deploy Railway **SUCCESS**, healthcheck **SUCCESS**.

**Proteções após ensaio:** `LOOP_PREVIEW_ASAAS_WEBHOOK_PROVISIONAR=NAO` e `LOOP_PREVIEW_ASAAS_E2E_EXECUTAR=NAO`. O provisionamento do webhook e a confirmação de Pix **foram removidos do comando predeploy**; permanecem somente os testes, a prova remota GET e a auditoria de configuração. Origem Railway fixada na branch/commit ensaiados, sem cair em `main`. Nunca registrar chave, CPF de teste, senha de conta, identificadores reais PSP ou token de autenticação.

## Evidências de código

- `scripts/verificar-acesso-asaas-sandbox-preview.js` (consulta remota GET autenticada)
- `scripts/auditar-webhook-asaas-sandbox-preview.js` e testes
- `scripts/provisionar-webhook-asaas-sandbox-preview.js` e testes
- `scripts/homologar-pix-ponta-a-ponta-asaas-preview.js` e testes
- Prova anterior: `docs/PROVA_REMOTA_ASAAS_SANDBOX_RAILWAY_20261106.md`

## Limites honestos desta prova / P0 ainda abertos

- **Comprovado:** ambiente remoto Asaas Sandbox, cobrança e confirmação simuladas, webhook HTTP externo, recebimento na inbox, conciliação e **uma única** posição de ensaio atribuída ao titular correto. Nenhum valor real, comissão real ou saque real.
- **Não comprovado por esta execução:** entrega duplicada do MESMO webhook externo, teste de concorrência massiva em infraestrutura real, falha e retomada após reinício no exato intervalo crítico, RPO/RTO medido e recuperação independente de backup.
- **Lançamento público NÃO autorizado:** não há parecer jurídico/consumerista independente nem demonstração de sustentabilidade econômica, reservas financeiras, cobertura dos passivos condicionais, oferta/fornecedor e checkout produtivo. A promessa de R$ 750 baseada em compras subsequentes é especialmente sensível e exige avaliação de legalidade e solvência antes da publicidade. Consentimentos não eliminam direitos legais de consumidores.
- PR #1 permanece **DRAFT**, sem merge/produção. A meta comercial de 01/12/2026 não significa liberação antecipada destes gates.

**Nunca confundir teste de laboratório do PSP com validação do modelo econômico ou autorização para captar clientes.**
