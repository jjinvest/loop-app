# AKITEMM — conexão Asaas produção: diagnóstico sem transação (07/11/2026)

## O que foi preparado (não confundir com credencial habilitada)
- `src/producao/asaas-producao-readonly.js`: somente dois GET autorizados em **https://api.asaas.com/v3**, `GET /myAccount/status/` (aprovação cadastral) e, apenas se aprovação geral=APPROVED, `GET /financialTransactions?offset=0&limit=1` (estrutura de um item do extrato Asaas). A API usa header `access_token` e `User-Agent` de AKITEMM; somente aceita chave do ambiente Produção iniciada por `$aact_prod_`. Não cria cobranças, transferências, webhooks, clientes ou carteira.
- `scripts/verificar-asaas-comercial-readonly.js`: acionamento manual, com `LOOP_ASAAS_PRODUCAO_LEITURA_AUTORIZADA=SIM`; proibido em serviço de prévia e em homologação do webhook. A chave entra somente em `LOOP_ASAAS_PROD_API_KEY` num **serviço exclusivo de diagnóstico financeiro** com acesso privado. Não executa automaticamente em GitHub Actions nem na inicialização da plataforma.
- O retorno lista somente estados cadastrais e se a consulta ao extrato funcionou; não registra pagamentos, CPF/CNPJ, titular, valores, IDs financeiros, dados de cliente, token, corpo bruto de resposta ou cabeçalhos. O teste usa fetch simulado e comprovou regras de falha fechada sem conexão remota.
- Mesmo com consulta bem-sucedida o status **checkoutComercialHabilitado=false** e **conciliacaoBancariaIndependenteComprovada=false** é permanente neste diagnóstico. Extrato Asaas não é o extrato da conta bancária externa, e a consulta de uma única transação não fecha contabilidade financeira.

## Ação externa do proprietário no Asaas
1. Entrar na conta **Asaas de Produção**, pela **interface web**, como administrador. Confirmar cadastro da empresa e documentos/dados bancários; verificar se conta recebeu aprovação geral. O modo Sandbox já existente é independente e deve permanecer intacto.
2. Em **Integrações → Chaves de API**, gerar chave exclusiva identificada para diagnóstico AKITEMM, com validade/rotação apropriada. A chave é exibida uma vez. Guardar em **cofre de segredos privado**, jamais em chat, captura de tela, GitHub, e-mail, suporte ou na prévia.
3. Somente após escolha do serviço isolado e custódia de segredos, provisionar a chave em `LOOP_ASAAS_PROD_API_KEY` nele e autorizar pontualmente `LOOP_ASAAS_PRODUCAO_LEITURA_AUTORIZADA=SIM`. **Não** colocar esta chave em `akitemm-escritorio-preview` ou `asaas-webhook-staging`, nem acionar cobranças, saques ou Pix reais neste diagnóstico. A própria API Key pode autorizar operações financeiras mais amplas que o código GET; proteger por conta/segredos/IP e não confundir controle do nosso processo com permissão somente leitura concedida pelo Asaas.
4. Registrar em repositório somente **relatório desidentificado** da consulta e eventuais pendências por código; não registrar material privado. Fluxos produtivos só poderão ser abertos após homologação comercial, identidade, conciliação bancária, legalidade e aprovações próprias.

## Banco externo (ação dependente da instituição)
A conta Asaas pode exibir suas movimentações próprias, mas a AKITEMM requer conferência **independente** dos repasses na conta que realmente recebe os valores. A instituição bancária e titularidade ainda não foram confirmadas neste documento. Para conectar, identificar qual banco e se ele oferece API read-only/Open Finance para conta PJ/MEI ou extrato digital assinado, sem solicitar senha bancária, token ou chave Pix pelo chat. Não criar ponte presumida; não usar valores declarados como liquidação comprovada.

Referências oficiais:
- https://docs.asaas.com/docs/authentication-2
- https://docs.asaas.com/docs/api-keys
- https://docs.asaas.com/reference/check-account-registration-status
- https://docs.asaas.com/reference/recuperar-extrato

**Limites:** acesso de Produção ainda **não comprovado**, chave não fornecida, integração financeira externa/contábil não concluída, caso WeDrop sem permissão confirmada; operação comercial permanece bloqueada. PR #1 DRAFT e telas já aprovadas preservadas.
