# LOOP V5 — R$ 250 para participar, loja sem pedido minimo (15/10/2026)

**Decisao vigente:** a loja virtual vende produtos de qualquer valor
positivo. O limite de R$ 250,00 **nao restringe compras da loja**:
determina apenas se um pedido de compra confirmado tambem cria uma
posicao no LOOP. Substitui a regra anterior de pedido minimo de
R$ 250,00. Esta alteracao nao modifica motor, prioridades ou tabuleiro.

## Distincao central

| Pedido confirmado | Loja | LOOP |
|---|---|---|
| R$ 10,00; R$ 50,00; R$ 249,99 | Venda normal | 0 posicoes; nao valida indicacao |
| Exatamente R$ 250,00 | Venda normal | 1 posicao B |
| R$ 500,00 ou mais | Venda normal | 1 posicao B |

Os produtos fisicos podem ser mais baratos e o cliente pode levar
um ou muitos itens. A soma do carrinho **dentro do mesmo pedido**
define a elegibilidade. Compras de R$ 100 e R$ 150 realizadas
**separadamente** nao se tornam uma compra de R$ 250 para fins de
LOOP. Uma compra confirmada >= R$ 250 vale exatamente UMA posicao
independentemente do numero de itens comprados. Produtos PDF padrao
continuam em R$ 250. Nao existe produto de afiliado.

Um comprador pode comprar so na loja sem participar do LOOP. Uma
indicacao somente e valida depois que o convidado confirmar UMA
compra de R$ 250 ou mais. Compras menores nao fazem o indicador
migrar para A. O limite de cinco posicoes ativas restringe so
compras elegiveis para o LOOP; nao impede mais compras comuns.

## Financeiro de cada pedido

Parcela LOOP referencial de R$ 250,00 **so para o pedido
elegivel**. No pedido comum, parcela referencial = R$ 0,00.

Margem BRUTA preliminar (sem tributos ou custos que nao foram
modelados): valor de venda - custo dos fornecedores -
parcela referencial aplicavel - demais custos informados.

- Venda comum de R$ 50 com fornecedor a R$ 10:
  margem bruta R$ 40 antes de outros custos; 0 posicoes
  e 0 reserva LOOP.
- Pedido de R$ 500 com fornecedor a R$ 100:
  R$ 250 referenciais ao LOOP e R$ 150 de margem bruta
  antes dos demais custos; 1 posicao.
- Um pedido de cinco unidades a R$ 50 (fornecedor a R$ 10
  cada) totaliza R$ 250; mesmo elegivel ao LOOP, faltam
  R$ 50 para cobrir ao mesmo tempo fornecedor e referencia
  LOOP. A analise administrativa sinaliza o deficit.
  Nenhuma margem ou contemplacao e garantida.

Cinco eventos de ciclo continuam com tres parcelas
referenciais do participante e duas da empresa; a conta
teorica usa R$ 250 por parcela, sem pagamentos reais.

## Implementacao em laboratorio

- `src/domain/valor-padrao-loop.js` calcula cart de multiplos
  itens, venda permitida de qualquer preco >0, elegibilidade
  separada, reserva 0/250, margem e uma posicao por pedido.
- `src/domain/ponte-compras-convites-demo-sqlite.js` registra
  vendas ficticias confirmadas <250 em livro SQLite imutavel
  separado, SEM posicao, convite, motor ou snapshot alterado.
  Ao atingir >=250, usa a ponte de fila ja existente.
- `src/domain/escritorio-individual-demo.js` permite que o
  titular veja separadamente suas compras comuns e posicoes.
  Visao do admin tambem separa as duas modalidades.
- A vitrine informa que a loja permite qualquer valor, mas
  o checkout e Pix reais **ainda nao existem**.
- O planejamento antigo de pre-pedidos fisicos e o simulador de
  pagamentos sao modulos isolados; integrar seus calculos
  comercial/LOOP ao checkout real continua pendente.

Antes de abrir a operacao: implementar carrinho/checkout no
servidor com catalogo e impostos reais, PSP/Pix com confirmacao
assinada e idempotente, fluxo logistico e juridico-contabil
aprovado. Nenhum teste atual autoriza pagamentos ou premio real.
