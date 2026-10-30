# LOOP V5 — Integração da loja PDF com posições azuis (laboratório)

## Funcionamento implementado

1. Uma conta de laboratório existe, com cadastro fictício e sem CPF.
2. Um curso PDF publicado é escolhido, e um pedido fictício é criado com o preço do catálogo **congelado no pedido**.
3. **Antes de qualquer confirmação de pagamento**, o administrador vincula o pedido à conta compradora. O vínculo e a referência da compra ficam imutáveis.
4. Um evento `CONFIRMAR_FICTICIO` é registrado no módulo PDF. O servidor consulta esse evento internamente e chama automaticamente a ponte `PonteComprasConvitesDemoSQLite`. O navegador nunca decide se o pagamento foi efetuado.
5. A ponte avalia a **referência do LOOP vigente na data de confirmação**:
   - Compra qualificada: cria **uma posição azul** aguardando CPF e aceite das regras no escritório virtual.
   - Compra abaixo da referência: permanece como **venda da loja sem posição**.
6. Se o comprador foi indicado por outro usuário, sua primeira compra qualificada valida uma indicação (uma única vez). O indicador que já possui posição em B migra para A.
7. Repetir o evento de confirmação ou a sincronização não cria posição duplicada.
8. Estornos fictícios depois da confirmação são assinalados para conferência e **não apagam automaticamente** a posição já registrada.

## Como demonstrar no painel

1. Abrir o laboratório financeiro e cadastrar/publicar um curso PDF.
2. Em **Cursos PDF**, criar pedido fictício.
3. Em **Vincular pedido PDF a uma conta fictícia**, escolher pedido e conta existente.
4. Em **Simular pagamento do pedido PDF**, registrar `CONFIRMAR_FICTICIO`.
5. Ver a situação da posição no mesmo painel e no escritório individual do comprador.
6. Se houver necessidade de recuperação de uma confirmação já gravada, utilizar **Conferir sincronização do pedido com o LOOP**. A sincronização consulta o estado persistido e nunca aceita `pago=true`.

## Limitações atuais

- Fluxo integrado nesta etapa: **pedido de curso PDF com um produto**. Carrinho com múltiplos produtos e total combinado ainda não fazem parte deste módulo.
- O catálogo de produtos físicos, frete e fornecedor ainda não estão ligados a essa integração.
- Não há recebimentos reais, checkout público, arquivos de curso de verdade, repasse de dinheiro ou contemplação. A execução é apenas no painel administrativo local.
- As posições e os pedidos seguem armazenados no SQLite do laboratório; o aplicativo público permanece separado.

## Verificação

- `test/integracao-pdf-loop-automatica.test.js` cobre pedido qualificado, compra menor, indicação paga, idempotência, congelamento da titularidade, estados após estorno, rotas privadas e interface administrativa.
- O projeto inclui testes anteriores da regra 3A/1B e do motor de cinco giros.
