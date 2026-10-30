# LOOP 3.0 — Testes de persistência SQLite, falhas, duplicidade e contas

21/10/2026 · **Laboratório local, sem dinheiro real, deploy ou dados pessoais reais.**

## Bateria comprovada
Suite: `test/loop-v6-sqlite-operacao-interrompida-concorrente.test.js`.
CI `Testes do LOOP`: run **39665558807 — SUCCESS**, contém os novos testes junto com a regressão geral.

### Rodada de pedidos persistentes
- **500 clientes distintos** em **SQLite real de arquivo** (não somente simulador em memória).
- Para cada cliente: **um PDF de R$ 250** que deve criar uma posição, mais **um produto físico de R$ 190** sem posição. **1.000 pedidos válidos** processados de maneira concorrente por `Promise.all`, com repetição intencional de cada notificação (mais de 1.000 verificações idempotentes).
- Reinicialização física do banco no cliente nº250; livros reabertos do disco, snapshot e filas preservados, pedidos antigos repetidos sem posições extras.
- Cada carteira de cliente conferida em amostras de antes e depois da reinicialização: **1 posição, 1 compra comum, 5 vagas livres (de seis)**.
- Falha de pagamento simulada antes de aprovação: **zero posição e zero venda**; quando o comprovante se torna confirmado, cria **apenas uma posição**.
- Modificação posterior do valor de comprovante rejeitada sem alterar o ledger; reversão para o comprovante original idempotente.
- **Duas instâncias com conexões independentes ao mesmo arquivo SQLite** processaram o mesmo pedido simultaneamente no mesmo event loop; exatamente uma criou a posição, outra devolveu repetição, sem divergência de número de posições.
- Falha injetada por snapshot inválido: operação não gravou uma compra parcial; snapshot restaurado, compra repetida e concluída uma vez.
- Total final de operações comerciais gravadas: **503 PDFs qualificados**, **500 físicos de R$190**, **1.003 pedidos** (os três PDFs adicionais correspondem a retomada de pagamento, concorrência e reparo após falha deliberada).
- **1.011 entregas de evento repetidas ignoradas**, sem criar novas posições.
- `PRAGMA integrity_check` retornou `ok`; `PRAGMA foreign_key_check` retornou nenhum erro.

### Fila, vínculo, indicação, saque, reserva — SQLite persistente
Teste adicional em SQLite real gravado e reaberto:
- Um titular comprou **duas posições**; confirmou ambas **individualmente**.
- Dois convidados compraram PDFs, permaneceram **azuis sem gerar bônus**, depois validaram CPF fictício/termos e ficaram verdes.
- Dois bônus de **R$25** provisionados somente após confirmação verde, total **R$50**. Vínculo de cada convidado feito para **uma posição diferente** do titular; repetição idempotente e mudança indevida do vínculo bloqueada.
- Painel `EscritorioIndividualDemo` consultado com contadores verdes/distribuídos, permitindo conferir coerência entre o ledger e a visão.
- Saque de bônus de **R$25** solicitado no laboratório, taxa de 3% = R$0,75, líquido simulado R$24,25; segunda submissão com mesmo identificador foi repetida, **não duplicada**. Nenhuma transferência bancária ocorreu; uma conta distinta não recebeu o histórico de saque alheio.
- Reserva demonstrativa fornecida ao teste de **R$500** com **R$50** de bonificações provisionadas; livre demonstrativo **R$450**, sem descontar o saque novamente. Trata-se de fixture contábil do teste, não valor de ciclos ou saldo bancário. Após reiniciar o banco, bônus, saques, vínculo e saldo livre permanecem idênticos.
- Casos de caixa com douradas financiadas pela reserva e bloqueio de valor comprometido estão em `test/disponibilidade-caixa2-integracao-v6.test.js`, incluídos na mesma suíte geral e aprovados.

## Limitações deliberadas
- Esta bateria **não** reproduz 5.000 compradores reais com 5.000 contas persistentes; o teste de 5.000 compradores foi feito **separadamente** no motor V6, sem SQLite para todas as entradas (veja `docs/RELATORIO_TESTE_GERAL_5000_21OUT2026.md`).
- As chamadas com `Promise.all` correm num processo Node com `DatabaseSync`, isto é, testa repetição e duas conexões mas **não prova** 1.000 máquinas, workers, múltiplos servidores ou clientes simultâneos competindo por uma transação distribuída. Um teste de carga com múltiplos processos/infraestrutura será etapa posterior.
- Pagamento é comprovante fictício confiável de laboratório, não integração PSP/Pix. CPF é fictício, venda e saque não movimentam dinheiro, sem custo de fornecedor ou tributos.
- O cenário persistente não movimenta a catraca real 500 vezes nem comprova contemplações financeiras finais: estas condições continuam cobertas pelos testes separados do motor e de cofre.
- Em produção, será indispensável persistência/backup adequados, monitoração, conciliação de PSP e extratos bancários, segurança antifraude, compliance e testes de carga distribuída.

## Próximos passos prioritários
1. Carga em **múltiplos processos** com arquivo SQLite compartilhado e falhas intermitentes para investigar bloqueios e política de retry; nunca ativar transações reais neste ensaio.
2. Consulta cruzada entre livro de pedidos, posições, reservas, saques e painel em um conjunto de dados persistentes maior; se houver divergência, bloquear saídas afetadas e criar trilha de auditoria.
3. Depois do sistema estável em laboratório, testes de capacidade de rede/app/browser com usuários virtuais em ambiente isolado, de preferência antes de aceitar clientes reais.

Nenhuma tela aprovada, regra de pagamento, controle de catraca, main, merge ou deploy foi alterado nesta rodada.
