# LOOP V6 — Simulação executada de 50 giros e 50 saídas do centro

Executada e aprovada no GitHub Actions (run de testes `38992619194`), com 358 testes passando, zero falhas no commit `956b6cb14f`. O arquivo executável e determinístico é `scripts/simular-50-giros-loop-v6.js`; os testes de conservação e indicações estão em `test/simulacao-50-giros-loop-v6.test.js`.

**Este é um cenário matemático do motor, não uma previsão de mercado, nem um pagamento, recebimento ou contemplação real.**

## Hipóteses explícitas

- 100 posições iniciais, cada uma de pessoa distinta; 7 delas preenchem o centro + as seis vagas.
- No início das rodadas: fila A = 0; fila B = 93.
- 50 giros concluídos, cada um exigindo seis eventos válidos de venda **fictícios**.
- Para testar o crescimento da fila, **cada evento gera uma nova pessoa compradora e uma posição fictícia**. São, portanto, 300 novas posições criadas durante a simulação.
- Um giro fecha um centro, desloca as seis vagas em cadeia e chama só **uma** nova posição da fila para a vaga 6. A ocupação do tabuleiro fica em 7.
- Alguns compradores simulados vêm de convites: os indicadores convidam entre 1 e 4 pessoas; nem todo novo comprador chega por convite. Um convite validado leva um indicador da B à A, ou aumenta sua prioridade se já estiver na A.
- A prioridade de entrada é de três A para uma B, quando ambas existem. O desempate se dá pelo último convite válido e, finalmente, ordem de entrada conforme o motor.
- Nenhum CPF, valor transferido, saque, entrega, PSP, token real ou movimentação bancária. Nenhuma bola dourada manual é inserida nesse cenário; isola-se a dinâmica das filas.
- O simulador é restaurado a cada 10 giros e confere que todos os IDs e posições permanecem intactos.
- Não é uma estimativa do prazo de espera: não modela duração cronológica das vendas, cancelamentos, reembolsos, custos, impostos, quantas pessoas reais indicarão nem queda de demanda.

## Resultado factual executado

| Métrica | Resultado |
|---|---:|
| Centros concluídos | **50** |
| Giros realizados | **50** |
| Eventos fictícios necessários | **300** |
| Posições na captação inicial | 100 |
| Posições adicionadas durante os 50 giros | 300 |
| Posições distintas criadas no total | 400 |
| Centro + vagas ocupados ao final | 7 |
| Posições na fila A ao final | **14** |
| Posições na fila B ao final | **329** |
| Aguardando na fila (A + B) ao final | **343** |
| Centros históricos concluídos | 50 |
| Chamadas da fila A para a vaga 6 | **38** |
| Chamadas da fila B para a vaga 6 | **12** |
| Convites validados | **128** |
| Pessoas que fizeram ao menos uma indicação | 52 |
| Pessoas promovidas de B para A | 52 |
| Convites de quem já estava em A | 76 |
| Indicadores com 1 convite | 13 |
| Indicadores com 2 convites | 13 |
| Indicadores com 3 convites | 15 |
| Indicadores com 4 convites | 11 |

## Evolução real observada das filas

| Giro concluído | Fila A | Fila B | Aguardando no total | Saídas acumuladas |
|---:|---:|---:|---:|---:|
| 0 | 0 | 93 | 93 | 0 |
| 1 | 1 | 97 | 98 | 1 |
| 5 | 2 | 116 | 118 | 5 |
| 10 | 3 | 140 | 143 | 10 |
| 15 | 4 | 164 | 168 | 15 |
| 20 | 7 | 186 | 193 | 20 |
| 25 | 8 | 210 | 218 | 25 |
| 30 | 9 | 234 | 243 | 30 |
| 35 | 11 | 257 | 268 | 35 |
| 40 | 13 | 280 | 293 | 40 |
| 45 | 14 | 304 | 318 | 45 |
| 50 | **14** | **329** | **343** | **50** |

## Interpretação técnica

Sob a hipótese de seis posições novas por giro, cada conclusão de centro consome **uma posição na fila** e acrescenta **seis posições novas**. Portanto, enquanto o tabuleiro permanece cheio, a fila cresce em **cinco posições por giro**: `93 + 50 × 5 = 343`. Este valor depende diretamente da hipótese comercial escolhida. Compras sem qualificação de posição, pausas, falhas de venda, desistências e cenários com menos ou mais compradores mudariam os resultados.

Os **128 convites** promoveram **52 pessoas** da B para a A e geraram **76 atualizações de prioridade** de pessoas já na A. A catraca selecionou **38 da A e 12 da B** para a vaga 6, respeitando a preferência 3:1. A proporção das filas finais foi 14 A e 329 B, que não significa que as pessoas da B ficarão sem acesso; significa que, nesta hipótese, muitas pessoas continuam aguardando enquanto a A é abastecida por novos convites.

Uma pessoa não é contemplada financeiramente ao atingir o centro na simulação; o que foi verificado é a **saída do centro e o fechamento dos seis eventos fictícios associados ao seu ciclo**, sem dinheiro real.

## Como reproduzir

```bash
npm ci
npm test
npm run simular:50-giros
```

O comando completo imprime o resumo, os pontos de controle e as **50 linhas do histórico** em JSON. Este teste está isolado do administrador, da loja pública, do banco dos usuários e das rotas reais: roda apenas na memória e **não dá acesso à criação de posições ou pagamentos na produção**.

## Validação do fluxo

- Exatamente 50 giros, nenhum centro concluído duas vezes.
- Seis vendas simuladas por ciclo, sem pular posição do tabuleiro.
- IDs exclusivos das 400 posições e conservação entre fila, tabuleiro e centros históricos.
- Recuperação do snapshot a cada dez giros.
- Alternância de A e B de acordo com a política do motor.
- Centro + seis posições permanentemente ocupados.
- Zero pagamentos, zero saques e zero contemplações financeiras reais.
