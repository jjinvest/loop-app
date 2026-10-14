# LOOP — acompanhamento logistico de pedidos (simulacao local)

## Objetivo

Construir a base de acompanhamento de pedidos para a futura vitrine
dropshipping sem misturar tres assuntos diferentes: **venda/pagamento**,
**expedicao e entrega** e **posicoes nas filas do LOOP**.

Esta etapa usa dois pedidos com IDs ficticios e fornecedores inventados.
Nao ha cliente real, CPF, endereco, preco, numerario, nota fiscal,
rastreamento de transportadora, API de distribuidores, evento financeiro
confiavel ou webhook. Nenhuma posicao e criada na fila.

## Estados de teste

Cada pedido de laboratorio passa, quando aplicavel, pelas seguintes etapas:

1. `AGUARDANDO_CONFIRMACAO`
2. `CONFIRMADO_SIMULADO` — nao e comprovante de pagamento real
3. `ENVIADO_FORNECEDOR` — fornecedor ficticio
4. `EM_SEPARACAO`
5. `EM_TRANSPORTE`
6. `ENTREGUE`

Em pedidos de laboratorio pode ser registrada uma `OCORRENCIA`
(ex.: suspeita de extravio), retomado o transporte ou aberta uma
solicitacao de cancelamento, com `CANCELAMENTO_SOLICITADO`
e posterior `CANCELADO`. **Mesmo depois de `ENTREGUE`**, o simulador
admite `SOLICITAR_DEVOLUCAO` e `CONFIRMAR_DEVOLUCAO`, passando por
`DEVOLUCAO_SOLICITADA` e `DEVOLVIDO`. Essa estrutura nao restringe
nem substitui direitos legais do consumidor.

Reembolso tem **estado independente**:
`NAO_SOLICITADO`, `SOLICITADO_SIMULADO`,
`REGISTRADO_SIMULADO`. Um registro de reembolso **nao envia dinheiro,
nao define valor a devolver e nao valida retencao contratual**.
O sistema de producao devera implementar reembolsos e cancelamentos
conforme as obrigacoes legais e condicoes especificas de cada pedido,
incluindo quando houver direito a devolucao integral.

## Persistencia e auditoria

O modulo `src/domain/pedidos-logisticos-simulados-sqlite.js`
usa um SQLite independente do catalogo e do motor das filas.
Tem revisao otimista, lista de eventos admitidos, historico por pedido,
deduplicacao por `eventoId` para o uso programatico e triggers para
impedir UPDATE/DELETE comuns sobre eventos. Erros e mudancas invalidas
nao devem alterar estado ou deixar historico ficticio.

O modulo pode persistir em arquivo de teste externo ao projeto:
`new PedidosLogisticosSimuladosSQLite({caminho:'/tmp/logistica-demo.sqlite'})`.
Esse caminho e somente ilustrativo, nao uma configuracao de producao.
A trilha SQL **nao e antifraude diante de administrador do banco**.

## Painel administrativo local

A tela em `/admin`, iniciada com `npm run start:admin-demo`
e a chave do laboratorio, recebeu a secao **Acompanhar pedidos —
demonstracao**, com dois pedidos ficticios. Ali, o operador pode
consultar status, selecionar o proximo evento de teste e ver o historico.

As rotas `GET /api/admin/pedidos-demo`,
`GET /api/admin/pedidos-demo/:id/historico` e
`POST /api/admin/pedidos-demo/:id/eventos` sao limitadas ao laboratorio
local protegido. O backend valida que o ID pertence a um dos dois
pedidos ficticios e que o evento pertence a uma lista restrita.
O modo `NODE_ENV=production` desabilita as rotas administrativas.
**Nao existe endpoint publico para pedidos simulados.**

Por seguranca, **a tela usa SQLite em memoria e reinicia esses
dois pedidos a cada execucao do servidor**. O suporte a persistencia
em arquivo e testado diretamente no modulo, mas ainda nao e
conectado ao painel local.

## O que falta antes de operacao real

- Pedido comercial e cliente autenticado, com protecao de dados e LGPD.
- Confirmacao assinada e conciliada do provedor de pagamentos.
- Adaptador oficial do fornecedor autorizado a receber pedidos externos.
- Envio idempotente e duravel das ordens, com tratamento de retentativas,
  status de despacho, rastreio e ocorrencias reais.
- Logistica reversa, devolucoes, arrependimento, trocas, reembolsos
  efetivos e regras de estorno legalmente validas.
- Integridade entre compras, posicoes, cancelamentos e motor de filas,
  condicionada a avaliacao juridica e de risco do modelo.
- Permissoes de administrador, backups, auditoria individual e
  monitoramento em producao.

## Testes

`test/pedidos-logisticos-simulados.test.js` valida o dominio,
e `test/painel-pedidos-logisticos-demo.test.js` verifica HTTP
autenticado, interface, tentativas invalidas, status e ausencia
de pedidos ou pagamentos reais.
