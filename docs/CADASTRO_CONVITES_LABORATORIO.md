# LOOP — cadastro e convite em laboratorio (15/10/2026)

> Etapa de engenharia local. Nao ha conta de participante real,
> CPF, login publico, compra, pagamento, integracao com filas,
> criacao de posicao, indicacao valida ou distribuicao de valores.

## Regras preservadas

1. Cadastro projetado: nome, email e senha. No modelo de laboratorio,
   o mesmo **nome**, normalizado sem diferenca de maiusculas, vira
   o identificador de login. Nomes de acesso sao unicos.
2. Acessos posteriores no teste pedem **nome + senha**, nao email.
3. Cada conta recebe um codigo de convite individual e aleatorio.
   A tela de teste permite receber `?convite=<codigo>` e preencher
   automaticamente o campo de indicador (nao o token do admin).
4. Uma conta criada por convite fica vinculada ao titular que gerou
   aquele codigo. **Cadastro sem compra confirmada NAO valida
   indicacao e NAO transfere a pessoa para a fila A**.
5. Nenhuma conta cadastrada aqui ganha posicao ativa. Continua
   reservado o limite futuro de cinco posicoes ATIVAS por CPF,
   sem qualquer verificacao real de documentos nesta etapa.
6. As prioridades 3A/1B, desempate pelo ultimo convite elegivel,
   centro+cinco vagas e catraca nao foram alteradas.

## Implementado

- `src/domain/contas-participantes-demo-sqlite.js`: SQLite local
  com nome de acesso normalizado, email de laboratorio unico,
  senha derivada por `scrypt` com salt aleatorio por conta,
  codigo de convite aleatorio, vinculacao de indicador e trilha
  de cadastro com protecao contra UPDATE/DELETE comum.
- Nenhuma senha em texto claro e devolvida ou gravada.
  Listagem administrativa omite email e hashes, mostra somente
  contas ficticias, convites pendentes e zero posicoes.
- `src/routes/admin-contas-participantes-demo.js`:
  `GET /api/admin/contas-participantes-demo`,
  `GET .../convites/:codigo`, `GET .../:id`,
  `GET .../:id/historico`, `POST .../cadastrar` e
  `POST .../login-teste`. Tudo exige chave local de laboratorio.
- `src/laboratorio/cadastro-participantes-demo.html` com JS/CSS
  dedicados, ligado no menu do painel local.
- Testes em `test/contas-participantes-demo.test.js` exercitam
  nomes e email repetidos, login sem email, hash e salt, convites,
  ausencia de validacao automatica, persistencia, trilha e protecao
  da API e ausencia no servidor publico.

### Uso em testes

Abra `/admin/cadastro-participantes-demo` no computador local
depois de iniciar `npm run start:admin-demo` segundo
`docs/PAINEL_ADMIN_LABORATORIO.md`. Cole a chave temporaria
do administrador e crie **apenas dados inventados**.
O cadastro raiz pode ser feito sem codigo de convite; depois
um convidado pode ser cadastrado pela referencia gerada.
A verificacao de senha e apenas comparacao no servidor:
**NAO cria sessao real de usuario**.

## O que falta para producao

Autenticacao de clientes com sessoes segregadas e protegidas,
recuperacao de conta, verificacao de email, bloqueio e rate limiting,
auditoria de seguranca, verificacao legal de identidade/CPF,
consentimento LGPD, termos aprovados, vinculo com pedidos e
confirmacoes de PSP REAL confiaveis, isolamento de acesso
a dados do proprio titular, politicas de exclusao/retencao e
resolucao de contestacoes. Implementar o gatilho de indicacao
**somente a partir de venda realmente confirmada e elegivel**,
com idempotencia, transacao atomica e revisao juridica do modelo.
Esta etapa nao esta preparada para cadastro de pessoas de verdade.
