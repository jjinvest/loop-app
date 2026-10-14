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
5. No SQLite de laboratorio, **cada novo produto RASCUNHO e seu vinculo
   fornecedor/SKU** sao salvos com seus respectivos historicos na mesma
   transacao. O produto nao tem preco nem fotos remotas e nao habilita
   checkout.
6. Produtos que ja existem **nao sao sobrescritos**: nenhuma edicao
   manual de preco, nome, descricao, visibilidade ou fornecedor e perdida.
   Se o vinculo esta ausente ou mudou, a previa mostra
   `VINCULO_PENDENTE` e o resultado contabiliza `pendentesVinculo`.
   O operador revisa esses casos pelo painel; a importacao nao associa
   automaticamente um produto preexistente sem autorizacao.
7. O repositorio SQLite registra o historico de criacao do produto
   e o historico inicial do vinculo em revisoes independentes.

### Limites de confiabilidade

- Idempotencia por SKU+fornecedor: uma reimportacao nao cria novas
  entradas nem historico adicional para itens existentes.
- No repositorio SQLite de laboratorio, o lote inteiro (produtos novos,
  vinculos e historicos) agora e gravado **numa unica transacao**.
  Se um SKU estiver reservado a outro produto ou ocorrer erro de banco,
  tudo e revertido. Repositorios alternativos que nao usam SQLite
  continuam no fluxo legado **sem transacao unificada e sem vinculo
  automatico**, exclusivamente de laboratorio.
- O identificador inicial e derivado de fornecedor+SKU somente para
  criar rascunhos de laboratorio. O vinculo real fica em **tabela
  independente** (SQLite v3), podendo ser trocado pelo administrador
  sem alterar o ID publico do produto. Em producao, a identidade
  comercial sera persistida independentemente do fornecedor desde o inicio.
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
3. Evoluir o mapeamento persistente LOOP↔fornecedor/SKU ja existente
   no laboratorio para custos, impostos, disponibilidade, atributos,
   sincronizacao e validacao comercial.
4. Construir revisao e confirmacao de importacoes pelo painel seguro
   de producao, com autenticao individual e auditoria.
5. Integrar pagamentos autenticados e envio idempotente de pedidos,
   **somente apos** validacoes tecnicas, comerciais e juridicas.

## Implementacao e testes

- `src/integracoes/importador-catalogo-simulado.js`
- `src/integracoes/registro-fornecedores.js`
- `src/domain/repositorio-catalogo-sqlite.js`
- `src/domain/vinculos-fornecedores-sqlite.js`
- `src/integracoes/aplicador-lote-catalogo-sqlite.js`
- `test/importador-catalogo-simulado.test.js`
- `test/importador-vinculado-sqlite.test.js`

Rodar `npm test` no repositorio para validar os contratos.
