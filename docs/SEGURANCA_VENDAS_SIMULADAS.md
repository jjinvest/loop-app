# Seguranca do prototipo: compras, filas e confirmacoes simuladas

## Estado atual

O LOOP permanece um **prototipo de laboratorio**. Nao recebe dinheiro,
nao valida pagamentos de verdade, nao confere CPFs e nao permite resgates.

### Rotas HTTP

- `GET /filas`: somente nomes das filas e quantidade agregada. **Nao** expor lista de participantes, timestamps ou dados pessoais.
- `POST /filas/*` e `POST /catraca/*`: **negados por padrao com HTTP 403**.
- Para testes locais apenas, usar `LOOP_MODO_SIMULACAO=1` com `NODE_ENV` diferente de `production`, exclusivamente por conexao do proprio computador (`127.0.0.1` ou `::1`).
- Mesmo que `LOOP_MODO_SIMULACAO=1`, o modo `NODE_ENV=production` mantem todos os POSTs bloqueados.
- Essa flag NAO autentica administradores nem clientes, e jamais deve ser usada para disponibilizar testes na Internet.

### Confirmacao de pedidos (nao publico)

`src/domain/processador-pedidos-simulados.js` e **somente um modelo interno**.

1. Recebe exclusivamente `simulacaoId` e `pedidoId`; nao aceita status de pagamento, valor ou participante do cliente.
2. Consulta `consultarPagamentoConfiavel(pedidoId)`, funcao injetada pelo ambiente de teste.
3. Se a resposta nao for `CONFIRMADO_SIMULADO` ou nao corresponder ao pedido consultado, nenhum estado e alterado.
4. Uma venda confirmada simulada gera **exatamente uma posicao**, independentemente do preco do produto.
5. O identificador da venda impede repeticao da mesma compra apos restart do SQLite.
6. Caso outra instancia tenha salvado o mesmo estado, o processador recarrega e tenta novamente sem sobrepor dados novos.
7. O pedido continua associado ao participante original no snapshot; uma resposta posterior discordante e recusada.

**Importante:** `CONFIRMADO_SIMULADO` **NAO e** comprovante financeiro,
a assinatura de evento real nem confirmacao de uma operadora de pagamento.

O modelo depende de **um verificador interno confiavel**. Esse verificador
ainda NAO foi implementado e nenhuma chave secreta/webhook foi configurado.

### Requisitos antes de producao

- Validar comercializacao de produtos reais, entrega de cursos PDF e politica de estorno.
- Reavaliar juridicamente e contabilmente o modelo de indicacoes, prioridades e contemplacoes, inclusive regulacao brasileira aplicavel, publicidade e protecao do consumidor. **Nao apresentar retornos como garantidos** sem comprovacao e parecer especializados.
- Integrar um provedor de pagamento autorizado, autenticando assinaturas dos webhooks e confirmando pagamentos pelo backend.
- Usar idempotencia e integridade referencial no banco definitivo, com auditoria de eventos de venda, pedido, devolucao e cancelamento.
- Vincular usuarios autenticados as posicoes, aplicar LGPD, controles de acesso, logs e politica de retencao.
- Implementar estornos, chargebacks e reversoes de posicao conforme regras acordadas e juridicamente validadas.
- Realizar revisao de seguranca independente, auditoria do calculo de contemplacoes e testes de carga/concorrencia.
- Nao disponibilizar os endpoints de simulacao e snapshots para usuarios finais.
