# LOOP 3.0 — REGRA DEFINITIVA: FILA POR VENDAS, CATRACA POR CAIXA E RELÓGIO
Atualização solicitada pelo proprietário em 17/11/2026, após esclarecimento explícito da operação.

## 1. Dois processos que NÃO podem ser confundidos

**Fila (entrada de posições):** cada compra elegível, recebida e confirmada pelo PSP, cria posição conforme a cor/regra do produto. A fila B recebe posições e a fila A recebe prioridade por indicações válidas (3A:1B). Ambas continuam recebendo posições e atualizações mesmo quando a catraca está em STOP/PAUSA. Uma venda não é, por si só, uma luz ou um giro. O motor da fila não movimenta automaticamente o centro por ter entrado dinheiro.

**Catraca (execução de posições já acumuladas):** quem define quantos centros devem ser concluídos por dia é o administrador, dentro do número que o caixa líquido/reserva financeira COMPROVADA comporta. **Não exigir seis novas vendas durante o turno para iluminar um centro.** As seis luzes representam seis eventos financeiros previamente provisionados para aquele centro, distribuídos pelo relógio; não são seis novas compras. As luzes se acendem só com disponibilidade financeira validada, programação autorizada e posição elegível no centro. O sexto evento permite completar um ciclo; deslocamento físico e crédito financeiro permanecem separados e auditados.

## 2. Operação do relógio

- Horários de abertura e fechamento são escolhidos pelo administrador e não mudam automaticamente quando ele altera a meta.
- Meta diária de centros N: 0 desliga a distribuição automática e mantém o comando manual; N positivo resulta em N×6 luzes planejadas. Janela de 09h a 18h = 540 minutos.
- Intervalo médio entre luzes = (minutos disponíveis × 60)/(6×N) segundos. Exemplos: 1 centro/6 luzes = 90 min; 5 centros/30 luzes = 18 min; 10 centros/60 luzes = 9 min. Segundos não inteiros devem ser distribuídos sem arredondamentos cumulativos, para que a última luz caiba no turno.
- A data é opcional; se especificada, aplica-se só ao dia. Sem data, a programação pode recorrer nos dias ativos **somente se houver reserva financeira comprovada para cada dia**, não por copiar saldo do dia anterior.
- Se o administrador ligar a meta no meio do turno, distribuir apenas pelo tempo restante; nunca executar retroativamente em rajada os eventos perdidos.
- STOP, pausa manual e modo livre continuam separados da meta: o operador pode parar/iniciar sem alterar as filas; a configuração não inicia o motor automaticamente.

## 3. Período de acumulação

A operação planejada entre 01/12/2026 e 01/01/2027 é receber compras reais e acumular posições, mantendo a catraca parada por decisão do administrador. Não confundir esse planejamento comercial com habilitação de PSP ou abertura pública: cadastrar, vender e movimentar dinheiro só após aprovação externa e verificações necessárias. Não programar desbloqueio automático em 01/01 nem lançar créditos antes da autorização explícita.

## 4. Controles financeiros obrigatórios para implementação produtiva

1. Saldo disponível **líquido, conciliado e reservado** no cofre certo, com prova de PSP/banco autenticada no servidor. Valor digitado pelo operador **não** é comprovação bancária.
2. Reserva segregada por centro, calculada a partir das obrigações efetivas de cada evento; nunca assumir valor sem política financeira aprovada. Impedir reutilizar comprovante, reservar mais do que o disponível ou usar a mesma reserva duas vezes.
3. Uma autorização de luz por janela e posição/ciclo, com chave única e livro imutável. Falta de saldo, divergência, estorno, posição inelegível, pausa ou falta de caixa: bloquear nova luz, sem atribuir crédito ou posição fictícia. Nunca tirar da reserva financeira valores que pertençam a fornecedor, impostos, encargos ou outros cofres.
4. No sexto evento, exigir autorização do operador/política ativa, integridade do tabuleiro e registro auditável do giro. Crédito e saque reais só com prova financeira e condições externas efetivamente homologadas.
5. O relógio **não transfere dinheiro**. O administrador escolhe a meta; os eventos são consumidos de reserva comprovada, nunca por seis novas vendas naquele momento. Uma meta é teto operacional, não promessa de pagamento independente de caixa.

## 5. Implementação e estado verificável

- Cálculo de janela e meta: `src/domain/meta-lotes-catraca-loop.js`.
- Camada de reserva segregada e autorização de luz, separada do motor: `src/producao/controle-caixa-catraca-loop-sqlite.js`; bloqueia sem `confirmarReservaCentros` de um adaptador externo verificado. Não gera créditos, Pix ou giro.
- Prova independente: `test/controle-caixa-catraca-loop-sqlite.test.js` mostra 5 centros/30 luzes sem exigir vendas novas, mas usando comprovante externo **simulado no teste**; isso NÃO comprova autenticação bancária real.
- Motor legado `src/domain/motor-conta-unica-ensaio-sqlite.js` e a implementação inicial `src/producao/operacao-catraca-admin-sqlite.js` AINDA têm dependências de eventos de compra por luz/giro. **Não liberar produção afirmando que a independência está completa enquanto essas dependências não forem substituídas por reserva comprovada e integração transacional.**
- Status: contrato correto estabelecido e controle de reservas isolado; ligação definitiva ao motor real, prova bancária, contabilização financeira e autorização de saques ainda bloqueadas. Manter sistema atual sem giro produtivo até comprovar essas etapas.

Esta regra substitui, para a operação futura, a premissa dos documentos de 06/11/2026 de que seis novas vendas/PSP alimentam diretamente os seis eventos de cada centro. Esses documentos antigos permanecem como histórico e não são a regra comercial vigente.
