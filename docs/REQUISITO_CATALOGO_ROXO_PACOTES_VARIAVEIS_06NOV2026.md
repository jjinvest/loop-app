# LOOP 3.0 / AKITEMM — catálogo flexível: quadradinhos roxos e pacotes variáveis

**Registro de requisito informado pelo idealizador:** 06/11/2026. **Estado:** especificação futura **não implementada** neste bloco; não altera o desenvolvimento prioritário da integração e dos gates do Marco Zero. Preservar tela e visual original aprovados.

## Intenção da loja

- A vitrine pode mostrar, ao mesmo tempo, **qualquer combinação e quantidade** de quadradinhos cinza, verde, dourado e roxo. A grade de 12 quadradinhos (exemplo 3 × 4) é somente ilustrativa, **não** um limite de ofertas por categoria. Manter responsividade e desenho aprovado.
- **Cinza:** produto comum. **Verde:** produto elegível conforme regras do LOOP. **Dourado:** ofertas/eventos dourados existentes. **Roxo:** oferta especial administrável **distinta** da dourada. As cores são categorias visuais/operacionais da oferta, não garantias financeiras.
- Um quadradinho roxo pode conter **um produto ou um pacote com vários produtos**, incluindo várias unidades de um mesmo produto. Exemplo ilustrativo: 5 unidades de produto de R$ 100, total R$ 500, adicionadas em conjunto por uma escolha do comprador.
- Podem coexistir **muitos quadradinhos roxos**, cada um com composição, quantidade, preço/condições e configuração especial próprios; assim como muitos verdes, dourados e cinzas.
- O administrador poderá **montar, substituir e editar a composição** dos pacotes e escolher, para cada oferta roxa, as condições comerciais e o **valor previsto de cada posição** associado ao evento especial, sujeito à validação financeira, regulatória e técnica antes de liberar uso comercial.
- Mudanças futuras **não podem alterar retroativamente** produtos, quantidades, preços, titular, posição, condições ou aceites de pedidos já fechados. Cada pedido precisa de fotografia imutável da oferta e regras em vigor na compra.

## Integração esperada (planejamento, não implementação)

- Reaproveitar o mesmo catálogo, carrinho, SQLite, pedidos, PSP Sandbox, Escritórios do Cliente/Administrador e motor V6. **Não criar loja paralela, banco paralelo ou redesenhar as telas aprovadas.**
- Um clique no pacote representa adicionar a **composição total** e mostrar claramente o valor total; confirmação, estoque/entrega, pagamentos, devoluções, tributos e conferência de cada item seguem controles da loja.
- Não inferir automaticamente posições a partir do **número de itens** do pacote. Quantidade e valor de posições especiais, se existirem, exigem regra de evento versionada, autorização, limite de titular e auditoria econômica/jurídica; nenhuma ativação, ganho ou saque por mera alteração de catálogo.
- Proteger contra reenvio de pedido, descontinuidade durante checkout e disputa de edição concorrente. Nenhuma mudança de catálogo pode modificar o valor devido de compra já registrada.
- A futura especificação funcional deve confirmar como promoções/eventos roxos interagem com limites de 10 posições, valores da posição, 3A:1B, 6 eventos e passivos; não alterar essas regras por pressuposição.

## Ordem de execução

**Agora:** avançar na integração unificada, credenciais exclusivas e prova externa Asaas Sandbox, recuperação, auditoria ponta a ponta, viabilidade financeira e parecer jurídico independente.

**Depois:** implementar a liberdade de composição da vitrine e o pacote roxo na área administrativa existente, com testes de compra, preço congelado, quantidade, titularidade e não duplicação. Não introduzir funcionalidade nova em produção sem aceite explícito.

**Motivação:** ter liberdade de composição e monetização sem sacrificar o funcionamento repetível da fila/tabuleiro nem a identidade visual original.