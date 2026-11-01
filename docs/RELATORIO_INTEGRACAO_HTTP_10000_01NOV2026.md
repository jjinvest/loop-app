# LOOP 3.0 / AKITEMM — integração HTTP e SQLite — 01/11/2026

**Estado: ensaio de 10.000 clientes EM EXECUÇÃO. Não interpretar este registro como resultado final da carga.** As correções abaixo já passaram pelos testes indicados; o fechamento operacional e financeiro será acrescentado após a conferência do banco completo.

## Correções executadas

- O comprovante Asaas usa o subtotal elegível **congelado nos itens do pedido**, sem transformar o total comercial de produto excluído, carrinho misto ou quantidade insuficiente em posição.
- Vendas apenas AKITEMM são conciliadas sem posição e saem da lista de tentativas pendentes. A escolha opcional de não participar, quando explicitamente habilitada no laboratório, também funciona em pacotes; o convite continua oculto por padrão.
- O Sandbox respeita os pacotes promocionais congelados de 5 e 10 posições, inclusive depois de encerrar o evento. Reprocessamento não duplica posições. Aceitar CPF/termos na primeira não ativa as demais. A 11ª posição ativa é recusada.
- Pagamentos do Sandbox possuem estado próprio na consulta de pedido. Reversões posteriores aparecem no histórico do Escritório como conferência pendente, preservando posições e livros. Recebimentos já integrados são reconsultados em lotes de até 20, com intervalo mínimo de 60 segundos por pedido; reversões terminais não ficam em repetição infinita.
- Reconsultas `RECEIVED_IN_CASH` preservam o primeiro horário confirmado, mantendo a identidade do comprovante no replay.
- A grade aprovada foi preservada. Quando o titular possui mais de seis posições, as posições 7–10 também são renderizadas e selecionáveis.
- Nova leitura administrativa autenticada `GET /api/admin/escritorio-demo/clientes/:id/operacao`, com paginação, reúne pedidos, estado Sandbox, posições, evento que financiou um giro, ciclos concluídos pelo titular e solicitações de saque. **Venda que financia ciclo e posição que conclui ciclo são vínculos distintos.** Consulta funciona em conexão SQLite somente leitura; fontes ausentes são declaradas.
- Restauração de snapshot evita cópias profundas redundantes depois da cópia de entrada. O isolamento entre entrada e duas instâncias restauradas continua testado. A conciliação de aportes reutiliza a consulta preparada, mantendo a conferência de todos os registros históricos.
- Lockfile atualizado para `body-parser 2.4.0` e `qs 6.17.1`. Auditoria de dependências de execução tornou-se uma etapa obrigatória do CI. Avisos corrigidos: [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) e [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

## Evidências já obtidas

- `npm test`: bateria geral aprovada, sem falhas, incluindo titularidade, duplicação, interrupção de processos, concorrência, backup/restauração, SQLite, filas, tabuleiro, cofres e saques.
- [Execução com dependências corrigidas](https://github.com/jjinvest/loop-app/actions/runs/41273124525): testes gerais e navegador aprovados; `npm audit --omit=dev` informou zero vulnerabilidades conhecidas naquele momento.
- Navegador real: pedido por HTTP, resposta Asaas **simulada**, posição pendente no Escritório em computador/celular e dez posições do mesmo titular acessíveis. Capturas são provas de laboratório, sem substituir artes aprovadas.
- Ensaio separado de saques em SQLite: bônus R$25 bruto = R$25 líquido, taxa 0%, mínimo R$25 nos dois fluxos, troca de titular recusada, replay idempotente, reabertura preservada e consulta administrativa no mesmo banco. Transferências reais: zero.

## Ensaio maior — ainda não concluído neste registro

O ensaio usa servidor HTTP local real, arquivo SQLite e transporte Asaas **explicitamente simulado**, sem chave privada ou API remota. Um cliente por vez; não representa 10.000 clientes simultâneos.

Cada cliente compra um PDF fictício qualificado de R$250 pelo HTTP e confirma sua posição individualmente pelo HTTP. Uma indicação a cada dez clientes é vinculada à posição escolhida do indicador. Seis pedidos distintos financiam cada giro documentado. Aportes são registros fictícios separados no livro existente, **não uma segunda receita e não liquidação bancária**.

O processo foi interrompido e retomado no mesmo SQLite durante ajustes de desempenho; o ensaio também fecha/reabre o banco na metade. Compras, posições, ativações, indicações, aportes e giros não são reiniciados. Consultas completas do Escritório são amostrais; todos os pedidos/posições são conferidos no banco. As latências finais serão identificadas como pertencentes ao segmento após a última retomada.

Último ponto conferido ao escrever este registro: **7.000 clientes, 1.160 giros**, ensaio ainda em andamento. Estes números não são o resultado de 10.000.

## Reprodução

```sh
node scripts/simular-10000-clientes-http-asaas-sqlite.js 10000 artifacts/novo-ensaio
# Somente para continuar o mesmo banco interrompido:
node scripts/simular-10000-clientes-http-asaas-sqlite.js 10000 artifacts/novo-ensaio --retomar
# Após o relatório completo:
node scripts/validar-saques-ensaio-http.js artifacts/novo-ensaio
node scripts/verificar-ensaio-http-sqlite.js artifacts/novo-ensaio
```

## Fronteiras que permanecem

Homologação externa final com a conta Asaas e callback remoto autenticado, extrato/liquidação bancária independente, infraestrutura de produção, validações jurídicas/operacionais e autorização de publicação permanecem separadas do laboratório. As telas administrativas demonstrativas antigas não foram redesenhadas nem convertidas silenciosamente em produção; a nova consulta integrada identifica suas fontes.

PR #1 continua **DRAFT**, sem merge, deploy, pagamentos reais ou mudanças em produção. Nenhum resultado aqui demonstra lucro líquido, liquidez bancária ou capacidade com milhares de clientes simultâneos.
