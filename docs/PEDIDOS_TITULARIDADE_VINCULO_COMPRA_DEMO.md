# LOOP V5 — titularidade de pedido anterior a confirmacao de compra

> Laboratorio interno, **sem transacoes ou clientes reais**.

## Regras preservadas

Uma compra somente gera uma posicao B depois que o verificador
INJETADO NO PROCESSO retornar `CONFIRMADO_SIMULADO`, e cada
pedido confirmado gera no maximo uma posicao. O motor de filas e
tabuleiro nao foi alterado. Indicacao exige o primeiro pagamento
ficticio confirmado do convidado; mais compras da mesma pessoa
nao geram mais indicacoes. Limite de cinco posicoes ativas por
conta do teste, nao por CPF.

## Novo vinculo de identidade

`src/domain/pedidos-titularidade-demo-sqlite.js` oferece:

- `preparar({pedidoId,contaId,produtoId,valorCentavos})`
  apenas via scripts/testes do servidor, antes da confirmacao.
- Cada pedido fixa irrevogavelmente titular (conta ficticia
  cadastrada), produto, valor em centavos, momento de preparacao
  e identificador de intento de pagamento gerado por criptografia.
- Repetir a mesma preparacao retorna o mesmo intento; tentar
  usar o mesmo ID de pedido com outro titular, produto ou valor
  falha. Triggers SQL impedem editar ou apagar o registro.
- `conferir(comprovante)` rejeita pedido ausente, divergencia
  de titular/produto/preco/intento e confirmacao anterior
  a preparacao do pedido. A hora confirmada ainda vem da
  funcao interna de verificacao, **nunca do navegador**.

`PonteComprasConvitesDemoSQLite` suporta a dependencia
`pedidosIdentificados`. Quando configurada, confirma o
vinculo de pedido dentro da mesma transacao `BEGIN IMMEDIATE`
que cria compra, posicao e indicacao. A tabela adicional
`admin_ponte_vinculos_identificados_demo` guarda 1:1
pedido↔intento unico, com integridade referencial e
triggers de imutabilidade. Falhas desfazem toda a transacao.

O servidor de laboratorio configura a dependencia, mas
**nao oferece POST, webhook real, consulta ou rota HTTP
para criar pedido ou confirmar pagamento**. A visao do cliente
e do admin e somente de leitura.

## Reproducao

O script local opt-in `npm run demo:convites` agora
prepara primeiro tres pedidos ficticios para tres contas
inventadas e so depois simula tres confirmacoes de pagamentos
com seus intentos correspondentes.

Teste automatizado `test/pedidos-titularidade-ponte-demo.test.js`:
conflito de titularidade, idempotencia, pedido sem cadastro
ou sem preparacao, comprovante adulterado, horario retroativo,
reuso de intento, compra unica, convite valido, rollback de
vinculo, triggers imutaveis e reinicio do banco. Os testes do
script tambem verificam 3 pedidos identificados e 3 vinculos
gravados.

## Importante: ainda falta antes de abrir as vendas

Esta simulacao **nao valida CPF, legitimidade do pedido,
integridade real de precos/custos do catalogo, recebimento
bancario, antifraude, entrega ou estorno**. Ainda sao
necessarios:
- cadastro/identidade juridicamente e tecnicamente validados;
- pedido real com origem autenticada e precos do catalogo;
- PSP integrado (assinatura verificada, webhooks idempotentes,
  conciliacao de faturas e chargebacks);
- revisao juridica, contabil e LGPD, inclusive regras
  da contemplacao;
- testes independentes de seguranca e operacao.

Nada nesta etapa habilita pagamentos reais nem autoriza
ativar fila/catraca em ambiente publico.
