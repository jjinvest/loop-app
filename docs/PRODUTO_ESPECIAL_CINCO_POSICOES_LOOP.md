> **ATUALIZAÇÃO DO LOOP V6 (16/10/2026):** este arquivo preserva decisões anteriores para consulta histórica. A regra vigente no laboratório é **centro + 6 vagas, entrada pela vaga 6, 6 vendas por ciclo (cliente, investimento, cliente, reserva, cliente, investimento), até 6 posições abertas por CPF/conta fictícia, pacote especial de 6, saque mínimo de R$ 25 e taxa de 3% sobre cada saque de bônus ou participação**. Consulte `docs/LOOP_V6_SEIS_VAGAS_SAQUE_25_TAXA_3.md`. Não há saques nem pagamentos reais.

# LOOP V5 — Produto especial com cinco posições (laboratório)

## Regra solicitada em 16/10/2026

Um produto do catálogo pode ser configurado pelo administrador como **produto especial de cinco posições**. Ao confirmar o pagamento de um pedido que respeite a autorização do produto, a quantidade mínima e a referência financeira vigente, o motor cria **exatamente cinco posições independentes** na fila B vinculadas a **um mesmo pedido**, de forma atômica. Nenhum produto comum muda: por padrão, cada pedido qualificado abre somente uma posição.

- O seletor de cada produto oferece **1 (padrão) ou 5 posições** e possui histórico versionado.
- O pedido congela o preço, quantidade mínima, elegibilidade e a modalidade 1/5. Configurações futuras não reescrevem o pedido.
- Para o pacote, o subtotal elegível dos próprios itens especiais deve cobrir ao menos cinco vezes o valor da posição vigente no instante da confirmação (referência inicial: 5 × R$ 250 = R$ 1.250). O preço e custo real do fornecedor ainda exigem estudo.
- Mesmo com vários produtos especiais ou quantidades elevadas num mesmo carrinho, o pedido oferece **até cinco posições no total**, não cinco por unidade.
- As posições têm IDs próprios e iguais direitos de deslocamento pela regra A/B, mas compartilham o pedido e a data de aquisição. A origem de cada posição fica registrada em livro imutável.
- A criação é integral: havendo 0 vagas suficientes, nenhuma posição do pacote é criada. Nunca criar 2, 3 ou 4 posições de um pacote de cinco para completar o limite.
- O sistema só permite **cinco posições abertas simultâneas por titular**. Quando uma posição efetivamente conclui seu ciclo e deixa o conjunto de posições abertas, uma vaga é liberada, podendo o participante comprar e abrir **uma nova posição comum** até completar cinco outra vez. Outro pacote de cinco só cabe se existirem novamente cinco vagas livres.
- Se uma posição azul perde o prazo antes do tabuleiro e passa a dourada, deixa de contar como posição do comprador, conforme a regra anterior. Isso é **diferente** de concluir seu ciclo.
- Compra e geração de posições continuam independentes da segunda ativação: sem CPF/termos, as posições surgem **azuis**; com adesão já aceita, surgem **ativas**. Não há créditos por indicações antes do aceite.
- O limite é **planejado por CPF real**, mas atualmente as provas automatizadas usam **contas fictícias e CPF de laboratório**; não existe validação de CPF real nem lançamento público.
- Não foi definida nova política de bônus por indicação para cinco posições: até revisão econômica e jurídica, a implementação conserva **uma bonificação demonstrativa por pedido qualificado**, e não multiplica automaticamente o bônus por cinco.
- A compra fica sujeita a custos e tributos, reserva da empresa, eventuais estornos e a obrigação financeira potencial de cinco ciclos. Não há base para prometer lucro, pagamento, contemplação ou sustentabilidade automática.

## Implementação e garantia de integridade

- `src/domain/elegibilidade-produtos-loop-demo-sqlite.js`: configuração histórica, somente administrativa.
- `src/domain/carrinho-loja-loop-demo-sqlite.js`: fotografia imutável da modalidade do produto no pedido.
- `src/domain/ponte-compras-convites-demo-sqlite.js`: confirmação fictícia confiável, cinco IDs criados numa transação, limite antes da criação, sem crédito real.
- `src/domain/escritorio-individual-demo.js`: os cinco números podem corresponder à mesma compra; o limite observa as posições ainda abertas, não o total histórico de posições concluídas.
- `src/domain/historico-loja-escritorio-demo.js`: compra exibe lista de posições, inclusive para vários estados.
- Telas administrativas, loja e escritório exibem a modalidade e os números do pacote.
- `test/produto-pacote-cinco-posicoes-loop.test.js` cobre configuração, autorização administrativa, IDs individuais, limite de cinco, idempotência, cinco posições no escritório, giro simulado de um ciclo, vaga reaberta, histórico imutável e modalidade normal.

## Pendências para operação

Formalizar contrato, política comercial, elegibilidade por CPF único verificado (com concorrência atômica), estornos e devoluções, origem contábil de todos os ciclos, custo dos cinco benefícios, limite por conta no checkout antes da cobrança, adequação LGPD e revisão jurídica/regulatória. **Não ativar pagamentos reais nem saques a partir deste módulo demonstrativo.**
