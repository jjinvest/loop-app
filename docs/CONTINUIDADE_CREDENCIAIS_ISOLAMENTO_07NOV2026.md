# Continuidade — credenciais, isolamento e conta permanente — 07/11/2026 UTC

## Fonte de trabalho (nao recomeçar)

- Produto: LOOP 3.0 / AKITEMM. Preservar interface aprovada, SQLite de ensaio, links por nick, regras do motor e integrações já homologadas.
- Branch de integração ativa: `feature/unificar-escritorio-real-20261105`. Referência de código desta etapa: `0ed4473015085e7df27c10ec147ad96973e9dff1`.
- Branch `checkpoint/fluxo-integrado-filas-catraca-20261106`: está contida na branch de integração (comparação em 07/11: integração 26 commits à frente, 0 atrás); não refazer nem substituir o checkpoint.
- Branch `fix/teste-escrita-catraca-20261014`: PR #1 **DRAFT** e com histórico paralelo (comparação com integração: 470 commits à frente e 29 atrás). **Não mesclar nem sobrescrever nenhuma das duas sem reconciliação específica**, preservar dados e mudanças do fluxo principal.
- Meta de 1º de dezembro conforme `docs/PLANO_MARCO_ZERO_DEZEMBRO_BETA_JANEIRO_LANCAMENTO_2026.md`: piloto condicional, não declaração de prontidão comercial.

## O que foi corrigido no código do gateway

- `833b5c7412264eb65e0e77462ba52e83f0c221b4`: `iniciar({env})` passa a mesma credencial administrativa verificada no início ao gateway; deixa de buscar um `process.env` diferente do objeto injetado. CI **SUCCESS**: https://github.com/jjinvest/loop-app/actions/runs/42320122018 .
- `b011322569b0a0d57ee90518593bb2a7e0ee8a0b`: o gateway deixa de aceitar `senhaAdmin=null`, ausente, menor que 24 caracteres ou igual à senha de acesso de visitante. Removido fallback que reaproveitava acesso de visitante como operador. Credencial do operador é distinta da entrada na prévia e da senha de cadastro do cliente.
- `0ed4473015085e7df27c10ec147ad96973e9dff1`: testes negativos garantem que gateway não inicia sem senha administrativa exclusiva e que cookie/Basic de visitante não autorizam variantes das rotas administrativas com barra final, caixa alta e caminho codificado. Execução CI acionada: https://github.com/jjinvest/loop-app/actions/runs/42320378298 . **Não marcar aprovada sem verificar o resultado do run**.
- Senhas, tokens e valores de segredos NÃO foram copiados para código, mensagens ou documentação.

## Railway observado neste checkpoint

Projeto `loop-asaas-homologacao`, ambiente `homologacao`. Serviço `akitemm-escritorio-preview`: deploy confirmado **SUCCESS** do código **anterior** `2bd4316f5c61845584e6562f9f96fc8d642ce147` em 07/11 00:30 UTC, com volume exclusivo `/dados-preview`. Serviço `asaas-webhook-staging`: volume independente `/loop-staging`. Há bucket de backup de homologação; a existência do bucket não prova recuperação de contas comerciais reais. Os nomes de `LOOP_PREVIEW_SENHA_ADMIN`, `LOOP_PREVIEW_SENHA_ACESSO`, `LOOP_PREVIEW_SEGREDO_RAIZ`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL` constam nas variáveis do serviço; valores não foram lidos nem devem ser divulgados.

**Atenção:** a prévia estava pinada no SHA anterior. Mesmo após CI verde do código novo, conferir deploy de commit exato e repetir acesso negativo HTTP na prévia antes de afirmar que a correção está operando no Railway. Não mexer no volume nem copiar dados entre serviços.

## Senha do cliente e dados pessoais — fronteira real x laboratório

- No código atual, conta de ensaio possui nick + senha, hash scrypt com salt individual, sessões SQLite, CSRF e renovação/revogação; nome e e-mail são cifrados, mas os termos dizem explicitamente **LAB**. A senha de visitante do gateway, a senha do cliente e a senha administrativa são três coisas distintas.
- **Não autorizar inserção de CPF real, e-mail/nome reais ou dados de consumidores na prévia de homologação**, mesmo que haja criptografia local ou HTTPS. Não chamar essa conta de produção e não prometer que será migrada automaticamente.
- Para evitar recriar contas, a solução definitiva é autenticação de clientes em ambiente e banco próprios, segredos independentes do laboratório, email verificado e recuperação comprovada, política de privacidade e consentimento, controles de abuso e auditoria horizontal, backup offsite/restauração testados. Construir uma estratégia de migração explícita para preservar nick e credenciais após validação, sem misturar registros simulados de pagamento/posição.
- Proprietário escolhe a senha administrativa **diretamente e em sigilo no Railway** em `LOOP_PREVIEW_SENHA_ADMIN`, com frase-senha longa e diferente da senha de acesso do cliente. Não solicitar que ele digite senhas no chat. Configuração da prévia atual não equivale ao cadastro administrativo pessoal dentro do aplicativo.
- A confirmação do e-mail, garantia de entrega de mensagens e conta de cliente definitiva exigem verificação externa. Não confundir `RESEND_FROM_EMAIL` presente com entrega comprovada.

## Próximos passos na ordem (sem repetir trabalho encerrado)

1. Checar run CI `42320378298` no SHA de código `0ed44730`. Se falhar, corrigir precisamente o erro e validar de novo apenas o necessário.
2. Implantar **somente em homologação privada** o SHA comprovado, preservando `/dados-preview`, quando autorizado e seguro; confirmar deploy/status e negativas administrativas.
3. Preparar isolamento efetivo do cadastro permanente em um banco/ambiente separado do laboratório, com termos, privacidade, identificação, email e recuperação, antes de o proprietário entrar com características reais. Não duplicar telas aprovadas.
4. Reconciliar posteriormente a branch de integração com os 29 commits paralelos da PR #1; PR permanece DRAFT. Nenhum pagamento real, saque, merge ou lançamento está autorizado por este checkpoint.

Registrar provas reais de cada gate sem inflar contagens ou dizer que HTTP/CI equivale a auditoria independente.

## Atualização 07/11 — identidade única, interface LOOP e testes

- A loja de homologação e o Escritório Virtual compartilham o mesmo cookie de sessão `loop_candidato_s`, as mesmas APIs de `contas` e o mesmo titular no SQLite; a vitrine `/staging/loja` só abre se houver sessão válida, sem cadastro separado. O navegador sem cookie não recebe a identidade do titular.
- Corrigida a tela de `/minha-conta`: abre **Entrar** para uma conta existente; **Primeiro acesso? Criar cadastro** permanece disponível. A restauração de sessão existente continua automática.
- Marca textual do Escritório corrigida de AKITEMM para **LOOP 3.0 / Escritório Virtual**. AKITEMM permanece a vitrine/loja e o link de indicação `/loja/<nick>` é distinto de `/escritorio/<nick>`. O cabeçalho final ainda será decidido pelo proprietário.
- Adicionado teste integrado do acesso ao escritório e à loja com mesma sessão autenticada, incluindo bloqueio sem sessão; corrigido o teste que supunha nick com maiúscula (os nicks são canonizados em minúscula) e o teste que criava gateway sem senha de administrador.
- GitHub: alterações `3543b92f`, `79d96239`, `bdd54320`, `8d621427` na branch `feature/unificar-escritorio-real-20261105`; CI do código `8d621427`: https://github.com/jjinvest/loop-app/actions/runs/42325161899 (verificar conclusão; não marcar aprovado sem resultado).
- Railway: serviço `akitemm-escritorio-preview` permanece fixado no código anteriormente validado `2bd4316f`; **nenhum deploy automático deste bloco** para evitar interromper testes do usuário ou ativar exigência de nova senha admin antes de confirmar a configuração. Senha admin exclusivamente em `LOOP_PREVIEW_SENHA_ADMIN` no Railway, distinta do acesso de teste do visitante. Nunca registrar valores de segredos.
- Esta é uma homologação de laboratório. Usuário não deve colocar senha pessoal, CPF real ou dados cadastrais verdadeiros nesta prévia. PR #1 DRAFT; nenhum pagamento real, saque, merge ou lançamento autorizado.

## Correção 07/11 — atalho Loja com cookie de sessão restrito

- Detectado problema no atalho público `/loja`: o cookie da conta de cliente tem escopo `Path=/staging`, portanto a requisição inicial feita a `/loja` não carrega a sessão da aplicação. Ao encaminhar diretamente ao backend, este redirecionava um titular autenticado como se estivesse sem login.
- Corrigido no gateway HTTPS da prévia: `GET /loja` retorna `302 Location: /staging/loja` preservando parâmetros da URL e cookie do portão quando cabível. Ao acessar `/staging/loja`, o navegador apresenta o cookie `loop_candidato_s` corretamente. Rejeita métodos diferentes de GET/HEAD. O backend mantém exigência de sessão válida.
- Teste ponta a ponta vincula mesma conta/nick aos dois painéis, prova a transição `/loja -> /staging/loja`, prova acesso autorizado com cookie e o redirecionamento seguro de visitante sem cookie.
- Commits de código na branch de integração: `f2889b89` (gateway), `9d47da61` e `c9e87a29` (testes de regressão). O primeiro teste novo exigia indevidamente HTTP 200 no atalho, quando o comportamento seguro é 302; corrigido o contrato para o redirecionamento canônico.
- [CI de validação do SHA c9e87a29](https://github.com/jjinvest/loop-app/actions/runs/42325547953): verificar resultado final antes de homologar/implantar. Testes locais ao backend e source pin Railway não são evidência de aprovação comercial.
- Implantação: preservar o código fixado no Railway até a CI integral passar e a credencial administrativa independente estar garantida. O cliente continua testando a prévia atual; nenhum banco real, pagamento de verdade ou PR merge autorizado.


## Segurança da conta e homologação consolidada — 07/11/2026

- Continuidade confirmada: `jjinvest/loop-app`, branch ativa de integração `feature/unificar-escritorio-real-20261105`; PR #1 `fix/teste-escrita-catraca-20261014` continua DRAFT e não foi mesclada.
- **Segurança corrigida na identidade unificada**: a troca de senha usava uma fotografia de tentativas anterior ao `await scrypt` e podia sobrescrever a contagem de falhas durante concorrência. Agora atualização da contagem, checagem de lockout e verificação de hash vigente são feitas sob `BEGIN IMMEDIATE` SQLite; a troca com senha correta também revalida o bloqueio após o hash. Ref. commit `4c4831c64c0cc24c6644c5c930239501423649ec`.
- Teste de segurança: 8 trocas de senha erradas simultâneas sobre a mesma sessão devem gerar exatamente 5 tentativas registradas e 3 recusas por bloqueio, sem permitir mudança da credencial; ref. `92c8f5086cdd2517227313d3e3cc02a7035fb2f5`. Não alegar aprovação antes de verificar CI.
- **Homologação enxuta**: workflow `.github/workflows/preview-escritorio-protegido.yml` agora usa `concurrency` por branch (`cancel-in-progress: true`) para que commits subsequentes substituam execuções ultrapassadas, sem consumir recursos repetindo todas as auditorias em paralelo. Ref. `57eaafdf18d6d178c352bb83e3b6cb53e392fdb3`.
- [CI do código atual](https://github.com/jjinvest/loop-app/actions/runs/42326551380) foi iniciada e ainda exige verificar resultado final; se o `npm test` for bloqueado, investigar saída concreta e corrigir, sem declarar sucesso por antecipação.
- Railway `homologacao` permanece fixado no SHA `2bd4316f5c61845584e6562f9f96fc8d642ce147` até haver validação final e credencial exclusiva de administrador configurada; a execução do laboratório já acessível ao proprietário não deve ser interrompida ou resetada sem evidência e reversão.
- O proprietário informou ter discutido o modelo com seu advogado e assumiu a frente jurídica. Não confundir essa comunicação com auditoria jurídica independente executada no GitHub. Frente técnica priorizada: autenticação permanente separada do laboratório, integração operacional, preservação de dados, homologação no Railway e critérios GO.
- Laboratório atual explicitamente proibido para dados pessoais reais; não solicitar senhas ou CPF no chat. Sem transações reais, saques ou deploy comercial.
