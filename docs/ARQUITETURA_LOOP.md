# Arquitetura do Loop

## 1. Fila
A fila funciona continuamente conforme os eventos válidos do sistema.
Ela controla posições, movimentações e quem está aguardando o centro.

A fila NÃO deve depender da liberação imediata de pagamentos.

## 2. Catraca
A catraca controla quando ciclos elegíveis podem ser processados.

Fila e catraca são mecanismos separados.

A catraca poderá trabalhar com:
- modo automático;
- modo pausado;
- janelas de funcionamento;
- limites de liberações por período.

Pausar a catraca não deve parar a formação da fila.

## 3. Financeiro
Todo valor deve possuir destino contábil definido.

Valores destinados à empresa não podem ser utilizados para pagamentos de participantes.

Valores destinados a participantes não podem ser confundidos com receita disponível da empresa.

O sistema deve manter saldos separados e rastreáveis.

## 4. Administração
Informações financeiras detalhadas são privadas do administrador.

O painel público não deve exibir:
- saldo total do caixa;
- receita da empresa;
- reservas internas;
- valores administrativos detalhados.

## 5. Segurança
Nenhum pagamento real será implementado nesta etapa.

Primeiro serão construídos e testados:
fila -> elegibilidade -> catraca -> razão financeira -> simulação de liberação.

Somente depois de testes completos será considerada integração financeira real.
