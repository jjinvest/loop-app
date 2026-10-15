# LOOP V5 — padrao comercial R$ 250 (decisao 15/10/2026)

**Fonte de verdade aprovada pelo idealizador:** o valor-padrao e
**R$ 250,00 por posicao elegivel**. Esta mudanca nao altera o
motor de filas, a prioridade 3 A : 1 B, o tabuleiro de cinco
vagas e centro, nem as cinco vendas de cada ciclo.

## Regras do futuro checkout da loja

1. **Pedido minimo de R$ 250,00 no TOTAL do carrinho.**
2. O cliente pode adicionar produtos individuais de qualquer
   preco comercial adequado (por exemplo R$ 50,00), mas **nao
   pode confirmar, pagar ou gerar Pix antes dos R$ 250,00**.
3. Um produto sozinho de R$ 250,00 ou mais pode seguir para
   checkout. Varios produtos que somem R$ 250,00 ou mais
   tambem podem seguir.
4. Cada pedido pago e confirmado cria **exatamente uma**
   posicao na fila B, independentemente de quantos produtos ou
   unidades compuseram aquele carrinho. Nenhum pedido nao
   confirmado cria posicao. Indicacao continua sendo
   validada somente pela primeira compra confirmada do convidado.
5. Os cursos PDF padrao na vitrine ficam em **R$ 250,00**.
   No catalogo demonstrativo, o curso modelo mostra esse preco.
6. O financeiro de cinco eventos agora utiliza referencia de
   R$ 250,00 por evento: tres referenciais do participante
   (R$ 750,00 no total) e dois da empresa (R$ 500,00 no total).
   **Sao projecoes matematicas, nao promessa ou pagamento real.**

## Planejamento comercial de produtos fisicos

O fornecedor recebe o custo acordado de seus itens;
a reserva referencial do LOOP e **por pedido elegivel**,
nao por produto individual do carrinho.

Formula bruta: `sobra comercial = total carrinho -
custo total dos fornecedores - R$ 250,00 -
taxas/tributos/despesas modeladas`.

Exemplo A: um produto de R$ 500,00, fornecedor R$ 100,00:
sobra R$ 150,00, **antes dos demais custos**.

Exemplo B: cinco unidades de R$ 50,00 (custo R$ 10,00/un.):
total R$ 250,00, fornecedores R$ 50,00,
reserva referencial R$ 250,00: sobra **-R$ 50,00**
antes dos demais custos. A regra de checkout continua
baseada no total >= R$ 250,00; margem negativa
e alerta do administrador, nao altera a regra de fila.

## Implementado e pendente

- Implementado: fonte monetaria de referencia em
  `src/domain/valor-padrao-loop.js`, simulador de
  carrinho multitem, calculos administrativos dos cinco
  eventos e reserva simulada por pre-pedido fisico;
  tests de soma, limiar e contabilizacao separada.
- Preservado: componentes historicos do laboratorio
  anteriores ao futuro checkout podem ter pedidos de teste
  abaixo do minimo. Sao exercicios isolados e nao autorizam
  a comercializacao; isso nao e um caminho de compra publica.
- Pendente: carrinho real no frontend, API segura de checkout
  com precos e custos recalculados **no servidor**,
  protecao transacional do limite R$ 250,00,
  integracao Pix/PSP e conciliacao. A vitrine publica continua
  demonstrativa e nao pode cobrar nem emitir Pix.
- Pendente: validacao operacional e juridico-contabil
  das contemplacoes e das obrigacoes comerciais.

**Nao converter esse documento em autorizacao de venda ou
remuneracao real de participantes.**
