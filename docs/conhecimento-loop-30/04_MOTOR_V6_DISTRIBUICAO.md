# 04 — Motor V 6 e Distribuição

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Estrutura vigente: um centro mais seis vagas periféricas. Entrada pela vaga 6; avanço até 1 e centro. Seis eventos válidos concluem um ciclo. Ordem normal: centro, investimento/esquerda, centro, reserva/direita, centro, investimento/esquerda (3/3). Ciclo/giro/evento não são sinônimos; preservar histórico, contador do ciclo, dia, 24 h e acumulado.

Douradas: regra atual DOURADA_INTEGRAL_V 2 destina os seis eventos de novos ciclos da empresa ao cofre dourado. DOURADA_PARTILHADA_V 1 permanece para ciclos legados imutáveis. O documento antigo da transição azul descreve partilha V 1; não reaplicá-la a ciclos V 2. Posição dourada não gera receita ao ser criada.

AZUL pendente de CPF/termos converte para empresa na fronteira de ingresso da vaga 6, não pelo tempo de espera; aceite tardio não recupera posição já transferida. Estado de posição, propriedade e cor visual são campos diferentes. Centro roxo e vaga 6 verde são acabamento aprovado; eventos do cliente roxos e da empresa pretos não substituem o livro.

START/Pausar é do proprietário. Pausa não impede vendas/fila. LIVRE sem meta: autorizado pelo operador, guiado por vendas com cobertura e janela padrão 09–18 America/Sao_Paulo (decisão 26/11). PROGRAMADO: data opcional, abertura/fechamento e meta de centros; seis eventos por centro com cadência calculada. Reprogramar/retomar não executa atrasados em rajada. Polling de transporte não define intervalo comercial.

Relógio, próxima luz e painéis consultam agenda persistida; previsão de tempo não é pagamento. A conexão interna tem testes; a ponte bancária produtiva, reserva/consumo e repasses externos não estão certificados.

## Fontes integrais preservadas

- [ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md](../ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md)
- [INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26 NOV 2026.md](../INTEGRACAO_INTERNA_START_VENDAS_RELOGIO_26NOV2026.md)
- [TRANSICAO_AZUL_DOURADO_NA_VAGA 6_LOOP_V 6.md](../TRANSICAO_AZUL_DOURADO_NA_VAGA6_LOOP_V6.md)
- [Código: src/domain/tabuleiro-loop.js](../../src/domain/tabuleiro-loop.js)
- [Código: src/domain/simulador-loop.js](../../src/domain/simulador-loop.js)
- [Código: src/domain/destino-financeiro-centro-loop.js](../../src/domain/destino-financeiro-centro-loop.js)
- [Código: src/domain/politica-execucao-distribuicao-loop.js](../../src/domain/politica-execucao-distribuicao-loop.js)
- [Código: src/producao/operacao-catraca-admin-sqlite.js](../../src/producao/operacao-catraca-admin-sqlite.js)
- [Código: src/shared/visor-catraca.js](../../src/shared/visor-catraca.js)

[Voltar ao índice geral](README.md).
