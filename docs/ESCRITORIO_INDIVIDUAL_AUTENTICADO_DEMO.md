# LOOP — escritorio individual de laboratorio (15/10/2026)

> Area funcional de **TESTE LOCAL** com identidades inventadas. Ainda
> NAO autoriza usuarios externos, dados pessoais reais, CPF, compra,
> dinheiro, ganhos, saque ou contemplacao.

## Entregas

- `src/domain/escritorio-individual-demo.js`: visao do comprador
  com pedidos *ficticios*, posicoes no motor e contagens de convites.
  Consultas SQL usam sempre o identificador da conta autenticada.
  O resultado NAO inclui contaId e nomes de convidados, emails,
  CPF, custo de fornecedor, sessao de terceiros, senha ou hashes.
- `src/domain/sessoes-participante-demo.js`: verificacao com
  **nome + senha** do cadastro ficticio ja existente. Sessao aleatoria
  de 256 bits, em RAM e indexada pelo hash SHA-256 do token, com
  expiracao fixa de 20 minutos e revogacao por logout.
  Cinco falhas por IP local em janela de 15 minutos bloqueiam
  novas tentativas de login temporariamente. Nao existe token na
  URL, no armazenamento do navegador nem na resposta JSON.
- `src/routes/participante-laboratorio-demo.js`: API local
  `POST /api/laboratorio/participante/entrar`,
  `GET /api/laboratorio/participante/minha-conta` e
  `POST /api/laboratorio/participante/sair`.
  O token de sessao circula somente como cookie **HttpOnly**,
  **SameSite=Strict**, com Path limitado as rotas individuais
  e expira em 20 minutos. A API rejeita campos extras no login,
  acessos externos e operacoes que tentem enviar um pedido ou
  titular arbitrario. Usa `Cache-Control: no-store`.
  Nenhuma rota aceita `contaId` no corpo como prova de identidade.
- `src/laboratorio/participante-demo.html` com JS/CSS externos
  responsivos em preto/dourado/verde, sem acesso direto a admin:
  mostra vagas ativas, posicoes A/B e pedidos ficticios da
  propria conta, codigo de convite individual, quantos cadastros
  ainda faltam comprar, e quantos convites foram validados.
- `test/escritorio-individual-sessoes-demo.test.js`: privacidade
  entre duas pessoas ficticias, bloqueios de login, revogacao,
  validade de sessao, cookie protegido, spoofing de parametro,
  inconsistencia de compra/posicao e ausencia no servidor publico.

## Como conferir

No computador de desenvolvimento, com Node.js 22+ e um banco
SQLite de laboratorio **sem contas anteriores**:

```sh
export LOOP_ADMIN_CATALOGO_LOCAL=1
export LOOP_CATALOGO_DB="$HOME/loop-catalogo-teste.sqlite"
export LOOP_ADMIN_TEST_TOKEN="$(openssl rand -hex 32)"
export LOOP_DEMO_SEED_CONVITES=1
npm run demo:convites
npm run start:admin-demo
```

Abrir no navegador local
`http://127.0.0.1:3001/laboratorio/participante`
e entrar com uma das tres contas ficticias da demonstracao:

- Nome: `Conta Demo Principal`
- Senha: `senha-local-ficticia-2026`

Somente nesta maquina, esse exemplo devera mostrar
uma posicao na fila A e duas indicacoes validadas no teste;
ao entrar como `Conta Demo Convidada Um` com a mesma senha
**ficticia**, a pagina deve mostrar apenas uma posicao na fila B
e nenhum dado do comprador principal.

Os exemplos acima NAO devem ser utilizados com dados reais.
O seed recusa execucao em `NODE_ENV=production` e se
o banco ja possuir contas. Crie novo arquivo SQLite de
laboratorio caso precise repetir a demonstracao.

## Limites e condicoes para uso externo

O cookie local nao usa `Secure` por funcionar apenas em HTTP
sobre loopback. Esta area NAO pode ser publicada nem transformada
em autenticacao de clientes reais sem **HTTPS**, cookie Secure,
CSRF defense testada sob dominio publico, armazenamento
persistente e rotacao de sessoes, validacao de email, reset
de senha, protecao de credenciais, logging seguro, politicas
LGPD e auditoria independente. O bloqueio de login em RAM
desta demonstracao NAO substitui um rate limiter distribuido.

As contas reais precisarao de identidade unica/CPF validado,
politicas para multiplas compras e estornos, verificacao de
pagamento por PSP assinada e reconciliada, avaliacao
juridico-contabil do modelo e aceite documentado dos termos.

**As 250+ verificacoes automatizadas nao substituem pentest
nem aprovacao para aceitar clientes ou pagamentos reais.**
