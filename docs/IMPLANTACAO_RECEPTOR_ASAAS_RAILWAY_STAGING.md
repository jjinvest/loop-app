# Receptor HTTPS dedicado — Asaas Sandbox no Railway (não implantado)

**Situação:** código criado e testável na branch DRAFT do LOOP 3.0 / AKITEMM. Este documento é uma preparação de implantação **exclusivamente de homologação**, não uma autorização para implantar a loja. Não há domínio provisionado, instância ativa, webhook cadastrado ou cobrança criada por esta alteração.

## Segurança e arquitetura

A entrada `src/laboratorio/receptor-webhook-asaas-railway-staging.js` executa `npm run start:asaas-railway-staging` e publica **somente** `POST /webhooks/asaas-sandbox` e `GET /healthz`. É um serviço diferente de `src/server.js`, que permanece sem checkout comercial. O ingresso do Railway deve servir HTTPS público e encaminhar para o serviço em `0.0.0.0:$PORT`. O único controle de autenticidade dos avisos é o header **`asaas-access-token`**, validado em tempo constante contra o token secreto dedicado, mais checagem de host/encaminhamento. **Não confiar em `X-Forwarded-Proto` como prova criptográfica de TLS.** Não reutilizar a API Key como token de webhook.

Cada evento é vinculado a uma cobrança Sandbox que já exista em SQLite e persistido antes de responder HTTP 200. Redelivery com mesmo ID não cria duplicação; erro de autenticação ou vínculo não grava crédito. A rota não cria Pix, não consulta API PSP, não liga filas ou tabuleiro, não executa saques nem bônus. O ambiente deve ter **volume persistente**: uma imagem sem volume reiniciará sem o histórico, logo não é válida para homologação.

## Configuração de uma instância de homologação, somente após conexão e autorização

- Criar projeto/serviço Railway **exclusivo para Sandbox**, com região desejada, **uma única réplica**, domínio HTTPS de homologação e **desabilitar autodeploy da branch** até avaliação.
- Escolher a branch `fix/teste-escrita-catraca-20261014`, comando inicial **`npm run start:asaas-railway-staging`**, healthcheck `/healthz` e Node.js 22. Não usar `npm start`, pois isso inicia a aplicação pública antiga.
- Adicionar volume persistente (exemplo de montagem: `/loop-staging`). O Railway fornece `PORT` e `RAILWAY_VOLUME_MOUNT_PATH` no serviço. `NODE_ENV=staging` porque o receptor recusa `production`.
- Variáveis do serviço (criar como segredos quando indicado): `LOOP_RAILWAY_STAGING_AUTORIZADO=SIM`, `LOOP_RAILWAY_STAGING_SQLITE=/loop-staging/webhook.sqlite`, `LOOP_RAILWAY_WEBHOOK_URL=https://DOMINIO_REAL_DO_SERVICO/webhooks/asaas-sandbox`, `LOOP_RAILWAY_WEBHOOK_TOKEN` (segredo dedicado, 32–255 caracteres, **diferente da API Key**), `LOOP_RAILWAY_PREPARAR_UMA_VEZ=SIM` e `ASAAS_SANDBOX_CLIENTE_TESTE_ID=cus_...` **de cliente fictício que já exista no Asaas Sandbox**. Nenhum valor real de token deve aparecer em commit, chat, screenshot ou logs. Retirar a autorização de bootstrap depois da criação inicial.
- No primeiro início, se o arquivo SQLite não existir, o bootstrap opt-in cria **um único** pré-pedido fictício de R$ 250 sem API, Pix ou benefício, e grava seus IDs não secretos no log operacional. Em reinicializações, reutiliza o mesmo arquivo e não recria pedido. Para preservar os dados não mover o volume ou reimplantar com réplicas.
- Fazer prova externa de acessibilidade HTTPS sem simular pagamento; depois cadastrar o webhook Asaas com **esta URL real**, `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_RECEIVED` e os eventos reversos necessários, mesmo token de webhook, e e-mail operacional de alertas fornecido pelo proprietário. Somente então autorizar a cobrança **fictícia** de R$ 250; a cobrança é iniciada pela rotina controlada do projeto, e deve ser vinculada ao pré-pedido gerado no volume, jamais criando um segundo pedido sem revisão.
- Verificar nos **logs do próprio Asaas** a entrega HTTP 200, o ID e horário; cruzar com a inbox SQLite, recuperar qualquer evento antecipado e fazer **GET independente** do pagamento no Asaas Sandbox. Sem essa triangulação, `ASAAS_REMOTO` **não** está homologado. Aplicar a regra de exatamente uma posição **fictícia** de laboratório, não criar posições comerciais.

## Evidências e restrições

O teste `test/receptor-webhook-asaas-railway-staging.test.js` valida persistência/replay, token errado, host divergente, evento sem pagamento correspondente, rotas fechadas, integridade SQLite e bootstrap de volume sem duplicação. CI exato deve concluir antes de considerar o serviço pronto **para homologação**.

**Não houve implantação neste documento.** O Railway precisa estar conectado à sessão e o usuário deve autorizar serviço de homologação/custo eventualmente associado. A API Key de pagamento continua protegida como `ASAAS_SANDBOX_API_KEY` no GitHub Actions; não é necessária no receptor. Se o serviço for implantado, conferir termos do provedor, observabilidade, custódia de segredos, backups do volume e decisão de desligamento após o ensaio. A PR #1 permanece DRAFT, sem merge, deploy comercial ou pagamentos reais.
