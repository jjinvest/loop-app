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

## Bloco incremental: fila vencida, lease e codigos de erro seguros (01/11/2026)
Sem repetir a carga de 10.000 clientes e sem mudar interface, regras ou pagamentos:
- O monitor administrativo existente `GET /api/admin/asaas-callbacks-lab` agora devolve `pendentesProntos`, `leasesExpirados` e `referenciaFilaEmMs` no resumo, com SQL somente leitura. São sinais operacionais extraidos da fila SQLite; consultar o monitor nao reserva job, nao cria posicao e nao executa webhook.
- A persistencia de `e.codigo` passou a aceitar somente uma lista explicita de codigos internos esperados, em vez de confiar em um padrao de caracteres. Erros arbitrarios de adaptadores/PSP sao salvos como `FALHA_TECNICA_RECONSULTA`, sem mensagem/segredo.
- Novo `test/asaas-monitor-callback-leases-lab.test.js` valida aviso sem job, lease expirado e recuperado, retentativa pronta, monitor autenticado sem escrita, nenhuma posicao duplicada, integridade SQLite, CPF/adesao nao autoativados e erro com codigo privado ocultado.
- Evidencia do ultimo commit de codigo `1dcc978e7e36ab20f004e2661c94f77d6e26710b`: [GitHub Actions CI e navegador](https://github.com/jjinvest/loop-app/actions/runs/41278214311) — **SUCCESS, 630/630 testes, 0 falhas**, `npm ci`, `npm audit --omit=dev` e Playwright/Chromium aprovados. Falha temporaria em CI de commit anterior `bcf44c2` era exclusivamente um nome incorreto de instancia no novo teste; corrigida e validada neste commit.
- Permanecem limites de laboratorio: sem callback emitido pelo Asaas remoto, sem conciliacao bancaria independente, sem dinheiro real ou autorizacao de producao. PR #1 DRAFT, sem merge/deploy.


## Isolamento de falhas por pedido — bloco seguinte (01/11/2026)
- Corrigido o agendador `src/domain/conciliacao-automatica-asaas-sandbox-lab.js`: falha síncrona/assíncrona no observador `aoErro` não interrompe o processamento de outros pedidos na mesma rodada. Falha na consulta de status durante a recuperação também deixa de bloquear os demais; ambos os casos geram apenas o código fixo sanitizado `FALHA_INTERNA_AGENDADOR`, em memória.
- Três novos testes unitários em `test/asaas-conciliacao-isolamento-falhas-lab.test.js` e um teste HTTP/SQLite em `test/asaas-conciliacao-isolamento-http-sqlite-lab.test.js`: um pagamento pendente e outro confirmado de titulares distintos, erro do observador, recuperação posterior, integridade SQLite, duas posições únicas, nenhuma ativação ou giro automático.
- Evidência: [GitHub Actions 41278676000](https://github.com/jjinvest/loop-app/actions/runs/41278676000) — **SUCCESS, 634/634 testes, zero falhas**, auditoria de dependências e navegador Playwright/Chromium aprovados, código no commit `787eb152c1589b7f31152c59856c9644f09b4908`.
- Este ensaio não equivale a webhook remoto do Asaas, à liquidação bancária ou à liberação para produção. A telemetria ainda é de memória e a fila de callback permanece persistida em SQLite. PR #1 DRAFT; sem merge/deploy ou movimentação bancária.


## Lotes limitados e equidade na conciliação periódica (01/11/2026)
- `ConciliacaoAutomaticaAsaasSandboxLab` agora limita as reconsultas externas por rodada a **20 pedidos** por padrão (configurável de 1 a 100 no laboratório), sem descartar pendências em memória. Os pedidos ainda pendentes passam ao fim da sequência após a tentativa, permitindo que os demais sejam atendidos em rodadas posteriores. Não muda a fila persistida de callbacks, nem coloca qualquer valor em saldo real.
- Três testes adicionados em `test/asaas-conciliacao-lotes-equidade-lab.test.js`: mais pedidos que a cota por rodada, pendente persistente sem bloquear os próximos, limite inválido rejeitado. As rotinas anteriores de falha do observador também continuam protegidas.
- [GitHub Actions 41278944517](https://github.com/jjinvest/loop-app/actions/runs/41278944517) para o commit de código `fb3b2762d62e315b0874c6b3d335232a4acb1442`: **SUCCESS — 637 testes aprovados, zero falhas**; `npm ci`, `npm audit --omit=dev` e navegador Playwright/Chromium aprovados.
- Limites: conciliação local de laboratório e consulta ao PSP fictício nos testes; não houve webhook remoto emitido pelo Asaas nem liquidação financeira bancária. A leitura de pendentes ainda pode reunir todos os IDs conhecidos em memória; o novo limite se aplica às **reconsultas por rodada**, não à cardinalidade da lista. PR #1 DRAFT, sem merge/deploy.


## Paginacao da descoberta SQLite e custo de fila (01/11/2026)
- Corrigida a varredura SQL ilimitada da montagem do conciliador automatico: agora procura no maximo **20 cobrancas ainda nao integradas por consulta**, com cursor circular em `pedido_id`, retornando ao inicio depois do fim da faixa. O cursor e apenas memoria local; os pedidos permanecem no SQLite e sao redescobertos apos reinicio.
- O agendador tambem deixou de copiar o `Set` inteiro de pendentes para selecionar uma rodada: materializa apenas ate o limite configurado, 20 por padrao. A reconsulta de recebimentos antigos permanece independente (maximo 20 por consulta, intervalo de 60 segundos); reversoes ainda exigem revisao.
- Tres testes novos: 53 cobrancas em paginas de 20 sem escrita, insercao fora da posicao atual do cursor recuperada na volta e fila de 5.000 IDs com duas rodadas de 20 sem duplicacao.
- [CI + navegador 41279279477](https://github.com/jjinvest/loop-app/actions/runs/41279279477) — **SUCCESS, 640/640 testes, zero falhas**, `npm ci`, `npm audit --omit=dev` e Playwright/Chromium aprovados. Codigo no commit `1d03da8e32658d91b1098c39743344be03fbe527`.
- Limite que continua: `Set` de pendentes nao tem cota global de tamanho; esta melhoria elimina a leitura SQL total a cada pulso e a copia global por rodada, mas nao constitui teste de 10.000 conexoes simultaneas, webhook emitido remotamente ou liquidacao bancaria real. PR #1 DRAFT, sem merge/deploy.


## Prioridade reservada para revisoes de estorno sob carga — 01/11/2026
- Corrigido risco operacional: a fila crescente de cobrancas ainda pendentes consumia todo o lote da conciliacao periodica e podia atrasar rechecagens de recebimentos ja integrados, inclusive estornos tardios sem callback remoto recebido.
- `ConciliacaoAutomaticaAsaasSandboxLab` agora aceita uma fonte separada `listarRecebimentos` e reserva ate **5 de 20 consultas** por rodada para recebimentos ja integrados (cota configuravel de 1 ate o limite total). Os demais slots atendem pedidos pendentes; IDs duplicados entre fontes sao processados uma so vez por rodada. Falha da fonte prioritaria nao interrompe a fila normal.
- `montagem-integracao-asaas-sandbox-loop-lab.js` separa a descoberta paginada de pendentes da consulta somente leitura dos recebimentos antigos, mantendo filtro de 60 segundos e maximo de cinco revisoes por rodada. Estorno comunicado pelo Sandbox entra em `REVERSAO_INFORMADA_SANDBOX`; nenhuma posicao e apagada, nenhum saldo ou Pix real e movimentado.
- Cinco testes adicionados em `test/asaas-prioridade-reversoes-conciliacao-lab.test.js`: backlog com prioridade e teto, evento repetido, falha do observador/fonte, validacao de configuracao e prova HTTP/SQLite de compra integrada, reversao posterior sob 41 pendentes ficticios, posicao preservada, sem duplicacao, integridade SQL.
- **CI [41279751984](https://github.com/jjinvest/loop-app/actions/runs/41279751984): SUCCESS, 645/645 testes, 0 falhas**, auditoria de dependencias e navegador aprovados, codigo em `6dd395f42afaa01286c6b5c690f6da850a3c4808`.
- Limites: deteccao de reversao por consulta pode ter latencia; sem webhook enviado remotamente pelo provedor, sem extrato bancario independente e sem aptidao de producao. PR #1 DRAFT; sem merge ou deploy.
