# LOOP V6 — Lançamento em 30 dias com 30 entradas; projeção de 300 giros

Esta é a simulação solicitada pelo idealizador em 17/10/2026. Ela **substitui a premissa artificial de 12 mil posições no lançamento** para fins de acompanhamento comercial. O ensaio anterior de 12 mil continua apenas como teste isolado de resistência técnica.

## Regra fixa, não hipótese

**A cada seis entradas/vendas fictícias válidas, um ciclo de seis eventos é concluído e a catraca pode girar.** A posição do centro conclui seu ciclo, a vaga 1 avança ao centro, as vagas 2 a 6 avançam uma casa e entra uma nova posição na vaga 6 pela fila A/B. Regras de promoção e prioridade 3A/1B são preservadas. Sem seis eventos, não há giro. O ensaio é 100% fictício e não movimenta valores.

## Pré-lançamento: dias 1 a 30

1. Um fundador é colocado no centro como uma **premissa explícita**; essa reserva de posição não é apresentada como pagamento ou compra extra.
2. Do dia 1 ao dia 30, entra exatamente uma pessoa compradora nova por dia, totalizando **30 pessoas distintas**, uma posição por pessoa e 30 compras distintas. A catraca só começa a movimentar no lançamento.
3. Entre essas 30, **cinco pessoas indicam**, respectivamente, **3, 2, 1, 1 e 1**, totalizando oito convidados. Todos os oito **já estão incluídos nos 30 compradores**, sem dupla contagem. As outras 22 pessoas não foram atribuídas a indicação, inclusive os cinco indicadores.
4. O teste identifica quem fez primeiro sua primeira indicação: em empate de uma indicação, a data do último convite válido ordena os indicadores. Na montagem inicial, a vaga 1 recebe o indicador que fez três indicações, a vaga 2 o de duas e a vaga 3 o primeiro que fez uma; a vaga 4 recebe posição B, e as vagas 5/6 seguem os demais indicadores A.
5. No lançamento, as 30 compras iniciais são aceitas como **30 eventos válidos de ciclo do período de pré-lançamento**. Isso é uma regra explícita do cenário, a ser tratada com cuidado na conciliação de caixa e aceites antes de produção; sem essa premissa, a contagem dos giros iniciais é outra.

Resultado efetivamente conferido pelo teste após processar os 30 eventos: **cinco ciclos concluídos**, sete posições ocupando o tabuleiro (centro + seis periferias), **19 aguardando em B**, nenhuma aguardando em A. Há 31 posições contabilizadas ao todo quando se inclui o fundador: 5 concluídas + 7 no tabuleiro + 19 na fila.

## Como chegar a 300 giros sem inventar 12.600 pessoas

Para testar uma extensão proporcional, acrescentamos **59 ondas condicionais de 30 novos compradores** após o lançamento. Cada onda imita os dados observados na prévia, com cinco indicadores diferentes fazendo 3, 2, 1, 1 e 1 indicações dentro do próprio grupo. Os convidados fazem parte dos 30, nunca contam uma segunda vez.

Esse padrão repetido **não é uma previsão de crescimento nem afirmação de que as 59 ondas realmente acontecerão**. Serve somente para testar a catraca se houver vendas suficientes para completar 300 giros, sem criar compradores extras arbitrários por giro.

| Giro acumulado | Compradores acumulados | Concluíram o centro | Fila A | Fila B | Aguardando |
|---:|---:|---:|---:|---:|---:|
| 5 | 30 | 5 | 0 | 19 | 19 |
| 10 | 60 | 10 | 1 | 43 | 44 |
| 50 | 300 | 50 | 11 | 233 | 244 |
| 100 | 600 | 100 | 23 | 471 | 494 |
| 200 | 1.200 | 200 | 48 | 946 | 994 |
| **300** | **1.800** | **300** | **73** | **1.421** | **1.494** |

Conservação em 300 giros: **1.800 posições compradas + 1 posição inicial do fundador = 1.801 posições; 300 concluídas + 7 no tabuleiro + 1.494 na fila = 1.801**.

Convites validados: 8 por grupo × 60 grupos = 480, realizados por 300 indicadores distintos. Cada pessoa convidada já é uma das compradoras. As seleções para a vaga 6 em 300 giros foram 222 da A e 78 da B, contando a montagem inicial separadamente.

## O que esse teste não comprova

- Não comprova que 1.800 pessoas comprarão, que as compras ocorrerão em 30 dias após lançamento ou que chegarão 300 giros num determinado intervalo de calendário.
- A posição do fundador no centro é uma exceção inicial explicitamente semeada no motor, não a prova da forma definitiva de ativação, lastro ou direito.
- Os primeiros 30 pagamentos simulados são reaproveitados como eventos de ciclo no dia do lançamento, por hipótese deste ensaio. Não conectar isso a pagamentos reais antes de definir segregação, conciliação, custos, reembolso e direitos.
- Não é contagem de CPFs efetivamente verificados, saldo, PIX, saques ou ganhos reais. O teste registra **centros concluídos**, não dinheiro recebido pelos participantes.
- Não há prova de sustentabilidade. O crescimento de aproximadamente cinco posições aguardando por ciclo completo decorre da hipótese de seis compras distintas criando seis posições e de apenas uma posição sair do centro por giro. A fila se acumula mesmo com ciclos completos.
- Um pacote de seis posições comprado em uma única transação não equivale automaticamente a seis eventos financeiros independentes. Este ensaio usa **uma compra por nova pessoa**, sem pacotes.

## Execução e verificação

- Comando: node scripts/simular-lancamento-30-dias-300-giros-v6.js
- Suíte: npm test
- Arquivos: scripts/simular-lancamento-30-dias-300-giros-v6.js e test/lancamento-30-dias-300-giros-v6.test.js
- A última execução consultada após adicionar os testes confirmou **364 testes aprovados e 0 falhas** no GitHub Actions; consulte os logs para a revisão específica de commit.

Nenhum merge, publicação, alteração de identidade visual ou integração de pagamentos reais foi feito.