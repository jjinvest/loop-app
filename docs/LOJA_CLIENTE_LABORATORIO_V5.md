# LOOP V5 — Loja do cliente com carrinho (somente laboratório)

## O que mudou

A partir da área `/laboratorio/participante`, o comprador fictício autenticado abre **Entrar na loja do LOOP** em `/laboratorio/loja`. A página mostra produtos PDF e físicos publicados no catálogo local, um carrinho em memória com quantidades, total estimado e histórico exclusivamente da própria conta.

O comprador envia SOMENTE `{itens:[{produtoId,quantidade}]}`. O servidor:
1. Reconhece a identidade pela sessão HttpOnly e não aceita `contaId`, preço, ID do pedido ou flag de pagamento no corpo;
2. Gera um ID aleatório de pedido;
3. Busca no catálogo interno cada produto e **congela os preços**, descrição, revisão e total do pedido;
4. Grava o pedido como **AGUARDANDO_FICTICIO**, sem emitir pagamento nem criar posição;
5. Permite consultar só os pedidos da própria conta.

A confirmação fictícia continua **exclusivamente administrativa**. Quando o administrador registra um evento de confirmação por `/api/admin/carrinho-loop-demo/:pedidoId/eventos`, a integração interna verifica o evento e o valor total do pedido. Atingir o mínimo configurado gera exatamente **uma posição azul**, exibida depois no escritório individual. Compras menores ficam apenas na loja.

### Regras de segurança demonstradas

- Sessão individual temporária, cookie HttpOnly, SameSite=Strict, cabeçalho obrigatório anti-CSRF nas requisições de alteração.
- URLs de pedidos de outros compradores retornam 404. A listagem filtra o titular **no banco de dados**.
- A vitrine e os endpoints são apenas do servidor local de laboratório e **não existem no servidor público**.
- O cliente não pode informar pagamento concluído nem emitir posições diretamente.
- No máximo 20 carrinhos pendentes de teste por conta; até 20 produtos diferentes por carrinho.
- Uma sessão expirada exige novo login de laboratório.
- UI trabalha com `textContent` e DOM seguro, sem `innerHTML` e sem guardar sessão ou carrinho em `localStorage`.

### O que NÃO está implementado

Não existe checkout público, cobrança de verdade, entrega automática de PDF real, emissão de notas fiscais, processamento de frete, fornecedor real nem distribuição financeira. Não usar dados de compradores reais neste laboratório.

## Arquivos

- `src/laboratorio/loja-cliente-demo.html`, `.js`, `.css`
- `src/routes/participante-laboratorio-demo.js`
- `src/domain/carrinho-loja-loop-demo-sqlite.js`
- `test/loja-cliente-sessao-carrinho.test.js`

O próximo trabalho é amadurecer esse protótipo em checkout e entrega de verdade quando estiverem definidos o provedor de pagamento e a infraestrutura final.
