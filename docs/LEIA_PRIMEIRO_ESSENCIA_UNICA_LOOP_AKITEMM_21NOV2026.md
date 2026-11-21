# LEIA PRIMEIRO — ESSÊNCIA ÚNICA DO LOOP 3.0 / AKITEMM

**Decisão do idealizador reconfirmada em 21/11/2026.** Documento de continuidade obrigatório para outra IA, desenvolvedor, auditor e operador. Fonte de trabalho: repositório `jjinvest/loop-app`, branch ativa `feature/unificar-escritorio-real-20261105`. Verifique o HEAD, as telas congeladas, o código publicado e os testes antes de editar. Não recomece o projeto. Documentos antigos são histórico; em caso de conflito, prevalece a última decisão explícita do proprietário. **Este documento não atesta dinheiro real liberado nem conformidade jurídica.**

## A essência em uma frase

**AKITEMM vende → a venda qualificada alimenta a fila → as filas A/B acumulam posições e determinam quem é o próximo → a porteira controla se/quando uma posição pode atravessar → a catraca, governada pelo motor, pelo caixa e pelo relógio, executa o tabuleiro e seus eventos autorizados.**

**Metáfora da porteira:** o rebanho continua se alimentando e aumentando mesmo com a porteira fechada. Do mesmo modo, fechar a catraca **não para vendas, novas posições, vínculos válidos, prioridades, nem a acumulação do caixa**. As peças são **separadas em responsabilidades** e **unidas por uma única cadeia causal e registros persistidos**. Não criar processos fictícios para fazer um LED ou o tabuleiro parecer funcionar.

## As cinco responsabilidades, sem misturar causas e efeitos

1. **LOJA AKITEMM — vende:** recebe pedidos comerciais reais; a qualificação da compra depende da cor, preço, produto, pedido liquidado, cliente e regras atuais. Produto **cinza** não gera posição; **verde** qualifica até uma posição por compra quando a parte elegível atinge R$ 250; **dourado** segue sua regra de posição direta; **roxo** segue a quantidade comercial explicitamente configurada para combos/eventos. Pagamento, frete e estoque devem ter origem demonstrável. **Venda não é luz, não é giro nem crédito sacável**.
2. **FILAS A/B — acumulam e ordenam:** uma venda qualificada cria posição legítima vinculada à compra/titular. O motor guarda seu identificador, estado, ordem e histórico. A prioridade de abastecimento do tabuleiro é **3A:1B** quando as duas filas têm elegíveis; sem A, a B alimenta. Indicações válidas promovem posições segundo a regra vigente. A fila continua viva com a porteira fechada. Limites vigentes: **10 posições ativas por titular**, no máximo **2 posições do mesmo titular no tabuleiro**; posições impedidas aguardam sem desaparecer. Confirmar na fonte e nos testes a versão atual de promoção B→A antes de modificar.
3. **CAIXA — acumula recurso comprovado, sem inventar saldo:** fluxo comercial pretendido: fintech/PSP recebe uma venda liquidada, paga fornecedor e custos aprovados, separa **R$ 250 para o caixa central LOOP quando a venda elegível e sua política comportarem esse repasse**, e encaminha o saldo comercial restante à conta da loja, descontadas obrigações aplicáveis. **Caixa AKITEMM** e **caixa LOOP** são diferentes; a **Central do Administrador** consulta os dois sem criar um terceiro saldo duplicado. Cofres internos LOOP, caixa dourado e carteiras dos participantes não se confundem. Fora do horário de execução da catraca, valores recebidos e conciliados continuam acumulados.
4. **PORTEIRA — autoriza ou bloqueia a passagem:** é a trava do movimento da fila para a catraca/tabuleiro. Janela horária, data, modo, meta, autorização explícita do operador, disponibilidade financeira/reserva, posição elegível, integridade do motor e outras travas compõem uma única decisão de passagem. Fechar **não apaga fila nem caixa**; abrir **não fabrica pagamento**. A fila decide **quem**, a porteira verifica **se/quando**, o caixa determina **quanto pode ser financiado**.
5. **CATRACA / TABULEIRO / RELÓGIO — executam e mostram:** o tabuleiro mantém **1 centro + 6 periféricas**, entrada pela vaga 6, avançando até 1 e centro. A catraca completa **6 eventos por centro**, na ordem 1/3/5 destinada ao centro, 2/6 ao cofre esquerdo e 4 ao direito, com regra especial para posição dourada. O relógio determina o ritmo dos eventos no modo programado. As seis luzes **representam eventos contabilizados/autorizados**, sem converter tempo transcorrido em crédito por conta própria. O operador precisa enxergar a programação e o caixa; o cliente vê apenas informações operacionais permitidas, sem dados administrativos.

## Regras da catraca e da janela

- **PAUSADO:** vendas e filas continuam crescendo; nenhum evento financeiro novo da catraca ou giro por comando do relógio. Saldos reais podem acumular. Pausar não desfaz posições ou agenda gravada.
- **LIVRE:** só com ativação explícita; uma compra qualificada/liquidada com parcela financeira disponível pode habilitar um evento na cadência real, respeitando todas as travas. Não usar reserva antiga de programação e não realizar seis eventos sem seis autorizações independentes.
- **PROGRAMADO:** operador escolhe data (opcional), abertura, fechamento e **meta de centros**, baseada no caixa líquido verificado e **reservado**. O relógio distribui `meta × 6` eventos na janela. **Não exige seis novas compras durante o turno:** usa recursos já acumulados e segregados. **Exemplo autorizado de programação:** 22/11/2026, 09:00–12:00, 5 centros → 30 luzes → intervalo de 6 minutos por luz. **Isso é plano, não promessa de cinco pagamentos**: sem cobertura/autorizações, bloquear a execução financeira e mostrar motivo auditável.
- **Sincronia:** relógio, indicadores das luzes, motor, fila e livro de eventos consultam uma programação persistida e identificadores auditáveis. Nunca executar um giro somente porque uma animação piscou. A sequência de LEDs meramente prevista é diferente dos **eventos financeiros confirmados**; os indicadores não devem mascarar essa diferença.
- **Catraca como porteira:** quem governa a ordem das posições é o motor das filas. A programação governa apenas cadência e permissões de execução, jamais a existência de pedidos e posições.
- **Não retroagir:** ao abrir uma janela no meio do turno, não disparar todos os marcos vencidos em rajada. Não gastar reservas duas vezes. Reinício e tentativa repetida precisam ser idempotentes e auditados.

## Visibilidade e links ORIGINAIS — não enviar genéricos ao proprietário

- **Escritório personalizado VILELA:** `https://akitemmloop.com.br/escritorio/VILELA`.
- **Loja personalizada VILELA:** `https://akitemmloop.com.br/loja/VILELA`.
- O apelido exclusivo do proprietário é **VILELA**; outros titulares recebem seus próprios links por nick. Não substituir por `/escritorio` ou `/loja` nas mensagens de validação pessoal. Não enviar URL com domínio fictício, laboratório, Railway técnico ou preview.
- A sessão de **operador** edita o LOOP e a AKITEMM sem mudar o visual aprovado. Na **Central**, o operador consulta os dois caixas. No **rodapé do Tabuleiro do LOOP**, deve poder ver o caixa do LOOP. Na **AKITEMM**, deve poder consultar o caixa da loja. Dados bancários e administração ficam ocultos para clientes comuns. Exibição de caixa pendente não equivale a saldo real integrado.

## Estado técnico / pendências — não confundir código com funcionamento bancário

- A branch de integração contém o motor SQLite, registro de prioridades, agenda e controle de catraca, interface operador e contratos de reserva/caixa. A área pública trafega pelo gateway do domínio AKITEMM para o serviço de identidade real; conferir deployment e rotas antes de declarar publicação.
- O código atual de operação da catraca (`src/producao/operacao-catraca-admin-sqlite.js`) **não libera giros financeiros produtivos** apenas com a agenda. A reserva bancária autenticada, a distribuição efetiva via PSP, o consumo transacional e o saque real dependem de integração e prova externa. **Nunca remover essa proteção para parecer concluído**.
- Luzes e relógio podem possuir **animação de agenda** visual sem prova bancária. Não apresentar essa animação como evento financeiro, posição, contemplação ou pagamento real.
- Integrações Celcoin / Asaas / bancos / fornecedor, conciliação de liquidação, documentos de operação e avaliação jurídica/contábil permanecem gates a comprovar antes de fluxo financeiro público.
- Há documentação antiga que descreve "seis novas vendas por giro" e limites diferentes; isto **não prevalece** sobre a regra mais recente: a fila cresce pelas vendas, a catraca programada consome **reserva do caixa**, não exige novas vendas durante o turno.
- Testes verdes, Railway online e DNS válido **não certificam** login no celular específico, upload real de foto, caixa bancário, split bancário ou contemplação. Verificar cada um com evidência da interface publicada, preservando dados reais.
- **Política de preservação:** alterar apenas o módulo necessário; não mudar, apagar, desfazer ou recalcular unilateralmente decisões aprovadas. Fazer testes cruzados de login, fotos, fila, relógio, luzes, tabuleiro, loja e central antes de publicar.

## Arquivos de leitura obrigatória e ordem de precedência

1. **Este documento** — interpretação da arquitetura unificada, analogia da porteira e URLs originais.
2. `docs/ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md` — modos, caixas, seis destinos, dinheiro e bloqueios.
3. `docs/REGRA_DEFINITIVA_FILA_E_CATRACA_POR_CAIXA_17NOV2026.md` — distinção entre vendas/fila e giros por reserva financeira.
4. `docs/REGRAS_POSICOES_POR_COR_AKITEMM_20261105.md` — elegibilidade dos produtos.
5. `docs/LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md`, `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md`, `docs/HUB_CONTINUIDADE_MARCO_ZERO_07NOV2026.md` — histórico e rastreabilidade, **com prioridade para decisões posteriores**.
6. **Código e testes no HEAD atual** — a prova do que está de fato implementado e publicado. Havendo divergência entre decisão de negócio e código, tratar como **pendência**, não como autorização para redefinir a regra.

**Síntese que nenhuma IA deve inverter:** **AKITEMM alimenta → FILA acumula/ordena → PORTEIRA restringe passagem → CATRACA processa no TABULEIRO → RELÓGIO governa o ritmo permitido → CAIXA comprova e limita cada evento financeiro.** Tudo é uma só operação, composta de módulos com responsabilidades diferentes.
