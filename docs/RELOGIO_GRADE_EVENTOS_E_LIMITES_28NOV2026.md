# Relógio: programação, marcos e registros — 28/11/2026

Base conferida antes das alterações: `7755d45ab5498d77762f5ec05a4431ab1ebbda9b`, branch oficial `feature/unificar-escritorio-real-20261105`. Missão expressa do proprietário: corrigir relógio, representação e conexões internas. START continua sendo comando exclusivo dele.

## Causas comprovadas

1. O resumo do formulário consulta a programação oficial em `OperacaoCatracaAdminSQLite`, mas o visor do lote descartava a próxima luz quando `catracaAtiva=false`. Assim, uma programação válida de 02:00–02:30, 15 centros, 90 luzes, podia aparecer como `--:--`. A previsão não depende de START; a execução depende.
2. A decisão de execução exigia um intervalo mínimo entre leituras efetivas além da grade salva. Se uma luz era processada às 02:00:20.900 e a próxima consulta chegava às 02:00:40.100, o segundo marco legítimo era negado por terem transcorrido apenas 19,2s. O resultado era perda de luzes e de centros previstos. Agora os identificadores temporais dos marcos governam a cadência, preservando idempotência e impedindo recuperação em rajada após START/retomada.
3. A consulta financeira do lote não repassava os giros do dia à mesma política usada pela execução. Agora os contadores são obtidos do snapshot/livro persistido e o mesmo limite é representado. Meta ou limite atingidos não anunciam mais uma próxima luz executável.
4. Os cartões superiores do lote ficavam sem o total diário e a meta. Agora recebem eventos registrados do dia e ciclos concluídos, com denominador `meta × 6`; a programação é mostrada no texto existente do visor, sem redesenho.

## Correções e caminhos

- `src/domain/politica-execucao-distribuicao-loop.js`: autorização por marco da grade, sem confundir frequência de consulta com intervalo operacional; previsão encerrada ao atingir meta/limite.
- `src/producao/bancada-modulos-loop-sqlite.js`: contadores do livro de lançamentos por dia civil de Brasília e janela de 24h, ciclos do snapshot, consulta coerente com a autorização de execução.
- `src/shared/visor-catraca.js`: previsão visível mesmo aguardando START, estado continua PAUSADA, cartões mostram registros efetivos do lote.
- `src/producao/interface-aprovada-contas.js`: meta, data e contadores da fonte atual enviados ao visor; resumo do lote explica dependência de START em vez de atribuir seu bloqueio a caixa bancário.

Nenhuma alteração de CSS, moldura ou desenho. Não há outro motor, saldo artificial, nova conta ou mecanismo de pagamento.

## Prova da programação da foto

`test/relogio-fluxo-grade-financeiro.test.js` cria dois arquivos SQLite temporários: agenda oficial e lote isolado. Grava 28/11/2026, 02:00–02:30, 15 centros. Antes de START: próxima luz 02:00:20, zero eventos e catraca parada. A execução ocorre somente no teste isolado.

A prova aplica 90 marcos com oscilação de 900ms/100ms, encerra e reabre ambos os arquivos durante a sequência e comprova:

- 90 eventos, 15 giros, nenhuma repetição por consulta duplicada.
- Três lançamentos de R$250 vinculados ao identificador do primeiro centro, total R$750.
- Caixa restante R$227.500, preservando soma dos destinos e caixa em R$250.000.
- Eventos diários e de 24h iguais a 90; ciclos diários iguais a 15.
- Meta atingida permanece bloqueada após reprogramar fechamento, sem evento adicional.
- `PRAGMA integrity_check=ok`.
- Visor antes de START mostra 09:20 restantes até 02:00:20 quando consultado às 01:51; título PAUSADA, cartão 0/90, sem executar eventos.

As provas existentes cobrem pausa/retomada, reprogramação sem rajada, leitura da mesma agenda nos dois perfis, filas independentes e bônus pagos exclusivamente pela reserva coberta.

## Fronteira que não pode ser ocultada

O lote de mil posições continua em `/dados-reais/testes-modulos.sqlite`; seus participantes P001 etc. não são contas comerciais. Os lançamentos e os destinos pertencem ao livro desse lote. Eles não podem ser copiados às carteiras de titulares reais sem vínculo legítimo de compra/posição/identidade. Nenhuma correção de relógio, chave bancária ou previsão resolve essa diferença por si só.

A composição de contas comerciais mantém sua fonte de identidade/motor e livro financeiro, com as proteções de conciliação e autenticação existentes. Não foi liberado pagamento externo nem fabricado crédito em contas. Assim, esta prova certifica o relógio e os lançamentos internos do lote; não certifica depósito no escritório de uma conta comercial ou integração bancária. A interface do cliente continua lendo a mesma programação oficial, sem acesso ao livro administrativo do lote.

Nenhum START, abertura de porteira, lançamento ou alteração de produto/conta foi enviado ao ambiente publicado nesta missão. A conferência operacional após publicação deve ser comandada pelo proprietário.

## Regressão e integridade

`node --test --test-concurrency=4`: 1.786 testes aprovados, zero falhas/ignorados. Manifesto de proteção: 930 arquivos íntegros.

Regressão de navegador do formulário existente: perfis celular e computador aprovados, zero erros JavaScript. Essa prova não é um teste de login ou pagamento no celular particular do proprietário.

SHA256 relogio-regressao-final.log: `98f254368bce4a66de048f530434b819c6940c98295c89e8685ba5f39538a468`.

SHA256 relogio-browser-mobile.log: `a81e309c44879731b0cfc46fd9a7c6f3fe74524cbf4cb7a4a955837d496f20e2`.

SHA256 relogio-browser-pc.log: `a81e309c44879731b0cfc46fd9a7c6f3fe74524cbf4cb7a4a955837d496f20e2`.
