# LOOP 3.0 — auditoria do cofre reserva em 5.000 compradores (21/10/2026)

## Correção importante ao relatório anterior

No stress original de 5.000 compradores, **R$ 104.000** foi a **entrada bruta referencial** do cofre `LOOP_DIREITA`, oriunda de 416 ciclos × 1 evento de R$ 250. Os valores de comissão **não foram abatidos** e as 20 douradas daquela primeira simulação eram **posições compradas azuis convertidas ao cruzar a vaga 6**, sem nova compra e **sem R$ 250 adicional da reserva**. Assim, apresentar R$ 104.000 como caixa líquido/livre seria incorreto.

Conforme a regra vigente (seção 54 do comando-mestre): os **10% básicos só são comprometidos** para o indicador quando a pessoa indicada **fica VERDE por confirmação individual**. Toda bonificação compromete o **cofre da direita**, não o centro nem a esquerda. Dourada **administrativa nova**, financiada com dinheiro da reserva, compromete **R$ 250** por criação. Dourada **convertida de uma azul comprada** não recebe segunda cobrança de R$ 250 na mesma reserva. Quando centro dourado completar ciclo, as parcelas 1, 3 e 5 vão para o **cofre separado LOOP_DOURADAS**; isso não equivale a criar a posição nem a pagar R$ 250 ao participante.

## Teste adicional, separado do original

Foi executado novo cenário, com **5.000 compradores distintos**, 2.500 PDFs R$ 250 e 2.500 físicos R$ 190, fundador no centro, 4 modos de entrada A/B e frequência de indicação:

- **5 azuis originalmente compradas**, que entram pela vaga 6 e se tornam douradas, sem aporte adicional.
- **20 douradas adicionais** nascendo **uma a uma da reserva** somente quando o cofre tiver pelo menos R$ 250 livres depois de provisionar as indicações e douradas anteriores. Cada uma entra na **fila B**, sem pular o tabuleiro nem gerar venda fictícia de produto.
- **Hipótese financeira conservadora para o ensaio:** as indicações validadas do simulador equivalem a indicados **verdes confirmados**, todos a 10% de R$ 250 (= R$ 25) e, portanto, reservam R$ 25 por indicação. Isso é **hipótese do cenário**, não prova de que essas ativações ocorreram no banco SQLite da loja, nem promessa de comissão em produção.

| Cenário | Indicações tratadas como verdes | Reserva bruta | 10% provisionado | 20 novas douradas | Reserva livre após compromissos |
|---|---:|---:|---:|---:|---:|
| Primeira A, muitas indicações | 1.238 | R$ 104.000 | R$ 30.950 | R$ 5.000 | **R$ 68.050** |
| Primeira A, indicações moderadas | 489 | R$ 104.000 | R$ 12.225 | R$ 5.000 | **R$ 86.775** |
| Primeira B, muitas indicações | 1.237 | R$ 104.000 | R$ 30.925 | R$ 5.000 | **R$ 68.075** |
| Primeira B, indicações moderadas | 488 | R$ 104.000 | R$ 12.200 | R$ 5.000 | **R$ 86.800** |

**Fórmula:** cofre direito livre demonstrativo = R$ 104.000 − 10% dos indicados considerados verdes − 20 × R$ 250. As 5 azuis já têm aporte de compra e **não** geram a dedução de R$ 1.250. Este valor é **saldo livre apenas deste cenário**, antes de quaisquer outros compromissos de gestão, impostos, custos, tarifas, estornos, saques ou obrigações não modeladas. Não equivale a saldo bancário real nem autorização para gastar.

O número de posições nas filas sobe 20 em relação ao ensaio anterior, porque as douradas financiadas são **posições extras**, e não substituições de posições azuis: A=265 e B=1833 (muitas indicações); A=4 e B=2094 (moderadas). Conservação: 2.500 posições PDF + fundador + 20 adicionais = **2.521** posições. As 416 conclusões e 7 ocupantes de tabuleiro deixam 2.098 posições aguardando A+B. A quantia bruta R$ 104.000 permanece idêntica, porque as douradas financiadas não são compras adicionais e não fabricam novos eventos.

## Evidência, limites e controle de produção

Código do cenário: `scripts/simular-5000-compradores-reserva-loop-v6.js` com `metaOuroReserva:20`, `quantidadeAzuis:5`. Regressão: `test/loop-v6-reserva-20-douradas-5-azuis.test.js`, workflow **Testes do LOOP 39662964083 SUCCESS**, quatro cenários aprovados e extrato de 20 aportes de reserva sem saldo negativo no instante de criação. O teste alternativo anterior com 100 novas douradas + 100 azuis continua preservado.

O módulo SQL de laboratório `src/domain/disponibilidade-cofres-v6-demo-sqlite.js` já subtrai dos valores brutos da direita os compromissos registrados de comissões, douradas financiadas e gestão pendente. Teste `test/disponibilidade-caixa2-integracao-v6.test.js` confere desconto em SQLite e impossibilidade de comprometer acima do saldo. **Não confundir o cálculo dessa simulação em memória com uma execução financeira de 5.000 clientes numa base transacional real**: a validação de CPF, a confirmação verde individual, os lançamentos efetivos e as reconciliações bancárias permanecem necessárias para operação real.

**Regra para o futuro administrador:** exibir lado a lado **entrada bruta da reserva, compromissos de bônus (por pessoa verde), aportes de douradas administrativas, demais reservas, saldo livre conciliado, pendências e histórico de origem**. Nunca exibir somente o bruto como disponível. Os cofres dos ciclos são projetados/segregados, não recebimentos bancários comprovados.
