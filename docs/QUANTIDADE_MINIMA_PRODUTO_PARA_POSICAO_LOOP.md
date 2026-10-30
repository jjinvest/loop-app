# LOOP V5 — Autorização e quantidade mínima por produto (laboratório)


> **Atualizacao de 16/10/2026:** esta documentacao descreve a **regra padrao de uma posicao por pedido**. A excecao de **produto especial autorizado para cinco posicoes no mesmo pedido** foi implementada em laboratorio e esta detalhada em `docs/PRODUTO_ESPECIAL_CINCO_POSICOES_LOOP.md`. O limite de cinco posicoes abertas simultaneamente por CPF (simulado por conta em laboratorio) continua valendo, e uma posicao que conclui o ciclo libera uma vaga. A configuracao especial exige disponibilidade integral de cinco vagas e subtotal especial minimo equivalente a cinco referencias LOOP; nao habilita pagamento real.

## Dois controles independentes

O administrador configura cada produto do catálogo com:

1. **Conta para o LOOP?** Sim por padrão. A opção “não” deixa o produto disponível na loja, mas seu valor não contribui para formar uma posição.
2. **Quantidade mínima para contar no LOOP:** 1 unidade por padrão. O administrador pode escolher um inteiro entre 1 e 100 unidades para cada produto. A quantidade precisa ser atingida **dentro do mesmo pedido**, não por compras acumuladas. Esta regra funciona mesmo quando o produto continua marcado como autorizado.

O cálculo do carrinho, em centavos, tem dois totais:

- **Total da loja:** quantidade × preço de cada item, independentemente da autorização.
- **Total que conta para o LOOP:** soma dos subtotais de cada item cujo produto esteja autorizado **e** cuja quantidade tenha atingido o mínimo específico do produto.

Depois da confirmação de pagamento fictício, o motor compara o *total que conta para o LOOP* com o **valor único da cadeira vigente na data de confirmação**. Se atingir o mínimo, cria **exatamente uma posição azul**, sem multiplicar pelo valor ou pela quantidade da compra. Compras menores continuam válidas como vendas da loja; a ativação do link por qualquer compra continua independente da aquisição de posição.

## Exemplos com valor mínimo da cadeira de R$ 250

| Pedido único | Regras do produto | Total da compra | Conta para a fila | Posição |
|---|---|---:|---:|---|
| 1 PDF de R$ 250 | Autorizado, mínimo 1 | R$ 250 | R$ 250 | 1 |
| 1 produto de R$ 500 | Autorizado, mínimo 1 | R$ 500 | R$ 500 | 1 |
| 2 produtos de R$ 150 | Autorizado, mínimo 1 | R$ 300 | R$ 300 | 1 |
| 19 canetas de R$ 50 | Autorizadas, mínimo **20** | R$ 950 | R$ 0 | 0 |
| 20 canetas de R$ 50 | Autorizadas, mínimo **20** | R$ 1.000 | R$ 1.000 | **1** |
| 1 caneta de R$ 50 + 2 itens de R$ 150 | Caneta exige 20; demais exigem 1 | R$ 350 | R$ 300 | 1 |
| 1 produto de R$ 500 | **Desautorizado** | R$ 500 | R$ 0 | 0 |

Uma quantidade inferior ao mínimo específico de um item **não impede** que outros produtos autorizados no mesmo carrinho contem para a fila, se suas próprias regras de quantidade forem cumpridas.

## Proteções do sistema

- O preço unitário, o estado autorizado/desautorizado, a quantidade mínima e suas respectivas revisões são gravados no pedido. Mudar um produto depois **não altera pedidos anteriores**, mesmo que ainda estejam aguardando confirmação.
- O comprador não pode enviar ao servidor uma quantidade mínima arbitrária nem declarar seu próprio subtotal válido; estes campos vêm do catálogo e do banco interno.
- Ajustar o mínimo ou a autorização exige a sessão administrativa local, e as alterações de quantidade possuem histórico imutável e controle de concorrência por revisão.
- O módulo de pedido PDF de **uma unidade** também respeita a quantidade mínima. Por exemplo, se o PDF exigir duas unidades, um pedido PDF unitário não cria posição; o carrinho de múltiplos itens pode atender essa regra.
- Produto físico, curso PDF, compra para liberar o link e criação de posição permanecem separados. Não foram implementados pagamento, entrega de mercadoria ou saque reais.

## Testes

`test/produtos-quantidade-minima-loop.test.js` cobre caneta de R$ 50 com 19/20 unidades, uma posição por pedido, compras separadas que não somam, produtos mistos, mudanças de mínimo de 20 para 5, desautorização, reautorização, histórico protegido e pedidos PDF únicos. O projeto contém ainda os testes da elegibilidade simples, valor da cadeira e campanhas de indicação.

## Observação financeira

Essa regra permite ao administrador estabelecer uma quantidade que reflita melhor custos e margem, **mas não calcula por si só o lucro líquido**: antes de comercializar produtos reais, será necessário conferir custo do fornecedor, frete, tributos, taxas e bonificação do caixa reserva. Nunca criar múltiplas posições automaticamente por quantidade ou valor acima do mínimo.
