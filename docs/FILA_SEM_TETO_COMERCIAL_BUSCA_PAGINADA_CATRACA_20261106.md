# LOOP 3.0 / AKITEMM — fila sem teto comercial e busca paginada para a catraca

Data: 06/11/2026. Branch: `feature/unificar-escritorio-real-20261105`. Ambiente comprovado: Railway **homologacao**, protegido, Asaas **Sandbox**, sem transações comerciais ou repasses reais.

## Regra definitiva

**Vendas, clientes e eventos não são limitados pelo número de registros que uma consulta técnica lê.** O fluxo normal é vendas confirmadas → posições nas filas A/B → eventos que alimentam as luzes da catraca → movimentos do tabuleiro. STOP e agenda controlam somente a catraca. Limites de processamento em memória são **tamanho de lote**, não cotas de vendas ou metas do negócio.

Metas administrativas são livres (inteiros seguros, inclusive 1.000.000). Uma meta não é promessa de execução: cada centro concluído exige seis eventos válidos e reconsultados no PSP Sandbox, e cada posição continua sujeita às regras individuais de titularidade do LOOP.

## Correção executada

Antes: `_pedidosAguardando()` usava `ORDER BY criado_em,id LIMIT 5000` diretamente na lista histórica de `VINCULAR_PEDIDO`. Depois que os primeiros 5000 pedidos estivessem contabilizados, os seguintes poderiam ficar invisíveis para a catraca, mesmo com pagamentos novos recebidos.

Agora: a busca usa **cursor por `criado_em,id`**, com exclusão de pedidos já contabilizados em `EVENTO_CICLO` e consulta por blocos, seguindo a ordem temporal. A leitura atravessa todos os registros históricos sem um limite fixo no ordinal da venda. Os filtros de duplicidade também consultam o snapshot do motor, preservando eventos legados. A trilha `EVENTO_CICLO` passa a gravar `prepedido_id` na contabilização explícita. O índice `idx_motor_evento_pedido` melhora a exclusão de eventos já usados.

**Prova direcionada:** SQLite com **5.101 eventos antigos previamente consumidos** e **8 compras válidas novas**. A consulta encontrou as oito compras posteriores na ordem correta, a catraca só concluiu o ciclo que possuía seis pagamentos elegíveis, preservou as outras duas luzes e o banco passou na checagem de integridade.

**Prova em Railway:** deployment `6a9b2aa6-045b-4308-9279-a256da14b657` — **SUCCESS**, healthcheck aprovado, testes direcionados sem falhas, verificação GET Asaas Sandbox e GET da agenda publicados. Código fixado em `bf457987fe9cbaab598dcc4feaace19f8548e485`.

## Escalabilidade honesta

O número 5000 continua existindo como tamanho interno de lote em algumas rotinas, sem limitar a quantidade total de pedidos. Um lote de giro também tem limite técnico para evitar travamento de transação; a agenda pode retomar o próximo lote automaticamente quando autorizada. Isso não configura uma capacidade comprovada de processar um milhão de vendas em produção. A prova de carga transacional, p95 de latência, múltiplos workers, estratégias de indexação/particionamento e operação de pagamentos reais permanece pendente.

**Separação de ambientes:** a aplicação de homologação usa motor SQLite protegido e pagamentos Sandbox. A migração para ambiente operacional real não se resume a renomear o serviço: exige separar bases/segredos e publicar os módulos aprovados em um ambiente distinto com checkout financeiro bloqueado até cumprir seus gates.

PR #1 permanece DRAFT. Nenhum merge, deploy de produção, Pix real, bonificação ou saque foi realizado nesta correção.
