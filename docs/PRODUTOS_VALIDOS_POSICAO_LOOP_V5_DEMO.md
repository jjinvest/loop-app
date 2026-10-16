# LOOP V5 — Produtos autorizados para a posição na fila (laboratório)


> **Atualizacao de 16/10/2026:** esta documentacao descreve a **regra padrao de uma posicao por pedido**. A excecao de **produto especial autorizado para cinco posicoes no mesmo pedido** foi implementada em laboratorio e esta detalhada em `docs/PRODUTO_ESPECIAL_CINCO_POSICOES_LOOP.md`. O limite de cinco posicoes abertas simultaneamente por CPF (simulado por conta em laboratorio) continua valendo, e uma posicao que conclui o ciclo libera uma vaga. A configuracao especial exige disponibilidade integral de cinco vagas e subtotal especial minimo equivalente a cinco referencias LOOP; nao habilita pagamento real.

## Decisão comercial

**Todos os produtos publicados começam autorizados a contar para o mínimo do LOOP.** O administrador pode, individualmente, mudar qualquer produto para "somente loja", sem ocultá-lo do catálogo e sem impedir sua compra. Também pode reautorizar depois.

**Uma posição por pedido qualificado:** somente a soma dos itens autorizados de **um mesmo pedido** deve alcançar o valor mínimo da posição, atualmente R$ 250. Compras separadas não se acumulam. Quantidades do mesmo produto contam normalmente (por exemplo: 2 × R$ 150 = R$ 300). Um PDF vendido por R$ 250 pode contar como uma posição; não precisa haver produto físico.

| Pedido de exemplo | Total vendido | Total que conta para o LOOP | Resultado com mínimo R$ 250 |
|---|---:|---:|---|
| PDF autorizado | R$ 250 | R$ 250 | Uma posição |
| Produto autorizado | R$ 500 | R$ 500 | Uma posição |
| 2 produtos autorizados de R$ 150 | R$ 300 | R$ 300 | Uma posição |
| Produto de R$ 500 desautorizado | R$ 500 | R$ 0 | Nenhuma posição |
| Produto desautorizado de R$ 500 + autorizado de R$ 150 | R$ 650 | R$ 150 | Nenhuma posição |
| Dois produtos autorizados de R$ 150 + produto desautorizado | Preço total de todos os itens | R$ 300 | Uma posição |

## Regra técnica e histórico

O sistema trabalha com **dois totais distintos**: valor total da compra (o que foi vendido) e subtotal válido para o LOOP (o que vale para criar posição). Os itens e as autorizações são consultados no banco de dados e congelados **no registro do pedido**, para que o administrador não mude retroativamente o direito de um pedido pendente ou concluído. A referência de valor mínimo do LOOP continua a ser aplicada **na confirmação fictícia do pagamento**.

Cada produto possui revisão e histórico imutável de alterações da autorização. Produtos antigos sem configuração explícita continuam autorizados. Há um controle de revisão para evitar conflitos entre alterações administrativas simultâneas.

O catálogo da loja informa se um produto conta para a posição, e o carrinho mostra ambos os subtotais. A tela administrativa oferece o seletor "Conta para posição do LOOP?" com as opções "Sim" e "Não". O cliente não pode alterar essa informação em pedidos ou falsificar o valor elegível no corpo da solicitação.

A regra também é aplicada ao fluxo antigo de pedidos individuais de PDF, além do carrinho multi-itens. O preço e a venda do PDF permanecem válidos mesmo quando ele é desautorizado para formar posição.

## Efeitos sobre as demais regras

- Uma compra confirmada de qualquer valor continua podendo ativar o link de divulgação do comprador, **independentemente** da autorização dos produtos.
- Somente um pedido que efetivamente gerar uma posição no LOOP pode produzir a bonificação sobre a cadeira e contar como compra qualificada do convidado.
- Percentuais de indicação, comissão, caixa reserva, mínimo de saque de R$ 100, prioridade A/B, aceitação por CPF e tabuleiro permanecem separados desta configuração.

## Limites do laboratório

Nenhum processamento de cartão, pagamento real, entrega de PDF ou expedição de produtos foi implementado nesta etapa. As compras são fictícias e a autorização opera no SQLite local. Os testes precisam validar o fluxo em produção antes de utilização por clientes reais.

## Testes específicos

`test/elegibilidade-produtos-carrinho-loop.test.js` verifica autorização automática por padrão, exclusão e reautorização, valores R$ 150/R$ 250/R$ 500, pedido misto, ausência de posições indevidas, congelamento de pedidos já existentes, auditoria imutável, proteção administrativa e comportamento dos PDFs individuais.
