# LOOP 3.0 / AKITEMM — demonstração real de laboratório: compra → convite → fila A → tabuleiro — 06/11/2026

**Resultado: FLUXO EXTERNO COMPROVADO NA HOMOLOGAÇÃO.** Dois clientes **inteiramente fictícios**, dois Pix **exclusivamente simulados** no Asaas Sandbox, dois pedidos no mesmo backend, webhook externo e motor/filas/tabuleiro na mesma instância SQLite. Não houve cadastro público, dinheiro real, comissão, saque, direitos comerciais nem verificação oficial de identidade.

## Antes da prova

- GitHub, branch `feature/unificar-escritorio-real-20261105`: ligação que faltava implementada em:
  - `src/domain/motor-conta-unica-ensaio-sqlite.js`: `qualificarIndicacaoEnsaio` exige o convite persistido, **compra do indicado B vinculada a uma posição**, reconsulta PSP Sandbox RECEIVED sem revisão/reversão, aceite individual da posição de A e prova de titularidade. Transação `BEGIN IMMEDIATE` une a mudança no **motor existente**, snapshot, atribuição imutável da indicação e trilha operacional. Uma conta indicada só qualifica uma indicação; repetir não duplica nem altera a posição escolhida. Nenhum ganho ou saldo real.
  - `src/domain/equipe-candidata-sqlite.js`: Minha Equipe lê a atribuição no **mesmo SQLite** e diferencia cadastro simples de indicação de ensaio qualificada.
  - `src/candidato/servidor-loja-escritorio-candidato.js`: endpoint do titular autenticado, com CSRF, para atribuir uma indicação apenas à sua própria posição. Origem pelo link autenticada por cookie assinado no gateway.
  - `src/candidato/checkout-candidato-ui.js`: controles nas abas **Minha Equipe** e **Minhas Posições** já aprovadas, sem criar interface paralela; contador de indicações em cada posição e ação de escolher posição antes de alocar.
  - `test/fluxo-indicacao-compra-sandbox-tabuleiro.test.js`: fluxo integrado de SQL, motor, fila A, tabuleiro e restrições negativas. Fixture isolada de PSP recebido no teste de unidade **não substitui** a evidência externa abaixo.

## Prova ponta a ponta na infraestrutura externa

- Ambiente: Railway `loop-asaas-homologacao` / `homologacao` / serviço `akitemm-escritorio-preview`, domínio protegido `https://akitemm-escritorio-preview-homologacao.up.railway.app`, mesmo volume SQLite da loja e do motor.
- Execução one-shot com opt-in explícito: `scripts/homologar-cliente-convite-tabuleiro-asaas-preview.js`.
- **Deployment `32f02fbd-9a6f-4546-8f32-2690707dd0eb`: SUCCESS, healthcheck aprovado**, log:
  `LOOP_CLIENTE_COMPRA_CONVITE_TABULEIRO`:
  `contasFicticiasCriadas=2`, `pedidosFicticios=2`, `pixSimuladosConfirmados=2`, `posicoesAceitasEmLaboratorio=1`, `indicacoesComCompraValidada=1`, `mesmaIndicacaoSemDuplicacao=true`, `filaAPromovida=true`, `posicaoNoTabuleiro=true`, `giroReal=0`, `creditosReais=0`, `saquesReais=0`, `identidadeExternaValidada=false`, `cadastroPublicoLiberado=false`.

### Sequência verificada por HTTP, não apenas por testes locais

1. Criada conta fictícia A na interface de cadastro, autenticação e sessão/CSRF válidos.
2. A registra pedido de **R$ 250** pela loja de homologação. Backend criou cobrança no **Asaas Sandbox**. Script conferiu cobrança Pix única por `externalReference`, valor e cliente; executou confirmação no endpoint de simulação do PSP.
3. Asaas transmitiu webhook externo **HTTP 200** à aplicação Railway; conciliação verificou o PSP e o mesmo titular recebeu sua posição pendente. O teste confirmou a posição em `GET /staging/motor/estado`.
4. A aceitou individualmente sua posição usando **CPF fictício matematicamente válido**, custódia cifrada e termos **LAB** via API, sem afirmar KYC ou validade comercial.
5. B acessou `/loja/<nick-A>` por link do indicador; o gateway criou um cookie de convite **assinado e HTTP-only**. O novo cadastro de B foi ligado a A, visível em Minha Equipe. Cadastro isolado contou **0** indicações qualificadas.
6. B realizou sua própria compra de ensaio de R$ 250, com **segunda cobrança Pix no Asaas Sandbox**, confirmação simulada, segundo webhook externo HTTP 200, conciliação e posição pertencente a B.
7. A escolheu sua posição, enviou a atribuição de B com sua própria sessão e CSRF, e o motor confirmou **1 indicação qualificada** e **promoção da posição de A à fila A**. O segundo envio da mesma atribuição voltou `repetido=true` e não duplicou a indicação.
8. O operador montou o tabuleiro existente; a aplicação confirmou que a posição de A estava em **uma vaga ou no centro do mesmo tabuleiro**, sem giro, saldo, comissão ou saque real.

Os logs HTTP do Railway confirmaram as entradas e retornos das rotas de cadastro, sessão, pedido, ponte Pix, webhook, aceite, equipe, alocação, preparação do tabuleiro e consulta final. Não documentar nicks gerados, CPF de ensaio, chaves, cookies, IDs do Asaas ou tokens.

### Bloqueios e escopo

O ensaio **não** validou giro com seis eventos pagos distintos nessa instância publicada, concorrência massiva em produção, verificação de identidade real, entrega logística, checkout comercial nem legalidade/solvência de retorno financeiro.

A primeira tentativa do executor (deployment `d0c79dcd`) foi bloqueada por consulta de catálogo **sem sessão**, antes de qualquer cadastro ou cobrança. O executor foi corrigido para autenticar A antes da consulta; a execução `32f02fbd` realizou a prova integral. Essa falha é registrada como aprendizado técnico, não contada como aprovação anterior.

Após o sucesso, o opt-in temporário `LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR` foi desligado (`NAO`) e o ensaio externo foi retirado do pre-deploy normal. Permanecem testes internos direcionados, prova GET Asaas e auditoria da configuração de webhook. A branch de homologação continua isolada da PR #1, que permanece **DRAFT**, sem merge/publicação comercial.

**Próximo gate técnico:** comprovar o conjunto de seis eventos distintos do ciclo e giro controlado, sem pagamentos reais; depois reforçar carga e falha adversarial. Os gates de conformidade e sustentabilidade continuam independentes da prova técnica.
