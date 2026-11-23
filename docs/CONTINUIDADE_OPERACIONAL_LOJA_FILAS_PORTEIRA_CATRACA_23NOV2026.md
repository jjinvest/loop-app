# LOOP 3.0 / AKITEMM — contrato operacional de continuidade e testes independentes
**Decisão ratificada pelo proprietário em 23/11/2026. Marco Zero: 01/12/2026.**

## A regra de entrega

**CRIAR → TESTAR O MECANISMO → APROVAR → INTEGRAR NO SISTEMA REAL → VERIFICAR A PUBLICAÇÃO.**
Não considerar concluído um mecanismo que apenas altera contadores, luzes ou textos no navegador. A animação é consequência de eventos do motor, nunca substituto de eventos persistidos. Preservar integralmente as telas já aprovadas e não recomeçar o projeto.

## Fronteiras operacionais definitivas

| Módulo | Responsabilidade própria | Pode operar sozinho nos testes? | Ligação final |
| --- | --- | --- | --- |
| AKITEMM | Catálogo, carrinho, pedidos, regras das cores e qualificação | Sim, pedidos e classificação internos | Pedido qualificado alimenta o registro da posição na fila |
| Filas A/B | Receber posições, registrar nomes e ordem, atribuir indicações válidas, prioridade **3A:1B** | **Sim, com a catraca parada e porteira fechada** | A porteira autoriza a passagem da próxima posição elegível |
| Porteira | Controlar a fronteira **fila → tabuleiro**; fechada por padrão | Sim; fechar não apaga fila nem move catraca | O giro só busca nova posição se a porteira permitir |
| Catraca/tabuleiro | Executar seis eventos por centro e um movimento real do tabuleiro, **centro + seis vagas** | **Sim, com porteira fechada**, usando posições preexistentes no tabuleiro | O relógio dispara eventos; o motor atualiza centro e vagas; a fila apenas reabastece quando a porteira abrir |
| Relógio | Determinar cadência, pausa, modo manual e meta diária | Sim; não altera a ordem das filas | Emite marcos consumidos pelo motor da catraca, exatamente uma vez por evento |

**Independência durante testes não significa duplicar motores ou criar um sistema apenas visual.** Os testes usam as mesmas classes de regras e as mesmas transições de estado, com instâncias/snapshots segregados das contas e posições dos clientes. Valores e nomes de ensaio são processados como dados verdadeiros **dentro do circuito de teste**, com efeitos observáveis e persistidos. A integração comercial final passa a conectar os módulos, sem reescrever as regras ou substituir o motor.

## Sequência obrigatória de execução e aceite

### Etapa 1 — CATraca sozinha, porteira fechada
1. Operador carrega sete posições no tabuleiro da bancada isolada.
2. A porteira da fila permanece **fechada**. O modo do relógio do operador determina se as luzes são manuais ou programadas.
3. Cada luz chama **`registrarVendaNoCicloSimulada` do mesmo núcleo de domínio**, gerando um evento auditável; após a sexta, a catraca chama **`tentarGiro`**: centro sai; vaga 1→centro; 2→1; ...; 6→5; vaga 6 fica vazia porque a porteira está fechada.
4. Conferir **antes/depois**: seis eventos distintos, exatamente um giro, centro atualizado, nomes corretos, posição 6 vazia, nenhuma posição nova consumida na fila.
5. Testar pausa, repetição de comando, intervalo, reinício e modo automático por tempo de servidor. Não confundir números do relógio no navegador com giros efetivos.

### Etapa 2 — FILA sozinha, catraca parada
1. Porteira começa **fechada**; inserir posições com nomes e identificadores de teste.
2. Conferir persistência e ordem das filas A/B, limite de dez por titular, indicação aplicada **à posição escolhida**, escalonamento 3A:1B e nomes visíveis.
3. A fila pode acumular novas posições e mudar de A/B sem disparar um giro.
4. Para **testar saída da fila por abastecimento**, o operador abre **explicitamente a porteira**, manda preencher vagas sem rodar a catraca e a fecha novamente. Com a porteira fechada não se pode extrair posição da fila silenciosamente.
5. Conferir contadores, os nomes que atravessaram a porteira e que o total de giros permaneceu **zero** durante toda a etapa.

### Etapa 3 — integração causal
AKITEMM → compra qualificada → posição identificada na fila B → promoção individual para A quando válida → porteira decide entrada → tabuleiro → seis eventos comandados pelo relógio → movimento do motor → contador de centros concluídos. Todas as telas de operador/cliente devem ler a **mesma fonte do mecanismo efetivamente testado**, mantendo a proveniência dos dados. **Não publicar como concluída esta terceira etapa apenas porque as duas bancadas independentes passaram.**

## Código vigente e pontos de conexão

- Regra do motor de filas: [`src/domain/motor-filas.js`](../src/domain/motor-filas.js), com `proximoDaFila()`, promoção individual e prioridade 3A:1B.
- Tabuleiro: [`src/domain/tabuleiro-loop.js`](../src/domain/tabuleiro-loop.js), com `registrarVendaSimulada()`, `preencherInicial()` e `girarSimulado()`.
- Composição e snapshot: [`src/domain/simulador-loop.js`](../src/domain/simulador-loop.js) e [`src/domain/estado-simulacao.js`](../src/domain/estado-simulacao.js). **Essas classes já executam a lógica efetiva nos testes, apesar do nome histórico.**
- Bancada independente persistida: [`src/producao/bancada-modulos-loop-sqlite.js`](../src/producao/bancada-modulos-loop-sqlite.js). Tabelas específicas `loop_teste_modulos_*`, dois snapshots, fechamento por padrão, livro de comandos idempotentes, transações atômicas e leitura da agenda oficial do operador.
- Rotas autenticadas: [`src/producao/gateway-admin-comercial.js`](../src/producao/gateway-admin-comercial.js): `GET/POST /api/admin/loop/testes-modulos`, somente operador real com CSRF na escrita.
- Servidor e relógio: [`scripts/iniciar-identidade-real-loop.js`](../scripts/iniciar-identidade-real-loop.js) — varredura a cada 10 segundos mesmo sem navegador aberto; agenda do operador [`src/producao/operacao-catraca-admin-sqlite.js`](../src/producao/operacao-catraca-admin-sqlite.js), projeção [`src/producao/projecao-agenda-tabuleiro-compartilhada.js`](../src/producao/projecao-agenda-tabuleiro-compartilhada.js).
- Visão do operador (somente sua aba Posições): [`src/producao/interface-aprovada-contas.js`](../src/producao/interface-aprovada-contas.js); painel de execução e resultados separado dos contadores de clientes.
- Prova automatizada nova: [`test/bancada-modulos-independentes-operador-real.test.js`](../test/bancada-modulos-independentes-operador-real.test.js).
- Fonte operacional anterior: [`REGRA_DEFINITIVA_FILA_E_CATRACA_POR_CAIXA_17NOV2026.md`](./REGRA_DEFINITIVA_FILA_E_CATRACA_POR_CAIXA_17NOV2026.md), [`LEIA_PRIMEIRO_ESSENCIA_UNICA_LOOP_AKITEMM_21NOV2026.md`](./LEIA_PRIMEIRO_ESSENCIA_UNICA_LOOP_AKITEMM_21NOV2026.md), [`SEPARACAO_FILA_VIVA_CATRACA_TEMPO_20261106.md`](./SEPARACAO_FILA_VIVA_CATRACA_TEMPO_20261106.md). As versões antigas ficam preservadas; este documento especifica as **três etapas de teste independentes** solicitadas em 23/11.

## Estado verificável e não concluído

A bancada aqui adicionada efetua transições verdadeiras das classes de domínio, com dados de teste persistidos e rastreáveis. **Não equivale automaticamente a alterar os contadores públicos do tabuleiro em produção.** A integração final (etapa 3), com fonte única para o painel definitivo e ensaio completo por navegador PC/celular, precisa de evidência própria antes de marcar CONCLUÍDO. A aprovação é do proprietário após conferir o sistema publicado.

**Próximo executor:** conferir o HEAD da branch ativa `feature/unificar-escritorio-real-20261105`, o manifesto de proteção de telas `docs/TRAVA_BASE_REAL_ATUAL_20261119.json`, os testes de regressão, o deployment Railway e a URL oficial. Jamais voltar à prévia como fonte de verdade. Nenhum comando de teste deve alterar `loop_real_motor_*`, `loop_real_contas` ou `loja_real_pedidos`.
