# LOOP 3.0 / AKITEMM — Asaas Sandbox conciliado → lote pendente no motor (05/11/2026)

## Resultado técnico — homologação, não comercial
- Branch: `feature/unificar-escritorio-real-20261105`.
- Após **comando autorizado de reconsulta independente do Asaas Sandbox**, o worker persiste o retorno GET do PSP em SQLite e verifica a autenticidade do vínculo pedido/titular/pagamento/valor/referência. O webhook isolado NUNCA cria posição.
- Quando o evento é `PAYMENT_RECEIVED` e o PSP foi reconsultado com status `RECEIVED`, sem revisão/reversão, **a mesma operação aciona automaticamente** `motorConta.vincularPedidoConferidoSandbox`. Este método revalida o PSP dentro da transação BEGIN IMMEDIATE e aplica a fotografia imutável do lote planejado. Exemplos: verde R$ 1.000 = 1 posição, dourado = 1 por unidade, roxo = n configurado.
- As posições são de **ensaio, pendentes (azuis)**. Uma posição não se torna confirmada simplesmente por ter pagamento validado no Sandbox. Confirmação de CPF/termos por posição, KYC externo, motor comercial e financeiro seguem bloqueados.
- O callback e GET reexecutados não duplicam posição; existe índice único por pedido, registros de lote e número de posição, contagem atômica do máximo dez ativas. Falha de lote não reverte uma reconsulta PSP concluída nem dispara nova cobrança; uma rota estrita de operador permite reavaliar pedido após corrigir eventual pendência.
- A reconsulta de `PAYMENT_REFUNDED` / chargeback classifica o PSP como `EXIGE_REVISAO`; **a suspensão do lote funciona mesmo nesse estado**, desde que o vínculo tenha sido revertido no PSP. O motor marca as posições do lote `REVISAR_PSP`, pausa a catraca e impede uso dessas posições na alimentação da fila/tabuleiro, mantendo o histórico. Não há reativação automática.
- Critério de reversão não equivale a política comercial de estorno; garantias e direitos do consumidor dependem de revisão jurídica.
- Código do LOOP, loja, telas aprovadas, gráficos, cores e finanças não receberam novo redesenho. O motor continua usando o mesmo SQLite de cliente/admin/loja.

## Gatilhos e bloqueios
- Esta versão **NÃO** contém um worker cron independente que consulte automaticamente todo PSP sem comando de reconsulta. O gatilho da reconsulta é operador/homologação; uma vez concluída, o vínculo com o motor é automático. Não declarar checkout público, recebimento real, liquidação financeira, comissão, renda ou saques.
- Aplicação candidata é bloqueada em `NODE_ENV=production`; a prévia Railway é privada, sem operações financeiras reais. `operacoesSandboxAutorizadas` exige autorização operacional explícita.
- CPF/termos exigem confirmação **por posição** no próximo bloco; o cadastro de CPF/termos de laboratório existente é por titular e não substitui KYC nem aceite individual. Não confundir posições pendentes com contas confirmadas.
- Reversões e capacidade permanecem revisáveis pelo operador. Suspensões consomem capacidade até resolução auditada; isso é intencional e fail-closed.

## Provas de regressão
- Teste E2E `test/asaas-motor-automatico-sandbox-candidato.test.js` registra um pedido roxo de cinco posições, uma cobrança Pix de Sandbox em provedor falso determinístico, aviso recebido, consulta independente ao PSP e cinco posições pendentes no mesmo titular. Sem consulta: zero posições; replay: nenhuma duplicação; estorno confirmado: cinco posições suspensas.
- Suítes do projeto, teste em Chromium PC e celular na branch de integração. Confirmar o run vigente antes de marcar como sucesso final.
- A PR #1 permanece DRAFT; sem merge, deploy comercial ou pagamentos reais.
