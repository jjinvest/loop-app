# LOOP 3.0 / AKITEMM — relatório operacional e financeiro — 01/11/2026

**Estado: BLOCO APROVADO NO LABORATÓRIO. Ensaio de 10.000 concluído e conferido por outro processo, com SQLite somente leitura.** PR #1 permanece DRAFT; não houve merge, deploy, alteração de produção ou movimentação financeira real.

## Resultado operacional da carga

| Indicador | Resultado |
|---|---:|
| Clientes fictícios sequenciais | 10.000 |
| Pedidos / cobranças da fixture | 10.000 |
| Posições distintas | 10.000 |
| Ativações individuais | 10.000 |
| Indicações vinculadas individualmente | 1.000 |
| Giros concluídos e persistidos | 1.666 |
| Eventos de pedidos documentados | 9.996 |
| Pedidos aguardando próximo giro | 4 |
| Posições ativas — filas e tabuleiro | 8.334 |
| Fila A | 0 |
| Fila B | 8.327 |
| Lugares ocupados no tabuleiro | 7 |
| Alertas de rastreio / violações de chaves estrangeiras | 0 |

Cada cliente comprou um PDF fictício qualificado de R$250 pelo HTTP local e ativou sua posição individualmente pelo HTTP. Não houve fundador sem compra neste cenário. O PSP da carga é uma **fixture Asaas simulada**, independente dos registros da ponte; ela não consulta a API remota. A amostra externa descrita abaixo usa outra base e não se soma aos 10.000.

Conservação: **8.334 posições ativas + 1.666 concluídas = 10.000**. Cada giro possui seis pedidos distintos: 9.996 consumidos e 4 aguardando. Os checkpoints são anteriores ao fechamento dos últimos blocos completos; prevalecem os totais finais conferidos no banco.

O processo foi interrompido e retomado no mesmo arquivo durante correções de desempenho, sem reiniciar os clientes. Houve também reabertura na metade e depois da carga. Replays concorrentes de um mesmo pedido preservaram uma posição. Durante a escrita, uma transação somente leitura manteve a visão de 8.461 posições enquanto o escritor confirmou mais 6; os livros e snapshot daquela visão permaneceram consistentes.

## Resultado financeiro — apenas fictício

| Registro / destinação | Valor |
|---|---:|
| Vendas brutas fictícias — cenário da carga | R$ 2.500.000,00 |
| Referência total dos aportes fictícios no livro | R$ 2.500.000,00 |
| Valores previstos nos Escritórios por ciclos concluídos | R$ 1.249.500,00 |
| Centro: referência restante no livro | R$ 500,00 |
| Cofre de investimento / esquerda | R$ 833.333,33 |
| Cofre de reserva / direita — bruto | R$ 416.666,67 |
| Bônus de indicação já compromissados na reserva | R$ 25.000,00 |
| Reserva livre fictícia após compromissos | R$ 391.666,67 |
| Cofre de douradas neste cenário | R$ 0,00 |
| Saldo bancário real comprovado / saque real disponível | R$ 0,00 |

**Não somar vendas brutas e aportes:** o aporte é o registro fictício separado exigido pelo livro existente, vinculado ao mesmo pedido; não é uma segunda receita nem comprovação de dinheiro do PSP. A soma conservada dos destinos é R$ 2.500.000,00. A reserva livre já desconta os bônus compromissados, sem nova dedução pela simples solicitação de saque.

Os valores previstos nos Escritórios não foram liquidados. Custos de produtos, frete, tributos, tarifas bancárias e lucro líquido não foram apurados. O cenário ativou todas as posições antes dos giros e não criou douradas adicionais.

## Amostra externa com o Asaas Sandbox

[Homologação HTTP contra a API remota: aprovada](https://github.com/jjinvest/loop-app/actions/runs/41273684000). Uma compra de R$250 pelo servidor HTTP local criou uma cobrança **na conta Sandbox**, confirmou o pagamento pelo endpoint próprio de simulação e, após reconsulta, apresentou **uma posição PENDENTE** ao cliente autenticado. Reprocessamento e reinício do SQLite mantiveram cobrança, titular e posição únicos. Não ocorreu ativação automática nem saque.

O workflow usa código fixado em revisão imutável e entrega a credencial Sandbox apenas à etapa de homologação, depois de instalar dependências. Logs guardam somente resultados agregados. Esta prova não testa callback remoto nem liquidação bancária real.

## Correções e integração verificadas

- **Elegibilidade:** o comprovante usa o subtotal congelado dos itens. Produto excluído, carrinho misto e quantidade insuficiente não ganham posição pelo valor total comercial. Venda somente AKITEMM é conciliada sem posição e deixa de ficar em tentativa permanente.
- **Pacotes:** eventos congelados de 5 e 10 posições são respeitados mesmo depois de encerrar a promoção. A confirmação de CPF/termos na primeira posição não ativa as demais. A 11ª posição ativa é recusada. A opção de compra somente loja funciona também em pacote quando explicitamente habilitada para teste; o convite continua oculto por padrão.
- **Pagamentos:** consultas distinguem Sandbox de confirmação administrativa fictícia. Reversões posteriores aparecem para conferência no Escritório, preservando posições. Reconsultas de recebimentos integrados usam lotes de até 20 e intervalo mínimo de 60 segundos; reversões terminais deixam de ser repetidas infinitamente. O primeiro horário de recebimento é estável também para `RECEIVED_IN_CASH`.
- **Escritório do cliente:** posição visível após compra/recebimento; as posições 7–10 deixam de ser omitidas. O estilo e a grade aprovados foram preservados, com os cartões adicionais quando existem.
- **Escritório administrativo:** `GET /api/admin/escritorio-demo/clientes/:id/operacao`, autenticado e paginado, consulta pedido, pagamento, posições, evento que financiou ciclo, ciclos concluídos pelo titular e saques na mesma fonte SQLite. Os dois vínculos de ciclo são distintos. Consulta testada com conexão realmente somente leitura; fontes ausentes são declaradas. Telas demonstrativas antigas não foram redesenhadas.
- **Persistência/desempenho:** restauração evita recópias de dados já isolados e validados; duas instâncias continuam independentes da entrada. A conciliação reutiliza consulta preparada sem remover verificações históricas. Em medição local de 25 restaurações do mesmo snapshot de 2.968 posições: 873,52 ms antes e 533,55 ms depois. Não é SLA.
- **Dependências:** lockfile corrigido para `body-parser 2.4.0` e `qs 6.17.1`; `npm audit --omit=dev` passou com zero vulnerabilidades conhecidas naquele momento e agora bloqueia o CI em caso de falha. Referências: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828) e [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

## Saques na base dos 10.000

Depois da carga, foram solicitados pelo HTTP **R$25 de bônus**, líquidos R$25 com taxa 0%, e **R$25 de referência do centro**, ambos apenas em laboratório. Mínimo R$25, recusa de outro titular, replay idempotente e persistência após reabrir o banco foram conferidos. A consulta administrativa reencontrou as solicitações no mesmo SQLite. Nenhuma transferência real foi executada; saldo real liberado continuou zero.

## Testes e provas

[CI completo e navegador: aprovado](https://github.com/jjinvest/loop-app/actions/runs/41274139117) — 612 testes, zero falhas; prova de pedido/posição no computador e celular e dez posições do titular acessíveis. Os testes incluem cenários existentes de concorrência multiprocesso, interrupção, backup, titularidade, filas, tabuleiro, cofres e saques. Não foram substituídos por uma nova auditoria textual.

Evidências agregadas: [carga](./evidencias/integracao-http-10000-01nov2026/relatorio.json), [conferência independente](./evidencias/integracao-http-10000-01nov2026/verificacao-somente-leitura.json), [saques](./evidencias/integracao-http-10000-01nov2026/saques-verificados.json), [leitura durante escrita](./evidencias/integracao-http-10000-01nov2026/leitura-concorrente.json), [Sandbox remoto](./evidencias/integracao-http-10000-01nov2026/asaas-remoto.json) e [CI](./evidencias/integracao-http-10000-01nov2026/ci-final.json). O banco e relatório possuem hashes de conferência; estes não são assinatura externa antifraude.

## Reprodução e limites

```sh
node scripts/simular-10000-clientes-http-asaas-sqlite.js 10000 artifacts/novo-ensaio
node scripts/simular-10000-clientes-http-asaas-sqlite.js 10000 artifacts/novo-ensaio --retomar
node scripts/validar-saques-ensaio-http.js artifacts/novo-ensaio
node scripts/verificar-ensaio-http-sqlite.js artifacts/novo-ensaio
```

Tempo observado incluindo retomadas: 2950.69 s. Latências do segmento após a última retomada: p50 324.21 ms, p95 483.59 ms, p99 697.25 ms. Foram **clientes sequenciais**, não 10.000 navegadores simultâneos. Consultas completas de tela foram amostrais; todos os pedidos, posições, ativações e livros foram conferidos no banco. O controle usou relógio fictício para distribuir giros por dias, respeitando o limite configurado de 300 giros/dia.

Permanecem externas: callback remoto autenticado do Asaas, conciliação independente de liquidação/tarifas bancárias, infraestrutura e validações jurídicas/operacionais de produção e autorização de publicação. Não foi aberto endpoint público, pois isso exigiria publicação fora do escopo autorizado. O estado global da auditoria de pré-lançamento continua **EM ANDAMENTO**; aprovação deste bloco é de laboratório.
