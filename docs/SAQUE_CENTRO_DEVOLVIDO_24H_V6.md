# LOOP V6 — Retorno de saque do centro e reabertura de pedido

## Regra operacional pretendida

Uma posição na fila não cria crédito de contemplação. Somente a posição que ocupou o CENTRO e teve o seu ciclo de seis eventos concluído gera parcelas previstas (ordens 1, 3 e 5). O acesso à fila e a compra de um produto têm direitos e responsabilidades comerciais próprios, separados desse crédito; a regra não afasta obrigações de consumidor ou legais.

Após liquidação bancária efetiva, o titular poderá solicitar saque do montante disponível no Escritório Virtual. A solicitação reserva o valor para evitar duplo saque. Se o banco recusar por chave, conta, dados cadastrais ou destinatário inválidos, o pedido muda para FALHOU_AGUARDANDO_RETORNO e a quantia **permanece reservada**. O retorno ao saldo do escritório só acontece depois que o provedor efetivamente confirmar a devolução e a reconciliação do dinheiro. Nenhuma nova contemplação e nenhum giro são criados.

Quando o retorno estiver confirmado, o pedido anterior é encerrado como DEVOLVIDO_AO_ESCRITORIO. O titular pode corrigir seus dados e fazer uma nova solicitação; o novo pedido terá novo identificador e novo prazo de processamento de 24 horas corridas. O sistema deve impedir confirmação duplicada e preservar todos os registros, inclusive o motivo da falha. Um pedido realmente concluído não pode ser devolvido por engano.

## O que existe agora em laboratório

- `RetornoSaqueCentroV6DemoSQLite` guarda pedidos fictícios e eventos em tabelas imutáveis, transições idempotentes, bloqueia a liberação antes do evento de retorno, não aceita evento de sucesso depois de falha e não devolve duas vezes.
- GET/POST `/api/laboratorio/participante/saque-centro-v6-demo`: acesso identificado pela sessão da própria conta; o navegador NÃO escolhe outra conta e NÃO confirma a resposta do banco.
- POST `/api/admin/circuit-break-v6-demo/saque-centro-v6-demo/eventos`: somente administrador LOCAL do laboratório pode injetar eventos fictícios de envio, falha, retorno e sucesso. Não usa CPF real nem integração bancária.
- O Escritório Vilela exibe a referência de ciclo prevista, reservas de teste, histórico de retorno e opção de NOVO pedido fictício.

**Importante:** este laboratório demonstra o mecanismo com valores de referência de ciclos concluídos, não com saldo bancário real. `disponivelParaSaqueRealCentavos` e `transferenciasReaisExecutadas` permanecem ZERO. Essa simulação NÃO permite saque real, não valida a origem financeira e não transforma previsão em direito sacável.

## Futuro fluxo com PSP real

O lançamento de devolução só deve ocorrer após confirmação autenticada e conciliada do provedor financeiro, incluindo identidade da transação, valor, moeda, titular e status final. O montante disponibilizado para novo pedido nunca pode superar o valor originalmente reservado e efetivamente restituído, e eventual tarifa/estorno cobrado pelo PSP precisa ser tratado segundo os termos e as normas aplicáveis. Se houver atraso, registrar pendência e informar o titular. Não cumprir prazo de 24 horas às custas de pagamento indevido.

PR #1 permanece rascunho. Nenhuma operação bancária real foi conectada.