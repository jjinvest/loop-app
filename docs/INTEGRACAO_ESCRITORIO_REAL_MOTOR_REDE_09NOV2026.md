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
