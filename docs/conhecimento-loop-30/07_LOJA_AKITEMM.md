# 07 — Loja AKITEMM

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Catálogo, ofertas, fotos/PDFs/vídeos, filtros, carrinho, pedidos, fornecedor, frete e outbox usam módulos existentes; não construir outra loja. Congelar classificação/preço/custos do pedido para não reescrever compras antigas quando produto mudar.

Taxonomia dos PRODUTOS separada das cores LOOP: CINZA só venda, não qualifica posição/link/bônus; VERDE soma somente itens verdes elegíveis do mesmo pedido sem frete e, se atingir R$ 250, no máximo uma posição; DOURADO uma posição por unidade; ROXO quantidade explicitamente configurada pelo operador, sem dividir preço por 250. Compra mista aplica cada classe independentemente. Pedidos separados não acumulam para completar o piso.

Link pode habilitar com compra confirmada de produto habilitador mesmo verde abaixo de R$ 250; isso não gera posição/comissão nessa compra. LARANJA tem intenção de habilitar link, mas política de classificação/posições precisa configuração explícita: não inventar regras. O benefício não é herdado só da cor na tela.

Antes de confirmar oferta, verificar limites/capacidade, identidade, pagamento e estoque. PSP/outbox precisam idempotência e tratamento de INDETERMINADO sem reenvio cego. Produtos/frete/custos e impostos não podem ser ignorados para prometer separação de R$ 250.

Visual: preservar carrosséis, filtros, upload/editor, crop e molduras existentes. Fonte atual é interface aprovada e contrato congelado, não páginas demo antigas. Histórico de pedidos pertence exclusivamente ao titular; ausência de credencial bancária não justifica preencher venda real fictícia.

## Fontes integrais preservadas

- [REGRAS_POSICOES_POR_COR_AKITEMM_20261105.md](../REGRAS_POSICOES_POR_COR_AKITEMM_20261105.md)
- [CONTINUIDADE_OPERACIONAL_LOJA_FILAS_PORTEIRA_CATRACA_23 NOV2026.md](../CONTINUIDADE_OPERACIONAL_LOJA_FILAS_PORTEIRA_CATRACA_23NOV2026.md)
- [Código: src/producao/interface-aprovada-loja.js](../../src/producao/interface-aprovada-loja.js)
- [Código: src/producao/pedidos-comerciais-sqlite.js](../../src/producao/pedidos-comerciais-sqlite.js)
- [Código: src/producao/avaliador-qualificacao-pedidos-real.js](../../src/producao/avaliador-qualificacao-pedidos-real.js)
- [Código: src/producao/pedidos-fornecedor-outbox.js](../../src/producao/pedidos-fornecedor-outbox.js)
- [Código: src/producao/catalogo-multidistribuidores-sqlite.js](../../src/producao/catalogo-multidistribuidores-sqlite.js)

[Voltar ao índice geral](README.md).
