# LOOP 3.0 / AKITEMM — continuidade após Work — 01/11/2026

## Ponto de partida: preservar avanço existente
Retomada diretamente da branch `fix/teste-escrita-catraca-20261014`, com PR #1 em DRAFT.
O relatório `RELATORIO_INTEGRACAO_HTTP_10000_01NOV2026.md` e suas evidências
permanecem a fonte do ensaio **já concluído** de 10.000 clientes, sem repetição.
O ensaio usou HTTP local, SQLite em arquivo e PSP simulado: 10.000 pedidos e
posições, 1.666 giros, 9.996 eventos, 4 pedidos aguardando próximo giro,
1.000 indicações vinculadas e R$ 2.500.000,00 de vendas **fictícias**.
Não confundir com 10.000 chamadas ao Asaas remoto.

A homologação distinta com Asaas Sandbox remoto usou **uma** compra
HTTP de R$ 250, confirmação por API Sandbox e callback **injetado localmente**
com token, seguido de reconsulta à API. O Sandbox remoto **não entregou**
o webhook ao servidor do LOOP. A execução anterior do workflow foi aprovada,
mas não prova entrega remota de callbacks.

## Ajustes funcionais deste bloco
1. `src/domain/processador-callbacks-asaas-sandbox-lab.js`: falhas inesperadas
   da execução do worker deixaram de ser engolidas sem indicação operacional;
   o resumo administrativo passa a expor contador e último código de falha
   sanitizado, sem exceção bruta, senha, segredo ou dado pessoal.
2. `src/domain/conciliacao-automatica-asaas-sandbox-lab.js`: falha inesperada
   em uma verificação agendada, inclusive em callback de erro externo,
   não produz mais promessa rejeitada sem tratamento, nem encerra
   o agendador de laboratório; mantém contador e código sanitizado.
3. `test/asaas-agendadores-recuperacao-telemetria-lab.test.js`: injeção de falha
   em ambos os timers, verificação de continuidade nos ciclos seguintes e
   ausência de vazamento de mensagens privadas na telemetria.

Telemetria adicionada é **somente de memória**: zera ao reiniciar o processo.
Já a fila de callbacks e seus históricos continuam persistidos em SQLite.
Estas mudanças não criam pagamento, posição, giro ou saque; não mudam regras
de participação nem as telas aprovadas.

## Validação e limites
- O CI da branch é a fonte para aprovar ou reprovar os testes das mudanças.
  Não atribuir aprovação a este bloco antes de verificar o resultado do
  workflow específico no commit dos novos testes.
- Conservar PR #1 DRAFT, sem merge, deploy, chave de produção, uso de Pix
  verdadeiro, reversão automática de direitos, ou movimento bancário.
- Pendências externas reais: webhook enviado do Asaas por um canal autorizado,
  infraestrutura para recebê-lo com segurança, conciliação com liquidação
  bancária independente e custos/tarifas reais, análise jurídica/regulatória
  do modelo e liberação formal para produção. Os testes remotos não
  substituem essas etapas.
- Não executar novamente a carga inteira de 10.000 só para testar agendador:
  a regressão deve ser coberta por teste focal e suíte do CI.

## Próximo critério objetivo
Confirmar sucesso da suíte e navegador sobre estas correções; manter
monitoramento de exceções e filas `EXIGE_REVISAO` sem movimentação de saldo real.


## Monitoramento no Escritório e disputa entre fluxos
O monitor administrativo já existente `GET /api/admin/asaas-callbacks-lab`
passa a informar também `conciliacaoAutomatica` (último código de falha,
quantidade de falhas no agendador e aviso de telemetria em memória). Mantém
autenticação administrativa, somente leitura, `Cache-Control: no-store`,
sem alterações de interface ou saldo e sem novo endpoint público.

A regressão acrescentada ainda disputa o **mesmo** pedido entre a fila do
callback e a varredura automática concorrente; exige uma posição pendente
para o titular, integridade SQLite, chave estrangeira íntegra e nenhum giro.
Os testes injetam exceções deliberadamente para confirmar continuidade e
sanitização, sem credenciais de produção.

O índice vigente `LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md` recebeu a
correção documental de regras mais recentes (até dez posições ativas por
titular, até dez na Fila A com indicações específicas e no máximo duas
simultâneas no tabuleiro), preservando o histórico anterior.


## Resultado CI verificado — 01/11/2026
[GitHub Actions — versão de código com teste de concorrência](https://github.com/jjinvest/loop-app/actions/runs/41277297416):
**SUCCESS — 627 testes aprovados, zero falhas**, segundo o sumário do
`npm test` na execução. Também passaram `npm ci`, auditoria de dependências
de runtime e o roteiro Playwright/Chromium de Meus Pedidos no navegador.
As correções, o monitor read-only e a regressão de concorrência foram
executados nesse mesmo código. Os commits posteriores a essa execução
foram **apenas de documentação**, não de código-fonte.

Isto valida este bloco técnico na branch de laboratório; **não valida
callback realmente transmitido pelo Asaas ao endpoint do LOOP**, entrega
pública, liquidação bancária real ou prontidão jurídica de produção.
