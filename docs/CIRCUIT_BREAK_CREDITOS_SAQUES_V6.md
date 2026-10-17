# LOOP V6 — Circuit Break, crédito por giro e saque do próprio titular

Requisito revisado pelo idealizador em **17/10/2026**. **Especificação futura**, não significa implementação de dinheiro, PSP ou banco. A referência visual V6 aprovada não muda.

## Duas decisões independentes

1. **Controle administrativo do ritmo da catraca.** O administrador pode colocar em PAUSA, definir um limite diário e solicitar lotes de giros (por exemplo 3, 4, 5 ou 10). Cada giro só pode acontecer quando o motor apresentar seis eventos de compras válidas ainda não utilizados, tabuleiro apto e ordem A/B correta. A pausa não elimina vendas, posições, crédito já reconhecido ou obrigações legais; os ciclos aptos permanecem pendentes. O limite impede excesso, mas não produz caixa.
2. **Direito individual de solicitar saque de saldo efetivamente disponível.** Uma vez que a posição do centro conclua o giro e exista crédito confirmado, conciliado, permitido contratual e juridicamente, o valor correspondente deve ser lançado automaticamente no extrato do próprio titular. O administrador **não terá botão para aprovar/recusar discricionariamente cada saque** de um saldo devido e disponível. O próprio titular solicita pelo escritório, respeitando critérios transparentes e proteção antifraude; o provedor realiza o processamento.

## Estados e registro contábil para futura implementação

- `CICLO_PRONTO`: seis eventos distintos e confirmados; precisa de comando de giro dentro das regras de fila, sem execução simultânea duplicada.
- `GIRO_CONCLUIDO`: evento de ciclo auditável com ID único, centro, seis vendas, regra da época, destinação e horário. Não repetir o mesmo ciclo.
- `CREDITO_PREVISTO`: valor matemático atribuído ao titular; **não é saldo sacável**.
- `PENDENTE_LIQUIDACAO_E_CONCILIACAO`: dinheiro ainda não liquidado / pagamento contestável / obrigação não validada.
- `DISPONIVEL_PARA_SOLICITACAO`: somente após origem de fundos confirmada, reserva de estornos e obrigações, saldo individual reconciliado, CPF/termos adequadamente verificados e viabilidade jurídica do arranjo. Deve ser visível individualmente.
- `SAQUE_SOLICITADO`: o titular pede valor bruto com mínimo demonstrativo R$25 e taxa demonstrativa de 3%; registro atômico, idempotente e sem dupla reserva; acesso apenas pela sessão do titular.
- `PROCESSANDO_NO_PROVEDOR`, `PAGO`, `FALHOU`, `CANCELADO_POR_MOTIVO_VALIDO`: o status deve vir do provedor autenticado e de reconciliação. Falha não equivale a pagamento e reserva de saldo requer solução consistente.

**Não impor espera de autorização arbitrária do administrador depois de um crédito disponível.** Congelamentos legais, prevenção de fraude, restrições obrigatórias do provedor, contestação ou indisponibilidade de fundos devem ter motivo, trilha auditável e tratamento de suporte; nunca esconder a falta de caixa.

## Exemplo estritamente fictício

Com seis PDFs hipotéticos a R$250 gerando seis eventos independentes, um centro ocupado por cliente em situação regular teria destinação referencial de **três parcelas de R$250 = R$750**, sem transferência real. Um pedido de saque de R$750 teria taxa de **R$22,50 (3%)** e valor líquido **R$727,50**, caso a taxa seja contratualmente válida e os recursos estejam realmente disponíveis.

**Um giro pode encerrar a posição do centro, mas não deve criar dinheiro.** Se não houver dinheiro liquidado e conciliado, o sistema deve indicar o crédito como pendente, não como saldos bancários sacáveis nem como "dinheiro no caixa".

## Prazos, promessas e limites

- Prazo de **24 horas** é apenas exemplo do idealizador. Não codificar como garantia de transferência antes de verificar as condições e SLAs de um parceiro de pagamentos.
- O rótulo `PARTICIPACAO_LUCRO` existe no laboratório de saques, mas **a natureza jurídica não está estabelecida**; destinação de parcelas pagas por novos compradores não deve ser anunciada como distribuição de lucro líquido sem contabilidade e revisão jurídica.
- A existência de produtos reais e um aceite de CPF/termos **não torna automaticamente o modelo lícito nem afasta direitos do consumidor**, obrigações de restituição, regras de proteção de dados e responsabilidades contratuais.
- Os testes atuais do laboratório **deliberadamente bloqueiam** saques de `PARTICIPACAO_LUCRO` até existir um livro conciliado e um parecer jurídico. Preservar o bloqueio; esta especificação não o remove.
- Não permitir configuração administrativa de girar **sem** seis eventos válidos, alterar prioridades, editar retroativamente titularidade, gastar reservas inexistentes ou efetuar transferência real diretamente de uma tela de teste.

## Implementação incremental autorizada nesta fase

Pode-se desenvolver: botões e estados de controle de giros **simulados**, histórico imutável por lote, visualização de créditos **fictícios** a partir do ciclo e solicitação de saque **fictício** pelo titular. Nenhuma integração com transferências bancárias, saldo sacável real, divulgação com promessa de remuneração ou publicação está autorizada.

**Branch:** `fix/teste-escrita-catraca-20261014`. **PR #1:** manter aberta em rascunho, sem merge ou publicação.
