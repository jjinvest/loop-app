> **ATUALIZAÇÃO DO LOOP V6 (16/10/2026):** este arquivo preserva decisões anteriores para consulta histórica. A regra vigente no laboratório é **centro + 6 vagas, entrada pela vaga 6, 6 vendas por ciclo (cliente, investimento, cliente, reserva, cliente, investimento), até 6 posições abertas por CPF/conta fictícia, pacote especial de 6, saque mínimo de R$ 25 e taxa de 3% sobre cada saque de bônus ou participação**. Consulte `docs/LOOP_V6_SEIS_VAGAS_SAQUE_25_TAXA_3.md`. Não há saques nem pagamentos reais.

# LOOP V5 — Regra final dos bônus de indicação e da cadeira (laboratório)


> **Atualizacao de 16/10/2026:** esta documentacao descreve a **regra padrao de uma posicao por pedido**. A excecao de **produto especial autorizado para cinco posicoes no mesmo pedido** foi implementada em laboratorio e esta detalhada em `docs/PRODUTO_ESPECIAL_CINCO_POSICOES_LOOP.md`. O limite de cinco posicoes abertas simultaneamente por CPF (simulado por conta em laboratorio) continua valendo, e uma posicao que conclui o ciclo libera uma vaga. A configuracao especial exige disponibilidade integral de cinco vagas e subtotal especial minimo equivalente a cinco referencias LOOP; nao habilita pagamento real.

## Duas ativações e uma compra qualificada

**1. Link de indicação:** toda conta recebe um único link de rastreamento. O código fica DENTRO do link e o final do endereço pode ser personalizado sem mudar o rastreamento. O link começa inativo e é liberado quando o titular conclui **qualquer compra** na loja, mesmo inferior ao mínimo de posição.

**2. Ativação de CPF e termos:** após qualquer compra confirmada, o usuário pode aceitar a versão dos termos do laboratório, com CPF fictício de teste. Só depois disso a indicação qualificada gera bônus de 10% ou de campanha. Não existem créditos retroativos por eventos anteriores ao aceite. O comprador que só compra produtos não precisa aderir para continuar comprando.\n\n**3. Participação no LOOP:** uma compra qualificada pelo **valor mínimo único vigente na data da confirmação** cria uma posição própria na fila B. Essa posição habilita o titular a participar de campanhas de comissão acima de 10%. CPF e termos nao determinam se a compra cria uma posicao, mas sao indispensaveis para provisionar bonificacoes e verificar a elegibilidade do saque simulado. Se a adesao ja foi aceita antes da compra qualificada, a posicao nasce ativa. Aceite tardio nao recupera posicao dourada. Uma posição azul transferida ao LOOP como dourada não conta mais como posição própria para campanhas.

O cadastro pode ser espontâneo ou por link. O participante sem posição pode ganhar **10% da base da posição que seu convidado adquirir**, desde que seu próprio link tenha sido liberado e o CPF/termos tenham sido confirmados antes da indicação qualificada. Ele **não** ganha comissão sobre um cadastro ou sobre uma venda do convidado que não crie posição.

## Regra da campanha por indicador

Para cada nova posição criada pelo convidado, o motor verifica:

- O indicador fez alguma compra confirmada de qualquer valor antes desse evento, liberando seu link?\n- O indicador confirmou CPF de teste e aceitou a versao dos termos ANTES do evento? Caso contrario, nao criar credito nem provisao (inclusive 10%).
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

## Sequência implementada\n\n- Cadastro gera link inativo.\n- Primeira compra de qualquer valor libera link.\n- CPF ficticio e termos habilitam bonificacoes apenas futuras e bloqueiam simulacao de saque enquanto pendentes.\n- Compra qualificada no minimo vigente cria uma posicao e permite campanhas superiores a 10%.\n- O limite de uma posicao por pedido e configuracao de quantidade minima por produto permanecem independentes.\n- O laboratorio nao valida ou armazena CPF real e nao processa saques reais.\n\n## Limitações

Essa política está implementada no simulador SQLite local, não em gateway financeiro, sistema de saques reais ou plataforma publicada. A regra é aplicada a partir das novas bonificações, sem reescrever registros anteriores.
