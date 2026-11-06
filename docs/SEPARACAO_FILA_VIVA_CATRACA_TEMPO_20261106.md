# LOOP 3.0 / AKITEMM — fila viva versus catraca temporizada — 06/11/2026

## Regra de produto reafirmada pelo proprietário

> **Fila = registro vivo de vendas e posições. Catraca = executor dos eventos já comprovados e do movimento do tabuleiro.**

Uma venda de produto elegível só cria posição após recebimento validado e reconsultado no Asaas Sandbox. A posição entra na fila B e, com indicação válida atribuída individualmente e aceite do titular, pode migrar para a fila A. **Isso continua mesmo quando a catraca está pausada.** A fila preserva sua sequência, prioridade 3A:1B, dados, timestamp e limite de posições. Ela **não inventa evento, não movimenta fisicamente o tabuleiro e não autoriza repasse financeiro** por si só.

A catraca consome vendas comprovadas já registradas. Um intervalo autorizado ilumina exatamente **uma** das seis luzes do centro: 1/3/5 roxas para o participante; 2/4/6 pretas para o sistema. Após a sexta luz, o deslocamento das posições do tabuleiro ocorre em **um pulso autorizado posterior**, sujeito a pausa manual, janela diária e revalidação dos seis PSP. Um pagamento revertido ou revisão pendente bloqueia o movimento. Movimentar o tabuleiro não é, por si só, liquidar dinheiro nem realizar saque.

## Configuração implantada no laboratório

- Horário de Brasília, `America/Sao_Paulo`; **abre 09:00, fecha 18:00**, configuráveis.
- Intervalo configurável (5, 10, 15, 30 ou 60 minutos), padrão **10 minutos**.
- Extensão excepcional de horário por **data específica**, com atalho **Hoje até 21:00**; no dia seguinte, volta ao encerramento ordinário.
- Pausa manual e fora de horário **não alteram os registros de vendas e filas**.
- O motor guarda a última janela processada no **mesmo SQLite** para não acender luz repetida e não recuperar minutos perdidos com rajadas de giros após reinício. Máximo de um evento por intervalo quando a agenda estiver ativa.
- O backend do Railway confere o relógio em ciclos de 15 segundos; a interface do cliente atualiza as luzes e filas visíveis por GET a cada 15 segundos, sem emitir comandos de compra.
- Um painel do administrador exibe horário, intervalo, luzes do centro, vendas aguardando contabilização, pausa manual e controles de agenda.
- A agenda **começa desativada** até ativação administrativa explícita. A homologação nunca efetua PIX real, repasse, comissão ou saque.

### Implementação

- `src/domain/agenda-catraca-loop.js`: janela e slots em horário de Brasília.
- `src/domain/motor-conta-unica-ensaio-sqlite.js`: agenda persistida, compra esperando pulso, reconsulta PSP e operação da catraca no mesmo snapshot do motor.
- `scripts/servidor-escritorio-preview-railway.js`: temporizador de verificação, encerrado junto com o servidor.
- `src/candidato/servidor-loja-escritorio-candidato.js`: configuração e leitura autenticadas do operador.
- `src/candidato/escritorio-admin-candidato-ui.html` e `.js`: painel de horários e exceções na interface existente.
- `src/candidato/checkout-candidato-ui.js`: luzes e filas alimentadas da mesma API.

### Limitações e próximos gates

A contabilização com relógio foi validada em testes SQL direcionados na implantação Railway, incluindo acúmulo de compras na pausa e simulação de passagem de tempo, mas a **agenda ainda não foi ativada para rodar horas inteiras na homologação**, por segurança. O fluxo anterior de seis compras e um giro já foi comprovado separadamente via HTTP/Asaas Sandbox. A prova de operação prolongada com reinicialização durante uma janela e a equivalência entre caixa real, reservas e repasses requer verificações próprias antes de qualquer oferta comercial.

**Fonte de verdade:** o estado de compra é o PSP conciliado; o estado de fila e de catraca é o SQLite; a tela apenas representa esses estados. A agenda não altera nem liquida dinheiro. PR #1 permanece DRAFT.
