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
