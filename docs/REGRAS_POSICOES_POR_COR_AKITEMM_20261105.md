# AKITEMM — posições por compra e classe de produto (decisão 05/11/2026)

## Regra comercial aprovada pelo proprietário
As classes de cores da LOJA AKITEMM são **apenas classes de produto**. Elas nunca representam as cores/estados de posições e filas do LOOP.

1. **CINZA:** nenhuma posição, independentemente do preço ou valor agregado dos produtos cinza. Não contribui para o piso dos verdes.
2. **VERDE:** a soma **apenas dos itens verdes elegíveis** de **um pedido finalizado** deve alcançar R$ 250, sem considerar frete. Se alcançar, **exatamente uma posição no máximo por pedido**, mesmo que a soma dos verdes alcance R$ 500, R$ 1.000 ou mais. Nenhum quociente por R$ 250; nenhum saldo remanescente transferível para outro pedido. Para obter nova posição por verdes, é necessário finalizar uma **nova compra** que também atenda aos critérios.
3. **DOURADO:** cada unidade comprada gera **exatamente uma posição** (após comprovação dos requisitos de pagamento e demais controles), seja na mesma compra ou em pedidos distintos. Preço individual suficiente, geralmente R$ 250 ou maior, a definir pelo administrador; preço acima disso **não multiplica posições**. Três unidades douradas = três posições.
4. **ROXO:** produto/evento especial com **quantidade de posições definida individualmente pelo administrador** no cadastro, e não calculada automaticamente do preço. Exemplo: veículo de R$ 10.000 configurado para **cinco posições** (não dez). A compra qualificada do evento deve respeitar configuração, estoque, pagamento confirmado, capacidade e aprovação operacional antes de gerar as posições. Não inferir número de posições a partir do preço.

**Compras mistas:** as regras são avaliadas independentemente: os itens CINZA não contam para os VERDES; itens DOURADOS geram posição por unidade; itens ROXOS seguem suas próprias quantidades configuradas. A existência de um DOURADO ou ROXO não converte CINZA em VERDE. A soma dos VERDES, se atingir R$ 250, pode gerar no máximo uma posição adicional pela parcela VERDE daquele pedido.

**Controle de capacidade:** permanece o máximo de **dez posições ativas por titular**, e no máximo duas do mesmo titular no tabuleiro. Quando um pedido implicar posições que extrapolem o limite, impedir a confirmação de uma oferta que não possa ser honrada ou exigir revisão prévia da combinação, sem aceitar cobrança prometendo posições indisponíveis.

**Frete:** frete é parte logística, não conta para qualificação VERDE. Compras distintas podem ter frete cobrado separadamente conforme distribuidor/fornecedor; exibir as condições antes da finalização, sem pressupor frete grátis.

## Limites de execução
Esta é a **regra de negócio aprovada**, não uma afirmação de que os direitos comerciais estejam ativos. A implementação definitiva de criação de posições depende da integração de pagamento confirmado, titularidade/CPF/termos, políticas financeiras e travas do motor, além da validação jurídica/financeira aplicável. Em homologação, simulações não geram direitos reais.

**Exemplos de teste esperados:** R$ 249 de VERDE = 0; R$ 250 de VERDE = 1; R$ 1.000 de VERDE = 1; duas compras separadas de R$ 250 de VERDE = 2; três unidades DOURADAS = 3; um ROXO configurado como 5 = 5; qualquer valor CINZA = 0. Identificar regras por cores de produto, separadas dos estados/cores do LOOP.

Ajustes visuais fora dos campos de cor/quantidade não foram autorizados.
