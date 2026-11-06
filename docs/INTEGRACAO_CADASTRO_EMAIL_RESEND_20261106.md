# LOOP 3.0 / AKITEMM — verificação de e-mail ligada ao cadastro unificado — 06/11/2026

**Escopo:** continuidade técnica na homologação Railway. Nenhuma abertura pública, cobrança real ou envio real de e-mail foi declarado como comprovado.

## Pendência eliminada

O servidor da prévia anteriormente configurava o Resend exclusivamente para recuperação de senha, embora o cadastro já tivesse componentes de verificação de e-mail, prova de posse com HMAC, código de uso único e UI.

Foi corrigida a ligação da inicialização `scripts/servidor-escritorio-preview-railway.js` com o transportador existente `src/adapters/email-verificacao-resend.js`, injetando no **mesmo SQLite e no mesmo titular** `chaveProvaEmail` derivada do segredo de homologação e `enviarEmailDeVerificacao` usando o provedor Resend já conectado. As rotas `/staging/contas/email/enviar` e `/staging/contas/email/confirmar` continuam protegidas por sessão e CSRF; cadastrar-se não envia mensagens automaticamente.

A rota administrativa protegida `GET /staging/escritorio-unificado` agora informa `verificacaoEmailDisponivel` e `recuperacaoSenhaEmailDisponivel`, sem divulgar chave, destinatários ou códigos. A interface existente de Minha Conta não foi redesenhada.

## Prova externa concluída

O Railway `loop-asaas-homologacao` / `homologacao` / `akitemm-escritorio-preview` implantou a correção, e o executor somente de leitura `scripts/verificar-prova-email-preview.js` verificou por HTTPS autenticado que:

- o Escritório Unificado declara **ambas as integrações habilitadas**;
- a interface JavaScript entregue ao navegador contém as chamadas de solicitação e confirmação do código;
- **0 operações de escrita e 0 mensagens enviadas** durante a prova;
- a conexão Asaas Sandbox continua autenticando sem criar cobrança; o healthcheck do deploy passou.

Evidência Railway: deployment `d69b8926-50c7-4306-9681-884929db983a`, **SUCCESS**, log `LOOP_EMAIL_CADASTRO_CONECTADO` com `integracaoCadastroEmail=true`, `integracaoRecuperacaoEmail=true`, `interfaceLigada=true`. A rotina de consulta da instância antiga foi retirada do predeploy após a prova, para não impedir implantação de recuperação.

## Limites e próximos passos

A prova **não envia uma mensagem real**, não confirma entrega à caixa postal e não significa que o domínio de remetente esteja aprovado pelo Resend. O envio real e a confirmação ponta a ponta exigem uma conta de ensaio autorizada e domínio verificado. O sistema falha de modo conservador caso o provedor recuse.

A prévia continua sendo **laboratório com dados fictícios**. Cadastro público de pessoas reais, coleta de dados pessoais e autorização de operações comerciais exigem antes aviso de privacidade, finalidade, retenção, atendimento a titulares e preparação operacional; o piloto de demonstração não confere direitos financeiros. Quando uma ação externa do proprietário for indispensável, explicitar o passo mínimo.

PR #1 permanece **DRAFT**, sem merge, checkout público, pagamentos ou saques reais.
