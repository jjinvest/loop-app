# LOOP V6 — Caixa referencial dos 50 giros, posições repetidas e projeções de escala

Data: 17/10/2026. Esta nota acompanha os **testes já executados no motor**; nenhum valor abaixo representa faturamento, saldo, dinheiro recebido ou promessa de ganho.

## 50 giros: o que o motor realmente registrou

O teste `scripts/simular-50-giros-loop-v6.js` fechou 50 centros, com **seis eventos independentes de venda fictícia por centro**, totalizando 300 eventos. O centro era sempre uma posição pertencente ao participante: **zero centros dourados** neste cenário.

A tabela resulta da leitura do campo `destinoCofre` gravado em cada um dos 300 eventos da catraca, multiplicado pela referência de R$250 por evento:

| Destino referencial | Por centro | 50 centros |
|---|---:|---:|
| Centro dos participantes (etapas 1, 3 e 5) | R$ 750 | **R$ 37.500** |
| Cofre investimento (etapas 2 e 6) | R$ 500 | **R$ 25.000** |
| Cofre reserva (etapa 4) | R$ 250 | **R$ 12.500** |
| Cofre das douradas | R$ 0 | **R$ 0** |
| **Total de destinações planejadas** | **R$ 1.500** | **R$ 75.000** |

O total dos cofres da empresa no teste é **R$37.500 destinados a investimento e reserva**, NÃO lucro, rendimento garantido, dinheiro disponível para saque ou saldo bancário. A referência teórica dos participantes soma outros R$37.500. A simulação não dispara transferências e nenhum valor entra no livro de banco real.

A simulação começou com **100 posições iniciais** e acrescentou **300 posições**, totalizando **400**. Se cada posição inicial e nova fosse criada com compra de exatamente R$250, **a venda bruta hipotética das 400 posições seria R$100.000**, mas os R$25.000 das 100 compras iniciais NÃO estão incluídos na destinação dos 300 eventos acima. Tampouco é correto contabilizar os R$100.000 como caixa real.

### Comissões de indicação — cenário adicional, não desembolso

O primeiro cenário executado teve **128 convites válidos de teste**. Hipoteticamente, se todos fossem de novas posições referenciadas a R$250 e a comissão efetiva fosse de **10%**, a provisão seria **128 × R$25 = R$3.200**. Nenhuma comissão foi liquidada pela simulação de 50 giros. Campanhas com taxa maior aumentariam este custo.

### Margem efetiva depende dos produtos

**Comparação por 300 compras dos giros**, desconsiderando impostos, operadora, logística, suporte, devoluções, reservas adicionais e custos financeiros:

| Hipótese comercial | Preço | Custo do fornecedor | Referência LOOP | Margem bruta comercial por venda | Em 300 vendas |
|---|---:|---:|---:|---:|---:|
| Produto vendido pelo valor mínimo | R$250 | R$50 | R$250 | **-R$50** | **-R$15.000** |
| Produto com margem maior | R$600 | R$300 | R$250 | **R$50** | **R$15.000** |

Com comissões hipotéticas de R$3.200, os resultados comerciais antes dos demais custos seriam, respectivamente, **-R$18.200** ou **R$11.800**. O dinheiro destinado a investimento/reserva não é lucro adicional a essas margens. As hipóteses comerciais não significam que tais valores foram cobrados, faturados ou distribuídos.

O sistema precisa impedir lançamento quando o valor líquido efetivamente recebido não suportar fornecedor, tributos, chargebacks, entrega, comissão e obrigações legítimas da plataforma. Isso exige revisão jurídica e um sistema real de pagamentos, estornos e conciliação independente.

## Um titular pode ter seis posições

Foi executado **um segundo teste de 50 giros** com **400 posições de apenas 75 titulares fictícios**:

| Medida | Resultado do motor |
|---|---:|
| Centros concluídos | 50 |
| Pessoas distintas cujas posições concluíram | **14** |
| Posições totais | 400 |
| Titulares distintos cadastrados | 75 |
| Posições ainda na A / B | **10 / 333** |
| Convites fictícios validados | 30 |
| Promoções de titulares com quatro posições cada | **12** |
| Chamadas A / B para vaga 6 | **38 / 12** |
| Dinheiro movimentado | **R$0** |

**Regra do motor observada:** se um participante com várias posições na fila B valida um convite, todas as suas posições naquela fila são promovidas juntas à A. A prioridade 3:1 é aplicada por **posição**, não por CPF distinto. Isso pode concentrar saídas do centro em menos pessoas; merece avaliação específica de equidade, proteção do consumidor e regras transparentes.

## Dez mil e cem mil compradores: apenas projeção aritmética

**Não fizemos teste real de carga de 10 mil nem de 100 mil usuários simultâneos.** A matemática é válida **somente** na hipótese de que, após o tabuleiro já estar cheio com sete posições das 100 iniciais, cada novo evento válido acrescenta uma posição e são necessários seis eventos distintos para cada giro.

| Eventos novos válidos | Giros completos teóricos | Eventos que sobram | Posições restantes na fila* |
|---:|---:|---:|---:|
| 300 | 50 | 0 | 343 |
| 10.000 | 1.666 | 4 | 8.427 |
| 100.000 | 16.666 | 4 | 83.427 |

\*Fila = 93 iniciais + posições novas - giros completos. Sete posições continuam no tabuleiro. Entradas pela A/B dependem da atividade de indicação; a tabela não prevê a distribuição entre as duas.

**Pessoas não são o mesmo que posições nem eventos de venda.** Dez mil titulares com seis posições podem significar 60 mil posições em aberto; cem mil titulares com seis podem significar 600 mil. A quantidade de giros depende do número **independente e elegível de eventos financeiros confirmados**, inclusive das regras ainda a conferir sobre pacotes de seis posições, e não dos perfis cadastrados por si sós. Para um pacote de seis posições comprado num só pagamento, é obrigatório definir e testar se ele gera um ou seis eventos do ciclo e de onde vem o lastro de cada um. Não presumir o resultado antes dessa decisão.

Se os 10 mil e 100 mil novos eventos de venda estivessem todos lastreados numa referência de R$250 por evento, o **valor referencial** associado a eles seria R$2.500.000 e R$25.000.000, respectivamente, **sem descontar** nenhum custo, imposto, comissão ou estorno. Isso não representa caixa disponível nem lucro do negócio.

## Como verificar

- `npm test` executa testes de 50 giros, conservação das 400 posições e múltiplas posições por titular;
- `npm run simular:50-giros` imprime os 50 giros, convites e o quadro financeiro referencial;
- `node scripts/simular-50-giros-posicoes-repetidas-v6.js` reproduz as 50 saídas com titulares repetidos;
- `src/domain/destino-financeiro-centro-loop.js` é a fonte da ordem dos cofres;
- `src/domain/financeiro-admin-demo.js` já diferencia preço do produto, fornecedor, referência LOOP e margem comercial fictícia.

Nenhuma alteração nesta etapa mexeu em visual, filas reais, saldo, PIX, pagamento externo, banco de clientes, merge ou publicação.
