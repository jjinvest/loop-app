# Vinculos de fornecedores por produto - laboratorio (SQLite v3)

## Motivo

Um produto LOOP precisa conservar seu ID, pagina e cadastro comercial
mesmo se o distribuidor mudar. O codigo SKU do fornecedor e um dado
**interno de integracao**, nao a identidade do produto nem um gatilho
de venda.

## Implementacao

`src/domain/vinculos-fornecedores-sqlite.js` oferece:
- `consultar({produtoId})`: consulta fornecedor/SKU ou indica ausencia.
- `vincular({produtoId,fornecedorId,sku,revisaoEsperada})`: cria ou troca
  o vinculo mediante revisao validada.
- `desativar({produtoId,revisaoEsperada})`: interrompe o vinculo sem
  excluir o produto.
- `historico({produtoId})`: registros sequenciais de vinculos,
  substituicoes e desativacoes.

Usa o MESMO banco SQLite local do catalogo, mas tabelas separadas.
O esquema foi migrado da versao v2 para **v3**, preservando catalogos
anteriores e os historicos de produtos. A criacao e a troca de vinculos
sao transacoes SQLite que tambem registram o evento historico.

## Limites e protecoes

- Somente produtos FISICOS podem receber vinculo externo; PDFs nao.
- Fornecedor/SKU aceitam apenas identificadores restritos e validados.
- Cada produto tem no maximo um vinculo ativo. O mesmo par
  (fornecedorId, SKU) nao pode estar associado simultaneamente a dois
  produtos do LOOP.
- Repetir a mesma vinculacao nao altera a revisao ou o historico.
- Vinculos novos ou alterados rejeitam revisoes antigas para impedir
  sobrescritas silenciosas.
- Triggers impedem UPDATE/DELETE comuns sobre o historico de vinculos.
  Isso nao protege contra um administrador malicioso do banco nem dispensa
  backups, identidade dos operadores, armazenamento seguro e auditoria.
- O produto original permanece inalterado: nenhum preco, foto,
  descricao, ordem de fila ou registro comercial e atualizado.
- Vincular nao significa que o parceiro autorizou pedidos ou que exista
  disponibilidade de estoque. O vinculo nao confirma pagamento e
  **nao cria posicoes** nas filas.
- Nenhuma API da franquia ou Shopee foi conectada. Nao existe
  checkout nem despacho de mercadoria.
- Esta camada agora pode ser usada pelo **painel administrativo
  isolado do laboratorio local**. A tela so mostra controles de
  fornecedor/SKU para produto fisico que ja foi salvo. A API usa a
  mesma chave de teste e as restricoes de localhost das demais rotas
  administrativas; ela nao e exposta pelo servidor publico.
- As operacoes internas `PUT /api/admin/produtos/:id/fornecedor`,
  `POST /api/admin/produtos/:id/fornecedor/desativar`,
  `GET /api/admin/produtos/:id/fornecedor` e
  `GET /api/admin/produtos/:id/fornecedor/historico` exigem
  autenticacao. Os registros nao aparecem em `GET /catalogo`.

## Proximas etapas

1. Ligar a importacao simulada a esse vinculo persistente sem perder
   edicoes e evitando duplicacoes, com tratamento de falhas parciais.
2. Quando a documentacao e as permissoes da franquia estiverem
   disponiveis, criar adaptador de integracao homologado por fornecedor.
3. Antes da operacao real: autorizacao comercial, seguranca financeira,
   verificacao legal, login administrativo forte, conciliacao e auditoria.

## Testes

`test/vinculos-fornecedores-sqlite.test.js` cobre troca de fornecedor
sem mudar o produto, desativacao, religacao, deduplicacao, revisoes
concorrentes, preservacao do historico, migracao SQLite v2->v3 e
bloqueio de vinculos em PDFs.

`test/admin-vinculos-laboratorio.test.js` verifica HTTP autenticado,
conflitos, troca e desativacao de fornecedor, e os controles locais da tela.
