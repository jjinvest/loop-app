# LOOP V5 — Regra final dos bônus de indicação e da cadeira (laboratório)

## Duas ativações independentes

**1. Link de indicação:** toda conta recebe um único link de rastreamento. O código fica DENTRO do link e o final do endereço pode ser personalizado sem mudar o rastreamento. O link começa inativo e é liberado quando o titular conclui **qualquer compra** na loja, mesmo inferior ao mínimo de posição.

**2. Participação no LOOP:** uma compra qualificada pelo **valor mínimo único vigente na data da confirmação** cria uma posição própria na fila B. Essa posição habilita o titular a participar de campanhas de comissão acima de 10%. O aceite de CPF posterior só muda a cor azul para vermelha: não é necessário para determinar a aquisição da posição. Uma posição azul transferida ao LOOP como dourada não conta mais como posição própria para campanhas.

O cadastro pode ser espontâneo ou por link. O participante sem posição pode ganhar **10% da base da posição que seu convidado adquirir**, desde que seu próprio link tenha sido liberado. Ele **não** ganha comissão sobre um cadastro ou sobre uma venda do convidado que não crie posição.

## Regra da campanha por indicador

Para cada nova posição criada pelo convidado, o motor verifica:

- O indicador fez alguma compra confirmada de qualquer valor antes desse evento, liberando seu link?
- Ele possuía pelo menos uma posição própria **ainda em A, em B ou no tabuleiro**, não transferida à empresa e comprada antes da confirmação da posição indicada?
- Qual era o percentual administrativo **vigente na data do evento**?
- Qual era o **valor da cadeira vigente** na data do evento? A comissão usa esse valor, e não o total do pedido.

| Campanha vigente | Indicador só com link liberado | Indicador com posição própria |
|---|---|---|
| 10% | 10% | 10% |
| 20% | 10% | 20% |
| 30% | 10% | 30% |
| 50% | 10% | 50% |

**Exemplos:**
- Cadeira de R$ 250: 10% = R$ 25, 20% = R$ 50, 50% = R$ 125.
- Cadeira de R$ 500: 10% = R$ 50, 20% = R$ 100, 50% = R$ 250.
- Se após três anos a cadeira passa a custar R$ 500, uma compra de R$ 250 não coloca o indicador na fila e não habilita os 50%. Ele precisa comprar R$ 500 em **um único pedido** qualificado para obter uma posição. Compras antigas e compras separadas abaixo do mínimo não se somam para formar posição.

## Contabilidade de bônus

Os valores são provisionados **exclusivamente no caixa reserva (LOOP_DIREITA)**. O caixa central e o de investimento não são debitados para pagar a bonificação.

O escritório exibe o crédito **fictício acumulado**, o percentual efetivo para as próximas indicações, a porcentagem publicada da campanha e o mínimo de saque de **R$ 100**. Atingir o mínimo não executa uma transferência nem demonstra que há saldo bancário real disponível. Não existe saque real neste laboratório.

O percentual de campanha, configurável pelo administrador de **10% a 100%**, é versionado. Cada bônus grava, de forma imutável, a taxa efetiva, a taxa da campanha, a prova de posição do indicador quando existir, a revisão do valor da cadeira, o valor do bônus e a provisão do caixa reserva. Uma campanha nova não recalcula pagamentos já registrados.

## Testes de regressão

- `test/indicacoes-link-comissoes-reserva.test.js`: compra pequena que libera o link, comissão básica, campanha 20%/30%, compra do indicador que cria posição e saldo mínimo de R$ 100.
- `test/indicacoes-campanha-so-com-cadeira.test.js`: três anos depois, valor mínimo R$ 500, campanha 50%, compra insuficiente de R$ 250, mudança para bônus de 50% só após aquisição de posição própria, compras retroativas e posição azul que se tornou dourada.
- `test/loja-cliente-sessao-carrinho.test.js`: pagamentos de demonstração controlados pelo administrador e apenas uma posição por pedido qualificado.

## Limitações

Essa política está implementada no simulador SQLite local, não em gateway financeiro, sistema de saques reais ou plataforma publicada. A regra é aplicada a partir das novas bonificações, sem reescrever registros anteriores.
