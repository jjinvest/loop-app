# LOOP 3.0 / AKITEMM — reenvio HTTP controlado de webhooks sem duplicar posição — 06/11/2026

**Status:** ensaio externo concluído com sucesso em homologação; G3 ainda **PARCIAL**.

## Fonte e método

- Railway `loop-asaas-homologacao` / `homologacao` / `akitemm-escritorio-preview`; aplicação unificada com o mesmo volume SQLite da loja, webhook, ponte PSP e motor.
- O Asaas Sandbox já havia confirmado um Pix de R$ 250 que criou uma única posição de laboratório (seção 238).
- Para evitar selecionar um pagamento de outro cliente, a aplicação recebeu uma rota **temporária, exclusiva de homologação e protegida pelo operador**, `GET /staging/escritorio-unificado/webhook-replay-fixture`, habilitada somente durante ensaio explícito. Ela localiza no SQLite a **única** cobrança Asaas Sandbox associada a uma posição e a um `PAYMENT_RECEIVED` previamente reconsultado. Nenhum CPF, nome ou segredo do cliente é exposto; sem habilitação, responde 404.
- O executor `scripts/provar-replay-webhook-asaas-preview.js` realizou **GET autenticado ao Asaas Sandbox para aquele pagamento específico**, conferindo que o PSP remoto declara PIX, R$ 250, `RECEIVED`, ID e referência compatíveis.
- Depois, o executor enviou pela URL HTTPS real do Railway **dois eventos sintéticos de ensaio** relativos à MESMA cobrança verificada: o primeiro ID uma vez + três reenvios idênticos (concorrentes); o segundo ID uma vez + um reenvio idêntico. Em todos os POSTs enviou o **authToken do webhook**, separado da API key. **O provedor Asaas não foi instruído a reenviar estes eventos**; o ensaio testa a infraestrutura HTTPS/webhook real usando IDs controlados.
- Executou o **mesmo fechamento de conciliação do operador** (reconsulta autenticada do PSP), leu novamente o motor e o monitor, verificou que o fingerprint do estado não mudou e que não havia tarefas pendentes/erros, cobrança criada ou posição adicional.

## Resultado observado

Deploy Railway de ensaio `91400b30-fce6-41a5-b679-ada3b47ef046` (**SUCCESS**, healthcheck aprovado), com regressões da rotina de replay passando. Evidência operacional `LOOP_REPLAY_WEBHOOK_HTTPS`:

| Controle | Resultado |
| --- | --- |
| Webhooks de ensaio pela URL HTTPS pública | **6 POSTs / 6 HTTP 200 confirmados em logs Railway** entre 20:21:32.769 e 20:21:32.869 UTC |
| IDs distintos de evento | 2, ambos referentes ao mesmo Pix de laboratório |
| Reenvios de IDs já recebidos | **4/4 identificados como duplicados** |
| Posições antes/depois | **1 → 1** |
| Estado completo da fila, tabuleiro e catraca | **Fingerprint idêntico** |
| Fechamento de reconsulta ao PSP e caixa de avisos | **Concluído, 0 erros, 0 pendências** |
| Novas cobranças Asaas | **0** |
| Créditos e saques reais | **0** |
| Status de lançamento comercial | **Não autorizado** |

A prova mostra idempotência do ingresso HTTPS para `event.id` repetido e ausência de segunda posição com um **outro ID** referente ao mesmo pagamento, após conciliação efetiva. Os eventos foram construídos pelo testador, não retransmitidos automaticamente pelo PSP; isso é uma distinção fundamental.

### Falha inicial e melhoria

A primeira tentativa não selecionou corretamente a cobrança porque a listagem geral de pagamentos do Asaas não identifica com segurança qual deles já pertence ao motor. O executor foi alterado para buscar exclusivamente o vínculo comprovado pelo SQLite e conferir por GET específico no PSP. A primeira execução com essa rota falhou fechado antes da atualização ter entrado no ar; corrigido com deploy em duas fases. As tentativas incompletas não realizaram reenvios e não afetaram o banco ativo. A prova final só foi marcada concluída após observar 6 POSTs HTTP 200 e o fingerprint estável.

## Segurança após prova

- Variável temporária `LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR=NAO`, desligando a rota de teste e os POSTs de replay.
- Comando de replay removido do pre-deploy normal; permanecem as regressões e a auditoria Asaas somente GET.
- Segredos, CPF, identificadores PSP e eventos não foram gravados neste documento.
- Branch candidata mantida isolada `feature/unificar-escritorio-real-20261105`, PR #1 **DRAFT** sem merge/deploy comercial.

## Pendências do G3 / Marco Zero

Ainda é necessário um exercício adversarial de **falha durante a transação** e retentativa originada pelo próprio Asaas, com medição de recuperação e análise de duplicação sob concorrência de criação de pedidos. O PSP considera webhooks `at least once` e exige idempotência por `event.id`: [documentação oficial](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook). Este teste não equivale a prontidão de lançamento remunerado e não autoriza anúncios com expectativa de retorno financeiro.
