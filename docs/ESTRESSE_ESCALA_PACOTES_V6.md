# LOOP V6 — Estresse: 12 mil posições e 100 giros

**Ambiente:** simulação determinística, sem recebimentos, saques, PIX, CPFs verdadeiros ou promessa de contemplação. Testes em test/estresse-escala-pacotes-v6.test.js, executados por npm test.

## Hipóteses do teste

- São criadas 12.000 posições iniciais para 2.000 titulares fictícios com seis posições cada. Cada grupo representa as posições de um pacote previamente validado, **não seis pagamentos independentes**.
- Centro + seis vagas são inicialmente preenchidos, deixando 11.993 posições na fila B. O acesso ao tabuleiro ocorre pela vaga 6.
- Cem titulares registram convites e suas seis posições são promovidas da B para A; 25 deles registram um segundo convite, sem duplicação da promoção.
- O teste cria 600 novas posições a partir de **600 compras fictícias independentes**, com um evento válido por compra, e conclui 100 ciclos de seis eventos.
- São verificadas 10 tentativas de evento repetido, quatro tentativas de giro com catraca pausada após a sexta venda, bloqueio de ciclo incompleto, ordenação 3A/1B, ordem física das vagas, conservação de IDs e snapshots restaurados a cada 25 giros.
- Critérios aritméticos: 12.600 posições, 2.600 titulares, 100 centros concluídos, sete lugares ocupados, 12.493 posições aguardando, 75 entradas A e 25 entradas B. São **critérios esperados**; confirmação requer CI aprovado.

## Cofres: destinação matemática, não caixa

Os 600 eventos usam a referência fictícia de R$250 por evento:

| Destino | Referência |
|---|---:|
| Participantes no centro (1º, 3º, 5º) | R$75.000 |
| Investimento (2º, 6º) | R$50.000 |
| Reserva (4º) | R$25.000 |
| Douradas (não utilizadas no cenário) | R$0 |
| **Total fictício** | **R$150.000** |

Não representa dinheiro recebido, faturamento, lucro, disponibilidade de saldo ou transferência.

## Custos e estornos: sensibilidade

Um teste agregado independente começa com 12.000 posições anteriores **sem caixa inicial presumido**, 600 vendas válidas, 20 estornos do próprio período e um período final de zero vendas. Referência LOOP: R$250 por venda. Fornecedor: R$300; tributos: R$50; tarifa: R$15; despesa operacional: R$25; custo não recuperável de cada estorno: R$35.

| Preço ilustrativo por compra | Margem hipotética após referência LOOP e custos informados |
|---|---:|
| R$600 | **-R$24.700** |
| R$800 | **R$95.300** |

A margem maior **não é lucro líquido**: ainda é necessário modelar comissões, obrigações anteriores, tributos e despesas omitidas. Com novas vendas zeradas, não há giros adicionais na projeção, e permanecem 12.500 posições pendentes (sete no tabuleiro e 12.493 na fila).

## Limitações e bloqueios para produção

1. **Seis posições de um pacote NÃO geram automaticamente seis eventos de pagamento.** É indispensável decidir e testar o vínculo pedido/evento/lastro antes de integrar compras a ciclos.
2. 12 mil **posições em memória** não são 12 mil usuários simultâneos, e não medem a vazão de uma API, banco concorrente ou custo de servidores.
3. O limite por titular do cenário é verificado na própria simulação. A confirmação atômica de pacotes no SQLite é testada separadamente na suíte já existente; este ensaio não valida duas mil confirmações concorrentes no banco.
4. Estornos tardios, comissões efetivas, obrigações de ciclos históricos, políticas de restituição, chargebacks e direitos do consumidor permanecem pendentes de conciliação e assessoria jurídica.
5. Não há conexão com banco, provedor de pagamentos ou saques. O visual futurista V6 não foi modificado; PR #1 continua em rascunho, sem merge ou publicação.

Execute npm test e use os logs do workflow Testes do LOOP no GitHub para confirmar os resultados observados.