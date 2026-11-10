# LOOP 3.0 — Escritório Virtual, motor e indicação no mesmo SQLite

Data 09/11/2026. Estado **LEITURA INTEGRADA APROVADA EM ENSAIO**. PR #1 DRAFT não inclui automaticamente a branch de feature.

O Escritório Virtual original reutiliza HTML e CSS existentes; o injetor `interface-aprovada-loop.js` insere somente o seletor de posição no painel já existente. A aplicação servida por `servidor-identidade-loop.js` é a mesma para cliente, loja e motor, com sessão individual. Não há código de frontend capaz de criar uma posição, confirmar compra, aprovar giro ou solicitar Pix real.

A projeção `VisaoEscritorioUnificadaSQLite` consulta exclusivamente o mesmo banco do motor e da identidade:
- `loop_real_contas` e `loop_real_vinculos_indicacao` — nick de indicação e vínculo de cadastro
- `loop_real_motor_compras` — ID de posição e origem do **pedido de ensaio**
- `loop_real_motor_qualificacoes` — qualificação de convite simulada, por titular e posição
- `loop_real_motor_estado` via `MotorLoopIntegradoSQLite.consultar` — filas, tabuleiro, contador de seis eventos e catraca

Contratos HTTP:
- `GET /api/loop/estado`: visibilidade de posição/pedido/indicação **somente do titular autenticado**, mais contador público de filas e vagas; flags `financeiroReal:false`, `somenteLeitura:true`, `catracaClientePodeGirar:false`.
- `GET /api/contas/minha-rede?offset=N`: os convidados associados ao titular da sessão, com `QUALIFICACAO_ENSAIO`, `COMPRA_ENSAIO_SEM_QUALIFICACAO` ou `CADASTRO_AGUARDANDO_COMPRA`, resumo paginado e proibição de comissão real.

**Não misturar** estas tabelas de ensaio com `loop_real_eventos_comerciais` (pedidos da loja em espera de conciliação). A cor comercial, pagamento em Sandbox, luz de teste, vínculo de cadastro e simples presença em fila não liberam crédito, posição remunerada, titularidade ou catraca de produção.

Prova GitHub Actions `42702365360` SUCCESS, incluindo testes de HTTP para dois titulares e seis eventos de catraca. Nenhum deploy, merge, dinheiro ou giro real. O histórico completo e as limitações estão na seção 309 do HUB de continuidade.

Próximo trabalho após este bloco: preparar e homologar a ponte **PSP autenticado -> comprovação de liquidação -> elegibilidade de posição -> fila A/B -> motor/catraca** com autorização, rastreabilidade e auditoria real. A implementação de laboratório não deve ser promovida simplesmente por alterar flags.


## Compra verde qualificada ligada ao motor apenas em homologação interna (09/11/2026)

Foi adicionada `PromocaoPedidoMotorEnsaioSQLite`, uma ponte opcional da camada de pedido e classificação congelada para `MotorLoopIntegradoSQLite`, sem qualquer endpoint HTTP de escrita. Depois de pagamento comercial confirmado **e com autorização explícita somente de ensaio**, a ponte valida a regra VERDE de produtos de pelo menos R$250 (frete não conta) e registra posição única na fila B no mesmo commit do banco. A autorização é uma etiqueta de SIMULAÇÃO, não prova de liquidação. Se não houver regra explícita, existir item ROXO/DOURADO, valor divergente, cancelamento, limite 10 ou reaproveitamento da prova, a ponte não promove nada. Saques e giro real nunca são liberados.

A promoção consulta snapshot do carrinho, pedido, titular, id nativo de pagamento e `loop_real_eventos_comerciais`; a posição é criada atomicamente no mesmo SQLite com idempotência e trilha imutável. Em estorno posterior, a operação fica em quarentena e bloqueia a catraca de ensaio sem descartar a posição do histórico. A confirmação da compra pelo PSP sozinha permanece `AGUARDANDO_CONCILIACAO` até verificar independência bancária real. A visibilidade do participante é isolada por cookie de sessão e inclui informações rotuladas de ensaio.

O backup cifrado `src/producao/backup-identidade-real.js` passou a incluir e conferir semântica da tabela de promoções, cruzando pedido/evento/motor/posição. O CI `42712589354` foi aprovado, inclusive HTTP da interface original e restauração. Um lote em produção, a liberação de cliente real, a confirmação de CPF/termos para posição azul, produtos dourados/roxos e os pagamentos são pendências distintas; não usar esta suite como autorização para go-live.


## Continuacao 311 — azul, CPF/termos, reversao e cores mistas (09/11/2026)

**Azul pendente:** a ponte verde grava PENDENTE na mesma transacao SQLite do pedido e motor. O indice ordenado permanece internamente na fila B, mas PENDENTE nao e elegivel para alimentacao do tabuleiro; a consulta publica informa AGUARDANDO_CPF_TERMOS e o contador da fila B ativa exclui a espera.

**Aceite individual:** o modulo src/producao/aceite-posicao-azul-ensaio-sqlite.js valida CPF sintaticamente, aceite explicito, titular, versao/hash dos termos e e-mail confirmado. Registra somente HMAC-SHA256 do CPF sob chave de ensaio, trilha imutavel e idempotencia por posicao. A confirmacao altera o mesmo registro para ACEITE_ENSAIO, sem criar segundo ID. Nao executa KYC independente nem concede dinheiro. Esta funcao de ensaio nao tem endpoint HTTP publico; nao solicitar CPF real na tela enquanto faltar autorizacao e custodia homologadas.

**Reversoes:** apos evento PSP cancelado, a suspensao grava registro imutavel, muda a posicao para REVISAR_PSP e pausa a catraca. Repeticao nao duplica; historico e aceite sao mantidos. Sem compensacao bancaria ou reativacao automatica.

**Douradas e roxas:** o planejamento congelado separa cinza (zero), verde (uma por pedido >= R$250 elegiveis, sem frete), dourado (uma por unidade) e roxo (quantidade configurada pelo admin por unidade). O total misto inclui roxas para testar limite de 10 mesmo quando continuam BLOQUEADAS de ativacao. O campo legado totalPosicoesPrevistas conserva sua semantica; o novo totalPosicoesMistasPrevistas inclui todos os tipos. Nao ha criacao de especiais no motor ou financeiro real.

**CI comprovado:** https://github.com/jjinvest/loop-app/actions/runs/42735438314 SUCCESS no commit 8b1829a89c12f8f3f7afb8c1db98e049caefc13b. Branch feature/unificar-escritorio-real-20261105 distinta da branch da PR #1 DRAFT. Nenhum merge/deploy.

**Faltam para uso real:** aceite por interface autenticada e KYC externo, custodia de identidade, multi-posicoes especiais com aprovacao financeira, pagamento liquidado e conciliado em banco, compensacao de reversoes e autorizacoes juridicas/PSP/bancos.


**Complemento auditado da continuidade 311 (09/11/2026):** a conferencia de integridade do aceite AZUL compara os registros imutaveis de CPF/termos, reversao e o snapshot/indice da mesma posicao. Uma alteracao direta em estado de adesao sem registro de consentimento agora bloqueia a auditoria e o backup. Regressao em test/promocao-pedido-motor-ensaio-sqlite.test.js. Ultima suite da identidade: https://github.com/jjinvest/loop-app/actions/runs/42736127247 SUCCESS, commit f503b326606c0eed1bc509f8f1fa03611a598c9f. Nenhum endpoint publico novo, merge, deploy ou dinheiro real.

## Correcao de regra 312 — AZUL SE MOVIMENTA, CONFIRMACAO SO CONTROLA RECEBIMENTO (10/11/2026)

**VIGENTE; substitui toda afirmacao contraria na continuidade 311.** Identificado e revertido erro introduzido na rodada 311: a pendencia de CPF/termos NUNCA deve bloquear avancos da posicao azul. A compra qualificada gera a posicao azul e a inclui na fila B; ela participa normalmente das selecoes e, se receber indicacao validada, pode migrar para fila A conforme as regras existentes. CPF/termos apenas determinam elegibilidade individual para participacao/recebimento.

A regra ja estabelecida e implementada em src/domain/tabuleiro-loop.js: **quando a posicao entra na catraca pela vaga 6**, se ainda PENDENTE, vira dourada sob titularidade operacional LOOP_EMPRESA, sem pausa, retirada arbitraria, reinicio de fila ou mudanca de ID. Isso tambem vale para preenchimento inicial, que cruza logicamente a mesma entrada. A conversao nao deve retroceder por aceite tardio, e a distribuicao de um futuro centro dourado segue o roteamento financeiro do motor. A posicao confirmada antes da vaga 6 conserva sua titularidade. Desistencia explicita e estorno PSP sao casos distintos, sem confundi-los com falta de aceite.

Retirada em src/domain/motor-filas.js a condicao que excluia PENDENTE da selecao, e a exclusao de indicacoes para a posicao pendente. Atualizada a projecao do Escritorio para apresentar fila B com as azuis ainda circulando (nao ocultas sob AGUARDANDO_CPF_TERMOS); o contador posicoesAzuisPendentes e separado e abrange A+B. A custodia de aceite individual e o rastro de auditoria continuam validos e nunca criam uma segunda posicao. A quarentena de PSP cancelado continua como controle de integridade financeira: nao e uma trava por falta de CPF.

Regressoes dedicadas de fluxo: test/entrada-vaga-6-azul-dourado.test.js e test/promocao-pedido-motor-ensaio-sqlite.test.js. Branch feature/unificar-escritorio-real-20261105, sem merge/deploy ou pagamentos reais. **Nao reintroduzir bloqueio de fila/catraca por CPF/termos**. Antes de anunciar conclusao, conferir CI no commit final e declarar separadamente o que esta ou nao homologado.
