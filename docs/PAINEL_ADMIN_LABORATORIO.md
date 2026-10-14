# Painel administrativo local do catálogo LOOP (laboratório)

## Situação

Esta é uma **primeira interface experimental** para cadastrar e editar os
modelos de produtos físicos de fornecedores integrados e cursos em PDF.
**Ainda não é a administração segura de produção.**

O painel é servido por um **servidor separado**, não faz parte do
`npm start` público do LOOP e não é disponibilizado na Internet.

## Como preparar no computador de desenvolvimento

Requisitos: Node.js 22+, `npm ci`, terminal local, banco vazio fora do
repositório, e chave aleatória com 32 caracteres ou mais.

Exemplo no Linux/macOS (não usar clientes reais):

```sh
export LOOP_ADMIN_CATALOGO_LOCAL=1
export LOOP_CATALOGO_DB="$HOME/loop-catalogo-teste.sqlite"
export LOOP_ADMIN_TEST_TOKEN="$(openssl rand -hex 32)"
npm run start:admin-demo
```

Depois, abrir **http://127.0.0.1:3001/admin** no navegador do **mesmo
computador**. Para usar o formulário, informar a chave criada na variável
`LOOP_ADMIN_TEST_TOKEN`. A chave é mantida somente na memória da página,
não é enviada no código, não é salva em cookies ou `localStorage`.

O site de teste compartilha o mesmo `RepositorioCatalogoSQLite` com a
vitrine `GET /catalogo`, mas preserva as regras de não habilitar compras.
O arquivo SQLite permanece no computador local e é ignorado pelo Git.

## Operações preparadas

- Criar produto físico (entrega prevista por fornecedor integrado) ou PDF.
- Editar identificadores de descrição, preço, características e caminho de
  até 10 fotos, além de URL opcional de apresentação por YouTube/Vimeo.
- Marcar como `RASCUNHO` (invisível) ou `DEMONSTRACAO` /
  `PUBLICADO` (visíveis **sem checkout**).
- Reabrir o banco e continuar de onde parou.
- Rejeitar atualização antiga com HTTP 409, evitando sobrescrever edição
  de outra pessoa sem aviso.
- Consultar em **Histórico de alterações** as revisões, datas e campos
  modificados. A criação e cada edição gravam uma linha no histórico
  na **mesma transação SQLite** que altera o produto.
- O histórico só está acessível pela API local autenticada
  `GET /api/admin/produtos/:id/historico`; não fica na vitrine pública.
- Bancos antigos de laboratório com esquema v1 migram para **v2**:
  cada produto existente ganha o marco `IMPORTADO_V1` na revisão atual;
  o sistema **não inventa versões antigas que nunca foram registradas**.
- Disparadores SQLite impedem atualizar/apagar diretamente linhas do
  histórico por operações comuns. Isso **não é à prova de adulteração**
  por quem administra o banco: produção requer backups, permissões,
  identidade do operador e auditoria externa.
- O identificador do produto não é alterado após o cadastro. Não existe
  exclusão direta nesta etapa; voltar a rascunho retira da vitrine.
- **Não há upload de fotos**; o formulário aceita apenas caminhos locais
  autorizados de imagens já armazenadas em `/imagens/catalogo/`.
- O cliente nunca vê rascunhos, chaves, custos internos ou revisões.

## Bloqueios presentes

- Painel ativado somente com `LOOP_ADMIN_CATALOGO_LOCAL=1`.
- Servidor escuta somente `127.0.0.1` e recusa Host/Origin externos.
- Credencial de laboratório em header `Authorization: Bearer`, com
  comparação resistente a variações de tempo.
- Ambiente `NODE_ENV=production` bloqueia painel e rotas.
- Corpo de requisição limitado a 16 KiB e JSON obrigatório para escrita.
- CSP restritiva no painel; dados são mostrados com `textContent`.
- Nenhuma chave API, senha ou CPF deve ficar no GitHub nem no catálogo.

Essas proteções são apropriadas **para ensaios locais somente**. Um painel
administrativo real precisará login por identidade, MFA, sessão segura,
controle de permissões, auditoria com identidade de cada operador, proteção CSRF, política
de upload de arquivos, operação com HTTPS e revisão de segurança.

## Arquitetura para futura troca

`src/routes/admin-catalogo-laboratorio.js` recebe uma implementação de
repositório com `listar(), buscarRegistro(), salvar(), atualizar()`
e, para auditoria, `historico(id)`.
`src/routes/catalogo.js` usa `listar(), buscar()`. Assim a loja e o
administrador podem compartilhar **uma mesma fonte de dados substituível**.
A próxima versão pode usar PostgreSQL ou outro banco sem alterar os nomes
e endereços das páginas da vitrine.

Arquivos:
- `src/laboratorio/servidor-catalogo.js`
- `src/laboratorio/painel-catalogo.html`
- `src/laboratorio/painel-catalogo.css`
- `src/laboratorio/painel-catalogo.js`
- `src/routes/admin-catalogo-laboratorio.js`
- `test/painel-admin-laboratorio.test.js`
- `test/auditoria-catalogo.test.js`

**Sem integração com Shopee/distribuidores, sem checkout, sem entrega de
PDFs, sem cadastro de usuários reais e sem pagamentos.**
