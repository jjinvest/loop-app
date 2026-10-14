# Importacao de catalogo de fornecedor - laboratorio (sem rede)

## Objetivo

Facilitar a entrada de muitos produtos de distribuidores no LOOP, preservando
a separacao entre integracao, vitrine, decisao de preco, fila e pagamento.

Esta etapa **nao usa a API real da Shopee nem a API da franquia**.
O adaptador e substituivel, e os testes usam listas ficticias em memoria.
A integracao depende da documentacao e autorizacao do fornecedor real.

## Contrato de integracao

O `RegistroFornecedores` continua com o contrato v1:
`consultarEstoque({sku})` e `consultarStatus({pedidoParceiroId})`.
Para importar catalogo, um adaptador **pode oferecer adicionalmente**
`listarProdutos()`, retornando um array de, no maximo, **100 produtos por lote**:

```js
[
  {
    sku: 'SKU_001',
    nome: 'Produto demonstrativo',
    descricao: 'Descricao comercial autorizada'
  }
]
```

Outros campos recebidos (custos do fornecedor, imagens remotas, tokens,
enderecos etc.) **sao ignorados**. Nao criamos imagens nem URLs externas
automaticamente. Uso de fotos do parceiro requer permissao e processamento
posterior em armazenamento de imagens seguro.

O fornecedor nao define o preco de venda para o cliente LOOP.

## Fluxo de laboratorio

1. O adaptador do fornecedor de teste apresenta uma lista em
   `listarProdutos()`.
2. O `ImportadorCatalogoSimulado.preparar({fornecedorId})` valida **todo
   o lote** e retorna uma lista de candidatos sem modificar o banco.
   Cada item recebe um identificador de produto estavel baseado no
   identificador de fornecedor e SKU, e o plano recebe `revisaoLote`.
3. Um operador de teste decide se importa. A chamada interna
   `aplicar({ fornecedorId, revisaoLote, confirmacao })` exige
   `confirmacao: 'IMPORTAR_RASCUNHOS_SIMULADOS'`.
4. Antes de gravar, o sistema recarrega o lote. Se o conteudo mudou
   desde a previa, recusa a operacao, exigindo nova revisao.
5. Cada novo produto entra como **RASCUNHO**, `precoCentavos: null`,
   `compraDisponivel: false`, sem fotos remotas.
6. Produtos que ja existem **nao sao sobrescritos**. Nenhuma edicao
   manual de preco, nome, descricao ou visibilidade e perdida.
7. O repositorio SQLite registra uma revisao inicial no historico de
   cada produto importado.

### Limites de confiabilidade

- Idempotencia por SKU+fornecedor: uma reimportacao nao cria novas
  entradas nem historico adicional para itens existentes.
- O lote e validado antes de qualquer gravacao; porem a aplicacao
  **ainda nao e uma transacao unica para todos os produtos**.
  Em falhas de banco, podem ser gravados apenas alguns rascunhos;
  uma nova importacao da mesma revisao completa os restantes.
- O identificador baseado em fornecedor+SKU e apropriado para **criar
  rascunhos de laboratorio**. Em producao, o vinculo entre produto LOOP
  e SKU de distribuidor devera ficar numa tabela independente para
  poder trocar de fornecedor sem trocar o identificador publico
  do produto.
- `revisaoLote` e uma impressao digital do conteudo, **nao e uma
  assinatura, autenticacao ou aprovacao juridica**. Nao confirma
  confiabilidade de API ou legitimidade de venda.
- Se um item ja existe, a importacao nao atualiza estoque ou preco
  automaticamente; isso exigira politicas separadas e conciliacao
  com o parceiro.
- O importador nao esta exposto em endpoints HTTP nem ligado ao painel
  administrativo de producao.
- Nenhum pedido e transmitido, nenhuma compra/pagamento e executada
  e nenhuma posicao de fila e criada.

## Proximas etapas quando a API da franquia estiver disponivel

1. Avaliar a documentacao, autorizacoes e limites tecnicos da API real.
2. Criar um adaptador especifico para o parceiro e credenciais protegidas
   exclusivamente no servidor.
3. Definir mapeamento persistente LOOP↔fornecedor/SKU, custos, impostos,
   disponibilidade, atributos e regras de sincronizacao com historico.
4. Construir revisao e confirmacao de importacoes pelo painel seguro
   de producao, com autenticao individual e auditoria.
5. Integrar pagamentos autenticados e envio idempotente de pedidos,
   **somente apos** validacoes tecnicas, comerciais e juridicas.

## Implementacao e testes

- `src/integracoes/importador-catalogo-simulado.js`
- `src/integracoes/registro-fornecedores.js`
- `src/domain/repositorio-catalogo-sqlite.js`
- `test/importador-catalogo-simulado.test.js`

Rodar `npm test` no repositorio para validar os contratos.
