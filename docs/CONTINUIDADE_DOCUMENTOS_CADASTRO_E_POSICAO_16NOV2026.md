# Continuidade documental LOOP 3.0 / AKITEMM — 16/11/2026

## Documentos recuperados integralmente no GitHub
- Termos de Uso do cadastro: `docs/TERMOS_CADASTRO_LOOP_2026_11_PARA_APROVACAO.md`, sete tópicos. Documento existente, ainda marcado como versão proposta.
- Política de Privacidade do cadastro: `docs/POLITICA_PRIVACIDADE_LOOP_2026_11_PARA_APROVACAO.md`, sete tópicos. Documento existente, ainda marcado como versão proposta.
- O cadastro deve mostrar os dois documentos completos, separados por título e com um único aceite explícito, versionado e auditável. Dados tratados incluem nome, nick, e-mail e telefone; o telefone pode ser visível ao indicador direto conforme a política.

## Documento de 30 tópicos da confirmação individual por CPF
- O texto integral aprovado em conversa anterior **não foi localizado no repositório até esta revisão**. Não inventar texto, não substituir pelo texto do cadastro e não marcar como aprovado.
- A interface das posições em `src/candidato/checkout-candidato-ui.js` consome `/staging/contas/termos-identidade`. A fonte anterior usava indevidamente o mesmo `termosTexto` do cadastro, inclusive na confirmação individual.
- `src/candidato/servidor-loja-escritorio-candidato.js` agora exige `termosIdentidadeTexto` e `termosIdentidadeVersao` próprios, e bloqueia aceite CPF quando indisponíveis. A configuração de publicação ainda não fornece o documento de 30 tópicos; portanto o aceite CPF deve continuar bloqueado.
- A redação pretendida pelo proprietário trata a posição como decorrente de compra de produto AKITEMM, não depósito ou investimento; os benefícios são política comercial facultativa, passível de encerramento prospectivo. Não afirmar inexistência de obrigações legais ou direitos já adquiridos sem revisão jurídica.

## Provas e próximos passos
- Commit da separação técnica: `c33bad89731c6a8b6da4311ee6b78637058261b7`; teste de CPF adaptado: `a7df0b6846f37a0c3538e254b83b15dd3b4fb16a`.
- Railway `akitemm-escritorio-preview` deployment `a9dc47fe-672b-4024-aab9-1a4fb72c8cc6`: SUCCESS, mas **não comprova aceite dos 30 tópicos nem conclusão dos ajustes visuais**.
- Recuperar o texto original de 30 tópicos, registrar arquivo versionado com hash, configurar endpoint exclusivo e testar cadastro e confirmação por posição em PC/celular antes de abrir o aceite.
