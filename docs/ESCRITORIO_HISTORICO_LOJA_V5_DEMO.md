# LOOP V5 — Escritório Virtual e acompanhamento de pedidos (laboratório)

## Objetivo

Reunir na mesma área pessoal o acompanhamento da loja, a origem das posições e a ativação por CPF **fictício** e termos de demonstração. Nada aqui representa checkout, pagamento ou contemplação real.

## Como funciona

1. Comprador entra no escritório em `/laboratorio/participante` com uma conta fictícia e sessão HttpOnly.
2. Da mesma área pode acessar `/laboratorio/loja`, escolher vários produtos e registrar um carrinho.
3. O pedido fica **AGUARDANDO_CONFIRMACAO**. Registrar um pedido não cria posição.
4. O administrador do laboratório registra o evento fictício confirmado; a ponte verifica o valor do pedido e a regra da referência vigente. Se o pedido atingir o mínimo, gera uma posição azul na B. Caso contrário, registra somente a compra da loja.
5. Na próxima atualização, o escritório mostra o status do pedido sem abrir a sessão de outro cliente.
6. Quando há posição azul, o escritório mostra um alerta e atalho para CPF de teste + aceite dos termos. Após ativação, a posição aparece vermelha para o titular e cinza para os demais.
7. A posição que entrar no tabuleiro sem ativação fica dourada, e o histórico dessa compra passa a exibir a condição final de titularidade operacional do LOOP.

## Estados do histórico

| Estado interno | O que o titular lê |
|---|---|
| AGUARDANDO_CONFIRMACAO | Aguardando confirmação do pagamento de teste |
| AGUARDANDO_ATIVACAO | Posição azul: aguardando sua ativação |
| POSICAO_ATIVADA | Posição ativada |
| POSICAO_DOURADA_LOOP | Posição dourada: pertence ao LOOP |
| COMPRA_SEM_POSICAO | Compra confirmada, sem posição no LOOP |
| ESTORNO_EM_CONFERENCIA | Estorno de teste: em conferência |
| SINCRONIZACAO_PENDENTE | Confirmação ou posição em conferência |

O histórico consolida carrinhos e compras confirmadas individualmente, de forma que um pedido qualificado **não aparece duas vezes**. Os valores e nomes de itens de carrinho vêm de snapshots gravados no pedido, e não do catálogo atual.

## Proteção de dados e isolamento

- `GET /api/laboratorio/participante/minha-conta` identifica o usuário pela sessão, não por `contaId` fornecido no navegador.
- A seleção dos carrinhos da conta acontece no SQLite, com `WHERE conta_id=?`.
- A projeção devolve apenas campos necessários (ID do pedido, itens, valores e estado). Não inclui telefone, e-mail, CPF, dados de contato ou identidade de terceiros.
- A tela utiliza `textContent`, links internos e elementos DOM sem HTML injetado.
- A API e as páginas somente existem no ambiente local de laboratório.

## Cobertura

`test/escritorio-historico-loja-integrado.test.js` verifica o ciclo de acompanhamento de pedidos, confirmação administrativa, promoção de cor para vermelho, transição para dourado e dois compradores isolados.

## Limitações

A integração não habilita pagamento real nem entrega de mercadoria. Um pedido ainda pode precisar de conferência depois de um estorno ou problema de sincronização; o histórico não altera automaticamente posições já criadas. O protótipo ainda precisa de autenticação e infraestrutura apropriadas para produção.
