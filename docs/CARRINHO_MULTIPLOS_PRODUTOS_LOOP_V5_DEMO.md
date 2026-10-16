# LOOP V5 — Carrinho de múltiplos produtos (laboratório)

## Regra implementada

- O carrinho reúne de 1 a 20 produtos **publicados** do catálogo (PDF ou físico), em quantidades inteiras de 1 a 100 cada.
- O preço unitário, a revisão do produto, o nome, o tipo, a quantidade e o subtotal são fotografados no momento do **pedido**. O total é a soma exata dos subtotais em centavos.
- O comprador é vinculado ao pedido **antes** do evento de confirmação. O pedido, a lista de itens, o total e a titularidade são imutáveis.
- Quando o administrador registra a confirmação **fictícia**, o motor recebe o total do **pedido único** por um comprovante construído internamente. O campo de pagamento não é aceito do navegador.
- Se o valor total atingir a referência LOOP vigente na confirmação (inicialmente R$ 250), o pedido cria **exatamente uma posição azul**, nunca uma por item. Se não atingir, é registrado como venda somente da loja.
- Compras separadas não são somadas para atingir o mínimo. Um pedido de R$ 125 e outro de R$ 125 permanecem sem posição.
- A nova posição entra inicialmente na **fila B**, mesmo quando o comprador já tem outra posição na A. As demais regras de indicações e prioridade continuam inalteradas.
- Confirmações ou sincronizações repetidas são idempotentes, sem duplicar vagas.
- Estorno fictício posterior aciona sinalização de conferência e não remove automaticamente posição nem reescreve histórico.
- A referência LOOP pode mudar: uma compra posterior a essa mudança usa o novo valor, enquanto o valor de posições antigas fica preservado.
- Todos os produtos e pessoas são **fictícios**, sem processamento de pagamentos, envio, entrega ou cursos reais.

## Tela de testes

No painel financeiro do laboratório, seção **Carrinho com vários produtos**, é possível:

1. Escolher uma conta compradora fictícia.
2. Informar um ID de pedido único.
3. Adicionar vários produtos e quantidades ao mesmo pedido e conferir a soma na tela.
4. Registrar pedido, congelando valores e dados do comprador.
5. Simular evento de confirmação e observar se a compra gerou posição no LOOP.
6. Conferir o status e tentar novamente uma sincronização que tenha ficado pendente.

## Arquivos principais

- `src/domain/carrinho-loja-loop-demo-sqlite.js`
- `src/routes/admin-carrinho-loop-demo.js`
- `src/laboratorio/servidor-catalogo.js`
- `src/laboratorio/financeiro-admin-demo.html`
- `src/laboratorio/financeiro-admin-demo.js`
- `test/carrinho-loop-multiplos-itens.test.js`

## Limites

A demonstração usa a ferramenta administrativa local, não um checkout público. A parte financeira, reserva de mercadorias físicas, pagamento real, frete e entrega continuam fora deste fluxo. O mecanismo de 5 giros e a visualização de posições pertencem aos módulos de simulação já testados.
