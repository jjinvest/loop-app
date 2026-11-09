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
