# LOOP — ponte de compras e convites no laboratorio (15/10/2026)

> Cenario EXCLUSIVAMENTE FICTICIO. Nenhum CPF, PSP real,
> checkout, estorno, saque, vantagem financeira ou entrega.
> Jamais anunciar essa ponte como prova de funcionamento financeiro real.

## Regras que a ponte conserva

- Cada **pedido de teste confirmado por verificador interno** gera
  exatamente uma posicao na fila **B**, independente do preco do produto.
- Cadastro sem compra confirmada nao gera posicao ou indicacao valida.
- O primeiro pedido confirmado do convidado por um link associado
  valida UMA indicacao para a pessoa que convidou.
- Compras futuras do MESMO convidado podem criar novas posicoes,
  mas **NAO validam a mesma indicacao novamente**.
- O indicador com posicao B e convite validado passa para a fila A
  com todas suas posicoes ainda em B. A ordem de fila A continua
  definida pelo motor, nao por esta ponte.
- Se um convidado compra antes do indicador, seu convite validado
  fica armazenado e sera aplicado na fila A quando o indicador
  tiver a propria primeira posicao confirmada.
- Limite de **cinco posicoes ATIVAS por titular ficticio** aplicado
  antes de gravar cada pedido. Nao existe CPF coletado; em
  producao sera necessario limite por CPF verificado, atomicamente.
- A ponte nao preenche tabuleiro, nao inicia ciclo nem gira catraca:
  mantem os comportamentos anteriores sob controle do motor.
- O mesmo pedido e idempotente. Tentativa posterior de trocar
  titular, produto, preco ou horario confirmado e bloqueada.
- Nenhuma das partes possui API publica ou endpoint HTTP para
  declarar um pedido como `CONFIRMADO_SIMULADO`.

## Limite de confianca da arquitetura

`src/domain/ponte-compras-convites-demo-sqlite.js` recebe
`consultarPagamentoConfiavel(pedidoId)` por injecao **no Node.js**
e so processa `CONFIRMADO_SIMULADO` com dados de conta,
preco e horario vindos da funcao interna, nao do navegador.
O banco de laboratorio armazena recibo ficticio, vinculo com
a posicao e convite associado em transacao SQLite IMMEDIATE
com o snapshot de `SimuladorLoop`.

Uma falha no meio reverte a transacao inteira. O livro de
compras e o livro de convites aceitos possuem triggers
que impedem UPDATE e DELETE comuns. O snapshot e restaurado
pelo validador de estados existente antes de cada nova compra.

O servidor HTTP **so expoe LEITURA** via
`GET /api/admin/ponte-compras-convites-demo`,
sob o token e o endereco local do painel. Nao ha rota POST
para rodar o verificador nem para fazer a transicao.
A tela `/admin/cadastro-participantes-demo` mostra,
somente por consulta, quantas compras ficticias, convites
validados e posicoes A/B existem.

## Testar um ciclo de convites na tela

Para preparar dados de exemplo com **tres contas ficticias,
tres compras simuladas e dois convites validados**, em Node 22+,
num banco de laboratorio vazio de contas:

```sh
export LOOP_ADMIN_CATALOGO_LOCAL=1
export LOOP_CATALOGO_DB="$HOME/loop-catalogo-teste.sqlite"
export LOOP_ADMIN_TEST_TOKEN="$(openssl rand -hex 32)"

# Ativa EXCLUSIVAMENTE esta geracao local de dados inventados.
export LOOP_DEMO_SEED_CONVITES=1
npm run demo:convites

# Iniciar painel no mesmo banco, so na maquina local.
npm run start:admin-demo
```

Abrir `http://127.0.0.1:3001/admin/cadastro-participantes-demo`
e informar a chave temporaria da maquina. O painel deve mostrar
uma posicao na fila **A** (indicador) e duas posicoes na **B**,
sem iniciar o tabuleiro.

O comando de geracao recusa `NODE_ENV=production`, ausencia de
opt-in, banco sob o diretorio do projeto ou arquivo de cadastro
que ja possua contas. Nao repetir o comando no mesmo banco;
para outra demonstracao, criar um banco de laboratorio novo.
Nao usar CPFs, emails pessoais ou senhas reais.

## Testes automatizados

- `test/ponte-compras-convites-demo.test.js`: estado vazio,
  validacao por compra, transicao B para A, indicacao unica,
  aplicacao retardada, idempotencia, compra divergente,
  limitacao em cinco, rollback, reinicio do banco, imutabilidade,
  acesso administrativo e isolamento do servidor publico.
- `test/cenario-convites-script-demo.test.js`: exige opt-in,
  rejeita producao e valida o resultado de tres compras
  ficticias com 1A e 2B.

## Pendente antes de aceitar pessoas reais

Continuam necessarios PSP de producao + verificador de
assinatura/webhook, reconciliacao financeira, verificacao de CPF
por identidade unica, politica de reembolso/chargeback, definicao
juridica de elegibilidade, rastreio de termos de adesao,
sessoes reais protegidas, rate limiting, reducao de exposicao
de dados LGPD, auditoria e integracao operacional segura.

**NENHUMA PARTE deste cenario habilita comercio real.**
