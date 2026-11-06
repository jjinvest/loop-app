# REGRA-MESTRE — a alma do LOOP — fila viva, catraca independente e controles livres (06/11/2026)

## Regra definitiva confirmada pelo proprietário

**A fila representa a história de vendas, clientes, novas posições, indicações e prioridades. A catraca é uma peça separada, alimentada pela fila; só ela transforma eventos válidos acumulados em movimentos do tabuleiro.**

1. **Vendas/PSP:** venda registrada ≠ compra recebida. Uma posição elegível só é criada com valor, titularidade e evento PSP Sandbox recebidos e conciliados. O caixa, as reservas e obrigações financeiras são ledgers à parte. O relógio nunca fabrica transações.
2. **Fila A e B:** permanecem *vivas* em qualquer estado da catraca: compras continuam recebendo posições, indicações válidas continuam promovendo B → A, e a prioridade 3A:1B se mantém. A fila não conclui ciclos nem gera repasses por conta própria.
3. **Catraca:** toma os pedidos PSP válidos ainda não usados, contabiliza uma vez cada evento (6 luzes, 3 roxas/3 pretas), revalida o PSP antes do giro e movimenta centro+6 vagas uma vez por ciclo. **Seis vendas distintas por centro concluído**, sem event replay, giro de 5 eventos ou crédito real de laboratório.
4. **Sem Circuit Breaker:** no **modo NATURAL**, a catraca acompanha os eventos que chegam da fila, sem impor 9h–18h nem intervalo artificial de negócio. O processo técnico acorda no servidor a cada 15s e consome o backlog PSP comprovado em transações SQLite; essa varredura é operacional e não altera prioridade das filas.
5. **Circuit Breaker opcional:** o administrador pode escolher **MANUAL** (comando de ensaio), **NATURAL** (fila empurra), **AGENDADA** (horários/intervalos escolhidos) ou **STOP** (bloqueia movimento); STOP e pausa manual não impedem novas vendas ou entradas nas filas. Um comando explícito de liberacão de lote pode executar até N centros já financiados por 6 eventos comprovados cada, nunca antecipando eventos fictícios.
6. **Horários livres:** 09:00–18:00 é apenas exemplo salvo; início e fim são editáveis. Encerrar à **00:00** significa meia-noite seguinte. Horário que atravessa madrugada também é aceito. Intervalo livre em **minutos inteiros positivos**, incluindo 5, 10, 15, 60, 120 ou outro; não é um menu de valores fixos. Exceção por data sem prender o encerramento a 21:00.
7. **Lotes:** o campo `Liberar até quantas pessoas do centro agora?` recebe quantidade positiva, ex.: 5. No máximo 100 ciclos são processados por transação para proteger concorrência; valores maiores retornam restantes em vez de serem recusados. Se houver somente oito vendas comprovadas e o administrador pedir cinco ciclos, conclui no máximo um e preserva as duas luzes restantes — sem giro ou dinheiro fictício.

## Código e evidências

- Motor: `src/domain/motor-conta-unica-ensaio-sqlite.js`, snapshot, ledger de operações, fila e ciclo no **mesmo SQLite**. Tabela `akitemm_motor_catraca_modo_lab` mantém estado distinto. Em homologação preexistente, o padrão seguro é **MANUAL**, para não mover o tabuleiro fictício automaticamente só por implantar o código. O modo NATURAL pode ser ativado explicitamente pelo admin e é a regra de funcionamento normal pretendida quando a operação estiver liberada.
- Agenda: `src/domain/agenda-catraca-loop.js` trata janela variável, meia-noite e intervalos customizados.
- Operador: `src/candidato/escritorio-admin-candidato-ui.html` e `.js` preservam a interface aprovada, com seletor de modo, horário livre e botão de lote. API `/staging/escritorio-unificado/motor/agenda` e `/motor/liberar-lote`, com autorização de operador.
- Cliente: `src/candidato/checkout-candidato-ui.js` identifica os modos sem confundir o relógio com ocorrência de venda.
- Proteções locais: `test/agenda-catraca-loop.test.js` e `test/fluxo-indicacao-compra-sandbox-tabuleiro.test.js` incluem noite/madrugada, 120 min, STOP, pausa, acumulação de compras, ciclo natural sem relógio e pedido de lote cinco sem inventar 30 vendas.
- Railway deploy `0b501cb5-10d2-4df6-b435-f32f71a0d717` **SUCCESS/healthcheck**, 24 testes direcionados aprovados, Asaas Sandbox GET autenticado. Código de lote validado com amostra de oito compras PSP de ensaio e sem dinheiro real.

## Distinção entre concluído e ainda pendente

**Implementado e testado:** as quatro modalidades, horários livres, lote solicitado pelo operador, venda acumulada em pausa e limite de seis eventos PSP reais de Sandbox por giro. O total de testes não substitui a prova ponta a ponta: o giro completo por HTTPS no Sandbox foi demonstrado anteriormente em `docs/PROVA_SEIS_PIX_SANDBOX_GIRO_CATRACA_RAILWAY_20261106.md`.

**Ainda a implementar/validar:** programação automática de meta **“liberar dez pessoas distribuídas das 9h às 18h”** e lotes futuros em horários específicos sem clicar no momento; validação HTTPS do novo botão de lote com dados exclusivamente fictícios; ensaios prolongados com reinício e concorrência. Não declarar esses pontos concluídos antecipadamente.

Amostras são inteiramente de laboratório. Nenhuma comissão, saldo, saque, Pix produtivo ou obrigação de remuneração foi criada. As verificações jurídicas e financeiras continuam independentes da conclusão do motor. **PR #1 DRAFT.**
