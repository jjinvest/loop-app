# Escritório Virtual do LOOP — primeira prévia de laboratório

> Ambiente exclusivamente local, com titulares e posições 100% fictícios.
> Não existe cadastro real, CPF armazenado, compra, pagamento, saldo,
> saque, aceite jurídico ou interação com fornecedor nesta etapa.

## Objetivo e preservação da arquitetura

O **Escritório Virtual é uma área central do LOOP**, além da vitrine
comercial. Foi planejado para reunir histórico de participação,
posições em fila/tabuleiro, indicações, pedidos, comunicação direta
com a administração e, futuramente, atendimento apoiado por IA.
A interface inicial adicionada **não substitui a vitrine, o tabuleiro,
o motor de filas nem o painel administrativo**: é um módulo separado
de consulta com dados artificiais.

Arquivos novos:
- `src/domain/visao-escritorio-demo.js`: projeção somente leitura;
- `src/routes/admin-escritorio-demo.js`: rotas de demonstração restritas;
- `src/laboratorio/escritorio-demo.html`: página de consulta;
- `src/laboratorio/escritorio-demo.js`: carregamento da prévia;
- `src/laboratorio/escritorio-demo.css`: estilos responsivos;
- `test/escritorio-virtual-demo.test.js`: validação dos contratos e isolamento.

## Como abrir no computador de desenvolvimento

Preparar o servidor local seguindo `docs/PAINEL_ADMIN_LABORATORIO.md`.
Em um terminal com Node.js 22+, as variáveis de teste necessárias são:

```sh
export LOOP_ADMIN_CATALOGO_LOCAL=1
export LOOP_CATALOGO_DB="$HOME/loop-catalogo-teste.sqlite"
export LOOP_ADMIN_TEST_TOKEN="$(openssl rand -hex 32)"
npm run start:admin-demo
```

Em seguida, no mesmo computador, abrir:

`http://127.0.0.1:3001/admin/escritorio-demo`

Informar **somente a chave de teste criada naquele terminal**.
O valor não está no GitHub nem é guardado em cookie, URL ou
`localStorage`; sair limpa a chave da memória da página.
O servidor só escuta o endereço local `127.0.0.1`,
recusa hosts/origens externas e bloqueia a montagem
em `NODE_ENV=production`.

## O que a tela demonstra

Quatro contas fictícias, sem nomes pessoais ou CPF,
podem ser selecionadas para visualizar:
- Quantas posições simuladas continuam **ativas**;
- Quantas das cinco vagas disponíveis por titular
  estão livres para novas posições hipotéticas;
- Quantas posições estão **concluídas** no histórico;
- Identificadores fictícios de posições ativas,
  com indicação de fila A/B ou local no tabuleiro
  apenas como exemplos estáticos;
- Blocos explicativos sobre futuras áreas de
  indicações, pedidos, atendimento/IA,
  termos/aceite e valores.

Na conta fictícia A, há cinco posições ativas
e uma posição concluída no histórico: zero vagas
livres. Na conta fictícia B, há quatro posições
ativas e uma posição concluída: uma vaga livre.
Outras contas ilustram um ou zero lugares ativos.
Isso **não demonstra titulares reais nem contempla
compradores na vida real**.

### Limite confirmado

**Regra acordada:** até cinco posições **ativas
simultaneamente por CPF**. Uma compra validada
gera uma posição. Quando essa posição termina
o ciclo e é contemplada, **sai das posições
ativas**, permanece no histórico e abre uma
vaga para uma compra futura; o total de compras
históricas pode, portanto, superar cinco,
mas a capacidade ativa simultânea não.

A regra está documentada em
`docs/LIMITE_CINCO_COMPRAS_POR_CPF.md`.
Ainda não existe cadastro real nem verificação
de CPF; **nenhum bloqueio real foi ativado**.

## APIs locais e separação de dados

- `GET /api/admin/escritorio-demo`:
  quatro identificadores de contas fictícias.
- `GET /api/admin/escritorio-demo/:id`:
  resumo de uma conta fictícia, contador de
  vagas e histórico visual.

As duas rotas exigem autorização de
laboratório e enviam `Cache-Control: no-store`.
Não existem rotas de escrita para esse
módulo, e ele não foi montado em
`src/server.js`, o servidor público.

Este protótipo **não** consulta nem altera
as tabelas de pedidos fictícios, o catálogo,
as filas, a catraca, saldos ou repasses.
As indicações A/B exibidas na prévia são
meros dados estáticos — não se afirmou
que foram consultadas do motor de filas.

## Áreas planejadas ainda dependentes de aprovação

- Autenticação do participante, identidade
  verificada e proteção de dados pessoais;
- Histórico real de posições por titular
  com transações, concorrência e auditoria;
- Integração de pedidos da loja com o
  histórico do escritório;
- Atendimento humano e futuro assistente de
  IA, com permissões e transparência;
- Termos versionados e aceite verificável,
  após aprovação jurídica;
- Modelo financeiro, regras de benefícios
  e eventuais saques, somente após
  validação contábil, jurídica e técnica.

Não inferir novas regras de participação,
prioridade, pagamento ou cadastro enquanto
os responsáveis não confirmarem os detalhes.
