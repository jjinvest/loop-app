# LOOP 3.0 / AKITEMM — Conta única, checkout de pré-pedidos, Escritório e backup offsite

**Registro de execução em 03/11/2026.** Branch `fix/teste-escrita-catraca-20261014`. Fonte oficial: `jjinvest/loop-app`. PR #1 permanece **DRAFT**, sem merge ou deploy do produto público.

## O que está implementado e o que não está

O fluxo de **candidato local** agora usa **um único identificador imutável `titular-UUID`** para o cadastro, login, cotação no servidor, rascunho com idempotência, pré-pedido e consulta do Escritório de homologação. A ligação não precisa mais inferir titularidade por nome, apelido ou e-mail, nem requer duplicar uma conta fictícia no escritório. As mesmas tabelas SQLite sustentam ambas as leituras.

- `src/domain/conta-unica-candidata-sqlite.js`: nick de **1 a 9 letras**, único independentemente de maiúsculas/minúsculas; nome e e-mail cifrados com AES-256-GCM, índice único de e-mail calculado por HMAC-SHA256; senha derivada com `scrypt` e salt individual; sessão aleatória persistida somente como hash; CSRF derivado de token; bloqueio temporário por tentativas inválidas; logout; troca de senha com prova da senha atual e revogação transacional de todas as sessões. O e-mail **não é verificado** porque ainda não existe provedor ou fluxo de entrega/confirmacão; não considerar isto uma identidade real validada.
- `src/domain/titularidade-cpf-termos-candidato.js`: nova opção `perfil='unificada'`, ligada à tabela da conta única. CPF é checado apenas matematicamente, guardado cifrado/HMAC e associado a aceite explícito e versão dos termos de **laboratório**. Não é KYC, não concede direito a posição nem permite saques. Chaves de cifragem/HMAC são independentes e devem ter gestão de segredos e rotação para qualquer implantação futura. Não usar CPF real em demonstrações.
- `src/candidato/servidor-loja-escritorio-candidato.js`: servidor **somente loopback, não produção**, com rotas de cadastro, login, sessão, logout, senha, CPF de ensaio, cotação recalculada no servidor, rascunhos e pré-pedidos. `GET /staging/meus-pedidos` exige sessão do próprio titular; `GET /staging/escritorio-unificado` exige credencial de operador independente e lê **o mesmo SQLite**. Rotas de finalizar/pagar/saques/ativar posição sempre devolvem HTTP **503**. `src/server.js` público **não importa nem monta** o candidato. Não instalar este servidor em domínio público como alternativa de produção.
- `src/candidato/checkout-candidato-ui.html` e `.js`: reaproveitam o layout e as abas de homologação já existentes, com cadastro de conta fictícia, nick, login, preparação de um pedido de R$250 e acompanhamento em **Meus Pedidos**. Não houve redesenho do visual comercial aprovado.
- `test/loja-escritorio-conta-unica-candidata.test.js`, `test/troca-senha-conta-unica-candidata.test.js`, `scripts/validar-conta-unica-candidato-browser.js`: provam, em HTTP local e Chromium PC/celular, login e separação entre clientes, repetição de pedido sem duplicação, pedidos no Escritório, CPF de ensaio, senha, persistência em reinício, isolamento de sessão/CSRF e bloqueio financeiro.

## Infraestrutura e cópia fora do servidor

O Railway atual continua com um serviço **exclusivo para receber webhooks Asaas Sandbox**, um volume SQLite persistente e uma réplica. Isso **não é** hospedagem de checkout/Escritório definitivo. Alterar o webhook para hospedar loja sem isolamento seria uma regressão de segurança e integridade. Não foi criado serviço, bucket ou volume adicional que pudesse acarretar custo novo.

O script `scripts/validar-backup-offsite-checkout-staging.js` foi preparado para, sob autorização explícita, gerar snapshot SQLite consistente e cifrado por AES-256-GCM, enviar **somente o arquivo cifrado** por `PUT` a uma URL HTTPS assinada, recuperá-lo via `GET` ao **mesmo objeto**, conferir tamanho/SHA-256 e restaurar em um SQLite isolado. Recusa redirecionamento, URL não-HTTPS, objeto diferente, host diverso e arquivo adulterado. A verificação automatizada `test/backup-offsite-checkout-staging.test.js` utiliza transporte **simulado**, por isso **não comprova bucket externo, restauração em segunda região, RPO/RTO nem recuperação de produção**. Essas provas exigem recursos e credenciais de infraestrutura ainda não configurados.

Nenhuma URL assinada, senha de backup ou conteúdo pessoal é registrada em GitHub ou logs. O script não deve ser ativado por cron até existirem armazenamento real autorizado, política de retenção, rotação de segredos, observabilidade, ensaios de recuperação e controle de custos.

## Segurança de operação

O CI `.github/workflows/marco-zero-seguranca.yml` testa dependências e exercita as rotas públicas negativas em `NODE_ENV=production`. O checkout comercial permanece bloqueado mesmo que o candidato local esteja pronto para testes. Não liberar por variável ambiental simples: a passagem para produção requer projeto separado de autenticação HTTPS com cookie **Secure**, verificação de e-mail, recuperação de acesso, proteção contra fraude e limites distribuídos, dados pessoais sob LGPD e gestão de segredos. Cadastro de conta unificada e aceite técnico de laboratório não substituem esses controles.

## Próximos bloqueios para conclusão técnica

1. Implantação isolada e homologada de **serviço de contas/checkout** com HTTPS, dados duráveis, gestão de segredos e cookies de produção; atualmente só existe o receptor de webhook de Sandbox no Railway.
2. Trocar cotação/prepedido fictícios por **pedido comercial definitivo** com catálogo/entrega reais, titularidade externamente verificada, direito do consumidor, idempotência e estado contábil. O PSP deve continuar em Sandbox até autorização específica e completa; no candidato nenhum Pix é criado.
3. Integração definitiva do Escritório com os departamentos financeiros, logísticos, indicações, posições, cofres e saques da fonte comercial, mantendo os mesmos IDs, sem projeção fictícia e com controle de acesso por função.
4. Provar backup **real fora do servidor** e restauração independente, concorrência, estabilidade, filas de mensagens, monitoração e plano de incidente sob infraestrutura definida.
5. Teste visual final pelo proprietário no código/ambiente exato e confirmação de prontidão por todos os gates, inclusive parecer independente e autorizações externas sob responsabilidade do proprietário.

**Marco Zero e inauguração em 01/12/2026 continuam condicionais.** Não afirmar que a plataforma aceita clientes comerciais, recebe dinheiro real ou está 100% pronta com base no CI do candidato. O token webhook Sandbox voluntariamente exposto em conversa deve ser revogado/rotacionado antes de uso definitivo; produção terá token próprio.
