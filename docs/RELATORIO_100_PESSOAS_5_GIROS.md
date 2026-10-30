# LOOP V5 — Relatório do teste de 100 participantes e 5 giros

**Execução verificada:** GitHub Actions, 16/10/2026.  
**Código testado:** commit `bce60a3f49c5922f16db5addc8b1c725e1422e1d`.  
**Resultado CI:** 299 testes aprovados, 0 falhas.  
**Execução:** https://github.com/jjinvest/loop-app/actions/runs/38849486181

## Cenário

1. Cento e um? **Não**: exatamente **100 compradores fictícios iniciais** inseridos um por um, cada um com um pedido e uma posição própria.
2. O tabuleiro foi ocupado progressivamente: da primeira pessoa até o centro mais cinco vagas, totalizando seis posições.
3. A partir da pessoa 14, algumas compras geram validação de indicação para um participante que já entrou. O cenário também verifica chamadas duplicadas: não criam nova posição, indicação nem venda.
4. São realizados **cinco giros**, com exatamente **cinco novas compras elegíveis por giro**. Cada compra adiciona um novo participante à fila e registra um único evento no ciclo do centro. Assim, entram outras **25 posições**, total **125**.
5. Confere-se o comportamento da catraca fechada, a sequência dos cinco destinos por ciclo, a prioridade 3A/1B, a saída do ocupante do centro e o deslocamento de todas as vagas.
6. Depois do terceiro giro, o estado é exportado e restaurado de um snapshot, simulando reinício de serviço.
7. Compradores fictícios com participação ainda pendente tornam-se posições operacionais da empresa ao entrarem no tabuleiro. Nada desse teste envolve pagamento ou repasse real.

## Resultado por giro

| Giro | Compras acumuladas | Posições encerradas | Fila A | Fila B | Total na fila | Centro após o giro | Entrada na vaga 5 |
|---|---:|---:|---:|---:|---:|---:|---|
| Antes | 100 | 0 | — | — | 94 | Posição 1 | Tabuleiro original |
| 1 | 105 | 1 | 11 | 87 | 98 | Posição 2 | Posição 18 (A) |
| 2 | 110 | 2 | 11 | 91 | 102 | Posição 3 | Posição 12 (A) |
| 3 | 115 | 3 | 11 | 95 | 106 | Posição 4 | Posição 9 (A) |
| 4 | 120 | 4 | 11 | 99 | 110 | Posição 5 | Posição 7 (B) |
| 5 | 125 | 5 | 10 | 104 | 114 | Posição 6 | Posição 20 (A) |

Os cinco estados após os giros são transcritos exatamente do resultado automatizado. A distribuição inicial A/B não foi impressa no relatório do teste, apenas seu total.

## Fechamento comprovado

- **125** posições criadas por compras fictícias (100 iniciais + 25 novas).
- **5** posições com ciclo encerrado (5 giros).
- **6** posições ainda ocupando o tabuleiro.
- **114** posições ainda nas filas, sendo **10 A + 104 B**.
- **64** indicações validadas (não equivalem a 64 posições A, porque um participante pode indicar várias vezes).
- Das cinco novas vagas abertas: **4 seleções de A e 1 de B**, conforme a prioridade.
- Conservação: **125 = 5 encerradas + 6 no tabuleiro + 114 nas filas**.
- Cada giro consumiu cinco eventos de venda; nenhuma repetição indevida foi aceita.

## Limites do cenário

O teste faz 100 compras iniciais, preenche o tabuleiro e só então registra os 25 eventos que alimentam os cinco ciclos. É uma **simulação controlada** para testar cinco giros, não uma previsão de tempo de espera, crescimento orgânico ou retorno financeiro.

**Arquivo de teste:** `test/estresse-100-pessoas-5-giros.test.js`.  
**Status:** laboratório, sem clientes, pagamentos ou contemplações reais.
