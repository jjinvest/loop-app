# MISSÃO ÚNICA PARA CODEX — LOOP 3.0 / AKITEMM

## Repositório e continuidade

- GitHub: `jjinvest/loop-app`.
- **Ler primeiro**: `docs/LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md`, `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md` e as seções 238 a 244, incluindo as provas de Asaas Sandbox, persistência, replay e recuperação.
- Branch de trabalho a inspecionar: `feature/unificar-escritorio-real-20261105`. Revalidar o HEAD atual; não trabalhar sobre SHA antigo.
- PR #1 na branch `fix/teste-escrita-catraca-20261014` **continua DRAFT**. Não fazer merge, deploy público, pagamentos reais, saques reais ou captação.
- Preservar totalmente as telas aprovadas e seu CSS; conectar o backend e o JavaScript já existentes.

## Resultado que precisa funcionar, sem protótipos falsos

**Demonstração PONTA A PONTA com contas fictícias e Asaas Sandbox, utilizando o MESMO SQLite do Escritório Virtual:**

1. Conta A cria login de ensaio, compra produto elegível de R$ 250 na AKITEMM e recebe cobrança Pix **somente no Asaas Sandbox**. Confirmação simulada no PSP gera webhook assinado, reconsulta remota e **exatamente 1 posição pendente** para A no motor persistente, com bloqueios de idempotência.
2. A titular confirma sua própria posição de ensaio pela funcionalidade existente de CPF cifrado, versão dos termos e aceite individual. Não usar CPFs de terceiros nem fingir verificação externa.
3. A usa seu link personalizado de convite; conta fictícia B registra-se por esse link (vínculo já gravado na tabela `akitemm_convites_candidatos_lab`). Registro de B sozinho **não é indicação válida**.
4. B faz uma **compra elegível**, com Pix recebido e reconsultado no **Sandbox** e vínculo idempotente no motor; confirmar a elegibilidade de B sem confiar apenas no webhook, em e-mail ou no pedido sem PSP.
5. A aloca essa indicação validada explicitamente a **uma de suas posições** (`posicaoAlvoId` da própria conta). Persistir no SQLite com unicidade por conta B/evento, sem permitir autoindicação, transferência de indicação, dupla utilização, outro titular ou bônus real. A posição confirmada de A passa de **B branca para A amarela**; ordenação por indicação própria e desempate temporal; preservar priorização **3A:1B**. Exibir no painel Minha Equipe e Minhas Posições da interface já aprovada.
6. Com **7 posições totais de ensaio** de titulares distintos ou elegíveis e limite de 2 por titular, preparar tabuleiro existente de **centro + 6 periferias**, alimentado pelas mesmas filas. Exibir a posição de A chegando ao tabuleiro; não simular eventos ou giros a partir de requisição do navegador como se fossem pagamentos. Giro exige **6 eventos válidos distintos**, circuito de segurança e ação administrativa de ensaio; 6->5->4->3->2->1->centro, sem criar saldo real.
7. Provar o fluxo novamente após reiniciar/reabrir SQLite, com no máximo 1 posição por pedido elegível, nenhuma promoção sem compra PSP reconsultada, nenhuma indicação duplicada, não alteração da equipe alheia, reversão/chargeback bloqueando direitos indevidos, e sem saldo, comissão, saque ou transferência reais.

## Lacuna identificada nesta revisão

- `src/domain/equipe-candidata-sqlite.js` grava **somente cadastro por convite**. Sua `listar()` retorna `indicacoesQualificadas:0`.
- `src/domain/motor-conta-unica-ensaio-sqlite.js` já tem lote de compra, posição pendente, aceite, filas, tabuleiro e catraca, mas **não expõe método de validar/alocar indicação** para as posições persistidas.
- `src/domain/simulador-loop.js` e `src/domain/motor-filas.js` já implementam `registrarIndicacaoSimulada`, `registrarIndicacaoValidada` e a fila A 3:1; **reutilizar motor existente**, não criar segundo motor.
- `src/candidato/servidor-loja-escritorio-candidato.js`: rota de cadastro aceita vínculo de indicador somente vindo do gateway; sessão, CSRF, CPF e aceite de posição já existem. Criar apenas as rotas estritamente necessárias, autenticadas por titular e protegidas por CSRF.
- `src/candidato/checkout-candidato-ui.js`: Minha Equipe e Minhas Posições já existem, mas equipe ainda anuncia zero indicações qualificadas. Mostrar seleção de posição e resultado real do motor, sem refazer layout.

## Caixa/conta bancária — preparar SEM movimentação real

Separar no design de integração contábil os estados `pedido -> PSP -> recebível -> caixa da loja -> reservas/obrigações -> eventual repasse`. O comprovante de cobrança não é saldo disponível, e o Sandbox não é dinheiro. Não adicionar credenciais bancárias, números de conta, CPF/CNPJ real, endpoint de saque, chave Pix de terceiros ou `POST /transfers`. Deixar o perfil de recebimento PF/PJ configurável futuramente, sujeito à regularização de CNPJ e à aprovação de titularidade/contrato com o PSP. Não registrar ganhos reais nem prometer R$ 750.

## Entrega e aceite

- Trabalhar em **bloco grande**, atacando o fluxo inteiro. Não inflar testes; usar testes de integração que demonstrem os estados acima com evidência de causa/efeito.
- Executar testes pertinentes e registrar evidências **no GitHub** com um documento conciso: pedido, cobrança Sandbox, webhook, posição A, convite B, compra de B, seleção de posição, fila A e tabuleiro; não incluir PII ou tokens.
- Preservar a fonte única de SQLite, o estilo e as regras aprovadas, e anotar qualquer conflito de regra para decisão antes de modificar a política financeira.
- Fazer commits na branch de trabalho ou branch filha; abrir PR DRAFT se necessário. **Não fazer merge nem deploy público.**
- Ao final, informar apenas: **o que ficou integrado, o que foi provado funcionando e os bloqueios reais**. A integração jurídica/financeira de participação remunerada é bloqueio independente e não é autorizada por sucesso técnico.
