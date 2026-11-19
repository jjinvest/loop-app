# Contrato permanente — mensagens de erro no REAL (19/11/2026)

**Regra do proprietário:** quando uma funcionalidade falha, explicar a causa em linguagem clara e o que fazer. Não deixar o usuário apertar um botão sem resposta. Isto vale para o Escritório LOOP e para a AKITEMM.

## Fonte da verdade
- Somente o sistema REAL implantado: `feature/unificar-escritorio-real-20261105`, integridade controlada por `docs/TRAVA_BASE_REAL_ATUAL_20261119.json`.
- Base ORIGINAL histórica fica guardada para orientação futura, não se usa para repor telas nem para redigir a interface vigente.
- Não redesenhar molduras, botões, cores, banners, filas, catraca e financeiro ao corrigir erros de apresentação.

## Comportamento exigido
1. Cada operação interativa deve ter feedback de andamento, de sucesso ou erro. Mensagens de erro precisam ser **visíveis no contexto da ação**, inclusive quando a ação é iniciada fora da aba principal (ex.: círculo de foto no topo).
2. Foto da conta REAL: escolher no Android, reduzir imagem pesada localmente para JPEG até 3 MB quando o navegador suportar, realizar upload autenticado para `/api/contas/foto-perfil`, recuperar do mesmo endereço de sessão e exibir nas molduras já existentes. Para erro: distinguir formato inválido, tamanho máximo, sessão expirada, conexão, serviço indisponível, recusa do servidor. Não publicar foto de terceiro nem vazar EXIF/GPS; backend continua verificando e sanitizando.
3. Login e cadastro: usar os avisos existentes `erroLogin` e `erroCadastro`, sem exigir que o usuário procure a causa fora da tela. Mostrar credenciais incorretas de forma neutra (não revelar se uma conta existe); explicar bloqueio, espera, validação e rede.
4. Dados sensíveis: nunca expor senhas, CPF completo, tokens, cookies, stack traces, SQL, caminhos internos ou mensagens arbitrárias fornecidas pelo servidor. Priorizar códigos controlados e ação orientadora.
5. Toda manutenção futura de operador, loja, pagamentos, saque, fila e catraca deve seguir o mesmo contrato, com mensagens específicas quando implementadas; não declarar essas áreas totalmente cobertas sem testes reais de cada função.

## Trava contra regressão
- `test/contrato-mensagens-operacionais-real.test.js`: valida contratos de mensagem e de segurança do perfil e login.
- `test/foto-perfil-real-cadastro-documentos-7x7.test.js`: comprova persistência da foto REAL, proteção de titular, entrada autenticada e preparação de imagem grande no celular.
- `.github/workflows/trava-base-real.yml`: inclui os dois testes.
- O manifesto `docs/TRAVA_BASE_REAL_ATUAL_20261119.json` usa SHA do código e de testes, ancorado externamente pelo Railway. Mudanças só com autorização e revisão do proprietário.
- Corrigir erro não significa alterar outros recursos aprovados ou refazer projeto.

## Auditoria por outra IA
Verificar as rotas `/api/contas/foto-perfil` via gateway público, autenticação/CSRF, conversão local, CSP `img-src 'self'`, persistência SQLite e presença dos avisos no celular. Verificar mensagens neutras de login, rede e limites. Exigir testes ponta a ponta no navegador; testes de unidade e inspeção de código isolados não comprovam todo tipo de aparelho. Comportamento pendente deve ser declarado como tal.
